// job-location-directory.js — deterministic job location handling.
// Pure: no chrome.* APIs, no network. Locations can be multi-city postings,
// so this module also chooses the candidate that matches the master profile.

import {
    comparisonKey,
    decodeHtmlEntities,
    normalizeStringList,
    stripSurroundingQuotes,
    suggestEntry,
    uniqueId,
    DEFAULT_FUZZY_THRESHOLD,
    DEFAULT_TOKEN_THRESHOLD
} from './directory-core.js';

export const MAX_LOCATION_NAME_LENGTH = 140;
export const MAX_LOCATION_ALIASES = 40;
export const LOCATION_APPLY_CONFIDENCE = 0.9;
export const LOCATION_FUZZY_THRESHOLD = DEFAULT_FUZZY_THRESHOLD;
export const LOCATION_TOKEN_THRESHOLD = DEFAULT_TOKEN_THRESHOLD;

const PLACEHOLDER_LOCATIONS = new Set([
    'multiple locations', 'multiple', 'various', 'various locations', 'various places',
    'any location', 'anywhere', 'worldwide', 'global', 'flexible', 'negotiable',
    'n a', 'na', 'none', 'tbd', 'tba', 'not specified', 'not available', 'unknown',
    'location', 'locations', 'city', 'region', 'country', 'place', 'office'
]);

const MODE_LABELS = {
    remote: 'Remote',
    hybrid: 'Hybrid',
    'on-site': 'On-site',
    onsite: 'On-site',
    telecommute: 'Remote'
};

const COUNTRY_CODE_PARTS = /^[A-Z]{2,3}$/;

const LOCATION_STOPWORDS = new Set(['of', 'the', 'and', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'da', 'do', 'dos', 'das']);
const LOCATION_ACRONYMS = new Set(['us', 'usa', 'uk', 'uae', 'eu', 'un']);

