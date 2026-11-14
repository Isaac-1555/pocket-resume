// scripts/test-company-directory.mjs
// Company directory rules: sanitization, matching, learning, persistence and
// the failure fallbacks. No framework, no network, no browser.

import assert from 'node:assert/strict';
import {
    APPLY_CONFIDENCE,
    applyCorrection,
    buildDirectoryIndex,
    comparisonKey,
    decideCorrection,
    describeDecision,
    looseKey,
    matchCompany,
    resolveCompany,
    sanitizeCompanyName,
    suggestCompany
} from '../company-directory.js';
import {
    addPersonalAlias,
    addPersonalCompany,
    analyzeCorrection,
    deletePersonalCompany,
    getDirectory,
    learnCorrection,
    listDirectory,
    normalizeGlobalDataset,
    normalizePersonalRecords,
    readPersonalRecords,
    refreshGlobalDirectory,
    removePersonalAlias,
    resolveCompanyName,
    updatePersonalCompany
} from '../company-directory-store.js';
import { parseJobPosting } from '../resume-align.js';
import { COMPANY_DIRECTORY_BASE } from '../libs/company-directory-global.js';

const mem = {};
globalThis.chrome = {
    storage: {
        local: {
            get: async (key) => {
                if (key === null || key === undefined) return { ...mem };
                if (typeof key === 'string') return key in mem ? { [key]: mem[key] } : {};
                if (Array.isArray(key)) {
                    const out = {};
                    key.forEach((name) => {
                        if (name in mem) out[name] = mem[name];
                    });
                    return out;
                }
                return { ...key };
            },
            set: async (payload) => Object.assign(mem, payload)
        }
    },
    permissions: {
        contains: async () => true
    }
};

const GLOBAL = normalizeGlobalDataset(COMPANY_DIRECTORY_BASE);
assert.ok(GLOBAL, 'the bundled directory must load');
assert.ok(GLOBAL.companies.length > 100, 'the bundled directory ships a usable number of companies');

const INDEX = buildDirectoryIndex({ globalCompanies: GLOBAL.companies, personalRecords: [] });

// --- Sanitization: cleanup ---
assert.equal(sanitizeCompanyName('  Google  ').normalizedName, 'Google');
assert.equal(sanitizeCompanyName('Google    Cloud   Platform').normalizedName, 'Google Cloud Platform');
assert.equal(sanitizeCompanyName('Goog\u200ble').normalizedName, 'Google');
assert.equal(sanitizeCompanyName('"Google"').normalizedName, 'Google');
assert.equal(sanitizeCompanyName('\u201cGoogle\u201d').normalizedName, 'Google');
assert.equal(sanitizeCompanyName('Caf\u00e9 Lt\u00e9e').normalizedName, 'Caf\u00e9 Lt\u00e9e');
assert.equal(sanitizeCompanyName('AT&amp;T Labs').normalizedName, 'AT&T Labs');

// --- Sanitization: casing ---
assert.equal(sanitizeCompanyName('GOOGLE').normalizedName, 'Google');
assert.equal(sanitizeCompanyName('MICROSOFT').normalizedName, 'Microsoft');
assert.equal(sanitizeCompanyName('amazon').normalizedName, 'Amazon');
assert.equal(sanitizeCompanyName('IBM').normalizedName, 'IBM');
assert.equal(sanitizeCompanyName('ATB').normalizedName, 'ATB');
assert.equal(sanitizeCompanyName('eBay').normalizedName, 'eBay');
assert.equal(sanitizeCompanyName('3M').normalizedName, '3M');

// --- Sanitization: legal suffixes are kept in the stored name ---
assert.equal(sanitizeCompanyName('Google, Inc.').normalizedName, 'Google, Inc.');
assert.equal(sanitizeCompanyName('Google Inc').normalizedName, 'Google Inc');
assert.equal(sanitizeCompanyName('Google LLC').normalizedName, 'Google LLC');
assert.equal(sanitizeCompanyName('Google Ltd.').normalizedName, 'Google Ltd.');
assert.equal(sanitizeCompanyName('Google Limited').normalizedName, 'Google Limited');
assert.equal(looseKey('Google LLC'), 'google');
assert.equal(looseKey('Google, Inc.'), 'google');
assert.equal(comparisonKey('Google LLC'), 'google llc');

