// scripts/test-directories.mjs
// Job title and location directory rules: sanitization, matching, conservative
// rewrites, candidate selection and learning. No framework, no network.

import assert from 'node:assert/strict';
import {
    applyTitleCorrection,
    buildTitleIndex,
    decideTitleCorrection,
    describeTitleDecision,
    matchTitle,
    resolveTitle,
    sanitizeJobTitle,
    titleComparisonKey
} from '../job-title-directory.js';
import {
    applyLocationCorrection,
    buildLocationIndex,
    decideLocationCorrection,
    matchLocation,
    parseLocation,
    pickPreferredLocation,
    resolveLocation,
    sanitizeLocation
} from '../job-location-directory.js';
import { parseJobPosting } from '../resume-align.js';
import {
    TITLE_DIRECTORY_BASE
} from '../libs/title-directory-global.js';
import {
    LOCATION_DIRECTORY_BASE
} from '../libs/location-directory-global.js';
import {
    normalizeGlobalTitleDataset,
    normalizePersonalTitleRecords,
    readPersonalTitleRecords,
    learnTitleCorrection,
    listTitleDirectory
} from '../job-title-directory-store.js';
import {
    normalizeGlobalLocationDataset,
    normalizePersonalLocationRecords,
    readPersonalLocationRecords,
    learnLocationCorrection,
    listLocationDirectory
} from '../job-location-directory-store.js';

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
        },
        onChanged: { addListener: () => {} }
    },
    permissions: { contains: async () => true }
};

// --- Shared title behavior ---

assert.equal(sanitizeJobTitle('  Senior Software Engineer  ').normalizedName, 'Senior Software Engineer');
assert.equal(sanitizeJobTitle('Job Title: Staff Engineer').normalizedName, 'Staff Engineer');
assert.equal(sanitizeJobTitle('Position - Data Analyst (Remote)').normalizedName, 'Data Analyst');
assert.equal(sanitizeJobTitle('SENIOR BACKEND ENGINEER').normalizedName, 'Senior Backend Engineer');
assert.equal(sanitizeJobTitle('Req # 12455 Product Designer').normalizedName, 'Product Designer');
assert.equal(sanitizeJobTitle('Job Captain').normalizedName, 'Job Captain');
assert.equal(sanitizeJobTitle('Position 2401 Data Analyst').normalizedName, 'Data Analyst');
assert.equal(sanitizeJobTitle('Product Designer - Full Time').normalizedName, 'Product Designer');
assert.equal(sanitizeJobTitle('Careers').valid, false);
assert.equal(sanitizeJobTitle('https://jobs.example.com/apply').valid, false);
assert.equal(sanitizeJobTitle('We are looking for a great engineer to join our team').valid, false);

assert.equal(titleComparisonKey('Sr. Software Engineer'), titleComparisonKey('Senior Software Engineer'));
assert.equal(titleComparisonKey('SWE'), titleComparisonKey('Software Engineer'));
assert.equal(titleComparisonKey('Engineering Manager'), titleComparisonKey('Eng Manager'));
assert.notEqual(titleComparisonKey('Engineer II'), titleComparisonKey('Engineer III'), 'levels must stay distinct');

const titleIndex = buildTitleIndex({
    globalTitles: [
        { id: 'senior-software-engineer', canonicalName: 'Senior Software Engineer', aliases: ['Sr Software Engineer'] }
    ],
    personalRecords: []
});

assert.equal(matchTitle('Sr. Software Engineer', titleIndex).entry.canonicalName, 'Senior Software Engineer');
assert.equal(matchTitle('Engineering Manager', titleIndex), null);

const globalTitleResolution = resolveTitle('Sr. Software Engineer', { index: titleIndex });
assert.equal(globalTitleResolution.apply, false, 'official titles never rewrite automatically');
assert.equal(globalTitleResolution.value, 'Sr. Software Engineer');
assert.equal(globalTitleResolution.suggestion.canonicalName, 'Senior Software Engineer');

