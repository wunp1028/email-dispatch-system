'use client';

import React, { useState } from 'react';
import {
  Search,
  Filter,
  Clock,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  History,
  Trash2,
  Calendar,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { Task, Priority, TaskStatus, TeamMember } from '@/types/store';
import { formatDateTime } from '@/lib/utils';

interface TaskBoardProps {
  tasks: Task[];
  roster: TeamMember[];
  onUpdateStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onUpdatePriority: (taskId: string, priority: Priority) => Promise<void>;
  onOpenReassign: (task: Task) => void;
  onUpdateNotes: (taskId: string, notes: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({
  tasks,
  roster,
  onUpdateStatus,
  onUpdatePriority,
  onOpenReassign,
  onUpdateNotes,
  onDeleteTask,
}) => {
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('ALL');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingNotesTaskId, setEditingNotesTaskId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  // 篩選工單
  const filteredTasks = tasks.filter((task) => {
    if (selectedStatus !== 'ALL' && task.status !== selectedStatus) return false;
    if (selectedPriority !== 'ALL' && task.priority !== selectedPriority) return false;
    if (selectedAssignee !== 'ALL' && task.assigneeId !== selectedAssignee) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        task.ticketNumber.toLowerCase().includes(q) ||
        task.cleanSubject.toLowerCase().includes(q) ||
        task.senderEmail.toLowerCase().includes(q) ||
        task.senderName.toLowerCase().includes(q) ||
        task.cleanContent.toLowerCase().includes(q) ||
        task.assigneeName.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const getPriorityBadge = (p: Priority) => {
    switch (p) {
      case 'P1':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      case 'P2':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
      case 'P3':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'P4':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'P5':
        return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  const getStatusBadge = (s: TaskStatus) => {
    switch (s) {
      case 'PENDING':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'IN_PROGRESS':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'CLOSED':
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const isOverdue = (dueAt: string | null) => {
    if (!dueAt) return false;
    return new Date(dueAt).getTime() < Date.now();
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
      {/* 標題與篩選控制項 */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">郵件工單追蹤看板</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            共 {tasks.length} 筆工單 (已篩選出 {filteredTasks.length} 筆)，支援直接於列表中切換 P1~P5 優先序、變更狀態與即時轉派。
          </p>
        </div>

        {/* 搜尋與篩選 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 搜尋輸入框 */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋編號、主旨、寄件人、內文..."
              className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          {/* 狀態篩選 */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">全部狀態</option>
            <option value="PENDING">待處理</option>
            <option value="IN_PROGRESS">處理中</option>
            <option value="RESOLVED">已處理</option>
            <option value="CLOSED">已結案</option>
          </select>

          {/* 優先級篩選 */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">全部優先級</option>
            <option value="P1">P1 今天回覆</option>
            <option value="P2">P2 明天回覆</option>
            <option value="P3">P3 3天內回覆 (預設)</option>
            <option value="P4">P4 一週內回覆</option>
            <option value="P5">P5 視需求回覆</option>
          </select>

          {/* 受派人篩選 */}
          <select
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">全部受派人員</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 工單列表 */}
      <div className="mt-4 space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">查無符合條件的工單</p>
            <p className="text-xs text-slate-400 mt-1">您可以透過郵件模擬器發送信件建立工單，或調整搜尋篩選條件。</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isExpanded = expandedTaskId === task.id;
            const overdue = isOverdue(task.dueAt) && task.status !== 'CLOSED' && task.status !== 'RESOLVED';

            return (
              <div
                key={task.id}
                className={`border rounded-xl transition-all duration-150 ${
                  overdue
                    ? 'border-rose-300 bg-rose-50/20'
                    : task.status === 'CLOSED'
                    ? 'border-slate-200 bg-slate-50/50 opacity-80'
                    : 'border-slate-200 hover:border-indigo-300 bg-white'
                }`}
              >
                {/* 工單主列 */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* 左側：編號、標題、寄件人、派工類型 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                        {task.ticketNumber}
                      </span>
                      {task.dispatchType === 'DIRECT' ? (
                        <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                          🎯 指定派單
                        </span>
                      ) : (
                        <span className="text-[11px] bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                          ⚖️ 動態輪值
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {formatDateTime(task.receivedAt)}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm md:text-base leading-snug truncate">
                      {task.cleanSubject || task.mailSubject}
                    </h4>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <div>
                        寄件人: <span className="font-medium text-slate-700">{task.senderName}</span> ({task.senderEmail})
                      </div>
                      {task.mentionedMembers.length > 0 && (
                        <div className="text-purple-600 font-medium">
                          內文提及: {task.mentionedMembers.map((m) => `@${m}`).join(' ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 右側互動區：行內優先級下拉、狀態下拉、SLA、受派人與轉派 */}
                  <div className="flex flex-wrap md:flex-nowrap items-center gap-3 shrink-0">
                    {/* 行內優先級下拉 (P1~P5) */}
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5 font-medium">優先級</label>
                      <select
                        value={task.priority}
                        onChange={(e) => onUpdatePriority(task.id, e.target.value as Priority)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold focus:outline-hidden cursor-pointer ${getPriorityBadge(
                          task.priority
                        )}`}
                      >
                        <option value="P1">🔴 P1 (今天回覆)</option>
                        <option value="P2">🟠 P2 (明天回覆)</option>
                        <option value="P3">🔵 P3 (3天內預設)</option>
                        <option value="P4">⚪ P4 (一週內)</option>
                        <option value="P5">⚫ P5 (視需求)</option>
                      </select>
                    </div>

                    {/* SLA 到期警示 */}
                    <div className="min-w-[100px]">
                      <label className="block text-[10px] text-slate-400 mb-0.5 font-medium">SLA 期限</label>
                      {task.dueAt ? (
                        <div
                          className={`text-xs font-mono font-medium ${
                            overdue
                              ? 'text-rose-600 font-bold flex items-center gap-1 animate-pulse'
                              : 'text-slate-600'
                          }`}
                          title={`到期時間: ${task.dueAt}`}
                        >
                          {overdue && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                          {formatDateTime(task.dueAt)}
                          {overdue && <span className="text-[10px] bg-rose-100 text-rose-700 px-1 rounded">逾期</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono">無強制期限</span>
                      )}
                    </div>

                    {/* 行內狀態切換 */}
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5 font-medium">狀態</label>
                      <select
                        value={task.status}
                        onChange={(e) => onUpdateStatus(task.id, e.target.value as TaskStatus)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold focus:outline-hidden cursor-pointer ${getStatusBadge(
                          task.status
                        )}`}
                      >
                        <option value="PENDING">待處理</option>
                        <option value="IN_PROGRESS">處理中</option>
                        <option value="RESOLVED">已處理</option>
                        <option value="CLOSED">已結案</option>
                      </select>
                    </div>

                    {/* 受派人與轉派按鈕 */}
                    <div className="pl-2 border-l border-slate-200 flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">目前負責人</div>
                        <div className="text-xs font-bold text-slate-800">{task.assigneeName}</div>
                      </div>

                      <button
                        onClick={() => onOpenReassign(task)}
                        title="轉派任務給其他團隊成員 (移交皇冠 👑)"
                        className="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 rounded-lg transition"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>

                      {/* 展開詳情 */}
                      <button
                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 展開詳情抽屜 (郵件內文、剝離引文檢驗、歷程與備註) */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50/80 border-t border-slate-200 rounded-b-xl space-y-4">
                    {/* 最新回覆純內文 */}
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 font-semibold">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                          最新一封純淨內文 (已自動剝離歷史引文):
                        </span>
                        {task.mailSubject !== task.cleanSubject && (
                          <span className="text-[11px] text-slate-400">
                            原始主旨: {task.mailSubject}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-800 whitespace-pre-wrap font-sans bg-slate-50 p-2.5 rounded border border-slate-100 max-h-48 overflow-y-auto">
                        {task.cleanContent || '(無內文)'}
                      </div>
                    </div>

                    {/* 備註與歷程紀錄 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* 任務歷程 Audit Trail */}
                      <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                        <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-amber-600" />
                          工單異動歷程 (Audit Trail)
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {task.history.map((hist) => (
                            <div key={hist.id} className="text-xs border-l-2 border-indigo-300 pl-2 py-0.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span className="font-semibold text-slate-600">{hist.actor}</span>
                                <span>{formatDateTime(hist.timestamp)}</span>
                              </div>
                              <p className="text-slate-700 mt-0.5">{hist.details}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 備註維護與刪除 */}
                      <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-700 mb-1.5">內部處理備註 (Notes)</div>
                          {editingNotesTaskId === task.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={notesDraft}
                                onChange={(e) => setNotesDraft(e.target.value)}
                                rows={3}
                                className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-indigo-500"
                                placeholder="輸入內部溝通或追蹤筆記..."
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setEditingNotesTaskId(null)}
                                  className="text-xs px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded"
                                >
                                  取消
                                </button>
                                <button
                                  onClick={async () => {
                                    await onUpdateNotes(task.id, notesDraft);
                                    setEditingNotesTaskId(null);
                                  }}
                                  className="text-xs px-3 py-1 bg-indigo-600 text-white rounded font-medium"
                                >
                                  儲存備註
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingNotesTaskId(task.id);
                                setNotesDraft(task.notes || '');
                              }}
                              className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-dashed border-slate-300 cursor-pointer hover:bg-indigo-50/40 min-h-[60px]"
                            >
                              {task.notes || <span className="text-slate-400 italic">點擊此處新增內部備註...</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end pt-3 mt-2 border-t border-slate-100">
                          <button
                            onClick={() => {
                              if (confirm(`確定要刪除工單 ${task.ticketNumber} 嗎？`)) {
                                onDeleteTask(task.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            刪除此工單
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
