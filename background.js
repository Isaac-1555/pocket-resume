// background.js
import './cloud-sync.js';
import { trackEvent } from './analytics.js';

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
        case "basic":
        case "jake":
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
    google: 'gemini-2.5-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
    openrouter: 'openai/gpt-oss-120b:free'
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
            headers['HTTP-Referer'] = 'https://pocketresume.app';
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
    - Include ALL experiences from my profile. Do NOT drop any. Tailor bullet point wording to match JD keywords.
    - Include ALL projects from my profile. Do NOT drop any. Tailor bullet point wording to match JD keywords.
    - Include ALL education entries from my profile.
    - Include ALL certifications from my profile as a flat list.
    - Include ALL skills from my profile. Then add JD skills on top.
    - If the profile clearly includes links, honors/awards, publications, teaching, service, or academic distinctions, include them in the structured fields below.
    - ${bulletRule}
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
    - Do not invent facts. Rephrase existing profile data to match JD keywords.
    - IMPORTANT: If a specific field is NOT provided in the source profile, leave string fields as "" and array fields as []. Do NOT put "N/A", "Unknown", "Ongoing", or "Present".
    - Ensure bullet points are impactful (Action Verb + Context + Result) and concise unless the academic CV layout needs a short descriptive detail line.
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

async function refineResumeSource(context, userProfile) {
    const prompt = `
    You are a strict resume normalization assistant.

    SOURCE RESUME:
    ${userProfile}

    TASK:
    Rewrite the source into a single cross-style master resume that stays truthful and can be used to generate all supported PocketResume layouts.

    SUPPORTED OUTPUT FAMILIES:
    - PocketResume Professional / FAANG: needs reliable summary, skills, experience, projects, education, and certifications.
    - Double Sided: compact links/open-source/education on one side and dense experience/projects on the other.
    - Academic CV: preserve publications, research interests, teaching, service, honors, and chronology when present.

    NON-NEGOTIABLE RULES:
    - The source resume is the only authority. Do not invent, infer, or embellish missing facts.
    - Preserve every supported fact from the source somewhere in the refined text: names, contact info, employers, titles, locations, dates, projects, publications, awards, degrees, certifications, skills, links, teaching, service, and research details.
    - Never add or guess metrics, dates, technologies, employers, titles, publications, awards, links, citations, star counts, or claims that are not explicitly supported by the source.
    - You may reorganize content into clearer sections, split dense paragraphs into bullets, normalize wording, and improve readability.
    - You may rewrite academic or publication-first language into clearer system/project/impact language ONLY when that wording is directly grounded in the source. If the source does not support a stronger claim, keep the conservative wording.
    - Do not tailor this to any job description. This is a reusable master resume source.
    - Use plain text with obvious section headings and bullets. No markdown tables. No code fences.
    - Keep formatting ATS-friendly and easy for downstream parsing.
    - If information is ambiguous, incomplete, or unverifiable, keep the wording conservative and include the issue in warnings instead of guessing.

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
      "changeSummary": ["String"]
    }

    OUTPUT REQUIREMENTS:
    - refinedText must be plain text only and must not be empty.
    - warnings should contain only real ambiguities or unverifiable gaps. Use [] when there are none.
    - changeSummary should contain 3-8 concise bullets describing the structural or editorial changes you made.
    - Return raw JSON only. Do not wrap it in markdown.
  `;

    const rawText = await executeProviderChat(context, prompt, 'Resume Refinement');
    const parsed = parseJsonText(rawText, 'Resume refinement response');
    const refinedText = typeof parsed.refinedText === 'string' ? parsed.refinedText.trim() : '';

    if (!refinedText) {
        throw new Error("Resume refinement returned empty content.");
    }

    return {
        refinedText,
        warnings: normalizeStringArray(parsed.warnings),
        changeSummary: normalizeStringArray(parsed.changeSummary).slice(0, 8)
    };
}

async function generateCoverLetterText(context, userProfile, jobDescription, resumeStyle) {
    const styleConfig = getResumeStyleConfig(resumeStyle);

    let toneGuide = "";
    if (styleConfig.promptStyle === "faang") {
        toneGuide = "Use a confident, results-driven tone. Emphasize measurable impact, technical depth, and scale of systems worked on.";
    } else if (styleConfig.promptStyle === "professional" || styleConfig.promptStyle === "academic-cv") {
        toneGuide = "Use a polished, corporate tone. Emphasize leadership, strategic thinking, and professional accomplishments.";
    } else {
        toneGuide = "Use a clear, approachable, and professional tone. Keep it straightforward and sincere.";
    }

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `
    You are an expert Cover Letter Writer.
    
    TODAY'S DATE: ${today}

    MY PROFILE:
    ${userProfile}

    JOB DESCRIPTION (extracted text):
    ${jobDescription}

    TASK:
    Write a professional cover letter for this specific job based on my profile.
    ${toneGuide}
    
    CONSTRAINTS:
    - Target length: 250-350 words (3-4 short paragraphs).
    - Absolute maximum: 400 words.
    - The letter MUST fit on a single page. Do NOT write a multi-page letter.
    - Professional, corporate tone appropriate for business correspondence.
    - Do NOT invent facts. Use only information from the provided profile.
    - Tailor the letter specifically to the job description. Reference the company and role.
    - Opening paragraph: Express enthusiasm for the specific role and company. Briefly state why you are a strong fit.
    - Body paragraphs (1-2): Highlight relevant experience, skills, and accomplishments that directly match the JD requirements. Use specific examples from the profile.
    - Closing paragraph: Reiterate interest, express eagerness to discuss further, and include a professional call to action.

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
      "opening_paragraph": "String (First paragraph - enthusiasm and fit)",
      "body_paragraphs": ["String (Supporting paragraph 1)", "String (Optional supporting paragraph 2)"],
      "closing_paragraph": "String (Final paragraph - call to action)",
      "sign_off": "String (e.g. 'Sincerely,')"
    }
    - IMPORTANT: If a specific field is NOT available from the job description or profile, leave it as an empty string "". Do NOT put "N/A", "Unknown", or placeholders.
  `;

    return executeProviderChat(context, prompt, 'Cover Letter');
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

                // 3. Get Content from Tab
                const contentData = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (response) => {
                        if (chrome.runtime.lastError) {
                            // Inject if missing
                            chrome.scripting.executeScript({
                                target: { tabId: tabId },
                                files: ['content.js']
                            }, () => {
                                chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (res) => {
                                    if (chrome.runtime.lastError) resolve({ text: "" }); // Fallback
                                    else resolve(res);
                                });
                            });
                        } else {
                            resolve(response);
                        }
                    });
                });

                // 4. Extract job text (content script already ran)
                const jobText = contentData.text || "No text found on page.";

                // 5. Call Pipeline - Resume
                const resumeText = await generateTailoredResume(context, userProfile, jobText, selectedResumeStyle);

                // 6. Conditionally generate cover letter
                let coverLetterText = null;
                if (settings.coverLetterEnabled) {
                    coverLetterText = await generateCoverLetterText(context, userProfile, jobText, selectedResumeStyle);
                }

                // 6b. Success
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

                const refinement = await refineResumeSource(context, sourceText);
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