const personalTitleIndex = buildTitleIndex({
    globalTitles: [],
    personalRecords: [{
        id: 'title_senior_software_engineer',
        canonicalName: 'Senior Software Engineer',
        aliases: ['Sr Software Engineer'],
        directoryId: null,
        source: 'user',
        createdAt: 1,
        updatedAt: 1
    }]
});
const personalTitleResolution = resolveTitle('Sr Software Engineer', { index: personalTitleIndex });
assert.equal(personalTitleResolution.apply, true);
assert.equal(personalTitleResolution.value, 'Senior Software Engineer');

const linkedTitleIndex = buildTitleIndex({
    globalTitles: [{ id: 't1', canonicalName: 'Senior Software Engineer', aliases: [] }],
    personalRecords: [{ id: 'p1', canonicalName: 'Senior Software Engineer', aliases: ['Sr Software Engineer'], directoryId: 't1', source: 'user' }]
});
const linkedTitleResolution = resolveTitle('Sr Software Engineer', { index: linkedTitleIndex });
assert.equal(linkedTitleResolution.apply, true, 'a saved alias on an official title still applies');
assert.equal(linkedTitleResolution.value, 'Senior Software Engineer');

const titleDecision = decideTitleCorrection({
    original: 'Sr Software Engineer',
    corrected: 'Senior Software Engineer',
    index: personalTitleIndex
});
assert.equal(titleDecision.status, 'known');
assert.equal(describeTitleDecision(titleDecision).tone, 'good');

const suggestDecision = decideTitleCorrection({
    original: 'Sr Software Eng',
    corrected: 'Senior Software Engineer',
    index: buildTitleIndex({ globalTitles: [], personalRecords: [] })
});
assert.equal(suggestDecision.status, 'new');
const suggested = applyTitleCorrection([], {
    status: 'suggest',
    entry: { id: 'x', canonicalName: 'Senior Software Engineer', aliases: [] },
    sanitized: sanitizeJobTitle('Senior Software Engineer')
}, { original: 'Sr Software Eng', confirmed: false });
assert.equal(suggested.action, 'skipped', 'a suggestion needs confirmation');

const learnedTitle = applyTitleCorrection([], {
    status: 'new',
    sanitized: sanitizeJobTitle('Senior Software Engineer')
}, { original: 'Sr Software Eng' });
assert.equal(learnedTitle.action, 'created');
assert.equal(learnedTitle.records.length, 1);
assert.equal(learnedTitle.records[0].canonicalName, 'Senior Software Engineer');
assert.deepEqual(learnedTitle.records[0].aliases, [], 'abbreviation-only variants share the same key');

const aliasLearnedTitle = applyTitleCorrection([], {
    status: 'new',
    sanitized: sanitizeJobTitle('Senior Software Engineer')
}, { original: 'Senior Software Developer' });
assert.deepEqual(aliasLearnedTitle.records[0].aliases, ['Senior Software Developer']);

// --- Location parsing / formatting ---

assert.equal(parseLocation('Toronto, ON').displayName, 'Toronto, ON');
assert.equal(parseLocation('Toronto, Ontario, Canada').displayName, 'Toronto, Ontario, Canada');
assert.equal(parseLocation('Remote - US').displayName, 'Remote (US)');
assert.equal(parseLocation('Remote (Canada)').displayName, 'Canada (Remote)');
assert.equal(parseLocation('Hybrid — Toronto, ON').displayName, 'Toronto, ON (Hybrid)');
assert.equal(parseLocation('Toronto, ON (Remote)').displayName, 'Toronto, ON (Remote)');
assert.equal(parseLocation('Multiple locations').valid, false);
assert.equal(parseLocation('Anywhere').valid, false);
assert.equal(parseLocation('').valid, false);
assert.equal(sanitizeLocation('  toronto, on  ').displayName, 'Toronto, ON');

