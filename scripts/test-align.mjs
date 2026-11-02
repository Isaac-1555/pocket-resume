// scripts/test-align.mjs
// Determinism smoke test for the offline aligner. No framework, no network.
// Usage: npm run test:align

import assert from 'node:assert/strict';
import { parseJobPosting, alignResumeJson, parseResumeText, buildCoverLetterFromTemplate, buildKeywordModel, mergePageText } from '../resume-align.js';
import { parseResumeText as parseLocal, normalizeResumeProfile, splitContactParts, buildContactString } from '../resume-parse.js';
import { CURATED_ALIASES } from '../skill-lexicon.js';
import { expandLexicon } from '../skill-lexicon.js';
import { SKILL_LEXICON_BASE } from '../libs/skills-lexicon.js';

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
assert.equal(parsed.parseQuality, 'high');
assert.equal(parsed.location, 'Austin, TX', 'contact line location split out');

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


const local = parseLocal([
    'JANE DOE',
    'Senior Software Engineer',
    'jane@example.com | (555) 123-4567 | Austin, TX | linkedin.com/in/jane | github.com/jane',
    'SKILLS',
    'Languages: TypeScript, Python',
    'EXPERIENCE',
    'Senior Engineer at Acme Corp',
    'Jan 2020 - Present',
    '- Cut p95 latency 42%.',
    'Software Engineer | Beta Inc',
    '2017 - 2019',
    '- Built internal tooling.',
    'EDUCATION',
    'B.S. Computer Science, State University',
    '2013 - 2017',
].join('\n'));
assert.equal(local.location, 'Austin, TX', 'local parser splits location');
assert.equal(local.links.length, 2, 'local parser extracts links');
assert.equal(local.experience.length, 2, 'local parser keeps entries separate');
assert.equal(local.experience[0].company, 'Acme Corp');
assert.equal(local.experience[1].company, 'Beta Inc');
assert.equal(local.skillGroups.length, 1);
assert.ok(local.skills.includes('TypeScript'));
assert.equal(local.education[0].school, 'State University');
assert.equal(local.education[0].year, '2017');

const normalized = normalizeResumeProfile({ name: '  Jane Doe ', points: ['x'], experience: [{ title: 'Eng', company: 'Acme', points: ['A', ' ', 'B'] }], skills: 'React, Node' });
assert.equal(normalized.name, 'Jane Doe');
assert.deepEqual(normalized.experience[0].points, ['A', 'B']);
assert.deepEqual(normalized.skills, ['React', 'Node']);

const parts = splitContactParts({ email: 'a@b.com', phone: '555', location: 'Austin, TX', links: [{ url: 'https://github.com/a' }] });
assert.equal(parts.email, 'a@b.com');
assert.match(buildContactString(parts), /Austin, TX/);

const bundled = expandLexicon(SKILL_LEXICON_BASE);
assert.ok(bundled.terms.length > 5000, 'bundled lexicon loaded');
for (const name of ['SQL', 'Jira', 'Agile', 'Scrum', 'Salesforce', 'HIPAA', 'Kubernetes', 'TypeScript', '.NET']) {
    assert.ok(bundled.terms.some((term) => term.name === name), `bundled lexicon has ${name}`);
}

const skillProfile = {
    name: 'Dana Ruiz',
    position: 'Data Engineer',
    contact: '',
    summary: 'Data engineer running k8s and typescript pipelines.',
    skills: ['Python', 'Apache Spark', 'React', 'React.js', 'javascript', 'JAVASCRIPT'],
    experience: [{
        title: 'Data Engineer',
        company: 'Beta',
        period: '2020 - Present',
        points: ['Built dbt models in Snowflake and wrote SQL for reporting.'],
    }],
    projects: [],
    education: [],
    certifications: [],
};

