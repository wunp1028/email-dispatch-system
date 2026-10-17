'use client';

import React, { useState } from 'react';
import { History, ShieldAlert, CheckCircle, Clock, Trash2, Filter } from 'lucide-react';
import { MailLog } from '@/types/store';
import { formatDateTime } from '@/lib/utils';

interface MailLogsModalProps {
  logs: MailLog[];
  onClose: () => void;
  onClearLogs: () => Promise<void>;
}

export const MailLogsModal: React.FC<MailLogsModalProps> = ({ logs, onClose, onClearLogs }) => {
  const [filterAction, setFilterAction] = useState<string>('ALL');

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;
    return true;
  });

  const getActionBadge = (action: MailLog['action']) => {
    switch (action) {
      case 'DISPATCHED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'UPDATED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'BLOCKED_NON_WHITELIST':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'ERROR':
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">郵件進出與攔截日誌 (Mail Logs)</h3>
              <p className="text-xs text-slate-500">審計所有 Webhook 觸發、白名單過濾攔截與派發紀錄</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm font-semibold p-1">
            ✕
          </button>
        </div>

        {/* 篩選與清空 */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">篩選動作:</span>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-hidden"
            >
              <option value="ALL">全部紀錄 ({logs.length})</option>
              <option value="DISPATCHED">派發新工單 (DISPATCHED)</option>
              <option value="UPDATED">回信更新 (UPDATED)</option>
              <option value="BLOCKED_NON_WHITELIST">非白名單攔截 (BLOCKED)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onClearLogs}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空日誌
          </button>
        </div>

        {/* 日誌列表 */}
        <div className="mt-3 space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">目前尚無日誌紀錄</div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white text-xs transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadge(log.action)}`}>
                      {log.action}
                    </span>
                    <span className="font-mono font-medium text-slate-700">{log.sender}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{formatDateTime(log.timestamp)}</span>
                </div>

                <div className="font-semibold text-slate-800 mt-1 truncate">
                  主旨: {log.subject}
                </div>
                <div className="text-slate-600 mt-0.5">{log.details}</div>

                {log.rawSnippet && (
                  <div className="mt-1.5 p-1.5 bg-white rounded border border-slate-200 text-[11px] text-slate-500 font-mono truncate">
                    {log.rawSnippet}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
