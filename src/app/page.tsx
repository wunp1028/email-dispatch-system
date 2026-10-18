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
  Lock,
  Unlock,
} from 'lucide-react';
import { SystemState, TeamMember, Task, WhitelistRule, MailLog, TaskStatus, Priority, DispatchStrategy } from '@/types/store';
import { CrownStage } from '@/components/CrownStage';
import { RosterQueue } from '@/components/RosterQueue';
import { TaskBoard } from '@/components/TaskBoard';
import { ReassignModal } from '@/components/ReassignModal';
import { EmailSimulatorModal } from '@/components/EmailSimulatorModal';
import { WhitelistModal } from '@/components/WhitelistModal';
import { MailLogsModal } from '@/components/MailLogsModal';
import { ManualTaskModal } from '@/components/ManualTaskModal';
import { EditMemberModal } from '@/components/EditMemberModal';
import { DataManagementModal } from '@/components/DataManagementModal';
import { AdminAuthModal } from '@/components/AdminAuthModal';

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistRule[]>([]);
  const [mailLogs, setMailLogs] = useState<MailLog[]>([]);
  const [crownHolderId, setCrownHolderId] = useState<string | null>(null);
  const [dispatchStrategy, setDispatchStrategy] = useState<DispatchStrategy>('DOUBLE_INTERLEAVED');
  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Admin PIN Auth 授權狀態
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<(() => void) | null>(null);

  // Modals
  const [reassignTask, setReassignTask] = useState<Task | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showWhitelist, setShowWhitelist] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showManualTask, setShowManualTask] = useState(false);
  const [showDataManagement, setShowDataManagement] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 檢查本機記住的 Admin PIN (效期 7 天)
  const getStoredAdminPin = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    const pin = localStorage.getItem('email_dispatch_admin_pin');
    const authTime = localStorage.getItem('email_dispatch_admin_auth_time');
    if (!pin || !authTime) return null;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - Number(authTime) > SEVEN_DAYS) {
      localStorage.removeItem('email_dispatch_admin_pin');
      localStorage.removeItem('email_dispatch_admin_auth_time');
      setIsAdmin(false);
      return null;
    }
    return pin;
  }, []);

  const getAdminHeaders = useCallback((): Record<string, string> => {
    const pin = getStoredAdminPin();
    return pin ? { 'x-admin-pin': pin } : {};
  }, [getStoredAdminPin]);

  useEffect(() => {
    const pin = getStoredAdminPin();
    if (pin) {
      setIsAdmin(true);
    }
  }, [getStoredAdminPin]);

  const requireAdminAuth = useCallback(
    (action: () => void) => {
      const pin = getStoredAdminPin();
      if (pin) {
        action();
      } else {
        setPendingAdminAction(() => action);
        setShowAdminAuth(true);
      }
    },
    [getStoredAdminPin]
  );

  const handleAdminAuthSuccess = (pin: string) => {
    setIsAdmin(true);
    showToast('管理員已成功授權解鎖 (記住 7 天)');
    if (pendingAdminAction) {
      const action = pendingAdminAction;
      setPendingAdminAction(null);
      action();
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('email_dispatch_admin_pin');
    localStorage.removeItem('email_dispatch_admin_auth_time');
    setIsAdmin(false);
    showToast('已登出管理員身份，鎖定為唯讀保護模式');
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
        if (rosterData.dispatchStrategy) {
          setDispatchStrategy(rosterData.dispatchStrategy);
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

  // 切換派工策略 (雙倍穿插補償模式 / 平滑保護模式 / 極致清閒平衡模式)
  const handleUpdateStrategy = async (strategy: DispatchStrategy) => {
    const pin = getStoredAdminPin();
    if (!pin) {
      requireAdminAuth(() => handleUpdateStrategy(strategy));
      return;
    }
    try {
      const res = await fetch('/api/system/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ action: 'SET_DISPATCH_STRATEGY', strategy }),
      });
      const data = await res.json();
      if (res.ok) {
        setDispatchStrategy(strategy);
        showToast(data.message || '派工策略已更新');
        fetchAllData();
      } else {
        if (res.status === 403) {
          requireAdminAuth(() => handleUpdateStrategy(strategy));
        } else {
          showToast(data.error || '策略切換失敗');
        }
      }
    } catch (err: any) {
      showToast('策略切換失敗: ' + err.message);
    }
  };

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

  // 人員維護 (銷假 / 休假切換 或 資料編輯)
  const handleUpdateMember = async (id: string, updates: Partial<TeamMember>) => {
    const isSensitive = Boolean(updates.name || updates.email || updates.aliases || typeof updates.effectiveLoad === 'number');
    if (isSensitive && !getStoredAdminPin()) {
      requireAdminAuth(() => handleUpdateMember(id, updates));
      return;
    }

    try {
      const res = await fetch('/api/roster', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        if (updates.status === 'ACTIVE') {
          showToast('人員已銷假上班！系統已依策略自動對齊負載並排入穿插補償輪值。');
        } else {
          showToast('人員狀態已更新');
        }
        fetchAllData();
      } else {
        const d = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(() => handleUpdateMember(id, updates));
        } else {
          showToast(d.error || '更新失敗');
        }
      }
    } catch (err: any) {
      showToast('更新失敗: ' + err.message);
    }
  };

  // 新增成員 (需管理員權限)
  const handleAddMember = async (memberData: { name: string; email: string; aliases: string[] }) => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(() => handleAddMember(memberData));
      return;
    }

    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify(memberData),
      });
      if (res.ok) {
        showToast(`已成功加入成員 ${memberData.name}`);
        fetchAllData();
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(() => handleAddMember(memberData));
        } else {
          showToast(data.error || '新增失敗');
        }
      }
    } catch (err: any) {
      showToast('新增失敗: ' + err.message);
    }
  };

  // 白名單操作 (需管理員權限)
  const handleAddWhitelistRule = async (rule: { pattern: string; description: string }) => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(() => handleAddWhitelistRule(rule));
      return;
    }

    try {
      const res = await fetch('/api/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify(rule),
      });
      if (res.ok) {
        showToast(`白名單樣式 ${rule.pattern} 已加入`);
        fetchAllData();
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(() => handleAddWhitelistRule(rule));
        } else {
          showToast(data.error || '加入失敗');
        }
      }
    } catch (err: any) {
      showToast('加入失敗: ' + err.message);
    }
  };

  const handleToggleWhitelistRule = async (id: string, enabled: boolean) => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(() => handleToggleWhitelistRule(id, enabled));
      return;
    }

    try {
      const res = await fetch('/api/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ id, enabled }),
      });
      if (res.ok) {
        showToast(`白名單規則已${enabled ? '啟用' : '停用'}`);
        fetchAllData();
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(() => handleToggleWhitelistRule(id, enabled));
        } else {
          showToast(data.error || '切換失敗');
        }
      }
    } catch (err: any) {
      showToast('切換失敗: ' + err.message);
    }
  };

  const handleDeleteWhitelistRule = async (id: string) => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(() => handleDeleteWhitelistRule(id));
      return;
    }

    try {
      const res = await fetch(`/api/whitelist?id=${id}`, {
        method: 'DELETE',
        headers: { ...getAdminHeaders() },
      });
      if (res.ok) {
        showToast('白名單規則已刪除');
        fetchAllData();
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(() => handleDeleteWhitelistRule(id));
        } else {
          showToast(data.error || '刪除失敗');
        }
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

  // 刪除成員 (需管理員權限)
  const handleDeleteMember = async (id: string) => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(() => handleDeleteMember(id));
      return;
    }

    try {
      const res = await fetch(`/api/roster?id=${id}`, {
        method: 'DELETE',
        headers: { ...getAdminHeaders() },
      });
      if (res.ok) {
        showToast('成員已成功自輪值名冊中刪除');
        fetchAllData();
      } else {
        const d = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(() => handleDeleteMember(id));
        } else {
          showToast(d.error || '刪除失敗');
        }
      }
    } catch (err: any) {
      showToast('刪除失敗: ' + err.message);
    }
  };

  // 重設為官方預設範例資料 (保留範例資料功能)
  const handleResetToSeed = async () => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(handleResetToSeed);
      return;
    }

    try {
      const res = await fetch('/api/system/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ action: 'RESET_TO_SEED' }),
      });
      if (res.ok) {
        showToast('系統已重設為官方預設範例資料！');
        fetchAllData();
      } else {
        const d = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(handleResetToSeed);
        } else {
          showToast(d.error || '重設失敗');
        }
      }
    } catch (err: any) {
      showToast('重設失敗: ' + err.message);
    }
  };

  // 清空所有工單與歷史日誌
  const handleClearTasksAndLogs = async () => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(handleClearTasksAndLogs);
      return;
    }

    try {
      const res = await fetch('/api/system/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ action: 'CLEAR_TASKS_LOGS' }),
      });
      if (res.ok) {
        showToast('所有工單與日誌已全數清空！');
        fetchAllData();
      } else {
        const d = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(handleClearTasksAndLogs);
        } else {
          showToast(d.error || '清空失敗');
        }
      }
    } catch (err: any) {
      showToast('清空失敗: ' + err.message);
    }
  };

  // 徹底清空系統全部資料
  const handleClearAllData = async () => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(handleClearAllData);
      return;
    }

    try {
      const res = await fetch('/api/system/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ action: 'CLEAR_ALL_DATA' }),
      });
      if (res.ok) {
        showToast('系統資料已全數清空完畢！');
        fetchAllData();
      } else {
        const d = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(handleClearAllData);
        } else {
          showToast(d.error || '清空失敗');
        }
      }
    } catch (err: any) {
      showToast('清空失敗: ' + err.message);
    }
  };

  // 匯出 JSON 備份檔案
  const handleExportData = async () => {
    try {
      const res = await fetch('/api/system/data');
      if (res.ok) {
        const data = await res.json();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `email_dispatch_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('系統備份 JSON 已成功匯出！');
      }
    } catch (err: any) {
      showToast('匯出失敗: ' + err.message);
    }
  };

  // 匯入 JSON 還原備份
  const handleImportData = async (file: File) => {
    if (!getStoredAdminPin()) {
      requireAdminAuth(() => handleImportData(file));
      return;
    }

    try {
      const text = await file.text();
      const importedState = JSON.parse(text);
      const res = await fetch('/api/system/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ action: 'IMPORT_JSON', importedState }),
      });
      if (res.ok) {
        showToast('備份資料已成功還原！');
        fetchAllData();
      } else {
        const d = await res.json().catch(() => ({}));
        if (res.status === 403) {
          requireAdminAuth(() => handleImportData(file));
        } else {
          showToast(d.error || '匯入失敗');
        }
      }
    } catch (err: any) {
      showToast('檔案格式解析錯誤: ' + err.message);
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
              onClick={() => {
                requireAdminAuth(() => setShowDataManagement(true));
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition border border-indigo-200"
              title="系統資料管理 (需管理員權限)"
            >
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">資料管理</span>
            </button>

            {/* 管理員 PIN 碼解鎖切換按鈕 */}
            {isAdmin ? (
              <button
                onClick={handleAdminLogout}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition border border-emerald-200"
                title="管理員已授權 (點擊登出鎖定)"
              >
                <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">管理員已授權</span>
              </button>
            ) : (
              <button
                onClick={() => setShowAdminAuth(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition border border-slate-200"
                title="點擊輸入管理員密鑰 (預設 admin888) 解鎖"
              >
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">管理員解鎖</span>
              </button>
            )}

            <button
              onClick={fetchAllData}
              disabled={refreshing}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              title="重新整理資料"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
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

        {/* 2. 動態輪值梯隊名冊 (含派工策略選擇、銷假雙倍穿插補償與成員編輯) */}
        <RosterQueue
          roster={roster}
          crownHolderId={crownHolderId}
          dispatchStrategy={dispatchStrategy}
          onUpdateStrategy={handleUpdateStrategy}
          onUpdateMember={handleUpdateMember}
          onAddMember={handleAddMember}
          onEditMember={(member) => {
            requireAdminAuth(() => setEditingMember(member));
          }}
          onRequestAdminAuth={requireAdminAuth}
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

      {/* 編輯成員 Modal */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onUpdateMember={handleUpdateMember}
          onDeleteMember={handleDeleteMember}
        />
      )}

      {/* 系統資料管理 Modal (清空工單/範例資料/備份還原) */}
      {showDataManagement && (
        <DataManagementModal
          onClose={() => setShowDataManagement(false)}
          onResetToSeed={handleResetToSeed}
          onClearTasksAndLogs={handleClearTasksAndLogs}
          onClearAllData={handleClearAllData}
          onExportData={handleExportData}
          onImportData={handleImportData}
        />
      )}

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

      {/* 管理員 PIN 碼驗證授權 Modal */}
      <AdminAuthModal
        isOpen={showAdminAuth}
        onClose={() => {
          setShowAdminAuth(false);
          setPendingAdminAction(null);
        }}
        onSuccess={handleAdminAuthSuccess}
      />
    </div>
  );
}
