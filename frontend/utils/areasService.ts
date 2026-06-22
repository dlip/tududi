import { Area } from '../entities/Area';
import { handleAuthResponse } from './authUtils';
import { getApiPath } from '../config/paths';
import { offlineMutate, cacheReadCollection } from '../offline/offlineFetch';
import { getAll as getCachedCollection } from '../offline/db';
import { generateClientUid } from '../offline/clientUid';

export const fetchAreas = async (): Promise<Area[]> => {
    try {
        const response = await fetch(getApiPath('areas'), {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
            },
        });
        await handleAuthResponse(response, 'Failed to fetch areas.');
        const areas: Area[] = await response.json();
        void cacheReadCollection('areas', async () => areas);
        return areas;
    } catch (error) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return getCachedCollection<Area>('areas').catch(() => []);
        }
        throw error;
    }
};

export const createArea = async (areaData: Partial<Area>): Promise<Area> => {
    const uid = (areaData as any).uid || generateClientUid();
    const payload = { ...areaData, uid };
    const now = new Date().toISOString();

    return offlineMutate<Area>({
        entity: 'areas',
        op: 'create',
        uid,
        method: 'POST',
        apiPath: getApiPath('areas'),
        payload,
        optimisticResult: {
            ...payload,
            created_at: now,
            updated_at: now,
        } as Area,
        errorMessage: 'Failed to create area.',
    });
};

export const updateArea = async (
    areaUid: string,
    areaData: Partial<Area>
): Promise<Area> => {
    return offlineMutate<Area>({
        entity: 'areas',
        op: 'update',
        uid: areaUid,
        method: 'PATCH',
        apiPath: getApiPath(`areas/${areaUid}`),
        payload: areaData,
        optimisticResult: {
            ...areaData,
            uid: areaUid,
            updated_at: new Date().toISOString(),
        } as Area,
        errorMessage: 'Failed to update area.',
    });
};

export const deleteArea = async (areaUid: string): Promise<void> => {
    await offlineMutate<void>({
        entity: 'areas',
        op: 'delete',
        uid: areaUid,
        method: 'DELETE',
        apiPath: getApiPath(`areas/${areaUid}`),
        optimisticResult: undefined,
        errorMessage: 'Failed to delete area.',
    });
};
