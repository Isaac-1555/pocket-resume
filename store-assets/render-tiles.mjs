// store-assets promo tile renderer
// Usage: node store-assets/render-tiles.mjs
// Renders promo tiles at exact Chrome Web Store sizes to store-assets/promo/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ASSETS = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(ASSETS, 'templates');
const OUT = path.join(ASSETS, 'promo');
fs.mkdirSync(OUT, { recursive: true });

const TILES = [
    ['tile-small.html', 'tile-small-440x280.png', 440, 280],
    ['tile-marquee.html', 'tile-marquee-1400x560.png', 1400, 560],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const [template, out, width, height] of TILES) {
    const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(TEMPLATES, template)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, out) });
    console.log('rendered', out);
    await context.close();
}

await browser.close();
console.log('DONE');
