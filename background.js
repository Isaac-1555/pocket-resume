// background.js
import './cloud-sync-core.js';
import {
    parseJobPosting,
    alignResumeJson,
    buildCoverLetterFromTemplate,
    mergePageText
} from './resume-align.js';
import {
    ONET_ORIGIN,
    ONET_PINNED_RELEASE,
    parseOnetRelease,
    buildOnetUrls,
    buildLexiconFromOnet,
    mergeLexicons,
    compactLexicon,
    expandLexicon,
    emptyLexicon
} from './skill-lexicon.js';
import { SKILL_LEXICON_BASE } from './libs/skills-lexicon.js';
import { checkResumeHealth } from './resume-health.js';
import { generateCoverLetterBody, COVER_LETTER_COOLDOWN_MS } from './resume-letter.js';
import { resolveFormAnswers, normalizeFormAnswers } from './form-profile.js';
import { resolveCompanyName, refreshGlobalDirectory } from './company-directory-store.js';
import { APPLY_CONFIDENCE } from './company-directory.js';
import { resolveTitleName, refreshGlobalTitleDirectory } from './job-title-directory-store.js';
import { resolveLocationName, refreshGlobalLocationDirectory } from './job-location-directory-store.js';
import { pickPreferredLocation, parseLocation } from './job-location-directory.js';

async function setCoverLetterCooldown(resumeId, cooldownUntil) {
    if (!resumeId) return;
    const data = await chrome.storage.local.get(['resumes']);
    const entries = Array.isArray(data.resumes) ? data.resumes : [];
    let changed = false;
    const next = entries.map((item) => {
        if (!item || item.id !== resumeId) return item;
        changed = true;
        return { ...item, coverLetterCooldownUntil: cooldownUntil };
    });
    if (changed) await chrome.storage.local.set({ resumes: next });
}

// --- Pipeline Utilities ---
function normalizeResumeStyle(selectedStyle) {
    switch (selectedStyle) {
        case "deedy":
        case "academic-cv":
        case "professional":
            return selectedStyle;
        default:
            return "professional";
    }
}

function getResumeStyleConfig(selectedStyle) {
    switch (normalizeResumeStyle(selectedStyle)) {
        case "deedy":
            return { layout: "deedy" };
        case "academic-cv":
            return { layout: "academic-cv" };
        case "professional":
        default:
            return { layout: "pocketresume" };
    }
}

function stripMarkdownCodeBlock(rawText) {
    let text = (rawText || '').trim();

    if (text.startsWith('```json')) {
        text = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    } else if (text.startsWith('```')) {
        text = text.replace(/^```\s*/, '').replace(/```$/, '').trim();
    }

    return text;
}

function sanitizeJsonControlChars(text) {
    let out = '';
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (!inString) {
            if (ch === '"') inString = true;
            out += ch;
            continue;
        }
        if (ch === '\\') {
            out += ch + (text[i + 1] || '');
            i++;
            continue;
        }
        if (ch === '"') {
            inString = false;
            out += ch;
            continue;
        }
        const code = ch.charCodeAt(0);
        if (code < 0x20) {
            if (code === 0x0A) out += '\\n';
            else if (code === 0x0D) out += '\\r';
            else if (code === 0x09) out += '\\t';
            else out += '\\u' + code.toString(16).padStart(4, '0');
            continue;
        }
        out += ch;
    }
    return out;
}

function parseJsonText(rawText, contextLabel) {
    const cleanedText = sanitizeJsonControlChars(stripMarkdownCodeBlock(rawText));

    try {
        return JSON.parse(cleanedText);
    } catch (error) {
        console.error(`${contextLabel} JSON Parse Error:`, error);
        console.log(`${contextLabel} Raw Data:`, rawText);
        throw new Error(`Error parsing ${contextLabel.toLowerCase()}. Please try again.`);
    }
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean);
}

const PAGE_CACHE_KEY = 'pendingGeneration';
const PAGE_CACHE_TTL_MS = 15 * 60 * 1000;

const EMBEDDED_FRAME_HOST = /(?:greenhouse|lever\.co|ashbyhq|workable|hibob|breezy|recruitee|smartrecruiters|jobvite|icims|taleo|workday|bamboohr|personio|join\.com|applytojob|recruiterbox)/i;
const CHROME_FRAME_HOST = /(?:recaptcha|doubleclick|googletagmanager|google-analytics|facebook\.com|messenger|qualified\.com|cookiebot|hubspot|intercom|drift\.com|youtube\.com|vimeo\.com|stripe\.com|paypal)/i;
const ROLE_WORD = /\b(engineer|engineering|developer|designer|manager|analyst|specialist|coordinator|director|lead|architect|scientist|consultant|administrator|technician|recruiter|president|accountant|advisor|operator|supervisor|executive|associate|assistant)\b/i;

function scoreFrameSnapshot(frame, isTop) {
    if (!frame) return -1000;
    let score = isTop ? 10 : 0;
    if (CHROME_FRAME_HOST.test(frame.url || '')) score -= 500;
    if (frame.textLength > 600) score += 20;
    if (frame.hasJobPosting) score += 100;
    if (EMBEDDED_FRAME_HOST.test(frame.url || '')) score += 60;
    const hasTitle = (frame.candidates || []).some((candidate) => ROLE_WORD.test(candidate.value || ''));
    if (hasTitle) score += 30;
    if (frame.textLength > 4000) score += 10;
    return score;
}

