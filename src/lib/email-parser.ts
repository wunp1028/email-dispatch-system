import { Priority, TaskStatus, TeamMember, WhitelistRule } from '@/types/store';

export interface ParsedMention {
  member: TeamMember;
  priority: Priority;
}

export interface ParsedEmailResult {
  cleanSubject: string;
  cleanContent: string;
  fullBody: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  mentions: ParsedMention[];
  bodyMentions: ParsedMention[];
  subjectMentions: ParsedMention[];
  defaultPriority: Priority;
  statusCommand?: TaskStatus;
  referencedTicketNumber?: string;
  isReply: boolean;
  isForward: boolean;
}

/**
 * 跨編碼緩衝區解碼函數 (支援 UTF-8, Big5, Windows-950, GBK 等，具備多重安全回退機制)
 */
export function decodeBufferWithCharset(buf: Uint8Array | Buffer, charset = 'utf-8'): string {
  const norm = (charset || 'utf-8').toLowerCase().trim().replace(/^(windows-950|cp950)$/, 'big5');
  // 1. 嘗試指定的字元集
  try {
    return new TextDecoder(norm, { fatal: true }).decode(buf);
  } catch {
    // 2. 嘗試 UTF-8
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      // 3. 嘗試 Big5 (繁體中文常用，尤其是 Outlook / Windows 環境)
      try {
        return new TextDecoder('big5', { fatal: true }).decode(buf);
      } catch {
        // 4. 嘗試 GBK (簡體中文)
        try {
          return new TextDecoder('gbk', { fatal: true }).decode(buf);
        } catch {
          // 5. 終極回退 (非 fatal UTF-8)
          return new TextDecoder('utf-8').decode(buf);
        }
      }
    }
  }
}

/**
 * 智慧修復常見的 Latin-1 / ISO-8859-1 亂碼 (Mojibake)
 * 當郵件閘道或函式庫將 UTF-8 或 Big5 位元組當作 Latin-1 (例如 æ¸¬è©¦ 或 ä½ å¥½) 解碼時，將其完美還原為清晰中文
 */
export function fixMojibake(text: string): string {
  if (!text) return '';

  // 1. 檢測 UTF-8 轉 Latin-1 的亂碼特徵 (連續 2 或 3 個高位 Latin-1 字元)
  if (/[\u00C0-\u00FD][\u0080-\u00BF]+/.test(text)) {
    try {
      const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
      const recovered = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (/[\u4e00-\u9fa5]/.test(recovered)) {
        return recovered;
      }
    } catch {}
  }

  // 2. 檢測 Big5 轉 Latin-1 的亂碼特徵
  if (/[\u00A1-\u00F9][\u0040-\u00FE]/.test(text)) {
    try {
      const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
      const recovered = new TextDecoder('big5', { fatal: true }).decode(bytes);
      if (/[\u4e00-\u9fa5]/.test(recovered)) {
        return recovered;
      }
    } catch {}
  }

  return text;
}

/**
 * 剝離 HTML 標籤並還原常用實體符號 (處理 Outlook 富文本或 HTML-only 郵件)
 */
