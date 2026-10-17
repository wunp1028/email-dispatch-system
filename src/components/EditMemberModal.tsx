'use client';

import React, { useState } from 'react';
import { UserCheck, Trash2, Shield, Sparkles } from 'lucide-react';
import { TeamMember, MemberStatus } from '@/types/store';

interface EditMemberModalProps {
  member: TeamMember | null;
  onClose: () => void;
  onUpdateMember: (id: string, updates: Partial<TeamMember>) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
}

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  member,
  onClose,
  onUpdateMember,
  onDeleteMember,
}) => {
  if (!member) return null;

  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [aliases, setAliases] = useState(member.aliases.join(', '));
  const [effectiveLoad, setEffectiveLoad] = useState(member.effectiveLoad);
  const [status, setStatus] = useState<MemberStatus>(member.status);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    try {
      setSubmitting(true);
      const aliasesList = aliases
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      await onUpdateMember(member.id, {
        name: name.trim(),
        email: email.trim(),
        aliases: aliasesList.length > 0 ? aliasesList : [name.trim()],
        effectiveLoad: Number(effectiveLoad),
        status,
      });

      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`確定要將成員「${member.name}」從輪值名冊中刪除嗎？`)) {
      try {
        setSubmitting(true);
        await onDeleteMember(member.id);
        onClose();
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">編輯輪值成員</h3>
              <p className="text-xs text-slate-500">維護成員資訊、別名、狀態與輪值負載權重</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm font-semibold p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">成員姓名 *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email 信箱 *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              別名陣列 (逗號或空格分隔，信件 @這些別名 時會自動派給該人員)
            </label>
            <input
              type="text"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="例如: 小美, May, meichen"
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">執勤狀態</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MemberStatus)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="ACTIVE">🟢 在線執勤 (ACTIVE)</option>
                <option value="ON_LEAVE">🏖️ 休假中 (ON_LEAVE)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">有效負載權重</label>
              <input
                type="number"
                min="0"
                value={effectiveLoad}
                onChange={(e) => setEffectiveLoad(Number(e.target.value))}
                className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              刪除此成員
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
              >
                {submitting ? '儲存中...' : '儲存變更'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