// --- Sanitization: invalid input ---
assert.equal(sanitizeCompanyName('').valid, false);
assert.equal(sanitizeCompanyName('   ').valid, false);
assert.equal(sanitizeCompanyName(null).valid, false);
assert.equal(sanitizeCompanyName('Senior Developer').valid, false);
assert.equal(sanitizeCompanyName('Senior Developer').reason, 'job_title');
assert.equal(sanitizeCompanyName('Product Manager').reason, 'job_title');
assert.equal(sanitizeCompanyName('Company').valid, false);
assert.equal(sanitizeCompanyName('Employer').valid, false);
assert.equal(sanitizeCompanyName('Engineering').reason, 'department');
assert.equal(sanitizeCompanyName('Apply now').reason, 'navigation');
assert.equal(sanitizeCompanyName('https://example.com/careers').reason, 'url');
assert.equal(sanitizeCompanyName('jobs@example.com').reason, 'email');
assert.equal(sanitizeCompanyName('12345').valid, false);
assert.equal(sanitizeCompanyName('!!! ???').valid, false);
assert.equal(sanitizeCompanyName('A'.repeat(200)).reason, 'too_long');
assert.equal(sanitizeCompanyName('We are hiring great engineers').reason, 'job_title');
assert.equal(sanitizeCompanyName('We are building something great here').reason, 'sentence');
// Unusual but legitimate names stay valid.
assert.equal(sanitizeCompanyName('ZEISS').valid, true);
assert.equal(sanitizeCompanyName('Booz Allen Hamilton').valid, true);
assert.equal(sanitizeCompanyName('Bank of America').valid, true);
assert.equal(sanitizeCompanyName('3M').valid, true);

// --- Matching ---
const google = matchCompany('Google', INDEX);
assert.equal(google.entry.canonicalName, 'Google');
assert.equal(google.matchType, 'canonical');
assert.equal(google.confidence, 1);

const alias = matchCompany('Google Inc.', INDEX);
assert.equal(alias.entry.canonicalName, 'Google');
assert.equal(alias.matchType, 'alias');

const lower = matchCompany('google', INDEX);
assert.equal(lower.entry.canonicalName, 'Google');

const punct = matchCompany('Google, Inc.', INDEX);
assert.equal(punct.entry.canonicalName, 'Google');
assert.equal(punct.matchType, 'alias');

const loose = matchCompany('Microsoft, Inc.', INDEX);
assert.equal(loose.entry.canonicalName, 'Microsoft');
assert.equal(loose.matchType, 'normalized');
assert.equal(loose.confidence, APPLY_CONFIDENCE);

const legal = matchCompany('Google LLC', INDEX);
assert.equal(legal.entry.canonicalName, 'Google');
assert.equal(legal.matchType, 'alias');

assert.equal(matchCompany('Goober Systems', INDEX), null);

// --- Fuzzy suggestions ---
const typo = suggestCompany('Gooogle', INDEX);
assert.ok(typo, 'a typo must produce a suggestion');
assert.equal(typo.entry.canonicalName, 'Google');
const typoMicrosoft = suggestCompany('Microsft', INDEX);
assert.ok(typoMicrosoft, 'a typo must produce a suggestion');
assert.equal(typoMicrosoft.entry.canonicalName, 'Microsoft');

// A fuzzy match is a suggestion, never a silent merge.
const fuzzy = resolveCompany('Gooogle', { index: INDEX });
assert.equal(fuzzy.value, 'Gooogle', 'a fuzzy match must not rewrite the value');
assert.equal(fuzzy.matchType, 'none');
assert.equal(fuzzy.suggestion.canonicalName, 'Google');

// --- Resolution ---
const resolvedAlias = resolveCompany('Google LLC', { index: INDEX, source: 'structured' });
assert.equal(resolvedAlias.value, 'Google');
assert.equal(resolvedAlias.originalValue, 'Google LLC');
assert.equal(resolvedAlias.matchType, 'alias');
assert.equal(resolvedAlias.directoryId, 'google');
assert.equal(resolvedAlias.confidence, 0.95);
assert.equal(resolvedAlias.source, 'structured');

