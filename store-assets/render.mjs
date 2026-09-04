// store-assets composite renderer
// Usage: node store-assets/render.mjs
// Renders the 5 template canvases to 1280x800 PNGs in store-assets/screenshots/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ASSETS = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(ASSETS, 'templates');
const OUT = path.join(ASSETS, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
    ['1-hero.html', '1-hero.png'],
    ['2-cover-letter.html', '2-resume-cover-letter.png'],
    ['3-layouts.html', '3-layouts.png'],
    ['4-tracker.html', '4-job-tracker.png'],
    ['5-form-filler.html', '5-form-filler.png'],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
});
const page = await context.newPage();

for (const [template, out] of SHOTS) {
    await page.goto(pathToFileURL(path.join(TEMPLATES, template)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, out) });
    console.log('rendered', out);
}

await browser.close();
console.log('DONE');
