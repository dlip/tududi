const { customAlphabet } = require('nanoid');

function uid() {
    const generate = customAlphabet('0123456789abcdefghijkmnpqrstuvwxyz', 15);
    return generate();
}

// Validate a client-supplied uid: must match the same alphabet/length the
// backend generates (15 chars, alphabet 0-9 + a-z without i, l, o).
const UID_PATTERN = /^[0-9a-hjkmnp-z]{15}$/;

function isValidUid(value) {
    return typeof value === 'string' && UID_PATTERN.test(value);
}

module.exports = { uid, isValidUid };
