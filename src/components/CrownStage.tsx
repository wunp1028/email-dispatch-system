'use client';

import React from 'react';
import { Crown, AlertCircle, Clock, CheckCircle2, Users, ShieldAlert, Sparkles } from 'lucide-react';
import { TeamMember, Task } from '@/types/store';

interface CrownStageProps {
  crownHolder: TeamMember | undefined;
  tasks: Task[];
  roster: TeamMember[];
}

export const CrownStage: React.FC<CrownStageProps> = ({ crownHolder, tasks, roster }) => {
  const activeMembers = roster.filter((m) => m.status === 'ACTIVE');
  const onLeaveMembers = roster.filter((m) => m.status === 'ON_LEAVE');

  const pendingTasks = tasks.filter((t) => t.status === 'PENDING').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const resolvedTasks = tasks.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
  const p1Tasks = tasks.filter((t) => t.priority === 'P1' && t.status !== 'CLOSED').length;

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-xl border border-slate-700/60 relative overflow-hidden">
      {/* 背景裝飾光暈 */}
      <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* 皇冠得主舞台 (左側 5 欄) */}
        <div className="lg:col-span-5 flex items-center gap-5 p-4 bg-white/5 border border-amber-400/30 rounded-xl backdrop-blur-md">
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-2xl font-black text-slate-950">
              {crownHolder ? crownHolder.name.substring(0, 1) : '?'}
            </div>
            <div className="absolute -top-3 -right-2 crown-glow">
              <span className="text-2xl select-none" role="img" aria-label="crown">👑</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 flex items-center gap-1">
                <Crown className="w-3 h-3" /> 當前受派皇冠主
              </span>
              {crownHolder?.status === 'ACTIVE' ? (
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="在線執勤中" />
              ) : (
                <span className="text-[10px] text-slate-400">(休假中)</span>
              )}
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white mt-1 truncate">
              {crownHolder ? crownHolder.name : '暫無受派人'}
            </h2>
            <p className="text-xs text-slate-400 truncate font-mono">
              {crownHolder?.email || '等待新信件派發'}
            </p>
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-300">
              <div>
                累計派工: <span className="font-bold text-amber-300">{crownHolder?.assignedCount ?? 0}</span> 件
              </div>
              <div>
                當前負載: <span className="font-bold text-indigo-300">{crownHolder?.effectiveLoad ?? 0}</span>
              </div>
              <div>
                處理中: <span className="font-bold text-emerald-300">{crownHolder?.currentActiveTasks ?? 0}</span> 件
              </div>
            </div>
          </div>
        </div>

        {/* 即時數據指標卡 (右側 7 欄) */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/5 border border-slate-700/60 rounded-xl p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>待處理工單</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-1.5">{pendingTasks}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">尚未開始處理</div>
          </div>

          <div className="bg-white/5 border border-slate-700/60 rounded-xl p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>處理中任務</span>
              <AlertCircle className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-1.5">{inProgressTasks}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">團隊正在推進</div>
          </div>

          <div className="bg-white/5 border border-slate-700/60 rounded-xl p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>P1 今日特急</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-rose-400 mt-1.5">{p1Tasks}</div>
            <div className="text-[11px] text-rose-300/80 mt-0.5">今日 23:59 到期</div>
          </div>

          <div className="bg-white/5 border border-slate-700/60 rounded-xl p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>在線執勤人</span>
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1.5">
              {activeMembers.length} <span className="text-xs font-normal text-slate-400">/ {roster.length}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {onLeaveMembers.length > 0 ? `${onLeaveMembers.length} 人休假中` : '全員在線'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
