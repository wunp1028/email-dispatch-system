/**
 * Cloudflare Email Worker (具備 RFC 2047 與 Base64 自動解碼)
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

// 解碼 RFC 2047 編碼主旨 (例如 =?UTF-8?B?...)
function decodeMimeWord(str: string): string {
  if (!str) return '';
  return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (match, charset, enc, data) => {
    try {
      if (enc.toUpperCase() === 'B') {
        const bin = atob(data.replace(/\s+/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder(charset || 'utf-8').decode(bytes);
      }
    } catch {
      return match;
    }
    return match;
  });
}

// 解碼 Base64 / MIME 內文
function decodeBodyContent(content: string, rawHeaders: string): string {
  if (!content) return '';
  const text = content.trim();

  const isBase64Header = /content-transfer-encoding:\s*base64/i.test(rawHeaders);
  const isBase64Pattern = /^[A-Za-z0-9+/=\r\n]{20,}$/.test(text) && !text.includes(' ');

  if (isBase64Header || isBase64Pattern) {
    try {
      const bin = atob(text.replace(/\s+/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const decoded = new TextDecoder('utf-8').decode(bytes);
      if (decoded) return decoded;
    } catch {}
  }

  return text;
}

export default {
  // 健康檢查
  async fetch() {
    return new Response('✅ Email Dispatch Worker 運作中！', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },

  // 接收並解析郵件
  async email(message: ForwardableEmailMessage, env: Env, ctx: any): Promise<void> {
    try {
      const from = message.from;
      const rawSubject = message.headers.get('subject') || '(無主旨)';
      const date = message.headers.get('date') || new Date().toISOString();
      const messageId = message.headers.get('message-id') || `msg-${Date.now()}`;
      const inReplyTo = message.headers.get('in-reply-to') || undefined;

      // 讀取原始郵件串流並提取文字
      const rawEmail = await new Response(message.raw).text();
      let bodyText = '';
      let mimeHeaders = '';

      const textPlainMatch = rawEmail.match(/Content-Type:\s*text\/plain[^]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|$)/i);
      if (textPlainMatch && textPlainMatch[1]) {
        mimeHeaders = textPlainMatch[0].split(/\r?\n\r?\n/)[0] || '';
        bodyText = textPlainMatch[1].trim();
      } else {
        const parts = rawEmail.split(/\r?\n\r?\n/);
        bodyText = parts.length > 1 ? parts.slice(1).join('\n\n').trim() : rawEmail;
      }

      // 即時解碼主旨與內文為清晰中文
      const subject = decodeMimeWord(rawSubject);
      const body = decodeBodyContent(bodyText, mimeHeaders || rawEmail);

      const webhookUrl = env.WEBHOOK_URL || 'https://email-dispatch-system-2b25.vercel.app/api/webhook/email';

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          subject,
          body,
          date,
          messageId,
          inReplyTo,
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
