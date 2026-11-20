// company-directory.js — deterministic company name handling.
// Pure: no chrome.* APIs, no network. Sanitization, comparison keys, matching,
// resolution and learning decisions live here so they stay testable.

export const MAX_COMPANY_NAME_LENGTH = 120;
export const MAX_COMPANY_ALIASES = 40;
export const MAX_COMPANY_DOMAINS = 10;
export const FUZZY_THRESHOLD = 0.93;
export const TOKEN_THRESHOLD = 0.9;
export const APPLY_CONFIDENCE = 0.9;

const HTML_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
    mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
    rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™',
    middot: '·', eacute: 'é', egrave: 'è', agrave: 'à',
    ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ntilde: 'ñ'
};

const LEGAL_SUFFIXES = new Set([
    'inc', 'incorporated', 'llc', 'ltd', 'limited', 'plc', 'corp', 'corporation',
    'co', 'company', 'gmbh', 'ag', 'sa', 'nv', 'bv', 'pty', 'pte', 'sarl', 'srl',
    'spa', 'aps', 'llp', 'lp', 'kk', 'oy', 'ab', 'as', 'pllc', 'ug', 'sarl'
]);

const ROLE_WORDS = new Set([
    'developer', 'engineer', 'manager', 'analyst', 'designer', 'consultant',
    'specialist', 'technician', 'scientist', 'intern', 'coordinator',
    'administrator', 'accountant', 'nurse', 'teacher', 'professor', 'researcher',
    'architect', 'attorney', 'agent', 'broker', 'chef', 'driver', 'editor',
    'writer', 'marketer', 'recruiter', 'salesperson', 'programmer', 'tester',
    'supervisor', 'assistant', 'associate', 'clerk', 'cashier', 'receptionist',
    'welder', 'plumber', 'electrician', 'mechanic', 'carpenter', 'lawyer',
    'pharmacist', 'dentist', 'surgeon', 'paramedic', 'therapist', 'counselor',
    'advisor', 'auditor', 'bookkeeper', 'buyer', 'planner', 'scheduler',
    'operator', 'inspector', 'surveyor', 'landscaper', 'janitor', 'guard',
    'security', 'sommelier', 'barista', 'stylist', 'stylist', 'trainer'
]);

const DEPARTMENT_NAMES = new Set([
    'engineering', 'marketing', 'sales', 'finance', 'accounting',
    'human resources', 'hr', 'people', 'people team', 'operations', 'product',
    'design', 'research', 'development', 'it', 'information technology',
    'legal', 'compliance', 'customer support', 'support', 'customer success',
    'business development', 'data', 'analytics', 'security', 'qa',
    'quality assurance', 'business intelligence', 'procurement', 'supply chain',
    'facilities', 'real estate', 'tax', 'treasury', 'strategy',
    'corporate development', 'communications', 'public relations', 'pr', 'brand',
    'branding', 'content', 'social media', 'growth', 'partnerships',
    'enterprise', 'administration', 'talent acquisition', 'recruiting'
]);

const GENERIC_LABELS = new Set([
    'company', 'the company', 'employer', 'the employer', 'organization',
    'organisation', 'the organization', 'the organisation', 'company name',
    'employer name', 'organization name', 'organisation name', 'unknown',
    'unknown company', 'n a', 'na', 'none', 'tbd', 'tba', 'not available',
    'not specified', 'various', 'multiple', 'other', 'others', 'select company',
    'choose company', 'your company', 'our company', 'their company',
    'the client', 'client', 'hiring company', 'employing company', 'name',
    'company inc', 'nope', 'nothing', 'none here'
]);

const NAVIGATION_LABELS = new Set([
    'home', 'homepage', 'back', 'back to results', 'back to search', 'search',
    'search jobs', 'find jobs', 'browse jobs', 'all jobs', 'job search', 'jobs',
    'careers', 'careers at', 'apply', 'apply now', 'view job', 'view details',
    'details', 'read more', 'see more', 'see job details', 'sign in', 'log in',
    'login', 'register', 'sign up', 'subscribe', 'next', 'previous',
    'previous page', 'next page', 'page', 'menu', 'close', 'open', 'more',
    'less', 'filter', 'filters', 'sort', 'share', 'save', 'post', 'jobs at',
    'open positions', 'current openings', 'join our team', 'why join us',
    'about us', 'our team', 'the team', 'join our', 'work with us',
    'life at', 'our story', 'our mission', 'our values'
]);

