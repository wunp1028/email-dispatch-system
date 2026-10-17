'use client';

import React, { useState } from 'react';
import { ArrowRightLeft, Crown, AlertCircle } from 'lucide-react';
import { Task, TeamMember } from '@/types/store';

interface ReassignModalProps {
  task: Task | null;
  roster: TeamMember[];
  onClose: () => void;
  onConfirmReassign: (taskId: string, newAssigneeId: string, reason: string) => Promise<void>;
}

export const ReassignModal: React.FC<ReassignModalProps> = ({
  task,
  roster,
  onClose,
  onConfirmReassign,
}) => {
  if (!task) return null;

  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    roster.find((m) => m.id !== task.assigneeId && m.status === 'ACTIVE')?.id || ''
  );
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) return;

    try {
      setLoading(true);
      await onConfirmReassign(task.id, selectedMemberId, reason);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const newAssignee = roster.find((m) => m.id === selectedMemberId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">任務轉派與皇冠移交</h3>
            <p className="text-xs text-slate-500">工單編號: {task.ticketNumber}</p>
          </div>
        </div>

        <div className="my-4 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>工單主旨:</span>
            <span className="font-semibold text-slate-800 truncate max-w-[200px]">
              {task.cleanSubject}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>目前負責人:</span>
            <span className="font-bold text-slate-700">{task.assigneeName}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              選擇接手之團隊成員 *
            </label>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              required
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            >
              <option value="" disabled>請選擇團隊人員</option>
              {roster.map((m) => (
                <option key={m.id} value={m.id} disabled={m.id === task.assigneeId}>
                  {m.name} ({m.email}) {m.status === 'ON_LEAVE' ? '🏖️ [休假中]' : '🟢 [在線]'} (有效負載: {m.effectiveLoad})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              轉派原因說明 (將記錄於工單歷程)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如: 業務專業分工轉交、排程衝突轉派..."
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* 皇冠移交提示 */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
            <Crown className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              轉派確認後，原負責人工作量計數將 -1，新受派人 <strong>{newAssignee?.name || '新成員'}</strong> 工作量計數將 +1，並接手代表最新受派者的 <strong>皇冠 👑</strong>。
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !selectedMemberId}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
            >
              {loading ? '轉派中...' : '確認轉派與移交皇冠'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
