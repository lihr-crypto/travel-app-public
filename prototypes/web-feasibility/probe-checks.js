import { createBrowserStore, diagnoseState, fingerprint } from './browser-store';
import { commandsFor, PUBLIC_FIXTURES, seedTwoTrips } from './probe-commands';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

export async function runProbeChecks(onProgress) {
  const name = `travel-web-prototype-check-${crypto.randomUUID()}`;
  const store = createBrowserStore(name);
  const commands = commandsFor(store);
  const results = [];
  const step = async (name, operation) => {
    try {
      const detail = await operation();
      results.push({ name, status: 'PASS', detail: detail ?? '' });
    } catch (error) {
      results.push({ name, status: 'FAIL', detail: error.message });
    }
    onProgress([...results]);
  };

  await step('国内／海外各一趟：复用原 Create / Confirm Commands', async () => {
    const { state } = await seedTwoTrips(store);
    assert(state.trips.length === 2 && state.days.length === 4 && state.items.length === 4 && state.places.length === 4, 'Fixture row counts differ');
    assert(diagnoseState(state).length === 0, 'New reference problems');
    return '2 Trips / 4 Days / 4 Items / 4 Places；原 Application Commands';
  });
  await step('仅到达时间可保存：复用原 Update Command', async () => {
    const { state } = await store.read();
    const item = state.items[0];
    const { data } = await commands.updateItemDetails({ itemId: item.id, type: 'transport', title: '到达 · Web 验证', timeMode: 'exact', startDateTime: null, endDateTime: '2026-10-12T09:35', period: null, note: '中文备注 / 東京 / emoji ✈️', payload: { kind: 'transport', mode: 'flight', serviceNumber: 'TEST-123' } });
    assert(data.startDateTime === null && data.endDateTime === '2026-10-12T09:35', 'Arrival-only time changed');
    assert(data.note.includes('東京') && data.payload.serviceNumber === 'TEST-123', 'Fields lost');
  });
  await step('手动排序后修改备注：顺序保持', async () => {
    const { state } = await store.read();
    const rows = state.items.filter((x) => x.dayId === state.items[0].dayId).sort((a, b) => a.sortOrder - b.sortOrder);
    await commands.reorderItem({ itemId: rows[1].id, position: { type: 'start' } });
    const before = (await store.read()).state.items.filter((x) => x.dayId === rows[0].dayId).sort((a, b) => a.sortOrder - b.sortOrder);
    assert(before[0].id === rows[1].id, 'Reorder did not persist');
    await commands.updateItemDetails({ itemId: rows[1].id, note: '只改备注，保持手动顺序' });
    const after = (await store.read()).state.items.filter((x) => x.dayId === rows[0].dayId).sort((a, b) => a.sortOrder - b.sortOrder);
    assert(after.map((x) => x.id).join() === before.map((x) => x.id).join(), 'Note edit reset order');
  });
  await step('地点＋字段保存失败：全部回滚', async () => {
    const before = await store.read();
    const item = before.state.items[0];
    let insertedPlaces = 0;
    const tracking = commandsFor({ runInTransaction: (task) => store.runInTransaction((repositories) => task({
      ...repositories,
      places: { ...repositories.places, insert: async (row) => { insertedPlaces += 1; await repositories.places.insert(row); } },
    })) });
    let failed = false;
    try {
      await tracking.updateItemDetails({ itemId: item.id, title: '应回滚名称', placeTarget: { kind: 'search', result: PUBLIC_FIXTURES.china_mainland[0] }, timeMode: 'exact', startDateTime: 'invalid-time', endDateTime: null, period: null });
    } catch { failed = true; }
    assert(failed, 'Failure was not injected');
    assert(insertedPlaces > 0, 'Did not reach a staged Place insert');
    assert(await fingerprint(before.state) === await fingerprint((await store.read()).state), 'Partial edit committed');
  });
  await step('跨表故障：新增 Trip / Days 全部回滚', async () => {
    const before = await store.read();
    const failing = commandsFor({ runInTransaction: (task) => store.runInTransaction(async (repositories) => { await task(repositories); throw new Error('INTENTIONAL_ROLLBACK'); }) });
    try { await failing.createTrip({ title: '应回滚旅行', mapRegion: 'global', startDate: '2026-12-01', endDate: '2026-12-05' }); } catch (error) { assert(error.message === 'INTENTIONAL_ROLLBACK', 'Unexpected failure'); }
    assert(await fingerprint(before.state) === await fingerprint((await store.read()).state), 'Trip or Days remained');
  });
  await step('来源约束：海外地点不能加入国内 Trip', async () => {
    const before = await store.read();
    const trip = before.state.trips.find((x) => x.mapRegion === 'china_mainland');
    const day = before.state.days.find((x) => x.tripId === trip.id);
    let failed = false;
    try { await commands.confirmPlaceSearchResult({ tripId: trip.id, dayId: day.id, result: PUBLIC_FIXTURES.global[0], itemType: 'sightseeing' }); } catch { failed = true; }
    assert(failed, 'Mixed source was accepted');
    assert(await fingerprint(before.state) === await fingerprint((await store.read()).state), 'Rejected source left records');
  });
  await step('两个独立客户端并发写入：无覆盖丢失', async () => {
    const other = createBrowserStore(name);
    const peers = [commands, commandsFor(other)];
    const { state } = await store.read();
    const trip = state.trips[0];
    const day = state.days.find((x) => x.tripId === trip.id);
    const count = state.items.length;
    await Promise.all(Array.from({ length: 8 }, (_, i) => peers[i % 2].addItem({ tripId: trip.id, dayId: day.id, title: `并发测试 ${i + 1}`, type: 'activity' })));
    const after = (await store.read()).state;
    assert(after.items.length === count + 8, 'Concurrent writes were lost');
    const rows = after.items.filter((x) => x.dayId === day.id).sort((a, b) => a.sortOrder - b.sortOrder);
    assert(rows.every((x, i) => x.sortOrder === i), 'Order is not contiguous');
    const retries = store.conflictCount + other.conflictCount;
    assert(retries > 0, 'No conflicting write was exercised');
    await other.close();
    return `8 项均保留，顺序连续；CAS 冲突重试 ${retries} 次`;
  });
  await step('关闭连接后重新打开：全部字段保持', async () => {
    const before = await store.read();
    await store.close();
    const reopened = createBrowserStore(name);
    assert(await fingerprint(before.state) === await fingerprint((await reopened.read()).state), 'Reopen changed data');
    await reopened.close();
    return '独立 IndexedDB 连接；并非只读 React 内存';
  });
  await step('导出到新数据库恢复：内容完全一致', async () => {
    const backup = JSON.parse(JSON.stringify(await store.export()));
    const restored = createBrowserStore(`${name}-restore`);
    await restored.import(backup);
    assert(await fingerprint(backup.state) === await fingerprint((await restored.read()).state), 'Restore differs');
    await restored.close();
  });
  await step('损坏的导入文件：拒绝且保留现有数据', async () => {
    const before = await store.read();
    const backup = await store.export();
    backup.state.trips.push(structuredClone(backup.state.trips[0]));
    let failed = false;
    try { await store.import(backup); } catch { failed = true; }
    assert(failed, 'Duplicate IDs accepted');
    assert(await fingerprint(before.state) === await fingerprint((await store.read()).state), 'Bad import changed database');
  });
  await step('备份校验：有效字段被篡改时拒绝，旧版备份仍可恢复', async () => {
    const before = await store.read();
    const backup = await store.export();
    assert(backup.integrity.digest === await fingerprint(backup.state), 'Export checksum incorrect');
    backup.state.items[0].note = '有效字段，但已损坏原备份内容';
    let failed = false;
    try { await store.import(backup); } catch (error) { failed = error.message === 'BACKUP_CHECKSUM_MISMATCH'; }
    assert(failed, 'Checksum mismatch accepted');
    assert(await fingerprint(before.state) === await fingerprint((await store.read()).state), 'Checksum failure changed data');
    const legacy = await store.export(); delete legacy.integrity;
    const restored = createBrowserStore(`${name}-old-backup`);
    try { await restored.import(legacy); assert(await fingerprint((await restored.read()).state) === await fingerprint(legacy.state), 'Old backup import differs'); }
    finally { await restored.drop(); }
  });
  await store.drop();
  await createBrowserStore(`${name}-restore`).drop();
  return { results, testDatabase: name, pass: results.every((x) => x.status === 'PASS') };
}

