'use client';

import React, { useState } from 'react';
import { Database, RotateCcw, Trash2, Download, Upload, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';

interface DataManagementModalProps {
  onClose: () => void;
  onResetToSeed: () => Promise<void>;
  onClearTasksAndLogs: () => Promise<void>;
  onClearAllData: () => Promise<void>;
  onExportData: () => Promise<void>;
  onImportData: (file: File) => Promise<void>;
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  onClose,
  onResetToSeed,
  onClearTasksAndLogs,
  onClearAllData,
  onExportData,
  onImportData,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = async (actionName: string, actionFn: () => Promise<void>) => {
    try {
      setLoadingAction(actionName);
      await actionFn();
      onClose();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAction('import', () => onImportData(file));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">系統與資料管理中心</h3>
              <p className="text-xs text-slate-500">管理雲端與本機 Zero-DB 資料、範例載入與完整備份</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm font-semibold p-1">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {/* 1. 保留範例資料功能 */}
          <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                重設為預設範例資料 (保留示範)
              </div>
              <p className="text-[11px] text-indigo-800/80 mt-0.5">
                載入官方預設範例（包含建宏、Alex、陳小美、林書豪等成員名單、示範工單與 VIP 白名單）。
              </p>
            </div>
            <button
              onClick={() => handleAction('seed', onResetToSeed)}
              disabled={!!loadingAction}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shrink-0 transition"
            >
              {loadingAction === 'seed' ? '載入中...' : '載入範例資料'}
            </button>
          </div>

          {/* 2. 清空工單與日誌 (保留人員與白名單) */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                清空所有工單與歷史日誌
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                清空目前所有工單與郵件攔截日誌，所有成員工作量與負載歸零，保留成員名冊與白名單設定。
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm('確定要清空所有工單與日誌嗎？人員名冊將被保留，計數將歸零。')) {
                  handleAction('clear_tasks', onClearTasksAndLogs);
                }
              }}
              disabled={!!loadingAction}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold shrink-0 transition"
            >
              {loadingAction === 'clear_tasks' ? '處理中...' : '清空工單日誌'}
            </button>
          </div>

          {/* 3. 徹底清空系統全部資料 */}
          <div className="p-3.5 bg-rose-50/50 border border-rose-200 rounded-xl flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                徹底清空系統全部資料
              </div>
              <p className="text-[11px] text-rose-700/80 mt-0.5">
                完全清空所有工單、歷史日誌、輪值名冊與白名單，讓系統回到完全乾淨空白狀態。
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm('⚠️ 警告：這將徹底清空所有工單、輪值名單與白名單！確定要全部清空嗎？')) {
                  handleAction('clear_all', onClearAllData);
                }
              }}
              disabled={!!loadingAction}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0 transition"
            >
              {loadingAction === 'clear_all' ? '清空中...' : '徹底清空全部'}
            </button>
          </div>

          {/* 4. 匯出與匯入 JSON 備份 */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleAction('export', onExportData)}
              disabled={!!loadingAction}
              className="py-2 px-3 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              匯出 JSON 備份檔案
            </button>

            <label className="py-2 px-3 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              匯入 JSON 還原備份
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
