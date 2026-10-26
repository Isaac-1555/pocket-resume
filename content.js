// content.js
console.log("PocketResume Content Script Ready");

function extractPageText() {
    const bodyText = document.body ? document.body.innerText : '';
    return bodyText
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim()
        .substring(0, 100000);
}

function htmlToText(html) {
    if (!html) return '';
    const holder = document.createElement('div');
    holder.innerHTML = String(html);
    return (holder.innerText || holder.textContent || '').replace(/\s+/g, ' ').trim();
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
    const locality = address ? (address.addressLocality || '') : '';
    const region = address ? (address.addressRegion || '') : '';
    const location = address
        ? [locality, region].filter(Boolean).join(', ') || (address.addressCountry || '')
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_PAGE_CONTENT') {
        let structured = {};
        try {
            structured = extractStructuredData();
        } catch (error) {
            console.warn('PocketResume structured extraction failed:', error);
        }
        sendResponse({
            text: extractPageText(),
            title: document.title,
            url: window.location.href,
            structured
        });
    }
    return true;
});
