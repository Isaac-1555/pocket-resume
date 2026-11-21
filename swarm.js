/* ============================================================================
   swarm.js — host page for the agent-build simulation.

   The side panel embeds this page in an iframe and posts the escaped sheet
   HTML. agent-build rebuilds whatever is under <body>, so this document holds
   the resume and nothing else.

   Messages in:  { type: 'PR_BUILD', html, theme, pace, count, accent, hub }
   Messages out: { type: 'PR_READY' }
                 { type: 'PR_BUILT', skipped, reason }
   ========================================================================= */

(function () {
    'use strict';

    var DEFAULTS = {
        pace: 1.05,
        count: 14,
        accent: '#1F2D27',
        hub: 'libs/logo-mark.svg'
    };

    var frames = 'section, article, header';
    var atoms = 'h1, h2, h3, p, li';

    function parentWindow() {
        try {
            return window.parent && window.parent !== window ? window.parent : null;
        } catch (error) {
            return null;
        }
    }

    function post(message) {
        var target = parentWindow();
        if (!target) return;
        target.postMessage(message, '*');
    }

    function nextFrame() {
        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                requestAnimationFrame(resolve);
            });
        });
    }

    function fontsReady() {
        if (!document.fonts || !document.fonts.ready) return Promise.resolve();
        var timeout = new Promise(function (resolve) {
            setTimeout(resolve, 1200);
        });
        return Promise.race([document.fonts.ready.then(function () {}), timeout]);
    }

    function cssReady() {
        return getComputedStyle(document.documentElement)
            .getPropertyValue('--agent-build-css')
            .trim() === '1';
    }

    function waitForCss(attempts) {
        if (cssReady() || attempts <= 0) return Promise.resolve();
        return new Promise(function (resolve) {
            setTimeout(resolve, 40);
        }).then(function () {
            return waitForCss(attempts - 1);
        });
    }

    function mount(html, theme) {
        document.documentElement.dataset.theme = theme === 'ink' ? 'ink' : 'paper';
        document.body.innerHTML = html || '<p class="pr-sheet-empty">Nothing to build</p>';
    }

    var building = false;

    function run(options) {
        var html = options && options.html;
        if (!html) {
            post({ type: 'PR_BUILT', skipped: true, reason: 'empty' });
            return;
        }
        if (building) return;
        building = true;

        var api = window.AgentBuild;
        mount(html, options.theme);

        waitForCss(40)
            .then(fontsReady)
            .then(nextFrame)
            .then(function () {
                if (!api || typeof api.start !== 'function') {
                    building = false;
                    post({ type: 'PR_BUILT', skipped: true, reason: 'unavailable' });
                    return;
                }
                var started = api.start({
                    pace: number(options.pace, DEFAULTS.pace),
                    count: number(options.count, DEFAULTS.count),
                    accent: typeof options.accent === 'string' && options.accent ? options.accent : DEFAULTS.accent,
                    hub: typeof options.hub === 'string' && options.hub ? options.hub : DEFAULTS.hub,
                    frames: frames,
                    atoms: atoms
                });
                if (!started) {
                    building = false;
                    post({ type: 'PR_BUILT', skipped: true, reason: 'refused' });
                }
            })
            .catch(function () {
                building = false;
                post({ type: 'PR_BUILT', skipped: true, reason: 'error' });
            });
    }

    function number(value, fallback) {
        var parsed = typeof value === 'number' ? value : parseFloat(value);
        return isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    document.addEventListener('agentbuild:end', function (event) {
        building = false;
        var detail = event && event.detail ? event.detail : {};
        post({
            type: 'PR_BUILT',
            skipped: detail.skipped === true,
            built: detail.built || 0,
            total: detail.total || 0,
            seconds: detail.seconds || 0
        });
    });

    window.addEventListener('message', function (event) {
        var source = parentWindow();
        if (source && event.source !== source) return;
        var data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'PR_PING') {
            post({ type: 'PR_READY' });
            return;
        }
        if (data.type === 'PR_BUILD') run(data);
    });

    post({ type: 'PR_READY' });
})();
