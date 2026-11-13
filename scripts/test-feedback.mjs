// scripts/test-feedback.mjs
// Feedback form rules: validation, payload build, error mapping, mailto
// fallback. No framework, no network, no browser.

import assert from 'node:assert/strict';
import {
    FEEDBACK_MAX_LENGTH,
    FEEDBACK_MIN_LENGTH,
    FEEDBACK_OWNER_EMAIL,
    validateFeedback,
    buildFeedbackPayload,
    buildMailtoLink,
    mapFeedbackError
} from '../feedback.js';

const LONG = 'a'.repeat(FEEDBACK_MAX_LENGTH + 1);
const SHORT = 'a'.repeat(FEEDBACK_MIN_LENGTH - 1);
const GOOD = 'The PDF came out with the wrong margins on my second page.';

// --- Validation ---
assert.deepEqual(validateFeedback({ email: 'a@b.co', message: GOOD }), {
    ok: true,
    email: 'a@b.co',
    message: GOOD
});
assert.equal(validateFeedback({ email: '', message: GOOD }).ok, false);
assert.equal(validateFeedback({ email: 'nope', message: GOOD }).ok, false);
assert.equal(validateFeedback({ email: 'a@b', message: GOOD }).ok, false);
assert.equal(validateFeedback({ email: 'a b@c.co', message: GOOD }).ok, false);
assert.equal(validateFeedback({ email: 'a@b.co', message: '' }).ok, false);
assert.equal(validateFeedback({ email: 'a@b.co', message: SHORT }).ok, false);
assert.equal(validateFeedback({ email: 'a@b.co', message: LONG }).ok, false);

// Trimmed on the way in, so "  a@b.co  " is the same address.
assert.equal(validateFeedback({ email: '  a@b.co  ', message: `  ${GOOD}  ` }).email, 'a@b.co');

// --- Payload ---
const built = buildFeedbackPayload({
    email: 'user@example.com',
    message: GOOD,
    pageUrl: 'https://jobs.example.com/1',
    appVersion: '10.13.0',
    browser: 'Chrome',
    userId: 'user_123',
    company: ''
});
assert.equal(built.ok, true);
assert.equal(built.payload.email, 'user@example.com');
assert.equal(built.payload.message, GOOD);
assert.equal(built.payload.pageUrl, 'https://jobs.example.com/1');
assert.equal(built.payload.appVersion, '10.13.0');
assert.equal(built.payload.browser, 'Chrome');
assert.equal(built.payload.userId, 'user_123');

// Empty optional fields stay out of the payload.
const minimal = buildFeedbackPayload({ email: 'user@example.com', message: GOOD });
assert.equal(minimal.ok, true);
assert.deepEqual(Object.keys(minimal.payload).sort(), ['email', 'message']);

// A filled honeypot is carried through so the server can drop the message.
const honey = buildFeedbackPayload({ email: 'user@example.com', message: GOOD, company: 'bot' });
assert.equal(honey.payload.company, 'bot');

// An invalid message never becomes a payload.
assert.equal(buildFeedbackPayload({ email: 'bad', message: GOOD }).ok, false);
assert.equal(buildFeedbackPayload({ email: 'a@b.co', message: '' }).ok, false);

// --- Mailto fallback ---
const link = buildMailtoLink({ email: 'user@example.com', message: GOOD, pageUrl: 'https://jobs.example.com/1' });
assert.ok(link.startsWith(`mailto:${FEEDBACK_OWNER_EMAIL}?subject=`));
assert.ok(decodeURIComponent(link).includes(GOOD));
assert.ok(decodeURIComponent(link).includes('user@example.com'));
assert.ok(decodeURIComponent(link).includes('https://jobs.example.com/1'));

// --- Error mapping ---
assert.match(mapFeedbackError(new Error('ServerError: rate_limited')), /Too many messages/);
assert.match(mapFeedbackError(new Error('invalid_email')), /email address/);
assert.match(mapFeedbackError(new Error('invalid_message')), /too short/);
const aborted = new Error('feedback timeout');
aborted.name = 'AbortError';
assert.match(mapFeedbackError(aborted), /too long/);
assert.match(mapFeedbackError(new Error('network down')), /Could not send/);

console.log('test:feedback — ok');
