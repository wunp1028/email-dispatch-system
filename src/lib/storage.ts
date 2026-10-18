import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { SystemState, TeamMember, WhitelistRule, Task, MailLog } from '@/types/store';

// 本地存儲路徑 (Fallback)
const LOCAL_DATA_DIR = path.join(process.cwd(), '.data');
const LOCAL_STATE_FILE = path.join(LOCAL_DATA_DIR, 'system_state.json');

// 初始預設種子資料
const INITIAL_ROSTER: TeamMember[] = [
  {
    id: 'mem-1',
    name: '建宏',
    email: 'jh@company.com',
    aliases: ['建宏', 'JH', 'jianhong', 'ken'],
    status: 'ACTIVE',
    effectiveLoad: 3,
    assignedCount: 12,
    completedCount: 10,
    currentActiveTasks: 2,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mem-2',
    name: 'Alex',
    email: 'alex@company.com',
    aliases: ['Alex', 'alexander', '艾利克斯'],
    status: 'ACTIVE',
    effectiveLoad: 2,
    assignedCount: 10,
    completedCount: 9,
    currentActiveTasks: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mem-3',
    name: '陳小美',
    email: 'may@company.com',
    aliases: ['小美', 'May', 'meichen', '陳小美'],
    status: 'ACTIVE',
    effectiveLoad: 4,
    assignedCount: 15,
    completedCount: 12,
    currentActiveTasks: 3,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mem-4',
    name: '林書豪',
    email: 'jeremy@company.com',
    aliases: ['書豪', 'Jeremy', 'jlin', '林書豪'],
    status: 'ON_LEAVE', // 預設休假，便於測試銷假動態平衡機制
    effectiveLoad: 5,
    assignedCount: 8,
    completedCount: 8,
    currentActiveTasks: 0,
    updatedAt: new Date().toISOString(),
  },
];

const INITIAL_WHITELIST: WhitelistRule[] = [
  {
    id: 'wl-1',
    pattern: '*@vip-client.com',
    description: '核心 VIP 客戶企業網域',
    addedBy: 'Admin',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    enabled: true,
  },
  {
    id: 'wl-2',
    pattern: 'service@partner-tech.org',
    description: '合作夥伴技術窗口信箱',
    addedBy: 'Admin',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    enabled: true,
  },
  {
    id: 'wl-3',
    pattern: '*@internal.corp',
    description: '內部集團各事業部郵件',
    addedBy: 'Admin',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    enabled: true,
  },
];

const INITIAL_TASKS: Task[] = [
  {
    id: 'task-init-1',
    ticketNumber: 'TICK-20261017-001',
    assigneeId: 'mem-2',
    assigneeName: 'Alex',
    assigneeEmail: 'alex@company.com',
    dispatchType: 'DIRECT',
    status: 'IN_PROGRESS',
    priority: 'P1',
    dueAt: new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
    mailSubject: '【緊急】生產伺服器 API 異常警告 - 請儘速排查',
    cleanSubject: '生產伺服器 API 異常警告 - 請儘速排查',
    senderName: 'David Lee',
    senderEmail: 'david@vip-client.com',
    receivedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    cleanContent: '剛剛監控發現端點回應異常，@Alex P1 請協助排查，謝謝！',
    mentionedMembers: ['Alex'],
    history: [
      {
        id: 'hist-1',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        action: 'DIRECT_ASSIGNED',
        actor: 'SYSTEM',
        details: '信件內文點名 @Alex P1，由系統指定建立工單',
      },
    ],
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'task-init-2',
    ticketNumber: 'TICK-20261017-002',
    assigneeId: 'mem-1',
    assigneeName: '建宏',
    assigneeEmail: 'jh@company.com',
    dispatchType: 'AUTO_ROSTER',
    status: 'PENDING',
    priority: 'P2',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    mailSubject: 'Re: 季度整合報告需求確認與時程詢問',
    cleanSubject: '季度整合報告需求確認與時程詢問',
    senderName: 'Emily Wang',
    senderEmail: 'emily@vip-client.com',
    receivedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    cleanContent: '請問 Q4 系統對接的時間表能否於明天提供？謝謝大家。',
    mentionedMembers: [],
    history: [
      {
        id: 'hist-2',
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
        action: 'AUTO_ROSTER_ASSIGNED',
        actor: 'SYSTEM',
        details: '未指定處理人員，由動態平衡輪值指派給在線負載最低者 建宏',
      },
    ],
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
];

const INITIAL_LOGS: MailLog[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    sender: 'david@vip-client.com',
    subject: '【緊急】生產伺服器 API 異常警告 - 請儘速排查',
    action: 'DISPATCHED',
    details: '白名單驗證通過，成功指定派發給 Alex (P1)',
    ticketNumbers: ['TICK-20261017-001'],
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
    sender: 'emily@vip-client.com',
    subject: 'Re: 季度整合報告需求確認與時程詢問',
    action: 'DISPATCHED',
    details: '白名單驗證通過，動態輪值指派給 建宏 (P2)',
    ticketNumbers: ['TICK-20261017-002'],
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
    sender: 'marketing@spammer-domain.net',
    subject: 'Promotion Discounts for you',
    action: 'BLOCKED_NON_WHITELIST',
    details: '寄件者不在白名單中，已安全攔截並忽略',
  },
];

export function getDefaultSystemState(): SystemState {
  return {
    version: '2.0',
    lastUpdated: new Date().toISOString(),
    crownHolderId: 'mem-2', // 預設 Alex
    dispatchStrategy: 'DOUBLE_INTERLEAVED',
    adminPin: 'admin888',
    roster: INITIAL_ROSTER,
    tasks: INITIAL_TASKS,
    whitelist: INITIAL_WHITELIST,
    mailLogs: INITIAL_LOGS,
  };
}

