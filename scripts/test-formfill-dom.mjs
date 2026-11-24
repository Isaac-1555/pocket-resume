// scripts/test-formfill-dom.mjs
// Form Filler DOM tests: detection and filling against real form markup from
// the ATS platforms the filler has to survive (BambooHR/MUI, Ashby, Lever).
// Fixtures are local, so the test needs no network. It needs a browser: when
// Chromium is not installed the test says so and passes.
//
// Usage: npm run test:formfill-dom

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'form-filler.js'), 'utf8');

let chromium = null;
try {
    ({ chromium } = await import('playwright'));
} catch (error) {
    console.log('form fill DOM tests skipped (playwright is not installed)');
    process.exit(0);
}

let browser = null;
try {
    browser = await chromium.launch();
} catch (error) {
    console.log('form fill DOM tests skipped (no Chromium available)');
    process.exit(0);
}

async function detectIn(html) {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.addScriptTag({ content: source });
    const fields = await page.evaluate(() => globalThis.__PocketResumeForm.detect(30));
    await page.close();
    return fields;
}

async function fillIn(html, byQuestion) {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.addScriptTag({ content: source });
    const result = await page.evaluate((map) => {
        const detected = globalThis.__PocketResumeForm.detect(30);
        const answers = detected
            .filter((field) => Object.prototype.hasOwnProperty.call(map, field.question))
            .map((field) => ({ id: field.id, answer: map[field.question] }));
        const filled = globalThis.__PocketResumeForm.fill(answers);
        const state = {};
        for (const el of document.querySelectorAll('input, textarea, select')) {
            state[el.id || el.name || el.type] = el.type === 'radio' || el.type === 'checkbox'
                ? el.checked
                : el.value;
        }
        return { filled, state, detected };
    }, byQuestion);
    await page.close();
    return result;
}

// --- A radio group painted by MUI (BambooHR): the inputs are transparent and
// the question sits in a sibling label, not in a <label for> that points at an
// input. ---

const muiRadio = await detectIn(`
    <form>
        <div class="MuiFormControl-root">
            <label class="MuiFormLabel-root" for="sponsor">Will you now or in the future require employer sponsorship?</label>
            <div class="MuiRadioGroup-root">
                <span class="Radio-root"><label><input type="radio" name="sponsor" value="Yes" style="opacity: 0"><span>Yes</span></label></span>
                <span class="Radio-root"><label><input type="radio" name="sponsor" value="No" style="opacity: 0"><span>No</span></label></span>
            </div>
        </div>
    </form>
`);
assert.equal(muiRadio.length, 1, 'the transparent radio group is detected');
assert.equal(muiRadio[0].tag, 'radio', 'it is detected as a radio group');
assert.equal(
    muiRadio[0].question,
    'Will you now or in the future require employer sponsorship?',
    'the group question comes from the sibling label'
);
assert.deepEqual(muiRadio[0].options, ['Yes', 'No'], 'both answers are read');

// --- Ashby: the question label points at the group name, the option labels at
// the inputs. ---

const ashbyRadio = await detectIn(`
    <form>
        <fieldset class="radio-group">
            <label class="question-title" for="experience">How many years of relevant professional experience do you have?</label>
            <div class="option"><input type="radio" id="experience-0" name="experience" value="1-2 years" style="opacity: 0"><label for="experience-0">1-2 years</label></div>
            <div class="option"><input type="radio" id="experience-1" name="experience" value="3-5 years" style="opacity: 0"><label for="experience-1">3-5 years</label></div>
        </fieldset>
    </form>
`);
assert.equal(ashbyRadio.length, 1, 'the Ashby radio group is detected');
assert.equal(
    ashbyRadio[0].question,
    'How many years of relevant professional experience do you have?',
    'the group question comes from the label that points at the group'
);

// --- Lever: the question sits in a sibling block, the options in a list. ---

