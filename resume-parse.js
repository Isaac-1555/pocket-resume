// resume-parse.js
// Deterministic resume text -> structured profile. Pure: no chrome.* APIs, no
// network, no randomness. Imported by background.js and options.js.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const URL_RE = /((?:https?:\/\/|www\.)[^\s|,()<>]+|(?:linkedin|github|gitlab|bitbucket)\.com\/[^\s|,()<>]+)/gi;
const LOCATION_RE = /^([A-Z][a-zA-Z.'\-]+(?:\s+[A-Z][a-zA-Z.'\-]+){0,2}),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/;
const DATE_RE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*,?\s*\d{4}|\d{1,2}\/\d{4}|\d{4})\s*(?:[-–—]|to|until)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*,?\s*\d{4}|\d{1,2}\/\d{4}|\d{4}|present|current|now|ongoing)/i;
const SINGLE_DATE_RE = /\b(19|20)\d{2}\b/;

const SECTION_ALIASES = [
    ['summary', /^(summary|profile|objective|about( me)?|professional summary|career summary)$/i],
    ['skills', /^(skills|technical skills|core competencies|technologies|tech stack|tools( and technologies)?|expertise)$/i],
    ['experience', /^(experience|work experience|professional experience|employment( history)?|work history|relevant experience)$/i],
    ['projects', /^(projects|selected projects|personal projects|portfolio|side projects|open source)$/i],
    ['education', /^(education|academic( background)?|education( and| &) training)$/i],
    ['certifications', /^(certifications?|certificates?|licenses?( and certifications)?|credentials)$/i],
    ['honors', /^(awards?|honors?|achievements?|awards( and| &) honors?|recognitions?)$/i],
    ['publications', /^(publications?|papers?|research( publications)?|selected publications)$/i],
    ['researchInterests', /^(research interests?|research areas?|areas of interest)$/i],
    ['teaching', /^(teaching( experience)?|courses taught|instruction)$/i],
    ['service', /^(service|community service|volunteer( experience)?|leadership|professional service)$/i],
];

const COMPANY_SUFFIX_RE = /\b(inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|group|holdings|technologies|technology|tech|labs|lab|systems|solutions|software|studios?|media|bank|capital|partners|consulting|university|college|institute|foundation|agency|digital|ventures|health|healthcare|finance|financial|insurance|motors|airlines|networks|services)\b\.?$/i;

const DEGREE_RE = /\b(bachelor|master|b\.?\s?s\.?|m\.?\s?s\.?|b\.?\s?a\.?|m\.?\s?a\.?|ph\.?\s?d|mba|associate|doctorate|diploma|certificate|degree|hnd|beng|meng|bsc|msc)\b/i;

const BULLET_RE = /^\s*(?:[-–—*•·▪◦‣⁃o]|\d{1,2}[.)])\s+/;

const MONTHS = {
    jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
    jul: 'July', aug: 'August', sep: 'September', sept: 'September', oct: 'October',
    nov: 'November', dec: 'December',
};

function normalizeSpace(text) {
    return String(text == null ? '' : text).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanValue(value) {
    const text = normalizeSpace(value);
    if (!text) return '';
    if (/^(n\/?a|none|unknown|not provided|-+|—+)$/i.test(text)) return '';
    return text;
}

function toStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => cleanValue(typeof item === 'string' ? item : item?.name || '')).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(/[,;|\n]/).map(cleanValue).filter(Boolean);
    }
    return [];
}

function isBulletLine(line) {
    return BULLET_RE.test(line);
}

function stripBullet(line) {
    return normalizeSpace(String(line || '').replace(BULLET_RE, ''));
}

function isDateRange(line) {
    return DATE_RE.test(line);
}

function normalizePeriod(line) {
    const text = normalizeSpace(line);
    const match = text.match(DATE_RE);
    if (match) {
        return `${normalizeSpace(match[1])} – ${normalizeSpace(match[2])}`;
    }
    return text;
}

function looksLikeSection(line) {
    const cleaned = normalizeSpace(line).replace(/[:•]+$/, '').trim();
    if (!cleaned || cleaned.length > 52) return null;
    if (isBulletLine(cleaned)) return null;
    if (DATE_RE.test(cleaned)) return null;
    for (const [key, re] of SECTION_ALIASES) {
        if (re.test(cleaned)) return key;
    }
    return null;
}