const skillJd = parseJobPosting({
    title: 'Data Engineer',
    text: [
        'Data Engineer',
        'About us: we ship data products.',
        'Skills:',
        'SQL, Jira, Agile, dbt, Snowflake, Spark, Kubernetes, TypeScript',
        'Responsibilities:',
        '- Build pipelines with Airflow',
    ].join('\n'),
});
const skillRun = alignResumeJson(skillProfile, skillJd, { lexicon: bundled, styleConfig: { layout: 'pocketresume', promptStyle: 'professional' } });
const skillKeys = skillRun.resume.skills.map((skill) => skill.toLowerCase());
assert.equal(new Set(skillKeys).size, skillKeys.length, 'skills list has no duplicates');
assert.equal(skillKeys.filter((key) => key === 'react' || key === 'react.js').length, 1, 'React aliases merged');
assert.equal(skillKeys.filter((key) => key === 'javascript').length, 1, 'JavaScript case duplicates merged');
assert.ok(skillRun.resume.skills.includes('Kubernetes'), 'alias match (k8s -> Kubernetes) survives verification');
assert.ok(skillRun.resume.skills.includes('SQL'), 'JD skills-section entry added from master evidence');
assert.ok(skillRun.resume.skills.includes('Jira') === false, 'unevidenced JD skill not invented');
assert.equal(skillKeys.filter((key) => key.includes('spark')).length, 1, 'Apache Spark not duplicated by Spark');

const noFalsePositive = alignResumeJson(
    { ...skillProfile, skills: [], summary: '', experience: [{ title: 'Eng', company: 'X', period: '2020', points: ['Migrated workloads to Google Cloud.'] }] },
    parseJobPosting({ title: 'Backend Engineer', text: 'Requirements:\n- Go and Rust' }),
    { lexicon: bundled, styleConfig: { layout: 'pocketresume', promptStyle: 'professional' } },
);
assert.ok(!noFalsePositive.resume.skills.includes('Go'), 'Google must not imply the Go skill');

const unverifiedRun = alignResumeJson(
    skillProfile,
    skillJd,
    { lexicon: bundled, styleConfig: { layout: 'pocketresume', promptStyle: 'professional' }, allowUnverifiedSkills: true },
);
assert.ok(unverifiedRun.resume.skills.includes('Jira'), 'allowUnverifiedSkills adds unevidenced JD skills');
assert.ok(unverifiedRun.report.skillsAddedUnverified.includes('Jira'), 'unverified additions are reported distinctly');
assert.ok(!(unverifiedRun.alignmentWarnings || []).some((w) => w.startsWith('skill:Jira')), 'verifier does not drop unverified additions');
const stillNoInvention = alignResumeJson(skillProfile, skillJd, { lexicon: bundled, styleConfig: { layout: 'pocketresume', promptStyle: 'professional' } });
assert.ok(stillNoInvention.resume.skills.includes('Jira') === false, 'default stays evidence-gated');

const groupedRun = alignResumeJson(
    {
        ...skillProfile,
        skills: ['TypeScript', 'Python', 'Docker'],
        skillGroups: [{ label: 'Languages', items: ['TypeScript', 'Python', 'typescript'] }, { label: 'Tools', items: ['Docker'] }],
        experience: [{ title: 'Eng', company: 'X', period: '2020', points: ['Ran Kubernetes clusters and wrote SQL.'] }],
    },
    parseJobPosting({ title: 'Data Engineer', text: 'Data Engineer\nSkills:\nSQL, Kubernetes, Airflow' }),
    { lexicon: bundled, styleConfig: { layout: 'deedy', promptStyle: 'faang' } },
);
const groupedItems = groupedRun.resume.skillGroups.flatMap((group) => group.items);
assert.equal(groupedItems.filter((item) => item.toLowerCase() === 'typescript').length, 1, 'skill groups deduped');
assert.ok(groupedItems.includes('Kubernetes') && groupedItems.includes('SQL'), 'JD skills appear in skill groups');
assert.deepEqual(
    [...groupedItems].sort(),
    [...groupedRun.resume.skills].sort(),
    'skill groups and flat skills stay in sync',
);

