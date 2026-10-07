/**
 * Minimal promise-based IndexedDB wrapper. One database, one store per
 * entity, keyed by `id`. Everything is local-first — no network involved.
 */

const DB_NAME = 'student-expense-tracker';
const DB_VERSION = 1;

export const STORES = [
  'transactions',
  'categories',
  'budgets',
  'goals',
  'recurring',
] as const;

export type StoreName = (typeof STORES)[number];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open database'));
    req.onblocked = () => reject(new Error('Database is blocked by another tab'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Database operation failed'));
        t.onerror = () => reject(t.error ?? new Error('Database transaction failed'));
      }),
  );
}

export const idb = {
  getAll<T>(store: StoreName): Promise<T[]> {
    return tx<T[]>(store, 'readonly', (s) => s.getAll());
  },
  get<T>(store: StoreName, id: string): Promise<T | undefined> {
    return tx<T | undefined>(store, 'readonly', (s) => s.get(id));
  },
  put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
    return tx<void>(store, 'readwrite', (s) => s.put(value)).then(() => undefined);
  },
  putMany<T extends { id: string }>(store: StoreName, values: T[]): Promise<void> {
    return db().then(
      (d) =>
        new Promise<void>((resolve, reject) => {
          const t = d.transaction(store, 'readwrite');
          const s = t.objectStore(store);
          for (const v of values) s.put(v);
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error ?? new Error('Bulk write failed'));
        }),
    );
  },
  delete(store: StoreName, id: string): Promise<void> {
    return tx<void>(store, 'readwrite', (s) => s.delete(id)).then(() => undefined);
  },
  clear(store: StoreName): Promise<void> {
    return tx<void>(store, 'readwrite', (s) => s.clear()).then(() => undefined);
  },
};

/** Wipe every store — used by "Reset data". */
export async function clearAll(): Promise<void> {
  for (const name of STORES) {
    // eslint-disable-next-line no-await-in-loop
    await idb.clear(name);
  }
}
