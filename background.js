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

// --- Pipeline Utilities ---
function normalizeResumeStyle(selectedStyle) {
    switch (selectedStyle) {
        case "deedy":
        case "academic-cv":
        case "professional":
        case "faang":
            return selectedStyle;
        default:
            return "professional";
    }
}

function getResumeStyleConfig(selectedStyle) {
    switch (normalizeResumeStyle(selectedStyle)) {
        case "deedy":
            return { promptStyle: "faang", layout: "deedy" };
        case "academic-cv":
            return { promptStyle: "academic-cv", layout: "academic-cv" };
        case "faang":
            return { promptStyle: "faang", layout: "pocketresume" };
        case "professional":
        default:
            return { promptStyle: "professional", layout: "pocketresume" };
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

async function getPageContentForTab(tabId, { skipCache = false } = {}) {
    const cached = (await chrome.storage.local.get(PAGE_CACHE_KEY))[PAGE_CACHE_KEY];
    const now = Date.now();
    if (
        !skipCache &&
        cached &&
        cached.tabId === tabId &&
        typeof cached.jobText === 'string' &&
        cached.jobText.trim() &&
        now - (cached.savedAt || 0) < PAGE_CACHE_TTL_MS
    ) {
        return { jobText: cached.jobText, structured: cached.structured || {}, title: cached.title || '' };
    }

    const contentData = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (response) => {
            if (chrome.runtime.lastError) {
                chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                }, () => {
                    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (res) => {
                        if (chrome.runtime.lastError) resolve({ text: "" });
                        else resolve(res);
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
    await chrome.storage.local.set({
        [PAGE_CACHE_KEY]: { tabId, jobText, structured, title, savedAt: now }
    });
    return { jobText, structured, title };
}

function buildJobText(page) {
    const body = String(page.jobText || '');
    const description = String(page.structured && page.structured.description ? page.structured.description : '');
    return mergePageText(body, description);
}

// --- Deterministic alignment (offline mode) ---
const SKILL_LEXICON_KEY = 'skillLexicon';
const SKILL_LEXICON_META_KEY = 'skillLexiconMeta';
const SKILL_LEXICON_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SKILL_LEXICON_ALARM = 'skillLexiconWeekly';

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

async function updateSkillLexicon() {
    let release = ONET_PINNED_RELEASE;
    try {
        const indexHtml = await fetchTextWithTimeout(`${ONET_ORIGIN}/database.html`, 20000);
        release = parseOnetRelease(indexHtml) || ONET_PINNED_RELEASE;
    } catch (error) {
        console.warn('[Align] Could not resolve the newest O*NET release, using the pinned one:', error.message);
    }
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
        const data = await chrome.storage.local.get([SKILL_LEXICON_META_KEY, 'skillLexiconAutoUpdate']);
        if (data.skillLexiconAutoUpdate === false) return;
        const meta = data[SKILL_LEXICON_META_KEY];
        const age = Date.now() - (meta?.fetchedAt || 0);
        if (meta && age < SKILL_LEXICON_MAX_AGE_MS) return;
        const permission = await chrome.permissions.contains({ origins: ['https://www.onetcenter.org/*'] });
        if (!permission) return;
        await updateSkillLexicon();
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

chrome.alarms.create(SKILL_LEXICON_ALARM, { periodInMinutes: 7 * 24 * 60, delayInMinutes: 3 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SKILL_LEXICON_ALARM) maybeAutoUpdateSkillLexicon();
});
chrome.runtime.onStartup.addListener(() => {
    maybeAutoUpdateSkillLexicon();
});
chrome.runtime.onInstalled.addListener(() => {
    maybeAutoUpdateSkillLexicon();
});
maybeAutoUpdateSkillLexicon();


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
        recruiterName: jd.recruiterName || ''
    };
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
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'GENERATE' || message.type === 'OFFLINE_ALIGN') {
        (async () => {
            try {
                const payload = message.payload || {};
                const access = await getGenerationAccess();
                if (!access.allowed) {
                    sendResponse({ status: access.reason || 'signin_required', ...access });
                    return;
                }

                const settings = await chrome.storage.local.get(['resumes', 'userProfile', 'universalCoverLetter', 'allowUnverifiedSkills']);
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
                const runAlign = (page) => {
                    const jd = parseJobPosting({ title: page.title || tab.title, text: buildJobText(page), structured: page.structured });
                    const aligned = alignResumeJson(profile, jd, {
                        lexicon,
                        styleConfig,
                        generateSummary: !!payload.generateSummary,
                        allowUnverifiedSkills: settings.allowUnverifiedSkills === true
                    });
                    return { jd, ...aligned };
                };

                let page = await getPageContentForTab(tabId);
                let aligned = runAlign(page);
                for (let attempt = 0; attempt < 2 && !aligned.report.jdSkillCount; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    page = await getPageContentForTab(tabId, { skipCache: true });
                    const retried = runAlign(page);
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
                    const letter = buildCoverLetterPayload(settings.universalCoverLetter, resume, jobMeta);
                    coverLetterData = letter.data;
                    coverLetterStatus = letter.status;
                }

                sendResponse({
                    status: 'success',
                    data: JSON.stringify(resume),
                    coverLetterData,
                    coverLetterStatus,
                    report,
                    jobMeta
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
                const template = data.universalCoverLetter;
                if (!template || !String(template.body || '').trim()) {
                    sendResponse({ status: 'no_template', message: 'Add a universal cover letter in Settings first.' });
                    return;
                }
                const entries = Array.isArray(data.resumes) ? data.resumes : [];
                const entry = entries.find((item) => item && item.id === payload.resumeId) || entries[0] || null;
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
                    sendResponse({ status: letter.status, message: letter.status === 'empty' ? 'The cover letter is empty.' : 'Add a universal cover letter in Settings first.' });
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

    if (message.type === 'UPDATE_SKILL_LEXICON') {
        (async () => {
            try {
                const granted = await chrome.permissions.contains({ origins: ['https://www.onetcenter.org/*'] });
                if (!granted) {
                    sendResponse({ status: 'permission_required' });
                    return;
                }
                const meta = await updateSkillLexicon();
                sendResponse({ status: 'success', meta });
            } catch (error) {
                console.error('Skill Lexicon Update Error:', error);
                const stored = await chrome.storage.local.get(SKILL_LEXICON_META_KEY);
                await chrome.storage.local.set({
                    [SKILL_LEXICON_META_KEY]: { ...(stored[SKILL_LEXICON_META_KEY] || {}), lastError: error.message || String(error) }
                });
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'GET_SKILL_LEXICON_STATUS') {
        (async () => {
            try {
                const [data, lexicon] = await Promise.all([
                    chrome.storage.local.get(SKILL_LEXICON_META_KEY),
                    getSkillLexicon()
                ]);
                sendResponse({
                    status: 'success',
                    meta: data[SKILL_LEXICON_META_KEY] || null,
                    count: lexicon.count || (lexicon.terms || []).length,
                    source: lexicon.source || '',
                    version: lexicon.version || ''
                });
            } catch (error) {
                sendResponse({ status: 'error', message: error.message });
            }
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

    const unavailable = {
        START_GENERATION: 'ai_generation',
        CHECK_ATS: 'ats_check',
        GET_REFINE_QUESTIONS: 'refine',
        REFINE_RESUME: 'refine',
        EXTRACT_RESUME_JSON: 'extraction',
        PROFILE_AUTOFILL: 'form_filler',
        FILL_APPLICATION_FORM: 'form_filler'
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