const locationIndex = buildLocationIndex({
    globalLocations: [
        {
            id: 'sf',
            canonicalName: 'San Francisco, California, United States',
            displayName: 'San Francisco, CA',
            city: 'San Francisco',
            region: 'California',
            regionCode: 'CA',
            country: 'United States',
            aliases: ['SF', 'San Fran']
        },
        {
            id: 'nyc',
            canonicalName: 'New York City, New York, United States',
            displayName: 'New York City, NY',
            city: 'New York City',
            region: 'New York',
            regionCode: 'NY',
            country: 'United States',
            aliases: ['NYC', 'New York']
        },
        {
            id: 'portland-or',
            canonicalName: 'Portland, Oregon, United States',
            displayName: 'Portland, OR',
            city: 'Portland',
            region: 'Oregon',
            regionCode: 'OR',
            country: 'United States',
            aliases: []
        },
        {
            id: 'portland-me',
            canonicalName: 'Portland, Maine, United States',
            displayName: 'Portland, ME',
            city: 'Portland',
            region: 'Maine',
            regionCode: 'ME',
            country: 'United States',
            aliases: []
        }
    ],
    personalRecords: []
});

assert.equal(matchLocation('San Francisco, CA', locationIndex).entry.id, 'sf');
assert.equal(matchLocation('SF', locationIndex).entry.id, 'sf');
assert.equal(matchLocation('New York, NY', locationIndex).entry.id, 'nyc');
assert.equal(matchLocation('Portland, OR', locationIndex).entry.id, 'portland-or');
assert.equal(matchLocation('Portland', locationIndex), null, 'ambiguous city-only stays unresolved');
assert.equal(matchLocation('Paris, France', locationIndex), null);

const globalLocationResolution = resolveLocation('San Francisco, CA', { index: locationIndex });
assert.equal(globalLocationResolution.apply, false, 'official locations never rewrite automatically');
assert.equal(globalLocationResolution.suggestion.displayName, 'San Francisco, CA');

const personalLocationIndex = buildLocationIndex({
    globalLocations: [],
    personalRecords: [{
        id: 'loc_toronto',
        canonicalName: 'Toronto, ON',
        displayName: 'Toronto, ON',
        city: 'Toronto',
        region: 'Ontario',
        regionCode: 'ON',
        country: 'Canada',
        aliases: ['YYZ', 'Toronto Downtown'],
        directoryId: null,
        source: 'user',
        createdAt: 1,
        updatedAt: 1
    }]
});
const personalLocationResolution = resolveLocation('Toronto Downtown', { index: personalLocationIndex });
assert.equal(personalLocationResolution.apply, true);
assert.equal(personalLocationResolution.value, 'Toronto, ON');

const linkedLocationIndex = buildLocationIndex({
    globalLocations: [{
        id: 'loc_sf',
        canonicalName: 'San Francisco, California, United States',
        displayName: 'San Francisco, CA',
        city: 'San Francisco',
        region: 'California',
        regionCode: 'CA',
        country: 'United States',
        aliases: []
    }],
    personalRecords: [{
        id: 'loc_sf_alias',
        canonicalName: 'San Francisco, California, United States',
        displayName: 'San Francisco, CA',
        city: 'San Francisco',
        region: 'California',
        regionCode: 'CA',
        country: 'United States',
        aliases: ['SF Bay'],
        directoryId: 'loc_sf',
        source: 'user'
    }]
});
const linkedLocationResolution = resolveLocation('SF Bay', { index: linkedLocationIndex });
assert.equal(linkedLocationResolution.apply, true, 'a saved alias on an official location still applies');
assert.equal(linkedLocationResolution.value, 'San Francisco, CA');

