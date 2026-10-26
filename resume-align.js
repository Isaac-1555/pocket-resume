// resume-align.js
// Deterministic job-description alignment. Pure logic: no chrome.* APIs, no
// network, no randomness. Same inputs always produce the same resume JSON.
// Imported by background.js (module service worker).

const STOPWORDS = new Set(`
a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have having
he her here hers herself him himself his how i if in into is it its itself just me more most my myself no
nor not now of off on once only or other our ours ourselves out over own same she should so some such than
that the their theirs them themselves then there these they this those through to too under until up very
was we were what when where which while who whom why will with would you your yours yourself yourselves
role team teams work working works company companies job jobs position candidate candidates applicant
experience experienced years year day days week weeks month months time strong ability able help helps
including include includes new using use used across within without via etc plus bonus preferred required
requirements qualifications responsibilities benefits opportunity opportunities ideal successful excellent
great good best like well must need needs needed we're you'll you're it's don't
`.trim().split(/\s+/));

const SECTION_ZONES = [
    { zone: 'required', re: /^(requirements?|qualifications?|minimum qualifications?|basic qualifications?|must haves?|what you.?ll need|what we.?re looking for|who you are|skills? (?:required|needed))\b/i },
    { zone: 'preferred', re: /^(preferred|nice to haves?|bonus|plus(?:es)?|desired|additional qualifications?)\b/i },
    { zone: 'duties', re: /^(responsibilities|what you.?ll do|the role|about the role|day to day|duties|your impact)\b/i },
    { zone: 'company', re: /^(benefits|perks|compensation|about (?:us|the company|the team)|equal opportunity|why join)\b/i },
];

const ZONE_WEIGHT = { title: 2, required: 2, preferred: 1, duties: 0.8, company: 0.35, body: 0.75 };

const ACTION_VERBS = `
led directed managed owned built architected engineered developed designed implemented deployed automated
refactored migrated optimized instrumented containerized debugged shipped launched established founded
created drove spearheaded oversaw mentored coordinated chaired mobilized delegated analyzed diagnosed
identified audited benchmarked forecasted quantified evaluated investigated isolated authored drafted
negotiated presented documented streamlined standardized resolved eliminated reduced increased accelerated
cut grew scaled improved delivered supported maintained tested reviewed trained wrote designed integrated
secured modernized restructured consolidated introduced pioneered produced initiated expanded transformed
`.trim().split(/\s+/);

const BANNED_OPENERS = [
    'responsible for', 'helped with', 'helped to', 'worked on', 'worked with', 'assisted in', 'assisted with',
    'duties included', 'tasked with', 'involved in', 'participated in', 'in charge of', 'successfully',
];

