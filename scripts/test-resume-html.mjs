// scripts/test-resume-html.mjs
// The paper sheet the swarm builds: section coverage, escaping, empty
// sections and the no-invented-content guarantee. No framework, no network.

import assert from 'node:assert/strict';
import { buildResumeSheetHtml, buildCoverLetterSheetHtml } from '../resume-html.js';

let passed = 0;

function test(name, fn) {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
}

const profile = {
    name: 'Ada Lovelace',
    position: 'Senior Software Engineer',
    contact: 'ada@example.com | +1 555 0100 | Toronto, ON',
    summary: 'Engineer with 8 years building deterministic systems.',
    skills: ['TypeScript', 'React', 'PostgreSQL'],
    experience: [
        {
            title: 'Senior Software Engineer',
            company: 'Analytical Engines',
            location: 'Toronto, ON',
            period: '2021 — Present',
            points: ['Cut cold-start latency 42%.', 'Led a four-person platform team.']
        }
    ],
    projects: [
        { title: 'PocketResume', platform: 'Chrome Extension', period: '2024', points: ['On-device tailoring.'] }
    ],
    education: [{ degree: 'BSc Computer Science', school: 'University of Toronto', year: '2018' }],
    certifications: ['AWS Solutions Architect — Associate (2023)']
};

console.log('resume-html:');

test('renders one sheet article', () => {
    const html = buildResumeSheetHtml(profile);
    assert.equal((html.match(/class="pr-sheet"/g) || []).length, 1);
    assert.match(html, /^<article class="pr-sheet">/);
    assert.match(html, /<\/article>$/);
});

test('prints every populated section in the PDF order', () => {
    const html = buildResumeSheetHtml(profile);
    const order = ['Professional Summary', 'Skills', 'Experience', 'Featured Projects', 'Education', 'Certifications'];
    const positions = order.map((label) => html.indexOf(label));
    positions.forEach((position, index) => {
        assert.ok(position > 0, `${order[index]} missing`);
        if (index > 0) assert.ok(position > positions[index - 1], `${order[index]} out of order`);
    });
});

test('carries the profile values verbatim', () => {
    const html = buildResumeSheetHtml(profile);
    assert.ok(html.includes('Ada Lovelace'));
    assert.ok(html.includes('Senior Software Engineer'));
    assert.ok(html.includes('Cut cold-start latency 42%.'));
    assert.ok(html.includes('University of Toronto'));
    assert.ok(html.includes('TypeScript'));
});

test('omits empty sections instead of printing empty labels', () => {
    const html = buildResumeSheetHtml({ name: 'Bare Minimum' });
    assert.ok(html.includes('Bare Minimum'));
    assert.ok(!html.includes('Professional Summary'));
    assert.ok(!html.includes('Experience'));
    assert.ok(!html.includes('Certifications'));
});

test('escapes every angle bracket and quote it prints', () => {
    const html = buildResumeSheetHtml({
        name: '<script>alert(1)</script>',
        position: 'Engineer "and" <Architect>',
        summary: 'Uses <b>bold</b> & ampersands',
        experience: [{ title: 'A&B', company: '<Corp>', points: ['5 < 6 and 7 > 6'] }]
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&amp;'));
    assert.ok(!html.includes('<Corp>'));
});

test('treats n/a placeholders as absent', () => {
    const html = buildResumeSheetHtml({
        name: 'Ada',
        experience: [{ title: 'Engineer', company: 'Analytical', location: 'n/a', period: 'N/A', points: ['Shipped.'] }]
    });
    assert.ok(!html.includes('n/a'));
    assert.ok(!html.includes('N/A'));
    assert.ok(html.includes('Analytical'));
});

test('ignores unknown fields rather than inventing copy', () => {
    const html = buildResumeSheetHtml({ name: 'Ada', madeUpField: 'should not appear' });
    assert.ok(!html.includes('should not appear'));
});

test('renders skill groups when the flat list is empty', () => {
    const html = buildResumeSheetHtml({
        name: 'Ada',
        skillGroups: [{ label: 'Languages', items: ['Go', 'Rust'] }]
    });
    assert.ok(html.includes('Languages: Go'));
    assert.ok(html.includes('Languages: Rust'));
});

console.log('cover letter:');

const letter = {
    applicant_name: 'Ada Lovelace',
    applicant_contact: 'ada@example.com | Toronto, ON',
    date: '21 November 2026',
    recipient_name: 'Hiring Manager',
    company_name: 'Analytical Engines',
    greeting: 'Dear Hiring Team,',
    opening_paragraph: 'I am applying for the platform role.',
    body_paragraphs: ['I have shipped deterministic engines.', 'I like small, measured software.'],
    closing_paragraph: 'Thank you for your time.',
    sign_off: 'Sincerely,'
};

test('renders the letter body in order', () => {
    const html = buildCoverLetterSheetHtml(letter);
    const order = ['Ada Lovelace', 'Analytical Engines', 'Dear Hiring Team,', 'I am applying', 'deterministic engines', 'small, measured', 'Thank you', 'Sincerely,'];
    let cursor = -1;
    order.forEach((needle) => {
        const found = html.indexOf(needle, cursor + 1);
        assert.ok(found > cursor, `${needle} missing or out of order`);
        cursor = found;
    });
});

test('drops the placeholder recipient but keeps the company', () => {
    const html = buildCoverLetterSheetHtml(letter);
    assert.ok(!html.includes('Hiring Manager'));
    assert.ok(html.includes('Analytical Engines'));
});

test('escapes the letter body', () => {
    const html = buildCoverLetterSheetHtml({ applicant_name: '<b>Ada</b>', greeting: '<img src=x>' });
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<b>Ada</b>'));
});

test('handles a missing payload without throwing', () => {
    assert.ok(buildCoverLetterSheetHtml(null).includes('pr-sheet'));
    assert.ok(buildResumeSheetHtml(undefined).includes('pr-sheet'));
});

console.log(`\n${passed} checks passed.`);
