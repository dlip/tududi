/* tududi service worker — app shell + offline read caching.
 *
 * Offline WRITE handling (queueing mutations) is done in the application
 * layer (see frontend/offline/*). This service worker only deals with
 * caching so the app shell and last-known GET responses are available
 * offline.
 */

const VERSION = 'v3';
const SHELL_CACHE = `tududi-shell-${VERSION}`;
const ASSET_CACHE = `tududi-assets-${VERSION}`;
const API_CACHE = `tududi-api-${VERSION}`;

const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE, API_CACHE];

// Resolve the app base path from the SW scope so it works under a
// sub-path (e.g. Home Assistant ingress) as well as at the root.
const SCOPE_URL = new URL(self.registration.scope);
const BASE_PATH = SCOPE_URL.pathname.replace(/\/$/, '');
// Cache the shell under the scope root (the actual start URL the browser
// navigates to). We also try /index.html as a secondary key.
const START_URL = `${BASE_PATH}/`;
const SHELL_URL = `${BASE_PATH}/index.html`;

// Store a response as the app shell, but only when it is safe to cache.
// `cache.put` throws for redirected responses, which is the main reason the
// shell silently failed to cache before.
async function cacheShell(response) {
    if (!response || !response.ok || response.redirected) {
        return;
    }
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(START_URL, response.clone());
}

// Small static files the browser requests on every page load (favicons,
// manifest). Precaching them keeps the console clean offline.
const PRECACHE_ASSETS = [
    'favicon.ico',
    'favicon-16.png',
    'favicon-32.png',
    'favicon-48.png',
    'favicon.png',
    'manifest.json',
].map((name) => `${BASE_PATH}/${name}`);

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            try {
                // Use a manual-redirect fetch so a trailing-slash/login
                // redirect doesn't make the shell uncacheable.
                const response = await fetch(START_URL, { cache: 'reload' });
                await cacheShell(response);
            } catch (e) {
                // Best-effort: the shell is also cached on the first
                // successful navigation while online.
            }
            try {
                const assetCache = await caches.open(ASSET_CACHE);
                await assetCache.addAll(PRECACHE_ASSETS);
            } catch (e) {
                // Best-effort: assets are also cached on first request.
            }
            await self.skipWaiting();
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(
                names
                    .filter(
                        (name) =>
                            name.startsWith('tududi-') &&
                            !KNOWN_CACHES.includes(name)
                    )
                    .map((name) => caches.delete(name))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

const isApiRequest = (url) => url.pathname.includes('/api/');

const isStaticAsset = (url) =>
    /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|gif|ico|svg)$/.test(url.pathname);

const isLocale = (url) => url.pathname.includes('/locales/');

// Network-first: try the network, fall back to cache on failure.
async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response && response.ok && request.method === 'GET') {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }
        throw e;
    }
}

// Stale-while-revalidate: serve cache immediately, refresh in background.
// When offline, skip the network entirely so we don't generate console
// noise from requests we already know will fail.
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached && self.navigator && self.navigator.onLine === false) {
        return cached;
    }
    const networkPromise = fetch(request)
        .then((response) => {
            if (response && response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => undefined);
    return cached || networkPromise || fetch(request);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') {
        // Mutations are handled by the app layer (offline outbox).
        return;
    }

    const url = new URL(request.url);

    // Only handle same-origin requests.
    if (url.origin !== self.location.origin) {
        return;
    }

    // App navigations → network-first with cached shell fallback.
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const response = await fetch(request);
                    await cacheShell(response);
                    return response;
                } catch (e) {
                    const cache = await caches.open(SHELL_CACHE);
                    const cachedShell =
                        (await cache.match(START_URL)) ||
                        (await cache.match(SHELL_URL)) ||
                        (await cache.match(request));
                    if (cachedShell) {
                        return cachedShell;
                    }
                    throw e;
                }
            })()
        );
        return;
    }

    if (isApiRequest(url)) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    if (isLocale(url)) {
        event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
        return;
    }

    if (isStaticAsset(url)) {
        event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
        return;
    }
});