const resolvedEmpty = resolveCompany('', { index: INDEX, url: 'https://careers.google.com/jobs/1' });
assert.equal(resolvedEmpty.value, 'Google');
assert.equal(resolvedEmpty.matchType, 'domain');
assert.equal(resolvedEmpty.confidence, 0.85);

const resolvedUnknown = resolveCompany('Totally Unknown Employer', { index: INDEX });
assert.equal(resolvedUnknown.value, 'Totally Unknown Employer');
assert.equal(resolvedUnknown.matchType, 'none');
assert.equal(resolvedUnknown.confidence, 0);

// --- Personal entries outrank the global directory ---
const personalIndex = buildDirectoryIndex({
    globalCompanies: GLOBAL.companies,
    personalRecords: [{
        id: 'company_acme',
        canonicalName: 'Acme Corporation',
        aliases: ['Google Inc.'],
        domains: [],
        directoryId: null,
        source: 'user',
        createdAt: 1,
        updatedAt: 1
    }]
});
const personalHit = matchCompany('Google Inc.', personalIndex);
assert.equal(personalHit.entry.canonicalName, 'Acme Corporation');
assert.equal(personalHit.entry.source, 'user');

// A personal record can add an alias to a global company without touching it.
const linkedIndex = buildDirectoryIndex({
    globalCompanies: GLOBAL.companies,
    personalRecords: [{
        id: 'company_google_ca',
        canonicalName: 'Google',
        aliases: ['Google Canada Ltd'],
        domains: [],
        directoryId: 'google',
        source: 'user',
        createdAt: 1,
        updatedAt: 1
    }]
});
const linkedHit = matchCompany('Google Canada Ltd', linkedIndex);
assert.equal(linkedHit.entry.canonicalName, 'Google');
assert.equal(linkedHit.entry.source, 'official');
assert.ok(!GLOBAL.companies.some((company) => company.id === 'google' && company.aliases.includes('Google Canada Ltd')));

// --- Learning decisions ---
const known = decideCorrection({ original: 'Google Inc.', corrected: 'Google', index: INDEX });
assert.equal(known.status, 'known');
assert.equal(known.entry.canonicalName, 'Google');

const knownAlias = decideCorrection({ original: 'GOOGLE', corrected: 'Google Inc.', index: INDEX });
assert.equal(knownAlias.status, 'known');
assert.equal(knownAlias.matchType, 'alias');

const suggest = decideCorrection({ original: 'Google', corrected: 'Google Cloud Canada', index: INDEX });
assert.equal(suggest.status, 'suggest');
assert.equal(suggest.entry.canonicalName, 'Google');

const knownAliasCorrection = decideCorrection({ original: 'Microsoft', corrected: 'Microsoft Canada', index: INDEX });
assert.equal(knownAliasCorrection.status, 'known');
assert.equal(knownAliasCorrection.matchType, 'alias');

const fresh = decideCorrection({ original: 'Unknown Company Ltd.', corrected: 'Unknown Company Ltd.', index: INDEX });
assert.equal(fresh.status, 'new');

const freshWithVariant = decideCorrection({ original: 'Acme Recruiting Ltd.', corrected: 'Acme Corporation', index: INDEX });
assert.equal(freshWithVariant.status, 'new');

const invalidDecision = decideCorrection({ original: 'Google', corrected: 'Senior Developer', index: INDEX });
assert.equal(invalidDecision.status, 'invalid');
assert.equal(invalidDecision.reason, 'job_title');

// --- Learning writes ---
const noneWrite = applyCorrection([], known, { original: 'Google Inc.', now: 1 });
assert.equal(noneWrite.action, 'none');
assert.equal(noneWrite.records.length, 0);

const created = applyCorrection([], fresh, { original: 'Unknown Company Ltd.', now: 2 });
assert.equal(created.action, 'created');
assert.equal(created.records.length, 1);
assert.equal(created.records[0].canonicalName, 'Unknown Company Ltd.');
assert.equal(created.records[0].source, 'user');
assert.deepEqual(created.records[0].aliases, []);
assert.equal(created.records[0].createdAt, 2);
assert.equal(created.records[0].updatedAt, 2);

