// Feedback form: validation, payload build, and the send path. The message
// goes to the developer's own Convex backend, which emails it to the
// developer. A prefilled mailto is the fallback when the backend is missing.

const FEEDBACK_MIN_LENGTH = 10;
const FEEDBACK_MAX_LENGTH = 2000;
const FEEDBACK_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FEEDBACK_OWNER_EMAIL = 'feedback@pocket-resume.xyz';
const FEEDBACK_TIMEOUT_MS = 20000;

function validateFeedback(input = {}) {
    const email = String(input.email || '').trim();
    const message = String(input.message || '').trim();
    if (!email) return { ok: false, error: 'Add your email so the developer can reply.' };
    if (!FEEDBACK_EMAIL_PATTERN.test(email)) return { ok: false, error: 'That email address does not look right.' };
    if (!message) return { ok: false, error: 'Write a message first.' };
    if (message.length < FEEDBACK_MIN_LENGTH) {
        return { ok: false, error: `Your message needs at least ${FEEDBACK_MIN_LENGTH} characters.` };
    }
    if (message.length > FEEDBACK_MAX_LENGTH) {
        return { ok: false, error: `Your message is over ${FEEDBACK_MAX_LENGTH} characters.` };
    }
    return { ok: true, email, message };
}

function buildFeedbackPayload(input = {}) {
    const clean = validateFeedback(input);
    if (!clean.ok) return { ok: false, error: clean.error };
    const payload = { email: clean.email, message: clean.message };
    if (input.pageUrl) payload.pageUrl = String(input.pageUrl).slice(0, 500);
    if (input.appVersion) payload.appVersion = String(input.appVersion).slice(0, 40);
    if (input.browser) payload.browser = String(input.browser).slice(0, 200);
    if (input.userId) payload.userId = String(input.userId).slice(0, 100);
    if (input.company) payload.company = String(input.company).slice(0, 100);
    return { ok: true, payload };
}

function buildMailtoLink(payload = {}) {
    const body = [
        payload.message || '',
        '',
        `From: ${payload.email || ''}`,
        payload.pageUrl ? `Page: ${payload.pageUrl}` : '',
        payload.appVersion ? `Extension version: ${payload.appVersion}` : ''
    ].filter((line) => line !== '').join('\n');
    const subject = encodeURIComponent('PocketResume feedback');
    return `mailto:${FEEDBACK_OWNER_EMAIL}?subject=${subject}&body=${encodeURIComponent(body)}`;
}

function mapFeedbackError(error) {
    const message = String((error && error.message) || '');
    if (message.includes('rate_limited')) return 'Too many messages right now. Try again later.';
    if (message.includes('invalid_email')) return 'That email address does not look right.';
    if (message.includes('invalid_message')) return 'Your message is too short.';
    if (error && error.name === 'AbortError') return 'The feedback service took too long to answer.';
    return 'Could not send your message. Try again in a moment.';
}

async function sendFeedback(input = {}) {
    const built = buildFeedbackPayload(input);
    if (!built.ok) return { ok: false, error: built.error };
    const cloud = globalThis.CloudSync;
    if (!cloud || typeof cloud.sendFeedback !== 'function') {
        return {
            ok: false,
            autoOpen: true,
            error: 'Feedback is not configured in this build.',
            mailto: buildMailtoLink(built.payload)
        };
    }
    let timer = null;
    try {
        const result = await Promise.race([
            Promise.resolve(cloud.sendFeedback(built.payload)),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const error = new Error('feedback timeout');
                    error.name = 'AbortError';
                    reject(error);
                }, FEEDBACK_TIMEOUT_MS);
            })
        ]);
        return { ok: true, emailed: !(result && result.emailed === false) };
    } catch (error) {
        return {
            ok: false,
            error: mapFeedbackError(error),
            mailto: buildMailtoLink(built.payload)
        };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function readAppVersion() {
    try {
        return chrome.runtime.getManifest().version || '';
    } catch {
        return '';
    }
}

function readBrowserName() {
    try {
        return navigator.userAgent || '';
    } catch {
        return '';
    }
}

async function readAccountId() {
    const cloud = globalThis.CloudSync;
    if (!cloud || typeof cloud.getUserId !== 'function') return '';
    try {
        // The account id is a nicety — never let a slow Clerk hold up the send.
        return (await withTimeout(cloud.getUserId(), 2500)) || '';
    } catch {
        return '';
    }
}

function withTimeout(promise, ms) {
    let timer = null;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                const error = new Error('timeout');
                error.name = 'AbortError';
                reject(error);
            }, ms);
        })
    ]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