function titleCaseLocationPart(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/[A-Z]/.test(text) && /[a-z]/.test(text)) return text;
    return text.split(/\s+/).map((word, index) => {
        const lower = word.toLowerCase();
        if (index > 0 && LOCATION_STOPWORDS.has(lower)) return lower;
        if (LOCATION_ACRONYMS.has(lower)) return lower.toUpperCase();
        if (word.length <= 3 && word === word.toUpperCase()) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
}

const REGION_ALIASES = {
    al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
    co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia',
    hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
    ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
    ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi',
    mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada',
    nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york',
    nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma',
    or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
    sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
    va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin',
    wy: 'wyoming', ab: 'alberta', bc: 'british columbia', mb: 'manitoba',
    nb: 'new brunswick', nl: 'newfoundland and labrador', ns: 'nova scotia',
    nt: 'northwest territories', nu: 'nunavut', on: 'ontario',
    pe: 'prince edward island', qc: 'quebec', sk: 'saskatchewan', yt: 'yukon',
    england: 'england', scotland: 'scotland', wales: 'wales', 'northern ireland': 'northern ireland',
    'new south wales': 'new south wales', victoria: 'victoria', queensland: 'queensland',
    'western australia': 'western australia', 'south australia': 'south australia',
    tasmania: 'tasmania', 'australian capital territory': 'australian capital territory',
    'northern territory': 'northern territory'
};

const COUNTRY_ALIASES = {
    usa: 'united states',
    us: 'united states',
    'united states of america': 'united states',
    uk: 'united kingdom',
    'great britain': 'united kingdom',
    britain: 'united kingdom',
    uae: 'united arab emirates'
};

function normalizeCountryKey(value) {
    const key = comparisonKey(value);
    return COUNTRY_ALIASES[key] || key;
}

function isRegionToken(value) {
    const key = comparisonKey(value);
    if (!key) return false;
    if (REGION_ALIASES[key]) return true;
    return Object.values(REGION_ALIASES).includes(key);
}

function isCountryToken(value) {
    const key = comparisonKey(value);
    if (!key) return false;
    if (COUNTRY_ALIASES[key]) return true;
    return !isRegionToken(value);
}

function regionVariants(value) {
    const key = comparisonKey(value);
    const out = new Set();
    if (!key) return out;
    out.add(key);
    if (REGION_ALIASES[key]) out.add(REGION_ALIASES[key]);
    Object.keys(REGION_ALIASES).forEach((abbreviation) => {
        if (REGION_ALIASES[abbreviation] === key) out.add(abbreviation);
    });
    return out;
}

function regionsEquivalent(left, right) {
    const a = regionVariants(left);
    const b = regionVariants(right);
    if (!a.size || !b.size) return true;
    for (const value of a) {
        if (b.has(value)) return true;
    }
    return false;
}

function regionCodeFor(region) {
    const key = comparisonKey(region);
    if (!key) return '';
    if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
    const abbreviation = Object.keys(REGION_ALIASES).find((candidate) => (
        candidate.length === 2 && REGION_ALIASES[candidate] === key
    ));
    return abbreviation ? abbreviation.toUpperCase() : '';
}

function invalid(reason) {
    return { valid: false, normalizedName: '', displayName: '', reason, city: '', region: '', regionCode: '', country: '', mode: '' };
}

function cleanLocationText(input) {
    let text = String(input == null ? '' : input);
    if (!text.trim()) return '';
    text = text.normalize('NFC');
    text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
    text = text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    text = decodeHtmlEntities(text);
    text = text.replace(/\s+/g, ' ').trim();
    text = stripSurroundingQuotes(text);
    text = text.replace(/^\s*(?:locations?|work location|based in|based out of|hiring in|office)\s*[:\-–—]\s*/i, '');
    text = text.replace(/^(?:[•·\-*]\s*)+/, '').trim();
    text = text.replace(/^[,;:|·•\-\s]+|[,;:|·•\-\s]+$/g, '').trim();
    return text;
}

function expandMode(raw) {
    const key = String(raw || '').toLowerCase().replace(/\s+/g, '');
    return MODE_LABELS[key] || '';
}

function splitPlace(place) {
    const parts = String(place || '').split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return { city: '', region: '', country: '' };
    if (parts.length === 1) {
        const only = parts[0];
        if (COUNTRY_CODE_PARTS.test(only)) return { city: '', region: '', country: only };
        return { city: only, region: '', country: '' };
    }
    if (parts.length === 2) {
        if (isRegionToken(parts[1])) return { city: parts[0], region: parts[1], country: '' };
        if (isCountryToken(parts[1])) return { city: parts[0], region: '', country: parts[1] };
        return { city: parts[0], region: parts[1], country: '' };
    }
    return { city: parts[0], region: parts[1], country: parts.slice(2).join(', ') };
}

export function parseLocation(input) {
    let text = cleanLocationText(input);
    if (!text) return invalid('empty');

    let mode = '';
    let place = text;

    let match = text.match(/^(remote|hybrid|on-?site|telecommute)\s*[-–—|:]\s*(.+)$/i);
    if (match) {
        mode = expandMode(match[1]);
        place = match[2].trim();
    }
    if (!mode) {
        match = text.match(/^(remote|hybrid|on-?site|telecommute)\s*(?:[-–—|/]\s*|\()([^)]*)\)?$/i);
        if (match) {
            mode = expandMode(match[1]);
            place = match[2].trim();
        }
    }
    if (!mode) {
        match = text.match(/^(.*?)\s*[-–—|/]\s*(remote|hybrid|on-?site|telecommute)\s*(?:\(([^)]*)\))?$/i);
        if (match) {
            mode = expandMode(match[2]);
            place = match[1].trim();
            if (match[3]) place = place ? `${place}, ${match[3].trim()}` : match[3].trim();
        }
    }
    if (!mode) {
        match = text.match(/^(.*?)\s*\((remote|hybrid|on-?site|telecommute)(?:\s*[-–—]\s*([^)]*))?\)$/i);
        if (match) {
            mode = expandMode(match[2]);
            place = match[1].trim();
            if (match[3]) place = place ? `${place}, ${match[3].trim()}` : match[3].trim();
        }
    }
    if (!mode) {
        match = text.match(/^(remote|hybrid|on-?site|telecommute)$/i);
        if (match) {
            mode = expandMode(match[1]);
            place = '';
        }
    }

    const split = splitPlace(place);
    let city = split.city;
    let region = split.region;
    let country = split.country;

    if (!city && !region && !country && !mode) return invalid('empty');
    if (!city && !region && !country && mode) {
        city = '';
    }

    const cityKey = comparisonKey(city);
    const regionKey = comparisonKey(region);
    const countryKey = normalizeCountryKey(country);
    const displayName = formatLocationDisplay({ city, region, country, mode });
    if (!displayName) return invalid('empty');
    if (displayName.length > MAX_LOCATION_NAME_LENGTH) return invalid('too_long');
    if (!/\p{L}/u.test(displayName)) return invalid('no_letters');
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(displayName)) return invalid('email');
    if (/^(?:https?:\/\/|www\.)/i.test(displayName)) return invalid('url');
    if (PLACEHOLDER_LOCATIONS.has(comparisonKey(displayName))) return invalid('placeholder');
    if (comparisonKey(city) && PLACEHOLDER_LOCATIONS.has(cityKey) && !regionKey && !countryKey) return invalid('placeholder');
    if (!cityKey && !regionKey && !countryKey && !mode) return invalid('empty');

    const words = comparisonKey(displayName).split(' ').filter(Boolean);
    if (words.length >= 10 && /\b(?:we|you|our|your|they|their|us)\b/.test(comparisonKey(displayName))) return invalid('sentence');

    return {
        valid: true,
        normalizedName: displayName,
        displayName,
        city,
        region,
        regionCode: regionCodeFor(region) || region,
        country,
        mode,
        cityKey,
        regionKey,
        countryKey,
        fullKey: locationFullKey({ cityKey, regionKey, countryKey }),
        reason: null
    };
}

