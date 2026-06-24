import { getApiPath } from '../config/paths';
import { isOnline } from '../offline/connectivity';

let csrfToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

export const getCsrfToken = async (): Promise<string> => {
    if (csrfToken) {
        return csrfToken;
    }

    if (tokenPromise) {
        return tokenPromise;
    }

    // No point requesting a token while offline — it would just fail with a
    // network error. Mutations made offline are queued and re-acquire a
    // fresh token when the outbox flushes on reconnect.
    if (!isOnline()) {
        throw new Error('Offline: CSRF token unavailable');
    }

    tokenPromise = fetch(getApiPath('csrf-token'), {
        credentials: 'include',
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error('Failed to fetch CSRF token');
            }
            return response.json();
        })
        .then((data) => {
            csrfToken = data.csrfToken;
            tokenPromise = null;
            return csrfToken!;
        })
        .catch((error) => {
            tokenPromise = null;
            throw error;
        });

    return tokenPromise;
};

export const clearCsrfToken = (): void => {
    csrfToken = null;
    tokenPromise = null;
};

export const fetchWithCsrf = async (
    url: string,
    options: RequestInit = {}
): Promise<Response> => {
    const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
        options.method?.toUpperCase() || 'GET'
    );

    if (needsCsrf) {
        const token = await getCsrfToken();
        options.headers = {
            ...options.headers,
            'x-csrf-token': token,
        };
    }

    return fetch(url, options);
};
