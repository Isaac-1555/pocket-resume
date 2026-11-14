// job-title-directory.js — deterministic job title handling.
// Pure: no chrome.* APIs, no network. Global O*NET titles are suggestions
// only; a saved personal correction is the only thing that rewrites a title.

import {
    applyCasing,
    comparisonKey,
    decodeHtmlEntities,
    looseKey,
    normalizeStringList,
    stripSurroundingQuotes,
    suggestEntry,
    uniqueId,
    upsertAliasForEntry,
    DEFAULT_FUZZY_THRESHOLD,
    DEFAULT_TOKEN_THRESHOLD
} from './directory-core.js';

export const MAX_TITLE_NAME_LENGTH = 120;
export const MAX_TITLE_ALIASES = 40;
export const TITLE_APPLY_CONFIDENCE = 0.9;
export const TITLE_FUZZY_THRESHOLD = DEFAULT_FUZZY_THRESHOLD;
export const TITLE_TOKEN_THRESHOLD = DEFAULT_TOKEN_THRESHOLD;

const TITLE_SUFFIXES = new Set(['job', 'role', 'position', 'opening', 'vacancy']);

const TITLE_ABBREVIATIONS = {
    sr: 'senior',
    snr: 'senior',
    jr: 'junior',
    jrn: 'junior',
    eng: 'engineer',
    engineering: 'engineer',
    engr: 'engineer',
    mgr: 'manager',
    dev: 'developer',
    swe: 'software engineer',
    sde: 'software development engineer',
    qa: 'quality assurance',
    pm: 'product manager',
    vp: 'vice president',
    svp: 'senior vice president',
    evp: 'executive vice president',
    dir: 'director',
    asst: 'assistant',
    admin: 'administrator',
    administrative: 'administrator',
    tech: 'technician',
    rep: 'representative',
    coord: 'coordinator',
    assoc: 'associate',
    spec: 'specialist'
};

const GENERIC_TITLES = new Set([
    'job', 'jobs', 'role', 'roles', 'position', 'positions', 'title', 'opening',
    'openings', 'vacancy', 'vacancies', 'career', 'careers', 'job description',
    'description', 'responsibilities', 'requirements', 'qualifications',
    'about us', 'about the role', 'the role', 'the position', 'apply', 'apply now',
    'view job', 'job details', 'details', 'search', 'home', 'menu', 'unknown',
    'n a', 'na', 'none', 'tbd', 'tba', 'not specified', 'various', 'multiple'
]);

const PRONOUNS = new Set(['we', 'you', 'our', 'your', 'they', 'their', 'us', 'i', 'im', 'ive']);

function invalid(reason) {
    return { valid: false, normalizedName: '', titleKey: '', reason };
}

function stripTitleNoise(text) {
    let out = String(text || '');
    out = out.replace(/^\s*(?:job\s+title|position|role|title|opening|vacancy)\s*[:\-–—]\s*/i, '');
    out = out.replace(/\b(?:req(?:uisition)?|job|posting|position)\s*(?:id|number|no\.?|#)?\s*[:#-]?\s*(?=[A-Za-z0-9-]*\d)[A-Za-z0-9][A-Za-z0-9-]{2,}\b/gi, ' ');
    out = out.replace(/\s*[-–—|·•]\s*(?:remote|hybrid|on-?site)(?:\s*\([^)]*\))?\s*$/i, ' ');
    out = out.replace(/\s*\((?:remote|hybrid|on-?site)[^)]*\)\s*$/i, ' ');
    out = out.replace(/\s*[-–—|·•]\s*(?:full[-\s]?time|part[-\s]?time|contract|temporary|permanent)\s*$/i, ' ');
    out = out.replace(/\s*[-–—|·•]\s*(?:apply now|apply|new)\s*$/i, ' ');
    return out;
}

export function titleComparisonKey(name) {
    const base = comparisonKey(name);
    if (!base) return '';
    const expanded = [];
    base.split(' ').filter(Boolean).forEach((word) => {
        const replacement = TITLE_ABBREVIATIONS[word];
        if (replacement) {
            replacement.split(' ').forEach((part) => expanded.push(part));
        } else {
            expanded.push(word);
        }
    });
    return expanded.join(' ');
}