export function stripHtmlAndEntities(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, '')
    .replace(/<\/?(p|div|tr|br|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 解碼 Quoted-Printable 內文 (支援位元組層級正確解碼與多種字元集)
 */
export function decodeQuotedPrintable(str: string, charset = 'utf-8'): string {
  if (!str) return '';
  try {
    const softRemoved = str.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < softRemoved.length; i++) {
      if (
        softRemoved[i] === '=' &&
        i + 2 < softRemoved.length &&
        /^[0-9A-Fa-f]{2}$/.test(softRemoved.substring(i + 1, i + 3))
      ) {
        bytes.push(parseInt(softRemoved.substring(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(softRemoved.charCodeAt(i) & 0xff);
      }
    }
    const decoded = decodeBufferWithCharset(Uint8Array.from(bytes), charset);
    return fixMojibake(decoded);
  } catch {
    return str;
  }
}

/**
 * 解碼 RFC 2047 MIME Encoded-Word (例如 =?UTF-8?B?...?= 或 =?Big5?Q?...?=)
 */
export function decodeRFC2047(text: string): string {
  if (!text) return '';
  // 多個連續 encoded-word 之間如果只有空格或換行，RFC 規定應忽略中間的空白
  const cleanedText = text.replace(/(\?=\s*[\r\n\t ]*\s*=\?)/g, '?==?');
  const regex = /=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g;

  const result = cleanedText.replace(regex, (match, charset, encoding, data) => {
    try {
      const enc = encoding.toUpperCase();
      if (enc === 'B') {
        const bin = Buffer.from(data.replace(/\s+/g, ''), 'base64');
        return decodeBufferWithCharset(bin, charset);
      } else if (enc === 'Q') {
        const qp = data.replace(/_/g, ' ');
        const bytes: number[] = [];
        for (let i = 0; i < qp.length; i++) {
          if (qp[i] === '=' && i + 2 < qp.length && /^[0-9A-Fa-f]{2}$/.test(qp.substring(i + 1, i + 3))) {
            bytes.push(parseInt(qp.substring(i + 1, i + 3), 16));
            i += 2;
          } else {
            bytes.push(qp.charCodeAt(i) & 0xff);
          }
        }
        return decodeBufferWithCharset(Uint8Array.from(bytes), charset);
      }
    } catch {
      return match;
    }
    return match;
  });

  return fixMojibake(result);
}

/**
 * 自動識別並解碼 MIME 內文 (支援 Base64、Quoted-Printable、HTML 抽樣、Big5/UTF-8 及 Outlook 各種格式)
 */
export function decodeMimeBody(rawBody: string): string {
  if (!rawBody) return '';

  let body = rawBody;

  // 1. 若內容包含 MIME multipart 分段標頭，尋找 text/plain 或 text/html 段落
  if (/content-type:\s*text\/(plain|html)/i.test(body)) {
    const parts = body.split(/--[a-zA-Z0-9_\-]+/);
    
    // 優先尋找 text/plain
    for (const part of parts) {
      if (/content-type:\s*text\/plain/i.test(part)) {
        const charsetMatch = part.match(/charset=["']?([^"';\r\n]+)/i);
        const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
        const isBase64 = /content-transfer-encoding:\s*base64/i.test(part);
        const isQP = /content-transfer-encoding:\s*quoted-printable/i.test(part);

        const headerBodySplit = part.split(/\r?\n\r?\n/);
        if (headerBodySplit.length > 1) {
          const content = headerBodySplit.slice(1).join('\n\n').trim();
          if (isBase64) {
            try {
              const bin = Buffer.from(content.replace(/\s+/g, ''), 'base64');
              const decoded = decodeBufferWithCharset(bin, charset);
              if (decoded) return fixMojibake(decoded);
            } catch {}
          } else if (isQP) {
            return decodeQuotedPrintable(content, charset);
          }
          return fixMojibake(content);
        }
      }
    }

    // 若無 text/plain，尋找 text/html
    for (const part of parts) {
      if (/content-type:\s*text\/html/i.test(part)) {
        const charsetMatch = part.match(/charset=["']?([^"';\r\n]+)/i);
        const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
        const isBase64 = /content-transfer-encoding:\s*base64/i.test(part);
        const isQP = /content-transfer-encoding:\s*quoted-printable/i.test(part);

        const headerBodySplit = part.split(/\r?\n\r?\n/);
        if (headerBodySplit.length > 1) {
          const content = headerBodySplit.slice(1).join('\n\n').trim();
          let htmlContent = content;
          if (isBase64) {
            try {
              const bin = Buffer.from(content.replace(/\s+/g, ''), 'base64');
              htmlContent = decodeBufferWithCharset(bin, charset);
            } catch {}
          } else if (isQP) {
            htmlContent = decodeQuotedPrintable(content, charset);
          }
          return fixMojibake(stripHtmlAndEntities(htmlContent));
        }
      }
    }
  }

  // 2. 檢查段落內是否標註為 base64
  if (/content-transfer-encoding:\s*base64/i.test(body)) {
    const charsetMatch = body.match(/charset=["']?([^"';\r\n]+)/i);
    const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
    const split = body.split(/\r?\n\r?\n/);
    const content = split.length > 1 ? split.slice(1).join('\n\n') : body;
    try {
      const bin = Buffer.from(content.replace(/\s+/g, ''), 'base64');
      const decoded = decodeBufferWithCharset(bin, charset);
      if (decoded) return fixMojibake(decoded);
    } catch {}
  }

  // 3. 檢查段落內是否標註為 quoted-printable
  if (/content-transfer-encoding:\s*quoted-printable/i.test(body)) {
    const charsetMatch = body.match(/charset=["']?([^"';\r\n]+)/i);
    const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
    const split = body.split(/\r?\n\r?\n/);
    const content = split.length > 1 ? split.slice(1).join('\n\n') : body;
    return decodeQuotedPrintable(content, charset);
  }

  // 4. 純 Base64 字串檢驗 (常見於 Gmail/Outlook 直接轉發出的純文字段落)
  const trimmed = body.trim();
  if (/^[A-Za-z0-9+/=\r\n]{24,}$/.test(trimmed) && !trimmed.includes(' ')) {
    try {
      const bin = Buffer.from(trimmed.replace(/\s+/g, ''), 'base64');
      const decoded = decodeBufferWithCharset(bin, 'utf-8');
      if (decoded && (/[\u4e00-\u9fa5]/.test(decoded) || decoded.includes('@') || decoded.includes('http'))) {
        return fixMojibake(decoded);
      }
    } catch {}
  }

  // 5. 檢測是否為未帶 MIME 標頭但含有 Quoted-Printable 編碼的文字 (Outlook 轉發特徵，如 =E6=B8=AC=E8=A9=A6)
  if (/(?:=[0-9A-Fa-f]{2}){2,}/.test(body) || /=\r?\n/.test(body)) {
    const qpDecoded = decodeQuotedPrintable(body);
    if (/[\u4e00-\u9fa5]/.test(qpDecoded) || !qpDecoded.includes('=')) {
      body = qpDecoded;
    }
  }

  // 6. 若包含 HTML 結構標籤，剝離標籤
  if (/<(html|body|p|div|br)[^>]*>/i.test(body)) {
    body = stripHtmlAndEntities(body);
  }

  // 7. 解碼內文中可能殘留的 RFC 2047 編碼與修復 Mojibake
  return fixMojibake(decodeRFC2047(body));
}

/**
 * 剝離 Re:/Fwd: 等郵件前綴及外部標籤，取得乾淨主旨
 */
export function cleanEmailSubject(subject: string): string {
  if (!subject) return '';
  // 先進行 RFC 2047 解碼與亂碼修復 (例如 =?UTF-8?B?...?= 或 =?Big5?Q?...?=)
  let cleaned = fixMojibake(decodeRFC2047(subject)).trim();

  // 循環剝離各種郵件前綴（支援 Outlook 的 FW:/Fwd:/答覆/答复、Gmail 的 Re:/Fwd:、轉寄、AW、VS 以及 [外部] 等閘道標記）
  const prefixRegex =
    /^(?:\[\s*(?:外部|EXT|External|Spam|廣告|公告)\s*\]|【\s*(?:外部|EXT|External|Spam|廣告|公告)\s*】|(?:re|fwd|fw|回复|回覆|答复|答覆|轉寄|轉發|转发|aw|vs|tr)(?:\[\d+\]|\(\d+\))?)\s*[:：]?\s*/i;

  let prev = '';
  while (prev !== cleaned && prefixRegex.test(cleaned)) {
    prev = cleaned;
    cleaned = cleaned.replace(prefixRegex, '').trim();
  }
  return cleaned;
}

/**
 * 判斷是否為轉寄主旨 (FW:, Fwd:, 轉寄:, 轉發:)
 */
export function isForwardSubject(subject: string): boolean {
  if (!subject) return false;
  return /^(?:fwd|fw|轉寄|轉發|转发|tr)(?:\[\d+\]|\(\d+\))?\s*[:：]/i.test(subject.trim());
}

/**
 * 標準化主旨比對字串（深度去除郵件轉發前綴、系統標籤、票號、空白與標點符號，以利精準匹配既有工單）
 */
export function normalizeSubjectForMatching(subject: string): string {
  if (!subject) return '';
  let str = cleanEmailSubject(subject);
  // 移除常見閘道或標記：[外部], [EXT], [External], 【外部】, [SPAM], [廣告], [公告]
  str = str.replace(/\[\s*(外部|EXT|External|Spam|廣告|公告)\s*\]/gi, '');
  str = str.replace(/【\s*(外部|EXT|External|Spam|廣告|公告)\s*】/gi, '');
  // 移除工單號碼：[TICK-20261017-001]
  str = str.replace(/\[\s*TICK-\d{8}-\d+\s*\]/gi, '');
  str = str.replace(/TICK-\d{8}-\d+/gi, '');
  // 移除優先級標籤：[P1]~[P5]
  str = str.replace(/\[\s*P[1-5]\s*\]/gi, '');
  // 移除狀態指令標籤：[已結案], #已結案 等
  str = str.replace(/(?:#|＃|\[|【)\s*(結案|已結案|關閉|CLOSE|CLOSED|已處理|處理完畢|RESOLVED|DONE|處理中|進行中|IN_PROGRESS|待處理|PENDING)\s*(?:\]|】)?/gi, '');
  // 移除符號以利標準化比對
  str = str.replace(/[-_–—:：,，.。.!！?？【】\[\]()（）]/g, ' ');
  // 壓縮多餘空白並轉小寫
  return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 檢查是否為回覆信件 (依主旨前綴、引文結構、In-Reply-To 等標記)
 * 注意：FW / 轉寄信件不可視為單純的既有回覆，因為多數為轉寄新進案件需求
 */
export function isReplyEmail(
  subject: string,
  body: string,
  inReplyTo?: string,
  referencedTicket?: string
): boolean {
  if (referencedTicket) return true;
  if (inReplyTo && inReplyTo.trim().length > 0) return true;
  // 僅 RE / 回覆 / 答覆 視為回信標記 (不含 FW/轉寄)
  if (/^(re|回复|回覆|答复|答覆|aw|vs)\s*[:：]/i.test(subject.trim())) return true;
  if (
    /On\s+.+wrote\s*:\s*$/im.test(body) ||
    /在\s+.+寫道\s*[:：]/m.test(body) ||
    /於\s+.+寫道\s*[:：]/m.test(body)
  ) {
    return true;
  }
  return false;
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
 * 解析內文或主旨中提及的狀態回報指令
 * 支援: #已結案, 已結案, [已結案], #已處理, 已處理, #處理中, 處理中, #待處理, 待處理 等
 */
export function extractStatusCommand(text: string): TaskStatus | undefined {
  if (!text) return undefined;
  const normalized = text.trim();

  // 1. 最高優先級：明確指令標籤 (#, ＃, [, 【, (, （)
  if (/(?:#|＃|\[|【|\(|（)\s*(結案|已結案|關閉|CLOSE|CLOSED)\s*(?:\]|】|\)|）)?/i.test(normalized)) {
    return 'CLOSED';
  }
  if (/(?:#|＃|\[|【|\(|（)\s*(已處理|處理完畢|處理完成|已修復|已搞定|已解決|RESOLVED|DONE)\s*(?:\]|】|\)|）)?/i.test(normalized)) {
    return 'RESOLVED';
  }
  if (/(?:#|＃|\[|【|\(|（)\s*(處理中|進行中|正在處理|排查中|IN_PROGRESS|INPROGRESS)\s*(?:\]|】|\)|）)?/i.test(normalized)) {
    return 'IN_PROGRESS';
  }
  if (/(?:#|＃|\[|【|\(|（)\s*(待處理|重新開啟|重開|REOPEN|PENDING)\s*(?:\]|】|\)|）)?/i.test(normalized)) {
    return 'PENDING';
  }

  // 2. 自然語言關鍵詞
  // 結案 (例如: "已結案", "這題已結案，謝謝", "確認結案", "請結案")
  if (/(?:已結案|確認結案|已結案了|請結案|\bclosed?\b)/i.test(normalized)) {
    return 'CLOSED';
  }
  // 已處理 (例如: "已處理完畢", "已修復", "已經處理完成", "已解決", "已搞定")
  if (/(?:已處理完畢|已處理完成|處理完畢|處理完成|已修復|已搞定|已解決|已處理|\bresolved\b|\bdone\b)/i.test(normalized)) {
    return 'RESOLVED';
  }
  // 處理中 (例如: "正在處理中", "目前處理中", "排查中", "進行中")
  if (/(?:正在處理|處理中|排查中|進行中|\bin_?progress\b)/i.test(normalized)) {
    return 'IN_PROGRESS';
  }
  // 待處理 (例如: "待處理", "重新開啟", "重開工單")
  if (/(?:待處理|重新開啟|重開工單|\bpending\b|\breopen\b)/i.test(normalized)) {
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
    inReplyTo?: string;
  },
  roster: TeamMember[]
): ParsedEmailResult {
  const cleanSubject = cleanEmailSubject(rawEmail.subject || '');
  const decodedBody = decodeMimeBody(rawEmail.body || '');
  const cleanContent = extractLatestReplyContent(decodedBody);
  const receivedAt = rawEmail.date ? new Date(rawEmail.date).toISOString() : new Date().toISOString();

  // 1. 分別解析主旨點名與最新內文點名
  const { mentions: subjectMentions, globalPriority } = parseMentionsAndPriority(cleanSubject, roster);
  const { mentions: bodyMentions } = parseMentionsAndPriority(cleanContent, roster);

  // 合併所有點名（內文點名優先）
  const allMentionsMap = new Map<string, ParsedMention>();
  bodyMentions.forEach((m) => allMentionsMap.set(m.member.id, m));
  subjectMentions.forEach((m) => {
    if (!allMentionsMap.has(m.member.id)) {
      allMentionsMap.set(m.member.id, m);
    }
  });
  const mentions = Array.from(allMentionsMap.values());

  // 2. 解析票號 (依序從主旨、內文、原始主旨中尋找)
  const referencedTicketNumber =
    extractTicketNumber(cleanSubject) ||
    extractTicketNumber(cleanContent) ||
    extractTicketNumber(rawEmail.subject || '');

  // 3. 判定是否為回覆信件
  const isReply = isReplyEmail(
    rawEmail.subject || '',
    rawEmail.body || '',
    rawEmail.inReplyTo,
    referencedTicketNumber
  );

  // 4. 解析狀態指令 (優先從最新回覆內文尋找，找不到再檢查主旨)
  let statusCommand = extractStatusCommand(cleanContent);
  if (!statusCommand) {
    statusCommand = extractStatusCommand(cleanSubject);
  }
  if (!statusCommand) {
    statusCommand = extractStatusCommand(rawEmail.subject || '');
  }

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
  senderName = fixMojibake(decodeRFC2047(senderName));
  const isForward = isForwardSubject(rawEmail.subject || '');

  return {
    cleanSubject,
    cleanContent,
    fullBody: decodedBody,
    senderName,
    senderEmail,
    receivedAt,
    mentions,
    bodyMentions,
    subjectMentions,
    defaultPriority: globalPriority,
    statusCommand,
    referencedTicketNumber,
    isReply,
    isForward,
  };
}
