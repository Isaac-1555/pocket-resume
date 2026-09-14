// background.js
import './cloud-sync.js';
import { trackEvent } from './analytics.js';
import { resolveFormAnswers } from './form-profile.js';

// Auto-push local resume changes when user has enabled cloud sync and is signed in.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.resumes || !globalThis.CloudSync) return;
    const nextResumes = changes.resumes.newValue;
    if (!Array.isArray(nextResumes)) return;
    globalThis.CloudSync.init()
        .then(() => globalThis.CloudSync.onLocalResumesChanged(nextResumes))
        .catch((error) => console.error('[CloudSync] Auto-sync failed:', error));
});

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

// --- Provider Layer ---
const PROVIDER_DEFAULT_MODELS = {
    google: 'gemini-3.1-flash-lite',
    openai: 'gpt-5-nano',
    anthropic: 'claude-haiku-4-5',
    openrouter: 'nvidia/nemotron-3-super-120b-a12b:free'
};

const PROVIDER_SETTINGS_KEYS = [
    'apiProvider',
    'geminiApiKey', 'openrouterApiKey', 'openaiApiKey', 'anthropicApiKey',
    'googleModel', 'openaiModel', 'anthropicModel', 'openrouterModel',
    'customEndpoints', 'activeCustomEndpointId'
];

function normalizeBaseUrl(baseUrl) {
    return (baseUrl || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
}

function getProviderModel(settings, provider) {
    const override = (settings[`${provider}Model`] || '').trim();
    return override || PROVIDER_DEFAULT_MODELS[provider];
}

function getApiKeyForProvider(settings, provider) {
    if (provider === 'openrouter') return settings.openrouterApiKey;
    if (provider === 'openai') return settings.openaiApiKey;
    if (provider === 'anthropic') return settings.anthropicApiKey;
    if (provider === 'custom') return '';
    return settings.geminiApiKey;
}

function resolveCustomEndpoint(settings) {
    const endpoints = Array.isArray(settings.customEndpoints) ? settings.customEndpoints : [];
    if (!endpoints.length) return null;
    const activeId = settings.activeCustomEndpointId;
    return endpoints.find((endpoint) => endpoint && endpoint.id === activeId) || endpoints[0];
}

function validateProviderReady(settings, provider) {
    if (provider === 'custom') {
        const endpoint = resolveCustomEndpoint(settings);
        if (!endpoint || !normalizeBaseUrl(endpoint.baseUrl)) {
            throw new Error("Please configure a custom endpoint in the extension settings.");
        }
        return;
    }
    if (!(getApiKeyForProvider(settings, provider) || '').trim()) {
        throw new Error("Please set your API Key in the extension settings.");
    }
}

function createProviderContext(settings, apiKeyOverride = '') {
    const provider = settings.apiProvider || 'google';
    const storedKey = (getApiKeyForProvider(settings, provider) || '').trim();
    return {
        provider,
        settings,
        apiKey: (apiKeyOverride || '').trim() || storedKey
    };
}

async function parseResponseJsonBody(response) {
    const rawBody = await response.text();
    try {
        return JSON.parse(rawBody);
    } catch (error) {
        const snippet = rawBody.trim().slice(0, 200);
        throw new Error(snippet || `HTTP ${response.status} with a non-JSON response.`);
    }
}

const PROVIDER_MAX_ATTEMPTS = 3;

function isRetryableStatus(status) {
    return status === 408 || status === 429 || status >= 500;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(headerValue) {
    if (!headerValue) return 0;
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 0), 15000);
    const dateMs = Date.parse(headerValue);
    if (Number.isFinite(dateMs)) return Math.min(Math.max(dateMs - Date.now(), 0), 15000);
    return 0;
}