export function sanitizeJobTitle(input, options = {}) {
    let text = String(input == null ? '' : input);
    if (!text.trim()) return invalid('empty');

    text = text.normalize('NFC');
    text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
    text = text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    text = decodeHtmlEntities(text);
    text = text.replace(/\s+/g, ' ').trim();
    text = stripSurroundingQuotes(text);
    text = stripTitleNoise(text);
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/^[,;:|·•\-\s]+|[,;:|·•\-\s]+$/g, '').trim();

    if (!text) return invalid('empty');
    if (text.length > MAX_TITLE_NAME_LENGTH) return invalid('too_long');
    if (!/\p{L}/u.test(text)) return invalid('no_letters');
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return invalid('email');
    if (/^(?:https?:\/\/|www\.)/i.test(text)) return invalid('url');

    const key = titleComparisonKey(text);
    if (!key) return invalid('no_letters');
    if (GENERIC_TITLES.has(key)) return invalid('generic');

    const words = key.split(' ').filter(Boolean);
    if (words.length >= 10) {
        const pronouns = words.filter((word) => PRONOUNS.has(word)).length;
        if (pronouns >= 1) return invalid('sentence');
    }

    const normalizedName = applyCasing(text, options.canonical);
    return {
        valid: true,
        normalizedName,
        titleKey: titleComparisonKey(normalizedName),
        reason: null
    };
}

export function cloneTitleRecord(record) {
    if (!record || typeof record !== 'object') return null;
    return {
        id: String(record.id || ''),
        canonicalName: String(record.canonicalName || '').trim(),
        aliases: normalizeStringList(record.aliases).slice(0, MAX_TITLE_ALIASES),
        directoryId: String(record.directoryId || '').trim() || null,
        source: record.source === 'user' ? 'user' : 'official',
        createdAt: Number(record.createdAt) || 0,
        updatedAt: Number(record.updatedAt) || 0
    };
}

export function buildTitleIndex({ globalTitles = [], personalRecords = [] } = {}) {
    const entries = [];
    const byId = new Map();

    (Array.isArray(globalTitles) ? globalTitles : []).forEach((title) => {
        if (!title || typeof title !== 'object') return;
        const canonicalName = String(title.canonicalName || '').trim();
        if (!canonicalName) return;
        const id = String(title.id || titleComparisonKey(canonicalName)).trim();
        const entry = {
            id,
            canonicalName,
            aliases: normalizeStringList(title.aliases).slice(0, MAX_TITLE_ALIASES),
            directoryId: null,
            source: 'official',
            personal: false,
            recordId: ''
        };
        entries.push(entry);
        if (id) byId.set(id, entry);
    });

    (Array.isArray(personalRecords) ? personalRecords : []).forEach((record) => {
        const clean = cloneTitleRecord(record);
        if (!clean || !clean.canonicalName) return;
        if (clean.directoryId && byId.has(clean.directoryId)) {
            const target = byId.get(clean.directoryId);
            clean.aliases.forEach((alias) => {
                if (!target.aliases.some((item) => titleComparisonKey(item) === titleComparisonKey(alias))) target.aliases.push(alias);
            });
            target.personal = true;
            return;
        }
        entries.push({
            id: clean.id || clean.canonicalName,
            canonicalName: clean.canonicalName,
            aliases: clean.aliases,
            directoryId: null,
            source: 'user',
            personal: true,
            recordId: clean.id
        });
    });

    const byCanonical = new Map();
    const byAlias = new Map();
    const byLoose = new Map();
    const ordered = [...entries].sort((a, b) => (a.personal ? 1 : 0) - (b.personal ? 1 : 0));
    ordered.forEach((entry) => {
        const own = entry.personal;
        const canonical = titleComparisonKey(entry.canonicalName);
        if (canonical) byCanonical.set(canonical, entry);
        const loose = looseKey(entry.canonicalName, TITLE_SUFFIXES);
        if (loose && (own || !byLoose.has(loose))) byLoose.set(loose, entry);
        entry.aliases.forEach((alias) => {
            const aliasKey = titleComparisonKey(alias);
            if (aliasKey && (own || !byAlias.has(aliasKey))) byAlias.set(aliasKey, entry);
            const aliasLoose = looseKey(alias, TITLE_SUFFIXES);
            if (aliasLoose && (own || !byLoose.has(aliasLoose))) byLoose.set(aliasLoose, entry);
        });
    });

    return { entries, byCanonical, byAlias, byLoose };
}

