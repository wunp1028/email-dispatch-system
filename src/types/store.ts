export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type MemberStatus = 'ACTIVE' | 'ON_LEAVE';

export type DispatchStrategy = 'DOUBLE_INTERLEAVED' | 'SMOOTH_RESET' | 'ACTIVE_LEAST';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  aliases: string[]; // 例如 ["建宏", "JH", "Alex"]
  status: MemberStatus;
  effectiveLoad: number; // 輪值有效負載權重
  assignedCount: number; // 累計總派發工單數
  completedCount: number; // 累計已結案/已處理數
  currentActiveTasks: number; // 當前處理中/待處理中的工單數
  catchUpQuota?: number; // 待償還補償單數 (用於雙倍穿插補償模式)
  avatar?: string;
  updatedAt: string;
}

export interface TaskHistoryItem {
  id: string;
  timestamp: string;
  action:
    | 'CREATED'
    | 'AUTO_ROSTER_ASSIGNED'
    | 'DIRECT_ASSIGNED'
    | 'REASSIGNED'
    | 'STATUS_CHANGE'
    | 'PRIORITY_CHANGE'
    | 'NOTE_UPDATED';
  actor: string; // "SYSTEM", 或是成員名稱/信箱
  details: string;
}

export interface Task {
  id: string;
  ticketNumber: string; // 例如: "TICK-20261017-001"
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  dispatchType: 'DIRECT' | 'AUTO_ROSTER'; // @指定 或 系統動態輪值
  status: TaskStatus;
  priority: Priority;
  dueAt: string | null; // ISO 格式，P5 為 null

  // Mail 元數據
  mailSubject: string; // 原始郵件主旨
  cleanSubject: string; // 去除 Re:/Fwd: 等前綴之純淨主旨
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  messageId?: string;
  inReplyTo?: string;

  // 內文
  cleanContent: string; // 剝離歷史引文後的最新一封純回覆內文
  rawSnippet?: string;

  // 標記與歷程
  mentionedMembers: string[]; // 內文中被 @ 的成員列表
  notes?: string;
  history: TaskHistoryItem[];

  createdAt: string;
  updatedAt: string;
}

export interface WhitelistRule {
  id: string;
  pattern: string; // 例如 "client@example.com" 或 "*@company.com"
  description: string;
  addedBy: string;
  createdAt: string;
  enabled: boolean;
}

export interface MailLog {
  id: string;
  timestamp: string;
  sender: string;
  subject: string;
  action: 'DISPATCHED' | 'UPDATED' | 'BLOCKED_NON_WHITELIST' | 'ERROR';
  details: string;
  ticketNumbers?: string[];
  rawSnippet?: string;
}

export interface SystemState {
  version: string;
  lastUpdated: string;
  crownHolderId: string | null; // 目前皇冠 👑 持有者（最新受派人）
  dispatchStrategy?: DispatchStrategy; // 當前輪值策略，預設 DOUBLE_INTERLEAVED
  adminPin?: string; // 管理員授權 PIN，預設 admin888
  roster: TeamMember[];
  tasks: Task[];
  whitelist: WhitelistRule[];
  mailLogs: MailLog[];
}
