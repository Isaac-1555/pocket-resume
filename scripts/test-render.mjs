import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');

const rendererPath = new URL('../resume-renderers.js', import.meta.url);
const rendererSource = fs.readFileSync(rendererPath, 'utf8');

function loadRenderer() {
    const window = {
        jspdf: { jsPDF },
        PocketResumeSavePdf: (doc, filename) => {
            window.__saved = { doc, filename };
        }
    };
    const context = { window, console, JSON, Math, Date, String, Number, Array, Object, RegExp, Set, Map };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(rendererSource, context);
    return window;
}

function render(profile, layout) {
    const window = loadRenderer();
    const result = window.ResumeRenderers.generateResumePDF(profile, 'test', layout);
    return { doc: window.__saved.doc, result };
}

function collectOps(doc) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const pages = doc.internal.getNumberOfPages();
    const rows = [];
    for (let page = 1; page <= pages; page += 1) {
        const stream = String(doc.internal.pages[page]);
        for (const block of stream.split('ET')) {
            const offsets = [...block.matchAll(/([-\d.]+)\s+([-\d.]+)\s+Td/g)];
            if (!offsets.length) continue;
            const top = Number(offsets[offsets.length - 1][2]);
            const lineGapMatch = block.match(/([-\d.]+)\s+TL/);
            const lineGap = lineGapMatch ? Number(lineGapMatch[1]) : 12;
            const texts = [...block.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((match) => match[1]);
            if (!texts.length) continue;
            texts.forEach((text, index) => {
                rows.push({
                    page,
                    y: Number((pageHeight - top + index * lineGap).toFixed(1)),
                    text
                });
            });
        }
    }
    return { rows, pageHeight, pages };
}

const bullet = (n) => `Delivered outcome ${n} by rebuilding the reconciliation service, cutting manual effort across four teams and saving 18 percent of processing time.`;

function buildProfile({ jobs = 4, projects = 2, publications = 2, honors = 2, certifications = 3, longDetail = false } = {}) {
    const detail = 'This study examines hierarchical severity models across four regional portfolios. We report calibration curves across twelve simulated regimes and replicate on three anonymised datasets.';
    return {
        name: 'Alexandra M. Whitfield',
        position: 'Senior Data Scientist',
        location: 'Toronto, ON',
        contact: 'alex.whitfield@example.com | (416) 555-0199 | Toronto, ON | linkedin.com/in/awhitfield',
        email: 'alex.whitfield@example.com',
        phone: '(416) 555-0199',
        links: [
            { label: 'LinkedIn', text: 'linkedin.com/in/awhitfield', url: 'https://linkedin.com/in/awhitfield' },
            { label: 'GitHub', text: 'github.com/awhitfield', url: 'https://github.com/awhitfield' }
        ],
        summary: 'Data scientist with nine years of experience building production machine learning systems for insurance and logistics. Led a team of six that shipped a fraud detection platform processing 42 million claims annually.',
        skills: ['Python', 'SQL', 'PyTorch', 'Airflow', 'dbt', 'Snowflake', 'AWS'],
        skillGroups: [
            { label: 'Languages', items: ['Python', 'SQL', 'R', 'Scala'] },
            { label: 'ML', items: ['PyTorch', 'scikit-learn', 'XGBoost', 'MLflow'] },
            { label: 'Platform', items: ['Airflow', 'dbt', 'Snowflake', 'AWS', 'Docker', 'Kubernetes'] }
        ],
        experience: Array.from({ length: jobs }, (_, index) => ({
            title: `Job Title ${index + 1}`,
            company: `Company ${index + 1}`,
            location: 'Toronto, ON',
            period: '2019 - 2021',
            points: [bullet(1), bullet(2), bullet(3)]
        })),
        projects: Array.from({ length: projects }, (_, index) => ({
            title: `Project ${index + 1}`,
            platform: 'Python, FastAPI',
            period: '2022',
            url: `https://example.com/project-${index + 1}`,
            points: [bullet(4), bullet(5)]
        })),
        education: [
            { degree: 'MSc, Statistics', school: 'University of Toronto', year: '2015', location: 'Toronto, ON', details: [] },
            { degree: 'BSc, Mathematics', school: 'McMaster University', year: '2013', location: 'Hamilton, ON', details: [] }
        ],
        certifications: Array.from({ length: certifications }, (_, index) => `Certification ${index + 1}`),
        honors: Array.from({ length: honors }, (_, index) => ({ title: `Award ${index + 1}`, issuer: 'Body', year: '2020', detail: '' })),
        publicationsSummary: '',
        publications: Array.from({ length: publications }, (_, index) => ({
            title: `Publication ${index + 1} on hierarchical modelling of insurance severity with a deliberately long descriptive title`,
            venue: 'Canadian Journal of Statistics and Applied Probability',
            year: '2021',
            authors: 'A. Whitfield, R. Osei, M. Chen',
            detail: longDetail ? detail : '',
            citations: '10',
            url: 'https://doi.org/10.1000/xyz'
        })),
        researchInterests: ['Causal inference', 'Model fairness and explainability', 'Time-series forecasting'],
        teaching: [{ title: 'Guest lecturer', organization: 'University of Toronto', period: '2022', details: ['Two sessions per term.'] }],
        service: [{ title: 'Reviewer', organization: 'Canadian Journal of Statistics', period: '2021', details: ['Four reviews per year.'] }]
    };
}