const leverRadio = await detectIn(`
    <form>
        <div>
            <div class="application-label"><div class="text">Are you legally authorized to work in the United States?</div></div>
            <div class="application-field"><ul><li><label><input type="radio" name="cards[field0]" value="Yes"><span class="application-answer-alternative">Yes</span></label></li><li><label><input type="radio" name="cards[field0]" value="No"><span class="application-answer-alternative">No</span></label></li></ul></div>
        </div>
    </form>
`);
assert.equal(leverRadio.length, 1, 'the Lever radio group is detected');
assert.equal(
    leverRadio[0].question,
    'Are you legally authorized to work in the United States?',
    'the group question comes from the sibling block'
);
assert.deepEqual(leverRadio[0].options, ['Yes', 'No'], 'both answers are read');

// --- A label that wraps the control must not read as the question plus every
// option (Lever renders the EEO descriptions next to the select). ---

const leverSelect = await detectIn(`
    <form>
        <label><div class="application-label multiple-choice">Race<a href="#" title="info">i</a></div><div class="application-field"><div class="application-dropdown"><select name="eeo[race]"><option value="">Select ...</option><option value="White">White (Not Hispanic or Latino)</option></select></div></div><ul style="display: none"><li><div>White</div><div>A person having origins in any of the original peoples of Europe.</div></li></ul></label>
    </form>
`);
assert.equal(leverSelect.length, 1, 'the select is detected');
assert.equal(leverSelect[0].tag, 'select', 'it is detected as a select');
assert.equal(leverSelect[0].question, 'Race', 'the question is the label, not the options');
assert.deepEqual(leverSelect[0].options, ['Select ...', 'White (Not Hispanic or Latino)'], 'the options are read');

// --- A custom dropdown (BambooHR Fabric) has no fillable control, so it is
// reported as a field the user has to answer. ---

const fabricSelect = await detectIn(`
    <form>
        <div class="fab-Select">
            <button aria-haspopup="true" aria-label="Province –Select–" type="button"><div class="fab-SelectToggle__placeholder">–Select–</div></button>
            <select aria-hidden="true" name="state.value" style="width: 0; height: 0; opacity: 0"><option value=""></option></select>
        </div>
    </form>
`);
assert.equal(fabricSelect.length, 1, 'the custom dropdown is reported');
assert.equal(fabricSelect[0].tag, 'select-widget', 'it is not a fillable control');
assert.equal(fabricSelect[0].question, 'Province', 'the question comes from the toggle label');

// --- Honeypots are never filled. ---

const honeypot = await detectIn(`
    <form>
        <input type="text" name="nickname_hpcsaf" id="nickname_hpcsaf" placeholder="Enter your text here" style="position: absolute; left: -9999px">
        <label for="nickname_hpcsaf">Please leave this field blank</label>
        <input type="text" name="firstName" id="firstName">
        <label for="firstName">First Name</label>
    </form>
`);
assert.equal(honeypot.length, 1, 'only the real field is detected');
assert.equal(honeypot[0].question, 'First Name', 'the real field is the one that is kept');

// --- Filling: text, radio and checkbox answers reach the page. ---

const filled = await fillIn(`
    <form>
        <label for="firstName">First Name</label>
        <input type="text" name="firstName" id="firstName">
        <fieldset><label for="sponsor">Do you require sponsorship?</label>
            <input type="radio" id="sponsor-0" name="sponsor" value="Yes" style="opacity: 0"><label for="sponsor-0">Yes</label>
            <input type="radio" id="sponsor-1" name="sponsor" value="No" style="opacity: 0"><label for="sponsor-1">No</label>
        </fieldset>
        <label for="consent">I agree to the privacy policy</label>
        <input type="checkbox" id="consent" name="consent">
    </form>
`, {
    'First Name': 'Jordan',
    'Do you require sponsorship?': 'No'
});
assert.equal(filled.filled.filled, 2, 'the text field and the radio group are filled');
assert.equal(filled.state.firstName, 'Jordan', 'the text field holds the answer');
assert.equal(filled.state['sponsor-1'], true, 'the radio group holds the answer');
assert.equal(filled.state['sponsor-0'], false, 'the other radio stays empty');
assert.equal(filled.state.consent, false, 'a consent checkbox is never touched');