export function formatLocationDisplay({ city = '', region = '', country = '', mode = '' } = {}) {
    const cleanCity = titleCaseLocationPart(city);
    let cleanRegion = titleCaseLocationPart(region);
    if (/^[A-Za-z]{2}$/.test(cleanRegion)) cleanRegion = cleanRegion.toUpperCase();
    const cleanCountry = titleCaseLocationPart(country);
    const parts = [];
    if (cleanCity) parts.push(cleanCity);
    if (cleanRegion && comparisonKey(cleanRegion) !== comparisonKey(cleanCity)) parts.push(cleanRegion);
    if (cleanCountry && comparisonKey(cleanCountry) !== comparisonKey(cleanCity) && comparisonKey(cleanCountry) !== comparisonKey(cleanRegion)) {
        parts.push(cleanCountry);
    }
    const place = parts.join(', ');
    if (!place) return mode ? `${mode}${cleanCountry ? ` (${cleanCountry})` : ''}` : cleanCountry;
    if (!cleanCity && cleanCountry) return mode ? `${mode} (${cleanCountry})` : cleanCountry;
    return mode ? `${place} (${mode})` : place;
}

function locationFullKey({ cityKey = '', regionKey = '', countryKey = '' }) {
    if (!cityKey && !regionKey && !countryKey) return '';
    return [cityKey, regionKey, countryKey].join('|');
}

function locationCityRegionKey(cityKey, regionKey) {
    return cityKey && regionKey ? `${cityKey}|${regionKey}` : '';
}

function locationCityCountryKey(cityKey, countryKey) {
    return cityKey && countryKey ? `${cityKey}|${countryKey}` : '';
}

export function sanitizeLocation(input) {
    const parsed = parseLocation(input);
    if (!parsed.valid) return parsed;
    return {
        valid: true,
        normalizedName: parsed.normalizedName,
        displayName: parsed.displayName,
        titleKey: comparisonKey(parsed.displayName),
        reason: null,
        ...parsed
    };
}

export function locationKey(name) {
    return comparisonKey(name);
}