assert.deepEqual(
    pickPreferredLocation(['New York, NY', 'Toronto, ON'], 'Toronto, ON'),
    { value: 'Toronto, ON', display: 'Toronto, ON', matched: true, reason: 'profile_match', candidates: ['New York, NY', 'Toronto, ON'] }
);
assert.equal(pickPreferredLocation(['New York, NY', 'Toronto, ON'], 'Vancouver, BC').value, 'New York, NY');
assert.equal(pickPreferredLocation(['New York, NY', 'Toronto, ON'], 'Vancouver, BC').reason, 'jd_primary');
assert.equal(pickPreferredLocation(['Remote (Canada)', 'Toronto, ON'], 'Toronto, ON').value, 'Toronto, ON');
assert.equal(pickPreferredLocation(['Toronto, ON'], 'Toronto, Ontario').value, 'Toronto, ON');
assert.equal(pickPreferredLocation(['Toronto, QC'], 'Toronto, Ontario').value, 'Toronto, QC');
assert.equal(pickPreferredLocation([], 'Toronto, ON').value, '');
assert.equal(pickPreferredLocation(['Portland, OR', 'Toronto, ON'], 'Portland').value, 'Portland, OR');

const locationDecision = decideLocationCorrection({
    original: 'Toronto Downtown',
    corrected: 'Toronto, ON',
    index: personalLocationIndex
});
assert.equal(locationDecision.status, 'known');
const learnedLocation = applyLocationCorrection([], {
    status: 'new',
    sanitized: sanitizeLocation('Toronto, ON')
}, { original: 'T.O.' });
assert.equal(learnedLocation.action, 'created');
assert.equal(learnedLocation.records[0].city, 'Toronto');

// --- parseJobPosting candidates ---

const parsedJd = parseJobPosting({
    title: 'Senior Software Engineer | Acme',
    text: 'Location: Toronto, ON; New York, NY\nRemote friendly',
    structured: {
        title: 'Senior Software Engineer',
        locations: ['Toronto, ON', 'Vancouver, BC'],
        location: 'Toronto, ON'
    }
});
assert.ok(parsedJd.locationCandidates.includes('Toronto, ON'));
assert.ok(parsedJd.locationCandidates.includes('Vancouver, BC'));
assert.ok(parsedJd.locationCandidates.includes('New York, NY'));
assert.equal(parsedJd.location, 'Toronto, ON');

// --- Bundled datasets ---

assert.ok(TITLE_DIRECTORY_BASE.titles.length > 5000, 'bundled title list is substantial');
assert.ok(LOCATION_DIRECTORY_BASE.locations.length > 5000, 'bundled location list is substantial');
assert.ok(normalizeGlobalTitleDataset(TITLE_DIRECTORY_BASE));
assert.ok(normalizeGlobalLocationDataset(LOCATION_DIRECTORY_BASE));
assert.equal(normalizeGlobalTitleDataset({ version: 1, titles: [] }), null);
assert.equal(normalizeGlobalLocationDataset({ version: 0, locations: [{ canonicalName: 'X' }] }), null);

const normalizedTitleRecords = normalizePersonalTitleRecords([{ canonicalName: 'Senior Software Engineer', aliases: ['Sr SWE'] }]);
assert.equal(normalizedTitleRecords.length, 1);
const normalizedLocationRecords = normalizePersonalLocationRecords([{ canonicalName: 'Toronto, ON' }]);
assert.equal(normalizedLocationRecords.length, 1);
assert.equal(normalizedLocationRecords[0].city, 'Toronto');

// --- Persistence ---

await chrome.storage.local.set({ jobTitleDirectory: [], jobLocationDirectory: [] });
const learnedStoreTitle = await learnTitleCorrection({ original: 'Chief Cat Herdr', corrected: 'Chief Cat Herder', confirmed: true });
assert.equal(learnedStoreTitle.action, 'created');
assert.equal((await readPersonalTitleRecords()).length, 1);
assert.equal((await listTitleDirectory()).personal.length, 1);

const learnedStoreLocation = await learnLocationCorrection({ original: 'Wakanda', corrected: 'Wakanda, ON', confirmed: true });
assert.equal(learnedStoreLocation.action, 'created');
assert.equal((await readPersonalLocationRecords()).length, 1);
assert.equal((await listLocationDirectory()).personal.length, 1);

console.log('test:directories — ok');