const createdWithVariant = applyCorrection([], freshWithVariant, { original: 'Acme Recruiting Ltd.', now: 2 });
assert.equal(createdWithVariant.action, 'created');
assert.equal(createdWithVariant.records[0].canonicalName, 'Acme Corporation');
assert.deepEqual(createdWithVariant.records[0].aliases, ['Acme Recruiting Ltd.']);

const skipped = applyCorrection([], suggest, { original: 'Google', now: 3 });
assert.equal(skipped.action, 'skipped');
assert.equal(skipped.records.length, 0, 'a fuzzy match is never merged without a confirmation');

const aliased = applyCorrection([], suggest, { original: 'Google', confirmed: true, now: 4 });
assert.equal(aliased.action, 'alias-added');
assert.equal(aliased.records.length, 1);
assert.equal(aliased.records[0].directoryId, 'google');
assert.deepEqual(aliased.records[0].aliases, ['Google Cloud Canada']);

const forced = applyCorrection([], suggest, { original: 'Google', forceNew: true, now: 5 });
assert.equal(forced.action, 'created');
assert.equal(forced.records[0].canonicalName, 'Google Cloud Canada');
assert.equal(forced.records[0].directoryId, null);

const invalidWrite = applyCorrection([], invalidDecision, { original: 'Google', now: 6 });
assert.equal(invalidWrite.action, 'invalid');
assert.equal(invalidWrite.records.length, 0);

const knownAliasWrite = applyCorrection([], knownAlias, { original: 'GOOGLE INC', now: 7 });
assert.equal(knownAliasWrite.action, 'none', 'a suffix variant of a known name teaches nothing new');

// A known personal company learns the DOM variant as one of its aliases.
const personalRecords = [{
    id: 'company_acme',
    canonicalName: 'Acme Corporation',
    aliases: [],
    domains: [],
    directoryId: null,
    source: 'user',
    createdAt: 1,
    updatedAt: 1
}];
const personalIndex2 = buildDirectoryIndex({ globalCompanies: GLOBAL.companies, personalRecords });
const acmeKnown = decideCorrection({ original: 'Acme Recruiting Ltd.', corrected: 'Acme Corporation', index: personalIndex2 });
assert.equal(acmeKnown.status, 'known');
const acmeWrite = applyCorrection(personalRecords, acmeKnown, { original: 'Acme Recruiting Ltd.', now: 9 });
assert.equal(acmeWrite.action, 'alias-added');
assert.equal(acmeWrite.records[0].aliases[0], 'Acme Recruiting Ltd.');

// A second identical correction never duplicates the record.
const twice = applyCorrection(created.records, fresh, { original: 'Unknown Company Ltd.', now: 8 });
assert.equal(twice.action, 'none');
assert.equal(twice.records.length, 1);

// --- Storage: personal records ---
assert.deepEqual(normalizePersonalRecords('not an array'), []);
assert.deepEqual(normalizePersonalRecords([{ canonicalName: '' }]), []);
assert.equal(normalizePersonalRecords([{ canonicalName: 'Acme' }, { canonicalName: 'acme' }]).length, 1);

await addPersonalCompany({ canonicalName: 'Acme Corporation', aliases: ['Acme Inc.'] });
let stored = await readPersonalRecords();
assert.equal(stored.length, 1);
assert.equal(stored[0].canonicalName, 'Acme Corporation');
assert.deepEqual(stored[0].aliases, ['Acme Inc.']);

const duplicate = await addPersonalCompany({ canonicalName: 'acme corporation' });
assert.equal(duplicate.ok, false);
assert.equal(duplicate.error, 'duplicate');

const badCompany = await addPersonalCompany({ canonicalName: 'Senior Developer' });
assert.equal(badCompany.ok, false);

const updated = await updatePersonalCompany(stored[0].id, { canonicalName: 'Acme Corp.' });
assert.equal(updated.ok, true);
assert.equal(updated.record.canonicalName, 'Acme Corp.');

const aliasAdded = await addPersonalAlias(stored[0].id, 'Acme Limited');
assert.equal(aliasAdded.ok, true);
assert.ok(aliasAdded.record.aliases.includes('Acme Limited'));

const aliasRemoved = await removePersonalAlias(stored[0].id, 'Acme Limited');
assert.equal(aliasRemoved.ok, true);
assert.ok(!aliasRemoved.record.aliases.includes('Acme Limited'));