export function cloneLocationRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const fallbackName = String(record.displayName || record.canonicalName || '').trim();
    const parsed = parseLocation(record.canonicalName || fallbackName);
    const city = String(record.city || parsed.city || '').trim();
    const region = String(record.region || parsed.region || '').trim();
    const country = String(record.country || parsed.country || '').trim();
    const mode = String(record.mode || parsed.mode || '').trim();
    const canonicalName = String(record.canonicalName || '').trim() || formatLocationDisplay({ city, region, country, mode });
    if (!canonicalName) return null;
    return {
        id: String(record.id || ''),
        canonicalName,
        displayName: String(record.displayName || '').trim() || formatLocationDisplay({ city, region, country, mode }),
        city,
        region,
        regionCode: String(record.regionCode || '').trim() || regionCodeFor(region) || region,
        country,
        mode,
        aliases: normalizeStringList(record.aliases).slice(0, MAX_LOCATION_ALIASES),
        directoryId: String(record.directoryId || '').trim() || null,
        source: record.source === 'user' ? 'user' : 'official',
        createdAt: Number(record.createdAt) || 0,
        updatedAt: Number(record.updatedAt) || 0
    };
}

function entryKeys(entry) {
    const cityKey = comparisonKey(entry.city);
    const regionKeys = [...new Set([comparisonKey(entry.region), comparisonKey(entry.regionCode)].filter(Boolean))];
    const countryKeys = [...new Set([normalizeCountryKey(entry.country)].filter(Boolean))];
    const full = new Set();
    const cityRegion = new Set();
    const cityCountry = new Set();
    const regionVariants = regionKeys.length ? regionKeys : [''];
    const countryVariants = countryKeys.length ? countryKeys : [''];
    regionVariants.forEach((regionKey) => {
        countryVariants.forEach((countryKey) => {
            if (cityKey) full.add(locationFullKey({ cityKey, regionKey, countryKey }));
        });
        if (cityKey && regionKey) cityRegion.add(locationCityRegionKey(cityKey, regionKey));
    });
    countryVariants.forEach((countryKey) => {
        if (cityKey && countryKey) cityCountry.add(locationCityCountryKey(cityKey, countryKey));
    });
    return { cityKey, full, cityRegion, cityCountry };
}

export function buildLocationIndex({ globalLocations = [], personalRecords = [] } = {}) {
    const entries = [];
    const byId = new Map();

    (Array.isArray(globalLocations) ? globalLocations : []).forEach((location) => {
        if (!location || typeof location !== 'object') return;
        const clean = cloneLocationRecord(location);
        if (!clean) return;
        clean.id = String(location.id || location.canonicalName).trim();
        clean.source = 'official';
        clean.personal = false;
        clean.recordId = '';
        entries.push(clean);
        if (clean.id) byId.set(clean.id, clean);
    });

    (Array.isArray(personalRecords) ? personalRecords : []).forEach((record) => {
        const clean = cloneLocationRecord(record);
        if (!clean) return;
        if (clean.directoryId && byId.has(clean.directoryId)) {
            const target = byId.get(clean.directoryId);
            clean.aliases.forEach((alias) => {
                if (!target.aliases.some((item) => comparisonKey(item) === comparisonKey(alias))) target.aliases.push(alias);
            });
            target.personal = true;
            return;
        }
        clean.id = clean.id || clean.canonicalName;
        clean.source = 'user';
        clean.personal = true;
        clean.recordId = clean.id;
        entries.push(clean);
    });

    const byCanonical = new Map();
    const byAlias = new Map();
    const byFull = new Map();
    const byCityRegion = new Map();
    const byCityCountry = new Map();
    const byCity = new Map();
    const byCityAlias = new Map();

    const ordered = [...entries].sort((a, b) => (a.personal ? 1 : 0) - (b.personal ? 1 : 0));
    ordered.forEach((entry) => {
        const own = entry.personal;
        const canonical = comparisonKey(entry.canonicalName);
        if (canonical) byCanonical.set(canonical, entry);
        const display = comparisonKey(entry.displayName);
        if (display) byCanonical.set(display, entry);
        entry.aliases.forEach((alias) => {
            const aliasKey = comparisonKey(alias);
            if (aliasKey && (own || !byAlias.has(aliasKey))) byAlias.set(aliasKey, entry);
        });
        const keys = entryKeys(entry);
        keys.full.forEach((key) => {
            if (own || !byFull.has(key)) byFull.set(key, entry);
        });
        keys.cityRegion.forEach((key) => {
            if (own || !byCityRegion.has(key)) byCityRegion.set(key, entry);
        });
        keys.cityCountry.forEach((key) => {
            if (own || !byCityCountry.has(key)) byCityCountry.set(key, entry);
        });
        if (keys.cityKey) {
            if (!byCity.has(keys.cityKey)) byCity.set(keys.cityKey, []);
            const list = byCity.get(keys.cityKey);
            if (!list.some((item) => item.id === entry.id)) list.push(entry);
        }
        entry.aliases.forEach((alias) => {
            if (String(alias).includes(',')) return;
            const aliasKey = comparisonKey(alias);
            if (!aliasKey || aliasKey === keys.cityKey) return;
            if (!byCityAlias.has(aliasKey)) byCityAlias.set(aliasKey, []);
            const list = byCityAlias.get(aliasKey);
            if (!list.some((item) => item.id === entry.id)) list.push(entry);
        });
    });

    return { entries, byCanonical, byAlias, byFull, byCityRegion, byCityCountry, byCity, byCityAlias };
}