export function matchTitle(name, index) {
    const key = titleComparisonKey(name);
    if (!key || !index) return null;
    const canonical = index.byCanonical.get(key);
    if (canonical) return { entry: canonical, matchType: 'canonical', confidence: 1 };
    const alias = index.byAlias.get(key);
    if (alias) return { entry: alias, matchType: 'alias', confidence: 0.95 };
    const loose = index.byLoose.get(looseKey(name, TITLE_SUFFIXES));
    if (loose) return { entry: loose, matchType: 'normalized', confidence: TITLE_APPLY_CONFIDENCE };
    return null;
}

export function suggestTitle(name, index) {
    return suggestEntry(name, index, {
        keyOf: titleComparisonKey,
        fuzzyThreshold: TITLE_FUZZY_THRESHOLD,
        tokenThreshold: TITLE_TOKEN_THRESHOLD
    });
}

export function resolveTitle(name, { index = null } = {}) {
    const originalValue = String(name == null ? '' : name).trim();
    const base = {
        value: originalValue,
        originalValue,
        matchType: 'none',
        directoryId: null,
        confidence: 0,
        suggestion: null,
        apply: false
    };
    if (!index) return base;

    const hit = matchTitle(originalValue, index);
    if (hit) {
        const personal = hit.entry.personal === true;
        if (personal) {
            return {
                ...base,
                value: hit.entry.canonicalName,
                matchType: hit.matchType,
                directoryId: hit.entry.id,
                confidence: hit.confidence,
                apply: true
            };
        }
        return {
            ...base,
            matchType: hit.matchType,
            directoryId: hit.entry.id,
            confidence: hit.confidence,
            suggestion: {
                canonicalName: hit.entry.canonicalName,
                directoryId: hit.entry.id,
                score: Number(hit.confidence.toFixed(3)),
                source: 'official'
            }
        };
    }

    const suggestion = suggestTitle(originalValue, index);
    if (suggestion) {
        return {
            ...base,
            suggestion: {
                canonicalName: suggestion.entry.canonicalName,
                directoryId: suggestion.entry.id,
                score: Number(suggestion.score.toFixed(3)),
                source: suggestion.entry.source === 'user' ? 'user' : 'official'
            }
        };
    }
    return base;
}

export function decideTitleCorrection({ original = '', corrected = '', index = null } = {}) {
    const sanitized = sanitizeJobTitle(corrected);
    if (!sanitized.valid) {
        return { status: 'invalid', reason: sanitized.reason, sanitized, entry: null };
    }
    const hit = matchTitle(sanitized.normalizedName, index);
    if (hit) {
        return { status: 'known', matchType: hit.matchType, entry: hit.entry, sanitized, original: String(original || '') };
    }
    const suggestion = suggestTitle(sanitized.normalizedName, index);
    if (suggestion) {
        return {
            status: 'suggest',
            entry: suggestion.entry,
            score: Number(suggestion.score.toFixed(3)),
            sanitized,
            original: String(original || '')
        };
    }
    return { status: 'new', sanitized, entry: null, original: String(original || '') };
}

