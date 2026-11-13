// store-assets capture generator
// Usage: node store-assets/capture.mjs
// Captures the real v10 UI + real PDF output for Chrome Web Store screenshots.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resumeJson, coverLetterJson, trackerApplications, healthReport, masterResumeText, PAGE_TITLE, PAGE_URL } from './sample-data.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSETS = path.join(ROOT, 'store-assets');
const CAPTURES = path.join(ASSETS, 'captures');
const fileUrl = (p) => pathToFileURL(path.join(ROOT, p)).href;

const MATCH_REPORT = {
    score: 92,
    jdSkillCount: 18,
    skillsAdded: ['TypeScript', 'React', 'GraphQL'],
    skillsAddedUnverified: [],
    skillsSkippedNoEvidence: [],
    masterSkillCount: 12,
    missingRequired: [],
    parseQuality: 'high',
    jdWarnings: [],
};

const PRO_ACCESS = {
    signedIn: true,
    isPro: true,
    promoActive: true,
    withinWindow: true,
    proAccess: true,
    canGenerate: true,
    cloudSyncAccess: true,
    resolved: true,
    healthy: true,
    trialDaysLeft: 0,
    planPeriod: 'month',
    checkedAt: Date.now(),
};

function initScript(seed) {
    const serialized = JSON.stringify({ seed, resumeJson, coverLetterJson, report: MATCH_REPORT, proAccess: PRO_ACCESS, pageTitle: PAGE_TITLE, pageUrl: PAGE_URL });
    return `(() => {
        const cfg = ${serialized};
        const store = { ...cfg.seed };
        window.__RESUME_JSON__ = cfg.resumeJson;
        window.__COVER_LETTER_JSON__ = cfg.coverLetterJson;
        window.__MATCH_REPORT__ = cfg.report;
        window.__PAGE_TITLE__ = cfg.pageTitle;
        window.__PAGE_URL__ = cfg.pageUrl;
        const listeners = [];
        const fire = (obj) => {
            const changes = {};
            for (const [k, v] of Object.entries(obj)) changes[k] = { oldValue: store[k], newValue: v };
            listeners.forEach((l) => { try { l(changes, 'local'); } catch (e) {} });
        };
        window.chrome = {
            storage: {
                local: {
                    get(keys, cb) {
                        const out = {};
                        const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
                        for (const k of list) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
                        if (typeof cb === 'function') { setTimeout(() => cb(out), 0); return undefined; }
                        return new Promise((resolve) => { setTimeout(() => resolve(out), 0); });
                    },
                    set(obj, cb) {
                        Object.assign(store, JSON.parse(JSON.stringify(obj)));
                        fire(obj);
                        if (typeof cb === 'function') setTimeout(cb, 0);
                        else return Promise.resolve();
                    },
                    remove(keys, cb) {
                        (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]);
                        if (cb) setTimeout(cb, 0);
                    },
                },
                onChanged: { addListener(l) { listeners.push(l); }, removeListener() {} },
                sync: { get: (k, cb) => cb && cb({}), set: (o, cb) => cb && cb() },
            },
            runtime: {
                lastError: undefined,
                getURL: (p) => new URL(p, window.location.href).href,
                getManifest: () => ({ version: '10.7.0', name: 'PocketResume' }),
                openOptionsPage() {},
                sendMessage(msg, cb) {
                    setTimeout(() => {
                        if (msg && msg.type === 'GENERATE') {
                            cb({ status: 'success', data: window.__RESUME_JSON__, coverLetterData: window.__COVER_LETTER_JSON__, report: window.__MATCH_REPORT__ });
                        } else if (msg && msg.type === 'CHECK_PRO_ACCESS') {
                            cb(cfg.proAccess);
                        } else {
                            cb({ status: 'success' });
                        }
                    }, 60);
                },
            },
            tabs: {
                query: async () => [{ id: 1, title: window.__PAGE_TITLE__, url: window.__PAGE_URL__ }],
                create() {},
                sendMessage(msg, cb) { cb && cb({ text: '' }); },
            },
            scripting: { executeScript: async () => [] },
            permissions: { request: async () => true, contains: async () => true },
            i18n: { getMessage: () => '' },
        };
        // Page realms normally load the Clerk bundle; the capture harness answers
        // with a signed-in Pro session so the gate renders the ready state.
        Object.defineProperty(window, 'CloudSync', {
            configurable: true,
            get: () => ({
                isConfigured: () => true,
                init: async () => {},
                isSignedIn: async () => true,
                getAccessState: async () => ({ ...cfg.proAccess }),
                getUserProfile: async () => ({ name: 'Maya Chen', email: 'maya.chen@hey.com' }),
                startAutoSync: () => {},
                syncResumes: async () => ({ changed: false }),
                signIn: async () => {},
                signUp: async () => {},
                signOut: async () => {}
            }),
            set: () => {},
        });
        // setup card hooks
        window.__captureMode = true;
    })();`;
}

