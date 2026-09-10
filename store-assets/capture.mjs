// store-assets capture generator
// Usage: node store-assets/capture.mjs
// Captures real UI + real PDF output for Chrome Web Store screenshots.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resumeJson, coverLetterJson, trackerApplications, PAGE_TITLE, PAGE_URL } from './sample-data.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSETS = path.join(ROOT, 'store-assets');
const CAPTURES = path.join(ASSETS, 'captures');
const fileUrl = (p) => pathToFileURL(path.join(ROOT, p)).href;

const FORM_ANSWERS = [
    ['first name', 'Maya'],
    ['last name', 'Chen'],
    ['phone', '(415) 555-0192'],
    ['email', 'maya.chen@hey.com'],
    ['linkedin', 'linkedin.com/in/mayachen'],
    ['where are you based', 'San Francisco Bay Area, CA'],
    ['years of professional frontend', '6 - 9'],
    ['legally authorized', 'Yes, I am authorized to work in the U.S.'],
    ['salary expectations', '$165,000 - $185,000'],
    ['why do you want', `I have spent the last four years building design systems and data-heavy dashboards, including the component library six teams at Brightline now ship with. Northwind's analytics workspace is exactly the kind of surface I enjoy making fast and accessible, and your engineering blog tells me performance is treated as a feature here. I would love to help raise that bar.`],
    ['how did you hear', 'A teammate or friend'],
];

function initScript(seed) {
    const serialized = JSON.stringify({ seed, resumeJson, coverLetterJson, pageTitle: PAGE_TITLE, pageUrl: PAGE_URL });
    return `(() => {
        const cfg = ${serialized};
        const store = { ...cfg.seed };
        window.__RESUME_JSON__ = cfg.resumeJson;
        window.__COVER_LETTER_JSON__ = cfg.coverLetterJson;
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
                        setTimeout(() => cb(out), 0);
                    },
                    set(obj, cb) {
                        Object.assign(store, JSON.parse(JSON.stringify(obj)));
                        fire(obj);
                        if (cb) setTimeout(cb, 0);
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
                getManifest: () => ({ version: '7.9.9', name: 'PocketResume' }),
                openOptionsPage() {},
                sendMessage(msg, cb) {
                    setTimeout(() => {
                        if (msg && msg.type === 'START_GENERATION') cb({ status: 'success', data: window.__RESUME_JSON__, coverLetterData: window.__COVER_LETTER_JSON__ });
                        else if (msg && msg.type === 'FILL_APPLICATION_FORM') cb({ status: 'success', filled: 9, total: 9 });
                        else cb({ status: 'success' });
                    }, 40);
                },
            },
            tabs: {
                query: async () => [{ id: 1, title: window.__PAGE_TITLE__, url: window.__PAGE_URL__ }],
                create() {},
                sendMessage(msg, cb) { cb && cb({ text: 'Senior Frontend Engineer\\nNorthwind\\nSan Francisco, CA' }); },
            },
            scripting: { executeScript: async () => [] },
            permissions: { request: async () => true, contains: async () => true },
            i18n: { getMessage: () => '' },
        };
    })();`;
}

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

async function runGenerate(page) {
    await page.click('#generateBtn');
    await page.waitForSelector('body[data-status="success"]', { timeout: 15000 });
    await page.waitForTimeout(700);
}

function saveDataUri(dataUri, filePath) {
    fs.writeFileSync(filePath, Buffer.from(dataUri.split(',')[1], 'base64'));
}

async function pdfToPng(pdfPath, outPngPath) {
    const tmp = path.join(CAPTURES, '.ql');
    fs.mkdirSync(tmp, { recursive: true });
    execFileSync('/usr/bin/qlmanage', ['-t', '-s', '1500', '-o', tmp, pdfPath], { stdio: 'ignore' });
    const generated = path.join(tmp, path.basename(pdfPath) + '.png');
    fs.renameSync(generated, outPngPath);
    fs.rmSync(tmp, { recursive: true, force: true });
}

