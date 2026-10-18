import { NextRequest, NextResponse } from 'next/server';
import { getSystemState, updateSystemState, getDefaultSystemState } from '@/lib/storage';
import { SystemState, DispatchStrategy } from '@/types/store';
import { verifyAdminRequest, DEFAULT_ADMIN_PIN } from '@/lib/auth';

// 取得完整系統 JSON 備份或當前設定
export async function GET() {
  try {
    const state = await getSystemState();
    return NextResponse.json(state);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 執行全局資料維護操作 (需管理員權限)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, importedState, strategy, pin } = body;
    const state = await getSystemState();
    const configuredPin = state.adminPin || process.env.ADMIN_PIN || DEFAULT_ADMIN_PIN;

    // 0. 輕量 PIN 驗證端點
    if (action === 'VERIFY_PIN') {
      const inputPin = pin || req.headers.get('x-admin-pin');
      if (inputPin === configuredPin) {
        return NextResponse.json({ success: true, message: '管理員授權成功' });
      }
      return NextResponse.json({ error: '管理員密碼不正確' }, { status: 401 });
    }

    // 驗證管理員授權
    const isAuthorized = verifyAdminRequest(req, configuredPin) || (pin && pin === configuredPin);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: '操作未授權：需要有效的管理員密鑰 (Admin PIN)' },
        { status: 403 }
      );
    }

    // 1. 切換派工輪值策略
    if (action === 'SET_DISPATCH_STRATEGY' && strategy) {
      const validStrategies: DispatchStrategy[] = ['DOUBLE_INTERLEAVED', 'SMOOTH_RESET', 'ACTIVE_LEAST'];
      if (!validStrategies.includes(strategy)) {
        return NextResponse.json({ error: '未知的派工策略類型' }, { status: 400 });
      }

      await updateSystemState((s) => {
        s.dispatchStrategy = strategy;
        return { message: '派工策略已更新' };
      });

      const strategyNames: Record<DispatchStrategy, string> = {
        DOUBLE_INTERLEAVED: '雙倍穿插補償模式',
        SMOOTH_RESET: '平滑保護模式',
        ACTIVE_LEAST: '極致清閒平衡模式',
      };

      return NextResponse.json({
        success: true,
        strategy,
        message: `系統派工策略已切換為：【${strategyNames[strategy as DispatchStrategy]}】`,
      });
    }

    // 2. 保留範例資料功能 (重設為初始示範資料)
    if (action === 'RESET_TO_SEED') {
      const defaultState = getDefaultSystemState();
      await updateSystemState((s) => {
        Object.assign(s, defaultState);
        return { message: '已恢復為預設範例資料' };
      });
      return NextResponse.json({ success: true, message: '系統已重設為官方預設範例資料' });
    }

    // 3. 清空全部工單與日誌 (保留人員名冊與白名單，重置負載)
    if (action === 'CLEAR_TASKS_LOGS') {
      await updateSystemState((s) => {
        s.tasks = [];
        s.mailLogs = [];
        s.roster.forEach((m) => {
          m.assignedCount = 0;
          m.completedCount = 0;
          m.currentActiveTasks = 0;
          m.effectiveLoad = 0;
          m.catchUpQuota = 0;
          m.updatedAt = new Date().toISOString();
        });
        const firstActive = s.roster.find((m) => m.status === 'ACTIVE');
        s.crownHolderId = firstActive ? firstActive.id : null;
        return { message: '所有工單與歷史日誌已清空' };
      });
      return NextResponse.json({ success: true, message: '所有工單與歷史日誌已全數清空，人員計數歸零！' });
    }

    // 4. 徹底清空全部資料 (包含工單、日誌、人員名冊、白名單全清空)
    if (action === 'CLEAR_ALL_DATA') {
      await updateSystemState((s) => {
        s.tasks = [];
        s.mailLogs = [];
        s.roster = [];
        s.whitelist = [];
        s.crownHolderId = null;
        return { message: '系統全部資料已徹底清空' };
      });
      return NextResponse.json({ success: true, message: '系統資料已徹底清空完畢！' });
    }

    // 5. 匯入 JSON 狀態檔案
    if (action === 'IMPORT_JSON' && importedState) {
      if (!Array.isArray(importedState.roster) || !Array.isArray(importedState.tasks)) {
        return NextResponse.json({ error: '無效的系統狀態 JSON 格式' }, { status: 400 });
      }

      await updateSystemState((s) => {
        Object.assign(s, importedState);
        return { message: '備份資料匯入成功' };
      });
      return NextResponse.json({ success: true, message: '備份 JSON 資料已成功還原！' });
    }

    return NextResponse.json({ error: '無效的資料維護指令' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
