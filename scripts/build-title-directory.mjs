// scripts/build-title-directory.mjs
// Downloads O*NET's public job-title list and writes the bundled fallback
// directory used when the daily titles.json refresh has not run yet.
// Usage: npm run build:titles

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sanitizeJobTitle, titleComparisonKey } from '../job-title-directory.js';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, '..', 'libs', 'title-directory-global.js');

const ONET_ORIGIN = 'https://www.onetcenter.org';
const ONET_RELEASE = 'db_31_0';
const SAMPLE_TITLES_URL = `${ONET_ORIGIN}/dl_files/database/${ONET_RELEASE}_csv/sample_of_reported_titles.csv`;
const JOB_TITLES_URL = `${ONET_ORIGIN}/dl_files/database/${ONET_RELEASE}_csv/job_titles.csv`;

async function download(url) {
    const response = await fetch(url, { headers: { 'user-agent': 'PocketResume build' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                cell += char;
            }
            continue;
        }
        if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(cell);
            cell = '';
        } else if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else if (char !== '\r') {
            cell += char;
        }
    }
    row.push(cell);
    rows.push(row);
    return rows;
}

function indexOfHeader(header, names) {
    for (const name of names) {
        const index = header.findIndex((value) => String(value || '').trim().toLowerCase() === name.toLowerCase());
        if (index >= 0) return index;
    }
    return -1;
}

function isAcronym(text) {
    return /^[A-Z][A-Z0-9&./-]{1,9}$/.test(text) && !/[a-z]/.test(text);
}

function titleVariants(title) {
    const out = new Set([title]);
    const parenthetical = title.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (parenthetical) {
        const left = parenthetical[1].trim();
        const right = parenthetical[2].trim();
        if (isAcronym(left) && right.split(/\s+/).length >= 2) out.add(right);
        if (isAcronym(right) && left.split(/\s+/).length >= 2) out.add(left);
    }
    const slash = title.match(/^(.*?)\s*\/\s*(.*?)$/);
    if (slash) {
        const left = slash[1].trim();
        const right = slash[2].trim();
        if (left.split(/\s+/).length >= 2) out.add(left);
        if (right.split(/\s+/).length >= 2) out.add(right);
    }
    return [...out];
}

const [sampleCsv, jobTitlesCsv] = await Promise.all([
    download(SAMPLE_TITLES_URL),
    download(JOB_TITLES_URL)
]);

const titles = new Map();

function addTitle(raw) {
    const sanitized = sanitizeJobTitle(raw);
    if (!sanitized.valid) return;
    const key = titleComparisonKey(sanitized.normalizedName);
    if (!key) return;
    if (!titles.has(key)) {
        titles.set(key, {
            canonicalName: sanitized.normalizedName,
            aliases: new Set()
        });
    }
    titleVariants(sanitized.normalizedName).forEach((variant) => {
        const clean = sanitizeJobTitle(variant);
        if (!clean.valid) return;
        if (titleComparisonKey(clean.normalizedName) === key) return;
        titles.get(key).aliases.add(clean.normalizedName);
    });
}

const sampleRows = parseCsv(sampleCsv);
if (sampleRows.length) {
    const header = sampleRows[0];
    const titleIndex = indexOfHeader(header, ['Reported Job Title', 'Job Title']);
    const shownIndex = indexOfHeader(header, ['Shown in My Next Move']);
    for (let i = 1; i < sampleRows.length; i++) {
        const row = sampleRows[i];
        if (!row || !row.length) continue;
        if (shownIndex >= 0 && String(row[shownIndex] || '').trim().toUpperCase() !== 'Y') continue;
        addTitle(row[titleIndex]);
    }
}

const jobRows = parseCsv(jobTitlesCsv);
if (jobRows.length) {
    const header = jobRows[0];
    const shortIndex = indexOfHeader(header, ['Short Title']);
    for (let i = 1; i < jobRows.length; i++) {
        const row = jobRows[i];
        if (!row || !row.length) continue;
        const short = String(row[shortIndex] || '').trim();
        if (short) addTitle(short);
    }
}

const entries = [...titles.entries()]
    .map(([key, value]) => ({
        id: key.replace(/\s+/g, '-').slice(0, 60),
        canonicalName: value.canonicalName,
        aliases: [...value.aliases].slice(0, 6)
    }))
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

const base = {
    version: 1,
    updatedAt: 1760000000000,
    source: 'O*NET 31.0 job titles (CC BY 4.0, U.S. Department of Labor)',
    titles: entries
};

const file = `// Generated by scripts/build-title-directory.mjs — O*NET 31.0 (CC BY 4.0, U.S. Department of Labor).
// Regenerate with: npm run build:titles
export const TITLE_DIRECTORY_BASE = ${JSON.stringify(base)};
`;

await writeFile(outputPath, file, 'utf8');
const bytes = Buffer.byteLength(file, 'utf8');
console.log(`Wrote ${outputPath} — ${entries.length} titles, ${(bytes / 1024).toFixed(1)} KB`);
