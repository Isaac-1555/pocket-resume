// scripts/build-location-directory.mjs
// Builds the bundled global location directory from GeoNames (CC BY 4.0).
// Usage: npm run build:locations

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { comparisonKey, normalizeStringList } from '../directory-core.js';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, '..', 'libs', 'location-directory-global.js');

const GEONAMES = 'https://download.geonames.org/export/dump';
const MIN_POPULATION = 100000;
const MAX_RECORDS = 8000;
const MAX_ALIASES = 10;

const CA_PROVINCE_CODES = {
    '01': 'AB', '02': 'BC', '03': 'MB', '04': 'NB', '05': 'NL',
    '07': 'NS', '08': 'ON', '09': 'PE', '10': 'QC', '11': 'SK',
    '12': 'YT', '13': 'NT', '14': 'NU'
};

const CITY_ALIAS_OVERRIDES = {
    'New York City': ['New York'],
    'San Francisco': ['SF Bay Area'],
    'Washington, D.C.': ['Washington DC', 'DC']
};

async function download(url) {
    const response = await fetch(url, { headers: { 'user-agent': 'PocketResume build' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return Buffer.from(await response.arrayBuffer());
}

function parseCountryInfo(text) {
    const map = new Map();
    String(text || '').split('\n').forEach((line) => {
        if (!line || line.startsWith('#')) return;
        const parts = line.split('\t');
        if (parts.length < 5) return;
        const code = String(parts[0] || '').trim().toUpperCase();
        const name = String(parts[4] || '').trim();
        if (code && name) map.set(code, name);
    });
    return map;
}

function parseAdmin1(text) {
    const map = new Map();
    String(text || '').split('\n').forEach((line) => {
        if (!line) return;
        const parts = line.split('\t');
        if (parts.length < 2) return;
        const code = String(parts[0] || '').trim();
        const name = String(parts[1] || '').trim();
        if (code && name) map.set(code, name);
    });
    return map;
}

function aliasCandidates(name, asciiName, alternateNames, cityKey, regionKey, countryKey) {
    const raw = [asciiName, ...String(alternateNames || '').split(',')]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    const seen = new Set();
    const scored = [];
    raw.forEach((value) => {
        if (value.length < 2 || value.length > 48) return;
        if (!/\p{L}/u.test(value)) return;
        if (!/^\p{Script=Latin}+(?:[\s.'&-]+\p{Script=Latin}+)*$/u.test(value)) return;
        if (/\d/.test(value)) return;
        const key = comparisonKey(value);
        if (!key || seen.has(key)) return;
        if (key === cityKey || key === regionKey || key === countryKey) return;
        seen.add(key);
        const acronym = /^[A-Z0-9&.'-]{2,8}$/.test(value) && value === value.toUpperCase();
        const ascii = /^[\x20-\x7E]+$/.test(value);
        const titleCase = value.split(/\s+/).every((word) => /^[A-Z]/.test(word) || /^(?:of|the|and|de|la|del|los|las)$/i.test(word));
        const score = acronym ? 0 : value === asciiName ? 1 : ascii && titleCase ? 2 : ascii ? 3 : 4;
        scored.push({ value, score, length: value.length });
    });
    scored.sort((a, b) => a.score - b.score || a.length - b.length || a.value.localeCompare(b.value));
    return normalizeStringList(scored.map((item) => item.value)).slice(0, MAX_ALIASES);
}

const dir = await mkdtemp(join(tmpdir(), 'pocketresume-locations-'));
try {
    const [zip, admin1Buf, countryBuf] = await Promise.all([
        download(`${GEONAMES}/cities15000.zip`),
        download(`${GEONAMES}/admin1CodesASCII.txt`),
        download(`${GEONAMES}/countryInfo.txt`)
    ]);
    const zipPath = join(dir, 'cities15000.zip');
    await writeFile(zipPath, zip);
    const citiesText = execFileSync('unzip', ['-p', zipPath, 'cities15000.txt'], {
        maxBuffer: 64 * 1024 * 1024
    }).toString('utf8');
    const admin1 = parseAdmin1(admin1Buf.toString('utf8'));
    const countries = parseCountryInfo(countryBuf.toString('utf8'));

    const records = [];
    const seen = new Set();
    for (const line of citiesText.split('\n')) {
        if (!line) continue;
        const parts = line.split('\t');
        if (parts.length < 15) continue;
        const id = String(parts[0] || '').trim();
        const name = String(parts[1] || '').trim();
        const asciiName = String(parts[2] || '').trim();
        const alternateNames = String(parts[3] || '').trim();
        const featureCode = String(parts[7] || '').trim();
        const countryCode = String(parts[8] || '').trim().toUpperCase();
        const admin1Code = String(parts[10] || '').trim();
        const population = Number(parts[14]) || 0;
        if (!id || !name) continue;
        if (population < MIN_POPULATION && featureCode !== 'PPLC') continue;

        const countryName = countries.get(countryCode) || countryCode;
        const regionName = admin1.get(`${countryCode}.${admin1Code}`) || '';
        const regionCode = countryCode === 'US'
            ? admin1Code
            : countryCode === 'CA'
                ? (CA_PROVINCE_CODES[admin1Code] || admin1Code)
                : '';
        const cityKey = comparisonKey(name);
        const regionKey = comparisonKey(regionName || regionCode);
        const countryKey = comparisonKey(countryName);
        if (!cityKey) continue;

        const aliasList = normalizeStringList([
            ...(CITY_ALIAS_OVERRIDES[name] || []),
            ...aliasCandidates(name, asciiName, alternateNames, cityKey, regionKey, countryKey)
        ]).slice(0, MAX_ALIASES);
        const shortRegion = regionCode || regionName;
        let displayName;
        if (comparisonKey(name) === countryKey && !regionKey) {
            displayName = name;
        } else if (shortRegion && comparisonKey(shortRegion) !== cityKey) {
            displayName = `${name}, ${/^(?:US|CA)$/.test(countryCode) ? shortRegion.toUpperCase() : shortRegion}`;
        } else {
            displayName = `${name}, ${countryName}`;
        }
        const canonicalParts = [name, regionName || regionCode, countryName]
            .filter(Boolean)
            .filter((value, index, list) => index === 0 || comparisonKey(value) !== comparisonKey(list[index - 1]));
        const canonicalName = canonicalParts.join(', ');
        const dedupeKey = comparisonKey(canonicalName);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        records.push({
            id,
            canonicalName,
            displayName,
            city: name,
            region: regionName,
            regionCode,
            country: countryName,
            countryCode,
            aliases: aliasList,
            population
        });
    }

    records.sort((a, b) => b.population - a.population || a.canonicalName.localeCompare(b.canonicalName));
    const entries = records.slice(0, MAX_RECORDS).map(({ population, countryCode, ...record }) => record);

    const base = {
        version: 1,
        updatedAt: 1760000000000,
        source: 'GeoNames cities15000 (CC BY 4.0)',
        locations: entries
    };
    const file = `// Generated by scripts/build-location-directory.mjs — GeoNames (CC BY 4.0).
// Regenerate with: npm run build:locations
export const LOCATION_DIRECTORY_BASE = ${JSON.stringify(base)};
`;
    await writeFile(outputPath, file, 'utf8');
    const bytes = Buffer.byteLength(file, 'utf8');
    console.log(`Wrote ${outputPath} — ${entries.length} locations, ${(bytes / 1024).toFixed(1)} KB`);
} finally {
    await rm(dir, { recursive: true, force: true });
}
