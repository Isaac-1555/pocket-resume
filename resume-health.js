// Resume health check: rule-based resume audit through pollinations.ai.
// Only redacted profile data leaves the device, and only when the user opts in.

const HEALTH_RULE_CATALOG = [
  { rule: 'action_verbs', label: 'Experience bullets start with strong action verbs', severity: 'critical' },
  { rule: 'quantification', label: 'Bullets include measurable impact', severity: 'critical' },
  { rule: 'bullet_length', label: 'Bullets are concise', severity: 'warning' },
  { rule: 'no_first_person', label: 'No first-person pronouns', severity: 'critical' },
  { rule: 'tense_consistency', label: 'Tense matches role timeline', severity: 'warning' },
  { rule: 'summary_quality', label: 'Summary is focused and relevant', severity: 'warning' },
  { rule: 'skills_present', label: 'Skills section exists and is populated', severity: 'critical' },
  { rule: 'contact_complete', label: 'Contact information complete', severity: 'critical' },
  { rule: 'links_present', label: 'Professional links present', severity: 'suggestion' },
  { rule: 'education_present', label: 'Education listed', severity: 'critical' },
  { rule: 'certifications', label: 'Relevant certifications noted', severity: 'suggestion' },
  { rule: 'no_filler', label: 'No filler phrases or duplication', severity: 'warning' }
];

const MAX_ISSUES = 12;
const REQUEST_TIMEOUT_MS = 60000;
const POLLINATIONS_ENDPOINT = 'https://text.pollinations.ai/openai';
const POLLINATIONS_MODEL = 'openai';
const OLLAMA_ENDPOINT = 'http://localhost:11434/v1/chat/completions';
const DEFAULT_OLLAMA_MODEL = 'llama3.2';
const SCORE_WEIGHTS = { critical: 8, warning: 5, suggestion: 3 };

function buildProviders({ ollamaFallback = true, ollamaModel = DEFAULT_OLLAMA_MODEL } = {}) {
  const providers = [{
    name: 'pollinations',
    label: 'Pollinations',
    endpoint: POLLINATIONS_ENDPOINT,
    model: POLLINATIONS_MODEL,
    reasoning: true
  }];
  if (ollamaFallback) {
    providers.push({
      name: 'ollama',
      label: 'local Ollama',
      endpoint: OLLAMA_ENDPOINT,
      model: (ollamaModel || DEFAULT_OLLAMA_MODEL).trim() || DEFAULT_OLLAMA_MODEL,
      reasoning: false
    });
  }
  return providers;
}


function redactLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.map((link) => {
    if (!link) return link;
    try {
      const url = new URL(link);
      return `${url.protocol}//${url.host}/[REDACTED]`;
    } catch {
      return '[LINK_REDACTED]';
    }
  });
}

function redactProfile(profile) {
  if (!profile || typeof profile !== 'object') return {};
  const copy = JSON.parse(JSON.stringify(profile));
  const blank = { name: '[REDACTED]', email: '[REDACTED]', phone: '[REDACTED]', location: '[REDACTED]' };

  copy.name = '[REDACTED]';
  copy.email = '[REDACTED]';
  copy.phone = '[REDACTED]';
  copy.location = '[REDACTED]';
  copy.links = redactLinks(copy.links);

  if (copy.contact && typeof copy.contact === 'object') {
    copy.contact = { ...copy.contact, ...blank, links: redactLinks(copy.contact.links) };
  }
  if (copy.header && typeof copy.header === 'object') {
    copy.header = { ...copy.header, ...blank, links: redactLinks(copy.header.links) };
  }
  return copy;
}

function buildHealthCheckPrompt(redactedProfile) {
  const rules = HEALTH_RULE_CATALOG.map((item) => `${item.rule}: ${item.label}`).join('; ');
  return `Audit this resume against these rules: ${rules}.
Reply with strict JSON only, no markdown:
{"score":0-100,"summary":"<=120 chars","issues":[{"item":"where","severity":"critical|warning|suggestion","problem":"<=120 chars","fix":"<=120 chars"}]}
Rules for your reply:
- At most ${MAX_ISSUES} issues, most important first.
- "item" names the exact place (for example "experience[0].points[1]", "summary", "skills").
- "problem" states what is wrong, "fix" states the concrete edit the user should make.
- Never invent facts, numbers, employers, or dates.
- Skip rules that pass. Do not repeat the same issue.
Resume: ${JSON.stringify(redactedProfile)}`;
}