function assertInsideMargins(ops, bottom, ignore = null) {
    const offenders = ops.rows.filter((row) => row.y > bottom + 0.5 && !(ignore && ignore(row)));
    assert.equal(offenders.length, 0, `text below page margin: ${JSON.stringify(offenders.slice(0, 3))}`);
}

function countText(ops, text) {
    return ops.rows.filter((row) => row.text === text).length;
}

const typical = buildProfile();
const long = buildProfile({ jobs: 8, projects: 4, publications: 6, honors: 6, certifications: 8 });

{
    const { doc, result } = render(typical, 'deedy');
    const ops = collectOps(doc);
    assert.equal(result.layout, 'deedy');
    assert.equal(ops.pages, 1, 'Double Sided stays on one page');
    assert.equal(result.fitted, true, 'typical resume fits');
    assertInsideMargins(ops, 792 - 14);
    assert.equal(countText(ops, 'Company 1'), 1, 'experience company renders once');
}

{
    const { doc, result } = render(long, 'deedy');
    const ops = collectOps(doc);
    assert.equal(ops.pages, 1, 'long Double Sided resume stays on one page');
    assert.equal(result.fitted, true, 'long resume still fits after trimming');
    assertInsideMargins(ops, 792 - 14);
    assert.ok(result.dropped.length || result.bulletsReduced, 'trimming is reported');
    assert.ok(result.dropped.length <= 3, 'reports at most three trimmed sections');
}

{
    const { doc } = render(typical, 'deedy');
    const ops = collectOps(doc);
    assert.equal(countText(ops, 'Project 1'), 1, 'projects are not duplicated across columns');
    assert.equal(countText(ops, 'LinkedIn: linkedin.com/in/awhitfield'), 1, 'links appear once');
    assert.ok(
        ops.rows.some((row) => row.text.includes('\u0095')),
        'bullets keep their glyph'
    );
}

{
    const { doc, result } = render(typical, 'academic-cv');
    const ops = collectOps(doc);
    assert.ok(result.pages >= 1);
    assert.equal(ops.pages, result.pages);
    assertInsideMargins(ops, 744, (row) => /Whitfield - \d+$/.test(row.text));
    for (let page = 1; page <= ops.pages; page += 1) {
        assert.ok(
            ops.rows.some((row) => row.page === page && row.text.includes('Whitfield - ')),
            `page ${page} carries the running footer`
        );
    }
}

{
    const heavy = buildProfile({ jobs: 8, projects: 4, publications: 10, honors: 6, longDetail: true });
    const { doc, result } = render(heavy, 'academic-cv');
    const ops = collectOps(doc);
    assert.ok(result.pages >= 2, 'heavy academic CV paginates');
    assertInsideMargins(ops, 744, (row) => /Whitfield - \d+$/.test(row.text));
    assert.ok(countText(ops, 'Publication 10 on hierarchical modelling of insurance severity with a deliberately') === 0, 'long titles wrap');
}

console.log('test-render: ok');
