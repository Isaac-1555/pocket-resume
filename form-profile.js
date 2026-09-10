// form-profile.js
// Pure resolver logic: maps detected form fields to saved applicationProfile answers.
// No chrome.* APIs. Imported by background.js (module service worker).

const MAX_QUESTION_LENGTH = 300;

function normalizeQuestion(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getProfilePath(obj, path) {
    let node = obj;
    for (const part of path.split('.')) {
        if (!node || typeof node !== 'object') return undefined;
        node = node[part];
    }
    return node;
}

function words(text) {
    return normalizeQuestion(text).split(' ').filter(Boolean);
}

function jaccardSimilarity(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    if (!setA.size || !setB.size) return 0;
    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }
    return intersection / (setA.size + setB.size - intersection);
}

// Ordered: earlier matchers win. fullName before first/last; hispanic before race;
// email before street address; work authorized before sponsorship.
const CANONICAL_MATCHERS = [
    { key: 'fullName', kind: 'text', patterns: [/full name/, /^name$/, /your name/] },
    { key: 'firstName', kind: 'text', patterns: [/first name/, /given name/] },
    { key: 'lastName', kind: 'text', patterns: [/last name/, /surname/, /family name/] },
    { key: 'email', kind: 'text', patterns: [/e mail/, /email/] },
    { key: 'phone', kind: 'text', patterns: [/phone/, /mobile/, /cell/] },
    { key: 'linkedin', kind: 'text', patterns: [/linkedin/] },
    { key: 'github', kind: 'text', patterns: [/github/] },
    { key: 'website', kind: 'text', patterns: [/portfolio/, /personal website/, /website url/, /your website/, /^website$/, /personal site/, /blog url/] },
    { key: 'salaryAmount', kind: 'salary', patterns: [/salary/, /compensation/, /pay expectations/, /expected pay/, /wage/, /remuneration/, /expected ctc/, /ctc/, /pay/, /hourly rate/] },
    { key: 'streetAddress', kind: 'text', patterns: [/street address/, /address line 1/, /^address$/, /mailing address/, /home address/, /residential address/], guards: [/city/, /state/, /province/, /zip/, /postal/, /country/, /e mail/, /email/] },
    { key: 'addressLine2', kind: 'text', patterns: [/address line 2/, /apt/, /apartment/, /suite/, /unit number/] },
    { key: 'city', kind: 'text', patterns: [/^city$/, /city you live/, /town/] },
    { key: 'state', kind: 'text', patterns: [/^state$/, /state or province/, /province/, /region/] },
    { key: 'postalCode', kind: 'text', patterns: [/zip/, /postal code/, /postcode/, /pin code/] },
    { key: 'country', kind: 'text', patterns: [/country/, /nationality/] },
    { key: 'workAuthorized', kind: 'yesno', patterns: [/legally authorized to work/, /authorized to work/, /eligible to work/, /work authorization/, /legally allowed to work/, /are you authorized/] },
    { key: 'needsSponsorship', kind: 'yesno', patterns: [/sponsorship/, /sponsor/, /visa sponsorship/, /require visa/] },
    { key: 'over18', kind: 'yesno', patterns: [/18 years of age/, /over 18/, /over the age of 18/, /are you 18/, /legal age/, /18 or older/] },
    { key: 'willingToRelocate', kind: 'yesno', patterns: [/relocat/] },
    { key: 'remotePreference', kind: 'text', patterns: [/remote/, /hybrid/, /on site/, /onsite/, /work arrangement/, /work environment/, /work setup/], guards: [/relocat/] },
    { key: 'startDate', kind: 'date', patterns: [/start date/, /earliest start/, /availability date/, /available to start/, /when can you start/, /notice period/, /how soon can you start/, /available from/] },
    { key: 'yearsExperience', kind: 'number', patterns: [/years of experience/, /years experience/, /how many years/] },
    { key: 'eeo.gender', kind: 'text', patterns: [/gender/] },
    { key: 'eeo.hispanicLatino', kind: 'yesno', patterns: [/hispanic/, /latino/] },
    { key: 'eeo.race', kind: 'text', patterns: [/race/, /ethnicit/], guards: [/hispanic/, /latino/] },
    { key: 'eeo.veteran', kind: 'yesno', patterns: [/veteran/, /armed forces/] },
    { key: 'eeo.disability', kind: 'yesno', patterns: [/disability/, /disabled/] }
];

const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '\u20AC',
    GBP: '\u00A3',
    CAD: 'C$',
    AUD: 'A$',
    INR: '\u20B9'
};

function toYesNo(value) {
    const normalized = normalizeQuestion(String(value));
    if (/^(y|yes|true|1)/.test(normalized)) return 'Yes';
    if (/^(n|no|false|0)/.test(normalized)) return 'No';
    return '';
}

