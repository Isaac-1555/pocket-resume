// scripts/test-pdfstore.mjs
// Shelf rules for the generated-PDF store: URL keys, eviction, dedupe.
// No framework, no network, no browser.

import assert from 'node:assert/strict';
import { normalizeUrlKey, planStore, getState, savePdf } from '../pdf-store.js';

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

// --- The shelf label never survives a posting change ---
const mem = {};
globalThis.chrome = {
    storage: {
        local: {
            get: async (key) => (key in mem ? { [key]: mem[key] } : {}),
            set: async (payload) => Object.assign(mem, payload)
        }
    }
};

await savePdf({
    kind: 'resume',
    filename: 'Resume_Ada.pdf',
    dataUrl: 'data:application/pdf;base64,AA==',
    size: 10,
    url: 'https://careers.atb.com/jobs/1',
    title: 'Software Developer',
    company: 'ATB'
});
const afterAtb = await getState();
assert.equal(afterAtb.title, 'Software Developer');
assert.equal(afterAtb.company, 'ATB');
assert.equal(afterAtb.items.length, 1);

// A new posting with no company must not inherit ATB.
await savePdf({
    kind: 'resume',
    filename: 'Resume_Ada.pdf',
    dataUrl: 'data:application/pdf;base64,AQ==',
    size: 10,
    url: 'https://helcim.example.com/jobs/2',
    title: 'Software Developer',
    company: ''
});
const afterHelcim = await getState();
assert.equal(afterHelcim.company, '', 'the previous posting company must not leak into the new one');
assert.equal(afterHelcim.title, 'Software Developer');
assert.equal(afterHelcim.items.length, 1);

// The same posting keeps the label when a later file arrives without one.
await savePdf({
    kind: 'cover-letter',
    filename: 'Letter_Ada.pdf',
    dataUrl: 'data:application/pdf;base64,Ag==',
    size: 10,
    url: 'https://helcim.example.com/jobs/2',
    title: '',
    company: ''
});
const afterLetter = await getState();
assert.equal(afterLetter.title, 'Software Developer', 'the same posting keeps its title');
assert.equal(afterLetter.company, '');
assert.equal(afterLetter.items.length, 2);

console.log('test:pdfstore — ok');