function dedupeTitleCandidates(candidates) {
    const seen = new Set();
    const out = [];
    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
        const value = candidate && typeof candidate === 'object'
            ? candidate.value
            : candidate;
        const source = candidate && typeof candidate === 'object' ? (candidate.source || 'page') : 'page';
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        const key = `${source}:${text.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ value: text.slice(0, 200), source });
    });
    return out.slice(0, 24);
}

const frameCollectors = new Map();

function collectFrameSnapshots(tabId) {
    return new Promise((resolve) => {
        const requestId = `frames_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const frames = [];
        let settle = null;
        let hard = null;
        const finish = () => {
            if (settle) clearTimeout(settle);
            if (hard) clearTimeout(hard);
            settle = null;
            hard = null;
            frameCollectors.delete(requestId);
            resolve(frames);
        };
        const bump = () => {
            if (settle) clearTimeout(settle);
            settle = setTimeout(finish, 250);
        };
        frameCollectors.set(requestId, { tabId, frames, bump, finish });
        hard = setTimeout(finish, 1500);
        try {
            chrome.tabs.sendMessage(tabId, { type: 'COLLECT_FRAME_SNAPSHOT', requestId }, () => {
                void chrome.runtime.lastError;
            });
        } catch (error) {
            finish();
            return;
        }
        bump();
    });
}

async function mergeEmbeddedFrames(tabId, page) {
    const collected = await collectFrameSnapshots(tabId);
    const frames = (Array.isArray(collected) ? collected : [])
        .map((entry) => ({ frame: entry && entry.frame, isTop: entry && entry.frameId === 0 }))
        .filter((entry) => entry.frame);
    if (!frames.length) return page;

    const top = frames.find((entry) => entry.isTop);
    const ranked = frames
        .map((entry) => ({ ...entry, score: scoreFrameSnapshot(entry.frame, entry.isTop) }))
        .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return page;

    const structured = page.structured && typeof page.structured === 'object' ? { ...page.structured } : {};
    const usableFrames = frames.filter((entry) => !CHROME_FRAME_HOST.test(entry.frame.url || ''));
    const mergedCandidates = dedupeTitleCandidates([
        ...(Array.isArray(structured.titleCandidates) ? structured.titleCandidates : []),
        ...usableFrames.flatMap((entry) => entry.frame.candidates || [])
    ]);
    structured.titleCandidates = mergedCandidates;

    const topScore = top ? scoreFrameSnapshot(top.frame, true) : -1000;
    const adopt = !top || (
        best.score > topScore + 40 &&
        (EMBEDDED_FRAME_HOST.test(best.frame.url || '') || best.frame.hasJobPosting) &&
        !!best.frame.text &&
        best.frame.text.length > 600
    );
    if (adopt) {
        const frame = best.frame;
        page.jobText = frame.text || page.jobText;
        if (frame.structured) {
            if (frame.structured.title) structured.title = frame.structured.title;
            if (frame.structured.company) structured.company = frame.structured.company;
            if (frame.structured.description) structured.description = frame.structured.description;
            if (Array.isArray(frame.structured.locations) && frame.structured.locations.length) {
                structured.locations = frame.structured.locations;
                structured.location = frame.structured.locations[0];
            }
        }
        if (!page.title && frame.docTitle) page.title = frame.docTitle;
        console.log('[Frames] Using embedded job frame:', frame.url);
    }

    page.structured = structured;
    return page;
}

async function getPageContentForTab(tabId, { skipCache = false } = {}) {
    const cached = (await chrome.storage.local.get(PAGE_CACHE_KEY))[PAGE_CACHE_KEY];
    const now = Date.now();
    let cacheFresh = !!(
        !skipCache &&
        cached &&
        cached.tabId === tabId &&
        typeof cached.jobText === 'string' &&
        cached.jobText.trim() &&
        now - (cached.savedAt || 0) < PAGE_CACHE_TTL_MS
    );
    if (cacheFresh && !cached.url) cacheFresh = false;
    if (cacheFresh) {
        const current = await getPageUrlForTab(tabId, { inject: false });
        if (!current.url || current.url !== cached.url) cacheFresh = false;
    }
    if (cacheFresh) {
        return { jobText: cached.jobText, structured: cached.structured || {}, title: cached.title || '', url: cached.url || '' };
    }

    const contentData = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (response) => {
            if (chrome.runtime.lastError) {
                chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('[Content] Could not read the page:', chrome.runtime.lastError.message);
                        resolve({ text: '' });
                        return;
                    }
                    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (res) => {
                        if (chrome.runtime.lastError) {
                            console.warn('[Content] Could not read the page:', chrome.runtime.lastError.message);
                            resolve({ text: '' });
                        } else {
                            resolve(res);
                        }
                    });
                });
            } else {
                resolve(response);
            }
        });
    });

    const jobText = contentData.text || "";
    const structured = contentData.structured && typeof contentData.structured === 'object' ? contentData.structured : {};
    const title = typeof contentData.title === 'string' ? contentData.title : '';
    const url = typeof contentData.url === 'string' ? contentData.url : '';
    const page = await mergeEmbeddedFrames(tabId, { jobText, structured, title, url });
    await chrome.storage.local.set({
        [PAGE_CACHE_KEY]: { tabId, jobText: page.jobText, structured: page.structured, title: page.title, url: page.url, savedAt: now }
    });
    return page;
}

