// Feature-tour frame generator
// Usage: node scripts/capture-tour.mjs
// Drives the real popup/options/tracker pages through a scripted session with a
// chrome.* shim, then saves cropped WebP frames + a frames.js manifest used by
// feature-video.js. Re-run whenever popup/options/tracker visuals change.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'assets', 'tour');
const MULT = 2;
const CLIP_W = 340;
const CLIP_H = 228;
const PORT = 8937;

function startServer() {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            const safe = path.normalize(urlPath).replace(/^([.][.][/\\])+/, '');
            const fp = path.join(ROOT, safe);
            fs.readFile(fp, (err, data) => {
                if (err) { res.writeHead(404); res.end('nf'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.listen(PORT, '127.0.0.1', () => resolve(srv));
    });
}

const pageTitle = undefined;
const pageUrl = undefined;
void pageTitle; void pageUrl;

const shim = (seed) => {
    const serialized = JSON.stringify(seed).replace(/<\/script/g, '<\\/script');
    return `(() => {
        const store = ${serialized};
        const listeners = [];
        const fire = (obj) => {
            const changes = {};
            for (const [k, v] of Object.entries(obj)) changes[k] = { oldValue: store[k], newValue: v };
            listeners.forEach((l) => { try { l(changes, 'local'); } catch (e) {} });
        };
        const resumeData = {
            name: 'Maya Chen',
            subtitle: 'Senior Frontend Engineer',
            contact: '(415) 555-0192 | maya.chen@hey.com | linkedin.com/in/mayachen',
            skills: ['TypeScript', 'JavaScript', 'React', 'Next.js', 'Node.js', 'GraphQL', 'Docker', 'AWS', 'CI/CD'],
            experience: [{ title: 'Senior Frontend Engineer', company: 'Brightline', location: 'San Francisco, CA', period: '2022 - Present', points: ['Rebuilt the design system used by 6 teams', 'Cut LCP 38% on the web app'] }, { title: 'Frontend Engineer', company: 'Coreli', location: 'Remote', period: '2019 - 2022', points: ['Shipped the analytics dashboard'] }],
            projects: [{ title: 'Open-source charting lib', platform: 'TypeScript', period: '2023', points: ['4.2k stars'] }],
            education: [{ degree: 'B.S. Computer Science', school: 'UC Davis', period: '2015 - 2019' }],
            certifications: [],
        };
        const coverLetterData = { opening_paragraph: 'Dear Hiring Manager,', body_paragraphs: ['I am excited to apply for the Senior Frontend Engineer role at Northwind.', 'At Brightline I rebuilt the component library two teams now ship with, cutting build times in half.'], closing_paragraph: 'Thank you for your time.', full_text: 'Dear Hiring Manager, ...' };
        const atsCheck = { score: 87, criticalIssues: [{ issue: 'No keywords from job description in skills', why: 'ATS systems rank keyword coverage first', suggestedFix: 'Add "performance budgets" under Languages & Core', userMustFix: false }], warnings: [] };
        window.chrome = {
            storage: {
                local: {
                    get(keys, cb) {
                        const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                        const out = {};
                        for (const k of list) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
                        if (typeof cb === 'function') { setTimeout(() => cb(out), 0); return; }
                        return Promise.resolve(out);
                    },
                    set(obj, cb) { Object.assign(store, JSON.parse(JSON.stringify(obj))); fire(obj); if (cb) setTimeout(cb, 0); },
                    remove(keys, cb) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]); if (cb) setTimeout(cb, 0); },
                },
                onChanged: { addListener(l) { listeners.push(l); }, removeListener() {} },
                sync: { get: (k, cb) => cb && cb({}), set: (o, cb) => cb && cb() },
            },
            runtime: {
                lastError: undefined,
                getURL: (p) => new URL(p, window.location.href).href,
                getManifest: () => ({ version: '8.4', name: 'PocketResume' }),
                openOptionsPage() {},
                sendMessage(msg, cb) {
                    setTimeout(() => {
                        setTimeout(() => {
                            if (msg && msg.type === 'START_GENERATION') cb({ status: 'success', data: JSON.stringify(resumeData), coverLetterData: JSON.stringify(coverLetterData) });
                            else if (msg && msg.type === 'FILL_APPLICATION_FORM') cb({ status: 'success', filled: 9, total: 9 });
                            else if (msg && msg.type === 'CHECK_ATS') cb({ status: 'success', data: atsCheck });
                            else cb({ status: 'success' });
                        }, 900);
                    }, 20);
                },
            },
            tabs: { query: async () => [{ id: 1, title: 'Senior Frontend Engineer at Northwind | LinkedIn', url: 'https://www.linkedin.com/jobs/view/40210' }], create() {}, sendMessage(msg, cb) { cb && cb({ text: 'Senior Frontend Engineer at Northwind, San Francisco CA' }); } },
            scripting: { executeScript: async () => [] },
            permissions: { request: async () => true, contains: async () => true },
            i18n: { getMessage: () => '' },
        };
    })();`;
};

const baseSeed = () => ({
    apiProvider: 'google',
    geminiApiKey: 'AIzaSyDemo-Do-Not-Use',
    resumeType: 'professional',
    selectedResumeId: 'r1',
    resumes: [{ id: 'r1', label: 'Resume 1', content: 'Maya Chen\nSenior Frontend Engineer\n(415) 555-0192 | maya.chen@hey.com | linkedin.com/in/mayachen\n\nEXPERIENCE\nBrightline - Senior Frontend Engineer (2022 - Present)\nLed design systems...\nCoreli - Frontend Engineer (2019 - 2022)\n\nEDUCATION\nUC Davis, B.S. Computer Science' }],
    onboardingCompleted: true,
    onboarding: { step: null, dismissed: true },
    lastSeenAnnouncement: '8.4',
    coverLetterEnabled: false,
    trackerCaptureEnabled: true,
    applicationProfile: { firstName: 'Maya', lastName: 'Chen', email: 'maya.chen@hey.com', phone: '(415) 555-0192', city: 'San Francisco', state: 'CA', workAuthorized: 'Yes', needsSponsorship: 'No', salaryAmount: '165000', salaryCurrency: 'USD', salaryPeriod: 'year', streetAddress: '1400 Smith St', addressLine2: '', postalCode: '94110', country: 'USA', yearsExperience: '6 - 9', linkedin: 'linkedin.com/in/mayachen', github: 'github.com/mayachen', website: 'mayachen.dev', eeoOptIn: false, customQA: [{ id: 'q1', question: 'Why do you want to work here?', answer: 'Your analytics workspace is the kind of product I like making fast.' }], updatedAt: Date.now() },
    applications: [
        { id: 'a1', company: 'Northwind', role: 'Senior Frontend Engineer', url: 'https://northwind.co/careers/1', status: 'applied', dateSaved: Date.now() - 86400000 * 3, appliedDate: Date.now() - 86400000 * 2, interviewDate: null, notes: 'Recruiter intro call went well', resumeIdUsed: 'r1' },
        { id: 'a2', company: 'Helio Labs', role: 'Product Engineer', url: 'https://helio.dev/jobs/7', status: 'interview', interviewDate: Date.now() + 86400000 * 2, dateSaved: Date.now() - 86400000 * 5, notes: '' },
        { id: 'a3', company: 'Coreli', role: 'Frontend Engineer', url: 'https://coreli.co/jobs/3', status: 'saved', dateSaved: Date.now() - 86400000, notes: '' },
    ],
    trackerTrialStartedAt: Date.now() - 86400000 * 10,
    trackerNewBadgeDismissed: true,
    fillFormNewBadgeDismissed: true,
    selectedApplicationId: null,
});

async function main() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = { width: CLIP_W * MULT, height: CLIP_H * MULT, clipW: CLIP_W, clipH: CLIP_H, mult: MULT, frames: [] };
    const frames = [];

    async function snap(page, frameId, anchorSel, opts = {}) {
        const clipH = opts.h || CLIP_H;
        if (opts.zoom) {
            await page.evaluate((z) => { document.documentElement.style.zoom = String(z); }, opts.zoom);
        }
        const anchor = page.locator(anchorSel).first();
        await anchor.scrollIntoViewIfNeeded();
        const box = await anchor.boundingBox();
        if (!box) throw new Error(`anchor not found: ${anchorSel}`);
        const dims = await page.evaluate(() => {
            const r = document.documentElement.getBoundingClientRect();
            return { w: Math.max(r.width, window.innerWidth), h: Math.max(r.height, document.documentElement.scrollHeight) };
        });
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const x = Math.round(Math.max(0, Math.min(dims.w - CLIP_W, cx - CLIP_W / 2)));
        const y = Math.round(Math.max(0, Math.min(dims.h - clipH, cy - clipH / 2)));
        const file = `${String(manifest.frames.length + 1).padStart(2, '0')}-${frameId}.webp`;
        await page.screenshot({ type: 'webp', quality: 88, clip: { x, y, width: CLIP_W, height: clipH }, path: path.join(OUT, file), scale: 'css' });
        const hotspots = {};
        for (const [name, sel] of Object.entries(opts.spots || {})) {
            try {
                const hb0 = await page.locator(sel).first().boundingBox();
                if (hb0) hotspots[name] = [
                    round2((hb0.x + hb0.width / 2 - x) / CLIP_W),
                    round2((hb0.y + hb0.height / 2 - y) / clipH),
                ];
            } catch (e) {}
        }
        if (opts.zoom) {
            await page.evaluate(() => { document.documentElement.style.zoom = ''; });
        }
        manifest.frames.push({ id: frameId, file, hotspots, clipH });
        return frameId;
    }

    function round2(n) { return Math.round(n * 1000) / 1000; }

    function modalWidth(w) { return w; }

    const browser = await chromium.launch();
    const server = await startServer();
    const baseUrl = `http://127.0.0.1:${PORT}`;
    try {
        // --- popup frames ---
        const popupPage = await newPage(browser, baseSeed(), `${baseUrl}/popup.html`);
        await snap(popupPage, 'idle', '#generateBtn', {
            h: 400,
            spots: { generate: '#generateBtn', settingsBtn: '#settingsBtn' },
        });

        await popupPage.click('.custom-select__trigger');
        await popupPage.waitForTimeout(250);
        await snap(popupPage, 'styleOpen', '.custom-options', {
            h: 280,
            spots: { faangOption: '.custom-option[data-value="faang"]', acOption: '.custom-option[data-value="academic-cv"]', deedyOption: '.custom-option[data-value="deedy"]' },
        });

        await popupPage.click('.custom-option[data-value="faang"]');
        await popupPage.waitForTimeout(250);
        await snap(popupPage, 'styleFaang', '.custom-select__trigger', { h: 300, spots: { styleTrigger: '.custom-select__trigger' } });

        await popupPage.evaluate(() => { document.getElementById('coverLetterToggle').click(); });
        await popupPage.waitForTimeout(200);
        await snap(popupPage, 'coverLetterOn', '#coverLetterToggle', { h: 300, spots: { coverToggle: '#coverLetterToggle' } });

        await popupPage.click('#generateBtn');
        await popupPage.waitForFunction(() => document.body.getAttribute('data-status') === 'generating');
        await popupPage.waitForTimeout(350);
        await snap(popupPage, 'generating', '#generateBtn', { h: 340, spots: { generate: '#generateBtn', genLabel: '#generateLabel' } });

        try {
            await popupPage.waitForFunction(() => document.body.getAttribute('data-status') === 'success', { timeout: 8000 });
        } catch (e) {
            const dbg = await popupPage.evaluate(() => ({
                status: document.body.getAttribute('data-status'),
                fill: document.body.getAttribute('data-fill-status'),
                errText: document.getElementById('errorMessageText') && document.getElementById('errorMessageText').textContent,
                genLabel: document.getElementById('generateLabel') && document.getElementById('generateLabel').textContent,
            }));
            console.error('SUCCESS-WAIT-DBG', JSON.stringify(dbg));
            throw e;
        }
        await popupPage.waitForTimeout(150);
        await snap(popupPage, 'success', '#generateBtn', { h: 400, spots: { generate: '#generateBtn', genLabel: '#generateLabel' } });

        await popupPage.click('#fillFormBtn');
        await popupPage.waitForFunction(() => document.body.getAttribute('data-fill-status') === 'filling', { timeout: 4000 }).catch(() => {});
        await popupPage.waitForTimeout(200);
        await snap(popupPage, 'fillFilling', '.list-row-pair', { h: 300, spots: { fillBtn: '#fillFormBtn' } });

        await popupPage.waitForFunction(() => document.body.getAttribute('data-fill-status') === 'fill-success', { timeout: 6000 }).catch(() => {});
        await popupPage.waitForTimeout(100);
        await snap(popupPage, 'fillSuccess', '.list-row-pair', { h: 300, spots: { fillBtn: '#fillFormBtn' } });

        // setup-complete offer card (fresh state)
        const setupPage = await newPage(browser, { ...baseSeed(), onboardingCompleted: false }, `${baseUrl}/popup.html`);
        await setupPage.waitForTimeout(400);
        await snap(setupPage, 'setupComplete', '#setupCard', { h: 320, spots: { watchBtn: '#setupWatchVideoBtn', notNowBtn: '#setupVideoNoBtn' } });
        await setupPage.close();

        // --- options frames (usage features only; setup steps are covered by onboarding) ---
        const optionsPage = await newPage(browser, baseSeed(), `${baseUrl}/options.html`, { width: 1280, height: 1000 });

        await optionsPage.locator('#refineResumeBtn').scrollIntoViewIfNeeded();
        await snap(optionsPage, 'refineAts', '#refineResumeBtn', { h: 280, zoom: 0.8, spots: { refineBtn: '#refineResumeBtn', atsBtn: '#checkAtsBtn' } });

        await optionsPage.click('#checkAtsBtn').catch(async () => {
            await optionsPage.evaluate(() => document.getElementById('checkAtsBtn').click());
        });
        await optionsPage.waitForSelector('#atsResultModal', { state: 'visible', timeout: 8000 }).catch(() => {});
        await optionsPage.waitForTimeout(4200);
        const modalW = await optionsPage.evaluate(() => document.getElementById('atsResultContent').getBoundingClientRect().width);
        const fitZoom = Math.min(0.85, 336 / Math.max(1, modalWidth(modalW)));
        await snap(optionsPage, 'atsResult', '#atsResultContent', { h: 300, zoom: fitZoom });
        await optionsPage.evaluate(() => { const m = document.getElementById('atsResultModal'); if (m) m.style.display = 'none'; });
        await optionsPage.evaluate(() => { document.documentElement.style.zoom = ''; });
        await optionsPage.evaluate(() => { const m = document.getElementById('atsResultModal'); if (m) m.style.display = 'none'; });

        await optionsPage.locator('#appProfileDetails').evaluate((el) => { el.open = true; });
        await optionsPage.waitForTimeout(350);
        await optionsPage.locator('#profileAutofillBtn').scrollIntoViewIfNeeded();
        await snap(optionsPage, 'appProfile', '#profileAutofillBtn', { h: 300, zoom: 0.8, spots: { autofillBtn: '#profileAutofillBtn' } });

        await optionsPage.close();

        // --- tracker frame ---
        const trackerPage = await newPage(browser, baseSeed(), `${baseUrl}/tracker.html`, { width: 1280, height: 900 });
        await trackerPage.waitForTimeout(700);
        const firstCard = trackerPage.locator('.card:not(.locked-card)').first();
        const cardSel = (await firstCard.count()) ? '.card:not(.locked-card)' : '#boardView';
        await snap(trackerPage, 'trackerBoard', cardSel, { h: 260 });
        await trackerPage.close();

        popupPage.context().close().catch(() => {});
        optionsPage.context().close().catch(() => {});
        fs.writeFileSync(path.join(OUT, 'frames.js'), `window.PocketResumeTourAssets = ${JSON.stringify(manifest, null, 1)};\n`);
    } finally {
        await browser.close();
        server.close();
        console.log(`Captured ${manifest.frames.length} frames → ${OUT}`);
        process.exit(0);
    }
}

async function newPage(browser, seed, url, size) {
    const ctx = await browser.newContext({ viewport: size || { width: 400, height: 900 }, deviceScaleFactor: MULT, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.addInitScript(shim(seed));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(600);
    return page;
}

main().catch((err) => { console.error(err); process.exit(1); });
