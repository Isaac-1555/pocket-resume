// directory-core.js — shared primitives for the local directories.
// Pure: no chrome.* APIs, no network. Company, job-title and location
// directories all build on these helpers so matching stays consistent.

export const DEFAULT_FUZZY_THRESHOLD = 0.93;
export const DEFAULT_TOKEN_THRESHOLD = 0.9;

const HTML_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
    mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
    rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™',
    middot: '·', eacute: 'é', egrave: 'è', agrave: 'à',
    ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ntilde: 'ñ'
};

export function decodeHtmlEntities(text) {
    return String(text || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
        if (entity.charAt(0) === '#') {
            const isHex = entity.charAt(1) === 'x' || entity.charAt(1) === 'X';
            const code = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
            if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return match;
            try {
                return String.fromCodePoint(code);
            } catch {
                return match;
            }
        }
        const named = HTML_ENTITIES[entity.toLowerCase()];
        return named || match;
    });
}

export function stripSurroundingQuotes(text) {
    let out = String(text || '').trim();
    const pairs = [['"', '"'], ['“', '”'], ['‘', '’'], ['«', '»'], ['`', '`'], ["'", "'"]];
    let changed = true;
    while (changed && out.length > 1) {
        changed = false;
        for (const [open, close] of pairs) {
            if (out.startsWith(open) && out.endsWith(close) && out.length > 1) {
                out = out.slice(open.length, out.length - close.length).trim();
                changed = true;
                break;
            }
        }
    }
    return out;
}

export function comparisonKey(name) {
    return String(name == null ? '' : name)
        .normalize('NFC')
        .replace(/&/g, ' and ')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function looseKey(name, suffixes) {
    const key = comparisonKey(name);
    if (!key) return '';
    const set = suffixes instanceof Set ? suffixes : new Set(Array.isArray(suffixes) ? suffixes : []);
    if (!set.size) return key;
    const words = key.split(' ').filter(Boolean);
    while (words.length > 1 && set.has(words[words.length - 1])) {
        const candidate = words.slice(0, -1).join(' ');
        if (candidate.replace(/[^a-z0-9]/g, '').length < 2) break;
        words.pop();
    }
    return words.join(' ');
}

export function titleCaseWord(word) {
    const core = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (!core) return word;
    if (core.length <= 3) return word;
    if (/\d/.test(core) && core.length <= 4) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function applyCasing(text, canonical) {
    if (canonical) return String(canonical).trim();
    if (!text) return text;
    if (!/[a-z]/.test(text) && /[A-Z]/.test(text)) {
        return text.split(' ').map(titleCaseWord).join(' ');
    }
    if (!/[A-Z]/.test(text)) {
        const words = text.split(' ');
        words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
        return words.join(' ');
    }
    return text;
}

export function normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    value.forEach((item) => {
        const text = String(item == null ? '' : item).trim();
        if (!text) return;
        const key = comparisonKey(text);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(text);
    });
    return out;
}

export function uniqueId(records, id) {
    if (!records.some((record) => record && record.id === id)) return id;
    let counter = 2;
    while (records.some((record) => record && record.id === `${id}_${counter}`)) counter++;
    return `${id}_${counter}`;
}

export function jaroSimilarity(a, b) {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
    const aFlags = new Array(a.length).fill(false);
    const bFlags = new Array(b.length).fill(false);
    let matches = 0;
    for (let i = 0; i < a.length; i++) {
        const start = Math.max(0, i - window);
        const end = Math.min(i + window + 1, b.length);
        for (let j = start; j < end; j++) {
            if (bFlags[j] || a[i] !== b[j]) continue;
            aFlags[i] = true;
            bFlags[j] = true;
            matches++;
            break;
        }
    }
    if (!matches) return 0;
    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < a.length; i++) {
        if (!aFlags[i]) continue;
        while (!bFlags[k]) k++;
        if (a[i] !== b[k]) transpositions++;
        k++;
    }
    transpositions = transpositions / 2;
    return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

export function fuzzySimilarity(a, b) {
    const left = comparisonKey(a);
    const right = comparisonKey(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    const jaro = jaroSimilarity(left, right);
    let prefix = 0;
    while (prefix < 4 && prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
    return jaro + prefix * 0.1 * (1 - jaro);
}

export function tokenSimilarity(a, b) {
    const left = comparisonKey(a).split(' ').filter(Boolean);
    const right = comparisonKey(b).split(' ').filter(Boolean);
    if (!left.length || !right.length) return 0;
    const rightSet = new Set(right);
    const shared = left.filter((word) => rightSet.has(word)).length;
    if (!shared) return 0;
    const union = new Set([...left, ...right]).size;
    const jaccard = shared / union;
    const contains = left.every((word) => rightSet.has(word)) || right.every((word) => new Set(left).has(word));
    if (contains && left[0] === right[0]) return Math.max(jaccard, DEFAULT_TOKEN_THRESHOLD);
    return 0;
}

export function suggestEntry(name, index, options = {}) {
    const key = options.keyOf ? options.keyOf(name) : comparisonKey(name);
    if (!key || !index) return null;
    const fuzzyThreshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;
    const tokenThreshold = options.tokenThreshold ?? DEFAULT_TOKEN_THRESHOLD;
    const candidateNames = options.candidateNames || ((entry) => [entry.canonicalName, ...(entry.aliases || [])]);
    let bestFuzzy = null;
    let bestToken = null;
    index.entries.forEach((entry) => {
        candidateNames(entry).forEach((candidate) => {
            const fuzzy = fuzzySimilarity(key, candidate);
            if (!bestFuzzy || fuzzy > bestFuzzy.score) bestFuzzy = { entry, score: fuzzy, matched: candidate };
            const token = tokenSimilarity(key, candidate);
            if (token && (!bestToken || token > bestToken.score)) bestToken = { entry, score: token, matched: candidate };
        });
    });
    if (bestFuzzy && bestFuzzy.score >= fuzzyThreshold) return bestFuzzy;
    if (bestToken && bestToken.score >= tokenThreshold) return bestToken;
    return null;
}

export function upsertAliasForEntry(records, entry, aliasName, now, makeId) {
    const alias = String(aliasName || '').trim();
    const aliasKey = comparisonKey(alias);
    if (!aliasKey || !entry) return { records, changed: false };
    if ((entry.aliases || []).some((item) => comparisonKey(item) === aliasKey)) return { records, changed: false };

    if (entry.source === 'official') {
        const linked = records.find((record) => record && record.directoryId === entry.id);
        if (linked) {
            const next = records.map((record) => (
                record.id === linked.id
                    ? { ...record, aliases: [...(record.aliases || []), alias], updatedAt: now }
                    : record
            ));
            return { records: next, changed: true };
        }
        return {
            records: [...records, {
                id: uniqueId(records, makeId(alias)),
                canonicalName: entry.canonicalName,
                aliases: [alias],
                directoryId: entry.id,
                source: 'user',
                createdAt: now,
                updatedAt: now
            }],
            changed: true
        };
    }

    const targetId = entry.recordId || entry.id;
    let changed = false;
    const next = records.map((record) => {
        if (!record || record.id !== targetId) return record;
        changed = true;
        return { ...record, aliases: [...(record.aliases || []), alias], updatedAt: now };
    });
    return { records: changed ? next : records, changed };
}
