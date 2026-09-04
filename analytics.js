// analytics.js
// Anonymous usage-stats client. Loaded by background.js (module). All sends happen here;
// popup/options/tracker forward events via the TRACK_EVENT runtime message.

const CONVEX_URL = 'https://prestigious-vulture-441.convex.cloud';

const QUEUE_KEY = 'analyticsQueue';
const CLIENT_ID_KEY = 'analyticsClientId';
const CONSENT_KEY = 'analyticsEnabled';
const LAST_ACTIVE_DAY_KEY = 'analyticsLastActiveDay';

const MAX_QUEUE = 200;
const MAX_BATCH = 50;

const EVENT_NAMES = new Set([
    'install',
    'popup_open',
    'active_day',
    'resume_generated',
    'cover_letter_generated',
    'generation_error',
    'tracker_opened',
    'application_added',
    'refine_used',
    'extract_json_used',
]);

let flushing = false;

async function getStorage(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (data) => resolve(data || {}));
    });
}

async function setStorage(payload) {
    return new Promise((resolve) => {
        chrome.storage.local.set(payload, () => resolve());
    });
}

async function getClientId() {
    const data = await getStorage(CLIENT_ID_KEY);
    if (data[CLIENT_ID_KEY]) return data[CLIENT_ID_KEY];
    const clientId = crypto.randomUUID();
    await setStorage({ [CLIENT_ID_KEY]: clientId });
    return clientId;
}

function localDateStr(ts) {
    return new Date(ts).toISOString().slice(0, 10);
}

export async function trackEvent(name, params = {}) {
    try {
        if (!EVENT_NAMES.has(name)) return;
        const data = await getStorage([CONSENT_KEY]);
        if (data[CONSENT_KEY] === false) return;

        if (name === 'active_day') {
            const today = localDateStr(Date.now());
            const dedup = await getStorage(LAST_ACTIVE_DAY_KEY);
            if (dedup[LAST_ACTIVE_DAY_KEY] === today) return;
            await setStorage({ [LAST_ACTIVE_DAY_KEY]: today });
        }

        const clientId = await getClientId();
        const event = {
            name,
            clientId,
            version: chrome.runtime.getManifest().version,
            ts: Date.now(),
        };
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string' && value.length <= 40) {
                event[key] = value;
            }
        }

        const queueData = await getStorage(QUEUE_KEY);
        const queue = Array.isArray(queueData[QUEUE_KEY]) ? queueData[QUEUE_KEY] : [];
        queue.push(event);
        await setStorage({ [QUEUE_KEY]: queue.slice(-MAX_QUEUE) });
        flush();
    } catch (error) {
        // Analytics must never break the extension.
    }
}

async function flush() {
    if (flushing) return;
    flushing = true;
    try {
        for (;;) {
            const queueData = await getStorage(QUEUE_KEY);
            const queue = Array.isArray(queueData[QUEUE_KEY]) ? queueData[QUEUE_KEY] : [];
            if (!queue.length) break;
            const batch = queue.slice(0, MAX_BATCH);
            const ok = await sendBatch(batch);
            if (!ok) break;
            await setStorage({ [QUEUE_KEY]: queue.slice(batch.length) });
        }
    } catch (error) {
        // Keep the queue for the next flush.
    } finally {
        flushing = false;
    }
}

async function sendBatch(events) {
    try {
        const response = await fetch(`${CONVEX_URL}/api/mutation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'analytics:ingestBatch', args: { events }, format: 'json' }),
        });
        if (!response.ok) return false;
        const result = await response.json();
        return result && result.status === 'success';
    } catch (error) {
        return false;
    }
}