async function getPageUrlForTab(tabId, { inject = true } = {}) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_URL' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.url) {
                if (!inject) {
                    chrome.tabs.get(tabId, (tab) => {
                        if (chrome.runtime.lastError) {
                            resolve({ url: '', title: '' });
                            return;
                        }
                        resolve({ url: (tab && tab.url) || '', title: (tab && tab.title) || '' });
                    });
                    return;
                }
                chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                }, () => {
                    if (chrome.runtime.lastError) {
                        resolve({ url: '', title: '' });
                        return;
                    }
                    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_URL' }, (res) => {
                        if (chrome.runtime.lastError || !res) resolve({ url: '', title: '' });
                        else resolve({ url: res.url || '', title: res.title || '' });
                    });
                });
                return;
            }
            resolve({ url: response.url || '', title: response.title || '' });
        });
    });
}

function buildJobText(page) {
    const body = String(page.jobText || '');
    const description = String(page.structured && page.structured.description ? page.structured.description : '');
    return mergePageText(body, description);
}

// --- Deterministic alignment (offline mode) ---
const SKILL_LEXICON_KEY = 'skillLexicon';
const SKILL_LEXICON_META_KEY = 'skillLexiconMeta';
const SKILL_LEXICON_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SKILL_LEXICON_ALARM = 'skillLexiconDaily';
const COMPANY_DIRECTORY_ALARM = 'companyDirectoryDaily';
const TITLE_DIRECTORY_ALARM = 'titleDirectoryDaily';
const LOCATION_DIRECTORY_ALARM = 'locationDirectoryDaily';

function getBundledLexicon() {
    const expanded = expandLexicon(SKILL_LEXICON_BASE);
    return expanded && Array.isArray(expanded.terms) && expanded.terms.length ? expanded : emptyLexicon();
}

async function getSkillLexicon() {
    try {
        const data = await chrome.storage.local.get(SKILL_LEXICON_KEY);
        const stored = expandLexicon(data[SKILL_LEXICON_KEY]);
        if (stored && Array.isArray(stored.terms) && stored.terms.length) return stored;
    } catch (error) {
        console.warn('[Align] Could not read the skill lexicon:', error);
    }
    return getBundledLexicon();
}

async function fetchTextWithTimeout(url, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

async function resolveOnetRelease() {
    try {
        const indexHtml = await fetchTextWithTimeout(`${ONET_ORIGIN}/database.html`, 20000);
        return parseOnetRelease(indexHtml) || ONET_PINNED_RELEASE;
    } catch (error) {
        console.warn('[Align] Could not resolve the newest O*NET release, using the pinned one:', error.message);
        return ONET_PINNED_RELEASE;
    }
}

async function updateSkillLexicon(releaseOverride) {
    const release = releaseOverride || await resolveOnetRelease();
    const urls = buildOnetUrls(release);
    const [softwareCsv, essentialCsv, transferableCsv] = await Promise.all([
        fetchTextWithTimeout(urls.software),
        fetchTextWithTimeout(urls.essential),
        fetchTextWithTimeout(urls.transferable)
    ]);
    const fresh = buildLexiconFromOnet({ softwareCsv, essentialCsv, transferableCsv, version: release });
    const merged = mergeLexicons(getBundledLexicon(), fresh);
    const compact = compactLexicon(merged);
    const meta = {
        source: merged.source,
        version: merged.version,
        fetchedAt: merged.fetchedAt,
        count: merged.count,
        lastError: ''
    };
    await chrome.storage.local.set({
        [SKILL_LEXICON_KEY]: compact,
        [SKILL_LEXICON_META_KEY]: meta
    });
    return meta;
}

async function maybeAutoUpdateSkillLexicon() {
    try {
        const data = await chrome.storage.local.get(SKILL_LEXICON_META_KEY);
        const meta = data[SKILL_LEXICON_META_KEY];
        const age = Date.now() - (meta?.fetchedAt || 0);
        if (meta && age < SKILL_LEXICON_MAX_AGE_MS) return;
        const permission = await chrome.permissions.contains({ origins: ['https://www.onetcenter.org/*'] });
        if (!permission) return;
        const release = await resolveOnetRelease();
        if (meta && meta.version === release) {
            await chrome.storage.local.set({
                [SKILL_LEXICON_META_KEY]: { ...meta, fetchedAt: Date.now(), lastError: '' }
            });
            return;
        }
        await updateSkillLexicon(release);
        console.log('[Align] Skill lexicon updated.');
    } catch (error) {
        console.warn('[Align] Skill lexicon auto-update failed:', error);
        await chrome.storage.local.set({
            [SKILL_LEXICON_META_KEY]: {
                ...(await chrome.storage.local.get(SKILL_LEXICON_META_KEY))[SKILL_LEXICON_META_KEY],
                lastError: error.message || String(error)
            }
        });
    }
}

function enableSidePanel() {
    if (!chrome.sidePanel || typeof chrome.sidePanel.setPanelBehavior !== 'function') return;
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
        console.warn('[SidePanel] could not enable action click:', error);
    });
}

function clearPageCacheForTab(tabId) {
    chrome.storage.local.get(PAGE_CACHE_KEY, (data) => {
        const cached = data && data[PAGE_CACHE_KEY];
        if (cached && cached.tabId === tabId) {
            chrome.storage.local.remove(PAGE_CACHE_KEY, () => void chrome.runtime.lastError);
        }
    });
}

if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (!changeInfo || (!changeInfo.url && changeInfo.status !== 'loading')) return;
        clearPageCacheForTab(tabId);
    });
}
if (chrome.tabs && chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => clearPageCacheForTab(tabId));
}

