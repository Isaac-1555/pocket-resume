// Job title extraction: ATS wrappers, separator handling, candidate
// arbitration and the never-worse fallback. Fixtures come from real posting
// pages (Greenhouse embed, HiBob, Workday, Lever, Ashby, LinkedIn, Indeed).

import assert from 'node:assert/strict';
import {
    cleanJobTitleCandidate,
    extractJobTitle,
    sanitizeJobTitle
} from '../job-title-directory.js';
import { parseJobPosting, alignResumeJson } from '../resume-align.js';

const extract = (candidates, context = {}) => extractJobTitle({ candidates, ...context });

const cleanCases = [
    ['Job Application for Director, Support (Bengaluru) at GitLab', 'Director, Support (Bengaluru)'],
    ['Careers at Acme | Senior Software Engineer', 'Senior Software Engineer'],
    ['Acme | Senior Software Engineer', 'Senior Software Engineer'],
    ['Senior Software Engineer | Acme', 'Senior Software Engineer'],
    ['Senior Software Engineer - Acme - Toronto, ON | Indeed.com', 'Senior Software Engineer'],
    ['Acme hiring Senior Software Engineer in Toronto, ON | LinkedIn Jobs', 'Senior Software Engineer'],
    ['Senior Software Engineer, Product Platform at Vanta — Toronto, Ontario, Canada | LinkedIn Jobs', 'Senior Software Engineer, Product Platform'],
    ['Senior / Staff Fullstack Engineer @ Linear', 'Senior / Staff Fullstack Engineer'],
    ['Product Manager - Open Models', 'Product Manager - Open Models'],
    ['Lever Demo 2 - Sales Engineer AH', 'Sales Engineer AH'],
    ['Stage - Développeur logiciel', 'Développeur logiciel'],
    ['Senior Software Engineer (Remote - Canada)', 'Senior Software Engineer'],
    ['Senior Software Engineer (m/f/d) - Berlin', 'Senior Software Engineer'],
    ['Senior Engineer (JR12345) - Remote', 'Senior Engineer'],
    ['Job Captain', 'Job Captain'],
    ['Hiring Manager', 'Hiring Manager'],
    ['Software Engineer in Test', 'Software Engineer in Test'],
    ['Software Engineer (Integrations)', 'Software Engineer (Integrations)'],
    ['Title: Senior Data Engineer', 'Senior Data Engineer'],
    ['Jobs at GitLab', ''],
    ['Syndio Careers', ''],
    ['Careers', ''],
    ['LinkedIn', ''],
    ['Search for Jobs', ''],
    ['CAREERS AT NVIDIA', '']
];

cleanCases.forEach(([input, expected]) => {
    assert.equal(cleanJobTitleCandidate(input, {}), expected, `cleaned: ${input}`);
});

assert.equal(
    cleanJobTitleCandidate('Staff Software Engineer (Calgary)', {
        text: 'Back to jobs\nStaff Software Engineer (Calgary)\nCalgary, Alberta, Canada'
    }),
    'Staff Software Engineer',
    'a city in parentheses is dropped when the page repeats it as a location line'
);

assert.equal(
    cleanJobTitleCandidate('Software Engineer (Integrations)', {
        text: 'Software Engineer (Integrations)\nHybrid · Calgary, Canada\nOverview'
    }),
    'Software Engineer (Integrations)',
    'a parenthetical that is not a location stays'
);

const greenhouse = extract([
    { value: 'Job Application for Director, Support (Bengaluru) at GitLab', source: 'doc-title' },
    { value: 'Director, Support (Bengaluru)', source: 'og' },
    { value: 'Director, Support (Bengaluru)', source: 'h1' }
], {
    text: 'Back to jobs\nDirector, Support (Bengaluru)\nBengaluru, India'
});
assert.equal(greenhouse.value, 'Director, Support', 'Greenhouse: wrapper and city removed');
assert.ok(greenhouse.candidates.length >= 1);

assert.equal(
    extract([
        { value: 'Product Manager - Open Models', source: 'jsonld' },
        { value: 'CAREERS AT NVIDIA', source: 'h1' }
    ]).value,
    'Product Manager - Open Models',
    'Workday: a site-chrome h1 never beats JSON-LD'
);

