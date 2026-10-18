import { NextRequest, NextResponse } from 'next/server';
import { getSystemState, updateSystemState } from '@/lib/storage';
import { TeamMember, MemberStatus } from '@/types/store';
import { verifyAdminRequest, DEFAULT_ADMIN_PIN } from '@/lib/auth';

export async function GET() {
  try {
    const state = await getSystemState();
    return NextResponse.json({
      roster: state.roster,
      crownHolderId: state.crownHolderId,
      dispatchStrategy: state.dispatchStrategy || 'DOUBLE_INTERLEAVED',
      totalMembers: state.roster.length,
      activeMembersCount: state.roster.filter((m) => m.status === 'ACTIVE').length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const state = await getSystemState();
    const configuredPin = state.adminPin || process.env.ADMIN_PIN || DEFAULT_ADMIN_PIN;

    if (!verifyAdminRequest(req, configuredPin)) {
      return NextResponse.json(
        { error: '操作未授權：需要有效的管理員密鑰 (Admin PIN) 才能新增成員' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, email, aliases = [] } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const { result } = await updateSystemState((s) => {
      // 避免重複信箱
      if (s.roster.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('Member with this email already exists');
      }

      // 新進成員負載初始對齊當前在線最低值
      const activeMembers = s.roster.filter((m) => m.status === 'ACTIVE');
      const minLoad = activeMembers.length > 0 ? Math.min(...activeMembers.map((m) => m.effectiveLoad)) : 0;

      const newMember: TeamMember = {
        id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: name.trim(),
        email: email.trim(),
        aliases: Array.isArray(aliases) ? aliases.map((a: string) => a.trim()).filter(Boolean) : [name.trim()],
        status: 'ACTIVE',
        effectiveLoad: minLoad,
        assignedCount: 0,
        completedCount: 0,
        currentActiveTasks: 0,
        catchUpQuota: 0,
        updatedAt: new Date().toISOString(),
      };

      s.roster.push(newMember);
      return newMember;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, name, email, aliases, effectiveLoad } = body;

    if (!id) {
      return NextResponse.json({ error: 'Member id is required' }, { status: 400 });
    }

    const state = await getSystemState();
    const configuredPin = state.adminPin || process.env.ADMIN_PIN || DEFAULT_ADMIN_PIN;

    // 修改成員姓名、信箱、別名、或負載權重需管理員權限
    const isEditingSensitive = Boolean(name || email || aliases || typeof effectiveLoad === 'number');
    if (isEditingSensitive && !verifyAdminRequest(req, configuredPin)) {
      return NextResponse.json(
        { error: '操作未授權：需要有效的管理員密鑰 (Admin PIN) 才能修改成員資料或手動調整負載' },
        { status: 403 }
      );
    }

    const { result } = await updateSystemState((s) => {
      const member = s.roster.find((m) => m.id === id);
      if (!member) {
        throw new Error('Member not found');
      }

      // 銷假上班智慧動態平衡
      if (status && status !== member.status) {
        const targetStatus = status as MemberStatus;
        if (member.status === 'ON_LEAVE' && targetStatus === 'ACTIVE') {
          const strategy = s.dispatchStrategy || 'DOUBLE_INTERLEAVED';
          const activeOthers = s.roster.filter((m) => m.id !== member.id && m.status === 'ACTIVE');
          const lowestActiveLoad = activeOthers.length > 0 ? Math.min(...activeOthers.map((m) => m.effectiveLoad)) : 0;

          if (strategy === 'DOUBLE_INTERLEAVED') {
            // 【雙倍穿插補償模式】：計算請假落後量，以 40% 折扣計算補償額度 (最少 1 張，最多 6 張)
            const avgAssigned = activeOthers.length > 0
              ? activeOthers.reduce((sum, m) => sum + m.assignedCount, 0) / activeOthers.length
              : 0;
            const deficit = Math.max(0, Math.round(avgAssigned - member.assignedCount));
            const quota = Math.min(Math.max(1, Math.round(deficit * 0.4)), 6);
            member.catchUpQuota = quota;
            member.effectiveLoad = lowestActiveLoad; // 與在線最低值平手，由 0.5 步長自然產生 2:1 穿插
          } else if (strategy === 'SMOOTH_RESET') {
            // 【平滑保護模式】：只接 1 張破冰
            member.catchUpQuota = 0;
            member.effectiveLoad = Math.max(0, lowestActiveLoad - 1);
          } else {
            // 【極致清閒模式】：重置負載
            member.catchUpQuota = 0;
            member.effectiveLoad = 0;
          }
        }
        member.status = targetStatus;
      }

      if (name) member.name = name.trim();
      if (email) member.email = email.trim();
      if (aliases && Array.isArray(aliases)) {
        member.aliases = aliases.map((a: string) => a.trim()).filter(Boolean);
      }
      if (typeof effectiveLoad === 'number') {
        member.effectiveLoad = Math.max(0, effectiveLoad);
      }

      member.updatedAt = new Date().toISOString();
      return member;
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const state = await getSystemState();
    const configuredPin = state.adminPin || process.env.ADMIN_PIN || DEFAULT_ADMIN_PIN;

    if (!verifyAdminRequest(req, configuredPin)) {
      return NextResponse.json(
        { error: '操作未授權：需要有效的管理員密鑰 (Admin PIN) 才能刪除成員' },
        { status: 403 }
      );
    }

    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Member id is required' }, { status: 400 });
    }

    const { result } = await updateSystemState((s) => {
      const idx = s.roster.findIndex((m) => m.id === id);
      if (idx === -1) {
        throw new Error('Member not found');
      }
      const [removed] = s.roster.splice(idx, 1);

      // 若刪除的是當前皇冠得主，轉移給第一位在線成員
      if (s.crownHolderId === id) {
        const nextActive = s.roster.find((m) => m.status === 'ACTIVE');
        s.crownHolderId = nextActive ? nextActive.id : null;
      }

      return { success: true, removedMember: removed };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