chrome.alarms.create(SKILL_LEXICON_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 3 });
chrome.alarms.create(COMPANY_DIRECTORY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 5 });
chrome.alarms.create(TITLE_DIRECTORY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 7 });
chrome.alarms.create(LOCATION_DIRECTORY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 9 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SKILL_LEXICON_ALARM) maybeAutoUpdateSkillLexicon();
    if (alarm.name === COMPANY_DIRECTORY_ALARM) maybeAutoUpdateCompanyDirectory();
    if (alarm.name === TITLE_DIRECTORY_ALARM) maybeAutoUpdateTitleDirectory();
    if (alarm.name === LOCATION_DIRECTORY_ALARM) maybeAutoUpdateLocationDirectory();
});
chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.clear('skillLexiconWeekly');
    maybeAutoUpdateSkillLexicon();
    maybeAutoUpdateCompanyDirectory();
    maybeAutoUpdateTitleDirectory();
    maybeAutoUpdateLocationDirectory();
    enableSidePanel();
});
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.clear('skillLexiconWeekly');
    maybeAutoUpdateSkillLexicon();
    maybeAutoUpdateCompanyDirectory();
    maybeAutoUpdateTitleDirectory();
    maybeAutoUpdateLocationDirectory();
    enableSidePanel();
});
maybeAutoUpdateSkillLexicon();
enableSidePanel();


const ACCESS_CACHE_KEY = 'proAccessCache';
const ACCESS_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const ACCESS_WINDOW_END = new Date('2026-12-31T23:59:59.999').getTime();

// The worker never holds a Clerk session. Page realms publish the resolved
// snapshot to `proAccessCache`; the worker only reads it.
async function readCachedAccess() {
    try {
        const data = await chrome.storage.local.get(ACCESS_CACHE_KEY);
        const cached = data && data[ACCESS_CACHE_KEY];
        if (cached && typeof cached.signedIn === 'boolean') {
            if (Date.now() - (cached.checkedAt || 0) > ACCESS_CACHE_MAX_AGE_MS) return null;
            return cached;
        }
    } catch (err) {
        console.warn('[Access] Could not read cached access:', err);
    }
    return null;
}

function withinAccessWindow(now = Date.now()) {
    return now <= ACCESS_WINDOW_END;
}

async function getGenerationAccess() {
    const withinWindow = withinAccessWindow();
    if (globalThis.CloudSync && typeof globalThis.CloudSync.isConfigured === 'function' && !globalThis.CloudSync.isConfigured()) {
        return { allowed: true, signedIn: true, withinWindow, isPro: false, unconfigured: true };
    }
    const cached = await readCachedAccess();
    if (!cached) {
        return { allowed: false, signedIn: false, withinWindow, reason: 'signin_required' };
    }
    const signedIn = !!cached.signedIn;
    const isPro = !!cached.isPro || !!cached.proAccess;
    if (!signedIn) {
        return { allowed: false, signedIn: false, withinWindow, isPro: false, reason: 'signin_required' };
    }
    if (withinWindow || isPro) {
        return { allowed: true, signedIn: true, withinWindow, isPro, cached: true };
    }
    return { allowed: false, signedIn: true, withinWindow, isPro: false, reason: 'plan_required' };
}

function buildJobMeta(jd, resume) {
    return {
        title: jd.title || resume.position || resume.subtitle || '',
        company: jd.company || resume.company || '',
        location: jd.location || '',
        recruiterName: jd.recruiterName || '',
        recruiterEmail: jd.recruiterEmail || '',
        companyMeta: jd.companyMeta || null,
        titleMeta: jd.titleMeta || null,
        locationMeta: jd.locationMeta || null
    };
}

// --- Company directory (offline, deterministic) ---

async function resolveExtractedCompany(jd, page) {
    const raw = String(jd.company || '').trim();
    const fallback = {
        value: raw,
        originalValue: raw,
        source: jd.companySource || '',
        matchType: 'none',
        directoryId: null,
        confidence: 0,
        suggestion: null
    };
    try {
        const resolved = await resolveCompanyName(raw, { url: (page && page.url) || '', source: jd.companySource || '' });
        const usable = resolved.value && (resolved.confidence >= APPLY_CONFIDENCE || resolved.matchType === 'domain');
        if (usable) return resolved;
        return { ...resolved, value: raw };
    } catch (error) {
        console.warn('[CompanyDirectory] Resolution failed, keeping the extracted name:', error);
        return fallback;
    }
}

async function maybeAutoUpdateCompanyDirectory() {
    try {
        await refreshGlobalDirectory();
    } catch (error) {
        console.warn('[CompanyDirectory] auto-update failed:', error);
    }
}

// --- Job title + location directories (offline, deterministic) ---

function masterLocationForProfile(profile) {
    const direct = String((profile && profile.location) || '').trim();
    if (direct) return direct;
    const contact = String((profile && profile.contact) || '');
    const segments = contact.split('|').map((part) => part.trim()).filter(Boolean);
    for (const segment of segments) {
        const parsed = parseLocation(segment);
        if (parsed.valid && (parsed.city || parsed.mode)) return segment;
    }
    return '';
}

async function resolveExtractedTitle(jd) {
    const raw = String(jd.rawTitle || jd.title || '').trim();
    const fallback = {
        value: raw,
        originalValue: raw,
        matchType: 'none',
        directoryId: null,
        confidence: 0,
        suggestion: null,
        apply: false
    };
    try {
        const resolved = await resolveTitleName(jd.title || raw);
        return { ...resolved, originalValue: raw || resolved.originalValue };
    } catch (error) {
        console.warn('[TitleDirectory] Resolution failed, keeping the extracted title:', error);
        return fallback;
    }
}

