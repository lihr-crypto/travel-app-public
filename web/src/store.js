// Atomic browser adapter for the existing Application Commands. Never opens the native database.
import { assertItemTimeFields } from '@/domain/item/time';
import { assertCoordinate } from '@/domain/common/coordinate';
import { travelDateParts as assertTravelDate } from '@/domain/trip/date-range';

const clone = (value) => structuredClone(value);
const emptyState = () => ({ trips: [], days: [], items: [], places: [], extras: {} });
const ordered = (rows) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

export function diagnoseState(state) {
  const issues = [];
  for (const name of ['trips', 'days', 'items', 'places']) {
    if (!Array.isArray(state[name])) throw new Error(`INVALID_COLLECTION:${name}`);
    const ids = new Set();
    for (const row of state[name]) {
      if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error(`INVALID_ID:${name}`);
      ids.add(row.id);
    }
  }
  const tripIds = new Set(state.trips.map((x) => x.id));
  const days = new Map(state.days.map((x) => [x.id, x]));
  const placeIds = new Set(state.places.map((x) => x.id));
  for (const row of state.trips) {
    assertTravelDate(row.startDate); assertTravelDate(row.endDate);
    if (typeof row.title !== 'string' || !['china_mainland', 'global'].includes(row.mapRegion) || row.endDate < row.startDate) throw new Error('INVALID_BACKUP_RECORD:trip');
  }
  for (const row of state.days) {
    assertTravelDate(row.date);
    if (!Number.isInteger(row.dayIndex) || row.dayIndex < 1 || typeof row.tripId !== 'string') throw new Error('INVALID_BACKUP_RECORD:day');
    if (!tripIds.has(row.tripId)) issues.push(`DAY_TRIP:${row.id}`);
  }
  for (const row of state.places) {
    assertCoordinate(row.coordinate);
    if (typeof row.name !== 'string') throw new Error('INVALID_BACKUP_RECORD:place');
  }
  for (const row of state.items) {
    if (typeof row.title !== 'string' || typeof row.tripId !== 'string' || !Number.isFinite(row.sortOrder) || !['sightseeing', 'food', 'hotel', 'activity', 'transport', 'custom'].includes(row.type)) throw new Error('INVALID_BACKUP_RECORD:item');
    assertItemTimeFields(row);
    if (!tripIds.has(row.tripId)) issues.push(`ITEM_TRIP:${row.id}`);
    if (row.dayId !== null && !days.has(row.dayId)) issues.push(`ITEM_DAY:${row.id}`);
    if (row.dayId !== null && days.has(row.dayId) && days.get(row.dayId).tripId !== row.tripId) issues.push(`DAY_OWNER:${row.id}`);
    if (row.placeId !== null && !placeIds.has(row.placeId)) issues.push(`ITEM_PLACE:${row.id}`);
  }
  return issues.sort();
}

function mergeExtras(current, incoming, items, preference) {
  const extras = preference === 'incoming' ? { ...clone(current), ...clone(incoming) } : { ...clone(incoming), ...clone(current) };
  // Original SQLite rows are archival evidence, including rows with legacy broken references.
  // Merge exact rows rather than replacing a whole source table on a second import.
  if (current.sourceTables || incoming.sourceTables) {
    extras.sourceTables = {};
    for (const name of new Set([...Object.keys(current.sourceTables ?? {}), ...Object.keys(incoming.sourceTables ?? {})])) {
      const rows = [...(current.sourceTables?.[name] ?? []), ...(incoming.sourceTables?.[name] ?? [])];
      extras.sourceTables[name] = [...new Map(rows.map(row => [JSON.stringify(row), clone(row)])).values()];
    }
  }
  if (current.trash || incoming.trash) {
    const activeIds = new Set(items.map(item => item.id));
    const rows = preference === 'incoming' ? [...(current.trash ?? []), ...(incoming.trash ?? [])] : [...(incoming.trash ?? []), ...(current.trash ?? [])];
    extras.trash = [...new Map(rows.filter(row => !activeIds.has(row.item.id)).map(row => [row.item.id, clone(row)])).values()];
  }
  return extras;
}

