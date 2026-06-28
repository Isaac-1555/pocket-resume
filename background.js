// background.js
import './cloud-sync.js';

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

function parseJsonText(rawText, contextLabel) {
    const cleanedText = stripMarkdownCodeBlock(rawText);

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

async function callGemini(apiKey, userProfile, jobDescription, resumeStyle, provider = 'google') {
    let url, model;
    if (provider === 'openrouter') {
        model = "openai/gpt-oss-120b:free";
        url = `https://openrouter.ai/api/v1/chat/completions`;
    } else if (provider === 'openai') {
        model = "gpt-4o-mini";
        url = `https://api.openai.com/v1/chat/completions`;
    } else if (provider === 'anthropic') {
        model = "claude-3-5-haiku-20241022";
        url = `https://api.anthropic.com/v1/messages`;
    } else {
        model = "gemini-2.5-flash";
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    }
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

    const parts = [{ text: prompt }];

    let response, data;

    if (provider === 'openrouter' || provider === 'openai') {
        const requestBody = {
            model: model,
            messages: [{ role: "user", content: prompt }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://pocketresume.app',
                'X-Title': 'PocketResume'
            },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            let errMsg = data.error?.message || data.error || JSON.stringify(data);
            if (data.error?.metadata?.raw) {
                errMsg += " | Raw Provider Error: " + JSON.stringify(data.error.metadata.raw);
            }
            throw new Error(errMsg || `${provider} API Error`);
        }

        return data.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const requestBody = {
            model: model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerously-allow-browser': 'true'
            },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            let errMsg = data.error?.message || data.error || JSON.stringify(data);
            throw new Error(errMsg || "Anthropic API Error");
        }

        return data.content[0].text;
    } else {
        const requestBody = {
            contents: [{ parts: parts }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Gemini API Error");
        }

        return data.candidates[0].content.parts[0].text;
    }
}

async function callGeminiResumeExtraction(apiKey, sourceText, provider = 'google') {
    let url, model;
    if (provider === 'openrouter') {
        model = "openai/gpt-oss-120b:free";
        url = `https://openrouter.ai/api/v1/chat/completions`;
    } else if (provider === 'openai') {
        model = "gpt-4o-mini";
        url = `https://api.openai.com/v1/chat/completions`;
    } else if (provider === 'anthropic') {
        model = "claude-3-5-haiku-20241022";
        url = `https://api.anthropic.com/v1/messages`;
    } else {
        model = "gemini-2.5-flash";
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    }

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

    let response, data, rawText;

    if (provider === 'openrouter' || provider === 'openai') {
        const requestBody = {
            model: model,
            messages: [{ role: "user", content: prompt }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://pocketresume.app',
                'X-Title': 'PocketResume'
            },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            let errMsg = data.error?.message || data.error || JSON.stringify(data);
            if (data.error?.metadata?.raw) {
                errMsg += " | Raw Provider Error: " + JSON.stringify(data.error.metadata.raw);
            }
            throw new Error(errMsg || `${provider} API Error (Resume Extraction)`);
        }

        rawText = data.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const requestBody = {
            model: model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerously-allow-browser': 'true'
            },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            let errMsg = data.error?.message || data.error || JSON.stringify(data);
            throw new Error(errMsg || "Anthropic API Error (Resume Extraction)");
        }

        rawText = data.content[0].text;
    } else {
        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Gemini API Error (Resume Extraction)");
        }

        rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return rawText;
}

async function callGeminiResumeRefinement(apiKey, userProfile, provider = 'google') {
    let url, model;
    if (provider === 'openrouter') {
        model = "openai/gpt-oss-120b:free";
        url = `https://openrouter.ai/api/v1/chat/completions`;
    } else if (provider === 'openai') {
        model = "gpt-4o-mini";
        url = `https://api.openai.com/v1/chat/completions`;
    } else if (provider === 'anthropic') {
        model = "claude-3-5-haiku-20241022";
        url = `https://api.anthropic.com/v1/messages`;
    } else {
        model = "gemini-2.5-flash";
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    }

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

    let response, data, rawText;

    if (provider === 'openrouter' || provider === 'openai') {
        const requestBody = {
            model: model,
            messages: [{ role: "user", content: prompt }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://pocketresume.app',
                'X-Title': 'PocketResume'
            },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            let errMsg = data.error?.message || data.error || JSON.stringify(data);
            if (data.error?.metadata?.raw) {
                errMsg += " | Raw Provider Error: " + JSON.stringify(data.error.metadata.raw);
            }
            throw new Error(errMsg || `${provider} API Error (Resume Refinement)`);
        }

        rawText = data.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const requestBody = {
            model: model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerously-allow-browser': 'true'
            },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            let errMsg = data.error?.message || data.error || JSON.stringify(data);
            throw new Error(errMsg || "Anthropic API Error (Resume Refinement)");
        }

        rawText = data.content[0].text;
    } else {
        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Gemini API Error (Resume Refinement)");
        }

        rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
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

