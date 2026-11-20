// scripts/test-jdcorrections.mjs
// Remembered job-detail corrections: exact URL, path drift, raw signature,
// legacy entries, the storage round trip and the per-session fallback.
// No framework, no network, no browser.

import assert from 'node:assert/strict';
import {
    normalizeUrlKey,
    looseUrlKey,
    postingSignature,
    normalizeEntry,
    mergeFields,
    pickEntry,
    planSave,
    readStore,
    read,
    save
} from '../jd-corrections.js';

function installStorage(initial = {}) {
    const data = { ...initial };
    globalThis.chrome = {
        storage: {
            local: {
                get: async (key) => {
                    if (typeof key === 'string') return { [key]: data[key] };
                    if (Array.isArray(key)) {
                        const out = {};
                        key.forEach((name) => { out[name] = data[name]; });
                        return out;
                    }
                    return { ...data };
                },
                set: async (values) => { Object.assign(data, JSON.parse(JSON.stringify(values))); }
            }
        }
    };
    return data;
}

const url = 'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123&utm_source=mail';
const meta = { title: 'Software Engineer', company: 'Acme', location: 'Toronto, ON', recruiterName: '' };
const fixed = { title: 'Senior Software Engineer', company: 'Acme Corporation', location: 'Toronto, ON', recruiterName: 'Dana' };
const raw = { title: 'Software Engineer II', company: 'Acme' };

// --- URL keys ---
assert.equal(normalizeUrlKey(url), 'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123');
assert.equal(looseUrlKey(url), 'https://boards.greenhouse.io/acme/jobs/123');
assert.equal(looseUrlKey('not a url'), 'not a url');
assert.equal(postingSignature({ title: 'Software Engineer II', company: 'Acme' }), 'acme|software engineer ii');
assert.equal(postingSignature({}), '');

// --- Entry shapes ---
const legacy = normalizeEntry({ title: 'Acme Corporation', updatedAt: 7 });
assert.deepEqual(legacy.fields, { title: 'Acme Corporation' });
assert.equal(legacy.updatedAt, 7);
const nested = normalizeEntry({ fields: { company: 'Acme Corporation' }, updatedAt: 9, urlKey: 'k' });
assert.deepEqual(nested.fields, { company: 'Acme Corporation' });
assert.equal(normalizeEntry(null), null);
assert.equal(normalizeEntry({}), null);

// --- Merge keeps untouched fields from the page ---
assert.deepEqual(mergeFields(meta, { company: 'Acme Corporation' }), {
    title: 'Software Engineer',
    company: 'Acme Corporation',
    location: 'Toronto, ON',
    recruiterName: ''
});
assert.deepEqual(mergeFields(meta, null), meta);

// --- Save then read the same posting ---
installStorage();
const savedEntry = await save(url, meta, fixed, raw);
assert.deepEqual(savedEntry.fields, {
    title: 'Senior Software Engineer',
    company: 'Acme Corporation',
    recruiterName: 'Dana'
}, 'only the edited fields are stored');

const stored = await readStore();
assert.ok(stored[savedEntry.urlKey], 'stored under the exact URL key');
assert.equal(stored[savedEntry.urlKey].looseKey, looseUrlKey(url));
assert.equal(stored[savedEntry.urlKey].signature, postingSignature(raw));

const match = await read(url, raw);
assert.deepEqual(match.fields, savedEntry.fields, 'the resume fix is remembered');

// --- A tracking-param change still matches ---
assert.deepEqual((await read('https://boards.greenhouse.io/acme/jobs/123?gh_jid=123&ref=home', raw)).fields, savedEntry.fields);

// --- A changed query keeps the path match ---
const shifted = 'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123&session=abc';
assert.deepEqual((await read(shifted, raw)).fields, savedEntry.fields, 'a new session param does not lose the fix');

// --- A path change (/apply) is caught by the raw signature ---
const applyUrl = 'https://boards.greenhouse.io/acme/jobs/123/apply';
assert.deepEqual((await read(applyUrl, raw)).fields, savedEntry.fields, 'the raw title and company find the posting again');

// --- A different posting is never inherited ---
assert.equal(await read('https://boards.greenhouse.io/other/jobs/999', { title: 'Data Engineer', company: 'Other Co' }), null);

// --- A repeated save does not duplicate the entry ---
const secondEntry = await save(url, meta, fixed, raw);
assert.equal(secondEntry.urlKey, savedEntry.urlKey);
assert.equal(Object.keys(await readStore()).length, 1);

// --- Clearing every field drops the entry ---
await save(url, meta, meta, raw);
assert.equal(Object.keys(await readStore()).length, 0, 'no changes means no entry');

// --- The cap keeps the newest ten ---
installStorage();
for (let index = 0; index < 13; index++) {
    await save(`https://jobs.test/${index}`, { title: `Role ${index}` }, { title: `Fixed ${index}` }, { title: `Role ${index}` });
}
const capped = await readStore();
assert.equal(Object.keys(capped).length, 10);

// --- Legacy flat entries are still read ---
const legacyKey = normalizeUrlKey('https://jobs.test/legacy');
installStorage({ jdCorrections: { [legacyKey]: { title: 'Staff Engineer', updatedAt: Date.now() } } });
const legacyRead = await read('https://jobs.test/legacy', {});
assert.deepEqual(legacyRead.fields, { title: 'Staff Engineer' });
assert.equal(mergeFields({ title: 'Engineer' }, legacyRead.fields).title, 'Staff Engineer');

// --- Pick order: exact beats path beats signature ---
const now = Date.now();
const store = {
    a: { fields: { title: 'A' }, updatedAt: now - 1000, urlKey: 'https://jobs.test/p?a=1', looseKey: 'https://jobs.test/p', signature: 'acme|engineer' },
    b: { fields: { title: 'B' }, updatedAt: now - 2000, urlKey: 'https://jobs.test/p?a=2', looseKey: 'https://jobs.test/p', signature: 'acme|engineer' },
    c: { fields: { title: 'C' }, updatedAt: now - 3000, urlKey: 'https://jobs.test/q', looseKey: 'https://jobs.test/q', signature: 'globex|engineer' }
};
assert.equal(pickEntry(store, { url: 'https://jobs.test/p?a=1' }).fields.title, 'A');
assert.equal(pickEntry(store, { url: 'https://jobs.test/p?a=9' }).fields.title, 'A', 'the newest path match wins');
assert.equal(pickEntry(store, { url: 'https://jobs.test/unknown', raw: { title: 'Engineer', company: 'Globex' } }).fields.title, 'C');
assert.equal(pickEntry(store, { url: 'https://jobs.test/unknown', raw: { title: 'Engineer', company: 'Acme' } }), null, 'an ambiguous signature never guesses');

// --- A stale signature is ignored ---
installStorage();
const stale = planSave({}, {
    url: 'https://jobs.test/stale',
    extracted: { title: 'Role' },
    values: { title: 'Fixed' },
    raw: { title: 'Role' },
    now: Date.now() - (13 * 60 * 60 * 1000)
});
installStorage({ jdCorrections: stale.store });
assert.equal(await read('https://jobs.test/other', { title: 'Role' }), null, 'a twelve-hour-old memory is not reused');

// --- Plan is pure ---
const before = JSON.stringify(store);
planSave(store, { url: 'https://jobs.test/p?a=1', extracted: { title: 'A' }, values: { title: 'Z' }, raw: {} });
assert.equal(JSON.stringify(store), before, 'planSave never mutates the store it was given');

console.log('test:jdcorrections — ok');