function parseExtraBody(raw, endpointName) {
    const text = (raw || '').trim();
    if (!text) return null;
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(`Extra body params for "${endpointName}" are not valid JSON.`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Extra body params for "${endpointName}" must be a JSON object.`);
    }
    for (const key of ['__proto__', 'constructor', 'prototype']) delete parsed[key];
    return parsed;
}

const GENERATION_MAX_ATTEMPTS = 3;
const GENERATION_RETRY_BACKOFF_MS = [2000, 5000];
const PAGE_CACHE_KEY = 'pendingGeneration';
const PAGE_CACHE_TTL_MS = 15 * 60 * 1000;

function isNonRetryableGenerationError(error) {
    const message = String((error && error.message) || '').toLowerCase();
    return (
        /\(http (401|403|404)\)/.test(message) ||
        message.includes('api key') ||
        message.includes('api_key') ||
        message.includes('invalid_api_key') ||
        message.includes('unauthorized') ||
        message.includes('authentication') ||
        message.includes('permission') ||
        message.includes('extension settings')
    );
}

function parseGenerationJson(rawText, contextLabel) {
    const cleaned = String(rawText || '').trim();
    if (!cleaned) throw new Error(`${contextLabel} returned an empty response.`);
    const parsed = parseJsonText(cleaned, contextLabel);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`${contextLabel} returned invalid JSON.`);
    }
    return parsed;
}

async function broadcastGenerationProgress(attempt, phase) {
    try {
        await chrome.runtime.sendMessage({
            type: 'GENERATION_PROGRESS',
            attempt,
            maxAttempts: GENERATION_MAX_ATTEMPTS,
            phase
        });
    } catch {
    }
}

async function getPageContentForTab(tabId) {
    const cached = (await chrome.storage.local.get(PAGE_CACHE_KEY))[PAGE_CACHE_KEY];
    const now = Date.now();
    if (
        cached &&
        cached.tabId === tabId &&
        typeof cached.jobText === 'string' &&
        cached.jobText.trim() &&
        now - (cached.savedAt || 0) < PAGE_CACHE_TTL_MS
    ) {
        return cached.jobText;
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

    const jobText = contentData.text || "No text found on page.";
    await chrome.storage.local.set({
        [PAGE_CACHE_KEY]: { tabId, jobText, savedAt: now }
    });
    return jobText;
}

async function fetchWithRetry(url, options = {}, contextLabel = '') {
    let lastError = null;

    for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt++) {
        if (attempt > 1 && lastError) {
            const backoffMs = Math.min(1000 * 2 ** (attempt - 2), 4000) + Math.random() * 500;
            await sleep(Math.max(backoffMs, lastError.retryAfterMs || 0));
        }

        try {
            const response = await fetch(url, options);
            if (!isRetryableStatus(response.status)) return response;
            lastError = new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
            lastError.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
            if (attempt === PROVIDER_MAX_ATTEMPTS) return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            lastError.retryAfterMs = 0;
            if (attempt === PROVIDER_MAX_ATTEMPTS) throw lastError;
        }
    }

    throw lastError || new Error('Request failed.');
}

async function executeProviderChat(context, prompt, contextLabel = '') {
    const { provider, settings, apiKey } = context;
    const errorSuffix = contextLabel ? ` (${contextLabel})` : '';

    if (provider === 'anthropic') {
        if (!apiKey) throw new Error("Please set your API Key in the extension settings.");

        const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerously-allow-browser': 'true'
            },
            body: JSON.stringify({
                model: getProviderModel(settings, 'anthropic'),
                max_tokens: 4096,
                messages: [{ role: "user", content: prompt }]
            })
        }, contextLabel);

        const data = await parseResponseJsonBody(response);

        if (!response.ok) {
            const errMsg = data.error?.message || data.error || JSON.stringify(data);
            throw new Error(`${errMsg || `Anthropic API Error${errorSuffix}`} (HTTP ${response.status})`);
        }

        const text = data.content?.[0]?.text;
        if (typeof text !== 'string') {
            throw new Error(`Anthropic API returned an unexpected response${errorSuffix}.`);
        }
        return text;
    }

    if (provider === 'google') {
        if (!apiKey) throw new Error("Please set your API Key in the extension settings.");

        const model = getProviderModel(settings, 'google');
        const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }, contextLabel);

        const data = await parseResponseJsonBody(response);

        if (!response.ok) {
            throw new Error(`${data.error?.message || `Gemini API Error${errorSuffix}`} (HTTP ${response.status})`);
        }

        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    let url, headers, requestBody;

    if (provider === 'openai' || provider === 'openrouter') {
        if (!apiKey) throw new Error("Please set your API Key in the extension settings.");

        url = provider === 'openai'
            ? 'https://api.openai.com/v1/chat/completions'
            : 'https://openrouter.ai/api/v1/chat/completions';
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        if (provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://pocket-resume.xyz';
            headers['X-Title'] = 'PocketResume';
        }
        requestBody = {
            model: getProviderModel(settings, provider),
            messages: [{ role: "user", content: prompt }]
        };
    } else if (provider === 'custom') {
        const endpoint = resolveCustomEndpoint(settings);
        const baseUrl = normalizeBaseUrl(endpoint?.baseUrl);
        if (!baseUrl) throw new Error("Please configure a custom endpoint in the extension settings.");

        const model = (endpoint.model || '').trim();
        if (!model) throw new Error("Please set a model for your custom endpoint in the extension settings.");

        url = `${baseUrl}/chat/completions`;
        headers = { 'Content-Type': 'application/json' };
        const endpointKey = (endpoint.apiKey || '').trim();
        if (endpointKey) headers['Authorization'] = `Bearer ${endpointKey}`;
        requestBody = {
            model,
            max_tokens: 16384,
            messages: [{ role: "user", content: prompt }]
        };
        const extraBody = parseExtraBody(endpoint.extraBody, endpoint.name || 'endpoint');
        if (extraBody) Object.assign(requestBody, extraBody);
    } else {
        throw new Error(`Unknown AI provider: ${provider}`);
    }

    const response = await fetchWithRetry(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
    }, contextLabel);

    const data = await parseResponseJsonBody(response);

    if (!response.ok) {
        let errMsg = data.error?.message || data.error || JSON.stringify(data);
        if (data.error?.metadata?.raw) {
            errMsg += " | Raw Provider Error: " + JSON.stringify(data.error.metadata.raw);
        }
        throw new Error(`${errMsg || `${provider} API Error${errorSuffix}`} (HTTP ${response.status})`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error(`${provider} API returned an unexpected response${errorSuffix}.`);
    }
    return content;
}

async function generateTailoredResume(context, userProfile, jobDescription, resumeStyle) {
    const styleConfig = getResumeStyleConfig(resumeStyle);
    const selectedLayout = styleConfig.layout;

    let styleGuide = "";
    if (styleConfig.promptStyle === "academic-cv") {
        styleGuide = "Use an academic CV style: emphasize research, publications, teaching, service, academic distinctions, and faithful chronology. Preserve factual detail without forcing everything into an industry-resume framing.";
    } else if (styleConfig.promptStyle === "faang") {
        styleGuide = "Use the 'FAANG' style: Single column, black and white, highly dense, focus on metrics/impact (X% improvement, Y$ saved), technical skills first, strict reverse chronological. No summary/objective unless specified. Use strong action verbs.";
    } else {
        styleGuide = "Use a 'Professional' style: Clean, balanced whitespace, professional summary at top, clear section headings, standard corporate formatting. Focus on leadership and clarity.";
    }



    let layoutGuide = "Use the current PocketResume layout structure: summary, skills, experience, featured projects, education, and certifications.";
    let documentTask = "Write a tailored, ONE-PAGE resume for this job description based on my profile.";
    let pageRule = "The final PDF will be rendered on a single US-Letter page. Keep bullet points concise so everything fits.";
    let bulletRule = "Each experience/project bullet point MUST be a single concise line (under ~120 characters). Use short impact statements: Action Verb + Result. Do NOT write multi-line bullet points.";

    if (selectedLayout === "deedy") {
        layoutGuide = "Use a Double Sided layout adapted for PocketResume: dense two-column industry resume. Prefer skills, links, open-source projects, and education for left-column-friendly content, and experience, selected projects, publications, and awards for right-column-friendly content.";
    } else if (selectedLayout === "academic-cv") {
        layoutGuide = "Use an academic CV layout adapted for PocketResume: multi-page is allowed, with education, research/work experience, research projects, publications, honors, teaching, and service only when those sections are supported by the source profile.";
        documentTask = "Write a tailored academic/research CV for this job description based on my profile.";
        pageRule = "The final PDF may span multiple pages when needed. Stay concise, but do not force the document onto one page.";
        bulletRule = "Use concise, impact-focused bullets when appropriate, but academic CV sections may also contain short descriptive detail lines where needed.";
    }

    let bulletFormatRule = "";
    let bulletTailoringRule = "Tailor bullet point wording to match JD keywords.";
    let bulletImpactRule = "Ensure bullet points are impactful (Action Verb + Context + Result) and concise unless the academic CV layout needs a short descriptive detail line.";
    let factRule = "Do not invent facts. Rephrase existing profile data to match JD keywords.";

    if (styleConfig.promptStyle === "professional") {
        bulletFormatRule = `BULLET FORMAT (CRITICAL — applies to every experience and project):
    - For EACH experience, write EXACTLY 2 bullet points:
      1. The problem the company had before I joined. If the target company faces a different problem (per the JOB DESCRIPTION), rewrite this to describe the problem the current company needs solved.
      2. How I solved that problem using my skills, prioritizing the skills mentioned in the JOB DESCRIPTION.
    - For EACH project, write EXACTLY 2 bullet points:
      1. The problem I was solving (rewrite it if needed to match the target company's needs).
      2. The tools from my skill set I used to fix that issue.
    - Do NOT add any other bullet points beyond these per entry. Bullets still follow the single-line rule above.`;
        bulletTailoringRule = "Bullets follow the BULLET FORMAT above; use JD keywords inside them.";
        bulletImpactRule = "Follow the BULLET FORMAT above exactly and keep every bullet concise.";
    } else if (styleConfig.promptStyle === "faang") {
        bulletFormatRule = `BULLET FORMAT (CRITICAL — applies to every experience AND every project). Write EXACTLY 3 bullet points per entry:
      1. The problem the company had before I joined, including a numerical value of how bad the situation was (e.g. % revenue lost, % error rate, hours wasted, users affected). If the master resume has no such number, add a realistic metric that fits the company's size and industry. If the current company faces a different problem (per the JOB DESCRIPTION), rewrite this to describe the problem the company needs solved.
      2. How I solved that problem using my skills, prioritizing the skills mentioned in the JOB DESCRIPTION.
      3. The measurable value the solution brought, with a concrete metric (e.g. +X% efficiency, Y hours saved/month, Z% revenue lift). If the master resume does not provide one, estimate a realistic number that fits the context.
    - Do NOT add any other bullet points beyond these. Bullets still follow the single-line rule above; keep numbers compact.`;
        bulletTailoringRule = "Bullets follow the BULLET FORMAT above; use JD keywords inside them.";
        bulletImpactRule = "Follow the BULLET FORMAT above exactly and keep every bullet concise.";
        factRule = "Do not invent facts. Rephrase existing profile data to match JD keywords. (Single exception: the metrics explicitly required by the BULLET FORMAT above may be estimated when the master resume lacks them.)";
    }

    const prompt = `
    You are an expert Resume/CV Writer and Data Extraction Tool.
    
    JOB DESCRIPTION (extracted text):
    ${jobDescription}

    MY PROFILE:
    ${userProfile}

    TASK:
    ${documentTask}
    ${styleGuide}
    ${layoutGuide}

    JOB-DRIVEN FIELD RULES (CRITICAL — these MUST come from the JD, NOT from my profile):
    1. "subtitle" → MUST be a fresh tagline based on the Job Title from the JOB DESCRIPTION. Example: if JD says "React Developer", subtitle becomes "React Developer". Do NOT copy my profile's existing subtitle/tagline.
    2. "position" → MUST be the role/title from the JOB DESCRIPTION. Do NOT use my profile's current position.
    3. "location" → MUST use the location from the JOB DESCRIPTION. Do NOT use my profile's location.
    4. "skills" → Start with ALL skills from my profile. Then ADD key JD-required skills that I have. Remove duplicates. Reorder so JD-relevant skills appear first.
    5. "contact" → Use ALL contact info from my profile (Phone, Email, LinkedIn, etc.), but replace the location with the JD location.

    CONTENT RULES (preserve all profile content):
    - ${pageRule}
    - Include ALL experiences from my profile. Do NOT drop any. ${bulletTailoringRule}
    - Include ALL projects from my profile. Do NOT drop any. ${bulletTailoringRule}
    - Include ALL education entries from my profile.
    - Include ALL certifications from my profile as a flat list.
    - Include ALL skills from my profile. Then add JD skills on top.
    - If the profile clearly includes links, honors/awards, publications, teaching, service, or academic distinctions, include them in the structured fields below.
    - ${bulletRule}
    - ${bulletFormatRule}
    - Professional summary: 2-3 sentences max unless the academic CV layout needs a slightly longer profile section.
    
    IMPORTANT:
    - Output strictly valid JSON.
    - Do NOT use Markdown code blocks (like \`\`\`json). Just output the raw JSON string.
    - If you must use code blocks, I will strip them, but prefer raw text.
    - Schema:
    {
      "name": "String (My Name)",
      "subtitle": "String (REQUIRED: derived from JD Job Title, NOT from profile)",
      "position": "String (REQUIRED: role/title from JD Job Title, NOT from profile)",
      "location": "String (REQUIRED: location from JD, NOT from profile)",
      "company": "String (Hiring company name from the JOB DESCRIPTION, NOT from profile. Use \"\" if unclear.)",
      "recruiterName": "String (Recruiter or hiring manager name from the JOB DESCRIPTION if explicitly present. Use \"\" if not present.)",
      "recruiterEmail": "String (Recruiter or hiring/HR contact email from the JOB DESCRIPTION if present. Use \"\" if not present.)",
      "contact": "String (Include ALL contact info from my profile: Phone, Email, LinkedIn, Portfolio/Website, Location (UPDATED to JD location), etc. — separated by | )",
      "summary": "String",
      "skills": ["String", "String"],
      "skillGroups": [
        { "label": "String", "items": ["String"] }
      ],
      "links": [
        { "label": "String", "text": "String", "url": "String" }
      ],
      "experience": [
        {
          "title": "String",
          "company": "String",
          "location": "String",
          "period": "String",
          "points": ["String"]
        }
      ],
      "projects": [
        {
          "title": "String",
          "platform": "String",
          "period": "String",
          "points": ["String"],
          "description": "String",
          "url": "String",
          "stars": "String",
          "venue": "String"
        }
      ],
      "openSourceProjects": [
        {
          "title": "String",
          "description": "String",
          "url": "String",
          "stars": "String",
          "venue": "String"
        }
      ],
      "education": [
        { "degree": "String", "school": "String", "year": "String", "location": "String", "details": ["String"] }
      ],
      "certifications": ["String"],
      "honors": [
        { "title": "String", "issuer": "String", "year": "String", "detail": "String" }
      ],
      "publicationsSummary": "String",
      "publications": [
        { "title": "String", "venue": "String", "year": "String", "authors": "String", "detail": "String", "citations": "String", "url": "String" }
      ],
      "researchInterests": ["String"],
      "teaching": [
        { "title": "String", "organization": "String", "period": "String", "details": ["String"] }
      ],
      "service": [
        { "title": "String", "organization": "String", "period": "String", "details": ["String"] }
      ]
    }
    - ${factRule}
    - IMPORTANT: If a specific field is NOT provided in the source profile, leave string fields as "" and array fields as []. Do NOT put "N/A", "Unknown", "Ongoing", or "Present".
    - ${bulletImpactRule}
  `;

    return executeProviderChat(context, prompt);
}

async function extractResumeProfileJson(context, sourceText) {
    const prompt = `
    You are an expert data extraction assistant.
    
    TASK:
    Extract all professional information from the provided raw resume text into a strict JSON schema. 
    This JSON will act as the master profile for future resume generation.
    
    RAW RESUME TEXT:
    ${sourceText}
    
    INSTRUCTIONS:
    - Extract Name, Job Title (subtitle/position), and Contact info (Location, Email, Phone, LinkedIn, GitHub, Portfolio).
    - Extract Summary, Skills, Experience, Projects, Education, and Certifications.
    - Preserve all factual details exactly as they appear. Do not invent metrics or facts.
    - Format contact into a single string separated by " | " if multiple are found.
    - For missing fields, leave them as empty strings "" or empty arrays []. Do not use "N/A" or "Unknown".
    
    OUTPUT SCHEMA:
    {
      "name": "String",
      "subtitle": "String (Current job title or professional tagline)",
      "contact": "String (Phone | Email | Location | Links)",
      "summary": "String",
      "skills": ["String"],
      "experience": [
        {
          "title": "String",
          "company": "String",
          "location": "String",
          "period": "String",
          "points": ["String"]
        }
      ],
      "projects": [
        {
          "title": "String",
          "platform": "String",
          "period": "String",
          "points": ["String"]
        }
      ],
      "education": [
        {
          "degree": "String",
          "school": "String",
          "year": "String",
          "location": "String"
        }
      ],
      "certifications": ["String"]
    }

    IMPORTANT:
    - Output strictly valid JSON.
    - Do NOT use Markdown code blocks (like \`\`\`json). Just output the raw JSON string.
  `;

    return executeProviderChat(context, prompt, 'Resume Extraction');
}

async function normalizeRefineAnswers(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const question = typeof item.question === 'string' ? item.question.trim() : '';
            if (!question) return null;
            const answer = typeof item.answer === 'string' ? item.answer.trim() : '';
            return {
                question,
                answer,
                skipped: item.skipped === true || !answer
            };
        })
        .filter(Boolean)
        .slice(0, 10);
}

function buildRefineAnswersPromptBlock(answers) {
    const normalized = normalizeRefineAnswers(answers);
    if (!normalized.length) return '';
    const lines = normalized.map((item) => {
        if (item.skipped) {
            return `- [UNANSWERED - AI MAY FILL] ${item.question}`;
        }
        return `- ${item.question}\n    USER'S ANSWER (verified fact): ${item.answer}`;
    });
    return `
    USER CONTEXT (answers provided by the resume owner):
    ${lines.join('\n')}
  `;
}

function buildAtsScoringRules() {
    return `
    ATS SCORING RULES:
    - Score 0-100 for ATS parser-readiness. 100 = a plain-text parser extracts every section, employer, title, date, contact field, and skill without confusion.
    - What hurts the score (each becomes a critical issue when severe):
      - Missing or inconsistent section headings (Experience, Education, Skills, ...).
      - Dates not machine-readable (no numeric month/year, ranges like "couple of years", inconsistent separators).
      - Contact line not parseable (no clear email/phone, name merged with other text, info inside paragraphs).
      - Dense paragraphs that hide employers, titles, or shipped work.
      - Table-like column layouts, markdown tables/bullets (*) decorated with === or ---, code fences, or non-text glyphs.
      - Sections ATS tools commonly need but are absent (Skills or Education) when they would not be inferable elsewhere.
    - criticalIssues: only problems a real ATS would flag, most impactful first (max 6). Empty array when none.
      - issue: what is wrong, in one sentence.
      - whyFlagged: why an ATS parser trips on it.
      - suggestedFix: the concrete edit that fixes it (AI-fixable formatting/wording only).
      - userMustFix: things only the resume owner can resolve (confirm a date, name a missing employer, explain a gap). Empty string when not applicable.
      - userMustFix items must be reported EVEN IF the score is 100.
  `;
}

function clampAtsScore(value) {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
    if (Number.isNaN(n)) return null;
    return Math.max(0, Math.min(100, n));
}

function normalizeAtsIssues(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const issue = typeof item.issue === 'string' ? item.issue.trim() : '';
            if (!issue) return null;
            const stage = ['before', 'after', 'both'].includes(item.stage) ? item.stage : 'both';
            return {
                stage,
                issue,
                whyFlagged: typeof item.whyFlagged === 'string' ? item.whyFlagged.trim() : '',
                suggestedFix: typeof item.suggestedFix === 'string' ? item.suggestedFix.trim() : '',
                userMustFix: typeof item.userMustFix === 'string' ? item.userMustFix.trim() : ''
            };
        })
        .filter(Boolean)
        .slice(0, 6);
}

