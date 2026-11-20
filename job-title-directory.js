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
    uniqueAliasList,
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

const ROLE_WORDS = new Set([
    'engineer', 'engineering', 'developer', 'designer', 'manager', 'management', 'analyst',
    'specialist', 'coordinator', 'director', 'lead', 'leader', 'architect', 'consultant',
    'scientist', 'administrator', 'officer', 'representative', 'associate', 'assistant',
    'technician', 'recruiter', 'intern', 'internship', 'president', 'accountant', 'controller',
    'writer', 'editor', 'marketer', 'strategist', 'producer', 'researcher', 'nurse', 'teacher',
    'operator', 'supervisor', 'executive', 'partner', 'advisor', 'agent', 'clerk', 'driver',
    'chef', 'mechanic', 'sales', 'support', 'operations', 'product', 'project', 'program',
    'quality', 'security', 'software', 'hardware', 'network', 'systems', 'system', 'cloud',
    'devops', 'finance', 'financial', 'legal', 'counsel', 'paralegal', 'planner', 'buyer',
    'merchandiser', 'auditor', 'underwriter', 'teller', 'cashier', 'welder', 'electrician',
    'plumber', 'carpenter', 'receptionist', 'secretary', 'dispatcher', 'estimator', 'surveyor',
    'pharmacist', 'physician', 'therapist', 'clinician', 'counselor', 'psychologist', 'dentist',
    'hygienist', 'veterinarian', 'translator', 'interpreter', 'copywriter', 'content', 'curator',
    'librarian', 'statistician', 'economist', 'biologist', 'chemist', 'physicist', 'geologist',
    'pilot', 'attendant', 'barista', 'server', 'cook', 'baker', 'butcher', 'housekeeper',
    'janitor', 'custodian', 'guard', 'firefighter', 'paramedic', 'trainee', 'apprentice',
    'stagiaire', 'werkstudent', 'marketing', 'growth', 'brand', 'communications', 'research'
]);

const LEVEL_WORDS = new Set([
    'stage', 'intern', 'internship', 'trainee', 'apprentice', 'graduate', 'junior', 'senior',
    'sr', 'snr', 'jr', 'jrn', 'lead', 'principal', 'staff', 'mid', 'level', 'i', 'ii', 'iii',
    'iv', 'co', 'op', 'alternance', 'apprenti', 'stagiaire', 'praktikant', 'werkstudent'
]);

const IN_TITLE_QUALIFIERS = new Set([
    'test', 'training', 'sales', 'marketing', 'support', 'operations', 'practice', 'development',
    'engineering', 'design', 'research', 'security', 'quality', 'transition', 'residence',
    'charge', 'progress', 'review', 'residence', 'kind'
]);

const SITE_NAMES = [
    'linkedin', 'indeed', 'glassdoor', 'ziprecruiter', 'monster', 'careerbuilder',
    'simplyhired', 'workday', 'greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters',
    'bamboohr', 'hibob', 'jobvite', 'icims', 'taleo', 'wellfound', 'angellist', 'dice',
    'hired', 'weworkremotely', 'himalayas', 'jobot', 'lensa', 'recruitee', 'personio'
];

const CHROME_PATTERNS = [
    /^(?:jobs?|careers?|openings?|positions?|vacanc(?:y|ies)|roles?|opportunit(?:y|ies))(?:\s+(?:at|@|in)\b.*)?$/i,
    /^(?:home|welcome|search|apply|apply now|menu|back|next|share|save|print|overview)$/i,
    /^(?:job|position|role|title|details)$/i,
    /^(?:careers?|jobs?)\s+(?:at|@)\s+/i,
    /^(?:welcome to|join (?:our|the) team|join us|about us|why join|ready to)/i,
    /^(?:career opportunities|current openings|open positions|job board|job search|job details)$/i
];

