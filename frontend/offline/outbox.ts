/**
 * Offline mutation outbox.
 *
 * When a mutating API call cannot reach the server (the browser is offline
 * or the request fails with a network error), the request descriptor is
 * queued here and the local IndexedDB entity cache is updated optimistically.
 * On reconnect `flush()` replays the queued requests in order against the
 * real API using last-write-wins.
 */

import {
    add as dbAdd,
    del as dbDel,
    getAll as dbGetAll,
    put as dbPut,
    get as dbGet,
    OUTBOX_STORE,
    OfflineEntity,
} from './db';
import { isOnline } from './connectivity';
import { getCsrfToken, clearCsrfToken } from '../utils/csrfService';
import { getPostHeaders } from '../utils/authUtils';

export type OutboxOp = 'create' | 'update' | 'delete';

export interface OutboxEntry {
    id?: number;
    entity: OfflineEntity;
    op: OutboxOp;
    uid: string;
    method: 'POST' | 'PATCH' | 'DELETE';
    apiPath: string; // fully resolved (already through getApiPath)
    payload?: any;
    createdAt: number;
    attempts: number;
}

type FlushReporter = (failed: OutboxEntry, error: Error) => void;

let reporter: FlushReporter | null = null;
let pendingCountListeners = new Set<(count: number) => void>();

export function setOutboxReporter(fn: FlushReporter | null): void {
    reporter = fn;
}

export function subscribePendingCount(
    listener: (count: number) => void
): () => void {
    pendingCountListeners.add(listener);
    void getPendingCount().then(listener);
    return () => {
        pendingCountListeners.delete(listener);
    };
}

async function notifyPendingCount(): Promise<void> {
    const count = await getPendingCount();
    pendingCountListeners.forEach((listener) => {
        try {
            listener(count);
        } catch {
            // ignore listener errors
        }
    });
}

export async function getPendingCount(): Promise<number> {
    const entries = await dbGetAll<OutboxEntry>(OUTBOX_STORE);
    return entries.length;
}

/** Add an entry to the outbox and update the optimistic cache. */
export async function enqueue(entry: OutboxEntry): Promise<void> {
    await dbAdd(OUTBOX_STORE, entry);
    await applyOptimisticCache(entry);
    await notifyPendingCount();
}

/** Reflect a queued mutation in the local entity cache. */
async function applyOptimisticCache(entry: OutboxEntry): Promise<void> {
    try {
        if (entry.op === 'delete') {
            await dbDel(entry.entity, entry.uid);
            return;
        }

        const existing =
            (await dbGet<any>(entry.entity, entry.uid)) || { uid: entry.uid };
        const merged = { ...existing, ...entry.payload, uid: entry.uid };
        await dbPut(entry.entity, merged);
    } catch {
        // Cache updates are best-effort.
    }
}

async function listEntries(): Promise<OutboxEntry[]> {
    const entries = await dbGetAll<OutboxEntry>(OUTBOX_STORE);
    return entries.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Re-run flush after a short delay if work remains and we're online. */
function scheduleRetry(delayMs = 15000): void {
    if (retryTimer !== null) {
        return;
    }
    retryTimer = setTimeout(() => {
        retryTimer = null;
        void flush();
    }, delayMs);
}

/**
 * Replay queued mutations in order. Re-acquires the CSRF token first
 * (it lives in memory only). Drops + reports entries the server rejects as
 * hard conflicts (404/409/410) rather than retrying forever.
 */
export async function flush(): Promise<void> {
    if (flushing || !isOnline()) {
        return;
    }
    flushing = true;

    let stalled = false;
    try {
        const entries = await listEntries();
        if (entries.length === 0) {
            return;
        }

        // CSRF token is in-memory only; force a fresh one before replay.
        clearCsrfToken();

        for (const entry of entries) {
            try {
                const token = await getCsrfToken();
                const headers: Record<string, string> = {
                    ...getPostHeaders(),
                    'x-csrf-token': token,
                };

                const init: RequestInit = {
                    method: entry.method,
                    credentials: 'include',
                    headers,
                };
                if (entry.method !== 'DELETE' && entry.payload !== undefined) {
                    init.body = JSON.stringify(entry.payload);
                }

                const response = await fetch(entry.apiPath, init);

                if (response.ok) {
                    if (entry.id !== undefined) {
                        await dbDel(OUTBOX_STORE, entry.id);
                    }
                    continue;
                }

                // Hard conflicts: the target no longer exists / collides.
                if ([404, 409, 410].includes(response.status)) {
                    if (entry.id !== undefined) {
                        await dbDel(OUTBOX_STORE, entry.id);
                    }
                    reporter?.(
                        entry,
                        new Error(
                            `Sync conflict (${response.status}) for ${entry.entity} ${entry.uid}`
                        )
                    );
                    continue;
                }

                // Other errors (incl. 401): stop and retry later.
                stalled = true;
                break;
            } catch (e) {
                // Network error: still offline; stop and retry on next flush.
                stalled = true;
                break;
            }
        }
    } finally {
        flushing = false;
        await notifyPendingCount();
        // If the queue still has entries (a replay stalled on a transient
        // error), re-drive the flush ourselves so sync completes without
        // requiring a manual refresh.
        if (isOnline() && (await getPendingCount()) > 0) {
            scheduleRetry(stalled ? 15000 : 1000);
        }
    }
}