function normalizeAtsBlock(value, fallbackBefore, fallbackAfter) {
    const before = clampAtsScore(value?.before) ?? fallbackBefore;
    const after = clampAtsScore(value?.after) ?? fallbackAfter;
    return {
        before,
        after,
        criticalIssues: normalizeAtsIssues(value?.criticalIssues)
    };
}

async function refineResumeSource(context, userProfile, answers = []) {
    const answersBlock = buildRefineAnswersPromptBlock(answers);
    const prompt = `
    You are a strict resume normalization assistant.

    SOURCE RESUME:
    ${userProfile}
  ${answersBlock}

    TASK:
    Rewrite the source into a single cross-style master resume that stays truthful and can be used to generate all supported PocketResume layouts.

    SUPPORTED OUTPUT FAMILIES:
    - PocketResume Professional / FAANG: needs reliable summary, skills, experience, projects, education, and certifications.
    - Double Sided: compact links/open-source/education on one side and dense experience/projects on the other.
    - Academic CV: preserve publications, research interests, teaching, service, honors, and chronology when present.

    NON-NEGOTIABLE RULES:
    - The source resume is the only authority. Do not invent, infer, or embellish missing facts.
    - USER CONTEXT answers are verified facts supplied by the resume owner. Treat them as having the same or higher authority than the source resume, and weave them into the relevant sections.
    - For questions the owner left unanswered: you may fill the gap yourself with brief, in-scope, conservative content inferred from the rest of the source (role level, industry, project scope). Never invent specific numbers, percentages, company names, client names, or titles. Keep the filler modest and plausible, and every such addition must be reported in the aiFilled list.
    - Preserve every supported fact from the source somewhere in the refined text: names, contact info, employers, titles, locations, dates, projects, publications, awards, degrees, certifications, skills, links, teaching, service, and research details.
    - Never add or guess metrics, dates, technologies, employers, titles, publications, awards, links, citations, star counts, or claims that are not explicitly supported by the source.
    - You may reorganize content into clearer sections, split dense paragraphs into bullets, normalize wording, and improve readability.
    - You may rewrite academic or publication-first language into clearer system/project/impact language ONLY when that wording is directly grounded in the source. If the source does not support a stronger claim, keep the conservative wording.
    - Do not tailor this to any job description. This is a reusable master resume source.
    - Use plain text with obvious section headings and bullets. No markdown tables. No code fences.
    - Keep formatting ATS-friendly and easy for downstream parsing.
    - If information is ambiguous, incomplete, or unverifiable, keep the wording conservative and include the issue in warnings instead of guessing.
  ${buildAtsScoringRules()}
    PREFERRED SECTION ORDER WHEN SUPPORTED BY THE SOURCE:
    Name / Contact
    Summary
    Skills
    Experience
    Projects
    Education
    Certifications
    Honors
    Publications
    Research Interests
    Teaching
    Service

    OUTPUT:
    Return strictly valid JSON with this schema:
    {
      "refinedText": "String - plain text only",
      "warnings": ["String"],
      "changeSummary": ["String"],
      "aiFilled": ["String"],
      "ats": {
        "before": Number,
        "after": Number,
        "criticalIssues": [{ "stage": "before|after|both", "issue": "String", "whyFlagged": "String", "suggestedFix": "String", "userMustFix": "String" }]
      }
    }

    OUTPUT REQUIREMENTS:
    - refinedText must be plain text only and must not be empty.
    - warnings should contain only real ambiguities or unverifiable gaps. Use [] when there are none.
    - changeSummary should contain 3-8 concise bullets describing the structural or editorial changes you made.
    - aiFilled must list one short entry per unanswered question you filled yourself, naming the gap that was filled. Use [] when none were filled.
    - ats.before scores SOURCE RESUME as-is; ats.after scores the refinedText you return. criticalIssues describe what remains wrong in either (stage before/after/both); issues fully resolved by your rewrite only appear with stage "before" or are omitted.
    - Return raw JSON only. Do not wrap it in markdown.
  `;

    const rawText = await executeProviderChat(context, prompt, 'Resume Refinement');
    const parsed = parseJsonText(rawText, 'Resume refinement response');
    const refinedText = typeof parsed.refinedText === 'string' ? parsed.refinedText.trim() : '';

    if (!refinedText) {
        throw new Error("Resume refinement returned empty content.");
    }

    let ats = { before: null, after: null, criticalIssues: [] };
    if (parsed.ats && typeof parsed.ats === 'object') {
        ats = normalizeAtsBlock(parsed.ats, null, null);
    }

    return {
        refinedText,
        warnings: normalizeStringArray(parsed.warnings),
        changeSummary: normalizeStringArray(parsed.changeSummary).slice(0, 8),
        aiFilled: normalizeStringArray(parsed.aiFilled).slice(0, 10),
        ats
    };
}

