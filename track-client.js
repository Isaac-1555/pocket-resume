// track-client.js
// Classic-script helper for popup/options/tracker pages: forwards usage events to the
// background service worker, which owns queuing + consent + sending (see analytics.js).

window.trackEvent = function (name, params = {}) {
    try {
        chrome.runtime.sendMessage({ type: 'TRACK_EVENT', payload: { name, params } }, () => {
            void chrome.runtime.lastError;
        });
    } catch (error) {
        // Never let tracking break the page.
    }
};