export async function verifyLocalLegacyBackup() {
  const response = await fetch('/__probe/legacy');
  if (!response.ok) throw new Error('本地备份尚未准备');
  const backup = await response.json();
  const store = createBrowserStore(`travel-web-prototype-legacy-${crypto.randomUUID()}`);
  await store.import(backup);
  const imported = (await store.read()).state;
  const hash = await fingerprint(backup.state);
  assert(await fingerprint(imported) === hash, 'Legacy import lost content');
  await store.close();
  const reopened = createBrowserStore(store.name);
  assert(await fingerprint((await reopened.read()).state) === hash, 'Legacy reopen lost content');
  const second = createBrowserStore(`${store.name}-restore`);
  await second.import(JSON.parse(JSON.stringify(await reopened.export())));
  assert(await fingerprint((await second.read()).state) === hash, 'Legacy restore lost content');
  const issues = diagnoseState(imported);
  await reopened.drop(); await second.drop();
  return { source: backup.source, counts: Object.fromEntries(['trips', 'days', 'items', 'places'].map((name) => [name, imported[name].length])), preservedTables: Object.fromEntries(Object.entries(imported.extras.sourceTables).map(([name, rows]) => [name, rows.length])), fingerprint: hash, referenceIssueCount: issues.length, status: 'PASS' };
}