export function makeTitleId(name) {
    const slug = titleComparisonKey(name).replace(/\s+/g, '-').slice(0, 40) || 'title';
    let hash = 0;
    const source = titleComparisonKey(name);
    for (let i = 0; i < source.length; i++) {
        hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    return `title_${slug}_${hash.toString(36).slice(0, 6)}`;
}

function createPersonalEntry(records, sanitized, originalSanitized, now) {
    const canonicalName = sanitized.normalizedName;
    const aliases = [];
    if (originalSanitized && titleComparisonKey(originalSanitized.normalizedName) !== titleComparisonKey(canonicalName)) {
        aliases.push(originalSanitized.normalizedName);
    }
    const record = {
        id: uniqueId(records, makeTitleId(canonicalName)),
        canonicalName,
        aliases,
        directoryId: null,
        source: 'user',
        createdAt: now,
        updatedAt: now
    };
    return {
        records: [...records, record],
        action: 'created',
        message: `added ${canonicalName} to your job title directory`,
        entry: record
    };
}

export function applyTitleCorrection(records = [], decision = {}, options = {}) {
    const list = (Array.isArray(records) ? records : []).map(cloneTitleRecord).filter(Boolean);
    const { original = '', confirmed = false, forceNew = false, now = Date.now() } = options;
    const status = decision && decision.status ? decision.status : 'invalid';

    if (status === 'invalid') {
        return { records: list, action: 'invalid', message: (decision && decision.reason) || 'invalid', entry: null };
    }

    const originalName = String(original || '').trim();
    const originalSanitized = originalName ? sanitizeJobTitle(originalName) : null;
    const originalIsNew = !!(originalSanitized && originalSanitized.valid);

    if (status === 'new') {
        const canonicalKey = titleComparisonKey(decision.sanitized.normalizedName);
        const existing = list.find((record) => titleComparisonKey(record.canonicalName) === canonicalKey);
        if (existing) {
            const known = applyTitleCorrection(list, {
                status: 'known',
                entry: existing,
                sanitized: decision.sanitized
            }, options);
            return { ...known, action: known.action === 'alias-added' ? 'alias-added' : 'none', message: 'already known' };
        }
    }

    if (status === 'known') {
        const entry = decision.entry;
        if (!entry || !originalIsNew) {
            return { records: list, action: 'none', message: 'already known', entry };
        }
        const canonicalLoose = looseKey(entry.canonicalName, TITLE_SUFFIXES);
        const originalLoose = looseKey(originalName, TITLE_SUFFIXES);
        if (originalLoose && originalLoose !== canonicalLoose) {
            const added = upsertAliasForEntry(list, entry, originalSanitized.normalizedName, now, makeTitleId);
            if (added.changed) {
                return {
                    records: added.records,
                    action: 'alias-added',
                    message: `saved "${originalSanitized.normalizedName}" as an alias of ${entry.canonicalName}`,
                    entry
                };
            }
        }
        return { records: list, action: 'none', message: 'already known', entry };
    }

    if (status === 'suggest') {
        if (forceNew) {
            return createPersonalEntry(list, decision.sanitized, originalIsNew ? originalSanitized : null, now);
        }
        if (!confirmed) {
            return { records: list, action: 'skipped', message: 'needs confirmation', entry: decision.entry };
        }
        const entry = decision.entry;
        const aliasName = decision.sanitized.normalizedName;
        const added = upsertAliasForEntry(list, entry, aliasName, now, makeTitleId);
        return {
            records: added.records,
            action: added.changed ? 'alias-added' : 'none',
            message: added.changed ? `saved "${aliasName}" as an alias of ${entry.canonicalName}` : 'already known',
            entry
        };
    }

    return createPersonalEntry(list, decision.sanitized, originalIsNew ? originalSanitized : null, now);
}

export function describeTitleDecision(decision) {
    if (!decision) return { tone: 'muted', text: '' };
    if (decision.status === 'invalid') {
        const reasons = {
            empty: 'Add a job title.',
            too_long: 'That title is too long.',
            no_letters: 'That does not look like a job title.',
            email: 'That is an email address, not a job title.',
            url: 'That is a link, not a job title.',
            generic: 'That is a section label, not a job title.',
            sentence: 'That is a sentence, not a job title.'
        };
        return { tone: 'warn', text: reasons[decision.reason] || 'Not a job title — kept for this application only.' };
    }
    if (decision.status === 'known') {
        const where = decision.entry && decision.entry.source === 'official' ? 'the official title list' : 'your directory';
        return { tone: 'good', text: `Matches ${decision.entry.canonicalName} in ${where}.` };
    }
    if (decision.status === 'suggest') {
        return { tone: 'warn', text: `Looks like ${decision.entry.canonicalName}.` };
    }
    return { tone: 'muted', text: 'Will be added to your job title directory.' };
}