async function resolveExtractedLocation(jd) {
    const raw = String(jd.location || '').trim();
    const fallback = {
        value: raw,
        originalValue: raw,
        displayValue: raw,
        matchType: 'none',
        directoryId: null,
        confidence: 0,
        suggestion: null,
        apply: false
    };
    try {
        return await resolveLocationName(raw);
    } catch (error) {
        console.warn('[LocationDirectory] Resolution failed, keeping the extracted location:', error);
        return fallback;
    }
}

async function maybeAutoUpdateTitleDirectory() {
    try {
        await refreshGlobalTitleDirectory();
    } catch (error) {
        console.warn('[TitleDirectory] auto-update failed:', error);
    }
}

async function maybeAutoUpdateLocationDirectory() {
    try {
        await refreshGlobalLocationDirectory();
    } catch (error) {
        console.warn('[LocationDirectory] auto-update failed:', error);
    }
}

// --- Form filler (deterministic, saved answers only) ---

const FORM_FIELD_LIMIT = 30;

// The form filler runs as a declarative content script (see manifest.json), so
// every frame answers on its own. Broadcasts go out with chrome.tabs.sendMessage
// and each frame replies with its own runtime message; sendResponse would
// resolve on the first reply only.
const formCollectors = new Map();

function collectFormFrames(tabId, type, extra) {
    return new Promise((resolve) => {
        const requestId = `form_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const results = [];
        let settle = null;
        let first = null;
        let hard = null;
        const finish = () => {
            if (settle) clearTimeout(settle);
            if (first) clearTimeout(first);
            if (hard) clearTimeout(hard);
            settle = null;
            first = null;
            hard = null;
            formCollectors.delete(requestId);
            resolve(results);
        };
        // One frame answering clears the first-response deadline; the settle
        // window then waits for the remaining frames to report.
        const bump = () => {
            if (first) {
                clearTimeout(first);
                first = null;
            }
            if (settle) clearTimeout(settle);
            settle = setTimeout(finish, 250);
        };
        formCollectors.set(requestId, { tabId, results, bump, finish });
        hard = setTimeout(finish, 3000);
        try {
            chrome.tabs.sendMessage(tabId, { type, requestId, ...extra }, () => {
                void chrome.runtime.lastError;
            });
        } catch (error) {
            finish();
            return;
        }
        first = setTimeout(finish, 1200);
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reloads the tab and waits for the new document. Resolves false when the tab
// cannot be reloaded (a privileged URL) or when it does not finish in time.
function reloadTabAndWait(tabId, timeoutMs = 12000) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                chrome.tabs.onUpdated.removeListener(onUpdated);
            } catch (error) {
                // listener already gone
            }
            resolve(ok);
        };
        const onUpdated = (id, changeInfo) => {
            if (id !== tabId) return;
            if (changeInfo && changeInfo.status === 'complete') finish(true);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        try {
            chrome.tabs.onUpdated.addListener(onUpdated);
            chrome.tabs.reload(tabId, {}, () => {
                if (chrome.runtime.lastError) finish(false);
            });
        } catch (error) {
            finish(false);
        }
    });
}

async function fillApplicationForm(tabId, profile) {
    let detected = await collectFormFrames(tabId, 'FORM_DETECT', { limit: FORM_FIELD_LIMIT });
    let reloaded = false;
    if (!detected.length) {
        // No frame answered: the content script is not in that tab yet (the tab
        // was open before the extension loaded) or the page never settled.
        // Reload once and try again before giving up.
        reloaded = await reloadTabAndWait(tabId);
        if (reloaded) {
            await sleep(400);
            detected = await collectFormFrames(tabId, 'FORM_DETECT', { limit: FORM_FIELD_LIMIT });
        }
    }
    if (!detected.length) {
        return {
            status: 'error',
            reloaded,
            message: reloaded
                ? 'Could not reach the page even after reloading it. Open the application form and try again.'
                : 'Could not reach the page. Reload the tab and try again.'
        };
    }
    const fields = [];
    for (const entry of detected) {
        if (Array.isArray(entry.fields)) fields.push(...entry.fields);
    }
    if (!fields.length) {
        chrome.tabs.sendMessage(tabId, { type: 'FORM_TOAST', message: 'No application form found here. Open the Apply form on the page, then press Fill Form again.' }, () => {
            void chrome.runtime.lastError;
        });
        return { status: 'success', filled: 0, total: 0, cached: 0, unresolved: [], noFields: true, reloaded };
    }

    const { resolved, unresolved } = resolveFormAnswers(fields, profile);
    const answers = normalizeFormAnswers(resolved);

    const applied = await collectFormFrames(tabId, 'FORM_FILL', {
        answers,
        flagIds: unresolved.map((field) => field.id)
    });
    let filled = 0;
    for (const entry of applied) {
        filled += Number((entry && entry.filled) || 0);
    }

    const needYou = unresolved.length;
    const message = needYou
        ? `Filled ${filled} of ${fields.length} fields (${answers.length} from saved answers). ${needYou} ${needYou === 1 ? 'needs' : 'need'} you.`
        : `Filled ${filled} of ${fields.length} fields from your saved answers.`;
    chrome.tabs.sendMessage(tabId, { type: 'FORM_TOAST', message }, () => {
        void chrome.runtime.lastError;
    });
    console.log(`[FormFill] Filled ${filled} of ${fields.length} fields. (${answers.length} saved, ${needYou} need you)`);

    return {
        status: 'success',
        filled,
        total: fields.length,
        cached: answers.length,
        reloaded,
        unresolved: unresolved.slice(0, 12).map((field) => ({
            id: field.id,
            question: field.question || '',
            tag: field.tag || ''
        }))
    };
}

// Hands a stored PDF to the page's upload field. The drag path loses the
// bytes of a JS-built File on some Chrome builds, so the file is handed over
// through the frames instead.
async function attachFileToPage(tabId, request) {
    const applied = await collectFormFrames(tabId, 'ATTACH_FILE', {
        filename: String((request && request.filename) || 'document.pdf'),
        mime: 'application/pdf',
        dataUrl: String((request && request.dataUrl) || '')
    });
    let attached = 0;
    for (const entry of applied) {
        if (entry && entry.attached) attached++;
    }
    return { status: 'success', attached, frames: applied.length };
}

function buildCoverLetterPayload(template, resume, jobMeta) {
    if (!template || !String(template.body || '').trim()) return { status: 'no_template', data: null };
    const letter = buildCoverLetterFromTemplate(template, {
        applicantName: resume.name || '',
        applicantContact: resume.contact || '',
        company: jobMeta.company || '',
        role: jobMeta.title || '',
        recipientName: jobMeta.recruiterName || ''
    });
    if (!letter) return { status: 'empty', data: null };
    return { status: 'sent', data: JSON.stringify(letter) };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && (message.type === 'FORM_FRAME_DETECTED' || message.type === 'FORM_FRAME_FILLED' || message.type === 'ATTACH_FRAME_ATTACHED')) {
        const payload = message.payload;
        if (payload && payload.requestId) {
            const collector = formCollectors.get(payload.requestId);
            if (collector && sender && sender.tab && sender.tab.id === collector.tabId) {
                collector.results.push({ frameId: sender.frameId, ...payload });
                collector.bump();
            }
        }
        return false;
    }
    if (message && message.type === 'FRAME_SNAPSHOT_RESULT') {
        const payload = message.payload;
        if (payload && payload.requestId) {
            const collector = frameCollectors.get(payload.requestId);
            if (collector && sender && sender.tab && sender.tab.id === collector.tabId) {
                collector.frames.push({ frame: payload, frameId: sender.frameId || 0 });
                collector.bump();
            }
        }
        return false;
    }
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'GET_ACTIVE_PAGE') {
        (async () => {
            try {
                const payload = message.payload || {};
                const query = payload.windowId
                    ? { active: true, windowId: payload.windowId }
                    : { active: true, currentWindow: true };
                const tabs = await chrome.tabs.query(query);
                const tab = tabs && tabs[0];
                if (!tab || !tab.id) {
                    sendResponse({ status: 'error', message: 'No active tab' });
                    return;
                }
                const page = await getPageUrlForTab(tab.id, { inject: false });
                sendResponse({ status: 'success', tabId: tab.id, url: page.url, title: page.title });
            } catch (error) {
                console.warn('[ActivePage] failed:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();
        return true;
    }

    if (message.type === 'GENERATE' || message.type === 'OFFLINE_ALIGN') {
        (async () => {
            try {
                const payload = message.payload || {};
                const access = await getGenerationAccess();
                if (!access.allowed) {
                    sendResponse({ status: access.reason || 'signin_required', ...access });
                    return;
                }

                const settings = await chrome.storage.local.get(['resumes', 'userProfile', 'universalCoverLetter']);
                const entries = Array.isArray(settings.resumes) ? settings.resumes : [];
                const entry = entries.find((item) => item && item.id === payload.resumeId) || entries[0] || null;
                if (!entry) {
                    sendResponse({ status: 'needs_resume', message: 'Add your resume in Settings first.' });
                    return;
                }
                if (entry.parseReview && !entry.parseConfirmedAt) {
                    sendResponse({ status: 'review_required', message: 'Confirm your parsed resume in Settings first.' });
                    return;
                }

                const storedJson = typeof entry.jsonContent === 'string' ? entry.jsonContent.trim() : '';
                if (!storedJson) {
                    sendResponse({ status: 'needs_json', message: 'Build your resume in Settings first.' });
                    return;
                }
                const profile = parseJsonText(storedJson, 'Profile');
                if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
                    throw new Error('Could not read your saved resume.');
                }

                const tabId = payload.tabId;
                if (!tabId) throw new Error('Open the job posting tab first.');

                const resumeStyle = normalizeResumeStyle(payload.resumeStyle);
                const styleConfig = getResumeStyleConfig(resumeStyle);

                const tab = await chrome.tabs.get(tabId);
                const lexicon = await getSkillLexicon();
                const masterLocation = masterLocationForProfile(profile);
                const runAlign = async (page) => {
                    const jd = parseJobPosting({ title: page.title || tab.title, text: buildJobText(page), structured: page.structured });
                    const companyMeta = await resolveExtractedCompany(jd, page);
                    if (companyMeta.value) jd.company = companyMeta.value;
                    jd.companyMeta = companyMeta;

                    const titleMeta = await resolveExtractedTitle(jd);
                    if (titleMeta.apply && titleMeta.value) jd.title = titleMeta.value;
                    jd.titleMeta = {
                        ...titleMeta,
                        source: jd.titleSource || 'none',
                        extractionConfidence: Number(jd.titleConfidence) || 0,
                        candidates: (jd.titleCandidates || []).slice(0, 6)
                    };

                    const picked = pickPreferredLocation(jd.locationCandidates, masterLocation);
                    if (picked.value) jd.location = picked.value;
                    const locationMeta = await resolveExtractedLocation(jd);
                    if (locationMeta.apply && locationMeta.value) jd.location = locationMeta.value;
                    jd.locationMeta = {
                        ...locationMeta,
                        candidates: picked.candidates,
                        selectedReason: picked.reason,
                        selected: jd.location
                    };

                    const aligned = alignResumeJson(profile, jd, {
                        lexicon,
                        styleConfig,
                        generateSummary: !!payload.generateSummary,
                        allowUnverifiedSkills: true
                    });
                    return { jd, ...aligned };
                };

                let page = await getPageContentForTab(tabId);
                let aligned = await runAlign(page);
                for (let attempt = 0; attempt < 2 && !aligned.report.jdSkillCount; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    page = await getPageContentForTab(tabId, { skipCache: true });
                    const retried = await runAlign(page);
                    if (retried.report.jdSkillCount >= aligned.report.jdSkillCount) aligned = retried;
                }
                const { jd, resume, report } = aligned;
                console.log('[Align] pageChars:', String(page.jobText || '').length,
                    'descriptionChars:', String((page.structured && page.structured.description) || '').length,
                    'jdChars:', jd.text.length,
                    'jdFromJsonLd:', jd.text === String((page.structured && page.structured.description) || ''),
                    'jdSkills:', report.jdSkillCount,
                    'required:', report.requiredCount,
                    'masterSkills:', report.masterSkillCount,
                    'added:', report.skillsAdded,
                    'noEvidence:', report.skillsSkippedNoEvidence,
                    'skillsOut:', (resume.skills || []).length,
                    'score:', report.score);

                const jobMeta = buildJobMeta(jd, resume);
                let coverLetterData = null;
                let coverLetterStatus = 'disabled';
                const wantsCoverLetter = payload.output === 'cover-letter' || payload.output === 'both' || payload.includeCoverLetter === true;
                if (wantsCoverLetter) {
                    const letterTemplate = entry.coverLetter || settings.universalCoverLetter;
                    const letter = buildCoverLetterPayload(letterTemplate, resume, jobMeta);
                    coverLetterData = letter.data;
                    coverLetterStatus = letter.status;
                }

                sendResponse({
                    status: 'success',
                    data: JSON.stringify(resume),
                    coverLetterData,
                    coverLetterStatus,
                    report,
                    jobMeta,
                    pageUrl: page.url || '',
                    pageTitle: page.title || ''
                });
            } catch (error) {
                console.error('[Generate] Failed:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'BUILD_COVER_LETTER') {
        (async () => {
            try {
                const access = await getGenerationAccess();
                if (!access.allowed) {
                    sendResponse({ status: access.reason || 'signin_required', ...access });
                    return;
                }
                const payload = message.payload || {};
                const data = await chrome.storage.local.get(['universalCoverLetter', 'resumes']);
                const entries = Array.isArray(data.resumes) ? data.resumes : [];
                const entry = entries.find((item) => item && item.id === payload.resumeId) || entries[0] || null;
                const template = entry?.coverLetter || data.universalCoverLetter;
                if (!template || !String(template.body || '').trim()) {
                    sendResponse({ status: 'no_template', message: 'Add a cover letter in Settings first.' });
                    return;
                }
                let profile = null;
                if (entry && entry.jsonContent) {
                    try {
                        profile = JSON.parse(entry.jsonContent);
                    } catch {
                        profile = null;
                    }
                }
                const letter = buildCoverLetterPayload(template, {
                    name: payload.applicantName || profile?.name || '',
                    contact: payload.applicantContact || profile?.contact || ''
                }, {
                    company: payload.company || '',
                    title: payload.role || '',
                    recruiterName: payload.recipientName || ''
                });
                if (!letter.data) {
                    sendResponse({ status: letter.status, message: letter.status === 'empty' ? 'The cover letter is empty.' : 'Add a cover letter in Settings first.' });
                    return;
                }
                sendResponse({ status: 'success', data: letter.data });
            } catch (error) {
                console.error('[CoverLetter] Build failed:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'BUILD_AI_COVER_LETTER') {
        (async () => {
            try {
                const payload = message.payload || {};
                const data = await chrome.storage.local.get(['resumes']);
                const entries = Array.isArray(data.resumes) ? data.resumes : [];
                const entry = entries.find((item) => item && item.id === payload.resumeId) || entries[0] || null;
                if (!entry) {
                    sendResponse({ status: 'needs_resume', message: 'Add your resume in Settings first.' });
                    return;
                }
                const storedJson = typeof entry.jsonContent === 'string' ? entry.jsonContent.trim() : '';
                if (!storedJson) {
                    sendResponse({ status: 'needs_json', message: 'Build and save this resume first.' });
                    return;
                }

                const cooldownUntil = Number(entry.coverLetterCooldownUntil) || 0;
                const remaining = cooldownUntil - Date.now();
                if (remaining > 0) {
                    sendResponse({
                        status: 'rate_limited',
                        message: `Letter generation is cooling down. Try again in ${Math.ceil(remaining / 1000)}s.`,
                        retryAfterMs: remaining,
                        cooldownUntil
                    });
                    return;
                }

                const nextCooldownUntil = Date.now() + COVER_LETTER_COOLDOWN_MS;
                await setCoverLetterCooldown(entry.id, nextCooldownUntil);

                try {
                    const letter = await generateCoverLetterBody(storedJson);
                    sendResponse({ status: 'success', ...letter, cooldownUntil: nextCooldownUntil });
                } catch (error) {
                    const retryAfterMs = Number(error?.retryAfterMs) || 0;
                    if (retryAfterMs > 0) {
                        const extendedUntil = Date.now() + retryAfterMs;
                        await setCoverLetterCooldown(entry.id, extendedUntil);
                        sendResponse({
                            status: 'rate_limited',
                            message: error.message,
                            retryAfterMs,
                            cooldownUntil: extendedUntil
                        });
                        return;
                    }
                    sendResponse({ status: 'error', message: error.message, cooldownUntil: nextCooldownUntil });
                }
            } catch (error) {
                console.error('[CoverLetter] AI write failed:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'ENSURE_SKILL_LEXICON') {
        (async () => {
            await maybeAutoUpdateSkillLexicon();
            sendResponse({ status: 'success' });
        })();

        return true;
    }

    if (message.type === 'ENSURE_COMPANY_DIRECTORY') {
        (async () => {
            await maybeAutoUpdateCompanyDirectory();
            sendResponse({ status: 'success' });
        })();

        return true;
    }

    if (message.type === 'ENSURE_TITLE_DIRECTORY') {
        (async () => {
            await maybeAutoUpdateTitleDirectory();
            sendResponse({ status: 'success' });
        })();

        return true;
    }

    if (message.type === 'ENSURE_LOCATION_DIRECTORY') {
        (async () => {
            await maybeAutoUpdateLocationDirectory();
            sendResponse({ status: 'success' });
        })();

        return true;
    }

    if (message.type === 'CHECK_GENERATION_ACCESS') {
        (async () => {
            try {
                const access = await getGenerationAccess();
                sendResponse({ status: 'success', ...access });
            } catch (error) {
                sendResponse({ status: 'error', message: error.message, allowed: false });
            }
        })();

        return true;
    }

    if (message.type === 'CHECK_PRO_ACCESS') {
        (async () => {
            try {
                const access = await getGenerationAccess();
                sendResponse({ status: 'success', ...access, proAccess: access.allowed });
            } catch (error) {
                sendResponse({ status: 'error', message: error.message, allowed: false, proAccess: false });
            }
        })();

        return true;
    }

    if (message.type === 'FILL_APPLICATION_FORM') {
        (async () => {
            try {
                const access = await getGenerationAccess();
                if (!access.allowed) {
                    sendResponse({ status: access.reason || 'signin_required', ...access });
                    return;
                }
                const payload = message.payload || {};
                const tabId = payload.tabId;
                if (!tabId) throw new Error('Open the application form tab first.');

                const stored = await chrome.storage.local.get(['applicationProfile']);
                const profile = stored.applicationProfile || null;
                if (!profile || !String(profile.firstName || '').trim() || !String(profile.lastName || '').trim()) {
                    sendResponse({
                        status: 'profile_incomplete',
                        message: 'Answer the setup questions in Settings first.',
                        ...access
                    });
                    return;
                }

                const result = await fillApplicationForm(tabId, profile);
                sendResponse({ ...result, ...access });
            } catch (error) {
                console.error('[FormFill] Failed:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'GET_STORED_PDF') {
        (async () => {
            try {
                const payload = message.payload || {};
                const data = await chrome.storage.local.get('generatedPdfs');
                const store = data && data.generatedPdfs;
                const items = Array.isArray(store && store.items) ? store.items : [];
                const item = items.find((entry) => entry && entry.id === payload.itemId)
                    || (payload.filename
                        ? items.find((entry) => entry && entry.filename === payload.filename)
                        : null);
                if (!item || !item.dataUrl) {
                    sendResponse({ status: 'error', message: 'That file is no longer in the panel.' });
                    return;
                }
                sendResponse({
                    status: 'success',
                    filename: item.filename || 'document.pdf',
                    dataUrl: item.dataUrl
                });
            } catch (error) {
                console.warn('[Files] could not read the stored PDF:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'ATTACH_FILE_TO_PAGE') {
        (async () => {
            try {
                const payload = message.payload || {};
                const tabId = payload.tabId;
                if (!tabId) {
                    sendResponse({ status: 'error', message: 'Open the application form tab first.' });
                    return;
                }
                const result = await attachFileToPage(tabId, payload);
                if (!result.attached) {
                    sendResponse({
                        status: 'error',
                        message: 'No upload field found on this page. Open the Apply form and try again.'
                    });
                    return;
                }
                sendResponse(result);
            } catch (error) {
                console.error('[Attach] failed:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'CHECK_RESUME_HEALTH') {
        (async () => {
            try {
                const payload = message.payload || {};
                const jsonContent = payload.jsonContent || '';
                if (!jsonContent) {
                    sendResponse({ status: 'error', message: 'No resume data to check' });
                    return;
                }
                const report = await checkResumeHealth(jsonContent);
                sendResponse({ status: 'success', data: report });
            } catch (error) {
                sendResponse({ status: 'error', message: error.message || 'Health check failed' });
            }
        })();
        return true;
    }

    const unavailable = {
        START_GENERATION: 'ai_generation',
        EXTRACT_RESUME_JSON: 'extraction'
    };
    if (unavailable[message.type]) {
        sendResponse({
            status: 'unavailable',
            feature: unavailable[message.type],
            message: 'This feature is being rebuilt. Try again in a later update.'
        });
        return false;
    }

    return false;
});