// --- Attaching: the file lands on the page's upload field. ---

async function attachIn(html, filename, options = {}) {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.addScriptTag({ content: source });
    const result = await page.evaluate(({ name, kind, target }) => {
        const dataUrl = 'data:application/pdf;base64,' + btoa('%PDF-1.4 pocketresume');
        const node = target ? document.querySelector(target) : null;
        const outcome = globalThis.__PocketResumeForm.attachFile({
            filename: name,
            mime: 'application/pdf',
            dataUrl,
            kind: kind || '',
            target: node
        });
        const state = {};
        for (const el of document.querySelectorAll('input[type="file"]')) {
            state[el.id || el.name] = el.files && el.files[0] ? el.files[0].name : '';
        }
        return { outcome, state };
    }, { name: filename, ...(options || {}) });
    await page.close();
    return result;
}

const attached = await attachIn(`
    <form>
        <label for="nickname">Nickname</label>
        <input type="file" id="nickname" name="nickname" style="position: absolute; left: -9999px">
        <label for="resumeUpload">Resume</label>
        <input type="file" id="resumeUpload" name="resumeUpload" accept="application/pdf">
    </form>
`, 'Jordan_Lee_Resume.pdf');
assert.equal(attached.outcome.attached, true, 'the file is attached');
assert.equal(attached.outcome.filename, 'Jordan_Lee_Resume.pdf', 'the attached file keeps its name');
assert.equal(attached.state.resumeUpload, 'Jordan_Lee_Resume.pdf', 'the resume upload field holds the file');
assert.equal(attached.state.nickname, '', 'the spam trap is never used');

const hiddenUpload = await attachIn(`
    <form>
        <div>
            <button type="button">Upload resume</button>
            <input type="file" id="cv" name="cv" style="display: none">
        </div>
    </form>
`, 'Jordan_Lee_Resume.pdf');
assert.equal(hiddenUpload.outcome.attached, true, 'a hidden input behind an upload button is used');
assert.equal(hiddenUpload.state.cv, 'Jordan_Lee_Resume.pdf', 'the hidden upload field holds the file');

const noInput = await attachIn(`
    <form>
        <label for="firstName">First Name</label>
        <input type="text" id="firstName" name="firstName">
    </form>
`, 'Jordan_Lee_Resume.pdf');
assert.equal(noInput.outcome.attached, false, 'a page without an upload field reports no attachment');

// --- Ashby: an autofill upload plus a Resume and a Cover Letter field. The
// cover letter must not land on the resume field, and the two files must be
// able to sit side by side. ---

const ASHBY_UPLOADS = `
    <form id="form">
        <div class="ashby-application-form-autofill-input-root">
            <div>Autofill from resume</div>
            <input type="file" accept="application/pdf,.pdf" style="opacity: 0">
            <button type="button">Upload file</button>
        </div>
        <div class="ashby-application-form-field-entry" id="resumeEntry">
            <label class="ashby-application-form-question-title" for="_systemfield_resume">Resume</label>
            <div class="ashby-application-form-input-file"><input type="file" id="_systemfield_resume" accept="application/pdf,.pdf"></div>
        </div>
        <div class="ashby-application-form-field-entry" id="letterEntry">
            <label class="ashby-application-form-question-title" for="cover_letter">Cover Letter</label>
            <div class="ashby-application-form-input-file"><input type="file" id="cover_letter" accept="application/pdf,.pdf"></div>
        </div>
    </form>
`;

const letterAttach = await attachIn(ASHBY_UPLOADS, 'Jordan_Lee_Cover_Letter.pdf', { kind: 'cover-letter' });
assert.equal(letterAttach.outcome.attached, true, 'the cover letter is attached');
assert.equal(letterAttach.state.cover_letter, 'Jordan_Lee_Cover_Letter.pdf', 'the cover letter field holds the file');
assert.equal(letterAttach.state._systemfield_resume, '', 'the resume field is left empty');

