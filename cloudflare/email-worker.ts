/**
 * Cloudflare Email Worker (支援 RFC 2047 Q/B 解碼、Quoted-Printable、Base64、Big5/UTF-8 及 Outlook/Gmail 繁簡體中文防亂碼)
 */

export interface Env {
  WEBHOOK_URL: string;
  WEBHOOK_SECRET?: string;
}

export interface ForwardableEmailMessage {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  setReject?: (reason: string) => void;
  forward?: (rcptTo: string, headers?: Headers) => Promise<void>;
}

/**
 * 跨編碼緩衝區解碼函數 (支援 UTF-8, Big5, Windows-950, GBK 等)
 */
function decodeBufferWithCharset(buf: Uint8Array, charset = 'utf-8'): string {
  const norm = (charset || 'utf-8').toLowerCase().trim().replace(/^(windows-950|cp950)$/, 'big5');
  try {
    return new TextDecoder(norm, { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      try {
        return new TextDecoder('big5', { fatal: true }).decode(buf);
      } catch {
        try {
          return new TextDecoder('gbk', { fatal: true }).decode(buf);
        } catch {
          return new TextDecoder('utf-8').decode(buf);
        }
      }
    }
  }
}

/**
 * 智慧修復 Latin-1 亂碼 (Mojibake: 例如 æ¸¬è©¦ -> 測試)
 */
function fixMojibake(text: string): string {
  if (!text) return '';
  // 檢測 UTF-8 轉 Latin-1
  if (/[\u00C0-\u00FD][\u0080-\u00BF]+/.test(text)) {
    try {
      const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
      const recovered = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (/[\u4e00-\u9fa5]/.test(recovered)) {
        return recovered;
      }
    } catch {}
  }
  // 檢測 Big5 轉 Latin-1
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
 * 剝離 HTML 標籤並還原常用實體符號 (處理 Outlook 富文本或 HTML 郵件)
 */
function stripHtmlAndEntities(html: string): string {
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
 * 解碼 Quoted-Printable 內文
 */
function decodeQuotedPrintable(str: string, charset = 'utf-8'): string {
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
    const decoded = decodeBufferWithCharset(new Uint8Array(bytes), charset);
    return fixMojibake(decoded);
  } catch {
    return str;
  }
}

/**
 * 解碼 RFC 2047 編碼主旨 (支援 B 與 Q 編碼、連字處理與 Big5/UTF-8)
 */
function decodeMimeWord(str: string): string {
  if (!str) return '';
  // 連續 encoded-word 之間如果只有空格或換行，應先合併
  const cleanedText = str.replace(/(\?=\s*[\r\n\t ]*\s*=\?)/g, '?==?');
  const regex = /=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g;

  const result = cleanedText.replace(regex, (match, charset, enc, data) => {
    try {
      const encoding = enc.toUpperCase();
      if (encoding === 'B') {
        const bin = atob(data.replace(/\s+/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return decodeBufferWithCharset(bytes, charset);
      } else if (encoding === 'Q') {
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
        return decodeBufferWithCharset(new Uint8Array(bytes), charset);
      }
    } catch {
      return match;
    }
    return match;
  });

  return fixMojibake(result);
}

/**
 * 從原始郵件字串中抽取並解碼內文 (支援 multipart text/plain 與 text/html、Base64、QP、Big5)
 */
function extractAndDecodeEmailBody(rawEmail: string): string {
  if (!rawEmail) return '';

  // 1. 若內容包含 MIME multipart 分段標頭，尋找 text/plain 或 text/html 段落
  if (/content-type:\s*text\/(plain|html)/i.test(rawEmail)) {
    const parts = rawEmail.split(/--[a-zA-Z0-9_\-]+/);

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
              const bin = atob(content.replace(/\s+/g, ''));
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              return fixMojibake(decodeBufferWithCharset(bytes, charset));
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
              const bin = atob(content.replace(/\s+/g, ''));
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              htmlContent = decodeBufferWithCharset(bytes, charset);
            } catch {}
          } else if (isQP) {
            htmlContent = decodeQuotedPrintable(content, charset);
          }
          return fixMojibake(stripHtmlAndEntities(htmlContent));
        }
      }
    }
  }

  // 2. 單一純文字郵件段落拆解
  const parts = rawEmail.split(/\r?\n\r?\n/);
  const headers = parts[0] || '';
  const bodyText = parts.length > 1 ? parts.slice(1).join('\n\n').trim() : rawEmail.trim();

  const charsetMatch = headers.match(/charset=["']?([^"';\r\n]+)/i);
  const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
  const isBase64 = /content-transfer-encoding:\s*base64/i.test(headers);
  const isQP = /content-transfer-encoding:\s*quoted-printable/i.test(headers);

  if (isBase64) {
    try {
      const bin = atob(bodyText.replace(/\s+/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return fixMojibake(decodeBufferWithCharset(bytes, charset));
    } catch {}
  } else if (isQP) {
    return decodeQuotedPrintable(bodyText, charset);
  }

  // 3. 檢測是否含有 Quoted-Printable 編碼特徵
  if (/(?:=[0-9A-Fa-f]{2}){2,}/.test(bodyText) || /=\r?\n/.test(bodyText)) {
    const qpDecoded = decodeQuotedPrintable(bodyText, charset);
    if (/[\u4e00-\u9fa5]/.test(qpDecoded) || !qpDecoded.includes('=')) {
      return qpDecoded;
    }
  }

  // 4. 檢測是否為 HTML 郵件
  if (/<(html|body|p|div|br)[^>]*>/i.test(bodyText)) {
    return fixMojibake(stripHtmlAndEntities(bodyText));
  }

  return fixMojibake(bodyText);
}

export default {
  // 健康檢查
  async fetch() {
    return new Response('✅ Email Dispatch Worker 運作中！(支援 Outlook/Gmail 防亂碼與歷史工單自動匹配)', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },

  // 接收並解析郵件
  async email(message: ForwardableEmailMessage, env: Env, ctx: any): Promise<void> {
    try {
      const rawFrom = message.headers.get('from') || message.from;
      let fromName = '';
      let from = message.from;

      const fromMatch = rawFrom.match(/^(?:([^<]+)<)?([^>]+)>?$/);
      if (fromMatch) {
        if (fromMatch[1]) fromName = fromMatch[1].trim().replace(/^["']|["']$/g, '');
        if (fromMatch[2]) from = fromMatch[2].trim();
      }
      fromName = decodeMimeWord(fromName);

      const rawSubject = message.headers.get('subject') || '(無主旨)';
      const date = message.headers.get('date') || new Date().toISOString();
      const messageId = message.headers.get('message-id') || `msg-${Date.now()}`;
      const inReplyTo = message.headers.get('in-reply-to') || undefined;
      const references = message.headers.get('references') || undefined;

      // 讀取原始郵件串流並進行智慧全方位解碼
      const rawEmail = await new Response(message.raw).text();
      const subject = decodeMimeWord(rawSubject);
      const body = extractAndDecodeEmailBody(rawEmail);

      const webhookUrl = env.WEBHOOK_URL || 'https://email-dispatch-system-2b25.vercel.app/api/webhook/email';

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.WEBHOOK_SECRET ? { 'x-webhook-secret': env.WEBHOOK_SECRET } : {}),
        },
        body: JSON.stringify({
          from,
          fromName,
          subject,
          body,
          date,
          messageId,
          inReplyTo,
          references,
        }),
      });

      if (!response.ok) {
        console.error(`Webhook forward failed: ${response.status}`);
      }
    } catch (err: any) {
      console.error('Email Worker Error:', err);
    }
  },
};
