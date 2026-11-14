// company-directory-store.js — the local company directory.
// The global dataset (bundled + a daily refresh) and the user's own records
// both live in chrome.storage.local. Nothing here talks to the network
// except the silent dataset refresh, which never carries personal data.

import { COMPANY_DIRECTORY_BASE } from './libs/company-directory-global.js';
import {
    MAX_COMPANY_ALIASES,
    MAX_COMPANY_DOMAINS,
    applyCorrection,
    buildDirectoryIndex,
    cloneCompanyRecord,
    decideCorrection,
    describeDecision,
    makeCompanyId,
    resolveCompany,
    sanitizeCompanyName
} from './company-directory.js';

export const PERSONAL_DIRECTORY_KEY = 'companyDirectory';
export const GLOBAL_DIRECTORY_KEY = 'companyDirectoryGlobal';
export const GLOBAL_DIRECTORY_META_KEY = 'companyDirectoryMeta';
export const GLOBAL_DIRECTORY_SOURCE_URL = 'https://pocket-resume.xyz/data/companies.json';
export const GLOBAL_DIRECTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const GLOBAL_DIRECTORY_ORIGIN = 'https://pocket-resume.xyz/*';

const MAX_GLOBAL_COMPANIES = 5000;

function storageAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

export function normalizeGlobalDataset(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const version = Number(payload.version);
    if (!Number.isFinite(version) || version < 1) return null;
    const source = Array.isArray(payload.companies) ? payload.companies : [];
    if (!source.length || source.length > MAX_GLOBAL_COMPANIES) return null;
    const companies = [];
    const seen = new Set();
    for (const company of source) {
        if (!company || typeof company !== 'object') continue;
        const canonicalName = String(company.canonicalName || '').trim();
        if (!canonicalName) continue;
        const key = canonicalName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        companies.push({
            id: String(company.id || key).trim(),
            canonicalName,
            legalName: String(company.legalName || '').trim(),
            aliases: Array.isArray(company.aliases) ? company.aliases.slice(0, MAX_COMPANY_ALIASES) : [],
            domains: Array.isArray(company.domains) ? company.domains.slice(0, MAX_COMPANY_DOMAINS) : [],
            parentCompany: String(company.parentCompany || '').trim(),
            source: 'official'
        });
    }
    if (!companies.length) return null;
    return {
        version,
        updatedAt: Number(payload.updatedAt) || 0,
        source: String(payload.source || 'PocketResume company directory'),
        companies
    };
}

export function normalizePersonalRecords(payload) {
    if (!Array.isArray(payload)) return [];
    const records = [];
    const seen = new Set();
    for (const item of payload) {
        const record = cloneCompanyRecord(item);
        if (!record || !record.canonicalName) continue;
        const key = record.canonicalName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(record);
    }
    return records;
}

export async function readPersonalRecords() {
    if (!storageAvailable()) return [];
    try {
        const data = await chrome.storage.local.get(PERSONAL_DIRECTORY_KEY);
        return normalizePersonalRecords(data[PERSONAL_DIRECTORY_KEY]);
    } catch (error) {
        console.warn('[CompanyDirectory] Could not read the personal directory:', error);
        return [];
    }
}

export async function writePersonalRecords(records) {
    const clean = normalizePersonalRecords(records);
    if (storageAvailable()) {
        await chrome.storage.local.set({ [PERSONAL_DIRECTORY_KEY]: clean });
    }
    invalidateDirectory();
    return clean;
}

export async function readGlobalDataset() {
    if (storageAvailable()) {
        try {
            const data = await chrome.storage.local.get(GLOBAL_DIRECTORY_KEY);
            const dataset = normalizeGlobalDataset(data[GLOBAL_DIRECTORY_KEY]);
            if (dataset) return dataset;
        } catch (error) {
            console.warn('[CompanyDirectory] Could not read the global directory:', error);
        }
    }
    return normalizeGlobalDataset(COMPANY_DIRECTORY_BASE) || { version: 1, updatedAt: 0, source: 'bundled', companies: [] };
}

