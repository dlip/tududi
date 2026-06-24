import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Shared/ToastContext';
import { TelegramStatusProvider } from './contexts/TelegramStatusContext';
import './i18n'; // Import i18n config to initialize it
import './styles/markdown.css'; // Import markdown styles
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n'; // Import the i18n instance with its configuration
import { getBasePath } from './config/paths';
import { setupServiceWorker } from './sw/registerServiceWorker';

// Recover from stale lazy-chunk loads after a deploy. Because bundles are
// content-hashed and old files are removed on each build (webpack
// `output.clean`), a tab that was open across a deploy — or a stale cached
// shell — can try to load a chunk hash that no longer exists, which throws
// a ChunkLoadError and leaves a white screen. Force a single reload to pull
// the current index.html and its current chunk hashes. A sessionStorage
// guard prevents reload loops when the failure is not deploy-related.
function isChunkLoadError(reason: unknown): boolean {
    if (!reason) return false;
    const name = (reason as { name?: string }).name || '';
    const message = (reason as { message?: string }).message || '';
    return (
        name === 'ChunkLoadError' ||
        /Loading (CSS )?chunk [\d]+ failed/i.test(message) ||
        /Loading chunk .* failed/i.test(message) ||
        /import\(\) .*failed/i.test(message)
    );
}

const CHUNK_RELOAD_KEY = 'tududi:chunk-reload';

function handleChunkLoadFailure(reason: unknown): void {
    if (!isChunkLoadError(reason)) return;
    if (!navigator.onLine) return; // Offline chunk misses can't be fixed by reloading.
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return; // Already tried once.
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
}

window.addEventListener('error', (event) => {
    handleChunkLoadFailure((event as ErrorEvent).error);
});
window.addEventListener('unhandledrejection', (event) => {
    handleChunkLoadFailure((event as PromiseRejectionEvent).reason);
});
// Clear the guard once a load fully succeeds so future deploys can recover.
window.addEventListener('load', () => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
});

// Register the service worker (prod) or clean up stale workers (dev).
setupServiceWorker();

const storedPreference = localStorage.getItem('isDarkMode');
const prefersDarkMode = window.matchMedia(
    '(prefers-color-scheme: dark)'
).matches;
const isDarkMode = storedPreference
    ? storedPreference === 'true'
    : prefersDarkMode;

if (isDarkMode) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

const container = document.getElementById('root');

if (container) {
    const root = createRoot(container);
    const basename = getBasePath();
    root.render(
        <I18nextProvider i18n={i18n}>
            <BrowserRouter basename={basename || undefined}>
                <ToastProvider>
                    <TelegramStatusProvider>
                        <App />
                    </TelegramStatusProvider>
                </ToastProvider>
            </BrowserRouter>
        </I18nextProvider>
    );
}