function splitInlineSection(line) {
    const match = normalizeSpace(line).match(/^([A-Za-z][A-Za-z &/]{2,40}):\s*(.+)$/);
    if (!match) return null;
    const key = looksLikeSection(match[1]);
    if (!key) return null;
    return { key, content: match[2] };
}

function hasContactToken(line) {
    return EMAIL_RE.test(line) || PHONE_RE.test(line) || /(?:https?:\/\/|www\.|linkedin\.com|github\.com)/i.test(line);
}

function normalizeUrl(raw) {
    const text = normalizeSpace(raw).replace(/[).,;]+$/, '');
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    return `https://${text}`;
}

function linkLabel(url) {
    const lower = url.toLowerCase();
    if (lower.includes('linkedin.com')) return 'LinkedIn';
    if (lower.includes('github.com')) return 'GitHub';
    if (lower.includes('gitlab.com')) return 'GitLab';
    if (lower.includes('bitbucket.com')) return 'Bitbucket';
    return 'Portfolio';
}

function extractLinks(text) {
    const found = String(text || '').match(URL_RE) || [];
    const seen = new Set();
    const links = [];
    for (const raw of found) {
        const url = normalizeUrl(raw);
        if (!url) continue;
        const key = url.toLowerCase().replace(/\/+$/, '');
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ label: linkLabel(url), text: url.replace(/^https?:\/\//i, '').replace(/\/+$/, ''), url });
    }
    return links.slice(0, 6);
}

function extractLocation(text) {
    const lines = String(text || '').split('\n');
    for (const line of lines) {
        const cleaned = normalizeSpace(line).replace(/^[|•\-–—\s]+|[|•\-–—\s]+$/g, '');
        if (!cleaned) continue;
        if (hasContactToken(cleaned)) {
            const parts = cleaned.split(/[|•·]/).map(normalizeSpace).filter(Boolean);
            for (const part of parts) {
                if (LOCATION_RE.test(part)) return part;
            }
            continue;
        }
        if (cleaned.length > 70) continue;
        if (/^(remote|hybrid|on-?site)$/i.test(cleaned)) return cleaned;
        if (LOCATION_RE.test(cleaned)) return cleaned;
    }
    return '';
}

function extractContactParts(text) {
    const email = (String(text || '').match(EMAIL_RE) || [''])[0];
    const phoneMatch = String(text || '').match(PHONE_RE);
    const phone = phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 7 ? normalizeSpace(phoneMatch[0]) : '';
    const links = extractLinks(text);
    const location = extractLocation(text);
    return { email: cleanValue(email), phone: cleanValue(phone), location, links };
}

function buildContactString(parts = {}) {
    const values = [];
    if (parts.phone) values.push(parts.phone);
    if (parts.email) values.push(parts.email);
    if (parts.location) values.push(parts.location);
    for (const link of parts.links || []) {
        if (link?.text) values.push(link.text);
    }
    const seen = new Set();
    return values
        .map(normalizeSpace)
        .filter((value) => {
            if (!value) return false;
            const key = value.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(' | ');
}

function splitTitleCompany(line) {
    const cleaned = stripBullet(normalizeSpace(line)).replace(/\s*\((?:remote|hybrid|on-?site)\)\s*$/i, '');
    if (!cleaned) return { title: '', company: '', location: '' };

    let location = '';
    const locationMatch = cleaned.match(/[,(]\s*([A-Z][a-zA-Z.'\- ]+,\s*[A-Z]{2})\s*\)?$/);
    let working = cleaned;
    if (locationMatch) {
        location = normalizeSpace(locationMatch[1]);
        working = normalizeSpace(cleaned.slice(0, locationMatch.index));
    }

    const separators = [/\s+(?:at|@)\s+/i, /\s+[|—–]\s+/, /\s+-\s+/, /\s*,\s*/];
    for (const separator of separators) {
        const parts = working.split(separator).map(normalizeSpace).filter(Boolean);
        if (parts.length < 2) continue;
        if (parts.length > 2) {
            const head = parts[0];
            const tail = parts.slice(1).join(', ');
            return finishTitleCompany(head, tail, location);
        }
        return finishTitleCompany(parts[0], parts[1], location);
    }
    return { title: working, company: '', location };
}

function finishTitleCompany(left, right, location) {
    const leftIsCompany = COMPANY_SUFFIX_RE.test(left);
    const rightIsCompany = COMPANY_SUFFIX_RE.test(right);
    if (leftIsCompany && !rightIsCompany) return { title: right, company: left, location };
    if (rightIsCompany && !leftIsCompany) return { title: left, company: right, location };
    return { title: left, company: right, location };
}

function looksLikeEntryHeader(line, nextLine) {
    const cleaned = normalizeSpace(line);
    if (!cleaned || isBulletLine(cleaned)) return false;
    if (cleaned.length > 110) return false;
    if (/[.!?]$/.test(cleaned) && cleaned.length > 40) return false;
    if (isDateRange(cleaned)) return false;
    if (looksLikeSection(cleaned)) return false;
    if (hasContactToken(cleaned)) return false;
    if (isDateRange(nextLine || '')) return true;
    return /(?:\s+(?:at|@)\s+|\s+[|—–]\s+|\s+-\s+)/i.test(cleaned) || /\b(?:inc|llc|ltd|corp|company|group|labs|technologies|solutions|university|college)\b/i.test(cleaned);
}

function parseEntryBlocks(lines) {
    const entries = [];
    let current = null;
    let pendingHeader = '';

    const finalize = () => {
        if (!current) return;
        if (!current.points.length && pendingHeader && !current.title && !current.company) {
            const parts = splitTitleCompany(pendingHeader);
            current.title = parts.title;
            current.company = parts.company;
            if (parts.location) current.location = parts.location;
        }
        if (current.title || current.company || current.points.length) {
            entries.push(current);
        }
        current = null;
        pendingHeader = '';
    };

    const startEntry = (headerLine, period) => {
        const parts = splitTitleCompany(headerLine);
        current = {
            title: parts.title,
            company: parts.company,
            location: parts.location || '',
            period: period || '',
            points: [],
        };
    };

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const line = normalizeSpace(rawLine);
        if (!line) continue;
        const nextLine = normalizeSpace(lines[index + 1] || '');

        if (isDateRange(line)) {
            const period = normalizePeriod(line);
            const headerPart = normalizeSpace(line.replace(DATE_RE, ''))
                .replace(/^[\s|—–,;·/]+|[\s|—–,;·/]+$/g, '');
            if (headerPart && /[a-z]/i.test(headerPart) && !LOCATION_RE.test(headerPart)) {
                if (current && (current.title || current.company || current.points.length)) finalize();
                startEntry(headerPart, period);
                pendingHeader = '';
                continue;
            }
            if (current) {
                if (!current.period) {
                    current.period = period;
                } else if (current.points.length) {
                    finalize();
                    startEntry(pendingHeader, period);
                } else {
                    current.period = period;
                }
            } else {
                startEntry(pendingHeader, period);
            }
            pendingHeader = '';
            continue;
        }

        if (isBulletLine(line)) {
            const text = stripBullet(line);
            if (!text) continue;
            if (!current) {
                current = { title: '', company: '', location: '', period: '', points: [] };
            }
            current.points.push(text);
            continue;
        }

        if (current && !current.points.length && !current.title && !current.company) {
            const parts = splitTitleCompany(line);
            current.title = parts.title;
            current.company = parts.company;
            if (parts.location) current.location = parts.location;
            continue;
        }

        if (current && current.points.length) {
            if (looksLikeEntryHeader(line, nextLine)) {
                finalize();
                startEntry(line, '');
                continue;
            }
            const lastIndex = current.points.length - 1;
            current.points[lastIndex] = normalizeSpace(`${current.points[lastIndex]} ${line}`);
            continue;
        }

        if (current && !current.title && !current.company && pendingHeader) {
            const parts = splitTitleCompany(line);
            current.title = parts.title;
            current.company = parts.company;
            if (parts.location) current.location = parts.location;
            continue;
        }

        if (current && (current.title || current.company)) {
            if (looksLikeEntryHeader(line, nextLine)) {
                finalize();
                startEntry(line, '');
            } else {
                pendingHeader = line;
            }
            continue;
        }

        pendingHeader = line;
    }

    finalize();
    return entries;
}

function parseSkills(lines) {
    const skills = [];
    const groups = [];
    const pushSkill = (value) => {
        const skill = normalizeSpace(value).replace(/^[•·*\-–—\s]+/, '').replace(/[.;]+$/, '');
        if (!skill || skill.length > 48) return;
        if (skill.split(/\s+/).length > 6) return;
        if (!/[A-Za-z0-9]/.test(skill)) return;
        if (skills.some((existing) => existing.toLowerCase() === skill.toLowerCase())) return;
        skills.push(skill);
    };

    for (const rawLine of lines) {
        const line = stripBullet(rawLine);
        if (!line) continue;
        const groupMatch = line.match(/^([A-Za-z][A-Za-z &/+.-]{1,40}):\s*(.+)$/);
        if (groupMatch) {
            const label = normalizeSpace(groupMatch[1]);
            const items = groupMatch[2].split(/[,;|•·]/).map(normalizeSpace).filter(Boolean);
            items.forEach(pushSkill);
            if (items.length) groups.push({ label, items });
            continue;
        }
        line.split(/[,;|•·]/).map(normalizeSpace).filter(Boolean).forEach(pushSkill);
    }

    return { skills: skills.slice(0, 80), skillGroups: groups.slice(0, 8) };
}

function parseEducation(lines) {
    const education = [];
    let current = null;

    const finalize = () => {
        if (current && (current.degree || current.school)) education.push(current);
        current = null;
    };

    for (const rawLine of lines) {
        const line = stripBullet(rawLine);
        if (!line) continue;
        if (isDateRange(line) && current) {
            const match = line.match(DATE_RE);
            if (match) current.year = normalizeSpace(match[2]).toLowerCase().includes('present') ? 'Present' : normalizeSpace(match[2]);
            continue;
        }
        const yearMatch = line.match(SINGLE_DATE_RE);
        if (DEGREE_RE.test(line)) {
            finalize();
            let segments = line.split(/\s*[|—–]\s*/).map(normalizeSpace).filter(Boolean);
            if (segments.length === 1) segments = segments[0].split(/\s*,\s*/).map(normalizeSpace).filter(Boolean);
            const degreeParts = [];
            let school = '';
            let location = '';
            segments.forEach((segment) => {
                if (/(university|college|institute|school|academy|polytechnic)/i.test(segment)) {
                    if (!school) school = segment;
                    else degreeParts.push(segment);
                    return;
                }
                if (/^(19|20)\d{2}$/.test(segment) || /^(present|current)$/i.test(segment)) return;
                if (LOCATION_RE.test(segment) && !DEGREE_RE.test(segment) && degreeParts.length) {
                    if (!location) location = segment;
                    return;
                }
                degreeParts.push(segment);
            });
            current = {
                degree: degreeParts.join(', ') || line,
                school,
                year: yearMatch ? yearMatch[0] : '',
                location,
                details: [],
            };
            continue;
        }
        if (!current) {
            current = { degree: '', school: line, year: yearMatch ? yearMatch[0] : '', location: '', details: [] };
            continue;
        }
        if (!current.school) {
            current.school = line;
            if (yearMatch && !current.year) current.year = yearMatch[0];
            if (LOCATION_RE.test(line)) current.location = line;
            continue;
        }
        if (/^((19|20)\d{2}|present)$/i.test(line)) {
            current.year = line;
            continue;
        }
        current.details.push(line);
    }

    finalize();
    return education;
}

function parseSimpleList(lines) {
    const out = [];
    for (const rawLine of lines) {
        const line = stripBullet(rawLine);
        if (!line) continue;
        if (/^[,;|•·\s]+$/.test(line)) continue;
        line.split(/[;•·]/).map(normalizeSpace).filter(Boolean).forEach((item) => {
            if (!out.some((existing) => existing.toLowerCase() === item.toLowerCase())) out.push(item);
        });
    }
    return out;
}

function parseHonors(lines) {
    const honors = [];
    for (const rawLine of lines) {
        const line = stripBullet(rawLine);
        if (!line) continue;
        const yearMatch = line.match(SINGLE_DATE_RE);
        const year = yearMatch ? yearMatch[0] : '';
        const withoutYear = normalizeSpace(line.replace(/[,(]?\s*(19|20)\d{2}\s*\)?/, ''));
        const parts = withoutYear.split(/\s*[—–|]\s*/).map(normalizeSpace).filter(Boolean);
        honors.push({
            title: parts[0] || withoutYear,
            issuer: parts[1] || '',
            year,
            detail: parts.slice(2).join(' — '),
        });
    }
    return honors;
}

function parsePublications(lines) {
    const publications = [];
    for (const rawLine of lines) {
        const line = stripBullet(rawLine);
        if (!line) continue;
        const yearMatch = line.match(SINGLE_DATE_RE);
        const url = extractLinks(line)[0]?.url || '';
        publications.push({
            title: line,
            venue: '',
            year: yearMatch ? yearMatch[0] : '',
            authors: '',
            detail: '',
            citations: '',
            url,
        });
    }
    return publications;
}

function parseAcademicSections(lines) {
    const entries = [];
    let current = null;
    for (const rawLine of lines) {
        const line = stripBullet(rawLine);
        if (!line) continue;
        if (!isBulletLine(rawLine) && (looksLikeEntryHeader(line, '') || isDateRange(line))) {
            if (current) entries.push(current);
            const parts = splitTitleCompany(line);
            current = {
                title: parts.title || line,
                organization: parts.company || '',
                period: isDateRange(line) ? normalizePeriod(line) : '',
                details: [],
            };
            continue;
        }
        if (!current) {
            current = { title: line, organization: '', period: '', details: [] };
        } else {
            current.details.push(line);
        }
    }
    if (current) entries.push(current);
    return entries;
}

function parseResumeText(rawText) {
    const text = String(rawText || '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n').map((line) => line.replace(/[ \t]+$/, ''));
    const warnings = [];

    const sections = {
        summary: [], skills: [], experience: [], projects: [], education: [],
        certifications: [], honors: [], publications: [], researchInterests: [],
        teaching: [], service: [],
    };
    const headerLines = [];
    let zone = 'header';

    for (const rawLine of lines) {
        const line = normalizeSpace(rawLine);
        if (!line) continue;
        if (/^[-=_*·•]{3,}$/.test(line)) continue;

        const inline = splitInlineSection(line);
        if (inline) {
            if (inline.key === 'summary') sections.summary.push(inline.content);
            else if (inline.key === 'skills') sections.skills.push(inline.content);
            else if (inline.key === 'certifications') sections.certifications.push(inline.content);
            else if (inline.key === 'researchInterests') sections.researchInterests.push(inline.content);
            else if (inline.key === 'publications') sections.publications.push(inline.content);
            else if (inline.key === 'honors') sections.honors.push(inline.content);
            else if (inline.key === 'education') sections.education.push(inline.content);
            else if (inline.key === 'projects') sections.projects.push(inline.content);
            else if (inline.key === 'experience') sections.experience.push(inline.content);
            else if (inline.key === 'teaching') sections.teaching.push(inline.content);
            else if (inline.key === 'service') sections.service.push(inline.content);
            zone = inline.key;
            continue;
        }

        const heading = looksLikeSection(line);
        if (heading && line.length <= 52) {
            zone = heading;
            continue;
        }

        if (zone === 'header') {
            headerLines.push(line);
            continue;
        }
        if (sections[zone]) sections[zone].push(line);
    }

    const contactParts = extractContactParts(text);
    const headerCandidates = headerLines
        .filter((line) => !hasContactToken(line))
        .filter((line) => !/^[|•·,]+$/.test(line))
        .filter((line) => line.length <= 80)
        .filter((line) => !looksLikeSection(line));

    const nameCandidate = headerCandidates.find((line) => {
        if (line.length > 60) return false;
        if (/\d/.test(line)) return false;
        if (LOCATION_RE.test(line)) return false;
        const wordCount = line.split(/\s+/).length;
        return wordCount >= 1 && wordCount <= 5 && /[A-Za-z]/.test(line);
    }) || '';

    const subtitleCandidate = headerCandidates.find((line) => {
        if (line === nameCandidate) return false;
        if (line.length > 90) return false;
        if (/\d/.test(line)) return false;
        if (LOCATION_RE.test(line)) return false;
        return /[A-Za-z]/.test(line);
    }) || '';

    const { skills, skillGroups } = parseSkills(sections.skills);
    const experience = parseEntryBlocks(sections.experience)
        .map((entry) => ({
            title: cleanValue(entry.title),
            company: cleanValue(entry.company),
            location: cleanValue(entry.location),
            period: cleanValue(entry.period),
            points: entry.points.map(normalizeSpace).filter(Boolean),
        }))
        .filter((entry) => entry.title || entry.company || entry.points.length);

    const projects = parseEntryBlocks(sections.projects)
        .map((entry) => {
            const url = extractLinks(entry.points.join(' '))[0]?.url || '';
            return {
                title: cleanValue(entry.title),
                company: '',
                platform: '',
                period: cleanValue(entry.period),
                points: entry.points.map(normalizeSpace).filter(Boolean),
                description: '',
                url,
                stars: '',
                venue: '',
            };
        })
        .filter((entry) => entry.title || entry.points.length);

    const education = parseEducation(sections.education);
    const certifications = parseSimpleList(sections.certifications);
    const honors = parseHonors(sections.honors);
    const publications = parsePublications(sections.publications);
    const researchInterests = parseSimpleList(sections.researchInterests);
    const teaching = parseAcademicSections(sections.teaching);
    const service = parseAcademicSections(sections.service);

    const summary = normalizeSpace(sections.summary.join(' ')).slice(0, 900);
    const contact = buildContactString(contactParts);

    if (!nameCandidate) warnings.push('Name not detected.');
    if (!contactParts.email) warnings.push('No email found.');
    if (!contactParts.phone) warnings.push('No phone number found.');
    if (!experience.length) warnings.push('No experience entries detected.');
    if (!skills.length) warnings.push('No skills section detected.');
    if (!education.length) warnings.push('No education entries detected.');
    if (!summary) warnings.push('No summary detected.');

    const profile = {
        name: nameCandidate,
        subtitle: subtitleCandidate,
        position: subtitleCandidate,
        location: contactParts.location,
        company: '',
        recruiterName: '',
        recruiterEmail: '',
        contact,
        email: contactParts.email,
        phone: contactParts.phone,
        links: contactParts.links,
        summary,
        skills,
        skillGroups,
        experience,
        projects,
        openSourceProjects: [],
        education,
        certifications,
        honors,
        publicationsSummary: '',
        publications,
        researchInterests,
        teaching,
        service,
        parseQuality: warnings.length > 2 ? 'low' : 'high',
        parseWarnings: warnings,
    };

    return profile;
}

function normalizeResumeProfile(input) {
    const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const contactParts = extractContactParts(raw.contact || '');
    const email = cleanValue(raw.email) || contactParts.email;
    const phone = cleanValue(raw.phone) || contactParts.phone;
    const location = cleanValue(raw.location) || contactParts.location;
    const links = Array.isArray(raw.links) && raw.links.length
        ? raw.links
            .map((link) => {
                const url = normalizeUrl(typeof link === 'string' ? link : link?.url || link?.text || '');
                if (!url) return null;
                return {
                    label: cleanValue(link?.label) || linkLabel(url),
                    text: cleanValue(link?.text) || url.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
                    url,
                };
            })
            .filter(Boolean)
        : contactParts.links;

    const contact = buildContactString({ email, phone, location, links }) || cleanValue(raw.contact);

    const experience = (Array.isArray(raw.experience) ? raw.experience : [])
        .map((entry) => ({
            title: cleanValue(entry?.title || entry?.role),
            company: cleanValue(entry?.company || entry?.organization),
            location: cleanValue(entry?.location),
            period: cleanValue(entry?.period || entry?.dates),
            points: toStringArray(entry?.points || entry?.bullets).map(normalizeSpace).filter(Boolean),
        }))
        .filter((entry) => entry.title || entry.company || entry.points.length);

    const projects = (Array.isArray(raw.projects) ? raw.projects : [])
        .map((entry) => ({
            title: cleanValue(entry?.title || entry?.name),
            company: cleanValue(entry?.company),
            platform: cleanValue(entry?.platform || entry?.stack),
            period: cleanValue(entry?.period || entry?.dates),
            points: toStringArray(entry?.points || entry?.bullets).map(normalizeSpace).filter(Boolean),
            description: cleanValue(entry?.description),
            url: normalizeUrl(entry?.url || ''),
            stars: cleanValue(entry?.stars),
            venue: cleanValue(entry?.venue),
        }))
        .filter((entry) => entry.title || entry.points.length || entry.description);

    const education = (Array.isArray(raw.education) ? raw.education : [])
        .map((entry) => ({
            degree: cleanValue(entry?.degree),
            school: cleanValue(entry?.school || entry?.institution),
            year: cleanValue(entry?.year || entry?.dates),
            location: cleanValue(entry?.location),
            details: toStringArray(entry?.details || entry?.notes),
        }))
        .filter((entry) => entry.degree || entry.school);

    const honors = (Array.isArray(raw.honors) ? raw.honors : [])
        .map((entry) => (typeof entry === 'string'
            ? { title: cleanValue(entry), issuer: '', year: '', detail: '' }
            : {
                title: cleanValue(entry?.title || entry?.name),
                issuer: cleanValue(entry?.issuer || entry?.organization),
                year: cleanValue(entry?.year),
                detail: cleanValue(entry?.detail || entry?.description),
            }))
        .filter((entry) => entry.title);

    const publications = (Array.isArray(raw.publications) ? raw.publications : [])
        .map((entry) => (typeof entry === 'string'
            ? { title: cleanValue(entry), venue: '', year: '', authors: '', detail: '', citations: '', url: '' }
            : {
                title: cleanValue(entry?.title || entry?.name),
                venue: cleanValue(entry?.venue || entry?.journal),
                year: cleanValue(entry?.year),
                authors: cleanValue(entry?.authors),
                detail: cleanValue(entry?.detail || entry?.description),
                citations: cleanValue(entry?.citations),
                url: normalizeUrl(entry?.url || ''),
            }))
        .filter((entry) => entry.title);

    const teaching = (Array.isArray(raw.teaching) ? raw.teaching : [])
        .map((entry) => ({
            title: cleanValue(entry?.title || entry?.course),
            organization: cleanValue(entry?.organization || entry?.school),
            period: cleanValue(entry?.period || entry?.dates),
            details: toStringArray(entry?.details),
        }))
        .filter((entry) => entry.title || entry.organization);

    const service = (Array.isArray(raw.service) ? raw.service : [])
        .map((entry) => ({
            title: cleanValue(entry?.title || entry?.role),
            organization: cleanValue(entry?.organization),
            period: cleanValue(entry?.period || entry?.dates),
            details: toStringArray(entry?.details),
        }))
        .filter((entry) => entry.title || entry.organization);

    const skillGroups = (Array.isArray(raw.skillGroups) ? raw.skillGroups : [])
        .map((group) => ({
            label: cleanValue(group?.label || group?.name),
            items: toStringArray(group?.items || group?.skills),
        }))
        .filter((group) => group.items.length);

    const skills = toStringArray(raw.skills);

    return {
        name: cleanValue(raw.name),
        subtitle: cleanValue(raw.subtitle || raw.position),
        position: cleanValue(raw.position || raw.subtitle),
        location,
        company: cleanValue(raw.company),
        recruiterName: cleanValue(raw.recruiterName),
        recruiterEmail: cleanValue(raw.recruiterEmail),
        contact,
        email,
        phone,
        links,
        summary: cleanValue(raw.summary).slice(0, 1200),
        skills: skills.length ? skills : skillGroups.flatMap((group) => group.items),
        skillGroups,
        experience,
        projects,
        openSourceProjects: Array.isArray(raw.openSourceProjects) ? raw.openSourceProjects : [],
        education,
        certifications: toStringArray(raw.certifications),
        honors,
        publicationsSummary: cleanValue(raw.publicationsSummary || raw.publicationSummary),
        publications,
        researchInterests: toStringArray(raw.researchInterests || raw.researchAreas),
        teaching,
        service,
        parseQuality: raw.parseQuality === 'low' ? 'low' : 'high',
        parseWarnings: Array.isArray(raw.parseWarnings) ? raw.parseWarnings.filter((item) => typeof item === 'string') : [],
    };
}

function splitContactParts(profile) {
    const source = profile || {};
    const parts = extractContactParts(source.contact || '');
    const links = Array.isArray(source.links) && source.links.length ? source.links : parts.links;
    return {
        email: cleanValue(source.email) || parts.email,
        phone: cleanValue(source.phone) || parts.phone,
        location: cleanValue(source.location) || parts.location,
        links: links.map((link) => ({
            label: cleanValue(link?.label) || linkLabel(link?.url || ''),
            text: cleanValue(link?.text) || normalizeUrl(link?.url || '').replace(/^https?:\/\//i, ''),
            url: normalizeUrl(link?.url || link?.text || ''),
        })).filter((link) => link.url),
    };
}

function resumeProfileWarnings(profile) {
    const warnings = [];
    if (!profile?.name) warnings.push('Add your name.');
    if (!profile?.email && !profile?.phone) warnings.push('Add an email or phone number.');
    if (!Array.isArray(profile?.experience) || !profile.experience.length) warnings.push('Add at least one experience entry.');
    if (!Array.isArray(profile?.skills) || !profile.skills.length) warnings.push('Add a few skills.');
    if (!Array.isArray(profile?.education) || !profile.education.length) warnings.push('Add your education.');
    return warnings;
}

const FIT_PAGE_HEIGHT = 792;
const FIT_PAGE_WIDTH = 612;
const FIT_MARGIN = 36;
const FIT_BODY_SIZE = 9.5;
const FIT_LINE_HEIGHT = 1.1;
const FIT_START_Y = 40;

function estimateTextLines(text, fontSize, width) {
    const clean = normalizeSpace(text);
    if (!clean) return 0;
    const perLine = Math.max(12, Math.floor(width / (fontSize * 0.52)));
    return Math.max(1, Math.ceil(clean.length / perLine));
}

// Rough height of the Professional ("pocketresume") layout at its tightest
// config. Used for the "too long for one page" hint; the popup measures the
// real render before it warns.
function estimateResumePages(profile) {
    const data = normalizeResumeProfile(profile || {});
    const contentWidth = FIT_PAGE_WIDTH - FIT_MARGIN * 2;
    const usable = FIT_PAGE_HEIGHT - FIT_MARGIN * 2;
    let height = FIT_START_Y;
    const addLines = (lines, fontSize) => {
        if (!lines) return;
        height += lines * fontSize * FIT_LINE_HEIGHT;
    };
    const addText = (text, fontSize, width = contentWidth) => {
        addLines(estimateTextLines(text, fontSize, width), fontSize);
    };
    const addInline = (items) => {
        const clean = (Array.isArray(items) ? items : []).map((item) => normalizeSpace(item)).filter(Boolean);
        if (!clean.length) return;
        addText(clean.join('   '), FIT_BODY_SIZE);
        height += 3;
    };
    const addSection = () => {
        height += 3 + 5 + 8;
    };
    const pointsHeight = (points) => {
        (Array.isArray(points) ? points : []).forEach((point) => {
            addText(point, FIT_BODY_SIZE, contentWidth - 10);
            height += 0.5;
        });
    };

    addText(data.name, 14);
    height += 2;
    if (data.subtitle) {
        addText(data.subtitle, 9.5);
        height += 3;
    }
    addText(data.contact, 9);
    height += 8;

    if (data.summary) {
        addSection();
        addText(data.summary, FIT_BODY_SIZE);
        height += 4;
    }

    if (Array.isArray(data.skills) && data.skills.length) {
        addSection();
        addInline(data.skills);
    }

    if (Array.isArray(data.experience) && data.experience.length) {
        addSection();
        data.experience.forEach((entry) => {
            addText(entry.title, FIT_BODY_SIZE);
            if (entry.company || entry.period) {
                addText(`${entry.company || ''} ${entry.period || ''}`.trim(), FIT_BODY_SIZE);
            }
            height += 2;
            pointsHeight(entry.points);
            height += 1.5;
        });
    }

    if (Array.isArray(data.projects) && data.projects.length) {
        addSection();
        data.projects.forEach((entry) => {
            addText(entry.title || entry.name, FIT_BODY_SIZE);
            if (entry.platform || entry.period) {
                addText(`${entry.platform || ''} ${entry.period || ''}`.trim(), FIT_BODY_SIZE);
            }
            if (Array.isArray(entry.points) && entry.points.length) {
                height += 2;
                pointsHeight(entry.points);
            } else if (entry.description) {
                addText(entry.description, FIT_BODY_SIZE);
            }
            height += 1.5;
        });
    }

    if (Array.isArray(data.education) && data.education.length) {
        addSection();
        data.education.forEach((entry) => {
            addText(entry.degree, FIT_BODY_SIZE);
            addText(`${entry.school || ''} ${entry.year || ''}`.trim(), FIT_BODY_SIZE);
            height += 2;
        });
    }

    if (Array.isArray(data.certifications) && data.certifications.length) {
        addSection();
        addInline(data.certifications);
    }

    return Math.max(0.01, Math.round((height / usable) * 100) / 100);
}

export {
    parseResumeText,
    normalizeResumeProfile,
    splitContactParts,
    buildContactString,
    resumeProfileWarnings,
    estimateResumePages,
    isDateRange,
    normalizePeriod,
    isBulletLine,
    stripBullet,
    looksLikeSection,
};
