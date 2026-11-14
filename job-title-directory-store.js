// job-title-directory-store.js — the local job title directory.
// Global O*NET titles (bundled + daily refresh) and the user's own records
// live in chrome.storage.local. Nothing personal leaves the device.

import { TITLE_DIRECTORY_BASE } from './libs/title-directory-global.js';
import { createDirectoryStore } from './directory-store.js';
import {
    MAX_TITLE_ALIASES,
    applyTitleCorrection,
    buildTitleIndex,
    cloneTitleRecord,
    decideTitleCorrection,
    describeTitleDecision,
    makeTitleId,
    resolveTitle,
    sanitizeJobTitle
} from './job-title-directory.js';

export const TITLE_DIRECTORY_KEY = 'jobTitleDirectory';
export const TITLE_DIRECTORY_GLOBAL_KEY = 'jobTitleDirectoryGlobal';
export const TITLE_DIRECTORY_META_KEY = 'jobTitleDirectoryMeta';
export const TITLE_DIRECTORY_SOURCE_URL = 'https://pocket-resume.xyz/data/titles.json';
export const TITLE_DIRECTORY_ORIGIN = 'https://pocket-resume.xyz/*';

const MAX_GLOBAL_TITLES = 20000;

export function normalizeGlobalTitleDataset(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const version = Number(payload.version);
    if (!Number.isFinite(version) || version < 1) return null;
    const source = Array.isArray(payload.titles) ? payload.titles : Array.isArray(payload.entries) ? payload.entries : [];
    if (!source.length || source.length > MAX_GLOBAL_TITLES) return null;
    const titles = [];
    const seen = new Set();
    for (const title of source) {
        if (!title || typeof title !== 'object') continue;
        const canonicalName = String(title.canonicalName || '').trim();
        if (!canonicalName) continue;
        const key = canonicalName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        titles.push({
            id: String(title.id || key).trim(),
            canonicalName,
            aliases: Array.isArray(title.aliases) ? title.aliases.slice(0, MAX_TITLE_ALIASES) : [],
            source: 'official'
        });
    }
    if (!titles.length) return null;
    return {
        version,
        updatedAt: Number(payload.updatedAt) || 0,
        source: String(payload.source || 'PocketResume job title directory'),
        entries: titles
    };
}

export function normalizePersonalTitleRecords(payload) {
    if (!Array.isArray(payload)) return [];
    const records = [];
    const seen = new Set();
    for (const item of payload) {
        const record = cloneTitleRecord(item);
        if (!record || !record.canonicalName) continue;
        const key = record.canonicalName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(record);
    }
    return records;
}

const store = createDirectoryStore({
    personalKey: TITLE_DIRECTORY_KEY,
    globalKey: TITLE_DIRECTORY_GLOBAL_KEY,
    metaKey: TITLE_DIRECTORY_META_KEY,
    sourceUrl: TITLE_DIRECTORY_SOURCE_URL,
    origin: TITLE_DIRECTORY_ORIGIN,
    normalizePersonalRecords: normalizePersonalTitleRecords,
    normalizeGlobalDataset: normalizeGlobalTitleDataset,
    buildIndex: ({ globalEntries, personalRecords }) => buildTitleIndex({ globalTitles: globalEntries, personalRecords }),
    fallbackGlobal: TITLE_DIRECTORY_BASE,
    label: 'TitleDirectory'
});

store.registerStorageListener();

export const readPersonalTitleRecords = store.readPersonalRecords;
export const writePersonalTitleRecords = store.writePersonalRecords;
export const readGlobalTitleDataset = store.readGlobalDataset;
export const getTitleDirectory = store.getDirectory;
export const listTitleDirectory = store.listDirectory;
export const invalidateTitleDirectory = store.invalidate;
export const refreshGlobalTitleDirectory = store.refreshGlobal;

export async function resolveTitleName(name) {
    const directory = await getTitleDirectory();
    return resolveTitle(name, { index: directory.index });
}

export async function analyzeTitleCorrection(original, corrected) {
    const directory = await getTitleDirectory();
    const decision = decideTitleCorrection({ original, corrected, index: directory.index });
    return { ...decision, message: describeTitleDecision(decision) };
}

