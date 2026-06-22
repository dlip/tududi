import { Project } from '../entities/Project';
import { handleAuthResponse } from './authUtils';
import { getApiPath } from '../config/paths';
import { offlineMutate, cacheReadCollection } from '../offline/offlineFetch';
import { getAll as getCachedCollection } from '../offline/db';
import { generateClientUid } from '../offline/clientUid';

export const fetchProjects = async (
    stateFilter = 'all',
    areaFilter = ''
): Promise<Project[]> => {
    let url = 'projects';
    const params = new URLSearchParams();

    if (stateFilter !== 'all') params.append('state', stateFilter);
    if (areaFilter) params.append('area', areaFilter);
    if (params.toString()) url += `?${params.toString()}`;

    try {
        const response = await fetch(getApiPath(url), {
            credentials: 'include',
            headers: { Accept: 'application/json' },
        });

        await handleAuthResponse(response, 'Failed to fetch projects.');

        const data = await response.json();
        const projects: Project[] = data.projects || data;
        void cacheReadCollection('projects', async () => projects);
        return projects;
    } catch (error) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return getCachedCollection<Project>('projects').catch(() => []);
        }
        throw error;
    }
};

export const fetchGroupedProjects = async (
    stateFilter = 'all',
    areaFilter = ''
): Promise<Record<string, Project[]>> => {
    let url = 'projects';
    const params = new URLSearchParams();

    params.append('grouped', 'true');
    if (stateFilter !== 'all') params.append('state', stateFilter);
    if (areaFilter) params.append('area', areaFilter);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(getApiPath(url), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });

    await handleAuthResponse(response, 'Failed to fetch projects.');

    const data = await response.json();
    return data;
};

export const fetchProjectById = async (projectId: string): Promise<Project> => {
    const response = await fetch(getApiPath(`project/${projectId}`), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });

    await handleAuthResponse(response, 'Failed to fetch project details.');
    return await response.json();
};

export const createProject = async (
    projectData: Partial<Project>
): Promise<Project> => {
    const uid = (projectData as any).uid || generateClientUid();
    const payload = { ...projectData, uid };
    const now = new Date().toISOString();

    return offlineMutate<Project>({
        entity: 'projects',
        op: 'create',
        uid,
        method: 'POST',
        apiPath: getApiPath('project'),
        payload,
        optimisticResult: {
            ...payload,
            created_at: now,
            updated_at: now,
        } as Project,
        errorMessage: 'Failed to create project.',
    });
};

export const updateProject = async (
    projectUid: string,
    projectData: Partial<Project>
): Promise<Project> => {
    return offlineMutate<Project>({
        entity: 'projects',
        op: 'update',
        uid: projectUid,
        method: 'PATCH',
        apiPath: getApiPath(`project/${projectUid}`),
        payload: projectData,
        optimisticResult: {
            ...projectData,
            uid: projectUid,
            updated_at: new Date().toISOString(),
        } as Project,
        errorMessage: 'Failed to update project.',
    });
};

export const deleteProject = async (projectUid: string): Promise<void> => {
    if (!projectUid || projectUid === null || projectUid === undefined) {
        throw new Error('Cannot delete project: Invalid project UID');
    }

    await offlineMutate<void>({
        entity: 'projects',
        op: 'delete',
        uid: projectUid,
        method: 'DELETE',
        apiPath: getApiPath(`project/${projectUid}`),
        optimisticResult: undefined,
        errorMessage: 'Failed to delete project.',
    });
};

export const fetchProjectBySlug = async (uidSlug: string): Promise<Project> => {
    const response = await fetch(getApiPath(`project/${uidSlug}`), {
        credentials: 'include',
        headers: {
            Accept: 'application/json',
        },
    });

    await handleAuthResponse(response, 'Failed to fetch project.');
    return await response.json();
};