function salaryAnswer(field, questionNorm, profile) {
    const amount = Number(profile.salaryAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const period = normalizeQuestion(profile.salaryPeriod) === 'month' ? 'month'
        : normalizeQuestion(profile.salaryPeriod) === 'hour' ? 'hour'
            : 'year';

    let targetPeriod = 'year';
    if (/\b(hour|hourly|hr)\b/.test(questionNorm)) targetPeriod = 'hour';
    else if (/\b(month|monthly)\b/.test(questionNorm)) targetPeriod = 'month';

    let converted = amount;
    if (period === 'year' && targetPeriod === 'hour') converted = amount / 2080;
    else if (period === 'year' && targetPeriod === 'month') converted = amount / 12;
    else if (period === 'month' && targetPeriod === 'hour') converted = amount / 173;
    else if (period === 'month' && targetPeriod === 'year') converted = amount * 12;
    else if (period === 'hour' && targetPeriod === 'year') converted = amount * 2080;
    else if (period === 'hour' && targetPeriod === 'month') converted = amount * 173;
    converted = Math.round(converted * 100) / 100;

    if (field.type === 'number') {
        return String(Math.round(converted));
    }

    const currency = String(profile.salaryCurrency || '').toUpperCase();
    const symbol = CURRENCY_SYMBOLS[currency] || (currency && currency !== 'Other' ? `${currency} ` : '');
    const formatted = converted.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const periodWord = targetPeriod === 'hour' ? 'per hour' : targetPeriod === 'month' ? 'per month' : 'per year';
    return `${symbol}${formatted} ${periodWord}`.trim();
}

function dateAnswer(field, value) {
    if (field.type !== 'date') return value;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return new Date(parsed).toISOString().slice(0, 10);
}

function profileValue(profile, key) {
    if (!profile || typeof profile !== 'object') return null;
    if (key.startsWith('eeo.') && profile.eeoOptIn !== true) return null;
    if (key === 'fullName') {
        const first = String(getProfilePath(profile, 'firstName') || '').trim();
        const last = String(getProfilePath(profile, 'lastName') || '').trim();
        return `${first} ${last}`.trim() || null;
    }
    const value = getProfilePath(profile, key);
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    const text = String(value).trim();
    return text ? text : null;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function optionTextMatchesAnswer(answer, options) {
    const target = normalizeQuestion(answer);
    if (!target || !Array.isArray(options)) return false;
    const normalized = options.map((option) => normalizeQuestion(option));
    if (normalized.some((option) => option === target)) return true;
    const wordRegex = new RegExp(`\\b${escapeRegExp(target)}\\b`, 'i');
    if (normalized.some((option) => option && wordRegex.test(option))) return true;
    if (/^(yes|no)$/.test(target)) {
        const word = new RegExp(`\\b${target}\\b`, 'i');
        if (options.some((option) => word.test(option || ''))) return true;
    }
    return false;
}

function matchCustomQa(questionNorm, customQA) {
    if (!Array.isArray(customQA) || !questionNorm) return null;
    const rows = customQA
        .map((row) => (row && typeof row === 'object' ? {
            question: normalizeQuestion(row.question),
            answer: typeof row.answer === 'string' ? row.answer.trim() : ''
        } : null))
        .filter((row) => row && row.question && row.answer);
    let best = null;
    let bestScore = 0;
    for (const row of rows) {
        if (row.question === questionNorm) return row.answer;
        const shorter = Math.min(row.question.length, questionNorm.length);
        if (shorter >= 8 && (row.question.includes(questionNorm) || questionNorm.includes(row.question))) {
            return row.answer;
        }
        const score = jaccardSimilarity(words(row.question), words(questionNorm));
        if (score > bestScore) {
            bestScore = score;
            best = row;
        }
    }
    if (best && bestScore >= 0.85) return best.answer;
    return null;
}

function resolveFieldAnswer(field, profile, customQaAnswer) {
    const questionNorm = normalizeQuestion(field.question).slice(0, MAX_QUESTION_LENGTH);
    if (!questionNorm) return null;

    if (customQaAnswer) {
        return verifyAnswerForField(field, customQaAnswer);
    }

    const isSingleCheckbox = field.tag === 'checkbox';
    const needsOptionMatch = field.tag === 'select' || field.tag === 'radio' || field.tag === 'checkbox-group';

    for (const matcher of CANONICAL_MATCHERS) {
        if (matcher.guards && matcher.guards.some((guard) => guard.test(questionNorm))) continue;
        if (!matcher.patterns.some((pattern) => pattern.test(questionNorm))) continue;
        if (isSingleCheckbox && matcher.kind !== 'yesno') continue;

        const raw = profileValue(profile, matcher.key);
        if (raw === null || raw === '') continue;

        let candidate;
        if (matcher.kind === 'yesno') {
            candidate = toYesNo(raw);
            if (!candidate) continue;
            if (needsOptionMatch && !optionTextMatchesAnswer(candidate, field.options)) continue;
            return candidate;
        }
        if (matcher.kind === 'salary') {
            candidate = salaryAnswer(field, questionNorm, profile);
        } else if (matcher.kind === 'number') {
            const num = Number(raw);
            candidate = Number.isFinite(num) ? String(num) : null;
        } else if (matcher.kind === 'date') {
            candidate = dateAnswer(field, raw);
        } else {
            candidate = String(raw);
        }
        if (candidate === null || candidate === '') continue;
        if (needsOptionMatch && !optionTextMatchesAnswer(candidate, field.options)) continue;
        return candidate;
    }
    return null;
}

function verifyAnswerForField(field, answer) {
    if (field.tag === 'select' || field.tag === 'radio' || field.tag === 'checkbox-group') {
        return optionTextMatchesAnswer(answer, field.options) ? answer : null;
    }
    return answer;
}

export function resolveFormAnswers(fields, profile) {
    const resolved = [];
    const unresolved = [];
    const list = Array.isArray(fields) ? fields : [];
    for (const field of list) {
        const questionNorm = normalizeQuestion(field && field.question);
        const customQaAnswer = matchCustomQa(questionNorm, profile && profile.customQA);
        const answer = resolveFieldAnswer(field, profile, customQaAnswer);
        if (answer) resolved.push({ id: field.id, answer });
        else unresolved.push(field);
    }
    return { resolved, unresolved, cachedCount: resolved.length };
}