export function repositories(state) {
  const byId = (name, id) => clone(state[name].find((x) => x.id === id) ?? null);
  const insert = (name, row) => {
    if (state[name].some((x) => x.id === row.id)) throw new Error(`DUPLICATE_ID:${name}`);
    state[name].push(clone(row));
  };
  const update = (name, row) => {
    const index = state[name].findIndex((x) => x.id === row.id);
    if (index < 0) throw new Error(`MISSING_ROW:${name}`);
    state[name][index] = clone(row);
  };
  return {
    trips: {
      insert: async (row) => insert('trips', row), getById: async (id) => byId('trips', id),
      list: async () => clone(state.trips), update: async (row) => update('trips', row),
      delete: async (id) => {
        state.trips = state.trips.filter((x) => x.id !== id);
        state.days = state.days.filter((x) => x.tripId !== id);
        state.items = state.items.filter((x) => x.tripId !== id);
        if (state.extras.trash) state.extras.trash = state.extras.trash.filter((x) => x.item.tripId !== id);
      },
    },
    days: {
      insertMany: async (rows) => rows.forEach((row) => insert('days', row)),
      getById: async (id) => byId('days', id),
      listByTripId: async (id) => clone(state.days.filter((x) => x.tripId === id).sort((a, b) => a.dayIndex - b.dayIndex || a.id.localeCompare(b.id))),
      updateMany: async (rows) => rows.forEach((row) => update('days', row)),
      deleteMany: async (ids) => { state.days = state.days.filter((x) => !ids.includes(x.id)); },
    },
    places: {
      insert: async (row) => insert('places', row), getById: async (id) => byId('places', id),
      listByIds: async (ids) => clone(state.places.filter((x) => ids.includes(x.id))),
    },
    items: {
      insert: async (row) => insert('items', row), getById: async (id) => byId('items', id),
      listByDayId: async (id) => clone(ordered(state.items.filter((x) => x.dayId === id))),
      listUnscheduledByTripId: async (id) => clone(ordered(state.items.filter((x) => x.tripId === id && x.dayId === null))),
      update: async (row) => update('items', row),
      updateMany: async (rows) => rows.forEach((row) => update('items', row)),
      delete: async (id) => { state.items = state.items.filter((x) => x.id !== id); },
    },
    trash: {
      save: (snapshot) => { state.extras.trash ??= []; state.extras.trash = state.extras.trash.filter((x) => x.item.id !== snapshot.item.id); state.extras.trash.push({ ...clone(snapshot), deletedAt: new Date().toISOString() }); },
      remove: (id) => { if (state.extras.trash) state.extras.trash = state.extras.trash.filter((x) => x.item.id !== id); },
    },
    sync: {
      enqueue: (operation) => { state.extras.outbox ??= []; state.extras.outbox.push(clone(operation)); },
    },
  };
}

