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

function extractStructuredData() {
    const postings = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        try {
            flattenJobPostings(JSON.parse(script.textContent || ''), postings);
        } catch {
        }
    });

    const posting = postings[0] || null;
    const address = posting && posting.jobLocation
        ? [].concat(posting.jobLocation)[0]?.address || null
        : null;
    const locality = address ? String(address.addressLocality || '').split(',')[0].trim() : '';
    const region = address ? String(address.addressRegion || '').split(',')[0].trim() : '';
    const location = address
        ? [locality, region].filter(Boolean).join(', ') || (address.addressCountry?.name || address.addressCountry || '')
        : '';

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const h1 = document.querySelector('h1');

    return {
        title: posting?.title || (ogTitle ? ogTitle.getAttribute('content') : '') || '',
        company: posting?.hiringOrganization?.name || posting?.hiringOrganization?.[0]?.name || '',
        location,
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
