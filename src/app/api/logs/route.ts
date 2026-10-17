import { NextRequest, NextResponse } from 'next/server';
import { getSystemState, updateSystemState, getDefaultSystemState } from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const state = await getSystemState();
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let logs = [...state.mailLogs];
    if (action && action !== 'ALL') {
      logs = logs.filter((l) => l.action === action);
    }

    return NextResponse.json({
      logs: logs.slice(0, limit),
      total: logs.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 支援清空或重設為種子資料
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'RESET_TO_SEED') {
      const defaultState = getDefaultSystemState();
      await updateSystemState((state) => {
        Object.assign(state, defaultState);
        return { message: 'Reset to seed state completed' };
      });
      return NextResponse.json({ success: true, message: 'System state reset to default' });
    }

    if (body.action === 'CLEAR_LOGS') {
      await updateSystemState((state) => {
        state.mailLogs = [];
        return { message: 'Logs cleared' };
      });
      return NextResponse.json({ success: true, message: 'Mail logs cleared' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
