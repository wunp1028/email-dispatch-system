/**
 * Cloudflare Email Worker
 * 
 * 此腳本部署於 Cloudflare Email Workers。
 * 當網域收到新郵件時，Cloudflare Email Routing 會自動觸發此 Worker，
 * Worker 解析郵件主旨、寄件者、內文後，轉發至 Next.js 系統的 /api/webhook/email。
 */

export interface Env {
  WEBHOOK_URL: string; // 例如: "https://your-domain.vercel.app/api/webhook/email"
  WEBHOOK_SECRET?: string; // 可選的安全密鑰
}

export interface ForwardableEmailMessage {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  setReject?: (reason: string) => void;
  forward?: (rcptTo: string, headers?: Headers) => Promise<void>;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: any): Promise<void> {
    try {
      const from = message.from;
      const to = message.to;
      const subject = message.headers.get('subject') || '(無主旨)';
      const date = message.headers.get('date') || new Date().toISOString();
      const messageId = message.headers.get('message-id') || `msg-${Date.now()}`;
      const inReplyTo = message.headers.get('in-reply-to') || undefined;

      // 讀取原始郵件串流並提取純文字內容
      const rawEmail = await new Response(message.raw).text();
      let bodyText = '';

      // 簡易 MIME 純文字抽取邏輯
      const textPlainMatch = rawEmail.match(/Content-Type:\s*text\/plain[^]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|$)/i);
      if (textPlainMatch && textPlainMatch[1]) {
        bodyText = textPlainMatch[1].trim();
      } else {
        // 若無分段標頭，取主體內容
        const parts = rawEmail.split(/\r?\n\r?\n/);
        bodyText = parts.length > 1 ? parts.slice(1).join('\n\n').trim() : rawEmail;
      }

      // 發送 POST 請求至本系統的 /api/webhook/email
      const webhookUrl = env.WEBHOOK_URL || 'https://your-domain.vercel.app/api/webhook/email';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (env.WEBHOOK_SECRET) {
        headers['x-webhook-secret'] = env.WEBHOOK_SECRET;
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from,
          subject,
          body: bodyText,
          date,
          messageId,
          inReplyTo,
        }),
      });

      if (!response.ok) {
        console.error(`Webhook forward failed with status: ${response.status}`);
      }
    } catch (err: any) {
      console.error('Error processing email in Cloudflare Worker:', err);
    }
  },
};