const GERUND_TO_PAST = {
    managing: 'Managed', leading: 'Led', building: 'Built', developing: 'Developed', creating: 'Created',
    maintaining: 'Maintained', designing: 'Designed', implementing: 'Implemented', supporting: 'Supported',
    coordinating: 'Coordinated', overseeing: 'Oversaw', analyzing: 'Analyzed', testing: 'Tested',
    deploying: 'Deployed', automating: 'Automated', migrating: 'Migrated', optimizing: 'Optimized',
    mentoring: 'Mentored', training: 'Trained', writing: 'Authored', reviewing: 'Reviewed',
    architecting: 'Architected', engineering: 'Engineered', owning: 'Owned', directing: 'Directed',
    driving: 'Drove', leading_: 'Led', scaling: 'Scaled', delivering: 'Delivered', launching: 'Launched',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function normalizeSpace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeTerm(text) {
    return normalizeSpace(String(text || '').toLowerCase())
        .replace(/[^a-z0-9+#./ -]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function words(text) {
    const normalized = normalizeTerm(text);
    return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function stem(word) {
    if (word.length < 5) return word;
    const rules = ['ments', 'ment', 'ingly', 'edly', 'ing', 'ies', 'ers', 'er', 'ed', 'es', 'ly', 'ity', 's'];
    for (const suffix of rules) {
        if (word.length - suffix.length >= 4 && word.endsWith(suffix)) {
            let base = word.slice(0, -suffix.length);
            if (suffix === 'ies') base += 'y';
            if (base.endsWith('at') && suffix === 'ing') base += 'e';
            if (base.endsWith('iz') && suffix === 'ing') base += 'e';
            return base;
        }
    }
    return word;
}

function numbersIn(text) {
    const found = String(text || '').match(/\d[\d,.]*/g);
    if (!found) return new Set();
    return new Set(found.map((value) => value.replace(/,/g, '').replace(/\.$/, '')));
}

function phrasePresent(haystack, phrase) {
    const needle = normalizeTerm(phrase);
    if (!needle) return false;
    return normalizeTerm(haystack).includes(needle);
}

function uniqueNames(list) {
    const seen = new Set();
    const out = [];
    for (const name of list) {
        const key = normalizeTerm(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

function sentencesOf(line) {
    return normalizeSpace(line)
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function detectZone(headingLine) {
    const cleaned = normalizeSpace(headingLine).replace(/[:•]+$/, '');
    for (const entry of SECTION_ZONES) {
        if (entry.re.test(cleaned)) return entry.zone;
    }
    return null;
}

function looksLikeHeading(line) {
    const cleaned = normalizeSpace(line);
    if (!cleaned || cleaned.length > 48) return false;
    if (!/[a-z]/.test(cleaned)) return true;
    const letters = cleaned.replace(/[^a-zA-Z]/g, '');
    if (!letters) return false;
    const upperRatio = (cleaned.replace(/[^A-Z]/g, '').length || 0) / letters.length;
    return upperRatio > 0.7 && cleaned.split(' ').length <= 6;
}

function cleanJobTitle(raw, fallbackTitle) {
    const candidate = normalizeSpace(raw || fallbackTitle || '');
    if (!candidate) return '';
    return normalizeSpace(
        candidate
            .split(/\s*[|·•]\s*/)[0]
            .split(/\s+[-–—]\s+/)[0]
            .replace(/\s*\((?:remote|hybrid|on-?site)[^)]*\)\s*/i, ' ')
            .replace(/\b(?:hiring|job|vacancy|opening)\b/gi, ' ')
    );
}

function parseJobPosting({ title = '', text = '', structured = null } = {}) {
    const bodyText = String(text || '');
    const pageTitle = normalizeSpace(title);
    const structuredData = structured && typeof structured === 'object' ? structured : {};

    let jobTitle = normalizeSpace(structuredData.title || '');
    if (!jobTitle) {
        const labeled = bodyText.match(/^(?:job title|position|role|title)\s*[:\-]\s*(.{2,90})$/im);
        if (labeled) jobTitle = labeled[1];
    }
    if (!jobTitle) jobTitle = cleanJobTitle(pageTitle, '');
    if (!jobTitle) jobTitle = 'Professional';

    let company = normalizeSpace(structuredData.company || '');
    if (!company) {
        const labeled = bodyText.match(/^(?:company|employer|organization|organisation)\s*[:\-]\s*(.{2,80})$/im);
        if (labeled) company = labeled[1];
    }
    if (!company && pageTitle) {
        const parts = pageTitle.split(/\s*[|·•]\s*/).map((part) => part.trim()).filter(Boolean);
        if (parts.length > 1) company = parts[parts.length - 1].slice(0, 80);
    }

    let location = normalizeSpace(structuredData.location || '');
    if (!location) {
        const remote = bodyText.match(/\b(fully remote|remote|hybrid|on-?site)\b/i);
        const cityState = bodyText.match(/\b([A-Z][a-zA-Z.\-]+(?:\s+[A-Z][a-zA-Z.\-]+)?),\s*([A-Z]{2}|[A-Z][a-z]+)\b/);
        if (remote && cityState) location = `${cityState[1]}, ${cityState[2]} (${remote[1]})`;
        else if (cityState) location = `${cityState[1]}, ${cityState[2]}`;
        else if (remote) location = remote[1];
    }

    const recruiterMatch = bodyText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*[,(]?\s*(?:recruiter|hiring manager|talent)\b/);
    const recruiterEmailMatch = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

    return {
        title: jobTitle,
        company,
        location,
        recruiterName: normalizeSpace(structuredData.recruiterName || (recruiterMatch ? recruiterMatch[1] : '')),
        recruiterEmail: normalizeSpace(structuredData.recruiterEmail || (recruiterEmailMatch ? recruiterEmailMatch[0] : '')),
        text: bodyText,
        structured: structuredData,
    };
}

function buildKeywordModel(jd, lexicon) {
    const terms = new Map();
    const lines = String(jd.text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);

    const addTerm = (name, weight, zone, options = {}) => {
        const key = normalizeTerm(name);
        if (!key) return;
        const existing = terms.get(key);
        if (existing) {
            existing.weight = Math.max(existing.weight, weight);
            if (zone === 'required') existing.required = true;
            if (zone === 'preferred') existing.preferred = true;
            if (options.skill) existing.skill = true;
            return;
        }
        terms.set(key, {
            key,
            name: normalizeSpace(name),
            weight,
            required: zone === 'required',
            preferred: zone === 'preferred',
            skill: !!options.skill,
        });
    };

    if (jd.title) addTerm(jd.title, ZONE_WEIGHT.title, 'title');

    let zone = 'body';
    for (const line of lines) {
        const headingZone = detectZone(line);
        if (headingZone) {
            zone = headingZone;
            continue;
        }
        if (looksLikeHeading(line) && line.length <= 32) continue;

        const zoneWeight = ZONE_WEIGHT[zone] || ZONE_WEIGHT.body;
        const matches = matchSkills(line, lexicon);
        for (const match of matches) {
            addTerm(match.name, zoneWeight * (match.hot ? 1.15 : 1), zone, { skill: true });
        }

        for (const sentence of sentencesOf(line)) {
            const tokens = words(sentence).filter((token) => token.length > 2 && !STOPWORDS.has(token));
            if (!tokens.length) continue;
            const counts = new Map();
            for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
            for (const [token, count] of counts) {
                if (count < 2 && tokens.length > 40) continue;
                if (ACTION_VERBS.includes(token)) continue;
                addTerm(token, zoneWeight * (0.35 + Math.min(count, 3) * 0.08), zone);
            }
        }
    }

    for (const term of terms.values()) {
        const skill = matchesExactSkill(term.name, lexicon);
        if (skill) {
            term.name = skill.name;
            term.aliases = skill.aliases || [];
        }
    }

    const all = [...terms.values()].sort((a, b) => b.weight - a.weight);
    return {
        terms: all,
        required: all.filter((term) => term.required),
        preferred: all.filter((term) => term.preferred && !term.required),
        other: all.filter((term) => !term.required && !term.preferred),
    };
}

function matchesExactSkill(name, lexicon) {
    if (!lexicon || !Array.isArray(lexicon.terms)) return null;
    const key = normalizeTerm(name);
    if (!key) return null;
    const index = getLexiconIndex(lexicon);
    return index.byTerm.get(key) || null;
}

let cachedLexiconRef = null;
let cachedLexiconIndex = null;

function getLexiconIndex(lexicon) {
    if (cachedLexiconRef === lexicon && cachedLexiconIndex) return cachedLexiconIndex;
    const byTerm = new Map();
    for (const term of lexicon?.terms || []) {
        const name = normalizeTerm(term.name);
        if (name && !byTerm.has(name)) byTerm.set(name, term);
        for (const alias of term.aliases || []) {
            const key = normalizeTerm(alias);
            if (key && !byTerm.has(key)) byTerm.set(key, term);
        }
    }
    cachedLexiconRef = lexicon;
    cachedLexiconIndex = { byTerm };
    return cachedLexiconIndex;
}

function matchSkills(text, lexicon) {
    const index = getLexiconIndex(lexicon || { terms: [] });
    const tokens = words(text);
    if (!tokens.length) return [];
    const found = new Map();
    for (let size = 1; size <= 4; size++) {
        for (let start = 0; start + size <= tokens.length; start++) {
            const key = tokens.slice(start, start + size).join(' ');
            const term = index.byTerm.get(key);
            if (!term) continue;
            if (!found.has(term.name)) found.set(term.name, { name: term.name, hot: !!term.hot });
        }
    }
    return [...found.values()];
}

function termPresent(term, profileIndex) {
    if (phrasePresent(profileIndex.text, term.name)) return true;
    return (term.aliases || []).some((alias) => phrasePresent(profileIndex.text, alias));
}

function buildProfileIndex(profile) {
    const chunks = [];
    const walk = (value) => {
        if (typeof value === 'string') chunks.push(value);
        else if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(profile);
    const text = chunks.join('\n');
    return { text, numbers: numbersIn(text) };
}

function applyJobFields(resume, jd) {
    const fields = [];
    if (jd.title) {
        resume.subtitle = jd.title;
        resume.position = jd.title;
        fields.push('position');
    }
    if (jd.location) {
        resume.location = jd.location;
        fields.push('location');
        if (typeof resume.contact === 'string' && resume.contact) {
            const segments = resume.contact.split('|').map((part) => part.trim()).filter(Boolean);
            const preserved = segments.filter((part) => !/^[A-Z][a-zA-Z.\- ]+(?:,\s*[A-Z]{2})?$/.test(part) && !/remote|hybrid|on-?site/i.test(part));
            resume.contact = [jd.location, ...preserved].join(' | ');
        }
    }
    if (jd.company) {
        resume.company = jd.company;
        fields.push('company');
    }
    if (jd.recruiterName) {
        resume.recruiterName = jd.recruiterName;
        fields.push('recruiterName');
    }
    if (jd.recruiterEmail) {
        resume.recruiterEmail = jd.recruiterEmail;
        fields.push('recruiterEmail');
    }
    return fields;
}

function rankSkill(skill, model, fallbackIndex) {
    const key = normalizeTerm(skill);
    const hit = model.terms.find((term) => term.key === key);
    return { weight: hit ? hit.weight : 0, index: fallbackIndex };
}

function alignSkills(resume, profileIndex, model) {
    const original = Array.isArray(resume.skills) ? resume.skills.filter((skill) => typeof skill === 'string' && skill.trim()) : [];
    const seen = new Set(original.map((skill) => normalizeTerm(skill)));
    const added = [];

    for (const term of model.required) {
        if (added.length >= 8) break;
        if (!term.skill) continue;
        const key = normalizeTerm(term.name);
        if (!key || key.length < 2 || seen.has(key)) continue;
        if (!termPresent(term, profileIndex)) continue;
        seen.add(key);
        added.push(term.name);
    }

    const merged = [...original, ...added];
    const ordered = merged
        .map((skill, index) => ({ skill, ...rankSkill(skill, model, index) }))
        .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
        .map((entry) => entry.skill);

    resume.skills = ordered;
    return added;
}

function fixBulletOpener(text) {
    let bullet = normalizeSpace(text);
    if (!bullet) return bullet;
    const lower = bullet.toLowerCase();
    for (const opener of BANNED_OPENERS) {
        if (!lower.startsWith(opener)) continue;
        let rest = bullet.slice(opener.length).replace(/^[\s:,-]+/, '');
        const firstWord = rest.split(' ')[0] || '';
        const past = GERUND_TO_PAST[firstWord.toLowerCase()];
        if (past) rest = `${past}${rest.slice(firstWord.length)}`;
        bullet = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
        break;
    }
    return bullet;
}

function trimBullet(text, limit) {
    const bullet = normalizeSpace(text);
    if (bullet.length <= limit) return { text: bullet, trimmed: false };
    const keptNumbers = numbersIn(bullet);
    const boundaries = [', by ', ', which ', ', reducing ', ', cutting ', ', improving ', ', increasing ', '; ', ', '];
    let best = '';
    for (const boundary of boundaries) {
        let index = bullet.indexOf(boundary, Math.floor(limit * 0.55));
        while (index !== -1 && index < limit) {
            const candidate = bullet.slice(0, index).trim().replace(/[,;]$/, '');
            const droppedNumbers = [...keptNumbers].filter((value) => !numbersIn(candidate).has(value));
            if (candidate.length >= 50 && droppedNumbers.length === 0 && candidate.split(' ').length > 5) {
                if (candidate.length > best.length) best = candidate;
            }
            index = bullet.indexOf(boundary, index + 1);
        }
    }
    if (best) return { text: /[.!?]$/.test(best) ? best : `${best}.`, trimmed: true };
    const cut = bullet.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return { text: `${cut.slice(0, lastSpace > 40 ? lastSpace : limit).replace(/[,;:\s]+$/, '')}`, trimmed: true };
}

function scoreBullet(bullet, model, profileIndex) {
    const text = normalizeSpace(bullet);
    if (!text) return 0;
    let hits = 0;
    for (const term of model.required) {
        if (phrasePresent(text, term.name)) hits += term.weight;
    }
    for (const term of model.preferred) {
        if (phrasePresent(text, term.name)) hits += term.weight * 0.6;
    }
    const metric = numbersIn(text).size ? 1.6 : 0;
    const firstWord = (text.split(' ')[0] || '').toLowerCase();
    const verb = ACTION_VERBS.includes(firstWord) ? 1 : 0;
    const lengthScore = text.length <= 120 ? 0.5 : (text.length > 170 ? -1 : 0);
    return hits * 1.2 + metric + verb + lengthScore;
}

function alignEntries(entries, model, profileIndex, { limit, maxBullets }) {
    if (!Array.isArray(entries)) return { entries, dropped: 0, trimmed: 0, reordered: 0 };
    let dropped = 0;
    let trimmed = 0;
    let reordered = 0;
    const output = entries.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        const points = Array.isArray(entry.points) ? entry.points.filter((point) => typeof point === 'string' && point.trim()) : [];
        if (!points.length) return entry;

        const scored = points.map((point, index) => ({ point, index, score: scoreBullet(point, model, profileIndex) }));
        const strongestFirst = [...scored].sort((a, b) => (b.score - a.score) || (a.index - b.index));
        const kept = maxBullets && strongestFirst.length > maxBullets ? strongestFirst.slice(0, maxBullets) : strongestFirst;
        dropped += points.length - kept.length;
        if (kept.some((item, index) => item.index !== index)) reordered++;

        const rebuilt = kept.map((item) => {
            const fixed = fixBulletOpener(item.point);
            const { text, trimmed: wasTrimmed } = trimBullet(fixed, limit);
            if (wasTrimmed) trimmed++;
            return text;
        });

        return { ...entry, points: rebuilt.filter(Boolean) };
    });
    return { entries: output, dropped, trimmed, reordered };
}

function buildSummary(resume, model, profileIndex, jd) {
    if (typeof resume.summary === 'string' && resume.summary.trim()) return resume.summary;
    const matched = model.required.filter((term) => termPresent(term, profileIndex)).slice(0, 3).map((term) => term.name);
    if (!matched.length) return '';
    const role = jd.title || resume.position || 'Professional';
    return `${role} with hands-on delivery across ${matched.join(', ')}. Focused on shipping measurable outcomes and working closely with cross-functional teams.`;
}

function verifyAlignedResume(source, aligned, styleConfig) {
    const allowedNumbers = numbersIn(JSON.stringify(source || {}));
    const sourceText = JSON.stringify(source || {});
    const issues = [];
    const revert = (label) => issues.push(label);

    const checkText = (text, label) => {
        for (const value of numbersIn(text)) {
            if (!allowedNumbers.has(value)) {
                revert(label);
                return false;
            }
        }
        return true;
    };

    const sections = ['experience', 'projects', 'teaching', 'service'];
    for (const section of sections) {
        if (!Array.isArray(aligned[section])) continue;
        const sourceEntries = Array.isArray(source[section]) ? source[section] : [];
        aligned[section].forEach((entry, entryIndex) => {
            if (!entry || !Array.isArray(entry.points)) return;
            const badPoint = entry.points.find((point) => !checkText(point, `${section}[${entryIndex}]`));
            if (badPoint) entry.points = sourceEntries[entryIndex]?.points || entry.points;
        });
    }

    if (Array.isArray(aligned.skills)) {
        aligned.skills = aligned.skills.filter((skill) => {
            const present = phrasePresent(sourceText, skill);
            if (!present) issues.push(`skill:${skill}`);
            return present;
        });
    }

    if (typeof aligned.summary === 'string' && aligned.summary) checkText(aligned.summary, 'summary');
    if (typeof aligned.subtitle === 'string') checkText(aligned.subtitle, 'subtitle');
    if (typeof aligned.position === 'string') checkText(aligned.position, 'position');
    if (typeof aligned.location === 'string') checkText(aligned.location, 'location');

    if (issues.length) {
        aligned.alignmentWarnings = [...new Set(issues)].slice(0, 8);
    }
    return { resume: aligned, issues: aligned.alignmentWarnings || [] };
}

function alignResumeJson(profile, jd, options = {}) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const resume = JSON.parse(JSON.stringify(source));
    const lexicon = options.lexicon || { terms: [] };
    const styleConfig = options.styleConfig || { layout: 'pocketresume', promptStyle: 'professional' };
    const maxBullets = styleConfig.promptStyle === 'faang' ? 3 : (styleConfig.promptStyle === 'academic-cv' ? 5 : 3);
    const limit = styleConfig.layout === 'academic-cv' ? 170 : (styleConfig.layout === 'deedy' ? 130 : 120);

    const model = buildKeywordModel(jd, lexicon);
    const profileIndex = buildProfileIndex(source);
    const fieldsApplied = applyJobFields(resume, jd);
    const skillsAdded = alignSkills(resume, profileIndex, model);

    const experienceResult = alignEntries(resume.experience, model, profileIndex, { limit, maxBullets });
    resume.experience = experienceResult.entries;
    const projectResult = alignEntries(resume.projects, model, profileIndex, { limit, maxBullets: Math.max(2, maxBullets - 1) });
    resume.projects = projectResult.entries;

    if (options.generateSummary) {
        const summary = buildSummary(resume, model, profileIndex, jd);
        if (summary) resume.summary = summary;
    }

    const verified = verifyAlignedResume(source, resume, styleConfig);

    const matched = uniqueNames(model.required
        .filter((term) => termPresent(term, profileIndex))
        .map((term) => term.name))
        .slice(0, 12);
    const missingRequired = uniqueNames(model.required
        .filter((term) => !termPresent(term, profileIndex) && (term.skill || term.weight >= 1.4))
        .map((term) => term.name))
        .slice(0, 10);
    const missingPreferred = uniqueNames(model.preferred
        .filter((term) => !termPresent(term, profileIndex))
        .map((term) => term.name))
        .slice(0, 6);

    const scoreTerms = model.required.filter((term) => term.skill || term.weight >= 1.4);
    const totalWeight = scoreTerms.reduce((sum, term) => sum + term.weight, 0);
    const matchedWeight = scoreTerms.reduce((sum, term) => (
        termPresent(term, profileIndex) ? sum + term.weight : sum
    ), 0);
    const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;

    return {
        resume: verified.resume,
        report: {
            score,
            matched,
            missingRequired,
            missingPreferred,
            skillsAdded,
            bulletsDropped: experienceResult.dropped + projectResult.dropped,
            bulletsTrimmed: experienceResult.trimmed + projectResult.trimmed,
            bulletsReordered: experienceResult.reordered + projectResult.reordered,
            fieldsApplied,
            jdTitle: jd.title,
            company: jd.company,
            location: jd.location,
            requiredCount: model.required.length,
            warnings: verified.issues,
        },
    };
}

function looksLikeDateRange(line) {
    return /(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}\b|\b\d{4}\b)\s*[-–—]\s*(?:present|current|now|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}\b|\b\d{4}\b)/i.test(line);
}

function splitTitleCompany(line) {
    const cleaned = normalizeSpace(line).replace(/^[-•*–]\s*/, '');
    const atMatch = cleaned.match(/^(.{2,60}?)\s+(?:at|@)\s+(.{2,60})$/i);
    if (atMatch) return { title: atMatch[1], company: atMatch[2] };
    if (cleaned.includes('|')) {
        const [title, company] = cleaned.split('|').map((part) => part.trim());
        return { title, company };
    }
    if (cleaned.includes(' - ')) {
        const [title, company] = cleaned.split(' - ').map((part) => part.trim());
        return { title, company };
    }
    const commaParts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
    if (commaParts.length >= 2) return { title: commaParts[0], company: commaParts.slice(1).join(', ') };
    return { title: cleaned, company: '' };
}

function isBulletLine(line) {
    return /^[-•*–—·]\s+/.test(line);
}

function parseExperienceSection(lines) {
    const entries = [];
    let current = null;
    let pendingHeader = null;

    const pushCurrent = () => {
        if (!current) return;
        if (!current.points.length && pendingHeader) current.points.push(pendingHeader);
        if (current.title || current.company || current.points.length) entries.push(current);
        current = null;
    };

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const line = normalizeSpace(rawLine);
        if (!line) continue;
        if (looksLikeDateRange(line)) {
            const header = pendingHeader || '';
            const { title, company } = splitTitleCompany(header);
            pushCurrent();
            current = { title, company, location: '', period: line, points: [] };
            pendingHeader = null;
            continue;
        }
        if (isBulletLine(line)) {
            const text = line.replace(/^[-•*–—·]\s+/, '');
            if (!current) current = { title: '', company: '', location: '', period: '', points: [] };
            current.points.push(text);
            continue;
        }
        if (current && !current.points.length && !current.title && !current.company) {
            const { title, company } = splitTitleCompany(line);
            current.title = title;
            current.company = company;
            continue;
        }
        if (current && current.points.length) {
            const nextLine = normalizeSpace(lines[index + 1] || '');
            if (looksLikeDateRange(nextLine)) {
                pendingHeader = line;
                continue;
            }
            const lastIndex = current.points.length - 1;
            current.points[lastIndex] = `${current.points[lastIndex]} ${line}`.trim();
            continue;
        }
        pendingHeader = line;
    }
    pushCurrent();
    return entries;
}

function parseResumeText(rawText) {
    const text = String(rawText || '').replace(/\r/g, '');
    const lines = text.split('\n').map((line) => line.replace(/\s+$/, '')).filter((line) => line.trim());
    const warnings = [];

    const header = { name: '', subtitle: '', contactParts: [] };
    const sections = { summary: [], skills: [], experience: [], projects: [], education: [], certifications: [], honors: [], publications: [] };
    let zone = 'header';

    const sectionFor = (line) => {
        const cleaned = normalizeSpace(line).replace(/[:•]+$/, '').toUpperCase();
        if (/^(SUMMARY|PROFILE|OBJECTIVE|ABOUT)/.test(cleaned)) return 'summary';
        if (/^(SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|TECHNOLOGIES)/.test(cleaned)) return 'skills';
        if (/^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT)/.test(cleaned)) return 'experience';
        if (/^(PROJECTS|SELECTED PROJECTS|PERSONAL PROJECTS)/.test(cleaned)) return 'projects';
        if (/^(EDUCATION|ACADEMIC)/.test(cleaned)) return 'education';
        if (/^(CERTIFICATIONS|CERTIFICATES|LICENSES)/.test(cleaned)) return 'certifications';
        if (/^(AWARDS|HONORS|ACHIEVEMENTS)/.test(cleaned)) return 'honors';
        if (/^(PUBLICATIONS|PAPERS)/.test(cleaned)) return 'publications';
        return null;
    };

    for (const line of lines) {
        const section = sectionFor(line);
        if (section) {
            zone = section;
            continue;
        }
        if (zone === 'header') {
            if (!header.name && !/@|\d{3}/.test(line) && line.length <= 60) header.name = line;
            else if (!header.subtitle && !/@|\d{3}/.test(line) && line.length <= 70 && !looksLikeDateRange(line)) header.subtitle = line;
            header.contactParts.push(line);
            continue;
        }
        sections[zone].push(line);
    }

    const headerText = header.contactParts.join(' | ');
    const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
    const phone = (text.match(/(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) || [''])[0];
    const urls = [...new Set((text.match(/https?:\/\/[^\s|)]+/gi) || []))].slice(0, 5);
    const locationMatch = headerText.match(/\b([A-Z][a-zA-Z.\-]+(?:\s+[A-Z][a-zA-Z.\-]+)?),\s*([A-Z]{2}|[A-Z][a-z]+)\b/);
    const location = locationMatch ? `${locationMatch[1]}, ${locationMatch[2]}` : '';
    const contact = [phone, email, ...urls].filter(Boolean).join(' | ');

    const skills = sections.skills
        .flatMap((line) => line.replace(/^[-•*–—·]\s+/, '').split(/[,|;/]+/))
        .map((skill) => normalizeSpace(skill))
        .filter((skill) => skill && skill.length <= 40 && skill.split(' ').length <= 5)
        .slice(0, 60);

    const experience = parseExperienceSection(sections.experience);
    const projects = parseExperienceSection(sections.projects).map((entry) => ({ ...entry, platform: '', description: '', url: '', stars: '', venue: '' }));

    const education = [];
    for (const line of sections.education) {
        if (looksLikeDateRange(line) || !/[A-Za-z]/.test(line)) continue;
        if (/\b(bachelor|master|b\.?s\.?|m\.?s\.?|ph\.?d|mba|associate|diploma|degree)\b/i.test(line)) {
            education.push({ degree: normalizeSpace(line), school: '', year: '', location: '', details: [] });
        } else if (education.length) {
            const last = education[education.length - 1];
            if (!last.school) last.school = normalizeSpace(line);
            else last.details.push(normalizeSpace(line));
        }
    }

    if (!email && !phone) warnings.push('No email or phone found.');
    if (!experience.length) warnings.push('No experience entries detected.');
    if (!skills.length) warnings.push('No skills section detected.');
    if (!header.name) warnings.push('Name not detected.');

    const profile = {
        name: header.name,
        subtitle: header.subtitle,
        position: header.subtitle,
        location,
        company: '',
        recruiterName: '',
        recruiterEmail: '',
        contact,
        summary: normalizeSpace(sections.summary.join(' ')).slice(0, 700),
        skills,
        skillGroups: [],
        links: urls.map((url) => ({ label: '', text: url, url })),
        experience,
        projects,
        openSourceProjects: [],
        education,
        certifications: sections.certifications.map((line) => normalizeSpace(line.replace(/^[-•*–—·]\s+/, ''))).filter(Boolean),
        honors: [],
        publicationsSummary: '',
        publications: [],
        researchInterests: [],
        teaching: [],
        service: [],
        parseQuality: 'low',
        parseWarnings: warnings,
    };

    return profile;
}

function buildCoverLetterFromTemplate(template, context = {}) {
    const greeting = normalizeSpace(template?.greeting || 'Dear Hiring Manager,');
    const signOff = normalizeSpace(template?.signOff || 'Sincerely,');
    const recipient = normalizeSpace(context.recipientName || '');
    const company = normalizeSpace(context.company || '');
    const role = normalizeSpace(context.role || '');

    const fill = (value) => normalizeSpace(String(value || '')
        .replace(/\{\{\s*company\s*\}\}/gi, company)
        .replace(/\{\{\s*role\s*\}\}/gi, role)
        .replace(/\{\{\s*recipient\s*\}\}/gi, recipient));

    const filledGreeting = greeting.includes('{{recipient}}')
        ? (recipient ? fill(greeting) : greeting.replace(/\{\{\s*recipient\s*\}\}/gi, 'Hiring Manager'))
        : (recipient ? `Dear ${recipient},` : greeting);

    const paragraphs = String(template?.body || '')
        .replace(/\r/g, '')
        .split(/\n\s*\n/)
        .map((paragraph) => fill(paragraph))
        .filter(Boolean);

    if (!paragraphs.length) return null;

    const opening = paragraphs[0];
    const closing = paragraphs.length > 2 ? paragraphs[paragraphs.length - 1] : '';
    const middle = paragraphs.length > 2 ? paragraphs.slice(1, -1) : paragraphs.slice(1);

    const now = context.date instanceof Date ? context.date : new Date();
    const date = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

    return {
        applicant_name: context.applicantName || '',
        applicant_contact: context.applicantContact || '',
        date,
        recipient_name: recipient || '',
        recipient_title: '',
        company_name: company,
        company_address: '',
        greeting: filledGreeting,
        opening_paragraph: opening,
        body_paragraphs: middle,
        closing_paragraph: closing,
        sign_off: signOff,
    };
}

export {
    STOPWORDS,
    ACTION_VERBS,
    BANNED_OPENERS,
    normalizeTerm,
    normalizeSpace,
    numbersIn,
    stem,
    parseJobPosting,
    buildKeywordModel,
    buildProfileIndex,
    alignResumeJson,
    verifyAlignedResume,
    parseResumeText,
    buildCoverLetterFromTemplate,
    fixBulletOpener,
    trimBullet,
};
