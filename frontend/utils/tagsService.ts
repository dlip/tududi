import { Tag } from '../entities/Tag';
import { handleAuthResponse } from './authUtils';
import { extractUidFromSlug } from './slugUtils';
import { getApiPath } from '../config/paths';
import { offlineMutate, cacheReadCollection } from '../offline/offlineFetch';
import { getAll as getCachedCollection } from '../offline/db';
import { generateClientUid } from '../offline/clientUid';

export const fetchTags = async (): Promise<Tag[]> => {
    try {
        const response = await fetch(getApiPath('tags'), {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
            },
        });
        await handleAuthResponse(response, 'Failed to fetch tags.');
        const tags: Tag[] = await response.json();
        void cacheReadCollection('tags', async () => tags);
        return tags;
    } catch (error) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return getCachedCollection<Tag>('tags').catch(() => []);
        }
        console.error('Tags fetch error:', error);
        // Return empty array to prevent UI from breaking
        return [];
    }
};

export const createTag = async (tagData: Tag): Promise<Tag> => {
    const uid = (tagData as any).uid || generateClientUid();
    const payload = { ...tagData, uid };
    const now = new Date().toISOString();

    return offlineMutate<Tag>({
        entity: 'tags',
        op: 'create',
        uid,
        method: 'POST',
        apiPath: getApiPath('tag'),
        payload,
        optimisticResult: {
            ...payload,
            created_at: now,
            updated_at: now,
        } as Tag,
        errorMessage: 'Failed to create tag.',
    });
};

export const updateTag = async (tagUid: string, tagData: Tag): Promise<Tag> => {
    return offlineMutate<Tag>({
        entity: 'tags',
        op: 'update',
        uid: tagUid,
        method: 'PATCH',
        apiPath: getApiPath(`tag/${tagUid}`),
        payload: tagData,
        optimisticResult: {
            ...tagData,
            uid: tagUid,
            updated_at: new Date().toISOString(),
        } as Tag,
        errorMessage: 'Failed to update tag.',
    });
};

export const deleteTag = async (tagUid: string): Promise<void> => {
    await offlineMutate<void>({
        entity: 'tags',
        op: 'delete',
        uid: tagUid,
        method: 'DELETE',
        apiPath: getApiPath(`tag/${tagUid}`),
        optimisticResult: undefined,
        errorMessage: 'Failed to delete tag.',
    });
};

export const fetchTagBySlug = async (uidSlug: string): Promise<Tag> => {
    // Extract uid from uidSlug using proper extraction function
    const uid = extractUidFromSlug(uidSlug);

    const response = await fetch(
        getApiPath(`tag?uid=${encodeURIComponent(uid)}`),
        {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
            },
        }
    );

    await handleAuthResponse(response, 'Failed to fetch tag.');
    return await response.json();
};