let cachedDirectory = null;

export function invalidateDirectory() {
    cachedDirectory = null;
}

export async function getDirectory() {
    if (cachedDirectory) return cachedDirectory;
    const [global, personal] = await Promise.all([readGlobalDataset(), readPersonalRecords()]);
    cachedDirectory = {
        global,
        personal,
        index: buildDirectoryIndex({ globalCompanies: global.companies, personalRecords: personal })
    };
    return cachedDirectory;
}

export async function resolveCompanyName(name, options = {}) {
    const directory = await getDirectory();
    return resolveCompany(name, { index: directory.index, ...options });
}

export async function analyzeCorrection(original, corrected) {
    const directory = await getDirectory();
    const decision = decideCorrection({ original, corrected, index: directory.index });
    return { ...decision, message: describeDecision(decision) };
}

export async function learnCorrection({ original = '', corrected = '', confirmed = false, forceNew = false } = {}) {
    const directory = await getDirectory();
    const decision = decideCorrection({ original, corrected, index: directory.index });
    const result = applyCorrection(directory.personal, decision, { original, confirmed, forceNew });
    if (result.action === 'created' || result.action === 'alias-added') {
        await writePersonalRecords(result.records);
    }
    return { ...result, decision, message: describeDecision(decision) };
}

export async function listDirectory() {
    const directory = await getDirectory();
    return {
        personal: directory.personal,
        global: directory.global.companies,
        version: directory.global.version,
        meta: directory.global.updatedAt
    };
}

