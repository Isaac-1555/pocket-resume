// Free-access regression guard.
// Everything is free: generation, the Form Filler and the Job Tracker must
// never be gated on a session or a plan, and the only paid thing is the
// optional Supporter badge.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

let failures = 0;
function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  ok   ${name}`);
        return;
    }
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const background = read('background.js');
const sidebar = read('sidebar.js');
const options = read('options.js');
const tracker = read('tracker.js');
const cloudSync = read('src/cloud-sync.js');

console.log('Access model');

check(
    'worker access gate always allows',
    /async function getGenerationAccess\(\)\s*\{[\s\S]*?allowed:\s*true/.test(background)
);
check(
    'worker reports the snapshot instead of gating on it',
    /isSupporter:\s*!!\(cached && \(cached\.isSupporter \|\| cached\.isPro\)\)/.test(background)
);
check(
    'no gated statuses reach the worker replies',
    !/signin_required|plan_required/.test(background)
);
check(
    'no access window left in the worker',
    !/ACCESS_WINDOW|withinAccessWindow/.test(background)
);
check(
    'generation reply is not access-checked',
    !/const access = await getGenerationAccess\(\);[\s\S]{0,120}sendResponse\(\{ status: access\.reason/.test(background)
);

console.log('Free sync, optional Supporter');

check(
    'cloud sync needs a session only',
    /async function hasCloudSyncAccess\(\)\s*\{\s*return !!\(await getAccessState\(\)\)\.signedIn;/.test(cloudSync)
);
check(
    'generation is always allowed in the page state',
    /canGenerate:\s*true/.test(cloudSync)
);
check(
    'no access window constants in the source',
    !/ACCESS_WINDOW|isAccessWindowActive|isPromoTrialActive/.test(cloudSync)
);
check(
    'a trialing subscription is not a Supporter',
    /const isActive = \(entry\) => String\(\(entry && entry\.status\) \|\| ''\)\.toLowerCase\(\) === 'active'/.test(cloudSync)
);
check(
    'supporter plan slug is unchanged',
    /requiredPlan: 'pocketresume_pro'/.test(cloudSync)
);
check(
    'no trial extension call is left',
    !/extendEarlyTrial/.test(cloudSync)
);
check(
    'sync failure asks for a session, not a plan',
    /Sign in to sync your resumes across devices\./.test(cloudSync) && !/Subscribe to sync/.test(cloudSync)
);

console.log('Panel');

check('panel has no blocking sign-in state', !/'signin'/.test(sidebar) && !/state = 'plan'/.test(sidebar));
check('panel still has the review gate', /state = 'review'/.test(sidebar));
check('panel has no Form Filler paywall card', !/showFillProCard/.test(sidebar));
check('panel account button offers Sign in / Account / Supporter', /setAccountLabel\('Sign in'\)/.test(sidebar) && /setAccountLabel\('Account'\)/.test(sidebar) && /Supporter/.test(sidebar));
check('supporter nudge is dismissible', /supporterNudgeSeen/.test(sidebar));

console.log('Settings + tracker');

check('account card says no account is needed', /No account needed/.test(read('options.html')));
check('settings mention the supporter plan', /Support PocketResume/.test(read('options.html')));
check('no trial copy in options logic', !/trialDaysLeft|free trial/i.test(options));
check('tracker has no lock state', !/let locked = false/.test(tracker) && !/applyLockCopy/.test(tracker));
check('tracker badge is Free or Supporter', /badge\.textContent = 'Free'/.test(tracker) && /Supporter/.test(tracker));
check('tracker markup has no lock banner', !/id="lockBanner"/.test(read('tracker.html')));

console.log('Docs');

const readme = read('README.md');
const privacy = read('privacy-policy.md');
check('README leads with a free-forever promise', /Free forever/.test(readme));
check('README no longer requires an account to generate', !/Create a free account \(required to generate/.test(readme));
check('privacy policy makes sign-in optional', /Signing in is optional/.test(privacy) && !/required for generation/.test(privacy));

console.log('');
if (failures) {
    console.error(`${failures} access check${failures === 1 ? '' : 's'} failed.`);
    process.exit(1);
}
console.log('Access model is free: no account, no paywall, optional Supporter badge.');