const RESUME_SEED = [
    { id: 'r1', label: 'Product Frontend', icon: 'code', content: '', jsonContent: resumeJson, updatedAt: Date.now() },
    { id: 'r2', label: 'Full Stack', icon: 'layers', content: '', jsonContent: resumeJson, updatedAt: Date.now() },
];

async function patchJsPdfSave(page) {
    await page.evaluate(() => {
        window.__pdfOutputs = [];
        const Real = window.jspdf && window.jspdf.jsPDF;
        if (!Real) return;
        const captureSave = (doc) => {
            doc.save = function (name) {
                try {
                    window.__pdfOutputs.push({ name: String(name || 'file.pdf'), data: doc.output('datauristring') });
                } catch (e) {}
                return doc;
            };
            return doc;
        };
        const Wrapped = function (...args) {
            return captureSave(new Real(...args));
        };
        Wrapped.prototype = Real.prototype;
        Object.keys(Real).forEach((k) => { try { Wrapped[k] = Real[k]; } catch (e) {} });
        window.jspdf.jsPDF = Wrapped;
        if (window.ResumeRenderers) window.ResumeRenderers.jsPDF = Wrapped;
    });
}

async function hideFillForm(page) {
    await page.addStyleTag({ content: '#fillFormBtn { display: none !important; }' });
    await page.waitForTimeout(150);
}

async function drainPdfs(page) {
    return page.evaluate(() => (window.__pdfOutputs || []).splice(0));
}

async function selectStyle(page, value) {
    await page.evaluate((v) => {
        const sel = document.getElementById('resumeType');
        sel.value = v;
        document.querySelectorAll('.custom-option').forEach((o) => {
            o.classList.toggle('selected', o.getAttribute('data-value') === v);
            if (o.getAttribute('data-value') === v) document.getElementById('customSelectText').textContent = o.textContent;
        });
    }, value);
}

async function runGenerate(page, output = 'resume') {
    const attr = output === 'cover-letter' ? 'letter-status' : 'status';
    // Reset the previous run's terminal state; otherwise waitForSelector would
    // resolve against the last success before this click produces anything.
    await page.evaluate((a) => { document.body.dataset[a] = 'idle'; }, attr === 'status' ? 'status' : 'letterStatus');
    await page.click(output === 'cover-letter' ? '#coverLetterBtn' : '#generateBtn');
    await page.waitForSelector(`body[data-${attr}="success"]`, { timeout: 20000 });
    await page.waitForTimeout(900);
}

function saveDataUri(dataUri, filePath) {
    fs.writeFileSync(filePath, Buffer.from(dataUri.split(',')[1], 'base64'));
}

async function pdfToPng(pdfPath, outPngPath) {
    const tmp = path.join(CAPTURES, '.ql');
    fs.mkdirSync(tmp, { recursive: true });
    execFileSync('/usr/bin/qlmanage', ['-t', '-s', '1800', '-o', tmp, pdfPath], { stdio: 'ignore' });
    const generated = path.join(tmp, path.basename(pdfPath) + '.png');
    fs.renameSync(generated, outPngPath);
    fs.rmSync(tmp, { recursive: true, force: true });
}