export async function addPersonalCompany({ canonicalName = '', aliases = [], domains = [] } = {}) {
    const sanitized = sanitizeCompanyName(canonicalName);
    if (!sanitized.valid) return { ok: false, error: sanitized.reason };
    const records = await readPersonalRecords();
    const clash = records.find((record) => record.canonicalName.toLowerCase() === sanitized.normalizedName.toLowerCase());
    if (clash) return { ok: false, error: 'duplicate' };
    const cleanAliases = (Array.isArray(aliases) ? aliases : [])
        .map((alias) => sanitizeCompanyName(alias))
        .filter((alias) => alias.valid)
        .map((alias) => alias.normalizedName)
        .slice(0, MAX_COMPANY_ALIASES);
    const record = {
        id: makeCompanyId(sanitized.normalizedName),
        canonicalName: sanitized.normalizedName,
        legalName: '',
        aliases: cleanAliases,
        domains: (Array.isArray(domains) ? domains : []).map((domain) => String(domain || '').trim().toLowerCase()).filter(Boolean).slice(0, MAX_COMPANY_DOMAINS),
        directoryId: null,
        source: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    await writePersonalRecords([...records, record]);
    return { ok: true, record };
}

export async function updatePersonalCompany(id, patch = {}) {
    const records = await readPersonalRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const next = { ...current };
    if (patch.canonicalName !== undefined) {
        const sanitized = sanitizeCompanyName(patch.canonicalName);
        if (!sanitized.valid) return { ok: false, error: sanitized.reason };
        next.canonicalName = sanitized.normalizedName;
    }
    if (Array.isArray(patch.aliases)) {
        next.aliases = patch.aliases
            .map((alias) => sanitizeCompanyName(alias))
            .filter((alias) => alias.valid)
            .map((alias) => alias.normalizedName)
            .slice(0, MAX_COMPANY_ALIASES);
    }
    if (Array.isArray(patch.domains)) {
        next.domains = patch.domains.map((domain) => String(domain || '').trim().toLowerCase()).filter(Boolean).slice(0, MAX_COMPANY_DOMAINS);
    }
    next.updatedAt = Date.now();
    const updated = [...records];
    updated[index] = next;
    await writePersonalRecords(updated);
    return { ok: true, record: next };
}

export async function deletePersonalCompany(id) {
    const records = await readPersonalRecords();
    const next = records.filter((record) => record.id !== id);
    if (next.length === records.length) return { ok: false, error: 'not_found' };
    await writePersonalRecords(next);
    return { ok: true };
}

export async function addPersonalAlias(id, alias) {
    const sanitized = sanitizeCompanyName(alias);
    if (!sanitized.valid) return { ok: false, error: sanitized.reason };
    const records = await readPersonalRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const exists = current.aliases.some((item) => item.toLowerCase() === sanitized.normalizedName.toLowerCase());
    if (exists) return { ok: false, error: 'duplicate' };
    const updated = [...records];
    updated[index] = { ...current, aliases: [...current.aliases, sanitized.normalizedName], updatedAt: Date.now() };
    await writePersonalRecords(updated);
    return { ok: true, record: updated[index] };
}

export async function removePersonalAlias(id, alias) {
    const records = await readPersonalRecords();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return { ok: false, error: 'not_found' };
    const current = records[index];
    const updated = [...records];
    updated[index] = {
        ...current,
        aliases: current.aliases.filter((item) => item.toLowerCase() !== String(alias || '').toLowerCase()),
        updatedAt: Date.now()
    };
    await writePersonalRecords(updated);
    return { ok: true, record: updated[index] };
}

export async function refreshGlobalDirectory({ force = false } = {}) {
    let meta = null;
    if (storageAvailable()) {
        try {
            meta = (await chrome.storage.local.get(GLOBAL_DIRECTORY_META_KEY))[GLOBAL_DIRECTORY_META_KEY] || null;
        } catch (error) {
            console.warn('[CompanyDirectory] Could not read the refresh state:', error);
        }
    }
    const age = Date.now() - (meta && meta.fetchedAt ? meta.fetchedAt : 0);
    if (!force && meta && age < GLOBAL_DIRECTORY_MAX_AGE_MS) {
        return { status: 'skipped', meta };
    }
    try {
        if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.contains) {
            const granted = await chrome.permissions.contains({ origins: [GLOBAL_DIRECTORY_ORIGIN] });
            if (!granted) return { status: 'skipped', meta };
        }
        const response = await fetch(GLOBAL_DIRECTORY_SOURCE_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const dataset = normalizeGlobalDataset(payload);
        if (!dataset) throw new Error('Malformed company directory payload');
        const nextMeta = {
            version: dataset.version,
            fetchedAt: Date.now(),
            count: dataset.companies.length,
            lastError: ''
        };
        if (storageAvailable()) {
            await chrome.storage.local.set({
                [GLOBAL_DIRECTORY_KEY]: dataset,
                [GLOBAL_DIRECTORY_META_KEY]: nextMeta
            });
        }
        invalidateDirectory();
        console.log('[CompanyDirectory] Global directory updated.');
        return { status: 'updated', meta: nextMeta };
    } catch (error) {
        const nextMeta = { ...(meta || {}), lastError: error.message || String(error) };
        if (storageAvailable()) {
            await chrome.storage.local.set({ [GLOBAL_DIRECTORY_META_KEY]: nextMeta });
        }
        console.warn('[CompanyDirectory] Refresh failed, keeping the last good copy:', error);
        return { status: 'error', meta: nextMeta };
    }
}

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[PERSONAL_DIRECTORY_KEY] || changes[GLOBAL_DIRECTORY_KEY]) invalidateDirectory();
    });
}

const api = {
    PERSONAL_DIRECTORY_KEY,
    GLOBAL_DIRECTORY_KEY,
    GLOBAL_DIRECTORY_META_KEY,
    GLOBAL_DIRECTORY_SOURCE_URL,
    addPersonalAlias,
    addPersonalCompany,
    analyzeCorrection,
    deletePersonalCompany,
    getDirectory,
    invalidateDirectory,
    learnCorrection,
    listDirectory,
    readGlobalDataset,
    readPersonalRecords,
    refreshGlobalDirectory,
    removePersonalAlias,
    resolveCompanyName,
    updatePersonalCompany,
    writePersonalRecords
};

if (typeof window !== 'undefined') {
    window.PocketResumeCompanyDirectory = api;
}

export default api;