async function callGeminiCoverLetter(apiKey, userProfile, jobDescription, resumeStyle, provider = 'google') {
    let url, model;
    if (provider === 'openrouter') {
        model = "openai/gpt-oss-120b:free";
        url = `https://openrouter.ai/api/v1/chat/completions`;
    } else if (provider === 'openai') {
        model = "gpt-4o-mini";
        url = `https://api.openai.com/v1/chat/completions`;
    } else if (provider === 'anthropic') {
        model = "claude-3-5-haiku-20241022";
        url = `https://api.anthropic.com/v1/messages`;
    } else {
        model = "gemini-2.5-flash";
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    }
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

    const parts = [{ text: prompt }];

    if (provider === 'openrouter' || provider === 'openai') {
        const requestBody = {
            model: model,
            messages: [{ role: "user", content: prompt }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://pocketresume.app',
                'X-Title': 'PocketResume'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            let errMsg = data.error?.message || data.error || JSON.stringify(data);
            if (data.error?.metadata?.raw) {
                errMsg += " | Raw Provider Error: " + JSON.stringify(data.error.metadata.raw);
            }
            throw new Error(errMsg || `${provider} API Error (Cover Letter)`);
        }

        return data.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const requestBody = {
            model: model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerously-allow-browser': 'true'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            let errMsg = data.error?.message || data.error || JSON.stringify(data);
            throw new Error(errMsg || "Anthropic API Error (Cover Letter)");
        }

        return data.content[0].text;
    } else {
        const requestBody = {
            contents: [{ parts: parts }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Gemini API Error (Cover Letter)");
        }

        return data.candidates[0].content.parts[0].text;
    }
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_GENERATION') {

        // Async execution wrapper
        (async () => {
            try {
                const { tabId, resumeStyle, resumeType, resumeLayout, resumeId } = message.payload;
                const requestedResumeStyle =
                    resumeStyle ||
                    (resumeLayout === 'deedy' ? 'deedy' :
                        resumeLayout === 'academic-cv' ? 'academic-cv' :
                            resumeType);
                const selectedResumeStyle = normalizeResumeStyle(requestedResumeStyle);

                // 1. Get Settings
                const settings = await chrome.storage.local.get(['apiProvider', 'geminiApiKey', 'openrouterApiKey', 'openaiApiKey', 'anthropicApiKey', 'resumes', 'userProfile', 'coverLetterEnabled']);
                const provider = settings.apiProvider || 'google';

                let apiKey;
                if (provider === 'openrouter') apiKey = settings.openrouterApiKey;
                else if (provider === 'openai') apiKey = settings.openaiApiKey;
                else if (provider === 'anthropic') apiKey = settings.anthropicApiKey;
                else apiKey = settings.geminiApiKey;

                if (!apiKey) {
                    throw new Error("Please set your API Key in the extension settings.");
                }

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

                // 5. Call Pipeline (Gemini) - Resume
                const resumeText = await callGemini(
                    apiKey,
                    userProfile,
                    jobText,
                    selectedResumeStyle,
                    provider
                );

                // 6. Conditionally generate cover letter
                let coverLetterText = null;
                if (settings.coverLetterEnabled) {
                    coverLetterText = await callGeminiCoverLetter(
                        apiKey,
                        userProfile,
                        jobText,
                        selectedResumeStyle,
                        provider
                    );
                }

                // 7. Success
                sendResponse({ status: 'success', data: resumeText, coverLetterData: coverLetterText });

            } catch (error) {
                console.error("Pipeline Error:", error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true; // Keep channel open
    }

    if (message.type === 'REFINE_RESUME') {
        (async () => {
            try {
                const payload = message.payload || {};
                const settings = await chrome.storage.local.get(['apiProvider', 'geminiApiKey', 'openrouterApiKey', 'openaiApiKey', 'anthropicApiKey']);
                const provider = settings.apiProvider || 'google';
                let storedApiKey;
                if (provider === 'openrouter') storedApiKey = settings.openrouterApiKey;
                else if (provider === 'openai') storedApiKey = settings.openaiApiKey;
                else if (provider === 'anthropic') storedApiKey = settings.anthropicApiKey;
                else storedApiKey = settings.geminiApiKey;

                const apiKey = (typeof payload.apiKey === 'string' && payload.apiKey.trim())
                    ? payload.apiKey.trim()
                    : (storedApiKey || '').trim();
                const sourceText = typeof payload.sourceText === 'string' ? payload.sourceText : '';

                if (!apiKey) {
                    throw new Error("Please set your API Key in the extension settings.");
                }

                if (!sourceText.trim()) {
                    throw new Error("Please add your resume/profile content before refining it.");
                }

                const refinement = await callGeminiResumeRefinement(apiKey, sourceText, provider);
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
                const settings = await chrome.storage.local.get(['apiProvider', 'geminiApiKey', 'openrouterApiKey', 'openaiApiKey', 'anthropicApiKey']);
                const provider = settings.apiProvider || 'google';
                let storedApiKey;
                if (provider === 'openrouter') storedApiKey = settings.openrouterApiKey;
                else if (provider === 'openai') storedApiKey = settings.openaiApiKey;
                else if (provider === 'anthropic') storedApiKey = settings.anthropicApiKey;
                else storedApiKey = settings.geminiApiKey;

                const apiKey = (typeof payload.apiKey === 'string' && payload.apiKey.trim())
                    ? payload.apiKey.trim()
                    : (storedApiKey || '').trim();
                const sourceText = typeof payload.sourceText === 'string' ? payload.sourceText : '';

                if (!apiKey) {
                    throw new Error("Please set your API Key in the extension settings.");
                }

                if (!sourceText.trim()) {
                    throw new Error("Please add your resume/profile content before extracting it.");
                }

                const extractedJson = await callGeminiResumeExtraction(apiKey, sourceText, provider);
                sendResponse({ status: 'success', data: extractedJson });
            } catch (error) {
                console.error("Extraction Error:", error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();

        return true;
    }
});