const atbJd = parseJobPosting({
    title: 'Software Developer | ATB Financial',
    text: [
        'At ATB, we exist to make it possible for our clients, team members and communities.',
        'We love microservices and, while we mostly use React, Node.js, Python, TypeScript, Java on Google Cloud Platform, Linux and Kubernetes, new services can be built using whatever tools make sense.',
        'Skills, experience & requirements',
        'Accreditations:',
        "Bachelor's degree in computer science, engineering or equivalent",
        'Working knowledge in one or more general purpose programming languages including but not limited to: React,  Java Springboot, C/C++, C#, Objective C, Python, JavaScript, etc.',
        'Core Technical Skills:',
        'Web services / web app development -  front-end programming ( (React, HTML, CSS, JS, Java, Python, NodeJS)',
        'Updates progress daily through the tracking tool (Jira) or Kanban board',
        'Utilize SCRUM and Agile methodologies to complete tasks and accomplish workflows',
    ].join('\n'),
});
const atbModel = buildKeywordModel(atbJd, bundled);
const atbSkills = atbModel.terms.filter((term) => term.skill).map((term) => term.name);
for (const name of ['Java', 'Spring Boot', 'C++', 'C#', 'React', 'Node.js', 'Python', 'TypeScript', 'Linux', 'Kubernetes', 'Google Cloud Platform', 'HTML', 'CSS', 'Jira', 'Kanban', 'Scrum', 'Agile', 'Microservices']) {
    assert.ok(atbSkills.includes(name), `ATB JD detects ${name}`);
}
assert.ok(!atbSkills.includes('Programming'), 'generic "Programming" is not a skill');
assert.ok(atbModel.required.length > 0, 'ATB skills heading opens a requirements zone');
assert.equal(atbJd.location, '', 'tech words in a sentence are not a location');

const atbRun = alignResumeJson(    {
        name: 'Jordan Lee',
        position: 'Developer',
        contact: '',
        summary: '',
        skills: ['JavaScript', 'React', 'Node.js'],
        experience: [{ title: 'Developer', company: 'X', period: '2020 - Present', points: ['Built React and Node.js services on Kubernetes and wrote Java.'] }],
        projects: [],
        education: [],
        certifications: [],
    },
    atbJd,
    { lexicon: bundled, styleConfig: { layout: 'pocketresume', promptStyle: 'professional' } },
);
assert.ok(atbRun.report.score > 0, 'ATB JD produces a non-zero match score');
assert.ok(atbRun.report.jdSkillCount > 10, 'ATB JD yields many skill keywords');
assert.deepEqual(atbRun.report.jdWarnings, [], 'ATB JD has no scrape warnings');
assert.ok(atbRun.resume.skills.includes('Java'), 'Java pulled into the skills list from master evidence');

const fullPosting = 'At ATB we use React and Kubernetes.';
assert.equal(mergePageText(fullPosting, fullPosting), fullPosting, 'description not duplicated when the page already renders it');
const longDescription = [
    'Skills, experience & requirements',
    'React, Node.js, Python, TypeScript, Kubernetes, Linux, Spring Boot, Django, Ruby, Agile, Scrum, Kanban.',
    'We build microservices on Google Cloud Platform with Terraform, Docker, SQL, PostgreSQL, Redis, Kafka, Spark, Airflow, dbt, Snowflake, Tableau, Power BI, GraphQL, REST APIs, CI/CD, Git, GitHub, Jenkins, Ansible, Jira, Confluence, Figma, Sass, Tailwind CSS, Next.js, Vue.js, Angular, Rust, Go, Kotlin, Swift, Scala, MATLAB, .NET, C#, C++.',
].join('\n');
assert.equal(mergePageText('Skip to main content\nJobs', longDescription), longDescription, 'a substantial JSON-LD description replaces page chrome');
assert.equal(mergePageText('Skip to main content\nJobs', 'Brief'), 'Skip to main content\nJobs\nBrief', 'a short description is appended');
assert.ok(mergePageText('', longDescription).includes('\n'), 'description keeps its line breaks');
assert.equal(mergePageText('', 'Description only'), 'Description only');
assert.equal(mergePageText('Body only', ''), 'Body only');

console.log('align tests passed');