import {
  cleanEmailSubject,
  normalizeSubjectForMatching,
  isReplyEmail,
  extractLatestReplyContent,
  extractStatusCommand,
  parseMentionsAndPriority,
  calculateDueDate,
  checkSenderWhitelist,
  parseIncomingEmail,
} from './src/lib/email-parser.ts';

const mockRoster = [
  {
    id: 'mem-1',
    name: '建宏',
    email: 'jh@company.com',
    aliases: ['建宏', 'JH', 'jianhong'],
    status: 'ACTIVE',
    effectiveLoad: 3,
    assignedCount: 10,
    completedCount: 8,
    currentActiveTasks: 2,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mem-2',
    name: 'Alex',
    email: 'alex@company.com',
    aliases: ['Alex', 'alexander'],
    status: 'ACTIVE',
    effectiveLoad: 2,
    assignedCount: 8,
    completedCount: 7,
    currentActiveTasks: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mem-3',
    name: '林書豪',
    email: 'jeremy@company.com',
    aliases: ['書豪', 'Jeremy'],
    status: 'ON_LEAVE',
    effectiveLoad: 5,
    assignedCount: 5,
    completedCount: 5,
    currentActiveTasks: 0,
    updatedAt: new Date().toISOString(),
  },
];

const mockWhitelist = [
  {
    id: 'wl-1',
    pattern: '*@vip-client.com',
    description: 'VIP Clients',
    addedBy: 'Admin',
    createdAt: new Date().toISOString(),
    enabled: true,
  },
  {
    id: 'wl-2',
    pattern: 'service@partner-tech.org',
    description: 'Partner',
    addedBy: 'Admin',
    createdAt: new Date().toISOString(),
    enabled: true,
  },
];

let passCount = 0;
let failCount = 0;

function assert(cond, name) {
  if (cond) {
    console.log(`✅ PASS: ${name}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${name}`);
    failCount++;
  }
}

console.log('=== 1. 測試主旨前綴剝離與 RFC 2047 解碼 (cleanEmailSubject) ===');
assert(cleanEmailSubject('Re: Fwd: 生產系統異常') === '生產系統異常', 'Strip Re: Fwd:');
assert(cleanEmailSubject('回覆: [緊急] 伺服器告警') === '[緊急] 伺服器告警', 'Strip Chinese 回覆:');
assert(cleanEmailSubject('=?UTF-8?B?56ys5LiJ5qyh6Kej5p6Q77yM5pyJ6L6m5rOV5ZeO?=') === '第三次解析，有辦法嗎', 'Decode RFC 2047 Base64 subject');

console.log('\n=== 1.5. 測試 RFC 2047 與 Base64 內文解析指定派單 ===');
const base64Body = Buffer.from('請 @建宏 P1 協助排查伺服器異常，感謝！').toString('base64');
const parsedMimeEmail = parseIncomingEmail({
  from: 'client@vip-client.com',
  subject: '=?UTF-8?B?56ys5LiJ5qyh6Kej5p6Q77yM5pyJ6L6m5rOV5ZeO?=',
  body: base64Body,
}, mockRoster);
assert(parsedMimeEmail.cleanSubject === '第三次解析，有辦法嗎', 'Subject correctly decoded from base64');
assert(parsedMimeEmail.mentions.length === 1 && parsedMimeEmail.mentions[0].member.name === '建宏', 'Successfully detected @建宏 from decoded base64 body');
assert(parsedMimeEmail.mentions[0].priority === 'P1', 'Successfully detected P1 priority from decoded base64 body');

console.log('\n=== 2. 測試歷史引文截斷 (extractLatestReplyContent) ===');
const emailWithQuotes = `這是最新回覆內容，請注意。

On Mon, Oct 17, 2026 at 10:00 AM Client wrote:
> 這是第一行引文
> 這是第二行引文
-----Original Message-----
From: old@client.com
舊內容...`;
const cleanContent = extractLatestReplyContent(emailWithQuotes);
assert(cleanContent === '這是最新回覆內容，請注意。', 'Strip On ... wrote and Original Message');

console.log('\n=== 3. 測試多重點名與優先級解析 (parseMentionsAndPriority) ===');
const mentionText = '請 @建宏 P1 處理 API 錯誤，並請 @Alex P2 檢查報表。';
const { mentions } = parseMentionsAndPriority(mentionText, mockRoster);
assert(mentions.length === 2, 'Detected 2 mentions');
assert(mentions[0].member.name === '建宏' && mentions[0].priority === 'P1', '@建宏 P1');
assert(mentions[1].member.name === 'Alex' && mentions[1].priority === 'P2', '@Alex P2');

