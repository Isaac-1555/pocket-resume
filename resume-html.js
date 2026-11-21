/* ============================================================================
   resume-html.js — the paper sheet the swarm builds.

   Pure renderer: aligned resume JSON (or the cover-letter payload) in, one
   escaped HTML string out. It never authors content — every string it prints
   comes from the profile, so the animation cannot drift from the PDF.

   Loaded by sidebar.html as an ES module and exposed on
   window.PocketResumeHtml (sidebar.js is a classic script). Importable from
   Node for scripts/test-resume-html.mjs.
   ========================================================================= */

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function clean(value) {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

function cleanList(value) {
    if (!Array.isArray(value)) return [];
    return value.map(clean).filter(Boolean);
}

function isPlaceholder(value) {
    return /^(n\/a|none|unknown|ongoing|present|-|—)$/i.test(clean(value));
}

function optional(value) {
    const text = clean(value);
    return text && !isPlaceholder(text) ? text : '';
}

function joinMeta(parts) {
    return parts.map(clean).filter(Boolean).join(' · ');
}

function section(label, inner) {
    if (!inner) return '';
    return (
        '<section class="pr-sheet__section">' +
        `<h2 class="pr-sheet__label">${esc(label)}</h2>` +
        inner +
        '</section>'
    );
}

function bulletList(points, className = 'pr-sheet__list') {
    const items = cleanList(points);
    if (!items.length) return '';
    return `<ul class="${className}">${items.map((point) => `<li>${esc(point)}</li>`).join('')}</ul>`;
}

function chipList(items) {
    const list = cleanList(items);
    if (!list.length) return '';
    return `<ul class="pr-sheet__skills">${list.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

function contactLine(profile) {
    const direct = clean(profile.contact);
    if (direct) return direct;
    const parts = [
        clean(profile.email),
        clean(profile.phone),
        clean(profile.location),
        ...(Array.isArray(profile.links) ? profile.links.map((link) => clean(link && (link.text || link.url))) : [])
    ];
    return parts.filter(Boolean).join(' · ');
}

function skillItems(profile) {
    const flat = cleanList(profile.skills);
    if (flat.length) return flat;
    if (!Array.isArray(profile.skillGroups)) return [];
    return profile.skillGroups.reduce((acc, group) => {
        const label = clean(group && group.label);
        const items = cleanList(group && group.items);
        items.forEach((item) => acc.push(label ? `${label}: ${item}` : item));
        return acc;
    }, []);
}

function certificationItems(profile) {
    if (!Array.isArray(profile.certifications)) return [];
    return profile.certifications
        .map((cert) => {
            if (typeof cert === 'string') return clean(cert);
            if (!cert || typeof cert !== 'object') return '';
            const name = clean(cert.name || cert.title);
            if (!name) return '';
            const issuer = optional(cert.issuer);
            const year = optional(cert.year);
            let text = name;
            if (issuer) text += ` — ${issuer}`;
            if (year) text += ` (${year})`;
            return text;
        })
        .filter(Boolean);
}

function experienceEntries(profile) {
    if (!Array.isArray(profile.experience)) return '';
    return profile.experience
        .map((entry) => {
            if (!entry) return '';
            const title = clean(entry.title);
            const company = clean(entry.company);
            const location = optional(entry.location);
            const period = optional(entry.period);
            if (!title && !company && !cleanList(entry.points).length) return '';
            const meta = joinMeta([company, location, period]);
            return (
                '<article class="pr-sheet__entry">' +
                (title ? `<p class="pr-sheet__entry-head">${esc(title)}</p>` : '') +
                (meta ? `<p class="pr-sheet__entry-meta">${esc(meta)}</p>` : '') +
                bulletList(entry.points) +
                '</article>'
            );
        })
        .join('');
}

function projectEntries(profile) {
    if (!Array.isArray(profile.projects)) return '';
    return profile.projects
        .map((entry) => {
            if (!entry) return '';
            const title = clean(entry.title || entry.name);
            if (!title) return '';
            const meta = joinMeta([entry.platform, entry.period]);
            const points = cleanList(entry.points);
            const body = points.length ? bulletList(points) : '';
            const description = !points.length ? optional(entry.description) : '';
            return (
                '<article class="pr-sheet__entry">' +
                `<p class="pr-sheet__entry-head">${esc(title)}</p>` +
                (meta ? `<p class="pr-sheet__entry-meta">${esc(meta)}</p>` : '') +
                body +
                (description ? `<p class="pr-sheet__body">${esc(description)}</p>` : '') +
                '</article>'
            );
        })
        .join('');
}

function educationEntries(profile) {
    if (!Array.isArray(profile.education)) return '';
    return profile.education
        .map((entry) => {
            if (!entry) return '';
            const degree = clean(entry.degree);
            const school = clean(entry.school);
            if (!degree && !school) return '';
            const meta = joinMeta([school, optional(entry.location), optional(entry.year)]);
            return (
                '<article class="pr-sheet__entry">' +
                (degree ? `<p class="pr-sheet__entry-head">${esc(degree)}</p>` : '') +
                (meta ? `<p class="pr-sheet__entry-meta">${esc(meta)}</p>` : '') +
                '</article>'
            );
        })
        .join('');
}

/**
 * Render the aligned resume as the paper sheet the agents build.
 * @param {object} profile aligned resume JSON (jsonContent + JD overrides)
 * @returns {string} escaped HTML, one `.pr-sheet` article
 */
export function buildResumeSheetHtml(profile) {
    const data = profile && typeof profile === 'object' ? profile : {};
    const name = clean(data.name);
    const role = optional(data.position) || optional(data.subtitle);
    const contact = contactLine(data);

    const head =
        '<header class="pr-sheet__head">' +
        `<h1 class="pr-sheet__name">${esc(name || 'Resume')}</h1>` +
        (role ? `<p class="pr-sheet__role">${esc(role)}</p>` : '') +
        (contact ? `<p class="pr-sheet__contact">${esc(contact)}</p>` : '') +
        '</header>';

    const summary = optional(data.summary);
    const skills = skillItems(data);
    const certifications = certificationItems(data);

    const body =
        head +
        section('Professional Summary', summary ? `<p class="pr-sheet__body">${esc(summary)}</p>` : '') +
        section('Skills', chipList(skills)) +
        section('Experience', experienceEntries(data)) +
        section('Featured Projects', projectEntries(data)) +
        section('Education', educationEntries(data)) +
        section('Certifications', chipList(certifications));

    return `<article class="pr-sheet">${body}</article>`;
}

/**
 * Render the cover letter as the paper sheet the agents build.
 * @param {object} letter payload shaped like generateCoverLetterPDF's input
 * @returns {string} escaped HTML, one `.pr-sheet` article
 */
export function buildCoverLetterSheetHtml(letter) {
    const data = letter && typeof letter === 'object' ? letter : {};
    const name = clean(data.applicant_name);
    const contact = clean(data.applicant_contact);

    const paragraphs = [
        clean(data.greeting),
        clean(data.opening_paragraph),
        ...cleanList(data.body_paragraphs),
        clean(data.closing_paragraph)
    ].filter(Boolean);

    const recipient = [
        clean(data.recipient_name) && clean(data.recipient_name) !== 'Hiring Manager'
            ? clean(data.recipient_name)
            : '',
        clean(data.recipient_title),
        clean(data.company_name),
        clean(data.company_address)
    ].filter(Boolean);

    const head =
        '<header class="pr-sheet__head">' +
        `<h1 class="pr-sheet__name">${esc(name || 'Cover Letter')}</h1>` +
        (contact ? `<p class="pr-sheet__contact">${esc(contact)}</p>` : '') +
        '</header>';

    const dateLine = clean(data.date);
    const recipientBlock = recipient.length
        ? `<section class="pr-sheet__section"><p class="pr-sheet__body">${recipient
              .map((line) => esc(line))
              .join('<br>')}</p></section>`
        : '';

    const letterBody = paragraphs.length
        ? `<section class="pr-sheet__section"><div class="pr-sheet__letter">${paragraphs
              .map((paragraph) => `<p>${esc(paragraph)}</p>`)
              .join('')}</div></section>`
        : '';

    const signOff = clean(data.sign_off);
    const signature = signOff || name
        ? `<section class="pr-sheet__section"><p class="pr-sheet__body">${
              signOff ? `${esc(signOff)}<br>` : ''
          }${name ? esc(name) : ''}</p></section>`
        : '';

    return (
        '<article class="pr-sheet">' +
        head +
        (dateLine ? `<section class="pr-sheet__section"><p class="pr-sheet__body">${esc(dateLine)}</p></section>` : '') +
        recipientBlock +
        letterBody +
        signature +
        '</article>'
    );
}

if (typeof window !== 'undefined') {
    window.PocketResumeHtml = { buildResumeSheetHtml, buildCoverLetterSheetHtml };
}