async function main() {
    fs.mkdirSync(CAPTURES, { recursive: true });
    const browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--allow-file-access-from-files'],
    });

    // ============ 1. POPUP: idle + success + 3 layout PDFs + cover letter ============
    {
        const context = await browser.newContext({
            viewport: { width: 480, height: 820 },
            deviceScaleFactor: 3,
        });
        await context.addInitScript(initScript({
            resumes: RESUME_SEED,
            selectedResumeId: 'r1',
            resumeType: 'professional',
            animationsEnabled: true,
            onboardingCompleted: true,
            lastSeenAnnouncement: '10.7.0',
            growthRatingPrompt: { converted: true },
            growthSharePrompt: { converted: true },
            quickDownloadNewBadgeDismissed: true,
            trackerNewBadgeDismissed: true,
            fillFormNewBadgeDismissed: true,
            proAccessCache: PRO_ACCESS,
            trackerPlanCache: PRO_ACCESS,
        }));
        const page = await context.newPage();
        page.on('pageerror', (e) => console.error('[pageerror]', e.message));
        page.on('console', (m) => { if (m.type() === 'error') console.warn('[console]', m.text().slice(0, 200)); });
        await page.goto(fileUrl('popup.html'));
        await page.waitForSelector('#generateBtn');
        await page.waitForTimeout(900);
        await hideFillForm(page);
        await patchJsPdfSave(page);

        await page.locator('body').screenshot({ path: path.join(CAPTURES, 'popup-idle.png') });
        console.log('captured popup-idle');

        await runGenerate(page);
        await page.locator('body').screenshot({ path: path.join(CAPTURES, 'popup-success.png') });
        let outputs = await drainPdfs(page);
        for (const o of outputs) {
            if (o.name.startsWith('Resume')) saveDataUri(o.data, path.join(CAPTURES, 'resume-professional.pdf'));
            if (o.name.startsWith('CoverLetter')) saveDataUri(o.data, path.join(CAPTURES, 'cover-letter.pdf'));
        }
        console.log('captured popup-success + professional pdf + cover letter');

        await selectStyle(page, 'deedy');
        await runGenerate(page);
        outputs = await drainPdfs(page);
        for (const o of outputs) {
            if (o.name.startsWith('Resume')) saveDataUri(o.data, path.join(CAPTURES, 'resume-deedy.pdf'));
        }
        console.log('captured deedy pdf');

        await selectStyle(page, 'academic-cv');
        await runGenerate(page);
        outputs = await drainPdfs(page);
        for (const o of outputs) {
            if (o.name.startsWith('Resume') || o.name.startsWith('CV')) saveDataUri(o.data, path.join(CAPTURES, 'resume-academic-cv.pdf'));
        }
        console.log('captured academic-cv pdf');

        await context.close();
    }

    // ============ 2. PDF -> PNG previews ============
    for (const style of ['professional', 'deedy', 'academic-cv']) {
        const pdf = path.join(CAPTURES, `resume-${style}.pdf`);
        if (fs.existsSync(pdf)) {
            await pdfToPng(pdf, path.join(CAPTURES, `resume-${style}.png`));
            console.log(`converted resume-${style}.png`);
        } else {
            console.warn(`MISSING: ${pdf}`);
        }
    }
    if (fs.existsSync(path.join(CAPTURES, 'cover-letter.pdf'))) {
        await pdfToPng(path.join(CAPTURES, 'cover-letter.pdf'), path.join(CAPTURES, 'cover-letter.png'));
        console.log('converted cover-letter.png');
    }

    // ============ 3. TRACKER board ============
    {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            deviceScaleFactor: 2,
        });
        await context.addInitScript(initScript({
            applications: trackerApplications,
            trackerTourSeen: true,
            trackerLockDismissed: true,
            trackerPlanCache: PRO_ACCESS,
            proAccessCache: PRO_ACCESS,
        }));
        const page = await context.newPage();
        await page.goto(fileUrl('tracker.html'));
        await page.waitForSelector('.board-column .card', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1400);
        await page.screenshot({ path: path.join(CAPTURES, 'tracker.png') });
        console.log('captured tracker');
        await page.click('[data-view="graph"]');
        await page.waitForTimeout(1800);
        await page.screenshot({ path: path.join(CAPTURES, 'tracker-graph.png') });
        console.log('captured tracker-graph');
        await context.close();
    }

    // ============ 4. OPTIONS: resume form + health panel ============
    {
        const context = await browser.newContext({
            viewport: { width: 1180, height: 1000 },
            deviceScaleFactor: 2,
        });
        await context.addInitScript(initScript({
            resumes: [{
                ...RESUME_SEED[0],
                content: masterResumeText,
                legacyContent: masterResumeText,
                updatedAt: Date.now() - 10 * 60 * 1000,
                healthEnabledLocal: true,
                healthReport,
            }],
            selectedResumeId: 'r1',
            resumeType: 'professional',
            onboardingCompleted: true,
            lastSeenAnnouncement: '10.7.0',
            proAccessCache: PRO_ACCESS,
        }));
        const page = await context.newPage();
        page.on('pageerror', (e) => console.error('[options pageerror]', e.message));
        await page.goto(fileUrl('options.html'));
        await page.waitForSelector('#resumeHealthDetails', { timeout: 20000 });
        await page.waitForTimeout(1800);
        await page.evaluate(() => { const s = document.getElementById('statusOverlay'); if (s) s.style.display = 'none'; });
        await page.locator('#rfShowPaste').click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(200);
        await page.fill('#rfPasteInput', masterResumeText);
        await page.evaluate(() => { const t = document.getElementById('rfPasteInput'); if (t) { t.scrollTop = 0; t.blur(); } });
        await page.waitForTimeout(300);
        await page.locator('#tabContentArea').screenshot({ path: path.join(CAPTURES, 'resume-form.png') });
        console.log('captured resume-form');

        await page.evaluate(() => document.getElementById('resumeHealthDetails').setAttribute('open', ''));
        await page.waitForTimeout(600);
        await page.locator('#resumeHealthDetails').screenshot({ path: path.join(CAPTURES, 'health-check.png') });
        console.log('captured health-check');
        await context.close();
    }

    await browser.close();
    console.log('DONE');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