const EMPLOYMENT_TAIL = /\s*[|·•\-–—]?\s*(?:full[-\s]?time|part[-\s]?time|contract(?:or)?|temporary|temp|permanent|internship|freelance|casual|seasonal)\s*$/i;
const MODE_TAIL = /\s*[|·•\-–—]?\s*(?:remote|hybrid|on-?site|remote[- ]first|work from home|wfh)\s*$/i;
const PAREN_NOISE = /\s*[\(\[]\s*(?:new|urgent|immediate start|start asap|asap|multiple positions?|various)\s*[\)\]]\s*$/i;
const SITE_TAIL = new RegExp(`\\s*[|·•]\\s*(?:${SITE_NAMES.join('|')})\\b.*$`, 'i');
const LABEL_PREFIX = /^\s*(?:job\s+title|position|role|title|opening|vacancy)\s*[:\-–—]\s*/i;
const ATS_PREFIX = /^\s*(?:job\s+application\s+for|job\s+application|apply\s+for|apply\s+to|apply\s+now\s+for|apply\s+now|jobs?\s+at|careers?\s+at|careers?|job\s+opening\s+for|opening\s+for|hiring\s+for)\s+/i;
const COUNTRY_PATTERN = /^(?:canada|usa|united states|u\.?s\.?|uk|united kingdom|ireland|india|germany|france|spain|portugal|netherlands|poland|brazil|mexico|australia|new zealand|singapore|japan|china|emea|apac|latam|europe|north america|south america|africa|asia)$/i;

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function hasRoleWord(text) {
    return titleComparisonKey(text).split(' ').some((word) => ROLE_WORDS.has(word));
}

function isAllCapsChrome(text) {
    const value = String(text || '');
    if (!/[A-Z]/.test(value) || /[a-z]/.test(value)) return false;
    return value.split(' ').length <= 5 && !hasRoleWord(value);
}

function isSiteChrome(text, ctx = {}) {
    const value = normalizeWhitespace(text);
    if (!value) return true;
    const key = titleComparisonKey(value);
    if (!key) return true;
    if (GENERIC_TITLES.has(key) || GENERIC_TITLES.has(looseKey(value, TITLE_SUFFIXES))) return true;
    if (CHROME_PATTERNS.some((re) => re.test(value))) return true;
    if (/^.+?\s+(?:careers|jobs|openings|vacancies)$/i.test(value)) return true;
    const compact = value.replace(/\s+/g, '').toLowerCase();
    if (/^[a-z0-9-]+\.(?:jobs?|com|io|co|org|net|ai|xyz)$/i.test(value.replace(/\s+/g, '')) && !hasRoleWord(value)) return true;
    if (SITE_NAMES.some((name) => key === name || key.startsWith(`${name} `) || key.endsWith(` ${name}`))) return true;
    const companyKey = comparisonKey(ctx.company);
    if (companyKey) {
        if (key === companyKey) return true;
        if (key === `${companyKey} careers` || key === `${companyKey} jobs`) return true;
    }
    if (isAllCapsChrome(value)) return true;
    if (compact.length < 2) return true;
    return false;
}