export function matchLocation(name, index) {
    if (!index) return null;
    const parsed = parseLocation(name);
    if (!parsed.valid) return null;

    const canonical = index.byCanonical.get(comparisonKey(parsed.displayName));
    if (canonical) return { entry: canonical, matchType: 'canonical', confidence: 1 };
    const alias = index.byAlias.get(comparisonKey(parsed.displayName));
    if (alias) return { entry: alias, matchType: 'alias', confidence: 0.95 };

    if (parsed.cityKey && parsed.regionKey) {
        const hit = index.byCityRegion.get(locationCityRegionKey(parsed.cityKey, parsed.regionKey));
        if (hit) return { entry: hit, matchType: 'city-region', confidence: LOCATION_APPLY_CONFIDENCE };
    }
    if (parsed.cityKey && parsed.countryKey) {
        const hit = index.byCityCountry.get(locationCityCountryKey(parsed.cityKey, parsed.countryKey));
        if (hit) return { entry: hit, matchType: 'city-country', confidence: 0.9 };
    }
    if (parsed.cityKey) {
        const candidates = [
            ...(index.byCity.get(parsed.cityKey) || []),
            ...(index.byCityAlias.get(parsed.cityKey) || [])
        ];
        const seen = new Set();
        const unique = candidates.filter((entry) => {
            const id = entry.id || entry.canonicalName;
            if (seen.has(id)) return false;
            seen.add(id);
            const regionKeys = [comparisonKey(entry.region), comparisonKey(entry.regionCode)].filter(Boolean);
            const countryKeys = [normalizeCountryKey(entry.country)].filter(Boolean);
            if (parsed.regionKey && regionKeys.length && !regionKeys.includes(parsed.regionKey)) return false;
            if (parsed.countryKey && countryKeys.length && !countryKeys.includes(parsed.countryKey)) return false;
            return true;
        });
        if (unique.length === 1) {
            return { entry: unique[0], matchType: parsed.regionKey ? 'city-region' : 'city', confidence: 0.85 };
        }
    }
    if (parsed.fullKey) {
        const hit = index.byFull.get(parsed.fullKey);
        if (hit) return { entry: hit, matchType: 'normalized', confidence: LOCATION_APPLY_CONFIDENCE };
    }
    return null;
}

export function suggestLocation(name, index) {
    const parsed = parseLocation(name);
    const probe = parsed.valid ? parsed.displayName : String(name || '');
    return suggestEntry(probe, index, {
        keyOf: comparisonKey,
        fuzzyThreshold: LOCATION_FUZZY_THRESHOLD,
        tokenThreshold: LOCATION_TOKEN_THRESHOLD,
        candidateNames: (entry) => [
            entry.displayName,
            entry.canonicalName,
            entry.city,
            ...(entry.aliases || [])
        ].filter(Boolean)
    });
}