export async function learnTitleCorrection({ original = '', corrected = '', confirmed = false, forceNew = false } = {}) {
    const directory = await getTitleDirectory();
    const decision = decideTitleCorrection({ original, corrected, index: directory.index });
    const result = applyTitleCorrection(directory.personal, decision, { original, confirmed, forceNew });
    if (result.action === 'created' || result.action === 'alias-added') {
        await writePersonalTitleRecords(result.records);
    }
    return { ...result, decision, message: describeTitleDecision(decision) };
}

export async function addPersonalTitle({ canonicalName = '', aliases = [] } = {}) {
    const sanitized = sanitizeJobTitle(canonicalName);
    if (!sanitized.valid) return { ok: false, error: sanitized.reason };
    const records = await readPersonalTitleRecords();
    const clash = records.find((record) => record.canonicalName.toLowerCase() === sanitized.normalizedName.toLowerCase());
    if (clash) return { ok: false, error: 'duplicate' };
    const cleanAliases = (Array.isArray(aliases) ? aliases : [])
        .map((alias) => sanitizeJobTitle(alias))
        .filter((alias) => alias.valid)
        .map((alias) => alias.normalizedName)
        .slice(0, MAX_TITLE_ALIASES);
    const record = {
        id: makeTitleId(sanitized.normalizedName),
        canonicalName: sanitized.normalizedName,
        aliases: cleanAliases,
        directoryId: null,
        source: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    await writePersonalTitleRecords([...records, record]);
    return { ok: true, record };
}

export async function updatePersonalTitle(id, patch = {}) {
    const records = await readPersonalTitleRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const next = { ...current };
    if (patch.canonicalName !== undefined) {
        const sanitized = sanitizeJobTitle(patch.canonicalName);
        if (!sanitized.valid) return { ok: false, error: sanitized.reason };
        next.canonicalName = sanitized.normalizedName;
    }
    if (Array.isArray(patch.aliases)) {
        next.aliases = patch.aliases
            .map((alias) => sanitizeJobTitle(alias))
            .filter((alias) => alias.valid)
            .map((alias) => alias.normalizedName)
            .slice(0, MAX_TITLE_ALIASES);
    }
    next.updatedAt = Date.now();
    const updated = [...records];
    updated[index] = next;
    await writePersonalTitleRecords(updated);
    return { ok: true, record: next };
}

export async function deletePersonalTitle(id) {
    const records = await readPersonalTitleRecords();
    const next = records.filter((record) => record.id !== id);
    if (next.length === records.length) return { ok: false, error: 'not_found' };
    await writePersonalTitleRecords(next);
    return { ok: true };
}

export async function addPersonalTitleAlias(id, alias) {
    const sanitized = sanitizeJobTitle(alias);
    if (!sanitized.valid) return { ok: false, error: sanitized.reason };
    const records = await readPersonalTitleRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const exists = current.aliases.some((item) => item.toLowerCase() === sanitized.normalizedName.toLowerCase());
    if (exists) return { ok: false, error: 'duplicate' };
    const updated = [...records];
    updated[index] = { ...current, aliases: [...current.aliases, sanitized.normalizedName], updatedAt: Date.now() };
    await writePersonalTitleRecords(updated);
    return { ok: true, record: updated[index] };
}

export async function removePersonalTitleAlias(id, alias) {
    const records = await readPersonalTitleRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const updated = [...records];
    updated[index] = {
        ...current,
        aliases: current.aliases.filter((item) => item.toLowerCase() !== String(alias || '').toLowerCase()),
        updatedAt: Date.now()
    };
    await writePersonalTitleRecords(updated);
    return { ok: true, record: updated[index] };
}

const api = {
    TITLE_DIRECTORY_KEY,
    TITLE_DIRECTORY_GLOBAL_KEY,
    TITLE_DIRECTORY_META_KEY,
    TITLE_DIRECTORY_SOURCE_URL,
    addPersonalTitle,
    addPersonalTitleAlias,
    analyzeTitleCorrection,
    deletePersonalTitle,
    getTitleDirectory,
    invalidateTitleDirectory,
    learnTitleCorrection,
    listTitleDirectory,
    readGlobalTitleDataset,
    readPersonalTitleRecords,
    refreshGlobalTitleDirectory,
    removePersonalTitleAlias,
    resolveTitleName,
    updatePersonalTitle,
    writePersonalTitleRecords
};

if (typeof window !== 'undefined') {
    window.PocketResumeTitleDirectory = api;
}

export default api;