function repairJson(text) {
  let candidate = text.trimEnd();
  const quotes = [...candidate.matchAll(/(?<!\\)"/g)].map((match) => match.index);
  if (quotes.length % 2 === 1) {
    candidate = candidate.slice(0, quotes[quotes.length - 1]);
  }
  candidate = candidate.replace(/[,:\s]+$/, '');
  for (const suffix of [']}', '}]}', '}]}}', '}', ']}']) {
    try {
      return JSON.parse(candidate + suffix);
    } catch {
      continue;
    }
  }
  return null;
}

function extractJson(text) {
  if (typeof text !== 'string') return null;
  let cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  cleaned = cleaned.slice(start);

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to repair
  }

  const candidates = [];
  for (let i = cleaned.length - 1; i >= 0 && candidates.length <= 200; i--) {
    if (cleaned[i] === '}') candidates.push(i + 1);
  }
  for (const end of candidates) {
    try {
      return JSON.parse(cleaned.slice(0, end));
    } catch {
      continue;
    }
  }
  return repairJson(cleaned);
}

function validateHealthReport(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('The health check reply could not be read');
  }

  const score = typeof report.score === 'number' && Number.isFinite(report.score)
    ? Math.max(0, Math.min(100, Math.round(report.score)))
    : null;
  const summary = typeof report.summary === 'string' ? report.summary.slice(0, 240) : '';

  const issues = (Array.isArray(report.issues) ? report.issues : [])
    .slice(0, MAX_ISSUES)
    .map((issue, index) => {
      if (!issue || typeof issue !== 'object') return null;
      const problem = typeof issue.problem === 'string' ? issue.problem.trim().slice(0, 240) : '';
      if (!problem) return null;
      const severity = ['critical', 'warning', 'suggestion'].includes(issue.severity) ? issue.severity : 'warning';
      return {
        rule: typeof issue.rule === 'string' && issue.rule.trim() ? issue.rule.trim() : 'other',
        item: typeof issue.item === 'string' && issue.item.trim() ? issue.item.trim().slice(0, 120) : `Issue ${index + 1}`,
        severity,
        problem,
        fix: typeof issue.fix === 'string' ? issue.fix.trim().slice(0, 240) : '',
        status: 'open'
      };
    })
    .filter(Boolean);

  const order = { critical: 0, warning: 1, suggestion: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    baseScore: score === null ? null : score,
    score: score === null ? null : score,
    summary,
    issues,
    checkedAt: Date.now()
  };
}

async function requestProvider(provider, prompt, signal) {
  const headers = { 'Content-Type': 'application/json' };
  const body = {
    model: provider.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: 'json_object' }
  };
  if (provider.reasoning) {
    body.reasoning_effort = 'low';
  }

  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers,
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
  const parsed = extractJson(typeof content === 'string' ? content : JSON.stringify(content));
  if (!parsed) {
    throw new Error(`${provider.label} returned an unreadable reply.`);
  }
  const report = validateHealthReport(parsed);
  report.provider = provider.name;
  report.providerLabel = provider.label;
  report.model = provider.model;
  return report;
}

async function checkResumeHealth(jsonContent, options = {}) {
  let profile;
  try {
    profile = JSON.parse(jsonContent || '{}');
  } catch {
    throw new Error('Invalid resume data. Save the resume form first.');
  }

  const providers = buildProviders(options);
  const prompt = buildHealthCheckPrompt(redactProfile(profile));
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
    ? `Health check failed. ${failures.join(' · ')}`
    : failures[0] || 'Health check failed.');
}

export {
  HEALTH_RULE_CATALOG,
  SCORE_WEIGHTS,
  POLLINATIONS_ENDPOINT,
  OLLAMA_ENDPOINT,
  DEFAULT_OLLAMA_MODEL,
  buildProviders,
  redactProfile,
  validateHealthReport,
  extractJson,
  buildHealthCheckPrompt,
  checkResumeHealth
};
