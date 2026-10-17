import { NextRequest, NextResponse } from 'next/server';
import { updateSystemState } from '@/lib/storage';
import { calculateDueDate } from '@/lib/email-parser';
import { Priority, TaskStatus, TaskHistoryItem } from '@/types/store';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { state } = await updateSystemState((s) => s);
    const task = state.tasks.find((t) => t.id === id || t.ticketNumber === id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const now = new Date().toISOString();

    const { result } = await updateSystemState((state) => {
      const taskIndex = state.tasks.findIndex((t) => t.id === id || t.ticketNumber === id);
      if (taskIndex === -1) {
        throw new Error('Task not found');
      }
      const task = state.tasks[taskIndex];

      // 1. 轉派機制 (Reassign)
      if (body.action === 'REASSIGN' && body.newAssigneeId) {
        const oldAssigneeId = task.assigneeId;
        const oldAssigneeName = task.assigneeName;
        const newAssignee = state.roster.find((m) => m.id === body.newAssigneeId);

        if (!newAssignee) {
          throw new Error('New assignee not found in roster');
        }

        // 調整舊人員統計
        const oldMember = state.roster.find((m) => m.id === oldAssigneeId);
        if (oldMember) {
          oldMember.assignedCount = Math.max(0, oldMember.assignedCount - 1);
          oldMember.effectiveLoad = Math.max(0, oldMember.effectiveLoad - 1);
          if (task.status === 'PENDING' || task.status === 'IN_PROGRESS') {
            oldMember.currentActiveTasks = Math.max(0, oldMember.currentActiveTasks - 1);
          }
          oldMember.updatedAt = now;
        }

        // 調整新受派人統計與接手皇冠 👑
        newAssignee.assignedCount += 1;
        newAssignee.effectiveLoad += 1;
        if (task.status === 'PENDING' || task.status === 'IN_PROGRESS') {
          newAssignee.currentActiveTasks += 1;
        }
        newAssignee.updatedAt = now;
        state.crownHolderId = newAssignee.id;

        // 更新工單受派資訊
        task.assigneeId = newAssignee.id;
        task.assigneeName = newAssignee.name;
        task.assigneeEmail = newAssignee.email;
        task.updatedAt = now;

        const reason = body.reason?.trim() ? ` (轉派原因: ${body.reason.trim()})` : '';
        const historyItem: TaskHistoryItem = {
          id: `hist-${Date.now()}`,
          timestamp: now,
          action: 'REASSIGNED',
          actor: body.actor || 'WEB_USER',
          details: `任務由 [${oldAssigneeName}] 轉派給 [${newAssignee.name}]，並由其接手皇冠 👑${reason}`,
        };
        task.history.unshift(historyItem);

        return task;
      }

      // 2. 狀態變更 (Status Change)
      if (body.status && body.status !== task.status) {
        const oldStatus = task.status;
        const newStatus = body.status as TaskStatus;
        task.status = newStatus;
        task.updatedAt = now;

        const member = state.roster.find((m) => m.id === task.assigneeId);
        if (member) {
          if (
            (oldStatus === 'PENDING' || oldStatus === 'IN_PROGRESS') &&
            (newStatus === 'RESOLVED' || newStatus === 'CLOSED')
          ) {
            member.currentActiveTasks = Math.max(0, member.currentActiveTasks - 1);
            if (newStatus === 'CLOSED') {
              member.completedCount += 1;
            }
          } else if (
            (oldStatus === 'RESOLVED' || oldStatus === 'CLOSED') &&
            (newStatus === 'PENDING' || newStatus === 'IN_PROGRESS')
          ) {
            member.currentActiveTasks += 1;
            if (oldStatus === 'CLOSED') {
              member.completedCount = Math.max(0, member.completedCount - 1);
            }
          }
          member.updatedAt = now;
        }

        const historyItem: TaskHistoryItem = {
          id: `hist-${Date.now()}`,
          timestamp: now,
          action: 'STATUS_CHANGE',
          actor: body.actor || 'WEB_USER',
          details: `狀態由 [${oldStatus}] 變更為 [${newStatus}]`,
        };
        task.history.unshift(historyItem);
      }

      // 3. 優先順序變更 (Priority Change)
      if (body.priority && body.priority !== task.priority) {
        const oldP = task.priority;
        const newP = body.priority as Priority;
        task.priority = newP;
        task.dueAt = calculateDueDate(newP, task.receivedAt || task.createdAt);
        task.updatedAt = now;

        const historyItem: TaskHistoryItem = {
          id: `hist-${Date.now()}`,
          timestamp: now,
          action: 'PRIORITY_CHANGE',
          actor: body.actor || 'WEB_USER',
          details: `優先順序由 [${oldP}] 調整為 [${newP}]，SLA 重新計算`,
        };
        task.history.unshift(historyItem);
      }

      // 4. 備註更新
      if (body.notes !== undefined) {
        task.notes = body.notes;
        task.updatedAt = now;
      }

      return task;
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { result } = await updateSystemState((state) => {
      const idx = state.tasks.findIndex((t) => t.id === id || t.ticketNumber === id);
      if (idx === -1) {
        throw new Error('Task not found');
      }
      const [removed] = state.tasks.splice(idx, 1);
      // 調整該人員當前活躍數
      const member = state.roster.find((m) => m.id === removed.assigneeId);
      if (member && (removed.status === 'PENDING' || removed.status === 'IN_PROGRESS')) {
        member.currentActiveTasks = Math.max(0, member.currentActiveTasks - 1);
      }
      return { success: true, removedId: removed.id };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
