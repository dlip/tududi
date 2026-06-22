/**
 * Helpers that make the per-entity service modules offline-aware.
 *
 * `offlineMutate` performs a mutating request online, and on network failure
 * (or when the browser is offline) queues it in the outbox and returns an
 * optimistic result. `cacheRead` write-throughs successful list/detail reads
 * to the IndexedDB cache and falls back to it when the network is unavailable.
 */

import {
    OfflineEntity,
    getAll as dbGetAll,
    get as dbGet,
    replaceCollection,
} from './db';
import { enqueue, flush, OutboxOp } from './outbox';
import { isOnline } from './connectivity';
import { getPostHeadersWithCsrf } from '../utils/authUtils';
import { handleAuthResponse } from '../utils/authUtils';

function isNetworkError(error: unknown): boolean {
    // fetch() rejects with a TypeError on network failure.
    return (
        error instanceof TypeError ||
        (error instanceof Error && /network|failed to fetch/i.test(error.message))
    );
}

export interface MutateOptions {
    entity: OfflineEntity;
    op: OutboxOp;
    uid: string;
    method: 'POST' | 'PATCH' | 'DELETE';
    apiPath: string;
    payload?: any;
    /** Result to return when the mutation is queued offline. */
    optimisticResult: any;
    errorMessage: string;
}

/**
 * Run a mutating request. If it fails because we're offline, queue it and
 * return the optimistic result instead of throwing.
 */
export async function offlineMutate<T = any>(
    options: MutateOptions
): Promise<T> {
    const { entity, op, uid, method, apiPath, payload, errorMessage } = options;

    const tryNetwork = async (): Promise<T> => {
        const init: RequestInit = {
            method,
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
        };
        if (method !== 'DELETE' && payload !== undefined) {
            init.body = JSON.stringify(payload);
        }
        const response = await fetch(apiPath, init);
        await handleAuthResponse(response, errorMessage);
        // DELETE handlers may return an empty body.
        if (method === 'DELETE') {
            return undefined as unknown as T;
        }
        return (await response.json()) as T;
    };

    if (isOnline()) {
        try {
            return await tryNetwork();
        } catch (error) {
            if (!isNetworkError(error)) {
                throw error;
            }
            // Fell through to offline handling below.
        }
    }

    await enqueue({
        entity,
        op,
        uid,
        method,
        apiPath,
        payload,
        createdAt: Date.now(),
        attempts: 0,
    });

    return options.optimisticResult as T;
}

/**
 * Wrap a list read: on success cache the records; on network failure return
 * the cached collection.
 */
export async function cacheReadCollection<T extends { uid?: string }>(
    entity: OfflineEntity,
    loader: () => Promise<T[]>
): Promise<T[]> {
    try {
        const records = await loader();
        if (Array.isArray(records)) {
            await replaceCollection(entity, records).catch(() => undefined);
        }
        return records;
    } catch (error) {
        if (isNetworkError(error) || !isOnline()) {
            const cached = await dbGetAll<T>(entity).catch(() => []);
            return cached;
        }
        throw error;
    }
}

/**
 * Wrap a single-record read with cache fallback by uid.
 */
export async function cacheReadOne<T extends { uid?: string }>(
    entity: OfflineEntity,
    uid: string,
    loader: () => Promise<T>
): Promise<T> {
    try {
        const record = await loader();
        return record;
    } catch (error) {
        if (isNetworkError(error) || !isOnline()) {
            const cached = await dbGet<T>(entity, uid);
            if (cached) {
                return cached;
            }
        }
        throw error;
    }
}

export { flush };
