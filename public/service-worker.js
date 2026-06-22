/* tududi service worker — app shell + offline read caching.
 *
 * Offline WRITE handling (queueing mutations) is done in the application
 * layer (see frontend/offline/*). This service worker only deals with
 * caching so the app shell and last-known GET responses are available
 * offline.
 */

const VERSION = 'v1';
const SHELL_CACHE = `tududi-shell-${VERSION}`;
const ASSET_CACHE = `tududi-assets-${VERSION}`;
const API_CACHE = `tududi-api-${VERSION}`;

const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE, API_CACHE];

// Resolve the app base path from the SW scope so it works under a
// sub-path (e.g. Home Assistant ingress) as well as at the root.
const SCOPE_URL = new URL(self.registration.scope);
const BASE_PATH = SCOPE_URL.pathname.replace(/\/$/, '');
const SHELL_URL = `${BASE_PATH}/index.html`;

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(SHELL_CACHE);
                await cache.add(
                    new Request(SHELL_URL, { cache: 'reload' })
                );
            } catch (e) {
                // Shell pre-cache is best-effort; it will be populated on
                // the first successful navigation otherwise.
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
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
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
                    const cache = await caches.open(SHELL_CACHE);
                    cache.put(SHELL_URL, response.clone());
                    return response;
                } catch (e) {
                    const cache = await caches.open(SHELL_CACHE);
                    const cachedShell =
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
