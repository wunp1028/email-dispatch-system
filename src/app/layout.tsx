import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '郵件智慧派工與動態輪值追蹤系統 (Zero-DB Edition)',
  description: '無資料庫單一 JSON 架構、Cloudflare KV/R2 支援、智慧動態輪值與自動引文剝離派工系統',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="bg-slate-50 text-slate-900 antialiased selection:bg-amber-100 selection:text-amber-900">
        {children}
      </body>
    </html>
  );
}