export function createBrowserStore(name = 'travel-web-plan-v1') {
  let databasePromise;
  let queue = Promise.resolve();
  let conflicts = 0;
  const listeners = new Set();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${name}-changes`) : null;
  const notify = () => listeners.forEach((listener) => listener());
  if (channel) channel.onmessage = notify;
  const open = () => databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('snapshot')) request.result.createObjectStore('snapshot');
      if (!request.result.objectStoreNames.contains('recovery')) request.result.createObjectStore('recovery');
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); databasePromise = undefined; }; resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('DATABASE_BLOCKED'));
  });
  const read = async () => {
    const database = await open();
    return new Promise((resolve, reject) => {
      const request = database.transaction('snapshot', 'readonly').objectStore('snapshot').get('current');
      request.onsuccess = () => resolve(clone(request.result ?? { revision: 0, state: emptyState() }));
      request.onerror = () => reject(request.error);
    });
  };
  const commit = async (expectedRevision, state) => {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(['snapshot', 'recovery'], 'readwrite');
      const store = transaction.objectStore('snapshot');
      const request = store.get('current');
      let failure;
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== expectedRevision) {
          conflicts += 1;
          failure = new Error('WRITE_CONFLICT');
          transaction.abort();
          return;
        }
        if (request.result) {
          const recovery = transaction.objectStore('recovery');
          recovery.put({ ...clone(request.result), savedAt: new Date().toISOString() }, expectedRevision);
          const keys = recovery.getAllKeys();
          keys.onsuccess = () => keys.result.filter((key) => key < expectedRevision - 19).forEach((key) => recovery.delete(key));
        }
        store.put({ revision: expectedRevision + 1, state: clone(state) }, 'current');
      };
      transaction.oncomplete = () => { notify(); channel?.postMessage({ revision: expectedRevision + 1 }); resolve(); };
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('TRANSACTION_ABORTED'));
      transaction.onerror = () => { failure ??= transaction.error; };
    });
  };
  const serial = (operation) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const close = async () => {
    if (databasePromise) (await databasePromise).close();
    databasePromise = undefined;
  };
  return {
    name, read,
    edit: (task) => serial(async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const before = await read(), draft = clone(before.state);
        await task(draft);
        diagnoseState(draft);
        try { await commit(before.revision, draft); return; }
        catch (error) { if (error.message !== 'WRITE_CONFLICT') throw error; }
      }
      throw new Error('CONFLICT_RETRY_LIMIT');
    }),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    recovery: async () => {
      const database = await open();
      return new Promise((resolve, reject) => { const request = database.transaction('recovery', 'readonly').objectStore('recovery').getAll(); request.onsuccess = () => resolve(clone(request.result).reverse()); request.onerror = () => reject(request.error); });
    },
    restoreRevision: (revision) => serial(async () => {
      const database = await open();
      const saved = await new Promise((resolve, reject) => { const request = database.transaction('recovery', 'readonly').objectStore('recovery').get(revision); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      if (!saved) throw new Error('RECOVERY_NOT_FOUND');
      await commit((await read()).revision, saved.state);
    }),
    get conflictCount() { return conflicts; },
    runInTransaction: (task) => serial(async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const before = await read();
        const baselineIssues = new Set(diagnoseState(before.state));
        const draft = clone(before.state);
        const result = await task(repositories(draft));
        const introduced = diagnoseState(draft).filter((issue) => !baselineIssues.has(issue));
        if (introduced.length) throw new Error('NEW_REFERENCE_INTEGRITY_ERROR');
        try {
          await commit(before.revision, draft);
          return result;
        } catch (error) {
          if (error.message !== 'WRITE_CONFLICT') throw error;
        }
      }
      throw new Error('CONFLICT_RETRY_LIMIT');
    }),
    export: async () => {
      const state = (await read()).state;
      return { format: 'travel-app-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), state, integrity: { algorithm: 'SHA-256', digest: await fingerprint(state) } };
    },
    import: (backup, mode = 'merge', preference = 'current') => serial(async () => {
      if (!['travel-app-backup', 'travel-web-prototype-backup'].includes(backup?.format) || backup.schemaVersion !== 1) throw new Error('INVALID_BACKUP_FORMAT');
      diagnoseState(backup.state);
      if (backup.integrity && (backup.integrity.algorithm !== 'SHA-256' || backup.integrity.digest !== await fingerprint(backup.state))) throw new Error('BACKUP_CHECKSUM_MISMATCH');
      const before = await read();
      let next = clone(backup.state);
      if (mode === 'merge') {
        next = clone(before.state);
        for (const name of ['trips', 'days', 'items', 'places']) {
          for (const incoming of backup.state[name]) {
            const index = next[name].findIndex((row) => row.id === incoming.id);
            if (index < 0) next[name].push(clone(incoming));
            else if (preference === 'incoming') next[name][index] = clone(incoming);
          }
        }
        next.extras = mergeExtras(next.extras ?? {}, backup.state.extras ?? {}, next.items, preference);
        const acceptedIssues = new Set([...diagnoseState(before.state), ...diagnoseState(backup.state)]);
        if (diagnoseState(next).some(issue => !acceptedIssues.has(issue))) throw new Error('IMPORT_REFERENCE_CONFLICT');
      } else if (mode !== 'replace') throw new Error('INVALID_IMPORT_MODE');
      next.extras ??= {};
      diagnoseState(next);
      await commit(before.revision, next);
    }),
    close,
    dispose: async () => { await close(); channel?.close(); listeners.clear(); },
    drop: async () => {
      await close();
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('CLEANUP_BLOCKED'));
      });
    },
  };
}

export async function fingerprint(value) {
  const stable = (item) => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map((key) => [key, stable(item[key])]));
    return item;
  };
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