export function resolveLocation(name, { index = null } = {}) {
    const parsed = parseLocation(name);
    const originalValue = String(name == null ? '' : name).trim();
    const base = {
        value: originalValue,
        originalValue,
        displayValue: parsed.valid ? parsed.displayName : originalValue,
        matchType: 'none',
        directoryId: null,
        confidence: 0,
        suggestion: null,
        apply: false
    };
    if (!index || !parsed.valid) return base;

    const hit = matchLocation(originalValue, index);
    if (hit) {
        const personal = hit.entry.personal === true;
        if (personal) {
            const display = hit.entry.displayName || hit.entry.canonicalName;
            return {
                ...base,
                value: display,
                displayValue: display,
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
                displayName: hit.entry.displayName,
                directoryId: hit.entry.id,
                score: Number(hit.confidence.toFixed(3)),
                source: 'official'
            }
        };
    }

    const suggestion = suggestLocation(originalValue, index);
    if (suggestion) {
        return {
            ...base,
            suggestion: {
                canonicalName: suggestion.entry.canonicalName,
                displayName: suggestion.entry.displayName,
                directoryId: suggestion.entry.id,
                score: Number(suggestion.score.toFixed(3)),
                source: suggestion.entry.source === 'user' ? 'user' : 'official'
            }
        };
    }
    return base;
}

export function pickPreferredLocation(candidates, masterLocation) {
    const list = (Array.isArray(candidates) ? candidates : [])
        .map((candidate) => String(candidate == null ? '' : candidate).trim())
        .filter(Boolean);
    const unique = [];
    const seen = new Set();
    list.forEach((candidate) => {
        const parsed = parseLocation(candidate);
        if (!parsed.valid) return;
        const key = comparisonKey(parsed.displayName);
        if (!key || seen.has(key)) return;
        seen.add(key);
        unique.push({ original: candidate, parsed });
    });
    if (!unique.length) {
        return { value: '', matched: false, reason: 'none', candidates: [] };
    }

    const master = parseLocation(masterLocation);
    if (master.valid) {
        for (const candidate of unique) {
            const placeMatch = (
                (candidate.parsed.cityKey && master.cityKey && candidate.parsed.cityKey === master.cityKey
                    && (!candidate.parsed.regionKey || !master.regionKey || regionsEquivalent(candidate.parsed.regionKey, master.regionKey)))
                || (!candidate.parsed.cityKey && !master.cityKey && candidate.parsed.mode && candidate.parsed.mode === master.mode)
            );
            const regionMatch = candidate.parsed.regionKey && master.regionKey
                ? regionsEquivalent(candidate.parsed.regionKey, master.regionKey)
                : true;
            if (placeMatch && regionMatch) {
                return {
                    value: candidate.original,
                    display: candidate.parsed.displayName,
                    matched: true,
                    reason: 'profile_match',
                    candidates: unique.map((item) => item.original)
                };
            }
        }
    }

    return {
        value: unique[0].original,
        display: unique[0].parsed.displayName,
        matched: false,
        reason: 'jd_primary',
        candidates: unique.map((item) => item.original)
    };
}

