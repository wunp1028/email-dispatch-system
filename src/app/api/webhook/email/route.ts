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

      // 3. 檢查是否為針對既有工單的回覆更新或討論
      let targetTask: Task | undefined;

      // 3.1 優先以明確票號 (TICK-20261017-001) 尋找
      if (parsed.referencedTicketNumber) {
        targetTask = state.tasks.find((t) => t.ticketNumber === parsed.referencedTicketNumber);
      }

      // 3.2 依據郵件標頭 inReplyTo 比對既有工單的 messageId
      if (!targetTask && inReplyTo) {
        targetTask = state.tasks.find(
          (t) => t.messageId && (t.messageId === inReplyTo || inReplyTo.includes(t.messageId))
        );
      }

      // 3.3 依據標準化主旨比對 (先找未結案工單，若未找到再找已結案)
      if (!targetTask && parsed.cleanSubject) {
        const normCurrent = normalizeSubjectForMatching(parsed.cleanSubject);
        if (normCurrent) {
          // 先在未結案中尋找精確相符者
          targetTask = state.tasks.find(
            (t) =>
              t.status !== 'CLOSED' &&
              (normalizeSubjectForMatching(t.cleanSubject) === normCurrent ||
               normalizeSubjectForMatching(t.mailSubject) === normCurrent)
          );

          // 若有狀態指令，擴大比對全部工單 (例如重啟已結案，或重複確認結案)
          if (!targetTask && parsed.statusCommand) {
            targetTask = state.tasks.find(
              (t) =>
                normalizeSubjectForMatching(t.cleanSubject) === normCurrent ||
                normalizeSubjectForMatching(t.mailSubject) === normCurrent
            );
          }

          // 核心關鍵詞子字串模糊比對（長度大於 6 字元）
          if (!targetTask && normCurrent.length >= 6) {
            targetTask = state.tasks.find((t) => {
              const normTask = normalizeSubjectForMatching(t.cleanSubject);
              return (
                normTask.length >= 6 &&
                (normCurrent.includes(normTask) || normTask.includes(normCurrent))
              );
            });
          }
        }
      }

      // ===== 情境一：成功匹配到既有工單 =====
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
            details: `回信成功更新工單 ${targetTask.ticketNumber} 狀態為 ${newStatus}`,
            ticketNumbers: [targetTask.ticketNumber],
            rawSnippet: parsed.cleanContent.substring(0, 150),
          };
          state.mailLogs.unshift(updateLog);

          return {
            status: 'UPDATED',
            ticketNumber: targetTask.ticketNumber,
            newStatus,
            message: `工單 ${targetTask.ticketNumber} 狀態已更新為 ${newStatus}`,
          };
        }

        // 1B. 郵件回信討論（無狀態指令，例如「好的已收到」、「正在查」）
        // 核心原則：絕不重複建立工單！追加紀錄至該工單歷程
        if (targetTask.status === 'PENDING') {
          targetTask.status = 'IN_PROGRESS'; // 有人回信，自動晉升為進行中
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

      // ===== 情境二：未匹配到工單，但該信件屬於「回覆信件 (isReply)」 =====
      // 特徵：主旨含 Re:/Fwd:、帶有 inReplyTo、或內文有狀態指令
      // 核心防護：回覆信件絕對不能因為原始主旨殘留的「@某人」就誤建新工單！
      if (parsed.isReply || parsed.statusCommand) {
        const orphanLog: MailLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          sender: from,
          subject: subject,
          action: 'UPDATED',
          details: `收到回覆信件但找不到對應工單 (狀態指令: ${parsed.statusCommand || '無'})，已安全忽略主旨中的歷史點名，避免重複建單`,
          rawSnippet: parsed.cleanContent.substring(0, 150),
        };
        state.mailLogs.unshift(orphanLog);

        return {
          status: 'IGNORED_REPLY',
          message: '此信件為既有郵件之回覆，但未找到匹配的工單，已安全忽略以避免重複建單',
        };
      }

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
            cleanContent: parsed.cleanContent,
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
        // === 模式二：系統平衡輪值 (未指定人員，派給在線有效負載最低者) ===
        const activeMembers = state.roster.filter((m) => m.status === 'ACTIVE');
        if (activeMembers.length === 0) {
          // 若無人在線，取全員
          activeMembers.push(...state.roster);
        }

        // 尋找 effectiveLoad 最小者；若相同，避開前次持冠者
        activeMembers.sort((a, b) => {
          if (a.effectiveLoad !== b.effectiveLoad) {
            return a.effectiveLoad - b.effectiveLoad;
          }
          if (a.id === state.crownHolderId) return 1;
          if (b.id === state.crownHolderId) return -1;
          return a.currentActiveTasks - b.currentActiveTasks;
        });

        const chosenMember = activeMembers[0];
        const priority = parsed.defaultPriority || 'P3';
        const dueAt = calculateDueDate(priority, parsed.receivedAt);
        const seq = state.tasks.length + 1;
        const ticketNumber = generateTicketNumber(seq);

        // 累計與皇冠移交
        chosenMember.effectiveLoad += 1;
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
          cleanContent: parsed.cleanContent,
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