async function generateRefineQuestions(context, userProfile) {
    const prompt = `
    You are a resume interviewer preparing to rewrite a master resume.

    SOURCE RESUME:
    ${userProfile}

    TASK:
    Read the source and decide which missing pieces of context would most improve the rewrite, then return the questions to ask the resume owner.

    GOOD QUESTIONS (ask only about these kinds of gaps):
    - What problem did the company/team have before this person joined, and what changed?
    - Team size, leadership scope, or collaboration context for an experience entry.
    - Scale or prominence of a project (users, size of rollout, purpose).
    - What the person actually owned or was responsible for in a vague entry.
    - Motivation or significance of a project or role that is unclear.

    RULES:
    - Every question must be grounded in something concrete in the source (quote or reference the relevant entry, employer, or project in the question).
    - Never ask for facts the source already contains.
    - Never ask for specific metrics the person may not know. Prefer open context questions.
    - Ask at most 5 questions, ordered by impact. A complete resume should return no questions.
    - Each question must be answerable in one or two sentences by the resume owner.

    OUTPUT:
    Return strictly valid JSON with this schema:
    {
      "questions": [{ "id": "q1", "question": "String", "why": "String" }]
    }

    OUTPUT REQUIREMENTS:
    - question: the question text, self-contained and referencing the relevant resume entry.
    - why: one short sentence explaining how the answer will improve the resume.
    - Return raw JSON only. Do not wrap it in markdown.
  `;

    const rawText = await executeProviderChat(context, prompt, 'Refine Questions');
    const parsed = parseJsonText(rawText, 'Refine questions response');
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    return questions
        .map((item, index) => {
            if (!item || typeof item !== 'object') return null;
            const question = typeof item.question === 'string' ? item.question.trim() : '';
            if (!question) return null;
            return {
                id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `q${index + 1}`,
                question,
                why: typeof item.why === 'string' ? item.why.trim() : ''
            };
        })
        .filter(Boolean)
        .slice(0, 5);
}

