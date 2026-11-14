// job-location-directory-store.js — the local job location directory.
// Global city list (bundled + daily refresh) and the user's own records live
// in chrome.storage.local. Nothing personal leaves the device.

import { LOCATION_DIRECTORY_BASE } from './libs/location-directory-global.js';
import { createDirectoryStore } from './directory-store.js';
import {
    MAX_LOCATION_ALIASES,
    applyLocationCorrection,
    buildLocationIndex,
    cloneLocationRecord,
    decideLocationCorrection,
    describeLocationDecision,
    makeLocationId,
    resolveLocation,
    sanitizeLocation
} from './job-location-directory.js';

export const LOCATION_DIRECTORY_KEY = 'jobLocationDirectory';
export const LOCATION_DIRECTORY_GLOBAL_KEY = 'jobLocationDirectoryGlobal';
export const LOCATION_DIRECTORY_META_KEY = 'jobLocationDirectoryMeta';
export const LOCATION_DIRECTORY_SOURCE_URL = 'https://pocket-resume.xyz/data/locations.json';
export const LOCATION_DIRECTORY_ORIGIN = 'https://pocket-resume.xyz/*';

const MAX_GLOBAL_LOCATIONS = 20000;

export function normalizeGlobalLocationDataset(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const version = Number(payload.version);
    if (!Number.isFinite(version) || version < 1) return null;
    const source = Array.isArray(payload.locations) ? payload.locations : Array.isArray(payload.entries) ? payload.entries : [];
    if (!source.length || source.length > MAX_GLOBAL_LOCATIONS) return null;
    const locations = [];
    const seen = new Set();
    for (const location of source) {
        if (!location || typeof location !== 'object') continue;
        const clean = cloneLocationRecord(location);
        if (!clean) continue;
        const key = clean.canonicalName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        clean.id = String(location.id || key).trim();
        clean.source = 'official';
        locations.push(clean);
    }
    if (!locations.length) return null;
    return {
        version,
        updatedAt: Number(payload.updatedAt) || 0,
        source: String(payload.source || 'PocketResume location directory'),
        entries: locations
    };
}

export function normalizePersonalLocationRecords(payload) {
    if (!Array.isArray(payload)) return [];
    const records = [];
    const seen = new Set();
    for (const item of payload) {
        const record = cloneLocationRecord(item);
        if (!record) continue;
        const key = record.canonicalName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(record);
    }
    return records;
}

const store = createDirectoryStore({
    personalKey: LOCATION_DIRECTORY_KEY,
    globalKey: LOCATION_DIRECTORY_GLOBAL_KEY,
    metaKey: LOCATION_DIRECTORY_META_KEY,
    sourceUrl: LOCATION_DIRECTORY_SOURCE_URL,
    origin: LOCATION_DIRECTORY_ORIGIN,
    normalizePersonalRecords: normalizePersonalLocationRecords,
    normalizeGlobalDataset: normalizeGlobalLocationDataset,
    buildIndex: ({ globalEntries, personalRecords }) => buildLocationIndex({ globalLocations: globalEntries, personalRecords }),
    fallbackGlobal: LOCATION_DIRECTORY_BASE,
    label: 'LocationDirectory'
});

store.registerStorageListener();

export const readPersonalLocationRecords = store.readPersonalRecords;
export const writePersonalLocationRecords = store.writePersonalRecords;
export const readGlobalLocationDataset = store.readGlobalDataset;
export const getLocationDirectory = store.getDirectory;
export const listLocationDirectory = store.listDirectory;
export const invalidateLocationDirectory = store.invalidate;
export const refreshGlobalLocationDirectory = store.refreshGlobal;

export async function resolveLocationName(name) {
    const directory = await getLocationDirectory();
    return resolveLocation(name, { index: directory.index });
}

export async function analyzeLocationCorrection(original, corrected) {
    const directory = await getLocationDirectory();
    const decision = decideLocationCorrection({ original, corrected, index: directory.index });
    return { ...decision, message: describeLocationDecision(decision) };
}

export async function learnLocationCorrection({ original = '', corrected = '', confirmed = false, forceNew = false } = {}) {
    const directory = await getLocationDirectory();
    const decision = decideLocationCorrection({ original, corrected, index: directory.index });
    const result = applyLocationCorrection(directory.personal, decision, { original, confirmed, forceNew });
    if (result.action === 'created' || result.action === 'alias-added') {
        await writePersonalLocationRecords(result.records);
    }
    return { ...result, decision, message: describeLocationDecision(decision) };
}

