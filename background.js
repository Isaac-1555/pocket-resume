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
        return { jobText: cached.jobText, structured: cached.structured || {}, title: cached.title || '', url: cached.url || '' };
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
    const url = typeof contentData.url === 'string' ? contentData.url : '';
    await chrome.storage.local.set({
        [PAGE_CACHE_KEY]: { tabId, jobText, structured, title, url, savedAt: now }
    });
    return { jobText, structured, title, url };
}

async function getPageUrlForTab(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_URL' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.url) {
                chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                }, () => {
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

chrome.alarms.create(SKILL_LEXICON_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 3 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SKILL_LEXICON_ALARM) maybeAutoUpdateSkillLexicon();
});
chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.clear('skillLexiconWeekly');
    maybeAutoUpdateSkillLexicon();
    enableSidePanel();
});
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.clear('skillLexiconWeekly');
    maybeAutoUpdateSkillLexicon();
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
        recruiterEmail: jd.recruiterEmail || ''
    };
}

// --- Form filler (deterministic, saved answers only) ---

const FORM_FIELD_LIMIT = 30;

async function injectFormFiller(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['form-filler.js']
        });
        return true;
    } catch (error) {
        console.warn('[FormFill] Could not inject the form filler:', error);
        return false;
    }
}

async function runInFrames(tabId, func, args) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func,
            args: args || []
        });
        return (results || [])
            .map((entry) => entry && entry.result)
            .filter((value) => value !== undefined && value !== null);
    } catch (error) {
        console.warn('[FormFill] Frame script failed:', error);
        return [];
    }
}

async function toastInMainFrame(tabId, message) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId, frameIds: [0] },
            func: (text) => {
                const api = globalThis.__PocketResumeForm;
                if (api && typeof api.toast === 'function') api.toast(text);
            },
            args: [message]
        });
    } catch (error) {
        console.warn('[FormFill] Toast failed:', error);
    }
}

async function fillApplicationForm(tabId, profile) {
    const injected = await injectFormFiller(tabId);
    if (!injected) {
        return { status: 'error', message: 'Could not reach the page. Reload the tab and try again.' };
    }

    const detected = await runInFrames(tabId, (limit) => {
        const api = globalThis.__PocketResumeForm;
        if (!api || typeof api.detect !== 'function') return [];
        return api.detect(limit);
    }, [FORM_FIELD_LIMIT]);

    const fields = [];
    for (const group of detected) {
        if (Array.isArray(group)) fields.push(...group);
    }
    if (!fields.length) {
        await toastInMainFrame(tabId, 'No empty application fields found on this page.');
        return { status: 'success', filled: 0, total: 0, cached: 0, unresolved: [], noFields: true };
    }

    const { resolved, unresolved } = resolveFormAnswers(fields, profile);
    const answers = normalizeFormAnswers(resolved);

    const fillResults = await runInFrames(tabId, (list) => {
        const api = globalThis.__PocketResumeForm;
        if (!api || typeof api.fill !== 'function') return { attempted: 0, filled: 0 };
        return api.fill(list);
    }, [answers]);

    let filled = 0;
    for (const result of fillResults) {
        filled += Number((result && result.filled) || 0);
    }

    const unansweredIds = unresolved.map((field) => field.id);
    if (unansweredIds.length) {
        await runInFrames(tabId, (ids) => {
            const api = globalThis.__PocketResumeForm;
            if (!api || typeof api.flag !== 'function') return 0;
            return api.flag(ids);
        }, [unansweredIds]);
    }

    const needYou = unresolved.length;
    const message = needYou
        ? `Filled ${filled} of ${fields.length} fields (${answers.length} from saved answers). ${needYou} ${needYou === 1 ? 'needs' : 'need'} you.`
        : `Filled ${filled} of ${fields.length} fields from your saved answers.`;
    await toastInMainFrame(tabId, message);
    console.log(`[FormFill] Filled ${filled} of ${fields.length} fields. (${answers.length} saved, ${needYou} need you)`);

    return {
        status: 'success',
        filled,
        total: fields.length,
        cached: answers.length,
        unresolved: unresolved.slice(0, 12).map((field) => ({
            id: field.id,
            question: field.question || '',
            tag: field.tag || ''
        }))
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
                const page = await getPageUrlForTab(tab.id);
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
                const runAlign = (page) => {
                    const jd = parseJobPosting({ title: page.title || tab.title, text: buildJobText(page), structured: page.structured });
                    const aligned = alignResumeJson(profile, jd, {
                        lexicon,
                        styleConfig,
                        generateSummary: !!payload.generateSummary,
                        allowUnverifiedSkills: true
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
