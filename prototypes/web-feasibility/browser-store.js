// PROTOTYPE ONLY: one atomic IndexedDB snapshot, not the native app database.
// Existing Application Commands use these Repository interfaces unchanged.
import { assertItemTimeFields } from '@/domain/item/time';
import { assertCoordinate } from '@/domain/common/coordinate';

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
  for (const row of state.days) if (!tripIds.has(row.tripId)) issues.push(`DAY_TRIP:${row.id}`);
  for (const row of state.places) assertCoordinate(row.coordinate);
  for (const row of state.items) {
    assertItemTimeFields(row);
    if (!tripIds.has(row.tripId)) issues.push(`ITEM_TRIP:${row.id}`);
    if (row.dayId !== null && !days.has(row.dayId)) issues.push(`ITEM_DAY:${row.id}`);
    if (row.dayId !== null && days.has(row.dayId) && days.get(row.dayId).tripId !== row.tripId) issues.push(`DAY_OWNER:${row.id}`);
    if (row.placeId !== null && !placeIds.has(row.placeId)) issues.push(`ITEM_PLACE:${row.id}`);
  }
  return issues.sort();
}

function repositories(state) {
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
      delete: async (id) => { state.trips = state.trips.filter((x) => x.id !== id); },
    },
    days: {
      insertMany: async (rows) => rows.forEach((row) => insert('days', row)),
      getById: async (id) => byId('days', id),
      listByTripId: async (id) => clone(state.days.filter((x) => x.tripId === id).sort((a, b) => a.dayIndex - b.dayIndex)),
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
  };
}

export function createBrowserStore(name = 'travel-web-prototype-interactive-v1') {
  let databasePromise;
  let queue = Promise.resolve();
  let conflicts = 0;
  const open = () => databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshot');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('PROTOTYPE_DATABASE_BLOCKED'));
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
      const transaction = database.transaction('snapshot', 'readwrite');
      const store = transaction.objectStore('snapshot');
      const request = store.get('current');
      let failure;
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== expectedRevision) {
          conflicts += 1;
          failure = new Error('PROTOTYPE_WRITE_CONFLICT');
          transaction.abort();
          return;
        }
        store.put({ revision: expectedRevision + 1, state: clone(state) }, 'current');
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('PROTOTYPE_TRANSACTION_ABORTED'));
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
          if (error.message !== 'PROTOTYPE_WRITE_CONFLICT') throw error;
        }
      }
      throw new Error('PROTOTYPE_CONFLICT_RETRY_LIMIT');
    }),
    export: async () => {
      const state = (await read()).state;
      return { format: 'travel-web-prototype-backup', schemaVersion: 1, state, integrity: { algorithm: 'SHA-256', digest: await fingerprint(state) } };
    },
    import: (backup) => serial(async () => {
      if (backup?.format !== 'travel-web-prototype-backup' || backup.schemaVersion !== 1) throw new Error('INVALID_BACKUP_FORMAT');
      diagnoseState(backup.state);
      if (backup.integrity && (backup.integrity.algorithm !== 'SHA-256' || backup.integrity.digest !== await fingerprint(backup.state))) throw new Error('BACKUP_CHECKSUM_MISMATCH');
      // Only replace this named scratch database. The native database is never opened.
      const before = await read();
      await commit(before.revision, backup.state);
    }),
    close,
    drop: async () => {
      await close();
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('PROTOTYPE_CLEANUP_BLOCKED'));
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

