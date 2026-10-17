'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Mail,
  Shield,
  History,
  PlusCircle,
  RefreshCw,
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { SystemState, TeamMember, Task, WhitelistRule, MailLog, TaskStatus, Priority } from '@/types/store';
import { CrownStage } from '@/components/CrownStage';
import { RosterQueue } from '@/components/RosterQueue';
import { TaskBoard } from '@/components/TaskBoard';
import { ReassignModal } from '@/components/ReassignModal';
import { EmailSimulatorModal } from '@/components/EmailSimulatorModal';
import { WhitelistModal } from '@/components/WhitelistModal';
import { MailLogsModal } from '@/components/MailLogsModal';
import { ManualTaskModal } from '@/components/ManualTaskModal';

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistRule[]>([]);
  const [mailLogs, setMailLogs] = useState<MailLog[]>([]);
  const [crownHolderId, setCrownHolderId] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [reassignTask, setReassignTask] = useState<Task | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showWhitelist, setShowWhitelist] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showManualTask, setShowManualTask] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 取得最新系統資料
  const fetchAllData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [tasksRes, rosterRes, whitelistRes, logsRes, statusRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/roster'),
        fetch('/api/whitelist'),
        fetch('/api/logs'),
        fetch('/api/status').catch(() => null),
      ]);

      if (statusRes && statusRes.ok) {
        const sData = await statusRes.json();
        setStorageStatus(sData);
      }

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData.tasks || []);
        if (tasksData.crownHolderId) {
          setCrownHolderId(tasksData.crownHolderId);
        }
      }

      if (rosterRes.ok) {
        const rosterData = await rosterRes.json();
        setRoster(rosterData.roster || []);
        if (rosterData.crownHolderId) {
          setCrownHolderId(rosterData.crownHolderId);
        }
      }

      if (whitelistRes.ok) {
        const wlData = await whitelistRes.json();
        setWhitelist(wlData.whitelist || []);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setMailLogs(logsData.logs || []);
      }
    } catch (err: any) {
      console.error('Fetch data error:', err);
      showToast('載入資料失敗，請檢查伺服器連線');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // 更新工單狀態 (行內直接切換)
  const handleUpdateStatus = async (taskId: string, status: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showToast(`工單狀態已更新為 [${status}]`);
        fetchAllData();
      }
    } catch (err: any) {
      showToast('更新狀態失敗: ' + err.message);
    }
  };

  // 更新工單優先級 (行內直接切換 P1~P5)
  const handleUpdatePriority = async (taskId: string, priority: Priority) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      });
      if (res.ok) {
        showToast(`優先順序已調整為 [${priority}]，SLA 已重新計算`);
        fetchAllData();
      }
    } catch (err: any) {
      showToast('調整優先級失敗: ' + err.message);
    }
  };

  // 任務轉派
  const handleConfirmReassign = async (taskId: string, newAssigneeId: string, reason: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REASSIGN',
          newAssigneeId,
          reason,
        }),
      });
      if (res.ok) {
        showToast('任務轉派成功，皇冠 👑 已順利移交給新受派人！');
        fetchAllData();
      }
    } catch (err: any) {
      showToast('轉派失敗: ' + err.message);
    }
  };

  // 內部備註更新
  const handleUpdateNotes = async (taskId: string, notes: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        showToast('備註已成功儲存');
        fetchAllData();
      }
    } catch (err: any) {
      showToast('儲存備註失敗: ' + err.message);
    }
  };

  // 刪除工單
  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('工單已刪除');
        fetchAllData();
      }
    } catch (err: any) {
      showToast('刪除失敗: ' + err.message);
    }
  };

  // 人員維護 (銷假 / 休假切換)
  const handleUpdateMember = async (id: string, updates: Partial<TeamMember>) => {
    try {
      const res = await fetch('/api/roster', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        if (updates.status === 'ACTIVE') {
          showToast('人員已銷假上班！系統已自動對齊 (在線最低-1) 優先輪值第一順位補單。');
        } else {
          showToast('人員狀態已更新');
        }
        fetchAllData();
      }
    } catch (err: any) {
      showToast('更新失敗: ' + err.message);
    }
  };

  // 新增成員
  const handleAddMember = async (memberData: { name: string; email: string; aliases: string[] }) => {
    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberData),
      });
      if (res.ok) {
        showToast(`已成功加入成員 ${memberData.name}`);
        fetchAllData();
      } else {
        const data = await res.json();
        showToast(data.error || '新增失敗');
      }
    } catch (err: any) {
      showToast('新增失敗: ' + err.message);
    }
  };

  // 白名單操作
  const handleAddWhitelistRule = async (rule: { pattern: string; description: string }) => {
    try {
      const res = await fetch('/api/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (res.ok) {
        showToast(`白名單樣式 ${rule.pattern} 已加入`);
        fetchAllData();
      } else {
        const data = await res.json();
        showToast(data.error || '加入失敗');
      }
    } catch (err: any) {
      showToast('加入失敗: ' + err.message);
    }
  };

  const handleToggleWhitelistRule = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (res.ok) {
        showToast(`白名單規則已${enabled ? '啟用' : '停用'}`);
        fetchAllData();
      }
    } catch (err: any) {
      showToast('切換失敗: ' + err.message);
    }
  };

  const handleDeleteWhitelistRule = async (id: string) => {
    try {
      const res = await fetch(`/api/whitelist?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('白名單規則已刪除');
        fetchAllData();
      }
    } catch (err: any) {
      showToast('刪除失敗: ' + err.message);
    }
  };

  // 清空日誌
  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CLEAR_LOGS' }),
      });
      if (res.ok) {
        showToast('郵件日誌已清空');
        fetchAllData();
      }
    } catch (err: any) {
      showToast('清空日誌失敗: ' + err.message);
    }
  };

  // 重設為初始種子資料 (方便展示測試)
  const handleResetToSeed = async () => {
    if (!confirm('確定要將系統狀態重設為初始示範資料嗎？')) return;
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET_TO_SEED' }),
      });
      if (res.ok) {
        showToast('系統已重設為乾淨初始種子狀態');
        fetchAllData();
      }
    } catch (err: any) {
      showToast('重設失敗: ' + err.message);
    }
  };

  // 手動建單
  const handleCreateManualTask = async (taskData: any) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      if (res.ok) {
        showToast('手動工單建立成功！');
        fetchAllData();
      } else {
        const d = await res.json();
        showToast(d.error || '建立失敗');
      }
    } catch (err: any) {
      showToast('建立失敗: ' + err.message);
    }
  };

  // 目前皇冠持有者
  const crownHolder = roster.find((m) => m.id === crownHolderId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* 頂部導覽列 */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-slate-900 text-base sm:text-lg tracking-tight">
                  郵件智慧派工與動態輪值系統
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Zero-DB v2.0
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                {storageStatus?.r2Status === 'CONNECTED' ? (
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                    Cloudflare R2 雲端連線中 ({storageStatus.r2Bucket})
                  </span>
                ) : storageStatus?.r2Status === 'ERROR' ? (
                  <span
                    className="flex items-center gap-1 text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 cursor-help"
                    title={`R2 連線失敗: ${storageStatus.r2Error || '請檢查環境變數'}`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                    R2 連線異常 (點擊查看: {storageStatus.r2Error})
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <Database className="w-3.5 h-3.5 text-amber-600" />
                    本機暫存模式 (未設定 R2 環境變數)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 頂部快捷動作按鈕 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSimulator(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">郵件測試模擬器</span>
              <span className="sm:hidden">模擬器</span>
            </button>

            <button
              onClick={() => setShowWhitelist(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
              title="寄件者白名單管理"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">白名單</span>
            </button>

            <button
              onClick={() => setShowLogs(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
              title="郵件攔截與派工日誌"
            >
              <History className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">日誌</span>
            </button>

            <button
              onClick={() => setShowManualTask(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
              title="手動建立工單"
            >
              <PlusCircle className="w-3.5 h-3.5 text-slate-700" />
              <span className="hidden md:inline">手動建單</span>
            </button>

            <button
              onClick={fetchAllData}
              disabled={refreshing}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              title="重新整理資料"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleResetToSeed}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              title="重設為預設種子資料"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 訊息 Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-bounce-soft">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 主體內容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {/* 1. 皇冠舞台與 KPI 指標 */}
        <CrownStage crownHolder={crownHolder} tasks={tasks} roster={roster} />

        {/* 2. 動態輪值梯隊名冊 (含銷假智慧平衡機制) */}
        <RosterQueue
          roster={roster}
          crownHolderId={crownHolderId}
          onUpdateMember={handleUpdateMember}
          onAddMember={handleAddMember}
        />

        {/* 3. 工單追蹤看板 (支援行內切換 P1~P5、狀態切換、SLA 倒數警示、轉派) */}
        <TaskBoard
          tasks={tasks}
          roster={roster}
          onUpdateStatus={handleUpdateStatus}
          onUpdatePriority={handleUpdatePriority}
          onOpenReassign={(task) => setReassignTask(task)}
          onUpdateNotes={handleUpdateNotes}
          onDeleteTask={handleDeleteTask}
        />
      </main>

      {/* 轉派 Modal */}
      {reassignTask && (
        <ReassignModal
          task={reassignTask}
          roster={roster}
          onClose={() => setReassignTask(null)}
          onConfirmReassign={handleConfirmReassign}
        />
      )}

      {/* 郵件解析與 Webhook 模擬器 Modal */}
      {showSimulator && (
        <EmailSimulatorModal
          roster={roster}
          whitelist={whitelist}
          onClose={() => setShowSimulator(false)}
          onSuccessDispatch={() => {
            showToast('郵件已成功由 Webhook 解析並派發入庫！');
            fetchAllData();
          }}
        />
      )}

      {/* 白名單管理 Modal */}
      {showWhitelist && (
        <WhitelistModal
          whitelist={whitelist}
          onClose={() => setShowWhitelist(false)}
          onAddRule={handleAddWhitelistRule}
          onToggleRule={handleToggleWhitelistRule}
          onDeleteRule={handleDeleteWhitelistRule}
        />
      )}

      {/* 郵件日誌 Modal */}
      {showLogs && (
        <MailLogsModal
          logs={mailLogs}
          onClose={() => setShowLogs(false)}
          onClearLogs={handleClearLogs}
        />
      )}

      {/* 手動建單 Modal */}
      {showManualTask && (
        <ManualTaskModal
          roster={roster}
          onClose={() => setShowManualTask(false)}
          onCreateTask={handleCreateManualTask}
        />
      )}
    </div>
  );
}
