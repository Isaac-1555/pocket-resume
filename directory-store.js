// directory-store.js — generic local storage for a name directory.
// Each directory (company, job title, location) supplies its own normalizers
// and index builder; the storage keys, cache and daily refresh are shared.

export const DIRECTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function storageAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

export function createDirectoryStore(config) {
    const {
        personalKey,
        globalKey,
        metaKey,
        sourceUrl,
        origin,
        normalizePersonalRecords,
        normalizeGlobalDataset,
        buildIndex,
        fallbackGlobal,
        label
    } = config;

    let cachedDirectory = null;

    function invalidate() {
        cachedDirectory = null;
    }

    async function readPersonalRecords() {
        if (!storageAvailable()) return [];
        try {
            const data = await chrome.storage.local.get(personalKey);
            return normalizePersonalRecords(data[personalKey]);
        } catch (error) {
            console.warn(`[${label}] Could not read the personal directory:`, error);
            return [];
        }
    }

    async function writePersonalRecords(records) {
        const clean = normalizePersonalRecords(records);
        if (storageAvailable()) {
            await chrome.storage.local.set({ [personalKey]: clean });
        }
        invalidate();
        return clean;
    }

    async function readGlobalDataset() {
        if (storageAvailable()) {
            try {
                const data = await chrome.storage.local.get(globalKey);
                const dataset = normalizeGlobalDataset(data[globalKey]);
                if (dataset) return dataset;
            } catch (error) {
                console.warn(`[${label}] Could not read the global directory:`, error);
            }
        }
        return normalizeGlobalDataset(fallbackGlobal) || { version: 1, updatedAt: 0, source: 'bundled', entries: [] };
    }

    async function getDirectory() {
        if (cachedDirectory) return cachedDirectory;
        const [global, personal] = await Promise.all([readGlobalDataset(), readPersonalRecords()]);
        cachedDirectory = {
            global,
            personal,
            index: buildIndex({ globalEntries: global.entries, personalRecords: personal })
        };
        return cachedDirectory;
    }

    async function listDirectory() {
        const directory = await getDirectory();
        return {
            personal: directory.personal,
            global: directory.global.entries,
            version: directory.global.version,
            meta: directory.global.updatedAt
        };
    }

    async function refreshGlobal({ force = false } = {}) {
        let meta = null;
        if (storageAvailable()) {
            try {
                meta = (await chrome.storage.local.get(metaKey))[metaKey] || null;
            } catch (error) {
                console.warn(`[${label}] Could not read the refresh state:`, error);
            }
        }
        const age = Date.now() - (meta && meta.fetchedAt ? meta.fetchedAt : 0);
        if (!force && meta && age < DIRECTORY_MAX_AGE_MS) {
            return { status: 'skipped', meta };
        }
        try {
            if (origin && typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.contains) {
                const granted = await chrome.permissions.contains({ origins: [origin] });
                if (!granted) return { status: 'skipped', meta };
            }
            const response = await fetch(sourceUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            const dataset = normalizeGlobalDataset(payload);
            if (!dataset) throw new Error(`Malformed ${label.toLowerCase()} payload`);
            const nextMeta = {
                version: dataset.version,
                fetchedAt: Date.now(),
                count: dataset.entries.length,
                lastError: ''
            };
            if (storageAvailable()) {
                await chrome.storage.local.set({
                    [globalKey]: dataset,
                    [metaKey]: nextMeta
                });
            }
            invalidate();
            console.log(`[${label}] Global directory updated.`);
            return { status: 'updated', meta: nextMeta };
        } catch (error) {
            const nextMeta = { ...(meta || {}), lastError: error.message || String(error) };
            if (storageAvailable()) {
                await chrome.storage.local.set({ [metaKey]: nextMeta });
            }
            console.warn(`[${label}] Refresh failed, keeping the last good copy:`, error);
            return { status: 'error', meta: nextMeta };
        }
    }

    function registerStorageListener() {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[personalKey] || changes[globalKey]) invalidate();
        });
    }

    return {
        personalKey,
        globalKey,
        metaKey,
        sourceUrl,
        invalidate,
        readPersonalRecords,
        writePersonalRecords,
        readGlobalDataset,
        getDirectory,
        listDirectory,
        refreshGlobal,
        registerStorageListener
    };
}
