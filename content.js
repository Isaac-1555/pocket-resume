// content.js
console.log("PocketResume Content Script Ready");

function normalizeText(text) {
    return String(text || '')
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim();
}

function largestBlockText() {
    let best = '';
    const selectors = ['main', '[role="main"]', 'article', '#content', '#main', '.job-description', '[class*="jobDescription" i]', '[class*="job-details" i]'];
    for (const selector of selectors) {
        let nodes = [];
        try {
            nodes = document.querySelectorAll(selector);
        } catch {
            continue;
        }
        nodes.forEach((node) => {
            if (!node || typeof node.innerText !== 'string') return;
            const text = normalizeText(node.innerText);
            if (text.length > best.length) best = text;
        });
    }
    return best;
}

function extractPageText() {
    const bodyText = normalizeText(document.body ? document.body.innerText : '');
    const mainText = largestBlockText();
    const text = mainText.length > 400 ? `${mainText}\n${bodyText}` : bodyText;
    return normalizeText(text).substring(0, 100000);
}

function htmlToText(html) {
    if (!html) return '';
    const holder = document.createElement('div');
    holder.innerHTML = String(html);
    holder.querySelectorAll('script,style,noscript').forEach((node) => node.remove());
    holder.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
    const blocks = 'p,div,li,ul,ol,section,article,header,footer,h1,h2,h3,h4,h5,h6,tr,table,blockquote';
    holder.querySelectorAll(blocks).forEach((node) => {
        node.prepend('\n');
        node.append('\n');
    });
    return String(holder.textContent || '')
        .replace(/\r/g, '')
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/ *\n */g, '\n')
        .trim()
        .substring(0, 20000);
}

function flattenJobPostings(node, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((entry) => flattenJobPostings(entry, out));
        return;
    }
    const types = [].concat(node['@type'] || []);
    if (types.some((type) => String(type).toLowerCase() === 'jobposting')) {
        out.push(node);
    }
    if (node['@graph']) flattenJobPostings(node['@graph'], out);
    if (node.mainEntity) flattenJobPostings(node.mainEntity, out);
}

function addressLocation(address) {
    if (!address || typeof address !== 'object') return '';
    const locality = String(address.addressLocality || '').split(',')[0].trim();
    const region = String(address.addressRegion || '').split(',')[0].trim();
    const countryValue = address.addressCountry;
    const country = typeof countryValue === 'string'
        ? countryValue.trim()
        : String((countryValue && countryValue.name) || '').trim();
    const parts = [locality, region].filter(Boolean);
    const place = parts.join(', ');
    if (!place) return country;
    if (country && !parts.some((part) => part.toLowerCase() === country.toLowerCase())) {
        return `${place}, ${country}`;
    }
    return place;
}

function structuredLocations(posting) {
    const nodes = [].concat(posting && posting.jobLocation ? posting.jobLocation : []);
    const out = [];
    const seen = new Set();
    nodes.forEach((node) => {
        if (!node) return;
        const address = node.address || node;
        const value = addressLocation(address);
        if (!value) return;
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(value);
    });
    if (!out.length) {
        const requirements = [].concat(posting && posting.applicantLocationRequirements ? posting.applicantLocationRequirements : []);
        requirements.forEach((node) => {
            const value = addressLocation(node.address || node);
            if (!value) return;
            const key = value.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(value);
        });
    }
    return out;
}