async function generateAtsCheck(context, userProfile) {
    const prompt = `
    You are a strict ATS (Applicant Tracking System) readiness auditor.

    RESUME UNDER AUDIT:
    ${userProfile}

    TASK:
    Score how well an automated ATS parser would read this resume and list the concrete problems it would flag.

  ${buildAtsScoringRules()}

    OUTPUT:
    Return strictly valid JSON with this schema:
    {
      "score": Number,
      "criticalIssues": [{ "stage": "before", "issue": "String", "whyFlagged": "String", "suggestedFix": "String", "userMustFix": "String" }]
    }

    OUTPUT REQUIREMENTS:
    - score: the ATS parse-readiness of the resume as-is, 0-100.
    - criticalIssues: use stage "before" for every entry (single-document audit).
    - Return raw JSON only. Do not wrap it in markdown.
  `;

    const rawText = await executeProviderChat(context, prompt, 'ATS Check');
    const parsed = parseJsonText(rawText, 'ATS check response');
    const score = clampAtsScore(parsed.score) ?? 0;

    return {
        score,
        criticalIssues: normalizeAtsIssues(parsed.criticalIssues)
    };
}

function buildCoverLetterToneGuide(resumeStyle) {
    switch (normalizeResumeStyle(resumeStyle)) {
        case "faang":
            return {
                title: "FAANG RESULTS TONE",
                body: `
    TONE & STYLE (FAANG results letter):
    - Confident, direct, data-heavy tone. Engineers and recruiters at big tech read fast; every sentence must earn its place.
    - Use active voice and strong verbs: led, architected, shipped, cut, scaled, reduced.
    - No filler intensifiers ("very", "really", "extremely"). No buzzwords like "passionate", "team player", "results-driven".
    - Be precise with numbers: prefer exact figures ("42%") over ranges ("40-45%"); exact durations ("2 hours to 15 minutes") over vague ones.

    STRUCTURE - exactly two body content blocks plus the opening and closing paragraphs:
    1. OPENING PARAGRAPH (3-4 sentences): Why this company and this role specifically. Name the company. Reference something concrete from the job description or what the team works on, and connect it to what you have done. State in one sentence why your skills are a good fit for the role's problems. Do NOT start with "I am writing to apply for..." - lead with something specific.
    2. METRICS PARAGRAPH (main body_paragraphs[0]): Proof through numbers. Pick the STRONGEST quantified results from the TAILORED RESUME DATA and weave 2-4 of them into a cohesive narrative paragraph - not a bullet dump. Frame each metric as a real-world result: latency improvements, scale (users/requests served), uptime, cost savings, ship velocity, growth. Map the results to the type of problems this role will face at this company.
    3. CLOSING PARAGRAPH: One or two sentences tying your trajectory to their scale/challenges, then a direct forward-looking call to action (welcome a conversation, available at specific channels already in the contact info). Never end with a passive "I look forward to hearing from you".

    Integrating metrics from the tailored resume is REQUIRED for this style:
    - If TAILORED RESUME DATA contains quantified results, use those exact numbers - they are the ground truth.
    - Only fall back to the raw profile for metrics if the tailored data has none.
    - NEVER invent, estimate, or round up metrics that are not present in either source.
    - Prefer the tailored data over the raw profile when both contain a fact.`
            };
        case "academic-cv":
            return {
                title: "ACADEMIC / RESEARCH TONE",
                body: `
    TONE & STYLE (research internship / research-oriented role):
    - Scholarly-professional: measured, substantive, peer-to-peer. Not sales talk, not corporate fluff.
    - Show intellectual curiosity for the actual research area. Reference the team's work or research focus when the job description reveals it.
    - Ground claims in concrete detail: name methods, tools, lab techniques, coursework, publications, presentations, and collaborators from the profile. Specifics over superlatives.
    - Ban filler words: "very", "really", "genuinely". Do not claim to be "passionate" - demonstrate it through what you have studied and built.
    - Learner posture appropriate to internships and early-stage research roles: emphasize eagerness to learn the group's methods, ability to work both independently and as part of a research team, and readiness to take on defined tasks.
    - Close modestly but confidently: affirm fit and interest in contributing, without sales pressure.

    STRUCTURE - 4 paragraphs, each with a clear purpose:
    1. OPENING PARAGRAPH (3-4 sentences): State the role/position and a specific, honest reason for applying to this team or research area (drawn from the job description). One sentence on who you are (degree/program/stage if present in the profile) and why it is a fit.
    2. RESEARCH & METHODS PARAGRAPH (main body content): Your most relevant research experience from the profile - projects, lab work, publications, presentations. Describe what you actually did: methods used, tools/equipment, your specific contributions, outcomes or findings. Prove capability with detail rather than adjectives.
    3. RELEVANCE PARAGRAPH (supporting body content if used): Connect your preparation (skills, coursework, techniques) directly to the job description's stated research areas or duties. Address the 2-4 most important listed requirements, choosing the ones where your profile gives you real substance.
    4. CLOSING PARAGRAPH: Brief restatement of fit and enthusiasm for contributing, gratitude-free, with a professional call to action.`
            };
        default:
            return {
                title: "CORPORATE STORY TONE",
                body: `
    TONE & STYLE (story-driven corporate letter):
    - Write a cohesive story that SELLS the candidate to the recruiter. The letter must flow as one narrative arc, not a list of qualifications.
    - The resume attached to this letter already contains all projects and work history. DO NOT recite, summarize, or restate the resume. No paragraph may read like a resume in prose form.
    - Speak about skills and abilities ONLY through the lens of what they mean for this role and this company (e.g., what the candidate's strengths will do for the reader's team), never as a skills inventory.
    - Illuminate the "why": why this company, why this position, why now in the candidate's career. Make the reader believe the candidate chose them deliberately and will shine in the role.
    - Confident but human tone. Concrete and specific; avoid clichés ("team player", "hard-working", "detail-oriented") and filler intensifiers ("very", "really", "extremely").

    STRUCTURE - one continuous narrative:
    1. OPENING PARAGRAPH: Why the candidate picked this company and this position specifically. Reference the company and role by name, and ground the reason in specifics from the job description rather than generic admiration.
    2. SKILLS-TO-NEED PARAGRAPH (main body content): How the candidate's skills will help the company with the problems this role exists to solve. Choose the 1-2 requirements from the job description the candidate is best equipped for, and connect the candidate's abilities to them from the employer's perspective.
    3. SHINE PARAGRAPH (supporting body content if used): Why the candidate will excel and stand out in this specific position - working style, drive, and how those traits translate into impact for the team.
    4. CLOSING PARAGRAPH: Reiterate fit, express eagerness to discuss further, and include a professional call to action.

    PORTFOLIO WEBSITE EMPHASIS:
    - If the profile contains a portfolio / personal website / GitHub URL, mention it ONCE, partway through the letter, and frame it as an active invitation: encourage the recruiter to go see the work themselves (e.g., "the portfolio linked in this letter walks through" / "I invite you to explore the site linked in my signature").
    - Position it as proof instead of claims: it lets the reader verify talent rather than take the letter's word for it.`
            };
    }
}

