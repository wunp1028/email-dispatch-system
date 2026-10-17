'use client';

import React, { useState } from 'react';
import { Shield, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { WhitelistRule } from '@/types/store';
import { formatDateTime } from '@/lib/utils';

interface WhitelistModalProps {
  whitelist: WhitelistRule[];
  onClose: () => void;
  onAddRule: (rule: { pattern: string; description: string }) => Promise<void>;
  onToggleRule: (id: string, enabled: boolean) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
}

export const WhitelistModal: React.FC<WhitelistModalProps> = ({
  whitelist,
  onClose,
  onAddRule,
  onToggleRule,
  onDeleteRule,
}) => {
  const [pattern, setPattern] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;

    try {
      setLoading(true);
      await onAddRule({ pattern: pattern.trim(), description: description.trim() });
      setPattern('');
      setDescription('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">寄件者白名單管理 (allowed_senders)</h3>
              <p className="text-xs text-slate-500">
                僅允許白名單寄件者觸發新工單；支援單一信箱與 <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono">*@domain.com</code> 萬用字元
              </p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm font-semibold p-1">
            ✕
          </button>
        </div>

        {/* 新增規則表單 */}
        <form onSubmit={handleSubmit} className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row gap-2.5 items-end">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              白名單匹配樣式 (Pattern) *
            </label>
            <input
              type="text"
              required
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="例如: *@vip-client.com 或 boss@corp.com"
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden bg-white"
            />
          </div>

          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              規則描述說明
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如: 重要客戶集團或夥伴"
              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {loading ? '新增中...' : '加入白名單'}
          </button>
        </form>

        {/* 規則列表 */}
        <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
          {whitelist.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">目前尚無白名單規則</div>
          ) : (
            whitelist.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:border-emerald-200 transition text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onToggleRule(rule.id, !rule.enabled)}
                    title={rule.enabled ? '點擊停用此規則' : '點擊啟用此規則'}
                    className={rule.enabled ? 'text-emerald-600' : 'text-slate-300'}
                  >
                    {rule.enabled ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </button>
                  <div>
                    <span className="font-mono font-bold text-slate-800 text-xs">
                      {rule.pattern}
                    </span>
                    {rule.description && (
                      <span className="text-slate-500 ml-2 text-[11px]">
                        ({rule.description})
                      </span>
                    )}
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      建立於: {formatDateTime(rule.createdAt)} • 由 {rule.addedBy}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteRule(rule.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition"
                  title="刪除此規則"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
