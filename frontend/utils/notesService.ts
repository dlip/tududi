import { Note } from '../entities/Note';
import {
    handleAuthResponse,
    getDefaultHeaders,
} from './authUtils';
import { getApiPath } from '../config/paths';
import { offlineMutate, cacheReadCollection } from '../offline/offlineFetch';
import { getAll as getCachedCollection } from '../offline/db';
import { generateClientUid } from '../offline/clientUid';

export const fetchNotes = async (): Promise<Note[]> => {
    try {
        const response = await fetch(getApiPath('notes'), {
            credentials: 'include',
            headers: {
                ...getDefaultHeaders(),
                'Cache-Control': 'no-cache',
            },
            cache: 'no-store',
        });
        await handleAuthResponse(response, 'Failed to fetch notes.');

        const notes: Note[] = await response.json();
        void cacheReadCollection('notes', async () => notes);
        return notes;
    } catch (error) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return getCachedCollection<Note>('notes').catch(() => []);
        }
        throw error;
    }
};

export const createNote = async (noteData: Note): Promise<Note> => {
    // Transform project_id to project_uid if needed (same as updateNote)
    const requestData: any = { ...noteData };
    if (noteData.project && noteData.project.uid) {
        requestData.project_uid = noteData.project.uid;
    } else if (noteData.project_uid) {
        // project_uid is already set, use it as-is
    } else if (noteData.project_id && !noteData.project_uid) {
        // Legacy: if only project_id is provided, we can't convert it to uid here
        // This should not happen with the new implementation, but keeping for safety
        console.warn(
            'Note creation with project_id but no project_uid - this may fail'
        );
    }

    const uid = requestData.uid || generateClientUid();
    requestData.uid = uid;
    const now = new Date().toISOString();

    return offlineMutate<Note>({
        entity: 'notes',
        op: 'create',
        uid,
        method: 'POST',
        apiPath: getApiPath('note'),
        payload: requestData,
        optimisticResult: {
            ...requestData,
            created_at: now,
            updated_at: now,
        } as Note,
        errorMessage: 'Failed to create note.',
    });
};

export const updateNote = async (
    noteUid: string,
    noteData: Note
): Promise<Note> => {
    // Transform project_id to project_uid if needed
    const requestData: any = { ...noteData };
    if (noteData.project && noteData.project.uid) {
        requestData.project_uid = noteData.project.uid;
    } else if (noteData.project_uid) {
        // project_uid is already set, use it as-is
    } else if (noteData.project_id && !noteData.project_uid) {
        // Legacy: if only project_id is provided, we can't convert it to uid here
        // This should not happen with the new implementation, but keeping for safety
        console.warn(
            'Note update with project_id but no project_uid - this may fail'
        );
    }

    return offlineMutate<Note>({
        entity: 'notes',
        op: 'update',
        uid: noteUid,
        method: 'PATCH',
        apiPath: getApiPath(`note/${noteUid}`),
        payload: requestData,
        optimisticResult: {
            ...requestData,
            uid: noteUid,
            updated_at: new Date().toISOString(),
        } as Note,
        errorMessage: 'Failed to update note.',
    });
};

export const deleteNote = async (noteUid: string): Promise<void> => {
    await offlineMutate<void>({
        entity: 'notes',
        op: 'delete',
        uid: noteUid,
        method: 'DELETE',
        apiPath: getApiPath(`note/${noteUid}`),
        optimisticResult: undefined,
        errorMessage: 'Failed to delete note.',
    });
};

export const fetchNoteBySlug = async (uidSlug: string): Promise<Note> => {
    const response = await fetch(getApiPath(`note/${uidSlug}`), {
        credentials: 'include',
        headers: {
            ...getDefaultHeaders(),
            'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
    });

    await handleAuthResponse(response, 'Failed to fetch note.');
    return await response.json();
};