async function readActivePageUrl() {
    try {
        const reply = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PAGE' });
        if (reply && reply.status === 'success' && reply.url) return String(reply.url);
    } catch {
        // No page to report is not an error — the message still goes.
    }
    return '';
}

function openMailto(link) {
    try {
        if (chrome && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: link });
            return true;
        }
    } catch {
        // fall through to the anchor path
    }
    try {
        window.location.href = link;
        return true;
    } catch {
        return false;
    }
}

function mountFeedbackForm() {
    const emailInput = document.getElementById('feedbackEmail');
    const messageInput = document.getElementById('feedbackMessage');
    const companyInput = document.getElementById('feedbackCompany');
    const includeUrlToggle = document.getElementById('feedbackIncludeUrl');
    const sendButton = document.getElementById('feedbackSendBtn');
    const mailtoButton = document.getElementById('feedbackMailtoBtn');
    const statusEl = document.getElementById('feedbackStatus');
    const pill = document.getElementById('feedbackStatePill');
    if (!emailInput || !messageInput || !sendButton) return null;

    function setStatus(text, kind) {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.classList.remove('feedback-status-ok', 'feedback-status-error');
        if (kind === 'ok') statusEl.classList.add('feedback-status-ok');
        if (kind === 'error') statusEl.classList.add('feedback-status-error');
    }

    function showMailto(link) {
        if (!mailtoButton || !link) return;
        mailtoButton.dataset.mailto = link;
        mailtoButton.style.display = '';
    }

    async function prefillEmail() {
        if (emailInput.value) return;
        try {
            const stored = await chrome.storage.local.get('applicationProfile');
            const saved = stored && stored.applicationProfile ? stored.applicationProfile.email : '';
            if (saved) emailInput.value = saved;
        } catch {
            // No saved profile — the user types their email.
        }
        if (emailInput.value) return;
        const cloud = globalThis.CloudSync;
        if (!cloud || typeof cloud.getUserEmail !== 'function') return;
        try {
            const mail = await withTimeout(cloud.getUserEmail(), 2500);
            if (mail) emailInput.value = mail;
        } catch {
            // Signed out or Clerk unavailable.
        }
    }

    async function submit() {
        const built = buildFeedbackPayload({
            email: emailInput.value,
            message: messageInput.value,
            company: companyInput ? companyInput.value : '',
            pageUrl: includeUrlToggle && includeUrlToggle.checked ? await readActivePageUrl() : '',
            appVersion: readAppVersion(),
            browser: readBrowserName(),
            userId: await readAccountId()
        });
        if (!built.ok) {
            setStatus(built.error, 'error');
            return;
        }

        const label = sendButton.querySelector('span');
        const originalLabel = label ? label.textContent : '';
        sendButton.disabled = true;
        if (label) label.textContent = 'Sending...';
        if (mailtoButton) mailtoButton.style.display = 'none';
        setStatus('Sending your message...', '');

        const result = await sendFeedback(built.payload);
        sendButton.disabled = false;
        if (label) label.textContent = originalLabel;

        if (result.ok) {
            messageInput.value = '';
            if (companyInput) companyInput.value = '';
            if (pill) pill.textContent = 'Sent';
            if (result.emailed) {
                setStatus('Thanks — your message is on its way.', 'ok');
            } else {
                setStatus('Thanks — your message was saved, but email delivery is not set up on this build.', 'error');
            }
            return;
        }

        setStatus(result.error || 'Could not send your message.', 'error');
        showMailto(result.mailto);
        if (result.autoOpen && result.mailto) {
            openMailto(result.mailto);
            setStatus('Opened your mail app — send the message from there.', 'error');
        }
    }

    sendButton.addEventListener('click', submit);
    if (mailtoButton) {
        mailtoButton.addEventListener('click', () => {
            const link = mailtoButton.dataset.mailto;
            if (link) openMailto(link);
        });
    }
    prefillEmail();

    return { submit, setStatus };
}

const api = {
    FEEDBACK_OWNER_EMAIL,
    FEEDBACK_MIN_LENGTH,
    FEEDBACK_MAX_LENGTH,
    validateFeedback,
    buildFeedbackPayload,
    buildMailtoLink,
    mapFeedbackError,
    sendFeedback,
    mountFeedbackForm
};

if (typeof window !== 'undefined') window.PocketResumeFeedback = api;

export default api;

export {
    FEEDBACK_OWNER_EMAIL,
    FEEDBACK_MIN_LENGTH,
    FEEDBACK_MAX_LENGTH,
    validateFeedback,
    buildFeedbackPayload,
    buildMailtoLink,
    mapFeedbackError,
    sendFeedback,
    mountFeedbackForm
};