function nodeText(node, limit = 200) {
    if (!node) return '';
    const raw = typeof node.innerText === 'string' && node.innerText.trim() ? node.innerText : node.textContent;
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

const TITLE_SELECTORS = [
    '[class*="job-ad-title" i]',
    '[class*="job-title" i]',
    '[class*="jobtitle" i]',
    '[class*="position-title" i]',
    '[class*="posting-title" i]',
    '[data-testid*="job-title" i]',
    '[id*="job-title" i]',
    '[class*="title" i][class*="job" i]'
];

function collectTitleCandidates(postings) {
    const out = [];
    const seen = new Set();
    const push = (value, source) => {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 200) return;
        const key = `${source}:${text.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ value: text, source });
    };

    const here = String(location.href || '').split('?')[0];
    const postingUrl = (posting) => {
        if (!posting || typeof posting !== 'object') return '';
        const raw = posting.url
            || (posting.mainEntityOfPage && (posting.mainEntityOfPage['@id'] || posting.mainEntityOfPage.url))
            || '';
        return String(raw || '').split('?')[0];
    };
    const ordered = [...postings].sort((a, b) => {
        const score = (posting) => {
            const url = postingUrl(posting);
            if (!url || !here) return 0;
            if (url === here || here.startsWith(url)) return 2;
            return 0;
        };
        return score(b) - score(a);
    });

    ordered.slice(0, 4).forEach((posting) => push(posting && posting.title, 'jsonld'));

    const meta = (selector) => {
        const node = document.querySelector(selector);
        return node ? node.getAttribute('content') : '';
    };
    push(meta('meta[property="og:title"]'), 'og');
    push(meta('meta[name="twitter:title"]'), 'twitter');

    TITLE_SELECTORS.forEach((selector) => {
        let nodes = [];
        try {
            nodes = document.querySelectorAll(selector);
        } catch {
            return;
        }
        [...nodes]
            .filter((node) => {
                try {
                    if (node.querySelector(selector)) return false;
                    if (node.querySelector('h1, h2, h3')) return false;
                    return true;
                } catch {
                    return true;
                }
            })
            .slice(0, 3)
            .forEach((node) => push(nodeText(node, 120), 'class'));
    });

    const main = document.querySelector('main, [role="main"], article');
    const headings = [];
    if (main) {
        [...main.querySelectorAll('h1, h2, h3')].slice(0, 6).forEach((node) => headings.push(nodeText(node)));
    }
    [...document.querySelectorAll('h1')].slice(0, 3).forEach((node) => {
        const text = nodeText(node);
        if (text) headings.unshift(text);
    });
    headings.forEach((heading) => push(heading, 'h1'));
    if (main) {
        [...main.querySelectorAll('h2, h3')].slice(0, 4).forEach((node) => push(nodeText(node), 'heading'));
    }

    push(document.title, 'doc-title');

    return { candidates: out, headings: [...new Set(headings)].slice(0, 8) };
}

function extractStructuredData() {
    const postings = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        try {
            flattenJobPostings(JSON.parse(script.textContent || ''), postings);
        } catch {
        }
    });

    const here = String(window.location.href || '').split('?')[0];
    const posting = postings.find((item) => {
        if (!item || typeof item !== 'object') return false;
        const raw = item.url
            || (item.mainEntityOfPage && (item.mainEntityOfPage['@id'] || item.mainEntityOfPage.url))
            || '';
        const value = String(raw || '').split('?')[0];
        return !!value && !!here && (value === here || here.startsWith(value));
    }) || postings[0] || null;
    const locations = structuredLocations(posting);
    const primaryLocation = locations[0] || '';

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const h1 = document.querySelector('h1');
    const titles = collectTitleCandidates(postings);

    return {
        title: posting?.title || '',
        titleCandidates: titles.candidates,
        headings: titles.headings,
        postingCount: postings.length,
        company: posting?.hiringOrganization?.name || posting?.hiringOrganization?.[0]?.name || '',
        location: primaryLocation,
        locations,
        remote: posting?.jobLocationType === 'TELECOMMUTE',
        description: posting?.description ? htmlToText(posting.description).substring(0, 20000) : '',
        employmentType: [].concat(posting?.employmentType || []).join(', '),
        pageHeading: h1 ? h1.textContent.replace(/\s+/g, ' ').trim().substring(0, 200) : '',
        headline: ogTitle ? String(ogTitle.getAttribute('content') || '').substring(0, 200) : '',
    };
}

function pageLooksUnready(text) {
    if (!text || text.length < 1500) return true;
    return /(?:^|\n)\s*(?:loading|we didn'?t find any|no results|searching)/i.test(text.slice(0, 500));
}

async function collectPageContent() {
    const readStructured = () => {
        try {
            return extractStructuredData();
        } catch (error) {
            console.warn('PocketResume structured extraction failed:', error);
            return {};
        }
    };

    let structured = readStructured();
    let text = extractPageText();
    const hasDescription = !!String(structured.description || '').trim();

    if (!hasDescription && pageLooksUnready(text)) {
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            text = extractPageText();
            structured = readStructured();
            if (String(structured.description || '').trim() || !pageLooksUnready(text)) break;
        }
    }

    return { text, structured, title: document.title, url: window.location.href };
}

function frameSnapshotData() {
    const structured = extractStructuredData();
    const bodyLength = document.body ? document.body.innerText.length : 0;
    const host = String(location.hostname || '');
    const skipText = /(?:recaptcha|doubleclick|googletagmanager|google-analytics|facebook|messenger|qualified|cookiebot|hubspot|intercom|drift|youtube|vimeo|stripe|paypal)/i.test(host);
    return {
        url: location.href,
        host,
        docTitle: document.title,
        candidates: structured.titleCandidates || [],
        hasJobPosting: (structured.postingCount || 0) > 0,
        textLength: bodyLength,
        text: !skipText && bodyLength > 200 ? extractPageText().slice(0, 60000) : '',
        structured
    };
}

function isTopFrame() {
    try {
        return window.top === window;
    } catch {
        return true;
    }
}

// Chrome drops the bytes of a File that a page builds at dragstart when the drag
// crosses renderers, so a file dragged out of the side panel reaches the page
// empty. The panel also puts the shelf id on the drag; the drop is taken over
// here and the file is read from storage instead.
const DRAG_ITEM_TYPE = 'application/x-pocketresume-file';

function isPanelDrag(dataTransfer) {
    if (!dataTransfer) return false;
    try {
        return Array.from(dataTransfer.types || []).includes(DRAG_ITEM_TYPE);
    } catch (error) {
        return false;
    }
}

document.addEventListener('dragover', (event) => {
    if (!isPanelDrag(event.dataTransfer)) return;
    event.preventDefault();
    try {
        event.dataTransfer.dropEffect = 'copy';
    } catch (error) {
        // the drop effect is advisory
    }
}, true);

document.addEventListener('drop', (event) => {
    if (!isPanelDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    let itemId = '';
    let name = '';
    try {
        itemId = event.dataTransfer.getData(DRAG_ITEM_TYPE) || '';
    } catch (error) {
        itemId = '';
    }
    try {
        name = event.dataTransfer.getData('text/plain') || '';
    } catch (error) {
        name = '';
    }
    const api = globalThis.__PocketResumeForm;
    chrome.runtime.sendMessage({ type: 'GET_STORED_PDF', payload: { itemId, filename: name } }, (response) => {
        if (chrome.runtime.lastError) return;
        if (!response || response.status !== 'success' || !response.dataUrl) {
            if (api && api.toast) api.toast('Could not read that file. Use the Attach button in the panel.');
            return;
        }
        let attached = null;
        try {
            attached = api && api.attachFile
                ? api.attachFile({
                    filename: response.filename,
                    mime: 'application/pdf',
                    dataUrl: response.dataUrl,
                    kind: response.kind || '',
                    target: event.target
                })
                : null;
        } catch (error) {
            attached = null;
        }
        if (!attached || !attached.attached) {
            if (api && api.toast) {
                api.toast(attached && attached.reason === 'kind-mismatch'
                    ? 'This page has no upload field for that file. Use the Attach button in the panel.'
                    : 'No upload field found on this page. Open the Apply form and drop it there.');
            }
        }
    });
}, true);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ATTACH_FILE') {
        const api = globalThis.__PocketResumeForm;
        let result = { attached: false, filename: request.filename || '' };
        try {
            if (api && api.attachFile) {
                result = api.attachFile({
                    filename: request.filename,
                    mime: request.mime,
                    dataUrl: request.dataUrl,
                    kind: request.kind || ''
                });
            }
        } catch (error) {
            result = { attached: false, filename: request.filename || '', error: error.message };
        }
        chrome.runtime.sendMessage({
            type: 'ATTACH_FRAME_ATTACHED',
            payload: { requestId: request.requestId, ...result }
        }, () => {
            void chrome.runtime.lastError;
        });
        return false;
    }
    if (request.type === 'FORM_DETECT' || request.type === 'FORM_FILL' || request.type === 'FORM_TOAST') {
        const api = globalThis.__PocketResumeForm;
        if (request.type === 'FORM_DETECT') {
            let fields = [];
            try {
                const limit = request.limit || 30;
                fields = api && api.detect ? api.detect(limit) : [];
            } catch (error) {
                fields = [];
            }
            chrome.runtime.sendMessage({ type: 'FORM_FRAME_DETECTED', payload: { requestId: request.requestId, fields } }, () => {
                void chrome.runtime.lastError;
            });
            return false;
        }
        if (request.type === 'FORM_FILL') {
            let filled = 0;
            let flagged = 0;
            try {
                if (api && api.fill) filled = api.fill(request.answers || []).filled;
                if (api && api.flag && Array.isArray(request.flagIds) && request.flagIds.length) {
                    flagged = api.flag(request.flagIds);
                }
            } catch (error) {
                filled = 0;
            }
            chrome.runtime.sendMessage({ type: 'FORM_FRAME_FILLED', payload: { requestId: request.requestId, filled, flagged } }, () => {
                void chrome.runtime.lastError;
            });
            return false;
        }
        if (api && api.toast && isTopFrame()) api.toast(request.message || '');
        return false;
    }
    if (request.type === 'COLLECT_FRAME_SNAPSHOT') {
        try {
            const snapshot = frameSnapshotData();
            snapshot.requestId = request.requestId || '';
            chrome.runtime.sendMessage({ type: 'FRAME_SNAPSHOT_RESULT', payload: snapshot }, () => {
                void chrome.runtime.lastError;
            });
        } catch (error) {
            console.warn('PocketResume frame snapshot failed:', error);
        }
        return false;
    }
    if (!isTopFrame()) return false;
    if (request.type === 'GET_PAGE_URL') {
        sendResponse({ url: window.location.href, title: document.title });
        return true;
    }
    if (request.type === 'GET_PAGE_CONTENT') {
        collectPageContent()
            .then(sendResponse)
            .catch((error) => {
                console.warn('PocketResume page extraction failed:', error);
                sendResponse({ text: '', title: document.title, url: window.location.href, structured: {} });
            });
    }
    return true;
});
