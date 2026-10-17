'use client';

import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { TeamMember, Priority } from '@/types/store';

interface ManualTaskModalProps {
  roster: TeamMember[];
  onClose: () => void;
  onCreateTask: (taskData: {
    subject: string;
    content: string;
    assigneeId: string;
    priority: Priority;
    senderName: string;
    senderEmail: string;
  }) => Promise<void>;
}

export const ManualTaskModal: React.FC<ManualTaskModalProps> = ({
  roster,
  onClose,
  onCreateTask,
}) => {
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [assigneeId, setAssigneeId] = useState(
    roster.find((m) => m.status === 'ACTIVE')?.id || roster[0]?.id || ''
  );
  const [priority, setPriority] = useState<Priority>('P3');
  const [senderName, setSenderName] = useState('內部派單員');
  const [senderEmail, setSenderEmail] = useState('admin@internal.corp');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !assigneeId) return;

    try {
      setSubmitting(true);
      await onCreateTask({
        subject: subject.trim(),
        content: content.trim(),
        assigneeId,
        priority,
        senderName: senderName.trim(),
        senderEmail: senderEmail.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">手動建立工單</h3>
              <p className="text-xs text-slate-500">網頁直接指派任務並記錄於動態輪值系統</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm font-semibold p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">工單主旨 *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="例如: 審核新版 API 規格文件"
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">指派人員 *</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                required
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                {roster.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.status === 'ON_LEAVE' ? '(休假中)' : '(在線)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">優先順序 (SLA)</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-bold"
              >
                <option value="P1">🔴 P1 (今天回覆)</option>
                <option value="P2">🟠 P2 (明天回覆)</option>
                <option value="P3">🔵 P3 (3天內預設)</option>
                <option value="P4">⚪ P4 (一週內)</option>
                <option value="P5">⚫ P5 (視需求)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">發起人名稱</label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">發起人信箱</label>
              <input
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">任務詳細內容</label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="輸入工作任務說明細節..."
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
            >
              {submitting ? '建立中...' : '確認建立工單'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
