// scripts/test-pdfstore.mjs
// Shelf rules for the generated-PDF store: URL keys, eviction, dedupe.
// No framework, no network, no browser.

import assert from 'node:assert/strict';
import { normalizeUrlKey, planStore } from '../pdf-store.js';

const item = (id, kind) => ({ id, kind, filename: `${id}.pdf`, dataUrl: 'data:application/pdf;base64,AA==', size: 10 });

// --- URL keys ---
assert.equal(normalizeUrlKey('https://jobs.example.com/post/1?utm_source=x&id=7#apply'), 'https://jobs.example.com/post/1?id=7');
assert.equal(normalizeUrlKey('https://Jobs.Example.com/post/1'), 'https://jobs.example.com/post/1');
assert.equal(normalizeUrlKey('https://jobs.example.com/post/1?gh_src=readme'), 'https://jobs.example.com/post/1');
assert.equal(normalizeUrlKey(''), '');
assert.equal(normalizeUrlKey('not a url'), 'not a url');

// --- Same posting: only the same kind is replaced ---
const same = planStore(
    { urlKey: 'https://a.test/1', items: [item('r1', 'resume'), item('l1', 'cover-letter')] },
    { urlKey: 'https://a.test/1', kind: 'resume', item: item('r2', 'resume') }
);
assert.equal(same.wipeAll, false);
assert.deepEqual(same.items.map((entry) => entry.id), ['l1', 'r2']);

// --- New posting: the whole previous set goes ---
const moved = planStore(
    { urlKey: 'https://a.test/1', items: [item('r1', 'resume'), item('l1', 'cover-letter')] },
    { urlKey: 'https://b.test/2', kind: 'cover-letter', item: item('l2', 'cover-letter') }
);
assert.equal(moved.wipeAll, true);
assert.deepEqual(moved.items.map((entry) => entry.id), ['l2']);

// --- Same posting, a second kind arrives ---
const added = planStore(
    { urlKey: 'https://a.test/1', items: [item('r1', 'resume')] },
    { urlKey: 'https://a.test/1', kind: 'cover-letter', item: item('l1', 'cover-letter') }
);
assert.equal(added.wipeAll, false);
assert.deepEqual(added.items.map((entry) => entry.id), ['r1', 'l1']);

// --- Unknown URL keeps the current set ---
const unknown = planStore(
    { urlKey: 'https://a.test/1', items: [item('r1', 'resume'), item('l1', 'cover-letter')] },
    { urlKey: '', kind: 'resume', item: item('r2', 'resume') }
);
assert.equal(unknown.wipeAll, false);
assert.deepEqual(unknown.items.map((entry) => entry.id), ['l1', 'r2']);

// --- No duplicates of the same kind survive ---
const deduped = planStore(
    { urlKey: 'https://a.test/1', items: [item('r1', 'resume'), item('r2', 'resume')] },
    { urlKey: 'https://a.test/1', kind: 'resume', item: item('r3', 'resume') }
);
assert.deepEqual(deduped.items.map((entry) => entry.id), ['r3']);

// --- Empty state is safe ---
const empty = planStore(null, { urlKey: 'https://a.test/1', kind: 'resume', item: item('r1', 'resume') });
assert.deepEqual(empty.items.map((entry) => entry.id), ['r1']);

console.log('test:pdfstore — ok');
