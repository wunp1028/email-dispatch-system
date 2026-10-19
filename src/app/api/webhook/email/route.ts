import { NextRequest, NextResponse } from 'next/server';
import { updateSystemState } from '@/lib/storage';
import {
  parseIncomingEmail,
  checkSenderWhitelist,
  calculateDueDate,
  normalizeSubjectForMatching,
} from '@/lib/email-parser';
import { generateTicketNumber } from '@/lib/utils';
import { Task, TaskHistoryItem, MailLog } from '@/types/store';

export async function POST(req: NextRequest) {
  try {
    // 驗證可選的 Webhook Secret
    const secret = process.env.WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = req.headers.get('x-webhook-secret');
      const querySecret = req.nextUrl.searchParams.get('secret');
      if (headerSecret !== secret && querySecret !== secret) {
        return NextResponse.json({ error: 'Unauthorized: Invalid secret' }, { status: 401 });
      }
    }

    const payload = await req.json();
    const from = payload.from || payload.sender || '';
    const fromName = payload.fromName || payload.name || '';
    const subject = payload.subject || '';
    const body = payload.body || payload.text || payload.content || '';
    const date = payload.date || new Date().toISOString();
    const messageId = payload.messageId || `msg-${Date.now()}`;
    const inReplyTo = payload.inReplyTo;

    if (!from || (!subject && !body)) {
      return NextResponse.json(
        { error: 'Missing required fields: from, and subject or body' },
        { status: 400 }
      );
    }

    const result = await updateSystemState((state) => {
      // 1. 白名單檢查
      const whitelistCheck = checkSenderWhitelist(from, state.whitelist, state.roster);
      if (!whitelistCheck.allowed) {
        const blockLog: MailLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          sender: from,
          subject: subject || '(無主旨)',
          action: 'BLOCKED_NON_WHITELIST',
          details: `寄件者不在白名單內，已安全攔截並忽略`,
          rawSnippet: body.substring(0, 150),
        };
        state.mailLogs.unshift(blockLog);
        return {
          status: 'BLOCKED',
          message: '寄件者不在白名單內，不建立工單',
          sender: from,
        };
      }

      // 2. 解析郵件
      const parsed = parseIncomingEmail(
        { from, fromName, subject, body, date, inReplyTo },
        state.roster
      );

      // 3. 檢查歷史的主旨或識別碼，精準判斷是否已建立過工單
      let targetTask: Task | undefined;

      // 3.1 優先比對明確工單識別碼 (票號，例如 TICK-20261017-001)
      const refTicket = parsed.referencedTicketNumber;
      if (refTicket) {
        targetTask = state.tasks.find(
          (t) =>
            t.ticketNumber.toLowerCase() === refTicket.toLowerCase() ||
            t.id.toLowerCase() === refTicket.toLowerCase()
        );
      }

      // 3.2 依據郵件 Message-ID / In-Reply-To / References 識別碼比對既有工單
      if (!targetTask && (inReplyTo || payload.references)) {
        const refsStr = payload.references
          ? Array.isArray(payload.references)
            ? payload.references.join(' ')
            : String(payload.references)
          : '';
        const checkIds = [inReplyTo, ...refsStr.split(/\s+/)]
          .filter(Boolean)
          .map((id: string) => id.replace(/[<>]/g, '').trim().toLowerCase());

        targetTask = state.tasks.find((t) => {
          if (!t.messageId) return false;
          const cleanTaskMsgId = t.messageId.replace(/[<>]/g, '').trim().toLowerCase();
          return checkIds.some(
            (cid: string) => cid && (cid === cleanTaskMsgId || cleanTaskMsgId.includes(cid) || cid.includes(cleanTaskMsgId))
          );
        });
      }

      // 3.3 依據歷史主旨比對 (比對所有歷史工單的標準化主旨與原始主旨)
      if (!targetTask && (parsed.cleanSubject || subject)) {
        const normCurrent = normalizeSubjectForMatching(parsed.cleanSubject || subject);
        if (normCurrent) {
          // A. 優先於未結案中尋找精確相符之主旨 (最近更新者優先)
          targetTask = state.tasks.find(
            (t) =>
              t.status !== 'CLOSED' &&
              (normalizeSubjectForMatching(t.cleanSubject) === normCurrent ||
               normalizeSubjectForMatching(t.mailSubject) === normCurrent)
          );

          // B. 若未找到，於全部歷史工單（含已結案）中尋找精確相符之主旨
          if (!targetTask) {
            targetTask = state.tasks.find(
              (t) =>
                normalizeSubjectForMatching(t.cleanSubject) === normCurrent ||
                normalizeSubjectForMatching(t.mailSubject) === normCurrent
            );
          }

          // C. 核心主旨子字串模糊比對（長度 >= 4 字元，優先比對未結案，再比對全部）
          if (!targetTask && normCurrent.length >= 4) {
            targetTask =
              state.tasks.find((t) => {
                if (t.status === 'CLOSED') return false;
                const normTaskClean = normalizeSubjectForMatching(t.cleanSubject);
                const normTaskMail = normalizeSubjectForMatching(t.mailSubject);
                return (
                  (normTaskClean.length >= 4 && (normCurrent.includes(normTaskClean) || normTaskClean.includes(normCurrent))) ||
                  (normTaskMail.length >= 4 && (normCurrent.includes(normTaskMail) || normTaskMail.includes(normCurrent)))
                );
              }) ||
              state.tasks.find((t) => {
                const normTaskClean = normalizeSubjectForMatching(t.cleanSubject);
                const normTaskMail = normalizeSubjectForMatching(t.mailSubject);
                return (
                  (normTaskClean.length >= 4 && (normCurrent.includes(normTaskClean) || normTaskClean.includes(normCurrent))) ||
                  (normTaskMail.length >= 4 && (normCurrent.includes(normTaskMail) || normTaskMail.includes(normCurrent)))
                );
              });
          }
        }
      }

      // ===== 情境一：歷史主旨或識別碼成功匹配到既有工單 =====
      if (targetTask) {
        const oldStatus = targetTask.status;

        // 1A. 狀態變更 (例如: #已結案, 已結案, 處理中, #已處理, #待處理)
        if (parsed.statusCommand) {
          const newStatus = parsed.statusCommand;
          targetTask.status = newStatus;
          targetTask.updatedAt = new Date().toISOString();

          // 調整受派人員 active tasks 計數
          const member = state.roster.find((m) => m.id === targetTask!.assigneeId);
          if (member) {
            if (
              (oldStatus === 'PENDING' || oldStatus === 'IN_PROGRESS') &&
              (newStatus === 'RESOLVED' || newStatus === 'CLOSED')
            ) {
              member.currentActiveTasks = Math.max(0, member.currentActiveTasks - 1);
              if (newStatus === 'CLOSED') {
                member.completedCount += 1;
              }
            } else if (
              (oldStatus === 'RESOLVED' || oldStatus === 'CLOSED') &&
              (newStatus === 'PENDING' || newStatus === 'IN_PROGRESS')
            ) {
              member.currentActiveTasks += 1;
              if (oldStatus === 'CLOSED') {
                member.completedCount = Math.max(0, member.completedCount - 1);
              }
            }
            member.updatedAt = new Date().toISOString();
          }

          const historyItem: TaskHistoryItem = {
            id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'STATUS_CHANGE',
            actor: parsed.senderName || parsed.senderEmail,
            details: `由 Email 回信自動更新狀態為 [${newStatus}] (原狀態: [${oldStatus}])。摘要: "${parsed.cleanContent.substring(0, 80)}"`,
          };
          targetTask.history.unshift(historyItem);

          const updateLog: MailLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            sender: from,
            subject: subject,
            action: 'UPDATED',
            details: `回信成功更新既有工單 ${targetTask.ticketNumber} 狀態為 ${newStatus}`,
            ticketNumbers: [targetTask.ticketNumber],
            rawSnippet: parsed.cleanContent.substring(0, 150),
          };
          state.mailLogs.unshift(updateLog);

          return {
            status: 'UPDATED',
            ticketNumber: targetTask.ticketNumber,
            newStatus,
            message: `既有工單 ${targetTask.ticketNumber} 狀態已更新為 ${newStatus}`,
          };
        }

        // 1B. 郵件回信討論（無狀態指令，例如「好的已收到」、「正在查」）
        // 核心原則：絕不重複建立工單！追加紀錄至該工單歷程
        if (targetTask.status === 'PENDING') {
          targetTask.status = 'IN_PROGRESS'; // 有人回信，自動晉升為進行中
        } else if (targetTask.status === 'CLOSED' || targetTask.status === 'RESOLVED') {
          // 針對已結案工單的新回信，自動重啟工單為進行中
          targetTask.status = 'IN_PROGRESS';
          const member = state.roster.find((m) => m.id === targetTask!.assigneeId);
          if (member) {
            member.currentActiveTasks += 1;
            if (oldStatus === 'CLOSED') {
              member.completedCount = Math.max(0, member.completedCount - 1);
            }
            member.updatedAt = new Date().toISOString();
          }
        }
        targetTask.updatedAt = new Date().toISOString();

        const historyItem: TaskHistoryItem = {
          id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          action: 'NOTE_UPDATED',
          actor: parsed.senderName || parsed.senderEmail,
          details: `收到郵件回覆討論: "${parsed.cleanContent.substring(0, 150)}"`,
        };
        targetTask.history.unshift(historyItem);

        const updateLog: MailLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          sender: from,
          subject: subject,
          action: 'UPDATED',
          details: `郵件回覆討論已記錄至既有工單 ${targetTask.ticketNumber}`,
          ticketNumbers: [targetTask.ticketNumber],
          rawSnippet: parsed.cleanContent.substring(0, 150),
        };
        state.mailLogs.unshift(updateLog);

        return {
          status: 'FOLLOW_UP',
          ticketNumber: targetTask.ticketNumber,
          message: `郵件回覆已追加至工單 ${targetTask.ticketNumber}，未建立重複工單`,
        };
      }

      // ===== 情境二：歷史主旨與識別碼皆未匹配到工單 =====
      // 唯有當寄件者明確指定了不存在的票號並試圖變更狀態時，才做錯誤回報
      if (refTicket && parsed.statusCommand && !targetTask) {
        const errorLog: MailLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          sender: from,
          subject: subject,
          action: 'ERROR',
          details: `指定的工單識別碼 ${refTicket} 不存在，無法執行狀態變更`,
          rawSnippet: parsed.cleanContent.substring(0, 150),
        };
        state.mailLogs.unshift(errorLog);

        return {
          status: 'NOT_FOUND',
          message: `指定的工單號碼 ${refTicket} 不存在，無法執行狀態變更`,
        };
      }

      // 只要歷史紀錄中沒有建立過工單（無論信件是否為 FW、轉寄、Re 或新信），皆應正式建立新工單！

      // 計算新工單內容 (若為轉寄信件且附帶轉寄引文，完整保留以利受派人排查)
      const initialTaskContent =
        parsed.isForward && parsed.fullBody && parsed.fullBody !== parsed.cleanContent
          ? `${parsed.cleanContent}\n\n--- 轉寄郵件原始內容 ---\n${parsed.fullBody}`.trim()
          : (parsed.cleanContent || parsed.fullBody || '(無內文)');

      // 4. 新信件派工流程
      const createdTasks: Task[] = [];
      const newTicketNumbers: string[] = [];

      if (parsed.mentions.length > 0) {
        // === 模式一：指定派單 (@執行人員，支援多人) ===
        for (const mention of parsed.mentions) {
          const member = mention.member;
          const priority = mention.priority;
          const dueAt = calculateDueDate(priority, parsed.receivedAt);
          const seq = state.tasks.length + createdTasks.length + 1;
          const ticketNumber = generateTicketNumber(seq);

          // 累加受派者負載與總計
          const rosterMember = state.roster.find((m) => m.id === member.id);
          if (rosterMember) {
            rosterMember.effectiveLoad += 1;
            rosterMember.assignedCount += 1;
            rosterMember.currentActiveTasks += 1;
            rosterMember.updatedAt = new Date().toISOString();
          }

          // 轉移皇冠 👑
          state.crownHolderId = member.id;

          const newTask: Task = {
            id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ticketNumber,
            assigneeId: member.id,
            assigneeName: member.name,
            assigneeEmail: member.email,
            dispatchType: 'DIRECT',
            status: 'PENDING',
            priority,
            dueAt,
            mailSubject: subject,
            cleanSubject: parsed.cleanSubject,
            senderName: parsed.senderName,
            senderEmail: parsed.senderEmail,
            receivedAt: parsed.receivedAt,
            messageId,
            inReplyTo,
            cleanContent: initialTaskContent,
            mentionedMembers: parsed.mentions.map((m) => m.member.name),
            history: [
              {
                id: `hist-${Date.now()}`,
                timestamp: new Date().toISOString(),
                action: 'DIRECT_ASSIGNED',
                actor: 'SYSTEM',
                details: `信件點名 @${member.name} (${priority})，指定派發工單`,
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          createdTasks.push(newTask);
          newTicketNumbers.push(ticketNumber);
        }
      } else {
        // === 模式二：系統智慧動態輪值 ===
        const strategy = state.dispatchStrategy || 'DOUBLE_INTERLEAVED';
        const activeMembers = state.roster.filter((m) => m.status === 'ACTIVE');
        if (activeMembers.length === 0) {
          // 若無人在線，取全員
          activeMembers.push(...state.roster);
        }

        if (strategy === 'ACTIVE_LEAST') {
          // 【極致清閒平衡模式】：手頭未結案工單最少者優先，若相同避讓持冠者
          activeMembers.sort((a, b) => {
            if (a.currentActiveTasks !== b.currentActiveTasks) {
              return a.currentActiveTasks - b.currentActiveTasks;
            }
            if (a.id === state.crownHolderId) return 1;
            if (b.id === state.crownHolderId) return -1;
            return a.effectiveLoad - b.effectiveLoad;
          });
        } else {
          // 【雙倍穿插補償模式】(預設) 或 【平滑保護模式】
          // 尋找 effectiveLoad 最小者；若相同，避開前次持冠者
          activeMembers.sort((a, b) => {
            if (a.effectiveLoad !== b.effectiveLoad) {
              return a.effectiveLoad - b.effectiveLoad;
            }
            if (a.id === state.crownHolderId) return 1;
            if (b.id === state.crownHolderId) return -1;
            return a.currentActiveTasks - b.currentActiveTasks;
          });
        }

        const chosenMember = activeMembers[0];
        const priority = parsed.defaultPriority || 'P3';
        const dueAt = calculateDueDate(priority, parsed.receivedAt);
        const seq = state.tasks.length + 1;
        const ticketNumber = generateTicketNumber(seq);

        // 累計與皇冠移交 (依據策略決定步長)
        if (strategy === 'DOUBLE_INTERLEAVED' && (chosenMember.catchUpQuota || 0) > 0) {
          // 補償期：接單步長 +0.5，待償額度 -1
          chosenMember.effectiveLoad += 0.5;
          chosenMember.catchUpQuota = Math.max(0, (chosenMember.catchUpQuota || 0) - 1);
        } else {
          chosenMember.effectiveLoad += 1;
        }

        chosenMember.assignedCount += 1;
        chosenMember.currentActiveTasks += 1;
        chosenMember.updatedAt = new Date().toISOString();
        state.crownHolderId = chosenMember.id;

        const newTask: Task = {
          id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ticketNumber,
          assigneeId: chosenMember.id,
          assigneeName: chosenMember.name,
          assigneeEmail: chosenMember.email,
          dispatchType: 'AUTO_ROSTER',
          status: 'PENDING',
          priority,
          dueAt,
          mailSubject: subject,
          cleanSubject: parsed.cleanSubject,
          senderName: parsed.senderName,
          senderEmail: parsed.senderEmail,
          receivedAt: parsed.receivedAt,
          messageId,
          inReplyTo,
          cleanContent: initialTaskContent,
          mentionedMembers: [],
          history: [
            {
              id: `hist-${Date.now()}`,
              timestamp: new Date().toISOString(),
              action: 'AUTO_ROSTER_ASSIGNED',
              actor: 'SYSTEM',
              details: `未指定人員，動態輪值指派給在線負載最低者 ${chosenMember.name} (${priority})，並授予皇冠 👑`,
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        createdTasks.push(newTask);
        newTicketNumbers.push(ticketNumber);
      }

      // 將新工單存入 tasks
      state.tasks.unshift(...createdTasks);

      // 寫入郵件日誌
      const dispatchLog: MailLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        sender: from,
        subject: subject || '(無主旨)',
        action: 'DISPATCHED',
        details:
          parsed.mentions.length > 0
            ? `指定派單成功，共建立 ${createdTasks.length} 筆工單 (${newTicketNumbers.join(', ')})`
            : `動態輪值指派成功，工單 ${newTicketNumbers.join(', ')} 交付給 ${createdTasks[0].assigneeName}`,
        ticketNumbers: newTicketNumbers,
        rawSnippet: parsed.cleanContent.substring(0, 150),
      };
      state.mailLogs.unshift(dispatchLog);

      return {
        status: 'DISPATCHED',
        tickets: createdTasks.map((t) => ({
          ticketNumber: t.ticketNumber,
          assignee: t.assigneeName,
          priority: t.priority,
          dueAt: t.dueAt,
          dispatchType: t.dispatchType,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API Webhook] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
