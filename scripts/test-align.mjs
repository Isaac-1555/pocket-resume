// scripts/test-align.mjs
// Determinism smoke test for the offline aligner. No framework, no network.
// Usage: npm run test:align

import assert from 'node:assert/strict';
import { parseJobPosting, alignResumeJson, parseResumeText, buildCoverLetterFromTemplate } from '../resume-align.js';
import { CURATED_ALIASES } from '../skill-lexicon.js';

const lexicon = {
    terms: [
        { name: 'React', aliases: ['react.js', 'reactjs'], hot: true },
        { name: 'TypeScript', aliases: ['ts'], hot: true },
        { name: 'Kubernetes', aliases: ['k8s'], hot: true },
        { name: 'PostgreSQL', aliases: ['postgres'], hot: false },
        { name: 'Node.js', aliases: ['node', 'nodejs'], hot: true },
    ],
};

const jobText = [
    'Senior Frontend Engineer',
    'Acme Corp | Remote',
    'Requirements:',
    '- 5+ years building React and TypeScript applications',
    '- Experience with Kubernetes and PostgreSQL',
    '- Strong communication skills',
    'Preferred:',
    '- Node.js and GraphQL experience',
].join('\n');

const profile = {
    name: 'Jordan Lee',
    subtitle: 'Engineer',
    position: 'Engineer',
    location: 'Austin, TX',
    company: '',
    contact: 'jordan@example.com | Austin, TX',
    summary: '',
    skills: ['React', 'Node.js', 'Communication'],
    experience: [
        {
            title: 'Senior Engineer',
            company: 'Beta Inc',
            period: '2020 - Present',
            points: [
                'Worked on the design system and helped with accessibility.',
                'Cut checkout p95 latency 42% by profiling the React render path.',
                'Responsible for managing a team of 4 engineers.',
                'Built internal tooling that 12 engineers used weekly.',
            ],
        },
    ],
    projects: [],
    education: [],
    certifications: [],
};

const jd = parseJobPosting({ title: 'Senior Frontend Engineer | Acme Corp', text: jobText });
assert.equal(jd.title, 'Senior Frontend Engineer', 'JD title');
assert.match(jd.title, /Frontend/);

const first = alignResumeJson(profile, jd, { lexicon, styleConfig: { layout: 'pocketresume', promptStyle: 'professional' } });
const second = alignResumeJson(profile, jd, { lexicon, styleConfig: { layout: 'pocketresume', promptStyle: 'professional' } });
assert.deepEqual(first.resume, second.resume, 'aligner is deterministic');
assert.deepEqual(first.report, second.report, 'report is deterministic');

assert.equal(first.resume.position, 'Senior Frontend Engineer', 'position comes from JD');
assert.equal(first.resume.skills[0], 'React', 'JD-relevant skill ranked first');
assert.ok(first.resume.experience[0].points.length <= 3, 'bullet count capped');
assert.match(first.resume.experience[0].points[0], /42%/, 'metric bullet ranked first');
assert.ok(!first.resume.experience[0].points.some((point) => /^Responsible for/i.test(point)), 'banned opener fixed');

const numbers = new Set((JSON.stringify(profile).match(/\d[\d,.]*/g) || []).map((value) => value.replace(/,/g, '')));
for (const point of first.resume.experience[0].points) {
    for (const value of point.match(/\d[\d,.]*/g) || []) {
        assert.ok(numbers.has(value.replace(/,/g, '')), `no invented number: ${value}`);
    }
}

const parsed = parseResumeText([
    'Jordan Lee',
    'Senior Engineer',
    'jordan@example.com | 555-123-4567 | Austin, TX',
    'SUMMARY',
    'Engineer with 8 years building web products.',
    'SKILLS',
    'React, TypeScript, Node.js',
    'EXPERIENCE',
    'Senior Engineer, Beta Inc',
    'Jan 2020 - Present',
    '- Cut checkout latency 42% with React profiling.',
    'EDUCATION',
    'B.S. Computer Science',
    'State University',
].join('\n'));
assert.equal(parsed.name, 'Jordan Lee');
assert.equal(parsed.skills.length, 3);
assert.equal(parsed.experience.length, 1);
assert.match(parsed.experience[0].points[0], /42%/);

const twoJobs = parseResumeText([
    'Maya Chen',
    'EXPERIENCE',
    'Senior Engineer, Acme',
    '2022 - Present',
    '- Cut latency 41% with caching.',
    'Engineer, Beta',
    '2019 - 2022',
    '- Shipped the dashboard.',
    'EDUCATION',
    'B.S. Computer Science',
    'State University',
].join('\n'));
assert.equal(twoJobs.experience.length, 2, 'raw parser keeps entries separate');
assert.equal(twoJobs.experience[1].company, 'Beta');
assert.match(twoJobs.experience[0].points[0], /41%/);
assert.equal(twoJobs.experience[1].points[0], 'Shipped the dashboard.');
assert.equal(parsed.parseQuality, 'low');

const letter = buildCoverLetterFromTemplate(
    { greeting: 'Dear {{recipient}},', body: 'I am applying for the {{role}} role at {{company}}.\n\nI build web products.\n\nThank you.', signOff: 'Best,' },
    { company: 'Acme Corp', role: 'Frontend Engineer', recipientName: 'Dana' }
);
assert.equal(letter.greeting, 'Dear Dana,');
assert.match(letter.opening_paragraph, /Frontend Engineer role at Acme Corp/);
assert.equal(letter.body_paragraphs.length, 1);
const anonymous = buildCoverLetterFromTemplate({ greeting: 'Dear {{recipient}},', body: 'Hello.' }, {});
assert.equal(anonymous.greeting, 'Dear Hiring Manager,');
assert.ok(CURATED_ALIASES.k8s === 'Kubernetes');

console.log('align tests passed');
