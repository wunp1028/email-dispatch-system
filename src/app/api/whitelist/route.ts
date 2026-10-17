import { NextRequest, NextResponse } from 'next/server';
import { getSystemState, updateSystemState } from '@/lib/storage';
import { WhitelistRule } from '@/types/store';

export async function GET() {
  try {
    const state = await getSystemState();
    return NextResponse.json({
      whitelist: state.whitelist,
      total: state.whitelist.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pattern, description = '', addedBy = 'Admin' } = body;

    if (!pattern || !pattern.trim()) {
      return NextResponse.json({ error: 'Pattern is required (e.g. client@example.com or *@domain.com)' }, { status: 400 });
    }

    const cleanPattern = pattern.trim();

    const { result } = await updateSystemState((state) => {
      // 避免重複規則
      if (state.whitelist.some((w) => w.pattern.toLowerCase() === cleanPattern.toLowerCase())) {
        throw new Error('Rule with this pattern already exists');
      }

      const newRule: WhitelistRule = {
        id: `wl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        pattern: cleanPattern,
        description: description.trim(),
        addedBy,
        createdAt: new Date().toISOString(),
        enabled: true,
      };

      state.whitelist.unshift(newRule);
      return newRule;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, enabled, description, pattern } = body;

    if (!id) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    }

    const { result } = await updateSystemState((state) => {
      const rule = state.whitelist.find((w) => w.id === id);
      if (!rule) {
        throw new Error('Rule not found');
      }

      if (typeof enabled === 'boolean') rule.enabled = enabled;
      if (typeof description === 'string') rule.description = description.trim();
      if (typeof pattern === 'string') rule.pattern = pattern.trim();

      return rule;
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Rule id is required in query parameters' }, { status: 400 });
    }

    const { result } = await updateSystemState((state) => {
      const idx = state.whitelist.findIndex((w) => w.id === id);
      if (idx === -1) {
        throw new Error('Rule not found');
      }
      const [removed] = state.whitelist.splice(idx, 1);
      return { success: true, removedRule: removed };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
