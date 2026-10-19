'use client';

import React, { useState, useMemo } from 'react';
import {
  Send,
  Sparkles,
  Mail,
  ShieldCheck,
  ShieldX,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { TeamMember, WhitelistRule } from '@/types/store';
import { parseIncomingEmail, checkSenderWhitelist } from '@/lib/email-parser';

interface EmailSimulatorModalProps {
  roster: TeamMember[];
  whitelist: WhitelistRule[];
  onClose: () => void;
  onSuccessDispatch: () => void;
}

export const EmailSimulatorModal: React.FC<EmailSimulatorModalProps> = ({
  roster,
  whitelist,
  onClose,
  onSuccessDispatch,
}) => {
  const [sender, setSender] = useState('david@vip-client.com');
  const [senderName, setSenderName] = useState('David Lee');
  const [subject, setSubject] = useState('Re: Fwd: 緊急客戶對接異常需求排查');
  const [body, setBody] = useState(
    '您好，\n請 @建宏 P1 與 @Alex P2 協助處理客戶所反映的 API 逾時問題，謝謝！\n\n' +
      'On 2026年10月17日 週六 上午10:00 David Lee <david@vip-client.com> wrote:\n' +
      '> 這是先前的歷史討論引文，不應該被解析為最新內文。\n' +
      '> -----Original Message-----\n' +
      '> 歷史郵件紀錄...'
  );
  const [submitting, setSubmitting] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<any>(null);

  // 預設快速範本
  const loadPreset = (
    type: 'DIRECT_MULTI' | 'AUTO_ROSTER' | 'REPLY_UPDATE' | 'SPAM_BLOCKED' | 'OUTLOOK_FW' | 'OUTLOOK_QP'
  ) => {
    setDispatchResult(null);
    switch (type) {
      case 'DIRECT_MULTI':
        setSender('david@vip-client.com');
        setSenderName('David Lee');
        setSubject('Re: 系統登入問題與報表排程支援');
        setBody(
          '請 @建宏 P1 處理登入錯誤排查，同時請 @Alex P2 產出週報數據。\n\n' +
            '在 2026-10-17 11:20:00 Emily Wang 寫道：\n' +
            '> 請問昨日登入問題有進展嗎？'
        );
        break;
      case 'OUTLOOK_FW':
        setSender('david@vip-client.com');
        setSenderName('David Lee');
        setSubject('FW: [外部] 客戶端資料庫連線逾時排查需求');
        setBody(
          '請 @Alex P1 協助排查此轉寄案件，謝謝！\n\n' +
            '-----Original Message-----\n' +
            'From: client-service@vip-client.com\n' +
            'Sent: Monday, October 19, 2026 09:30 AM\n' +
            'Subject: 客戶端資料庫連線逾時排查需求\n\n' +
            '您好，我們今早發現生產資料庫連線持續出現 Timeout 報錯，請儘速協助修復。'
        );
        break;
      case 'OUTLOOK_QP':
        setSender('david@vip-client.com');
        setSenderName('=?UTF-8?B?RGF2aWQgTGVl?=');
        setSubject('=?UTF-8?Q?=E7=B7=8A=E6=80=A5=E5=AE=A2=E6=88=B6=E7=95=B0=E5=B8=B8=E6=8E=92=E6=9F=A5?=');
        setBody(
          'Content-Type: text/plain; charset="utf-8"\n' +
            'Content-Transfer-Encoding: quoted-printable\n\n' +
            '=E8=AB=8B=20@Alex=20P1=20=E5=8D=94=E5=8A=A9=E6=8E=92=E6=9F=A5=EF=BC=8C=E8=AC=9D=E8=AC=9D=EF=BC=81'
        );
        break;
      case 'AUTO_ROSTER':
        setSender('service@partner-tech.org');
        setSenderName('技術夥伴窗口');
        setSubject('Fwd: 第三方金流沙盒測試環境連線申請');
        setBody(
          '夥伴團隊好，\n' +
            '我們預計於下週一進行驗證，麻煩團隊協助開通測試權限。\n' +
            '(未指定人員，系統將自動平衡指派給在線負載最低者，預設優先級為 P3)\n\n' +
            '-----Original Message-----\n' +
            'From: partner@old.com\n' +
            '舊引文...'
        );
        break;
      case 'REPLY_UPDATE':
        setSender('jh@company.com');
        setSenderName('建宏');
        setSubject('Re: TICK-20261017-001 生產伺服器 API 異常警告 - 請儘速排查');
        setBody(
          '此問題已查明為快取伺服器滿載，已重新重啟服務恢復正常。 #已處理\n\n' +
            'On Sat, Oct 17, 2026 David Lee wrote:\n' +
            '> 請協助排查 API 異常'
        );
        break;
      case 'SPAM_BLOCKED':
        setSender('promotions@unknown-ad-spammer.com');
        setSenderName('Discount Ad');
        setSubject('Huge Discount for cloud hosting services!');
        setBody('Buy 1 get 10 free! Click here now!');
        break;
    }
  };

  // 即時解析預覽
  const livePreview = useMemo(() => {
    const whitelistCheck = checkSenderWhitelist(sender, whitelist, roster);
    const parsed = parseIncomingEmail(
      {
        from: sender,
        fromName: senderName,
        subject,
        body,
      },
      roster
    );
    return { whitelistCheck, parsed };
  }, [sender, senderName, subject, body, whitelist, roster]);

  const handleSendToWebhook = async () => {
    try {
      setSubmitting(true);
      setDispatchResult(null);

      const res = await fetch('/api/webhook/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: sender,
          fromName: senderName,
          subject,
          body,
          date: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      setDispatchResult(data);
      if (res.ok) {
        onSuccessDispatch();
      }
    } catch (err: any) {
      setDispatchResult({ error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">郵件解析與 Webhook 測試模擬器</h3>
              <p className="text-xs text-slate-500">
                可直接模擬 Cloudflare Email Worker 或外部郵件網關觸發 `/api/webhook/email`
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-sm font-semibold p-1"
          >
            ✕
          </button>
        </div>

        {/* 快速載入範本標籤 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">快速範本:</span>
          <button
            type="button"
            onClick={() => loadPreset('DIRECT_MULTI')}
            className="text-xs bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 px-2.5 py-1 rounded-md border border-slate-200 transition font-medium"
          >
            🎯 指定派單 (@建宏 P1 @Alex P2)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('OUTLOOK_FW')}
            className="text-xs bg-slate-100 hover:bg-amber-50 hover:text-amber-700 px-2.5 py-1 rounded-md border border-slate-200 transition font-medium"
          >
            📨 Outlook 轉寄新單 (FW: 依歷史主旨識別)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('OUTLOOK_QP')}
            className="text-xs bg-slate-100 hover:bg-violet-50 hover:text-violet-700 px-2.5 py-1 rounded-md border border-slate-200 transition font-medium"
          >
            🔤 Outlook QP中文防亂碼 (=E8=AB=8B...)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('AUTO_ROSTER')}
            className="text-xs bg-slate-100 hover:bg-sky-50 hover:text-sky-700 px-2.5 py-1 rounded-md border border-slate-200 transition font-medium"
          >
            ⚖️ 系統平衡輪值 (未指定人員，預設 P3)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('REPLY_UPDATE')}
            className="text-xs bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 px-2.5 py-1 rounded-md border border-slate-200 transition font-medium"
          >
            💬 成員回信更新工單 (#已處理)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('SPAM_BLOCKED')}
            className="text-xs bg-slate-100 hover:bg-rose-50 hover:text-rose-700 px-2.5 py-1 rounded-md border border-slate-200 transition font-medium"
          >
            ⛔ 非白名單垃圾信 (攔截測試)
          </button>
        </div>

        {/* 兩欄配置：左側輸入表單，右側即時解析與執行結果 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
          {/* 左欄：模擬郵件輸入 */}
          <div className="lg:col-span-7 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">寄件人 Email *</label>
                <input
                  type="text"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  className="w-full text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">寄件人名稱</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">郵件主旨 (Subject) *</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                郵件內文 (Body) - 支援歷史引文與回信標籤
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                className="w-full text-xs font-sans border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden leading-relaxed"
              />
            </div>

            <button
              type="button"
              onClick={handleSendToWebhook}
              disabled={submitting}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {submitting ? '發送並入庫處理中...' : '🚀 發送至 Webhook 建立/更新工單'}
            </button>
          </div>

          {/* 右欄：即時解析預覽與 API 回應 */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 flex-1 overflow-y-auto max-h-[380px]">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 pb-2 border-b border-slate-200">
                <Sparkles className="w-4 h-4 text-amber-500" />
                即時語意與引文解析預覽
              </div>

              {/* 白名單核驗 */}
              <div className="text-xs">
                <span className="text-slate-500 block mb-0.5">寄件者白名單狀態:</span>
                {livePreview.whitelistCheck.allowed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    允許通過 (匹配: {livePreview.whitelistCheck.matchedPattern})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold text-[11px]">
                    <ShieldX className="w-3.5 h-3.5" />
                    攔截忽略 (未在白名單內)
                  </span>
                )}
              </div>

              {/* 乾淨主旨 */}
              <div className="text-xs">
                <span className="text-slate-500 block mb-0.5">剝離前綴之純淨主旨:</span>
                <span className="font-semibold text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 block truncate">
                  {livePreview.parsed.cleanSubject || '(無主旨)'}
                </span>
              </div>

              {/* 剝離歷史引文後的純內文 */}
              <div className="text-xs">
                <span className="text-slate-500 block mb-0.5">剝離舊引文後之最新回覆:</span>
                <div className="text-[11px] text-slate-700 bg-white p-2 rounded border border-slate-200 whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {livePreview.parsed.cleanContent || '(無最新內文)'}
                </div>
              </div>

              {/* 解析出之 @成員 與 P1~P5 */}
              <div className="text-xs">
                <span className="text-slate-500 block mb-0.5">解析點名人員與優先級:</span>
                {livePreview.parsed.mentions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {livePreview.parsed.mentions.map((m) => (
                      <span
                        key={m.member.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[11px]"
                      >
                        @{m.member.name} → <span className="text-amber-700">{m.priority}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    未 @指定人員 → 將依輪值動態平衡指派 (優先級: {livePreview.parsed.defaultPriority})
                  </span>
                )}
              </div>

              {/* 狀態指令 */}
              {livePreview.parsed.statusCommand && (
                <div className="text-xs">
                  <span className="text-slate-500 block mb-0.5">偵測到回信狀態更新指令:</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> #{livePreview.parsed.statusCommand}
                  </span>
                </div>
              )}
            </div>

            {/* Webhook 回應結果卡片 */}
            {dispatchResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono overflow-x-auto ${
                  dispatchResult.error
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : dispatchResult.status === 'BLOCKED'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <div className="font-bold mb-1 flex items-center justify-between">
                  <span>API 執行回傳:</span>
                  <span>{dispatchResult.status || 'OK'}</span>
                </div>
                <pre className="text-[11px]">{JSON.stringify(dispatchResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