async function main() {
    fs.mkdirSync(CAPTURES, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });

    // ============ 1. POPUP: idle + success states + all 4 resume PDFs + cover letter ============
    {
        const context = await browser.newContext({
            viewport: { width: 480, height: 820 },
            deviceScaleFactor: 3,
        });
        await context.addInitScript(initScript({
            apiProvider: 'google',
            geminiApiKey: 'AIzaSyDExampleKeyForScreenshots00000',
            resumes: [
                { id: 'r1', label: 'Master Resume', content: 'Maya Chen - Senior Frontend Engineer ...', jsonContent: '' },
                { id: 'r2', label: 'SWE - Frontend', content: 'Maya Chen - variant ...', jsonContent: '' },
            ],
            selectedResumeId: 'r1',
            resumeType: 'professional',
            onboardingCompleted: true,
            lastSeenAnnouncement: '7.9',
            growthRatingPrompt: { converted: true },
            growthSharePrompt: { converted: true },
            coverLetterEnabled: true,
            analyticsEnabled: true,
            trackerCaptureEnabled: true,
        }));
        const page = await context.newPage();
        page.on('pageerror', (e) => console.error('[pageerror]', e.message));
        page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.warn('[console]', m.type(), m.text().slice(0, 200)); });
        await page.goto(fileUrl('popup.html'));
        await page.waitForSelector('#generateBtn');
        await page.waitForTimeout(300);
        await patchJsPdfSave(page);

        // idle state
        await page.locator('body').screenshot({ path: path.join(CAPTURES, 'popup-idle.png') });
        console.log('captured popup-idle');

        // professional (default) -> resume + cover letter PDFs + success shot
        await runGenerate(page);
        await page.locator('body').screenshot({ path: path.join(CAPTURES, 'popup-success.png') });
        let outputs = await drainPdfs(page);
        for (const o of outputs) {
            if (o.name.startsWith('Resume')) saveDataUri(o.data, path.join(CAPTURES, 'resume-professional.pdf'));
            if (o.name.startsWith('CoverLetter')) saveDataUri(o.data, path.join(CAPTURES, 'cover-letter.pdf'));
        }
        console.log('captured popup-success + professional pdf + cover letter');

        // faang
        await selectStyle(page, 'faang');
        await runGenerate(page);
        outputs = await drainPdfs(page);
        for (const o of outputs) {
            if (o.name.startsWith('Resume')) saveDataUri(o.data, path.join(CAPTURES, 'resume-faang.pdf'));
        }
        console.log('captured faang pdf');

        // deedy
        await selectStyle(page, 'deedy');
        await runGenerate(page);
        outputs = await drainPdfs(page);
        for (const o of outputs) {
            if (o.name.startsWith('Resume')) saveDataUri(o.data, path.join(CAPTURES, 'resume-deedy.pdf'));
        }
        console.log('captured deedy pdf');

        // academic-cv
        await selectStyle(page, 'academic-cv');
        await runGenerate(page);
        outputs = await drainPdfs(page);
        console.log('academic outputs:', JSON.stringify(outputs.map((o) => o.name)));
        console.log('status:', await page.evaluate(() => document.body.dataset.status));
        for (const o of outputs) {
            if (!o.name.startsWith('CoverLetter')) saveDataUri(o.data, path.join(CAPTURES, 'resume-academic-cv.pdf'));
        }
        console.log('captured academic-cv pdf');

        await context.close();
    }

    // ============ 2. PDF -> PNG previews ============
    for (const style of ['professional', 'faang', 'deedy', 'academic-cv']) {
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
            viewport: { width: 1680, height: 1000 },
            deviceScaleFactor: 2,
        });
        await context.addInitScript(initScript({
            applications: trackerApplications,
            trackerTrialStartedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
            trackerUnlocked: true,
            trackerPlanCache: { unlocked: true, checkedAt: Date.now() },
            trackerTourSeen: true,
            trackerLockDismissed: true,
        }));
        const page = await context.newPage();
        await page.goto(fileUrl('tracker.html'));
        await page.waitForSelector('.board-column .card', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(CAPTURES, 'tracker.png') });
        console.log('captured tracker');
        await context.close();
    }

    // ============ 4. FORM FILLER ============
    {
        const context = await browser.newContext({
            viewport: { width: 1400, height: 1500 },
            deviceScaleFactor: 2,
        });
        const page = await context.newPage();
        await page.goto(fileUrl('store-assets/templates/mock-application.html'));
        await page.addScriptTag({ path: path.join(ROOT, 'form-filler.js') });
        const result = await page.evaluate((answers) => {
            const fields = globalThis.__PocketResumeForm.detect(30);
            const answerFor = (question) => {
                const q = (question || '').toLowerCase();
                for (const [key, value] of answers) {
                    if (q.includes(key)) return value;
                }
                return '';
            };
            const payload = fields
                .map((f) => ({ id: f.id, answer: answerFor(f.question) }))
                .filter((a) => a.answer);
            const fillResult = globalThis.__PocketResumeForm.fill(payload);
            globalThis.__PocketResumeForm.toast(`Filled ${fillResult.filled} of ${fields.length} fields. Review before submitting.`);
            return { detected: fields.length, ...fillResult, questions: fields.map((f) => f.question) };
        }, FORM_ANSWERS);
        console.log('form filler:', JSON.stringify({ detected: result.detected, attempted: result.attempted, filled: result.filled }));
        console.log('questions:', JSON.stringify(result.questions, null, 2));
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(CAPTURES, 'form-filler.png') });
        console.log('captured form-filler');
        await context.close();
    }

    await browser.close();
    console.log('DONE');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