export async function addPersonalLocation({ canonicalName = '', aliases = [] } = {}) {
    const sanitized = sanitizeLocation(canonicalName);
    if (!sanitized.valid) return { ok: false, error: sanitized.reason };
    const records = await readPersonalLocationRecords();
    const clash = records.find((record) => record.canonicalName.toLowerCase() === sanitized.normalizedName.toLowerCase());
    if (clash) return { ok: false, error: 'duplicate' };
    const cleanAliases = (Array.isArray(aliases) ? aliases : [])
        .map((alias) => sanitizeLocation(alias))
        .filter((alias) => alias.valid)
        .map((alias) => alias.normalizedName)
        .slice(0, MAX_LOCATION_ALIASES);
    const record = {
        id: makeLocationId(sanitized.normalizedName),
        canonicalName: sanitized.normalizedName,
        displayName: sanitized.displayName,
        city: sanitized.city,
        region: sanitized.region,
        regionCode: sanitized.regionCode,
        country: sanitized.country,
        mode: sanitized.mode,
        aliases: cleanAliases,
        directoryId: null,
        source: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    await writePersonalLocationRecords([...records, record]);
    return { ok: true, record };
}

export async function updatePersonalLocation(id, patch = {}) {
    const records = await readPersonalLocationRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const next = { ...current };
    if (patch.canonicalName !== undefined) {
        const sanitized = sanitizeLocation(patch.canonicalName);
        if (!sanitized.valid) return { ok: false, error: sanitized.reason };
        next.canonicalName = sanitized.normalizedName;
        next.displayName = sanitized.displayName;
        next.city = sanitized.city;
        next.region = sanitized.region;
        next.regionCode = sanitized.regionCode;
        next.country = sanitized.country;
        next.mode = sanitized.mode;
    }
    if (Array.isArray(patch.aliases)) {
        next.aliases = patch.aliases
            .map((alias) => sanitizeLocation(alias))
            .filter((alias) => alias.valid)
            .map((alias) => alias.normalizedName)
            .slice(0, MAX_LOCATION_ALIASES);
    }
    next.updatedAt = Date.now();
    const updated = [...records];
    updated[index] = next;
    await writePersonalLocationRecords(updated);
    return { ok: true, record: next };
}

export async function deletePersonalLocation(id) {
    const records = await readPersonalLocationRecords();
    const next = records.filter((record) => record.id !== id);
    if (next.length === records.length) return { ok: false, error: 'not_found' };
    await writePersonalLocationRecords(next);
    return { ok: true };
}

export async function addPersonalLocationAlias(id, alias) {
    const sanitized = sanitizeLocation(alias);
    if (!sanitized.valid) return { ok: false, error: sanitized.reason };
    const records = await readPersonalLocationRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const exists = current.aliases.some((item) => item.toLowerCase() === sanitized.normalizedName.toLowerCase());
    if (exists) return { ok: false, error: 'duplicate' };
    const updated = [...records];
    updated[index] = { ...current, aliases: [...current.aliases, sanitized.normalizedName], updatedAt: Date.now() };
    await writePersonalLocationRecords(updated);
    return { ok: true, record: updated[index] };
}

export async function removePersonalLocationAlias(id, alias) {
    const records = await readPersonalLocationRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const updated = [...records];
    updated[index] = {
        ...current,
        aliases: current.aliases.filter((item) => item.toLowerCase() !== String(alias || '').toLowerCase()),
        updatedAt: Date.now()
    };
    await writePersonalLocationRecords(updated);
    return { ok: true, record: updated[index] };
}

const api = {
    LOCATION_DIRECTORY_KEY,
    LOCATION_DIRECTORY_GLOBAL_KEY,
    LOCATION_DIRECTORY_META_KEY,
    LOCATION_DIRECTORY_SOURCE_URL,
    addPersonalLocation,
    addPersonalLocationAlias,
    analyzeLocationCorrection,
    deletePersonalLocation,
    getLocationDirectory,
    invalidateLocationDirectory,
    learnLocationCorrection,
    listLocationDirectory,
    readGlobalLocationDataset,
    readPersonalLocationRecords,
    refreshGlobalLocationDirectory,
    removePersonalLocationAlias,
    resolveLocationName,
    updatePersonalLocation,
    writePersonalLocationRecords
};

if (typeof window !== 'undefined') {
    window.PocketResumeLocationDirectory = api;
}

export default api;