async function generateCoverLetterText(context, userProfile, jobDescription, resumeStyle, tailoredResumeJson) {
    const tone = buildCoverLetterToneGuide(resumeStyle);
    const tailoredDataBlock = (tailoredResumeJson && normalizeResumeStyle(resumeStyle) === 'faang')
        ? `\n    TAILORED RESUME DATA (ground truth for metrics; use these numbers, do not contradict them):\n    ${tailoredResumeJson}\n`
        : '';

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `
    You are an expert Cover Letter Writer.

    LETTER STYLE: ${tone.title}

    TODAY'S DATE: ${today}

    MY PROFILE (resume source text):
    ${userProfile}
${tailoredDataBlock}
    JOB DESCRIPTION (extracted text):
    ${jobDescription}

    TASK:
    Write a professional cover letter for this specific job based on my profile.
${tone.body}

    SHARED CONSTRAINTS:
    - Target length: 250-350 words (3-4 short paragraphs).
    - Absolute maximum: 400 words.
    - The letter MUST fit on a single page. Do NOT write a multi-page letter.
    - Professional tone appropriate for business correspondence.
    - Do NOT invent facts, employers, titles, dates, or metrics. Use only information from the profile (and tailored resume data when provided).
    - Tailor the letter specifically to the job description. Reference the company and role.

    IMPORTANT:
    - Output strictly valid JSON.
    - Do NOT use Markdown code blocks (like \`\`\`json). Just output the raw JSON string.
    - If you must use code blocks, I will strip them, but prefer raw text.
    - Schema:
    {
      "applicant_name": "String (My full name)",
      "applicant_contact": "String (Phone | Email | Location)",
      "date": "String (Use TODAY'S DATE provided above, formatted as: Month Day, Year e.g. 'February 10, 2026')",
      "recipient_name": "String (Hiring manager name from JD if available, else 'Hiring Manager')",
      "recipient_title": "String (Hiring manager title from JD if available, else empty string)",
      "company_name": "String (Company name from JD)",
      "company_address": "String (Company address from JD if available, else empty string)",
      "job_title": "String (Position title being applied for)",
      "greeting": "String (e.g. 'Dear Hiring Manager,' or 'Dear Mr./Ms. LastName,')",
      "opening_paragraph": "String (First paragraph)",
      "body_paragraphs": ["String (main supporting paragraph(s))"],
      "closing_paragraph": "String (Final paragraph - call to action)",
      "sign_off": "String (e.g. 'Sincerely,')"
    }
    - IMPORTANT: If a specific field is NOT available from the job description or profile, leave it as an empty string "". Do NOT put "N/A", "Unknown", or placeholders.
  `;

    return executeProviderChat(context, prompt, 'Cover Letter');
}

// --- Form Filler Pipeline ---
const FORM_FIELD_LIMIT = 30;

async function ensureFormFillerInjected(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['form-filler.js']
    });
}

async function detectFormFields(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: (maxFields) => globalThis.__PocketResumeForm.detect(maxFields),
            args: [FORM_FIELD_LIMIT]
        });
        const fields = [];
        for (const frame of results || []) {
            if (frame && Array.isArray(frame.result)) fields.push(...frame.result);
        }
        return fields.slice(0, FORM_FIELD_LIMIT);
    } catch (error) {
        console.error('Form field detection failed:', error);
        return [];
    }
}

async function fillFormFields(tabId, answers) {
    const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (payload) => globalThis.__PocketResumeForm.fill(payload),
        args: [answers]
    });
    let filled = 0;
    let attempted = 0;
    for (const frame of results || []) {
        if (frame && frame.result) {
            filled += frame.result.filled || 0;
            attempted += frame.result.attempted || 0;
        }
    }
    return { filled, attempted };
}

async function showFormToast(tabId, text) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId, frameIds: [0] },
            func: (msg) => globalThis.__PocketResumeForm.toast(msg),
            args: [text]
        });
    } catch (error) {
        // Main frame may be gone or inaccessible; the popup still shows the result.
    }
}

function normalizeFormAnswers(parsed, fields) {
    const knownIds = new Set(fields.map((field) => field.id));
    const maxLengths = new Map(fields.map((field) => [field.id, field.maxLength]));
    let rawAnswers = [];
    if (Array.isArray(parsed)) {
        rawAnswers = parsed;
    } else if (parsed && Array.isArray(parsed.answers)) {
        rawAnswers = parsed.answers;
    } else if (parsed && typeof parsed === 'object') {
        rawAnswers = Object.entries(parsed).map(([id, answer]) => ({ id, answer }));
    }

    const answers = [];
    const seenIds = new Set();
    for (const item of rawAnswers) {
        const id = String(item?.id || '').trim();
        const answer = typeof item?.answer === 'string' ? item.answer.trim() : '';
        if (!id || !answer || !knownIds.has(id) || seenIds.has(id)) continue;
        seenIds.add(id);
        answers.push({ id, answer: truncateFormAnswer(answer, maxLengths.get(id)) });
    }
    return answers;
}

function truncateFormAnswer(answer, maxLength) {
    if (!maxLength || maxLength <= 0) return answer;
    return answer.length > maxLength ? answer.slice(0, maxLength) : answer;
}

async function generateFormAnswers(context, userProfile, fields, applicationProfile) {
    const fieldSummaries = fields.map((field) => ({
        id: field.id,
        question: field.question,
        type: field.type,
        options: field.options || undefined,
        maxLength: field.maxLength || undefined,
        required: field.required || undefined
    }));
    const savedProfile = applicationProfile && typeof applicationProfile === 'object'
        ? applicationProfile
        : null;

    const prompt = `
    You are helping a real person fill out a job application form. Below is their resume/profile and the form fields detected on the page.

    MY PROFILE (source of truth):
    ${userProfile}

    SAVED PROFILE (personal facts the person confirmed; authoritative when relevant):
    ${savedProfile ? JSON.stringify(savedProfile) : '(none)'}

    FORM FIELDS (JSON):
    ${JSON.stringify(fieldSummaries)}

    TASK:
    For each field, write the answer the person would type themselves.

    HOW TO WRITE (very important):
    - Write in first person, like the person typing it themselves right now.
    - Plain everyday words. Short sentences. Contractions are fine ("I've", "I'm").
    - NEVER use em dashes or en dashes. Use commas or periods instead.
    - No corporate buzzwords or AI-sounding words: never use "leverage", "passionate", "delve", "moreover", "furthermore", "spearheaded", "utilize", "seamless".
    - Short questions get 1-3 sentences. Essay questions get 2-5 sentences. Respect maxLength if given.
    - Use ONLY facts from the profile. Never invent employers, dates, numbers, skills, or achievements.
    - Open-ended questions (fit, motivation, AI usage, etc.): answer honestly using the person's actual skills and experience from the profile. Stay grounded in the profile.
    - If the profile has nothing usable for a field, return "" for that field.
    - For select or radio fields: return the exact option text from the provided options.
    - For yes/no questions: return "Yes" or "No".

    OUTPUT:
    - Output strictly valid JSON. No markdown fences, no commentary.
    - Schema: {"answers":[{"id":"<field id>","answer":"<string>"}]}
    - Include every field id exactly once.
  `;

    const rawText = await executeProviderChat(context, prompt, 'Form answers');
    const parsed = parseJsonText(rawText, 'Form answers');
    return normalizeFormAnswers(parsed, fields);
}

