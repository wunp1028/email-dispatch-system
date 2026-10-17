import { Priority, TaskStatus, TeamMember, WhitelistRule } from '@/types/store';

export interface ParsedMention {
  member: TeamMember;
  priority: Priority;
}

export interface ParsedEmailResult {
  cleanSubject: string;
  cleanContent: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  mentions: ParsedMention[];
  defaultPriority: Priority;
  statusCommand?: TaskStatus;
  referencedTicketNumber?: string;
}

/**
 * 剝離 Re:/Fwd: 等郵件前綴，取得乾淨主旨
 */
export function cleanEmailSubject(subject: string): string {
  if (!subject) return '';
  // 循環剝離 Re:, Fwd:, FW:, 回復:, 回覆:, 轉寄:
  let cleaned = subject.trim();
  const prefixRegex = /^(re|fwd|fw|回复|回覆|轉寄)\s*[:：]\s*/i;
  while (prefixRegex.test(cleaned)) {
    cleaned = cleaned.replace(prefixRegex, '').trim();
  }
  return cleaned;
}

/**
 * 剝離歷史引文，僅保留最上方最新一封回覆內文
 */
export function extractLatestReplyContent(body: string): string {
  if (!body) return '';

  // 統一換行符號
  const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const cleanLines: string[] = [];

  // 引文開始的標誌正則
  const quoteStartPatterns = [
    /^On\s+.+wrote\s*:\s*$/i, // On Mon, Oct 17, 2026 at 10:00 AM Alex wrote:
    /^在\s+.+寫道\s*[:：]\s*$/i, // 在 2026年10月17日 ... 寫道：
    /^於\s+.+寫道\s*[:：]\s*$/i, // 於 2026年10月17日 ... 寫道：
    /^-+\s*(original\s*message|原始郵件)\s*-+/i, // -----Original Message-----
    /^(from|寄件者|寄件人|發件人)\s*[:：]/i, // From: xxx 或 寄件者: xxx
    /^sent\s*[:：]/i,
    /^__{5,}$/, // Outlook 水平分隔線
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 檢查是否命中引文開始標記
    const isQuoteHeader = quoteStartPatterns.some((pattern) => pattern.test(trimmed));
    if (isQuoteHeader) {
      // 遇見引文標頭，停止後續內容收集
      break;
    }

    // 檢查是否為郵件引用符號開頭 (如 > 或 &gt;)
    if (/^(>|&gt;)/.test(trimmed)) {
      // 如果已經開始出現引用行，且後續不再是最新回覆，中斷
      break;
    }

    cleanLines.push(line);
  }

  // 去除尾部多餘空行
  const result = cleanLines.join('\n').trim();
  return result || normalized.trim();
}

/**
 * 解析內文或主旨中提及的狀態回報指令 (#處理中, #已處理, #結案, #待處理)
 */