// 簡單的內存/異步排隊鎖，防止同進程並發讀寫互相覆蓋
let lockPromise: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const previousLock = lockPromise;
  let release: () => void;
  lockPromise = new Promise<void>((resolve) => {
    release = resolve;
  });

  try {
    await previousLock;
    return await fn();
  } finally {
    release!();
  }
}

export function cleanR2Config() {
  const rawAccountId = process.env.CF_R2_ACCOUNT_ID;
  const rawAccessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
  const rawSecretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
  const rawBucket = process.env.CF_R2_BUCKET;
  const key = process.env.CF_R2_KEY || 'system_state.json';

  if (!rawAccountId || !rawAccessKeyId || !rawSecretAccessKey || !rawBucket) {
    return null;
  }

  // 自動淨化 Account ID (去除可能誤貼的 https://、.r2.cloudflarestorage.com、引號與斜線)
  let accountId = rawAccountId.trim().replace(/^["']|["']$/g, '');
  accountId = accountId.replace(/^https?:\/\//i, '');
  accountId = accountId.replace(/\.r2\.cloudflarestorage\.com.*$/i, '');
  accountId = accountId.replace(/\/+$/g, '').trim();

  const accessKeyId = rawAccessKeyId.trim().replace(/^["']|["']$/g, '');
  const secretAccessKey = rawSecretAccessKey.trim().replace(/^["']|["']$/g, '');
  const bucket = rawBucket.trim().replace(/^["']|["']$/g, '');

  return { accountId, accessKeyId, secretAccessKey, bucket, key };
}

// 判斷是否設定了 Cloudflare R2
function getR2Client(): { client: S3Client; bucket: string; key: string } | null {
  const conf = cleanR2Config();
  if (conf) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${conf.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: conf.accessKeyId,
        secretAccessKey: conf.secretAccessKey,
      },
    });
    return { client, bucket: conf.bucket, key: conf.key };
  }
  return null;
}

// 判斷是否設定了 Cloudflare KV REST API
function getKVConfig(): { accountId: string; namespaceId: string; token: string; key: string } | null {
  const accountId = process.env.CF_KV_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  const token = process.env.CF_KV_API_TOKEN;
  const key = process.env.CF_KV_KEY || 'system_state';

  if (accountId && namespaceId && token) {
    return { accountId, namespaceId, token, key };
  }
  return null;
}

// 核心讀取函數 (自動切換 R2 -> KV -> 本地檔案)
export async function getSystemState(): Promise<SystemState> {
  // 1. 嘗試 Cloudflare R2
  const r2 = getR2Client();
  if (r2) {
    try {
      const response = await r2.client.send(
        new GetObjectCommand({
          Bucket: r2.bucket,
          Key: r2.key,
        })
      );
      if (response.Body) {
        const bodyStr = await response.Body.transformToString();
        return JSON.parse(bodyStr) as SystemState;
      }
    } catch (err: any) {
      if (err.name !== 'NoSuchKey') {
        console.warn('[Storage] Read from R2 failed, falling back:', err.message);
      }
    }
  }

  // 2. 嘗試 Cloudflare KV REST API
  const kv = getKVConfig();
  if (kv) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${kv.accountId}/storage/kv/namespaces/${kv.namespaceId}/values/${kv.key}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${kv.token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        return data as SystemState;
      }
    } catch (err: any) {
      console.warn('[Storage] Read from KV failed, falling back:', err.message);
    }
  }

  // 3. Fallback: 本地檔案讀取
  try {
    if (fs.existsSync(LOCAL_STATE_FILE)) {
      const fileData = fs.readFileSync(LOCAL_STATE_FILE, 'utf-8');
      if (fileData.trim()) {
        return JSON.parse(fileData) as SystemState;
      }
    }
  } catch (err: any) {
    console.error('[Storage] Read local file error:', err.message);
  }

  // 4. 若皆無資料，返回初始預設種子並落盤
  const defaultState = getDefaultSystemState();
  await saveSystemState(defaultState);
  return defaultState;
}

// 核心保存函數 (自動同步至 R2 / KV / 本地檔案)
export async function saveSystemState(state: SystemState): Promise<void> {
  state.lastUpdated = new Date().toISOString();
  const serialized = JSON.stringify(state, null, 2);

  // 1. 若配置了 Cloudflare R2，寫入 R2
  const r2 = getR2Client();
  if (r2) {
    try {
      await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: r2.key,
          Body: serialized,
          ContentType: 'application/json',
        })
      );
    } catch (err: any) {
      console.error('[Storage] Save to Cloudflare R2 failed:', err.message);
    }
  }

  // 2. 若配置了 Cloudflare KV，寫入 KV
  const kv = getKVConfig();
  if (kv) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${kv.accountId}/storage/kv/namespaces/${kv.namespaceId}/values/${kv.key}`;
      await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${kv.token}`,
          'Content-Type': 'application/json',
        },
        body: serialized,
      });
    } catch (err: any) {
      console.error('[Storage] Save to Cloudflare KV failed:', err.message);
    }
  }

  // 3. 本地檔案持久化 (確保本地目錄存在並原子寫入)
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    const tempFile = `${LOCAL_STATE_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, serialized, 'utf-8');
    fs.renameSync(tempFile, LOCAL_STATE_FILE);
  } catch (err: any) {
    console.error('[Storage] Save to local file failed:', err.message);
  }
}

// 安全更新狀態（提供原子排隊保證）
export async function updateSystemState<T>(
  mutator: (state: SystemState) => T | Promise<T>
): Promise<{ result: T; state: SystemState }> {
  return withLock(async () => {
    const currentState = await getSystemState();
    const result = await mutator(currentState);
    await saveSystemState(currentState);
    return { result, state: currentState };
  });
}
