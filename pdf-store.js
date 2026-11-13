// pdf-store.js — locally stored generated PDFs (the sidebar file shelf).
// Bytes live in chrome.storage.local as base64 data URLs. Only the current
// posting's files are kept: a new posting replaces the previous set.

const PDF_STORE_KEY = 'generatedPdfs';
const PDF_STORE_VERSION = 1;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gh_src', 'ref', 'source', 'fbclid', 'gclid'
];

export function normalizeUrlKey(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    try {
        const url = new URL(value);
        const params = new URLSearchParams(url.search);
        TRACKING_PARAMS.forEach((name) => params.delete(name));
        const query = params.toString();
        return `${url.origin.toLowerCase()}${url.pathname}${query ? `?${query}` : ''}`;
    } catch {
        return value.toLowerCase();
    }
}

export function planStore(existing, incoming) {
    const state = existing && typeof existing === 'object' ? existing : {};
    const items = Array.isArray(state.items) ? state.items.filter(Boolean) : [];
    const urlKey = String((incoming && incoming.urlKey) || '').trim();
    const kind = String((incoming && incoming.kind) || 'resume');
    const item = (incoming && incoming.item) || null;
    const known = !!urlKey;
    const samePosting = known && state.urlKey === urlKey;
    const base = !known ? items : (samePosting ? items : []);
    const kept = base.filter((entry) => entry.kind !== kind);
    return {
        wipeAll: known && !samePosting,
        urlKey,
        items: item ? [...kept, item] : kept
    };
}

function emptyState() {
    return {
        version: PDF_STORE_VERSION,
        urlKey: '',
        url: '',
        title: '',
        company: '',
        items: []
    };
}

export async function getState() {
    try {
        const data = await chrome.storage.local.get(PDF_STORE_KEY);
        const raw = data && data[PDF_STORE_KEY];
        if (!raw || typeof raw !== 'object') return emptyState();
        return {
            version: PDF_STORE_VERSION,
            urlKey: String(raw.urlKey || ''),
            url: String(raw.url || ''),
            title: String(raw.title || ''),
            company: String(raw.company || ''),
            items: Array.isArray(raw.items)
                ? raw.items.filter((item) => item && item.dataUrl && item.id)
                : []
        };
    } catch (error) {
        console.warn('[PdfStore] read failed:', error);
        return emptyState();
    }
}

export async function savePdf(entry) {
    const state = await getState();
    const urlKey = normalizeUrlKey(entry.url);
    const item = {
        id: `pdf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        kind: entry.kind === 'cover-letter' ? 'cover-letter' : 'resume',
        filename: String(entry.filename || 'document.pdf'),
        mime: 'application/pdf',
        size: Number(entry.size) || 0,
        dataUrl: String(entry.dataUrl || ''),
        resumeId: entry.resumeId || null,
        createdAt: Date.now()
    };
    const plan = planStore(state, { urlKey, kind: item.kind, item });
    const payload = {
        version: PDF_STORE_VERSION,
        urlKey: plan.urlKey || state.urlKey,
        url: entry.url || state.url || '',
        title: entry.title || state.title || '',
        company: entry.company || state.company || '',
        items: plan.items
    };
    await chrome.storage.local.set({ [PDF_STORE_KEY]: payload });
    return payload;
}

export async function removeItem(id) {
    const state = await getState();
    const items = state.items.filter((item) => item.id !== id);
    if (items.length === state.items.length) return state;
    const payload = { ...state, items };
    await chrome.storage.local.set({ [PDF_STORE_KEY]: payload });
    return payload;
}

export async function clearStore() {
    const payload = emptyState();
    await chrome.storage.local.set({ [PDF_STORE_KEY]: payload });
    return payload;
}

export function dataUrlToBytes(dataUrl) {
    const base64 = String(dataUrl || '').split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function dataUrlToBlob(dataUrl) {
    return new Blob([dataUrlToBytes(dataUrl)], { type: 'application/pdf' });
}

export function dataUrlToFile(dataUrl, filename) {
    return new File([dataUrlToBytes(dataUrl)], filename || 'document.pdf', { type: 'application/pdf' });
}

const api = {
    PDF_STORE_KEY,
    PDF_STORE_VERSION,
    MAX_PDF_BYTES,
    normalizeUrlKey,
    planStore,
    getState,
    savePdf,
    removeItem,
    clearStore,
    dataUrlToBytes,
    dataUrlToBlob,
    dataUrlToFile
};

if (typeof window !== 'undefined') window.PocketResumePdfStore = api;

export default api;
