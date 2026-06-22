/**
 * Connectivity tracking + a tiny pub/sub so the UI can react to
 * online/offline transitions and the outbox can flush on reconnect.
 */

type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();
let started = false;

export function isOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function subscribeConnectivity(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function notify(online: boolean): void {
    listeners.forEach((listener) => {
        try {
            listener(online);
        } catch {
            // listeners must not break each other
        }
    });
}

/**
 * Wire window online/offline events. `onReconnect` is invoked whenever the
 * browser transitions back to online (used to flush the outbox).
 */
export function startConnectivityWatch(onReconnect: () => void): void {
    if (started || typeof window === 'undefined') {
        return;
    }
    started = true;

    window.addEventListener('online', () => {
        notify(true);
        onReconnect();
    });

    window.addEventListener('offline', () => {
        notify(false);
    });
}