function isLocationLikeText(value, ctx = {}) {
    const text = normalizeWhitespace(value);
    if (!text) return false;
    if (MODE_TAIL.test(text) || /^(?:remote|hybrid|on ?site|anywhere)$/i.test(text)) return true;
    if (/\b(?:remote|hybrid|on-?site)\b/i.test(text)) return true;
    if (hasRoleWord(text)) return false;
    if (COUNTRY_PATTERN.test(text)) return true;
    if (/^[A-Z]{2}$/.test(text)) return true;
    if (/^[^,]{2,40},\s*(?:[A-Z]{2}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?:,\s*[^,]{2,40})?$/.test(text)) return true;
    const known = Array.isArray(ctx.locations) ? ctx.locations : [];
    const key = comparisonKey(text);
    if (key && known.some((loc) => {
        const locKey = comparisonKey(loc);
        return locKey && (locKey === key || locKey.includes(key) || key.includes(locKey));
    })) return true;
    if (!hasRoleWord(text) && /^[A-Z][\p{L}.'-]{2,23}$/u.test(text) && ctx.text) {
        const re = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(text)}\\s*[,·]`, 'i');
        if (re.test(ctx.text)) return true;
    }
    return false;
}

function separatorAt(src, index) {
    const ch = src[index];
    if (ch === '|' || ch === '·' || ch === '•') return { start: index, end: index };
    const before = src[index - 1] || '';
    const after = src[index + 1] || '';
    if ((ch === '-' || ch === '–' || ch === '—' || ch === '@') && /\s/.test(before) && /\s/.test(after)) {
        return { start: index - 1, end: index + 1 };
    }
    return null;
}

function splitTitleSegments(text) {
    const src = String(text || '');
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (ch === '(' || ch === '[') {
            depth++;
            continue;
        }
        if (ch === ')' || ch === ']') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth > 0) continue;
        const separator = separatorAt(src, i);
        if (!separator) continue;
        out.push(src.slice(start, separator.start));
        i = separator.end;
        start = i + 1;
    }
    out.push(src.slice(start));
    return out.map((part) => normalizeWhitespace(part)).filter(Boolean);
}

function scoreSegment(text, ctx = {}) {
    const value = normalizeWhitespace(text);
    if (!value || isSiteChrome(value, ctx)) return -1;
    const sanitized = sanitizeJobTitle(value);
    if (!sanitized.valid) return -1;
    let score = 0;
    if (hasRoleWord(value)) score += 5;
    const words = titleComparisonKey(value).split(' ').filter(Boolean);
    if (words.length >= 2) score += 2;
    if (words.length > 9) score -= 2;
    if (isLocationLikeText(value, ctx)) score -= 4;
    if (/^[\p{L} ,.&'’\-\/]+$/u.test(value) && /[A-Z]/.test(value)) score += 1;
    return score;
}

function pickSegment(segments, ctx = {}) {
    if (!segments.length) return '';
    if (segments.length === 1) return segments[0];
    if (segments.length === 2) {
        const [first, second] = segments;
        const firstRole = hasRoleWord(first);
        const secondRole = hasRoleWord(second);
        const secondNoise = isLocationLikeText(second, ctx) || isSiteChrome(second, ctx) || EMPLOYMENT_TAIL.test(second);
        if (firstRole && !secondRole && !secondNoise) {
            return `${first} - ${second}`;
        }
    }
    let best = '';
    let bestScore = -1;
    segments.forEach((segment) => {
        const score = scoreSegment(segment, ctx);
        if (score > bestScore) {
            best = segment;
            bestScore = score;
        }
    });
    return bestScore > 0 ? best : '';
}

function stripTrailingLocation(text, ctx = {}) {
    let out = String(text || '').trim();
    const trailingParen = out.match(/\s*[\(\[]\s*([^\)\]]{2,60})\s*[\)\]]\s*$/);
    if (trailingParen && isLocationLikeText(trailingParen[1], ctx)) {
        out = out.slice(0, trailingParen.index).trim();
    }
    const trailingComma = out.match(/\s*,\s*([^,()]{2,40}(?:,\s*[^,()]{2,40})?)\s*$/);
    if (trailingComma && isLocationLikeText(trailingComma[1], ctx)) {
        out = out.slice(0, trailingComma.index).trim();
    }
    const trailingDash = out.match(/\s+[-–—]\s+([^-–—|]{2,50})$/);
    if (trailingDash && isLocationLikeText(trailingDash[1], ctx)) {
        out = out.slice(0, trailingDash.index).trim();
    }
    const trailingIn = out.match(/\s+(?:in|based in|located in)\s+([^,()]{2,50}(?:,\s*[^,()]{2,40})?)\s*$/i);
    if (trailingIn && isLocationLikeText(trailingIn[1], ctx)) {
        out = out.slice(0, trailingIn.index).trim();
    } else if (trailingIn) {
        const inner = normalizeWhitespace(trailingIn[1]);
        const head = out.slice(0, trailingIn.index).trim();
        if (/^[A-Z]/.test(inner) && inner.split(' ').length <= 3 && !hasRoleWord(inner) && head.split(' ').length >= 2) {
            if (!IN_TITLE_QUALIFIERS.has(titleComparisonKey(inner))) out = head;
        }
    }
    return out;
}

function stripTrailingCompany(text, ctx = {}) {
    let out = String(text || '').trim();
    const company = comparisonKey(ctx.company);
    const match = out.match(/\s+(?:at|@|for)\s+([^-–—|,(]{2,60})\s*$/i);
    if (!match) return out;
    const tail = comparisonKey(match[1]);
    if (!tail) return out;
    if (company && (tail === company || company.includes(tail) || tail.includes(company))) {
        return out.slice(0, match.index).trim();
    }
    if (company) return out;
    const head = out.slice(0, match.index);
    if (!hasRoleWord(head)) return out;
    if (hasRoleWord(match[1])) return out;
    const tailWords = match[1].trim().split(/\s+/).filter(Boolean);
    if (tailWords.length < 1 || tailWords.length > 4) return out;
    if (isLocationLikeText(match[1], ctx)) return out;
    return head.trim();
}

function stripTrailingDashWord(text, ctx = {}) {
    const out = String(text || '').trim();
    const match = out.match(/\s+[-–—]\s+([\p{L}.'&]+)\s*$/u);
    if (!match) return out;
    const tail = match[1];
    if (LEVEL_WORDS.has(titleComparisonKey(tail))) return out;
    if (ROLE_WORDS.has(titleComparisonKey(tail))) return out;
    if (!hasRoleWord(out.slice(0, match.index))) return out;
    return out.slice(0, match.index).trim();
}

function stripLeadingLevelSegment(text) {
    const out = String(text || '').trim();
    const match = out.match(/^([\p{L}.'&]{2,24})\s+[-–—]\s+(.+)$/u);
    if (!match) return out;
    const left = match[1];
    const right = match[2];
    const leftKey = titleComparisonKey(left);
    const leftIsLevel = LEVEL_WORDS.has(leftKey) || (!hasRoleWord(left) && left.split(' ').length <= 1);
    if (leftIsLevel && hasRoleWord(right)) return right.trim();
    return out;
}

function stripAtsPrefix(text, ctx = {}) {
    let out = String(text || '').trim();
    for (let i = 0; i < 3; i++) {
        const before = out;
        out = out.replace(LABEL_PREFIX, '').trim();
        const prefixed = out.match(ATS_PREFIX);
        if (prefixed && prefixed[0].length < out.length) out = out.slice(prefixed[0].length).trim();
        const hiring = out.match(/^(.{2,80}?)\s+(?:is\s+hiring|hiring|seeks|seeking|wants)\s+(.+)$/i);
        if (hiring) {
            const head = normalizeWhitespace(hiring[1]);
            const tail = normalizeWhitespace(hiring[2]).replace(/\s+in\s+[^|,]+$/i, '').trim();
            const headKey = comparisonKey(head);
            const companyKey = comparisonKey(ctx.company);
            if ((companyKey && headKey === companyKey) || !hasRoleWord(head)) {
                if (hasRoleWord(tail)) out = tail;
            }
        }
        if (out === before) break;
    }
    return out;
}

function stripTrailingNoise(text, ctx = {}) {
    let out = String(text || '').trim();
    for (let i = 0; i < 12; i++) {
        const before = out;
        out = out.replace(SITE_TAIL, ' ').trim();
        out = out.replace(EMPLOYMENT_TAIL, ' ').trim();
        out = out.replace(MODE_TAIL, ' ').trim();
        out = out.replace(PAREN_NOISE, ' ').trim();
        out = out.replace(/\s*[\(\[]\s*(?:req(?:uisition)?|job\s*(?:id|number|no\.?|#)|id|ref(?:erence)?|posting)\s*[:#-]?\s*[A-Z0-9-]{2,}\s*[\)\]]\s*$/i, ' ').trim();
        out = out.replace(/\s*[\(\[]\s*[A-Z]{0,4}-?\d{4,}\s*[\)\]]\s*$/, ' ').trim();
        out = out.replace(/\s*[-–—]?\s*(?:req|job|posting)\s*(?:id|number|no\.?|#)?\s*[:#-]?\s*[A-Z]{0,4}-?\d{4,}\s*$/i, ' ').trim();
        out = out.replace(/\s*[\(\[]\s*[a-z]{1,3}(?:\s*\/\s*[a-z]{1,3}){1,2}\s*[\)\]]\s*$/i, ' ').trim();
        out = out.replace(/\s*[|·•\-–—]\s*(?:apply now|apply|new)\s*$/i, ' ').trim();
        out = stripTrailingLocation(out, ctx);
        out = stripTrailingCompany(out, ctx);
        out = stripTrailingDashWord(out, ctx);
        out = out.replace(/^[\s,;:|\-–—]+|[\s,;:|\-–—]+$/g, '').trim();
        if (out === before) break;
    }
    return out;
}

export function cleanJobTitleCandidate(input, options = {}) {
    const ctx = {
        company: String(options.company || ''),
        locations: Array.isArray(options.locations) ? options.locations : [],
        text: String(options.text || '')
    };
    let text = normalizeWhitespace(decodeHtmlEntities(String(input == null ? '' : input)));
    if (!text) return '';
    text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    text = normalizeWhitespace(text);
    text = stripAtsPrefix(text, ctx);
    text = stripTrailingNoise(text, ctx);
    text = stripLeadingLevelSegment(text);
    const segments = splitTitleSegments(text);
    const chosen = pickSegment(segments, ctx) || (segments.length === 1 ? segments[0] : '');
    text = chosen ? stripTrailingNoise(chosen, ctx) : '';
    text = normalizeWhitespace(text);
    const deduped = stripDuplicateTail(text);
    if (deduped !== text) text = normalizeWhitespace(stripTrailingNoise(deduped, ctx));
    if (!text || isSiteChrome(text, ctx)) return '';
    if (text.length > MAX_TITLE_NAME_LENGTH) return '';
    if (!hasRoleWord(text) && titleComparisonKey(text).split(' ').length < 2) return '';
    return text;
}

export function scoreJobTitleCandidate(text, options = {}) {
    const ctx = {
        company: String(options.company || ''),
        locations: Array.isArray(options.locations) ? options.locations : [],
        text: String(options.text || '')
    };
    const value = normalizeWhitespace(text);
    if (!value) return 0;
    const sanitized = sanitizeJobTitle(value);
    if (!sanitized.valid) return 0;
    let score = 2;
    if (hasRoleWord(value)) score += 5;
    const words = titleComparisonKey(value).split(' ').filter(Boolean);
    if (words.length >= 2) score += 2;
    if (words.length >= 3) score += 1;
    if (words.length > 9) score -= 3;
    if (isLocationLikeText(value, ctx)) score -= 6;
    if (isSiteChrome(value, ctx)) score -= 8;
    if (comparisonKey(ctx.company) && comparisonKey(value) === comparisonKey(ctx.company)) score -= 8;
    if (/\b[A-Z]{2,}\b/.test(value) && !hasRoleWord(value)) score -= 1;
    return score;
}

function bodyTitleCandidates(text) {
    const lines = String(text || '').split(/\n+/).map((line) => normalizeWhitespace(line)).filter(Boolean);
    const out = [];
    const limit = Math.min(lines.length, 40);
    for (let i = 0; i < limit; i++) {
        const line = lines[i];
        if (line.length < 3 || line.length > 90) continue;
        if (line.split(' ').length > 9) continue;
        if (/[.!?]$/.test(line)) continue;
        if (/^(?:overview|application|about this job|about us|responsibilities|requirements|qualifications|what you|who you|benefits|apply|back|share)$/i.test(line)) continue;
        const next = lines[i + 1] || '';
        const looksLikeTitle = hasRoleWord(line) || (next && isLocationLikeText(next, {}) && line.split(' ').length >= 2);
        if (!looksLikeTitle) continue;
        out.push({ value: line, source: 'body' });
        if (out.length >= 4) break;
    }
    return out;
}

const SOURCE_PRIORITY = {
    label: 9,
    jsonld: 8,
    h1: 7,
    og: 6,
    class: 5,
    twitter: 5,
    heading: 4,
    'doc-title': 3,
    page: 2,
    body: 1
};

function stripDuplicateTail(text) {
    const value = normalizeWhitespace(text);
    const words = value.split(' ');
    if (words.length < 3) return value;
    const last = words[words.length - 1].replace(/[^\p{L}]/gu, '');
    if (!last || ROLE_WORDS.has(last.toLowerCase())) return value;
    for (let i = 0; i < words.length - 1; i++) {
        const word = words[i].replace(/[^\p{L}]/gu, '');
        if (word && word.toLowerCase() === last.toLowerCase()) {
            return normalizeWhitespace(words.slice(0, i).join(' '));
        }
    }
    return value;
}

export function isChromeTitle(text) {
    return isSiteChrome(text, {});
}

export function looksLikeJobTitle(text) {
    const value = normalizeWhitespace(text);
    if (!value) return false;
    return hasRoleWord(value);
}

export function extractJobTitle({ candidates = [], company = '', locations = [], text = '' } = {}) {
    const ctx = {
        company: String(company || ''),
        locations: Array.isArray(locations) ? locations : [],
        text: String(text || '')
    };
    const list = [];
    const push = (rawValue, source) => {
        const raw = normalizeWhitespace(rawValue);
        if (!raw) return;
        const cleaned = cleanJobTitleCandidate(raw, ctx);
        if (!cleaned) return;
        const value = sanitizeJobTitle(cleaned).normalizedName || cleaned;
        const score = scoreJobTitleCandidate(value, ctx);
        if (score <= 0) return;
        const key = titleComparisonKey(value);
        if (!key) return;
        const entry = {
            value,
            raw,
            source: SOURCE_PRIORITY[source] ? source : 'page',
            score,
            priority: SOURCE_PRIORITY[source] || SOURCE_PRIORITY.page
        };
        const existing = list.find((item) => titleComparisonKey(item.value) === key);
        if (existing) {
            if (entry.priority > existing.priority || (entry.priority === existing.priority && entry.score > existing.score)) {
                Object.assign(existing, entry);
            }
            return;
        }
        list.push(entry);
    };

    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
        if (candidate && typeof candidate === 'object') push(candidate.value, candidate.source || 'page');
        else push(candidate, 'page');
    });

    const labeled = String(text || '').match(/^(?:job title|position|role|title)\s*[:\-–—]\s*(.{2,90})$/im);
    if (labeled) push(labeled[1], 'label');

    bodyTitleCandidates(text).forEach((candidate) => push(candidate.value, candidate.source));

    if (!list.length) {
        return { value: '', raw: '', source: 'none', confidence: 0, candidates: [] };
    }

    const primary = list.filter((item) => item.source !== 'body');
    const pool = primary.length ? primary : list;
    const ranked = [...pool].sort((a, b) => (b.score - a.score) || (b.priority - a.priority));
    const best = ranked[0];
    const rankedAll = [...list].sort((a, b) => (b.score - a.score) || (b.priority - a.priority));
    const confidence = Math.max(0, Math.min(0.99, (best.score + best.priority) / 20));
    return {
        value: best.value,
        raw: best.raw,
        source: best.source,
        confidence: Number(confidence.toFixed(2)),
        candidates: rankedAll.slice(0, 6).map((item) => ({
            value: item.value,
            source: item.source,
            score: item.score
        }))
    };
}

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
        const aliases = uniqueAliasList([
            decision.sanitized.normalizedName,
            originalIsNew ? originalSanitized.normalizedName : ''
        ]);
        let working = list;
        let changed = false;
        aliases.forEach((aliasName) => {
            const added = upsertAliasForEntry(working, entry, aliasName, now, makeTitleId);
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
        return { tone: 'warn', text: `Looks like ${decision.entry.canonicalName} — saved as an alias when you save.` };
    }
    return { tone: 'muted', text: 'Will be added to your job title directory.' };
}