await deletePersonalCompany(stored[0].id);
stored = await readPersonalRecords();
assert.equal(stored.length, 0);

// --- Storage: corrupted values fall back instead of breaking ---
mem.companyDirectory = { nope: true };
assert.deepEqual(await readPersonalRecords(), []);
mem.companyDirectoryGlobal = { version: 'x', companies: 'nope' };
assert.equal(normalizeGlobalDataset(mem.companyDirectoryGlobal), null);
const directory = await getDirectory();
assert.ok(directory.index.entries.length > 100, 'a broken stored dataset falls back to the bundled one');
delete mem.companyDirectory;
delete mem.companyDirectoryGlobal;

// --- Integration: the deterministic engine keeps its own extraction ---
const jd = parseJobPosting({
    title: 'Senior Engineer - Google Careers',
    text: 'We are looking for a senior engineer.\nCompany: Google LLC\nLocation: Mountain View, CA',
    structured: { company: 'Google LLC', title: 'Senior Engineer' }
});
assert.equal(jd.company, 'Google LLC', 'the DOM value is untouched');
assert.equal(jd.companySource, 'structured');

const resolvedJob = await resolveCompanyName(jd.company, { url: 'https://careers.google.com/jobs/1', source: jd.companySource });
assert.equal(resolvedJob.value, 'Google');
assert.equal(resolvedJob.originalValue, 'Google LLC');
assert.equal(resolvedJob.matchType, 'alias');
assert.ok(resolvedJob.confidence >= APPLY_CONFIDENCE);

// --- Integration: a correction is learned and recognized next time ---
const analysis = await analyzeCorrection('Acme Recruiting', 'Acme Corporation');
assert.equal(analysis.status, 'new');

const learned = await learnCorrection({ original: 'Acme Recruiting', corrected: 'Acme Corporation' });
assert.equal(learned.action, 'created');
assert.equal(learned.records.length, 1);

const learnedHit = await resolveCompanyName('Acme Recruiting', { source: 'structured' });
assert.equal(learnedHit.value, 'Acme Corporation');
assert.equal(learnedHit.matchType, 'alias');

const secondCorrection = await learnCorrection({ original: 'Acme Recruiting', corrected: 'Acme Corporation' });
assert.equal(secondCorrection.action, 'none', 'the same correction never duplicates the record');
assert.equal((await readPersonalRecords()).length, 1);

// --- Integration: the directory survives a restart ---
const reopened = await listDirectory();
assert.equal(reopened.personal.length, 1);
assert.equal(reopened.personal[0].canonicalName, 'Acme Corporation');
assert.ok(reopened.global.length > 100);

// --- Integration: no network is needed to resolve ---
const offline = await resolveCompanyName('Google Inc.', { source: 'structured' });
assert.equal(offline.value, 'Google');

// --- Integration: the refresh keeps the last good copy when it fails ---
globalThis.fetch = async () => {
    throw new Error('offline');
};
const failed = await refreshGlobalDirectory({ force: true });
assert.equal(failed.status, 'error');
assert.ok(failed.meta.lastError);
const afterFailure = await resolveCompanyName('Google Inc.', {});
assert.equal(afterFailure.value, 'Google');

globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ version: 99, companies: [{ id: 'acme', canonicalName: 'Acme Corp' }] })
});
const refreshed = await refreshGlobalDirectory({ force: true });
assert.equal(refreshed.status, 'updated');
assert.equal(refreshed.meta.version, 99);
const afterRefresh = await resolveCompanyName('Acme Corp', {});
assert.equal(afterRefresh.value, 'Acme Corp');

// A malformed payload never replaces the working copy.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ companies: 'nope' }) });
const malformed = await refreshGlobalDirectory({ force: true });
assert.equal(malformed.status, 'error');
const afterMalformed = await resolveCompanyName('Acme Corp', {});
assert.equal(afterMalformed.value, 'Acme Corp');

// --- Decision copy ---
assert.match(describeDecision({ status: 'known', entry: { canonicalName: 'Google', source: 'official' } }).text, /Google/);
assert.match(describeDecision({ status: 'invalid', reason: 'job_title' }).text, /job title/);
assert.match(describeDecision({ status: 'new' }).text, /added/);

console.log('test:companydir — ok');
