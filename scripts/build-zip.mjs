import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Runtime files only — everything else (node_modules, convex, src, docs,
// generated build artifacts that are not shipped) stays out of the store zip.
const RUNTIME_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'form-filler.js',
  'form-profile.js',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js',
  'tracker.html',
  'tracker.js',
  'resume-renderers.js',
  'feature-video.js',
  'feature-video.css',
  'cloud-sync.js',
  'cloud-sync-core.js',
  'icon.png',
];

const RUNTIME_DIRS = ['libs', 'assets/tour'];

const version = JSON.parse(readFileSync(resolve(process.cwd(), 'manifest.json'), 'utf8')).version;

const missing = [...RUNTIME_FILES, ...RUNTIME_DIRS].filter((entry) => !existsSync(resolve(process.cwd(), entry)));
if (missing.length) {
  console.error(`[build:zip] missing runtime files: ${missing.join(', ')}`);
  console.error('[build:zip] run `npm run build:clerk` first if cloud-sync*.js is listed above.');
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
const out = `dist/pocketresume-v${version}.zip`;
rmSync(out, { force: true });

execFileSync('zip', ['-r', '-q', '-X', out, ...RUNTIME_FILES, ...RUNTIME_DIRS, '-x', '*.DS_Store'], { stdio: 'inherit' });

console.log(`[build:zip] ${out} (version ${version})`);
execFileSync('unzip', ['-l', out], { stdio: 'inherit' });