const bothAttach = await (async () => {
    const page = await browser.newPage();
    await page.setContent(ASHBY_UPLOADS);
    await page.addScriptTag({ content: source });
    const state = await page.evaluate(() => {
        const dataUrl = 'data:application/pdf;base64,' + btoa('%PDF-1.4 pocketresume');
        const api = globalThis.__PocketResumeForm;
        api.attachFile({ filename: 'Jordan_Lee_Resume.pdf', mime: 'application/pdf', dataUrl, kind: 'resume' });
        api.attachFile({ filename: 'Jordan_Lee_Cover_Letter.pdf', mime: 'application/pdf', dataUrl, kind: 'cover-letter' });
        const files = {};
        for (const el of document.querySelectorAll('input[type="file"]')) {
            files[el.id || 'autofill'] = el.files && el.files[0] ? el.files[0].name : '';
        }
        return files;
    });
    await page.close();
    return state;
})();
assert.equal(bothAttach._systemfield_resume, 'Jordan_Lee_Resume.pdf', 'the resume keeps its own file');
assert.equal(bothAttach.cover_letter, 'Jordan_Lee_Cover_Letter.pdf', 'the cover letter sits beside it');

// Without a kind, the field under the drop target decides.
const targetedDrop = await attachIn(ASHBY_UPLOADS, 'Jordan_Lee_Cover_Letter.pdf', { target: '#letterEntry' });
assert.equal(targetedDrop.state.cover_letter, 'Jordan_Lee_Cover_Letter.pdf', 'the drop target picks the field');
assert.equal(targetedDrop.state._systemfield_resume, '', 'the resume field is untouched');

// A cover letter never replaces the resume on a form with a single resume field.
const mismatch = await attachIn(`
    <form>
        <label for="resumeUpload">Resume</label>
        <input type="file" id="resumeUpload" accept="application/pdf">
    </form>
`, 'Jordan_Lee_Cover_Letter.pdf', { kind: 'cover-letter' });
assert.equal(mismatch.outcome.attached, false, 'a mismatched upload is refused');
assert.equal(mismatch.outcome.reason, 'kind-mismatch', 'the reason says why');
assert.equal(mismatch.state.resumeUpload, '', 'the resume upload is left alone');

// --- The page holds the upload behind a consent dialog (Eightfold): the dialog
// must be brought into view instead of leaving the page looking unchanged. ---

const prompt = await (async () => {
    const page = await browser.newPage();
    await page.setContent(`
        <form>
            <label for="resumeUpload">Resume</label>
            <input type="file" id="resumeUpload" name="resumeUpload" accept="application/pdf">
        </form>
        <div id="consent" role="dialog" style="display: none">Data Privacy Agreement — I agree</div>
        <script>
            document.getElementById('resumeUpload').addEventListener('change', () => {
                document.getElementById('consent').style.display = 'block';
            });
        </script>
    `);
    await page.addScriptTag({ content: source });
    const outcome = await page.evaluate(() => {
        const dataUrl = 'data:application/pdf;base64,' + btoa('%PDF-1.4 pocketresume');
        return globalThis.__PocketResumeForm.attachFile({ filename: 'Jordan_Lee_Resume.pdf', mime: 'application/pdf', dataUrl });
    });
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
        flagged: document.getElementById('consent').classList.contains('pr-flag'),
        toast: document.getElementById('pocketresume-form-toast')?.textContent || ''
    }));
    await page.close();
    return { outcome, state };
})();
assert.equal(prompt.outcome.attached, true, 'the file is attached before the dialog opens');
assert.equal(prompt.state.flagged, true, 'the consent dialog is outlined so it cannot be missed');
assert.match(prompt.state.toast, /answer the page's prompt to finish/, 'the toast says what to do next');

await browser.close();
console.log('form fill DOM tests passed');