export function extractStatusCommand(text: string): TaskStatus | undefined {
  if (!text) return undefined;

  if (/(#|＃)(處理中|進行中|IN_PROGRESS|INPROGRESS)/i.test(text)) {
    return 'IN_PROGRESS';
  }
  if (/(#|＃)(已處理|處理完畢|RESOLVED|DONE)/i.test(text)) {
    return 'RESOLVED';
  }
  if (/(#|＃)(結案|已結案|CLOSE|CLOSED)/i.test(text)) {
    return 'CLOSED';
  }
  if (/(#|＃)(待處理|PENDING)/i.test(text)) {
    return 'PENDING';
  }

  return undefined;
}

/**
 * 解析引用的工單編號 (例如 TICK-20261017-001)
 */
export function extractTicketNumber(text: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(/TICK-\d{8}-\d{3,}/i);
  return match ? match[0].toUpperCase() : undefined;
}

/**
 * 依據優先順序 (P1~P5) 與收信時間，計算 SLA 到期時間 (dueAt)
 * P1: 收信當日 23:59:59
 * P2: 收信日 +1 天 23:59:59
 * P3: 收信日 +3 天 23:59:59 (預設)
 * P4: 收信日 +7 天 23:59:59
 * P5: null (視需求回覆)
 */
export function calculateDueDate(priority: Priority, receivedAtStr: string): string | null {
  if (priority === 'P5') {
    return null;
  }

  const baseDate = new Date(receivedAtStr);
  const targetDate = new Date(baseDate.getTime());

  let addDays = 0;
  switch (priority) {
    case 'P1':
      addDays = 0;
      break;
    case 'P2':
      addDays = 1;
      break;
    case 'P3':
      addDays = 3;
      break;
    case 'P4':
      addDays = 7;
      break;
  }

  targetDate.setDate(targetDate.getDate() + addDays);
  targetDate.setHours(23, 59, 59, 999);
  return targetDate.toISOString();
}

/**
 * 掃描主旨與最新內文中的 @成員，並緊隨解析 P1~P5 優先級
 */
export function parseMentionsAndPriority(
  text: string,
  roster: TeamMember[]
): { mentions: ParsedMention[]; globalPriority: Priority } {
  // 全域優先級預設為 P3
  let globalPriority: Priority = 'P3';
  const globalPriorityMatch = text.match(/\b[pP]([1-5])\b/);
  if (globalPriorityMatch) {
    globalPriority = `P${globalPriorityMatch[1]}` as Priority;
  }

  const foundMentions: ParsedMention[] = [];
  const matchedMemberIds = new Set<string>();

  // 支援半形 @ 與全形 ＠
  // 匹配模式：[@＠]([^\s,，:：@＠]+)(?:\s*[:：]?\s*[pP]([1-5]))?
  const mentionRegex = /[@＠]([^\s,，:：@＠]+)(?:\s*[:：]?\s*([pP][1-5]))?/g;

  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    const rawTarget = match[1].trim();
    const explicitP = match[2] ? (match[2].toUpperCase() as Priority) : undefined;

    // 在成員名冊中尋找姓名、別名、或信箱前綴相符者
    const member = roster.find((m) => {
      // 1. 比對姓名
      if (m.name.toLowerCase() === rawTarget.toLowerCase()) return true;
      // 2. 比對 aliases 別名陣列
      if (m.aliases.some((alias) => alias.toLowerCase() === rawTarget.toLowerCase())) return true;
      // 3. 比對 email 前綴 (例如 jh@company.com -> jh)
      const emailPrefix = m.email.split('@')[0];
      if (emailPrefix.toLowerCase() === rawTarget.toLowerCase()) return true;
      return false;
    });

    if (member && !matchedMemberIds.has(member.id)) {
      matchedMemberIds.add(member.id);
      foundMentions.push({
        member,
        priority: explicitP || globalPriority || 'P3',
      });
    }
  }

  return { mentions: foundMentions, globalPriority };
}

/**
 * 寄件者白名單比對機制
 * 支援完整 Email 或 *@domain.com 萬用字元
 * 同時檢驗是否為團隊成員 (團隊成員回信允許更新工單狀態)
 */
export function checkSenderWhitelist(
  senderEmail: string,
  whitelist: WhitelistRule[],
  roster: TeamMember[]
): { allowed: boolean; isTeamMember: boolean; matchedPattern?: string } {
  if (!senderEmail) {
    return { allowed: false, isTeamMember: false };
  }

  const normalizedSender = senderEmail.trim().toLowerCase();

  // 1. 是否為團隊成員
  const isTeamMember = roster.some((m) => m.email.toLowerCase() === normalizedSender);
  if (isTeamMember) {
    return { allowed: true, isTeamMember: true, matchedPattern: 'TEAM_MEMBER' };
  }

  // 2. 檢查白名單
  for (const rule of whitelist) {
    if (!rule.enabled) continue;
    const pattern = rule.pattern.trim().toLowerCase();

    // 萬用字元 *@domain.com 或 @domain.com
    if (pattern.startsWith('*@')) {
      const domain = pattern.substring(2);
      if (normalizedSender.endsWith(`@${domain}`)) {
        return { allowed: true, isTeamMember: false, matchedPattern: rule.pattern };
      }
    } else if (pattern.startsWith('@')) {
      const domain = pattern.substring(1);
      if (normalizedSender.endsWith(`@${domain}`)) {
        return { allowed: true, isTeamMember: false, matchedPattern: rule.pattern };
      }
    } else if (pattern.includes('*')) {
      // 簡單 glob 轉正則
      const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      const reg = new RegExp(regexStr, 'i');
      if (reg.test(normalizedSender)) {
        return { allowed: true, isTeamMember: false, matchedPattern: rule.pattern };
      }
    } else {
      // 完整 email 精確比對
      if (pattern === normalizedSender) {
        return { allowed: true, isTeamMember: false, matchedPattern: rule.pattern };
      }
    }
  }

  return { allowed: false, isTeamMember: false };
}

/**
 * 完整綜合郵件解析
 */
export function parseIncomingEmail(
  rawEmail: {
    from: string;
    fromName?: string;
    subject: string;
    body: string;
    date?: string;
  },
  roster: TeamMember[]
): ParsedEmailResult {
  const cleanSubject = cleanEmailSubject(rawEmail.subject || '');
  const cleanContent = extractLatestReplyContent(rawEmail.body || '');
  const receivedAt = rawEmail.date ? new Date(rawEmail.date).toISOString() : new Date().toISOString();

  // 合併主旨與最新內文共同搜尋 @人員 與 優先級
  const combinedText = `${cleanSubject}\n${cleanContent}`;
  const { mentions, globalPriority } = parseMentionsAndPriority(combinedText, roster);

  // 解析狀態回報指令
  const statusCommand = extractStatusCommand(cleanContent);

  // 解析票號
  const referencedTicketNumber =
    extractTicketNumber(cleanSubject) ||
    extractTicketNumber(cleanContent) ||
    extractTicketNumber(rawEmail.subject || '');

  // 寄件者名稱抽取 (處理 "John Doe <john@example.com>" 格式)
  let senderName = rawEmail.fromName || '';
  let senderEmail = rawEmail.from || '';
  const emailRegex = /^(?:([^<]+)<)?([^>]+)>?$/;
  const match = rawEmail.from.match(emailRegex);
  if (match) {
    if (match[1] && !senderName) {
      senderName = match[1].trim().replace(/^["']|["']$/g, '');
    }
    if (match[2]) {
      senderEmail = match[2].trim();
    }
  }
  if (!senderName) {
    senderName = senderEmail.split('@')[0] || 'Unknown';
  }

  return {
    cleanSubject,
    cleanContent,
    senderName,
    senderEmail,
    receivedAt,
    mentions,
    defaultPriority: globalPriority,
    statusCommand,
    referencedTicketNumber,
  };
}