assert.equal(
    extract([
        { value: 'Lever Demo 2 - Sales Engineer AH', source: 'doc-title' },
        { value: 'Sales Engineer AH', source: 'jsonld' }
    ]).value,
    'Sales Engineer AH',
    'Lever: the clean JSON-LD title wins'
);

assert.equal(
    extract([{ value: 'Lever Demo 2 - Sales Engineer AH', source: 'doc-title' }]).value,
    'Sales Engineer AH',
    'Lever without JSON-LD: the title segment wins over the company prefix'
);

assert.equal(
    extract([], { text: 'Careers\nOpenings\nBack\nSoftware Engineer (Integrations)\nHybrid · Calgary, Canada\nOverview' }).value,
    'Software Engineer (Integrations)',
    'HiBob: no meta tags or headings, the body line is used'
);

assert.equal(
    extract([
        { value: 'Syndio Careers | Join Our Team', source: 'doc-title' },
        { value: 'Career Opportunities', source: 'og' }
    ]).value,
    '',
    'a careers landing page yields nothing instead of "Syndio Careers"'
);

assert.equal(
    extract([
        { value: 'Job Application for Staff Software Engineer (Calgary) at Syndio', source: 'doc-title' },
        { value: 'Staff Software Engineer (Calgary)', source: 'h1' }
    ], { text: 'Back to jobs\nStaff Software Engineer (Calgary)\nCalgary, Alberta, Canada' }).value,
    'Staff Software Engineer',
    'Greenhouse embed frame candidates are used'
);

const empty = extract([{ value: 'Careers', source: 'doc-title' }]);
assert.equal(empty.source, 'none');
assert.equal(empty.confidence, 0);

const greenhouseJd = parseJobPosting({
    title: 'Job Application for Director, Support (Bengaluru) at GitLab',
    text: 'Back to jobs\nDirector, Support (Bengaluru)\nBengaluru, India',
    structured: {
        headline: 'Director, Support (Bengaluru)',
        pageHeading: 'Director, Support (Bengaluru)'
    }
});
assert.equal(greenhouseJd.title, 'Director, Support');
assert.equal(greenhouseJd.titleSource.length > 0, true);
assert.ok(Array.isArray(greenhouseJd.titleCandidates));

const workdayJd = parseJobPosting({
    title: 'Product Manager - Open Models',
    text: 'About the job\nNVIDIA is hiring.',
    structured: { title: 'Product Manager - Open Models', pageHeading: 'CAREERS AT NVIDIA' }
});
assert.equal(workdayJd.title, 'Product Manager - Open Models');

const leverJd = parseJobPosting({
    title: 'Lever Demo 2 - Sales Engineer AH',
    text: '',
    structured: { title: 'Sales Engineer AH' }
});
assert.equal(leverJd.title, 'Sales Engineer AH');

const nothingJd = parseJobPosting({ title: 'Careers', text: '', structured: {} });
assert.equal(nothingJd.title, '', 'an unreadable page returns no title');

const profile = {
    name: 'Test Candidate',
    subtitle: 'Full-Stack Engineer · 8 years',
    position: 'Full-Stack Engineer',
    contact: '',
    summary: '',
    skills: [],
    experience: [],
    projects: [],
    education: []
};
const aligned = alignResumeJson(profile, nothingJd, {
    lexicon: { terms: [] },
    styleConfig: { layout: 'pocketresume' }
});
assert.equal(aligned.resume.subtitle, profile.subtitle, 'a missing JD title keeps the resume subtitle');
assert.equal(aligned.resume.position, profile.position);

const titledJd = parseJobPosting({ title: 'Senior Frontend Engineer | Acme', text: '', structured: {} });
const titled = alignResumeJson(profile, titledJd, {
    lexicon: { terms: [] },
    styleConfig: { layout: 'pocketresume' }
});
assert.equal(titled.resume.subtitle, 'Senior Frontend Engineer', 'a valid JD title still drives the subtitle');

assert.equal(sanitizeJobTitle('Job Captain').valid, true, 'real titles with "job" stay valid');
assert.equal(sanitizeJobTitle('Hiring Manager').valid, true, 'real titles with "hiring" stay valid');

console.log('test:titles — ok');
