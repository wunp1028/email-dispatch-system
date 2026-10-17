'use client';

import React, { useState } from 'react';
import { Users, UserPlus, Power, CheckCircle, Shield, Award, Sparkles, RefreshCw } from 'lucide-react';
import { TeamMember } from '@/types/store';

interface RosterQueueProps {
  roster: TeamMember[];
  crownHolderId: string | null;
  onUpdateMember: (id: string, updates: Partial<TeamMember>) => Promise<void>;
  onAddMember: (member: { name: string; email: string; aliases: string[] }) => Promise<void>;
}

export const RosterQueue: React.FC<RosterQueueProps> = ({
  roster,
  crownHolderId,
  onUpdateMember,
  onAddMember,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 排序：在線人員依 effectiveLoad 升序排列（即下一次自動輪值派工順序）；休假人員置底
  const sortedRoster = [...roster].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'ACTIVE' ? -1 : 1;
    }
    return a.effectiveLoad - b.effectiveLoad;
  });

  const handleToggleStatus = async (member: TeamMember) => {
    try {
      setLoadingId(member.id);
      const nextStatus = member.status === 'ACTIVE' ? 'ON_LEAVE' : 'ACTIVE';
      await onUpdateMember(member.id, { status: nextStatus });
    } finally {
      setLoadingId(null);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;

    try {
      setIsSubmitting(true);
      const aliasesList = newAliases
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      await onAddMember({
        name: newName.trim(),
        email: newEmail.trim(),
        aliases: aliasesList.length > 0 ? aliasesList : [newName.trim()],
      });

      setNewName('');
      setNewEmail('');
      setNewAliases('');
      setShowAddModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-lg">動態輪值梯隊名冊</h3>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium border border-indigo-200">
              {roster.filter((m) => m.status === 'ACTIVE').length} 人在線執勤
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            由系統智慧排序：在線且有效負載 (effectiveLoad) 最低者排在最前；銷假上班時自動對齊為 <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-700 font-semibold">最低值 - 1</code> 優先補單。
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition shadow-sm"
        >
          <UserPlus className="w-3.5 h-3.5" />
          新增輪值成員
        </button>
      </div>

      {/* 成員列表橫向 / 網格滾動卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {sortedRoster.map((member, index) => {
          const isCrown = member.id === crownHolderId;
          const isActive = member.status === 'ACTIVE';
          const isNextInLine = isActive && index === 0;

          return (
            <div
              key={member.id}
              className={`relative rounded-xl border p-4 transition-all duration-200 ${
                !isActive
                  ? 'bg-slate-50 border-slate-200 opacity-70'
                  : isCrown
                  ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-400/40 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
              }`}
            >
              {/* 皇冠 / 輪值第一順位標記 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  {isCrown && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-400 text-slate-950 shadow-xs">
                      👑 最新持冠
                    </span>
                  )}
                  {isNextInLine && !isCrown && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      🎯 下一順位
                    </span>
                  )}
                  {!isActive && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-200 text-slate-700">
                      🏖️ 休假中
                    </span>
                  )}
                </div>

                {/* 在線 / 休假切換開關 */}
                <button
                  onClick={() => handleToggleStatus(member)}
                  disabled={loadingId === member.id}
                  title={isActive ? '點擊切換為休假 (ON_LEAVE)' : '點擊銷假恢復上班 (ACTIVE，自動第一順位補單)'}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700 border border-emerald-200 hover:border-rose-200'
                      : 'bg-indigo-50 text-indigo-700 hover:bg-emerald-50 hover:text-emerald-700 border border-indigo-200'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  {loadingId === member.id ? '調整中...' : isActive ? '執勤中' : '銷假上班'}
                </button>
              </div>

              {/* 成員個人資訊 */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                    isActive
                      ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm'
                      : 'bg-slate-300 text-slate-600'
                  }`}
                >
                  {member.name.substring(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 text-sm truncate flex items-center gap-1.5">
                    {member.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate font-mono">
                    {member.email}
                  </div>
                </div>
              </div>

              {/* 別名 Aliases 標籤 */}
              <div className="mt-3 flex flex-wrap gap-1 items-center">
                <span className="text-[10px] text-slate-400">別名:</span>
                {member.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono"
                  >
                    @{alias}
                  </span>
                ))}
              </div>

              {/* 負載與工單數據 */}
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-[10px] text-slate-400">有效負載</div>
                  <div className="text-sm font-bold text-indigo-600 font-mono">
                    {member.effectiveLoad}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">當前活躍</div>
                  <div className="text-sm font-bold text-amber-600 font-mono">
                    {member.currentActiveTasks}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">總累計</div>
                  <div className="text-sm font-bold text-slate-700 font-mono">
                    {member.assignedCount}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 新增成員 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">新增輪值成員</h3>
            <p className="text-xs text-slate-500 mb-4">
              新增人員將自動加入輪值隊列，並初始對齊當前在線最低負載。
            </p>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  姓名 / 顯示名稱 *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如: 建宏 或 Alex"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email 信箱 *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="例如: jh@company.com"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  別名陣列 (逗號或空格分隔，支援半形/全形 @ 匹配)
                </label>
                <input
                  type="text"
                  value={newAliases}
                  onChange={(e) => setNewAliases(e.target.value)}
                  placeholder="例如: JH, 建宏, ken"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium shadow-sm transition"
                >
                  {isSubmitting ? '儲存中...' : '確認新增'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
