// jd-corrections.js — remembered job details corrected in the review dialog.
// A posting is remembered by its URL key, its path and its raw title + company,
// so generating the cover letter right after the resume cannot lose the fix.

import { normalizeUrlKey } from './pdf-store.js';

const JD_CORRECTIONS_KEY = 'jdCorrections';
const JD_CORRECTIONS_LIMIT = 10;
const JD_CORRECTIONS_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const CORRECTION_FIELDS = ['title', 'company', 'location', 'recruiterName'];

export { normalizeUrlKey };

export function looseUrlKey(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    try {
        const url = new URL(value);
        return `${url.origin.toLowerCase()}${url.pathname}`;
    } catch {
        return value.toLowerCase();
    }
}

function signaturePart(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/&[a-z#0-9]+;/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export function postingSignature(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const title = signaturePart(source.title);
    const company = signaturePart(source.company);
    if (!title && !company) return '';
    return `${company}|${title}`;
}

function cleanFields(source) {
    const fields = {};
    CORRECTION_FIELDS.forEach((field) => {
        if (!source || !Object.prototype.hasOwnProperty.call(source, field)) return;
        fields[field] = String(source[field] === undefined || source[field] === null ? '' : source[field]).trim();
    });
    return fields;
}

export function normalizeEntry(raw, fallbackKey) {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw.fields && typeof raw.fields === 'object' ? raw.fields : raw;
    const fields = cleanFields(source);
    if (!Object.keys(fields).length) return null;
    return {
        fields,
        updatedAt: Number(raw.updatedAt) || 0,
        urlKey: String(raw.urlKey || fallbackKey || ''),
        looseKey: String(raw.looseKey || looseUrlKey(raw.url || fallbackKey || '')),
        signature: String(raw.signature || postingSignature({ title: fields.title, company: fields.company }))
    };
}

export function mergeFields(jobMeta, fields) {
    const meta = jobMeta && typeof jobMeta === 'object' ? jobMeta : {};
    const corrections = fields && typeof fields === 'object' ? fields : {};
    const values = {};
    CORRECTION_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(corrections, field)) {
            values[field] = String(corrections[field] || '').trim();
            return;
        }
        values[field] = String(meta[field] || '').trim();
    });
    return values;
}

function entriesFromStore(store) {
    const source = store && typeof store === 'object' ? store : {};
    return Object.entries(source)
        .map(([key, value]) => {
            const entry = normalizeEntry(value, key);
            if (!entry) return null;
            if (!entry.urlKey) entry.urlKey = String(key || '');
            return entry;
        })
        .filter(Boolean);
}

export function pickEntry(store, request = {}) {
    const entries = entriesFromStore(store);
    if (!entries.length) return null;
    const urlKey = normalizeUrlKey(request.url);
    const exact = entries.filter((entry) => entry.urlKey && entry.urlKey === urlKey);
    if (exact.length) return newestOf(exact);

    const loose = looseUrlKey(request.url);
    if (loose) {
        const pathMatches = entries.filter((entry) => entry.looseKey && entry.looseKey === loose);
        if (pathMatches.length) return newestOf(pathMatches);
    }

    const signature = postingSignature(request.raw);
    if (!signature) return null;
    const now = Number(request.now) || Date.now();
    const bySignature = entries.filter((entry) => (
        entry.signature === signature &&
        now - entry.updatedAt < JD_CORRECTIONS_MAX_AGE_MS
    ));
    if (bySignature.length !== 1) return null;
    return bySignature[0];
}

function newestOf(entries) {
    return entries.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
}

export function planSave(store, request = {}) {
    const entries = entriesFromStore(store);
    const values = request.values && typeof request.values === 'object' ? request.values : null;
    if (!values) return { store, entry: null, changed: false };

    const url = String(request.url || '').trim();
    const urlKey = normalizeUrlKey(url);
    const extracted = request.extracted && typeof request.extracted === 'object' ? request.extracted : {};
    const existing = urlKey ? entries.find((entry) => entry.urlKey === urlKey) : null;

    const delta = {};
    CORRECTION_FIELDS.forEach((field) => {
        const after = String(values[field] === undefined ? '' : values[field]).trim();
        const before = String(extracted[field] || '').trim();
        if (after !== before) delta[field] = after;
    });

    if (!Object.keys(delta).length) {
        const next = entries.filter((entry) => !urlKey || entry.urlKey !== urlKey);
        return { store: toStore(next, request.now), entry: existing, changed: false };
    }

    const entry = {
        fields: delta,
        updatedAt: Number(request.now) || Date.now(),
        urlKey,
        looseKey: looseUrlKey(url),
        signature: postingSignature(request.raw) || postingSignature({ title: delta.title, company: delta.company })
    };
    const next = [entry, ...entries.filter((item) => !urlKey || item.urlKey !== urlKey)];
    return { store: toStore(next, request.now), entry, changed: true };
}

function toStore(entries, now) {
    const stamp = Number(now) || Date.now();
    return entries
        .filter((entry) => Object.keys(entry.fields || {}).length)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, JD_CORRECTIONS_LIMIT)
        .reduce((acc, entry) => {
            const key = entry.urlKey || `recent-${entry.updatedAt || stamp}`;
            acc[key] = {
                fields: { ...entry.fields },
                updatedAt: entry.updatedAt || stamp,
                urlKey: entry.urlKey || '',
                looseKey: entry.looseKey || '',
                signature: entry.signature || ''
            };
            return acc;
        }, {});
}

export async function readStore() {
    const data = await chrome.storage.local.get(JD_CORRECTIONS_KEY);
    const raw = data && data[JD_CORRECTIONS_KEY];
    return raw && typeof raw === 'object' ? raw : {};
}

export async function read(url, raw = {}) {
    const store = await readStore();
    const entry = pickEntry(store, { url, raw });
    return entry ? { ...entry } : null;
}

export async function save(url, extracted, values, raw = {}) {
    const store = await readStore();
    const plan = planSave(store, { url, extracted, values, raw });
    await chrome.storage.local.set({ [JD_CORRECTIONS_KEY]: plan.store });
    return plan.entry;
}

const api = {
    JD_CORRECTIONS_KEY,
    JD_CORRECTIONS_LIMIT,
    JD_CORRECTIONS_MAX_AGE_MS,
    CORRECTION_FIELDS,
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
};

if (typeof window !== 'undefined') window.PocketResumeJdCorrections = api;

export default api;
