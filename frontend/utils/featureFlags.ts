import { getApiPath } from '../config/paths';
import { isOnline } from '../offline/connectivity';

export interface FeatureFlags {
    backups: boolean;
    calendar: boolean;
    caldav: boolean;
    habits: boolean;
    mcp: boolean;
}

const defaultFeatureFlags: FeatureFlags = {
    backups: false,
    calendar: false,
    caldav: false,
    habits: false,
    mcp: false,
};

let cachedFeatureFlags: FeatureFlags | null = null;

export const getFeatureFlags = async (): Promise<FeatureFlags> => {
    if (cachedFeatureFlags) {
        return cachedFeatureFlags;
    }

    // Avoid a guaranteed-failing request (and its console noise) when the
    // browser is offline; fall back to defaults until we're back online.
    if (!isOnline()) {
        return defaultFeatureFlags;
    }

    try {
        const response = await fetch(getApiPath('feature-flags'), {
            credentials: 'include',
        });

        if (!response.ok) {
            console.error('Failed to fetch feature flags');
            return defaultFeatureFlags;
        }

        const data = await response.json();
        cachedFeatureFlags = {
            ...defaultFeatureFlags,
            ...data.featureFlags,
        };
        return cachedFeatureFlags;
    } catch (error) {
        console.error('Error fetching feature flags:', error);
        return defaultFeatureFlags;
    }
};

export const clearFeatureFlagsCache = () => {
    cachedFeatureFlags = null;
};