const APP_PROFILE_PROMPT_KEYS = [
    'firstName', 'lastName', 'email', 'phone',
    'streetAddress', 'addressLine2', 'city', 'state', 'postalCode', 'country',
    'salaryAmount', 'salaryCurrency', 'salaryPeriod', 'startDate', 'yearsExperience',
    'workAuthorized', 'needsSponsorship', 'over18', 'willingToRelocate', 'remotePreference',
    'linkedin', 'website', 'github'
];
const APP_PROFILE_PROMPT_EEO_KEYS = ['gender', 'race', 'hispanicLatino', 'veteran', 'disability'];

function normalizeApplicationProfile(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const profile = {};
    for (const key of APP_PROFILE_PROMPT_KEYS) {
        const value = source[key];
        if (key === 'salaryAmount' || key === 'yearsExperience') {
            const num = Number(value);
            profile[key] = Number.isFinite(num) ? num : null;
        } else {
            profile[key] = typeof value === 'string' ? value.trim() : '';
        }
    }
    const eeoSource = source.eeo && typeof source.eeo === 'object' ? source.eeo : {};
    profile.eeo = {};
    for (const key of APP_PROFILE_PROMPT_EEO_KEYS) {
        profile.eeo[key] = typeof eeoSource[key] === 'string' ? eeoSource[key].trim() : '';
    }
    return profile;
}

