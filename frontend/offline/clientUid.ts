import { customAlphabet } from 'nanoid';

// Mirror the backend uid format (backend/utils/uid.js): 15 chars,
// alphabet '0123456789abcdefghijkmnpqrstuvwxyz'. This keeps client-generated
// ids for offline-created entities compatible with the server.
const ALPHABET = '0123456789abcdefghijkmnpqrstuvwxyz';
const generate = customAlphabet(ALPHABET, 15);

export function generateClientUid(): string {
    return generate();
}