console.log('\n=== 4. 測試預設優先級 P3 (未標註時) ===');
const defaultMentionText = '請 @建宏 協助追蹤進度';
const resDefault = parseMentionsAndPriority(defaultMentionText, mockRoster);
assert(resDefault.mentions[0].priority === 'P3', 'Default P3 when unmentioned');

console.log('\n=== 5. 測試狀態回報指令抽取 (extractStatusCommand) ===');
assert(extractStatusCommand('問題已經修復了。 #已處理') === 'RESOLVED', '#已處理 -> RESOLVED');
assert(extractStatusCommand('目前排查中 #處理中') === 'IN_PROGRESS', '#處理中 -> IN_PROGRESS');
assert(extractStatusCommand('此工單完成確認 #結案') === 'CLOSED', '#結案 -> CLOSED');

console.log('\n=== 6. 測試寄件者白名單檢驗 (checkSenderWhitelist) ===');
assert(checkSenderWhitelist('alice@vip-client.com', mockWhitelist, mockRoster).allowed === true, 'Wildcard *@vip-client.com allowed');
assert(checkSenderWhitelist('service@partner-tech.org', mockWhitelist, mockRoster).allowed === true, 'Exact service@partner-tech.org allowed');
assert(checkSenderWhitelist('jh@company.com', mockWhitelist, mockRoster).allowed === true, 'Team member allowed to reply');
assert(checkSenderWhitelist('spammer@malicious.com', mockWhitelist, mockRoster).allowed === false, 'Non-whitelisted blocked');

console.log('\n=== 7. 測試 SLA 到期時間計算 (calculateDueDate) ===');
const baseTime = '2026-10-17T09:00:00.000Z';
const p1Due = calculateDueDate('P1', baseTime);
const p2Due = calculateDueDate('P2', baseTime);
const p5Due = calculateDueDate('P5', baseTime);
assert(p5Due === null, 'P5 has no dueAt (null)');
const d = new Date(p1Due);
assert(d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59, 'P1 ends at local 23:59:59');

console.log('\n=== 8. 測試銷假動態平衡邏輯 ===');
// 當前在線有效負載: 建宏 3, Alex 2 -> 最低為 2
// 林書豪銷假時: effectiveLoad = Math.max(0, 2 - 1) = 1
const lowestActive = Math.min(...mockRoster.filter(m => m.status === 'ACTIVE').map(m => m.effectiveLoad));
const resumedLoad = Math.max(0, lowestActive - 1);
assert(resumedLoad === 1, 'Resumed load equals (lowestActive - 1)');

console.log('\n=== 9. 測試標準化主旨精準比對 (normalizeSubjectForMatching) ===');
const s1 = 'Re: [外部] [TICK-20261017-001] [P2] 請 @建宏 處理登入問題';
const s2 = '請 @建宏 處理登入問題';
assert(normalizeSubjectForMatching(s1) === normalizeSubjectForMatching(s2), 'Re: + [外部] + [TICK-...] + [P2] normalizes identical to original subject');

console.log('\n=== 10. 測試自然語言與括弧狀態指令抽取 (extractStatusCommand) ===');
assert(extractStatusCommand('這問題已結案，感謝！') === 'CLOSED', '自然語言 "已結案" -> CLOSED');
assert(extractStatusCommand('[已結案]') === 'CLOSED', '中括號 "[已結案]" -> CLOSED');
assert(extractStatusCommand('【已處理】已更換伺服器') === 'RESOLVED', '全形中括號 "【已處理】" -> RESOLVED');
assert(extractStatusCommand('處理中，正在看') === 'IN_PROGRESS', '自然語言 "處理中" -> IN_PROGRESS');

console.log('\n=== 11. 核心情境測試：回覆信件主旨含 @人 且內文含 #已結案 ===');
const replyEmail = parseIncomingEmail({
  from: 'jh@company.com',
  subject: 'Re: [外部] 請 @建宏 處理登入問題',
  body: '#已結案\n已經重啟服務修復。',
}, mockRoster);
assert(replyEmail.isReply === true, 'Correctly identified as isReply=true');
assert(replyEmail.statusCommand === 'CLOSED', 'Extracted statusCommand=CLOSED');
assert(replyEmail.bodyMentions.length === 0, 'No body mentions (human did not type new @ in reply)');
assert(replyEmail.subjectMentions.length === 1 && replyEmail.subjectMentions[0].member.name === '建宏', 'Detected @建宏 in subject mentions');

console.log(`\n========================================`);
console.log(`測試結果總結: 通過 ${passCount} 項, 失敗 ${failCount} 項`);
console.log(`========================================`);

if (failCount > 0) {
  process.exit(1);
}
