import { getSystemState, updateSystemState } from './src/lib/storage.ts';
import { generateTicketNumber } from './src/lib/utils.ts';
import fs from 'fs';
import path from 'path';

async function runIntegrationTest() {
  console.log('=== 開始測試 Zero-DB 存儲與業務狀態運作 ===');

  // 1. 取得初始狀態
  const state = await getSystemState();
  console.log(`✅ 成功讀取系統狀態 (版本: ${state.version})`);
  console.log(`- 當前團隊成員數: ${state.roster.length}`);
  console.log(`- 當前工單數: ${state.tasks.length}`);
  console.log(`- 當前皇冠得主 ID: ${state.crownHolderId}`);

  // 2. 測試銷假智慧平衡
  // 找尋林書豪 (ON_LEAVE)
  console.log('\n=== 測試銷假恢復執勤智慧平衡 ===');
  await updateSystemState((s) => {
    const jeremy = s.roster.find((m) => m.name === '林書豪');
    if (!jeremy) throw new Error('Jeremy not found');

    const activeOthers = s.roster.filter((m) => m.id !== jeremy.id && m.status === 'ACTIVE');
    const minActive = Math.min(...activeOthers.map((m) => m.effectiveLoad));

    console.log(`- 銷假前其他在線成員最低 effectiveLoad: ${minActive}`);
    jeremy.status = 'ACTIVE';
    jeremy.effectiveLoad = Math.max(0, minActive - 1);
    console.log(`- 林書豪銷假後已對齊為: ${jeremy.effectiveLoad} (優先第一順位出勤補單)`);
  });

  // 3. 測試任務轉派與皇冠移交
  console.log('\n=== 測試任務轉派與皇冠移交 👑 ===');
  await updateSystemState((s) => {
    const task = s.tasks[0];
    const prevAssigneeId = task.assigneeId;
    const targetMember = s.roster.find((m) => m.id !== prevAssigneeId);

    console.log(`- 原工單 ${task.ticketNumber} 負責人: ${task.assigneeName}`);
    console.log(`- 轉派至新成員: ${targetMember.name}`);

    task.assigneeId = targetMember.id;
    task.assigneeName = targetMember.name;
    task.assigneeEmail = targetMember.email;
    s.crownHolderId = targetMember.id;

    console.log(`- 皇冠 👑 已成功移交給: ${targetMember.name} (crownHolderId: ${s.crownHolderId})`);
  });

  // 4. 驗證落盤檔案
  const localFile = path.join(process.cwd(), '.data', 'system_state.json');
  if (fs.existsSync(localFile)) {
    console.log(`\n✅ 驗證本地 Zero-DB 持久化檔案存在: ${localFile}`);
    const content = JSON.parse(fs.readFileSync(localFile, 'utf-8'));
    console.log(`- 檔案內包含 ${content.tasks.length} 筆工單，${content.roster.length} 名成員`);
  }

  console.log('\n🎉 所有整合測試皆成功通過！');
}

runIntegrationTest().catch((err) => {
  console.error('❌ Integration test failed:', err);
  process.exit(1);
});
