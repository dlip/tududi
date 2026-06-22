import { getBasePath } from '../config/paths';

/**
 * Register the service worker (production only) using a scope derived from
 * the configured base path so the PWA works under a sub-path (e.g. Home
 * Assistant ingress) as well as at the root.
 *
 * In development we proactively unregister any stale service workers and
 * clear caches left over from other branches.
 */
export function setupServiceWorker(): void {
    const isProduction = process.env.NODE_ENV === 'production';

    if (!('serviceWorker' in navigator)) {
        return;
    }

    if (!isProduction) {
        unregisterStaleWorkers();
        return;
    }

    const basePath = getBasePath();
    const swUrl = `${basePath}/service-worker.js`;
    const scope = `${basePath}/`;

    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register(swUrl, { scope })
            .catch((error) => {
                // Registration failure is non-fatal; the app still works
                // online without offline support.
                // eslint-disable-next-line no-console
                console.warn('Service worker registration failed:', error);
            });
    });
}

function unregisterStaleWorkers(): void {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
            registration.unregister().catch(() => {
                // Non-fatal during development cleanup
            });
        });
    });

    if ('caches' in window) {
        caches.keys().then((cacheNames) => {
            cacheNames.forEach((cacheName) => {
                caches.delete(cacheName).catch(() => {
                    // Ignore cache cleanup failures during dev
                });
            });
        });
    }
}
