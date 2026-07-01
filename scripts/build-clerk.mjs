import { build } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));

const clerkKey = process.env.CLERK_PUBLISHABLE_KEY ?? '';
const convexUrl = process.env.CONVEX_URL ?? '';

if (!clerkKey) {
  console.warn('[build:clerk] CLERK_PUBLISHABLE_KEY is empty. Cloud sync will be disabled until you set it.');
}
if (!convexUrl) {
  console.warn('[build:clerk] CONVEX_URL is empty. Cloud sync will be disabled until you set it.');
}

await build({
  entryPoints: ['src/cloud-sync.js'],
  bundle: true,
  outfile: 'cloud-sync.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  define: {
    'process.env.CLERK_PUBLISHABLE_KEY': JSON.stringify(clerkKey),
    'process.env.CONVEX_URL': JSON.stringify(convexUrl),
  },
  logLevel: 'info',
});