async function generateApplicationProfileFromResume(context, sourceText) {
    const prompt = `
    You are extracting structured personal data for job application forms from a person's resume.

    SOURCE (the only source of facts):
    ${sourceText}

    TASK:
    Extract the application profile fields below. Use ONLY facts present in the source.
    If a field is not clearly present in the source, return "" (empty string) for text fields and null for number fields. Never guess or invent.

    FIELD NOTES:
    - firstName / lastName: split the person's full name correctly.
    - salaryAmount: only if a number is stated (strip symbols, return a plain number). salaryCurrency: ISO code (default "USD" if a $ symbol is used). salaryPeriod: "year", "month", or "hour" (default "year").
    - workAuthorized / needsSponsorship / over18 / willingToRelocate: return "yes", "no", or "" only.
    - remotePreference: return "Remote", "Hybrid", "On-site", or "" only.
    - linkedin / website / github: full URLs when present, else "".
    - eeo.gender / eeo.race / eeo.hispanicLatino / eeo.veteran / eeo.disability: only if explicitly stated, else "". Use "Yes"/"No" for yes/no EEO fields.

    OUTPUT:
    - Output strictly valid JSON. No markdown fences, no commentary.
    - Schema: {"firstName":"","lastName":"","email":"","phone":"","streetAddress":"","addressLine2":"","city":"","state":"","postalCode":"","country":"","salaryAmount":null,"salaryCurrency":"","salaryPeriod":"","startDate":"","yearsExperience":null,"workAuthorized":"","needsSponsorship":"","over18":"","willingToRelocate":"","remotePreference":"","linkedin":"","website":"","github":"","eeo":{"gender":"","race":"","hispanicLatino":"","veteran":"","disability":""}}
  `;

    const rawText = await executeProviderChat(context, prompt, 'Application profile');
    const parsed = parseJsonText(rawText, 'Application profile');
    return normalizeApplicationProfile(parsed);
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRACK_EVENT') {
        const payload = message.payload || {};
        trackEvent(payload.name, payload.params || {}).catch(() => {});
        sendResponse({ status: 'ok' });
        return false;
    }

    if (message.type === 'START_GENERATION') {

        // Async execution wrapper
        (async () => {
            let provider = 'unknown';
            let selectedResumeStyle = 'unknown';
            try {
                const { tabId, resumeStyle, resumeType, resumeLayout, resumeId } = message.payload;
                const requestedResumeStyle =
                    resumeStyle ||
                    (resumeLayout === 'deedy' ? 'deedy' :
                        resumeLayout === 'academic-cv' ? 'academic-cv' :
                            resumeType);
                selectedResumeStyle = normalizeResumeStyle(requestedResumeStyle);

                // 1. Get Settings
                const settings = await chrome.storage.local.get(PROVIDER_SETTINGS_KEYS.concat(['resumes', 'userProfile', 'coverLetterEnabled']));
                provider = settings.apiProvider || 'google';
                validateProviderReady(settings, provider);
                const context = createProviderContext(settings);

                // Resolve the user profile content from the resumes array (or fallback to legacy userProfile)
                let userProfile = '';
                if (settings.resumes && settings.resumes.length > 0) {
                    // Find the selected resume by ID, or fall back to first resume
                    const selected = settings.resumes.find(r => r.id === resumeId) || settings.resumes[0];
                    userProfile = selected.jsonContent ? selected.jsonContent : (selected.content || '');
                } else if (settings.userProfile) {
                    // Legacy fallback
                    userProfile = settings.userProfile;
                }

                if (!userProfile.trim()) {
                    throw new Error("Please add your resume/profile content in the extension settings.");
                }

                // 2. Get Tab Info for Window ID
                const tab = await chrome.tabs.get(tabId);

                // 3. Get Content from Tab (reuses fresh cache; clears only on success)
                const jobText = await getPageContentForTab(tabId);

                // 4. Pipeline with retries (page content comes from cache on retries)
                let resumeText = null;
                let coverLetterText = null;
                let lastError = null;

                for (let attempt = 1; attempt <= GENERATION_MAX_ATTEMPTS; attempt++) {
                    try {
                        if (attempt > 1) {
                            await broadcastGenerationProgress(attempt, 'retrying');
                            await sleep(GENERATION_RETRY_BACKOFF_MS[Math.min(attempt - 2, GENERATION_RETRY_BACKOFF_MS.length - 1)]);
                        }

                        if (!resumeText) {
                            resumeText = await generateTailoredResume(context, userProfile, jobText, selectedResumeStyle);
                            if (!resumeText || !String(resumeText).trim()) {
                                resumeText = null;
                                throw new Error('The AI returned an empty resume. Please try again.');
                            }
                            parseGenerationJson(resumeText, 'Resume');
                        }

                        if (settings.coverLetterEnabled && !coverLetterText) {
                            coverLetterText = await generateCoverLetterText(context, userProfile, jobText, selectedResumeStyle, resumeText);
                            if (!coverLetterText || !String(coverLetterText).trim()) {
                                coverLetterText = null;
                                throw new Error('The AI returned an empty cover letter. Please try again.');
                            }
                            parseGenerationJson(coverLetterText, 'Cover Letter');
                        }

                        lastError = null;
                        break;
                    } catch (error) {
                        lastError = error;
                        if (attempt === GENERATION_MAX_ATTEMPTS || isNonRetryableGenerationError(error)) break;
                        console.warn(`[Generation] Attempt ${attempt} failed, retrying:`, error.message);
                    }
                }

                if (lastError) {
                    throw new Error(
                        `Generation failed after ${GENERATION_MAX_ATTEMPTS} attempts: ${lastError.message} ` +
                        `Consider switching to a different provider or model in the extension settings.`
                    );
                }

                // 5. Success - clear the page cache
                await chrome.storage.local.remove(PAGE_CACHE_KEY);
                console.info('[Tracker] Resume generation complete.');
                trackEvent('resume_generated', {
                    style: selectedResumeStyle,
                    layout: getResumeStyleConfig(selectedResumeStyle).layout,
                    provider,
                });
                if (coverLetterText) {
                    trackEvent('cover_letter_generated', { style: selectedResumeStyle, provider });
                }
                sendResponse({ status: 'success', data: resumeText, coverLetterData: coverLetterText });

            } catch (error) {
                console.error("Pipeline Error:", error);
                trackEvent('generation_error', {
                    provider,
                    style: selectedResumeStyle,
                    code: String((error && error.message) || 'unknown').slice(0, 40),
                });
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true; // Keep channel open
    }

    if (message.type === 'CHECK_ATS') {
        (async () => {
            try {
                const payload = message.payload || {};
                const settings = await chrome.storage.local.get(PROVIDER_SETTINGS_KEYS);
                const provider = settings.apiProvider || 'google';
                validateProviderReady(settings, provider);
                const context = createProviderContext(settings, typeof payload.apiKey === 'string' ? payload.apiKey : '');
                const sourceText = typeof payload.sourceText === 'string' ? payload.sourceText : '';

                if (!sourceText.trim()) {
                    throw new Error("Please add your resume/profile content before checking its ATS score.");
                }

                const result = await generateAtsCheck(context, sourceText);
                sendResponse({ status: 'success', data: result });
            } catch (error) {
                console.error("ATS Check Error:", error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'GET_REFINE_QUESTIONS') {
        (async () => {
            try {
                const payload = message.payload || {};
                const settings = await chrome.storage.local.get(PROVIDER_SETTINGS_KEYS);
                const provider = settings.apiProvider || 'google';
                validateProviderReady(settings, provider);
                const context = createProviderContext(settings, typeof payload.apiKey === 'string' ? payload.apiKey : '');
                const sourceText = typeof payload.sourceText === 'string' ? payload.sourceText : '';

                if (!sourceText.trim()) {
                    throw new Error("Please add your resume/profile content before refining it.");
                }

                const questions = await generateRefineQuestions(context, sourceText);
                sendResponse({ status: 'success', data: { questions } });
            } catch (error) {
                console.error("Refine Questions Error:", error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'REFINE_RESUME') {
        (async () => {
            try {
                const payload = message.payload || {};
                const settings = await chrome.storage.local.get(PROVIDER_SETTINGS_KEYS);
                const provider = settings.apiProvider || 'google';
                validateProviderReady(settings, provider);
                const context = createProviderContext(settings, typeof payload.apiKey === 'string' ? payload.apiKey : '');
                const sourceText = typeof payload.sourceText === 'string' ? payload.sourceText : '';

                if (!sourceText.trim()) {
                    throw new Error("Please add your resume/profile content before refining it.");
                }

                const refinement = await refineResumeSource(context, sourceText, payload.answers);
                sendResponse({ status: 'success', data: refinement });
            } catch (error) {
                console.error("Refinement Error:", error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'EXTRACT_RESUME_JSON') {
        (async () => {
            try {
                const payload = message.payload || {};
                const settings = await chrome.storage.local.get(PROVIDER_SETTINGS_KEYS);
                const provider = settings.apiProvider || 'google';
                validateProviderReady(settings, provider);
                const context = createProviderContext(settings, typeof payload.apiKey === 'string' ? payload.apiKey : '');
                const sourceText = typeof payload.sourceText === 'string' ? payload.sourceText : '';

                if (!sourceText.trim()) {
                    throw new Error("Please add your resume/profile content before extracting it.");
                }

                const extractedJson = await extractResumeProfileJson(context, sourceText);
                sendResponse({ status: 'success', data: extractedJson });
            } catch (error) {
                console.error("Extraction Error:", error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'PROFILE_AUTOFILL') {
        (async () => {
            let provider = 'unknown';
            try {
                const sourceText = typeof message.payload?.sourceText === 'string' ? message.payload.sourceText : '';
                if (!sourceText.trim()) {
                    throw new Error('Add your resume content in the extension settings first, then run Auto-fill.');
                }

                const settings = await chrome.storage.local.get(PROVIDER_SETTINGS_KEYS);
                provider = settings.apiProvider || 'google';
                validateProviderReady(settings, provider);
                const context = createProviderContext(settings);

                const profile = await generateApplicationProfileFromResume(context, sourceText);
                sendResponse({ status: 'success', data: profile });
            } catch (error) {
                console.error('Profile Autofill Error:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }

    if (message.type === 'FILL_APPLICATION_FORM') {
        const tabId = typeof message.payload?.tabId === 'number' ? message.payload.tabId : null;

        (async () => {
            let provider = 'unknown';
            try {
                if (!tabId) throw new Error('No active tab found. Open the page with the form and try again.');

                const settings = await chrome.storage.local.get(PROVIDER_SETTINGS_KEYS.concat(['resumes', 'userProfile', 'applicationProfile']));
                provider = settings.apiProvider || 'google';
                validateProviderReady(settings, provider);
                const context = createProviderContext(settings);
                const applicationProfile = settings.applicationProfile && typeof settings.applicationProfile === 'object'
                    ? settings.applicationProfile
                    : null;

                let userProfile = '';
                if (settings.resumes && settings.resumes.length > 0) {
                    const selected = settings.resumes.find(r => r.id === message.payload.resumeId) || settings.resumes[0];
                    userProfile = selected.jsonContent ? selected.jsonContent : (selected.content || '');
                } else if (settings.userProfile) {
                    userProfile = settings.userProfile;
                }
                if (!userProfile.trim()) {
                    throw new Error("Please add your resume/profile content in the extension settings.");
                }

                await ensureFormFillerInjected(tabId);
                const fields = await detectFormFields(tabId);
                if (!fields.length) {
                    throw new Error('No application form fields found on this page. Open the page with the form, then try again.');
                }

                const { resolved, unresolved } = resolveFormAnswers(fields, applicationProfile);
                let aiAnswers = [];
                if (unresolved.length) {
                    aiAnswers = await generateFormAnswers(context, userProfile, unresolved, applicationProfile);
                }

                const answers = normalizeFormAnswers({ answers: [...resolved, ...aiAnswers] }, fields);
                if (!answers.length) {
                    throw new Error('Your resume has no answers for this form. Add more detail to it in the extension settings.');
                }

                const { filled } = await fillFormFields(tabId, answers);
                if (!filled) {
                    throw new Error('Could not fill any fields on this form. Please fill it manually.');
                }

                console.info('[FormFill] Filled', filled, 'of', fields.length, 'fields.', `(${resolved.length} saved, ${aiAnswers.length} AI)`);
                trackEvent('form_filled', { provider, cached: String(resolved.length) });
                await showFormToast(tabId, `PocketResume filled ${filled} field${filled === 1 ? '' : 's'}${resolved.length ? ` (${resolved.length} from saved answers)` : ''}`);
                sendResponse({ status: 'success', filled, total: fields.length, cached: resolved.length });
            } catch (error) {
                console.error('Form Fill Error:', error);
                trackEvent('form_fill_error', {
                    provider,
                    code: String((error && error.message) || 'unknown').slice(0, 40),
                });
                if (tabId) await showFormToast(tabId, 'PocketResume could not fill this form');
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }
});

// --- Lifecycle Analytics ---
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        trackEvent('install').catch(() => {});
    }
});

chrome.runtime.onStartup.addListener(() => {
    trackEvent('active_day').catch(() => {});
});
