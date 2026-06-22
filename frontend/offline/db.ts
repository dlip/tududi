/**
 * Minimal promise-based IndexedDB wrapper for the offline layer.
 *
 * Stores:
 *  - one object store per cached entity collection (keyed by `uid`)
 *  - `outbox`  : queued mutations to replay when back online (autoIncrement)
 *  - `meta`    : small key/value bag (last-sync timestamps, flags)
 */

export type OfflineEntity =
    | 'tasks'
    | 'projects'
    | 'areas'
    | 'notes'
    | 'tags'
    | 'inbox';

export const ENTITY_STORES: OfflineEntity[] = [
    'tasks',
    'projects',
    'areas',
    'notes',
    'tags',
    'inbox',
];

const DB_NAME = 'tududi-offline';
const DB_VERSION = 1;
export const OUTBOX_STORE = 'outbox';
export const META_STORE = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not available'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            ENTITY_STORES.forEach((store) => {
                if (!db.objectStoreNames.contains(store)) {
                    db.createObjectStore(store, { keyPath: 'uid' });
                }
            });

            if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
                db.createObjectStore(OUTBOX_STORE, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
            }

            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

function tx(
    db: IDBDatabase,
    store: string,
    mode: IDBTransactionMode
): IDBObjectStore {
    return db.transaction(store, mode).objectStore(store);
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAll<T = any>(store: string): Promise<T[]> {
    const db = await openDb();
    return promisifyRequest(tx(db, store, 'readonly').getAll() as IDBRequest<
        T[]
    >);
}

export async function get<T = any>(
    store: string,
    key: IDBValidKey
): Promise<T | undefined> {
    const db = await openDb();
    return promisifyRequest(
        tx(db, store, 'readonly').get(key) as IDBRequest<T | undefined>
    );
}

export async function put<T = any>(store: string, value: T): Promise<void> {
    const db = await openDb();
    await promisifyRequest(tx(db, store, 'readwrite').put(value as any));
}

export async function putWithKey<T = any>(
    store: string,
    value: T,
    key: IDBValidKey
): Promise<void> {
    const db = await openDb();
    await promisifyRequest(tx(db, store, 'readwrite').put(value as any, key));
}

export async function add<T = any>(
    store: string,
    value: T
): Promise<IDBValidKey> {
    const db = await openDb();
    return promisifyRequest(tx(db, store, 'readwrite').add(value as any));
}

export async function del(store: string, key: IDBValidKey): Promise<void> {
    const db = await openDb();
    await promisifyRequest(tx(db, store, 'readwrite').delete(key));
}

export async function clear(store: string): Promise<void> {
    const db = await openDb();
    await promisifyRequest(tx(db, store, 'readwrite').clear());
}

/** Replace the full set of cached records for an entity collection. */
export async function replaceCollection<T extends { uid?: string }>(
    store: OfflineEntity,
    records: T[]
): Promise<void> {
    const db = await openDb();
    const objectStore = tx(db, store, 'readwrite');
    await promisifyRequest(objectStore.clear());
    records
        .filter((record) => record && record.uid)
        .forEach((record) => objectStore.put(record));
}
