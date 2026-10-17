import { NextRequest, NextResponse } from 'next/server';
import { getSystemState, updateSystemState, getDefaultSystemState } from '@/lib/storage';
import { SystemState } from '@/types/store';

// 取得完整系統 JSON 備份
export async function GET() {
  try {
    const state = await getSystemState();
    return NextResponse.json(state);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 執行全局資料維護操作
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, importedState } = body;

    // 1. 保留範例資料功能 (重設為初始示範資料)
    if (action === 'RESET_TO_SEED') {
      const defaultState = getDefaultSystemState();
      await updateSystemState((state) => {
        Object.assign(state, defaultState);
        return { message: '已恢復為預設範例資料' };
      });
      return NextResponse.json({ success: true, message: '系統已重設為官方預設範例資料' });
    }

    // 2. 清空全部工單與日誌 (保留人員名冊與白名單，重置負載)
    if (action === 'CLEAR_TASKS_LOGS') {
      await updateSystemState((state) => {
        state.tasks = [];
        state.mailLogs = [];
        state.roster.forEach((m) => {
          m.assignedCount = 0;
          m.completedCount = 0;
          m.currentActiveTasks = 0;
          m.effectiveLoad = 0;
          m.updatedAt = new Date().toISOString();
        });
        const firstActive = state.roster.find((m) => m.status === 'ACTIVE');
        state.crownHolderId = firstActive ? firstActive.id : null;
        return { message: '所有工單與歷史日誌已清空' };
      });
      return NextResponse.json({ success: true, message: '所有工單與歷史日誌已全數清空，人員計數歸零！' });
    }

    // 3. 徹底清空全部資料 (包含工單、日誌、人員名冊、白名單全清空)
    if (action === 'CLEAR_ALL_DATA') {
      await updateSystemState((state) => {
        state.tasks = [];
        state.mailLogs = [];
        state.roster = [];
        state.whitelist = [];
        state.crownHolderId = null;
        return { message: '系統全部資料已徹底清空' };
      });
      return NextResponse.json({ success: true, message: '系統資料已徹底清空完畢！' });
    }

    // 4. 匯入 JSON 狀態檔案
    if (action === 'IMPORT_JSON' && importedState) {
      if (!Array.isArray(importedState.roster) || !Array.isArray(importedState.tasks)) {
        return NextResponse.json({ error: '無效的系統狀態 JSON 格式' }, { status: 400 });
      }

      await updateSystemState((state) => {
        Object.assign(state, importedState);
        return { message: '備份資料匯入成功' };
      });
      return NextResponse.json({ success: true, message: '備份 JSON 資料已成功還原！' });
    }

    return NextResponse.json({ error: '無效的資料維護指令' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
