import { NextRequest, NextResponse } from 'next/server';
import { getSystemState, updateSystemState } from '@/lib/storage';
import { calculateDueDate } from '@/lib/email-parser';
import { generateTicketNumber } from '@/lib/utils';
import { Task } from '@/types/store';

export async function GET(req: NextRequest) {
  try {
    const state = await getSystemState();
    const { searchParams } = req.nextUrl;
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assigneeId = searchParams.get('assigneeId');
    const search = searchParams.get('q')?.toLowerCase();

    let tasks = [...state.tasks];

    if (status && status !== 'ALL') {
      tasks = tasks.filter((t) => t.status === status);
    }
    if (priority && priority !== 'ALL') {
      tasks = tasks.filter((t) => t.priority === priority);
    }
    if (assigneeId && assigneeId !== 'ALL') {
      tasks = tasks.filter((t) => t.assigneeId === assigneeId);
    }
    if (search) {
      tasks = tasks.filter(
        (t) =>
          t.ticketNumber.toLowerCase().includes(search) ||
          t.cleanSubject.toLowerCase().includes(search) ||
          t.assigneeName.toLowerCase().includes(search) ||
          t.senderEmail.toLowerCase().includes(search) ||
          t.cleanContent.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      tasks,
      total: tasks.length,
      crownHolderId: state.crownHolderId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject, content, assigneeId, priority = 'P3', senderName = 'Manual', senderEmail = 'manual@internal.corp' } = body;

    if (!subject || !assigneeId) {
      return NextResponse.json({ error: 'Subject and assigneeId are required' }, { status: 400 });
    }

    const { result } = await updateSystemState((state) => {
      const assignee = state.roster.find((m) => m.id === assigneeId);
      if (!assignee) {
        throw new Error('Assignee not found');
      }

      const seq = state.tasks.length + 1;
      const ticketNumber = generateTicketNumber(seq);
      const now = new Date().toISOString();
      const dueAt = calculateDueDate(priority, now);

      assignee.assignedCount += 1;
      assignee.effectiveLoad += 1;
      assignee.currentActiveTasks += 1;
      assignee.updatedAt = now;
      state.crownHolderId = assignee.id;

      const newTask: Task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        ticketNumber,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        assigneeEmail: assignee.email,
        dispatchType: 'DIRECT',
        status: 'PENDING',
        priority,
        dueAt,
        mailSubject: subject,
        cleanSubject: subject,
        senderName,
        senderEmail,
        receivedAt: now,
        cleanContent: content || '',
        mentionedMembers: [assignee.name],
        history: [
          {
            id: `hist-${Date.now()}`,
            timestamp: now,
            action: 'CREATED',
            actor: 'WEB_USER',
            details: `網頁端手動建立工單，指定受派人 ${assignee.name} (${priority})`,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      state.tasks.unshift(newTask);
      return newTask;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