export function decideLocationCorrection({ original = '', corrected = '', index = null } = {}) {
    const sanitized = sanitizeLocation(corrected);
    if (!sanitized.valid) {
        return { status: 'invalid', reason: sanitized.reason, sanitized, entry: null };
    }
    const hit = matchLocation(sanitized.normalizedName, index);
    if (hit) {
        return { status: 'known', matchType: hit.matchType, entry: hit.entry, sanitized, original: String(original || '') };
    }
    const suggestion = suggestLocation(sanitized.normalizedName, index);
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

export function makeLocationId(name) {
    const slug = comparisonKey(name).replace(/\s+/g, '-').slice(0, 40) || 'location';
    let hash = 0;
    const source = comparisonKey(name);
    for (let i = 0; i < source.length; i++) {
        hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    return `location_${slug}_${hash.toString(36).slice(0, 6)}`;
}

function recordFromEntry(entry, extra = {}) {
    return {
        id: uniqueId(extra.records || [], makeLocationId(entry.canonicalName)),
        canonicalName: entry.canonicalName,
        displayName: entry.displayName,
        city: entry.city,
        region: entry.region,
        regionCode: entry.regionCode,
        country: entry.country,
        mode: entry.mode,
        aliases: [],
        directoryId: null,
        source: 'user',
        createdAt: extra.now || Date.now(),
        updatedAt: extra.now || Date.now()
    };
}

function addAliasToLocationEntry(records, entry, aliasName, now) {
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
        const record = recordFromEntry(entry, { records, now });
        record.aliases = [alias];
        record.directoryId = entry.id;
        return { records: [...records, record], changed: true };
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

function createPersonalLocation(records, sanitized, originalSanitized, now) {
    const record = {
        id: uniqueId(records, makeLocationId(sanitized.normalizedName)),
        canonicalName: sanitized.normalizedName,
        displayName: sanitized.displayName || sanitized.normalizedName,
        city: sanitized.city,
        region: sanitized.region,
        regionCode: sanitized.regionCode || sanitized.region,
        country: sanitized.country,
        mode: sanitized.mode,
        aliases: [],
        directoryId: null,
        source: 'user',
        createdAt: now,
        updatedAt: now
    };
    if (originalSanitized && comparisonKey(originalSanitized.normalizedName) !== comparisonKey(sanitized.normalizedName)) {
        record.aliases.push(originalSanitized.normalizedName);
    }
    return {
        records: [...records, record],
        action: 'created',
        message: `added ${sanitized.displayName} to your location directory`,
        entry: record
    };
}

export function applyLocationCorrection(records = [], decision = {}, options = {}) {
    const list = (Array.isArray(records) ? records : []).map(cloneLocationRecord).filter(Boolean);
    const { original = '', confirmed = false, forceNew = false, now = Date.now() } = options;
    const status = decision && decision.status ? decision.status : 'invalid';

    if (status === 'invalid') {
        return { records: list, action: 'invalid', message: (decision && decision.reason) || 'invalid', entry: null };
    }

    const originalName = String(original || '').trim();
    const originalSanitized = originalName ? sanitizeLocation(originalName) : null;
    const originalIsNew = !!(originalSanitized && originalSanitized.valid);

    if (status === 'new') {
        const canonicalKey = comparisonKey(decision.sanitized.displayName);
        const existing = list.find((record) => comparisonKey(record.displayName || record.canonicalName) === canonicalKey);
        if (existing) {
            const known = applyLocationCorrection(list, {
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
        if (comparisonKey(originalSanitized.displayName) !== comparisonKey(entry.displayName || entry.canonicalName)) {
            const added = addAliasToLocationEntry(list, entry, originalSanitized.normalizedName, now);
            if (added.changed) {
                return {
                    records: added.records,
                    action: 'alias-added',
                    message: `saved "${originalSanitized.displayName}" as an alias of ${entry.displayName || entry.canonicalName}`,
                    entry
                };
            }
        }
        return { records: list, action: 'none', message: 'already known', entry };
    }

    if (status === 'suggest') {
        if (forceNew) {
            return createPersonalLocation(list, decision.sanitized, originalIsNew ? originalSanitized : null, now);
        }
        if (!confirmed) {
            return { records: list, action: 'skipped', message: 'needs confirmation', entry: decision.entry };
        }
        const entry = decision.entry;
        const added = addAliasToLocationEntry(list, entry, decision.sanitized.normalizedName, now);
        return {
            records: added.records,
            action: added.changed ? 'alias-added' : 'none',
            message: added.changed
                ? `saved "${decision.sanitized.displayName}" as an alias of ${entry.displayName || entry.canonicalName}`
                : 'already known',
            entry
        };
    }

    return createPersonalLocation(list, decision.sanitized, originalIsNew ? originalSanitized : null, now);
}

export function describeLocationDecision(decision) {
    if (!decision) return { tone: 'muted', text: '' };
    if (decision.status === 'invalid') {
        const reasons = {
            empty: 'Add a location.',
            too_long: 'That location is too long.',
            no_letters: 'That does not look like a location.',
            email: 'That is an email address, not a location.',
            url: 'That is a link, not a location.',
            placeholder: 'That is a placeholder, not a location.',
            sentence: 'That is a sentence, not a location.'
        };
        return { tone: 'warn', text: reasons[decision.reason] || 'Not a location — kept for this application only.' };
    }
    if (decision.status === 'known') {
        const where = decision.entry && decision.entry.source === 'official' ? 'the official location list' : 'your directory';
        return { tone: 'good', text: `Matches ${decision.entry.displayName || decision.entry.canonicalName} in ${where}.` };
    }
    if (decision.status === 'suggest') {
        return { tone: 'warn', text: `Looks like ${decision.entry.displayName || decision.entry.canonicalName}.` };
    }
    return { tone: 'muted', text: 'Will be added to your location directory.' };
}