const PRONOUNS = new Set(['we', 'you', 'our', 'your', 'they', 'their', 'us', 'im', 'ive', 'welcoming']);

const STOPWORDS_FOR_SENTENCES = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'is', 'are', 'will', 'for', 'with', 'this', 'that']);

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

function stripSurroundingQuotes(text) {
    let out = String(text || '').trim();
    const pairs = [['"', '"'], ['“', '”'], ['‘', '’'], ['«', '»'], ['`', '`'], ["'", "'"], ['‘', '’'], ['«', '»']];
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

export function looseKey(name) {
    const key = comparisonKey(name);
    if (!key) return '';
    const words = key.split(' ').filter(Boolean);
    while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
        const candidate = words.slice(0, -1).join(' ');
        if (candidate.replace(/[^a-z0-9]/g, '').length < 2) break;
        words.pop();
    }
    return words.join(' ');
}

function titleCaseWord(word) {
    const core = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (!core) return word;
    if (core.length <= 3) return word;
    if (/\d/.test(core) && core.length <= 4) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function applyCasing(text, canonical) {
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

function invalid(reason) {
    return { valid: false, normalizedName: '', comparisonKey: '', reason };
}

export function sanitizeCompanyName(input, options = {}) {
    let text = String(input == null ? '' : input);
    if (!text.trim()) return invalid('empty');

    text = text.normalize('NFC');
    text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
    text = text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    text = decodeHtmlEntities(text);
    text = text.replace(/\s+/g, ' ').trim();
    text = stripSurroundingQuotes(text);

    if (!text) return invalid('empty');
    if (text.length > MAX_COMPANY_NAME_LENGTH) return invalid('too_long');

    const key = comparisonKey(text);
    if (!key) return invalid('no_letters');
    if (!/\p{L}/u.test(text)) return invalid('no_letters');

    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return invalid('email');
    if (/^(?:https?:\/\/|www\.)/i.test(text)) return invalid('url');
    if (/^\s*https?:/i.test(text)) return invalid('url');

    if (GENERIC_LABELS.has(key)) return invalid('generic');
    if (NAVIGATION_LABELS.has(key)) return invalid('navigation');
    if (DEPARTMENT_NAMES.has(key)) return invalid('department');

    const words = key.split(' ').filter(Boolean);
    const lastWord = words[words.length - 1] || '';
    const singular = lastWord.length > 3 && lastWord.endsWith('s') ? lastWord.slice(0, -1) : lastWord;
    if (ROLE_WORDS.has(lastWord) || ROLE_WORDS.has(singular)) return invalid('job_title');

    if (words.length >= 5) {
        const pronouns = words.filter((word) => PRONOUNS.has(word)).length;
        const stopwords = words.filter((word) => STOPWORDS_FOR_SENTENCES.has(word)).length;
        if (pronouns >= 1 && stopwords >= 1) return invalid('sentence');
    }

    const normalizedName = applyCasing(text, options.canonical);
    return {
        valid: true,
        normalizedName,
        comparisonKey: comparisonKey(normalizedName),
        reason: null
    };
}

function normalizeStringList(value) {
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

function normalizeDomainList(value) {
    return normalizeStringList(value)
        .map((domain) => domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim())
        .filter(Boolean)
        .slice(0, MAX_COMPANY_DOMAINS);
}

export function cloneCompanyRecord(record) {
    if (!record || typeof record !== 'object') return null;
    return {
        id: String(record.id || ''),
        canonicalName: String(record.canonicalName || '').trim(),
        legalName: String(record.legalName || '').trim(),
        aliases: normalizeStringList(record.aliases).slice(0, MAX_COMPANY_ALIASES),
        domains: normalizeDomainList(record.domains),
        parentCompany: String(record.parentCompany || '').trim(),
        directoryId: String(record.directoryId || '').trim() || null,
        source: record.source === 'user' ? 'user' : 'official',
        createdAt: Number(record.createdAt) || 0,
        updatedAt: Number(record.updatedAt) || 0
    };
}

export function buildDirectoryIndex({ globalCompanies = [], personalRecords = [] } = {}) {
    const entries = [];
    const byId = new Map();

    (Array.isArray(globalCompanies) ? globalCompanies : []).forEach((company) => {
        if (!company || typeof company !== 'object') return;
        const canonicalName = String(company.canonicalName || '').trim();
        if (!canonicalName) return;
        const id = String(company.id || comparisonKey(canonicalName)).trim();
        const entry = {
            id,
            canonicalName,
            legalName: String(company.legalName || '').trim(),
            aliases: normalizeStringList(company.aliases).slice(0, MAX_COMPANY_ALIASES),
            domains: normalizeDomainList(company.domains),
            parentCompany: String(company.parentCompany || '').trim(),
            source: 'official',
            personal: false,
            recordId: ''
        };
        entries.push(entry);
        if (id) byId.set(id, entry);
    });

    (Array.isArray(personalRecords) ? personalRecords : []).forEach((record) => {
        const clean = cloneCompanyRecord(record);
        if (!clean || !clean.canonicalName) return;
        const linkId = clean.directoryId;
        if (linkId && byId.has(linkId)) {
            const target = byId.get(linkId);
            clean.aliases.forEach((alias) => {
                if (!target.aliases.some((item) => comparisonKey(item) === comparisonKey(alias))) target.aliases.push(alias);
            });
            clean.domains.forEach((domain) => {
                if (!target.domains.includes(domain)) target.domains.push(domain);
            });
            target.personal = true;
            return;
        }
        const entry = {
            id: clean.id || clean.canonicalName,
            canonicalName: clean.canonicalName,
            legalName: clean.legalName,
            aliases: clean.aliases,
            domains: clean.domains,
            parentCompany: clean.parentCompany,
            source: 'user',
            personal: true,
            recordId: clean.id
        };
        entries.push(entry);
    });

    const byCanonical = new Map();
    const byAlias = new Map();
    const byLoose = new Map();
    const byDomain = new Map();

    const ordered = [...entries].sort((a, b) => (a.personal ? 1 : 0) - (b.personal ? 1 : 0));
    ordered.forEach((entry) => {
        const own = entry.personal;
        const canonical = comparisonKey(entry.canonicalName);
        if (canonical) byCanonical.set(canonical, entry);
        const loose = looseKey(entry.canonicalName);
        if (loose && (own || !byLoose.has(loose))) byLoose.set(loose, entry);
        entry.aliases.forEach((alias) => {
            const aliasKey = comparisonKey(alias);
            if (aliasKey && (own || !byAlias.has(aliasKey))) byAlias.set(aliasKey, entry);
            const aliasLoose = looseKey(alias);
            if (aliasLoose && (own || !byLoose.has(aliasLoose))) byLoose.set(aliasLoose, entry);
        });
        entry.domains.forEach((domain) => {
            const domainKey = domain.toLowerCase();
            if (domainKey && (own || !byDomain.has(domainKey))) byDomain.set(domainKey, entry);
        });
    });

    return { entries, byCanonical, byAlias, byLoose, byDomain };
}

export function matchCompany(name, index) {
    const key = comparisonKey(name);
    if (!key || !index) return null;

    const canonical = index.byCanonical.get(key);
    if (canonical) return { entry: canonical, matchType: 'canonical', confidence: 1 };

    const alias = index.byAlias.get(key);
    if (alias) return { entry: alias, matchType: 'alias', confidence: 0.95 };

    const loose = index.byLoose.get(looseKey(name));
    if (loose) return { entry: loose, matchType: 'normalized', confidence: APPLY_CONFIDENCE };

    return null;
}

function jaroSimilarity(a, b) {
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

function tokenSimilarity(a, b) {
    const left = comparisonKey(a).split(' ').filter(Boolean);
    const right = comparisonKey(b).split(' ').filter(Boolean);
    if (!left.length || !right.length) return 0;
    const rightSet = new Set(right);
    const shared = left.filter((word) => rightSet.has(word)).length;
    if (!shared) return 0;
    const union = new Set([...left, ...right]).size;
    const jaccard = shared / union;
    const contains = left.every((word) => rightSet.has(word)) || right.every((word) => new Set(left).has(word));
    if (contains && left[0] === right[0]) return Math.max(jaccard, TOKEN_THRESHOLD);
    return 0;
}

export function suggestCompany(name, index) {
    const key = comparisonKey(name);
    if (!key || !index) return null;
    let bestFuzzy = null;
    let bestToken = null;
    index.entries.forEach((entry) => {
        [entry.canonicalName, ...entry.aliases].forEach((candidate) => {
            const fuzzy = fuzzySimilarity(key, candidate);
            if (!bestFuzzy || fuzzy > bestFuzzy.score) bestFuzzy = { entry, score: fuzzy, matched: candidate };
            const token = tokenSimilarity(key, candidate);
            if (token && (!bestToken || token > bestToken.score)) bestToken = { entry, score: token, matched: candidate };
        });
    });
    if (bestFuzzy && bestFuzzy.score >= FUZZY_THRESHOLD) return bestFuzzy;
    if (bestToken && bestToken.score >= TOKEN_THRESHOLD) return bestToken;
    return null;
}

function hostFromUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    try {
        return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

function domainCandidates(host) {
    const parts = String(host || '').split('.').filter(Boolean);
    const out = [];
    for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
    return out;
}

function entryForHost(index, host) {
    if (!host || !index) return null;
    for (const candidate of domainCandidates(host)) {
        const entry = index.byDomain.get(candidate);
        if (entry) return entry;
    }
    return null;
}

export function resolveCompany(name, { index = null, source = '', url = '' } = {}) {
    const originalValue = String(name == null ? '' : name).trim();
    const base = {
        value: originalValue,
        originalValue,
        source,
        matchType: 'none',
        directoryId: null,
        confidence: 0,
        suggestion: null
    };
    if (!index) return base;

    if (!originalValue) {
        const entry = entryForHost(index, hostFromUrl(url));
        if (entry) {
            return { ...base, value: entry.canonicalName, matchType: 'domain', directoryId: entry.id, confidence: 0.85 };
        }
        return base;
    }

    const hit = matchCompany(originalValue, index);
    if (hit) {
        return {
            ...base,
            value: hit.entry.canonicalName,
            matchType: hit.matchType,
            directoryId: hit.entry.id,
            confidence: hit.confidence
        };
    }

    const suggestion = suggestCompany(originalValue, index);
    if (suggestion) {
        return {
            ...base,
            suggestion: {
                canonicalName: suggestion.entry.canonicalName,
                directoryId: suggestion.entry.id,
                score: Number(suggestion.score.toFixed(3))
            }
        };
    }

    return base;
}

export function decideCorrection({ original = '', corrected = '', index = null } = {}) {
    const sanitized = sanitizeCompanyName(corrected);
    if (!sanitized.valid) {
        return { status: 'invalid', reason: sanitized.reason, sanitized, entry: null };
    }
    const hit = matchCompany(sanitized.normalizedName, index);
    if (hit) {
        return { status: 'known', matchType: hit.matchType, entry: hit.entry, sanitized, original: String(original || '') };
    }
    const suggestion = suggestCompany(sanitized.normalizedName, index);
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

export function makeCompanyId(name) {
    const slug = comparisonKey(name).replace(/\s+/g, '-').slice(0, 40) || 'company';
    let hash = 0;
    const source = comparisonKey(name);
    for (let i = 0; i < source.length; i++) {
        hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    return `company_${slug}_${hash.toString(36).slice(0, 6)}`;
}

function uniqueId(records, id) {
    if (!records.some((record) => record && record.id === id)) return id;
    let counter = 2;
    while (records.some((record) => record && record.id === `${id}_${counter}`)) counter++;
    return `${id}_${counter}`;
}

function addAliasToEntry(records, entry, aliasName, now) {
    const alias = String(aliasName || '').trim();
    const aliasKey = comparisonKey(alias);
    if (!aliasKey || !entry) return { records, changed: false };
    if (entry.aliases.some((item) => comparisonKey(item) === aliasKey)) return { records, changed: false };

    if (entry.source === 'official') {
        const linked = records.find((record) => record && record.directoryId === entry.id);
        if (linked) {
            if ((linked.aliases || []).some((item) => comparisonKey(item) === aliasKey)) {
                return { records, changed: false };
            }
            const next = records.map((record) => (
                record.id === linked.id
                    ? { ...record, aliases: [...(record.aliases || []), alias], updatedAt: now }
                    : record
            ));
            return { records: next, changed: true };
        }
        const record = {
            id: uniqueId(records, makeCompanyId(alias)),
            canonicalName: entry.canonicalName,
            legalName: '',
            aliases: [alias],
            domains: [],
            directoryId: entry.id,
            source: 'user',
            createdAt: now,
            updatedAt: now
        };
        return { records: [...records, record], changed: true };
    }

    const targetId = entry.recordId || entry.id;
    let changed = false;
    const next = records.map((record) => {
        if (!record || record.id !== targetId) return record;
        if ((record.aliases || []).some((item) => comparisonKey(item) === aliasKey)) return record;
        changed = true;
        return { ...record, aliases: [...(record.aliases || []), alias], updatedAt: now };
    });
    return { records: changed ? next : records, changed };
}

export function applyCorrection(records = [], decision = {}, options = {}) {
    const list = (Array.isArray(records) ? records : []).map(cloneCompanyRecord).filter(Boolean);
    const { original = '', confirmed = false, forceNew = false, now = Date.now() } = options;
    const status = decision && decision.status ? decision.status : 'invalid';

    if (status === 'invalid') {
        return { records: list, action: 'invalid', message: (decision && decision.reason) || 'invalid', entry: null };
    }

    const originalName = String(original || '').trim();
    const originalSanitized = originalName ? sanitizeCompanyName(originalName) : null;
    const originalIsNew = !!(originalSanitized && originalSanitized.valid);

    if (status === 'new') {
        const canonicalKey = comparisonKey(decision.sanitized.normalizedName);
        const existing = list.find((record) => comparisonKey(record.canonicalName) === canonicalKey);
        if (existing) {
            const known = applyCorrection(list, { status: 'known', entry: existing, sanitized: decision.sanitized }, options);
            return { ...known, action: known.action === 'alias-added' ? 'alias-added' : 'none', message: 'already known' };
        }
    }

    if (status === 'known') {
        const entry = decision.entry;
        if (!entry || !originalIsNew) {
            return { records: list, action: 'none', message: 'already known', entry };
        }
        const canonicalLoose = looseKey(entry.canonicalName);
        const originalLoose = looseKey(originalName);
        if (originalLoose && originalLoose !== canonicalLoose) {
            const added = addAliasToEntry(list, entry, originalSanitized.normalizedName, now);
            if (added.changed) {
                return { records: added.records, action: 'alias-added', message: `saved "${originalSanitized.normalizedName}" as an alias of ${entry.canonicalName}`, entry };
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
        const seenAlias = new Set();
        const aliases = [
            decision.sanitized.normalizedName,
            originalIsNew ? originalSanitized.normalizedName : ''
        ].filter((name) => {
            const key = comparisonKey(name);
            if (!key || seenAlias.has(key)) return false;
            seenAlias.add(key);
            return true;
        });
        let working = list;
        let changed = false;
        aliases.forEach((aliasName) => {
            const added = addAliasToEntry(working, entry, aliasName, now);
            working = added.records;
            changed = changed || added.changed;
        });
        return {
            records: working,
            action: changed ? 'alias-added' : 'none',
            message: changed ? `saved "${decision.sanitized.normalizedName}" as an alias of ${entry.canonicalName}` : 'already known',
            entry
        };
    }

    return createPersonalEntry(list, decision.sanitized, originalIsNew ? originalSanitized : null, now);
}

function createPersonalEntry(records, sanitized, originalSanitized, now) {
    const canonicalName = sanitized.normalizedName;
    const aliases = [];
    if (originalSanitized && comparisonKey(originalSanitized.normalizedName) !== comparisonKey(canonicalName)) {
        aliases.push(originalSanitized.normalizedName);
    }
    const record = {
        id: uniqueId(records, makeCompanyId(canonicalName)),
        canonicalName,
        legalName: '',
        aliases,
        domains: [],
        directoryId: null,
        source: 'user',
        createdAt: now,
        updatedAt: now
    };
    return {
        records: [...records, record],
        action: 'created',
        message: `added ${canonicalName} to your directory`,
        entry: record
    };
}

export function describeDecision(decision) {
    if (!decision) return { tone: 'muted', text: '' };
    if (decision.status === 'invalid') {
        const reasons = {
            empty: 'Add a company name.',
            too_long: 'That name is too long to be a company.',
            no_letters: 'That does not look like a company name.',
            email: 'That is an email address, not a company.',
            url: 'That is a link, not a company.',
            generic: 'That is a placeholder, not a company.',
            navigation: 'That is page navigation, not a company.',
            department: 'That is a department, not a company.',
            job_title: 'That is a job title, not a company.',
            sentence: 'That is a sentence, not a company.'
        };
        return { tone: 'warn', text: reasons[decision.reason] || 'Not a company name — kept for this application only.' };
    }
    if (decision.status === 'known') {
        const where = decision.entry && decision.entry.source === 'official' ? 'the official directory' : 'your directory';
        return { tone: 'good', text: `Matches ${decision.entry.canonicalName} in ${where}.` };
    }
    if (decision.status === 'suggest') {
        return { tone: 'warn', text: `Looks like ${decision.entry.canonicalName} — saved as an alias when you save.` };
    }
    return { tone: 'muted', text: 'Will be added to your company directory.' };
}
