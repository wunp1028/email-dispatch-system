import { NextRequest, NextResponse } from 'next/server';
import { getSystemState, updateSystemState } from '@/lib/storage';
import { TeamMember, MemberStatus } from '@/types/store';

export async function GET() {
  try {
    const state = await getSystemState();
    return NextResponse.json({
      roster: state.roster,
      crownHolderId: state.crownHolderId,
      totalMembers: state.roster.length,
      activeMembersCount: state.roster.filter((m) => m.status === 'ACTIVE').length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, aliases = [] } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const { result } = await updateSystemState((state) => {
      // 避免重複信箱
      if (state.roster.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('Member with this email already exists');
      }

      // 新進成員負載初始對齊當前在線最低值
      const activeMembers = state.roster.filter((m) => m.status === 'ACTIVE');
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
        updatedAt: new Date().toISOString(),
      };

      state.roster.push(newMember);
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

    const { result } = await updateSystemState((state) => {
      const member = state.roster.find((m) => m.id === id);
      if (!member) {
        throw new Error('Member not found');
      }

      // 銷假智慧平衡邏輯 (核心規格要求):
      // 當人員由休假(ON_LEAVE)銷假恢復上班(ACTIVE)時，系統自動將其 effectiveLoad 對齊為 (在線最低值 - 1)
      if (status && status !== member.status) {
        const targetStatus = status as MemberStatus;
        if (member.status === 'ON_LEAVE' && targetStatus === 'ACTIVE') {
          const activeOthers = state.roster.filter((m) => m.id !== member.id && m.status === 'ACTIVE');
          if (activeOthers.length > 0) {
            const lowestActiveLoad = Math.min(...activeOthers.map((m) => m.effectiveLoad));
            member.effectiveLoad = Math.max(0, lowestActiveLoad - 1);
          } else {
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
