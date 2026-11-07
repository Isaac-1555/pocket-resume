// General cover-letter body writer. Same provider chain as the resume health
// check: Pollinations first, local Ollama as the fallback. Only the redacted
// profile leaves the device, and only when the user clicks Generate letter.

import { buildProviders, redactProfile } from './resume-health.js';

const REQUEST_TIMEOUT_MS = 60000;
const MAX_LETTER_CHARS = 2400;

function buildCoverLetterBodyPrompt(profile) {
    return `Write the body of a general cover letter I can reuse for every job.

Rules:
- 120-160 words, three short paragraphs, first person, specific and concrete.
- Keep {{company}} and {{role}} exactly as written. Use both once in the opening paragraph.
- Do not include a greeting, date, sign-off, signature, subject line, or the applicant's name.
- No headings, no markdown, no bullet points. Plain text with a blank line between paragraphs.
- Never invent employers, metrics, dates, certifications, or credentials. Only use facts from the resume below.
- Do not mention a specific company name, product, or team.

Resume: ${JSON.stringify(profile)}`;
}

function sanitizeLetter(text) {
    let body = String(text || '')
        .replace(/^```[a-z]*\s*/i, '')
        .replace(/```\s*$/i, '')
        .replace(/\r/g, '')
        .trim();

    if (!body) return '';

    body = body.replace(/^(?:sure[^\n]*|here(?:'s| is)[^\n]*cover letter[^\n]*)\n+/i, '');

    const lines = body.split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length && /^dear\b/i.test(lines[0].trim())) lines.shift();

    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    const signOffLine = /^(sincerely|best regards|kind regards|regards|yours (?:truly|sincerely)|respectfully)[,.]?(?:\s+\S.*)?$/i;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 4); i--) {
        if (signOffLine.test(lines[i].trim())) {
            lines.splice(i);
            break;
        }
    }

    body = lines.join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();

    if (body.length > MAX_LETTER_CHARS) {
        body = body.slice(0, MAX_LETTER_CHARS).replace(/\s+\S*$/, '').trim();
    }

    return body;
}

async function requestProvider(provider, prompt, signal) {
    const body = {
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 700
    };
    if (provider.reasoning) {
        body.reasoning_effort = 'low';
    }

    const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
    });

    if (response.status === 402) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        throw new Error(Number.isFinite(retryAfter) && retryAfter > 0
            ? `${provider.label} is busy. Try again in ${Math.ceil(retryAfter)}s.`
            : `${provider.label} is busy. Try again in a minute.`);
    }
    if (response.status === 429) {
        throw new Error(`${provider.label} is rate limited.`);
    }
    if (!response.ok) {
        throw new Error(`${provider.label} returned ${response.status}.`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? data?.content ?? '';
    const letter = sanitizeLetter(typeof content === 'string' ? content : '');
    if (!letter) {
        throw new Error(`${provider.label} returned an unreadable letter.`);
    }
    return {
        body: letter,
        provider: provider.name,
        providerLabel: provider.label,
        model: provider.model
    };
}

async function generateCoverLetterBody(jsonContent, options = {}) {
    let profile;
    try {
        profile = JSON.parse(jsonContent || '{}');
    } catch {
        throw new Error('Invalid resume data. Save the resume form first.');
    }

    const providers = buildProviders(options);
    const prompt = buildCoverLetterBodyPrompt(redactProfile(profile));
    const failures = [];

    for (const provider of providers) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const combinedSignal = options.signal && typeof AbortSignal.any === 'function'
            ? AbortSignal.any([options.signal, controller.signal])
            : controller.signal;
        try {
            return await requestProvider(provider, prompt, combinedSignal);
        } catch (error) {
            if (error?.name === 'AbortError') {
                failures.push(`${provider.label} timed out`);
                continue;
            }
            if (error instanceof TypeError) {
                failures.push(`${provider.label} unreachable`);
                continue;
            }
            failures.push(error?.message || `${provider.label} failed`);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    throw new Error(providers.length > 1
        ? `Letter generation failed. ${failures.join(' · ')}`
        : failures[0] || 'Letter generation failed.');
}

export {
    MAX_LETTER_CHARS,
    buildCoverLetterBodyPrompt,
    sanitizeLetter,
    generateCoverLetterBody
};
