// form-filler.js
// Declarative content script (manifest: <all_urls>, all_frames: true). Runs in every
// frame and exposes the frame-local detect/fill/flag/toast API on
// globalThis.__PocketResumeForm. content.js drives it over the FORM_* messages.

(() => {
    if (globalThis.__PocketResumeForm) return;

    const FIELD_SELECTOR = [
        'textarea',
        'select',
        'input:not([type])',
        'input[type="text"]',
        'input[type="tel"]',
        'input[type="number"]',
        'input[type="email"]',
        'input[type="url"]',
        'input[type="date"]',
        '[contenteditable="true"]',
        '[contenteditable=""]'
    ].join(', ');

    const MAX_QUESTION_LENGTH = 300;
    const MAX_OPTIONS = 30;
    const MAX_LABEL_LENGTH = 120;
    const MAX_GROUP_LABEL_LENGTH = 220;

    const CONSENT_PATTERN = /consent|agree|terms|privacy|policy|newsletter|marketing|subscribe|opt.?in|gdpr|communication|spam|cookies?/i;
    const HONEYPOT_PATTERN = /honey|honeypot|nickname|leave\s+(this\s+|the\s+)?field\s+blank|do\s+not\s+fill/i;

    const FRAME_TOKEN = 'pf' + Math.random().toString(36).slice(2, 8);
    const ID_ATTR = 'data-pocketresume-id';
    const FLAG_ATTR = 'data-pocketresume-flag';
    const FLAG_STYLE_ID = 'pocketresume-flag-style';

    function cleanText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    // Text of a node without the controls, option lists and hidden markup inside
    // it. A label that wraps a select must read as the question, not as
    // "RaceHispanic or LatinoWhite...".
    function textOf(node) {
        if (!node) return '';
        const clone = node.cloneNode(true);
        clone.querySelectorAll(
            'input, textarea, select, option, script, style, noscript, ul, ol, [role="listbox"], [role="list"], [hidden], [aria-hidden="true"]'
        ).forEach((n) => n.remove());
        clone.querySelectorAll('a').forEach((n) => {
            const text = cleanText(n.textContent);
            if (text.length <= 2) n.remove();
        });
        const text = cleanText(clone.textContent);
        // Lever and Fabric wrap a question and its field in one <label>: the
        // question is the first block, the rest is the control.
        const lead = clone.firstElementChild;
        if (lead && /^(div|p|label|legend|fieldset|h[1-6])$/i.test(lead.tagName)) {
            const leadText = cleanText(lead.textContent);
            if (leadText.length >= 3 && leadText.length < text.length) return leadText;
        }
        return text;
    }

    function humanizeName(name) {
        return (name || '')
            .replace(/[_\-]+/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Custom form libraries (MUI, Fabric, Ashby) style a real input with
    // opacity: 0 and paint the look on top of it. Those inputs are fillable,
    // so opacity alone must not hide them. Parked-off-canvas fields are not:
    // that is how honeypots are hidden.
    function isParkedOffscreen(rect) {
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        if (!width) return false;
        return rect.right <= 0 || rect.left >= width;
    }

    function isVisible(el) {
        if (!el.isConnected) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) return false;
        if (isParkedOffscreen(rect)) return false;
        if (el.closest('[aria-hidden="true"]')) return false;
        if (Number(style.opacity) === 0 && !labelForControl(el)) return false;
        return true;
    }

    function isHoneypot(el) {
        const attrs = `${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''} ${el.getAttribute('placeholder') || ''}`;
        if (HONEYPOT_PATTERN.test(attrs)) return true;
        const label = labelForControl(el);
        return !!(label && HONEYPOT_PATTERN.test(label));
    }

    function truncate(text, max) {
        if (!max || max <= 0) return text;
        return text.length > max ? text.slice(0, max) : text;
    }

    function labelForControl(el) {
        if (el.id) {
            const label = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label) {
                const text = textOf(label);
                if (text) return text;
            }
        }
        const wrappingLabel = el.closest('label');
        if (wrappingLabel) {
            const text = textOf(wrappingLabel);
            if (text) return text;
        }
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            const text = cleanText(labelledBy.split(/\s+/)
                .map((id) => document.getElementById(id))
                .filter(Boolean)
                .map((node) => node.textContent)
                .join(' '));
            if (text) return text;
        }
        return cleanText(el.getAttribute('aria-label') || el.title || '');
    }

    // Many forms put the question in a sibling element instead of a <label for>.
    // BambooHR (MUI) and Lever do this for every radio group.
    function siblingCandidateText(node, maxLength) {
        if (!node || node.matches('button, a, script, style')) return '';
        if (node.querySelector('input, textarea, select, button')) return '';
        const text = textOf(node);
        if (!text || text.length > maxLength) return '';
        return text;
    }

    function siblingLabelText(el, maxLength) {
        let node = el;
        for (let depth = 0; node && depth < 3; depth++) {
            const parent = node.parentElement;
            if (!parent || parent.matches('form, body, html')) break;
            let prev = node.previousElementSibling;
            while (prev) {
                const text = siblingCandidateText(prev, maxLength);
                if (text) return text;
                prev = prev.previousElementSibling;
            }
            node = parent;
        }
        return '';
    }

    function questionFromContext(el) {
        const block = el.closest('[data-qa], [class*="question" i], fieldset, li, td');
        if (block) {
            const legend = block.matches('fieldset') ? block.querySelector('legend') : null;
            if (legend) return cleanText(legend.textContent);
            const heading = block.querySelector('h1, h2, h3, h4, h5, h6, label, p, [data-qa], span');
            if (heading && !heading.contains(el)) {
                const text = textOf(heading);
                if (text) return text;
            }
        }

        let container = el.parentElement;
        for (let depth = 0; container && depth < 3; depth++) {
            if (container.matches('form, body, html')) break;
            const text = textOf(container);
            if (text && text.length <= MAX_QUESTION_LENGTH) return text;
            container = container.parentElement;
        }

        return '';
    }

    function questionForField(el) {
        const direct = labelForControl(el);
        if (direct) return direct;
        const sibling = siblingLabelText(el, MAX_LABEL_LENGTH);
        if (sibling) return sibling;
        const contextual = questionFromContext(el);
        if (contextual) return contextual;
        const placeholder = cleanText(el.getAttribute('placeholder') || '');
        if (placeholder) return placeholder;
        return humanizeName(el.name || el.id || '');
    }

    function isPlaceholderSelect(el) {
        const first = el.options[0];
        if (!first) return false;
        if (el.selectedIndex > 0) return false;
        return first.value === '' || /^(select|choose|pick|please|--|\?)/i.test(cleanText(first.text));
    }

    function detectField(el, index) {
        if (el.disabled || el.readOnly) return null;
        if (el.closest('[class*="captcha" i], [id*="captcha" i], [aria-hidden="true"]')) return null;
        if (!isVisible(el)) return null;
        if (isHoneypot(el)) return null;
        if ((el.name + ' ' + el.id).toLowerCase().match(/search|query|filter|captcha/)) return null;

        const isEditable = el.isContentEditable;
        const currentValue = isEditable ? el.textContent : el.value;
        if (currentValue && currentValue.trim()) return null;
        if (el.tagName === 'SELECT' && !isPlaceholderSelect(el)) return null;

        const entry = {
            id: `${FRAME_TOKEN}-${index}`,
            tag: isEditable ? 'editable' : el.tagName.toLowerCase(),
            type: isEditable ? 'text' : (el.type || 'text'),
            question: truncate(questionForField(el), MAX_QUESTION_LENGTH),
            options: null,
            maxLength: null,
            required: !!(el.required || el.getAttribute('aria-required') === 'true')
        };

        if (el.tagName === 'SELECT') {
            const seen = new Set();
            const options = [];
            for (const option of el.options) {
                const text = cleanText(option.text);
                if (!text || seen.has(text.toLowerCase())) continue;
                seen.add(text.toLowerCase());
                options.push(text);
                if (options.length >= MAX_OPTIONS) break;
            }
            if (options.length < 2) return null;
            entry.options = options;
        }

        if (el.maxLength > 0) entry.maxLength = el.maxLength;

        el.setAttribute(ID_ATTR, entry.id);
        return entry;
    }

    function groupContainer(inputs) {
        let container = inputs[0].parentElement;
        while (container && !container.matches('form, body, html') && !inputs.every((r) => container.contains(r))) {
            container = container.parentElement;
        }
        return container;
    }

    function inputGroupQuestion(inputs) {
        const first = inputs[0];
        const legend = first.closest('fieldset')?.querySelector('legend');
        if (legend) {
            const text = textOf(legend);
            if (text) return text;
        }

        for (const input of inputs) {
            const aria = cleanText(input.getAttribute('aria-label') || input.title || '');
            if (aria) return aria;
        }

        // Ashby and MUI point a <label for> at the group name, not at an input.
        const groupName = first.name || '';
        if (groupName) {
            const labelled = document.querySelector(`label[for="${CSS.escape(groupName)}"]`);
            if (labelled) {
                const text = textOf(labelled);
                if (text) return text;
            }
        }

        const container = groupContainer(inputs);
        if (container) {
            const forIds = new Set(inputs.map((r) => r.id).filter(Boolean));
            const questionLabel = Array.from(container.querySelectorAll('label')).find((label) => {
                const forId = label.getAttribute('for');
                if (forId && forIds.has(forId)) return false;
                if (label.querySelector('input, textarea, select')) return false;
                return textOf(label).length > 0;
            });
            if (questionLabel) {
                const text = textOf(questionLabel);
                if (text) return text;
            }

            const sibling = siblingLabelText(container, MAX_GROUP_LABEL_LENGTH);
            if (sibling) return sibling;
        }

        return labelForControl(first);
    }

    function detectRadioGroups() {
        const groups = new Map();
        for (const radio of document.querySelectorAll('input[type="radio"]')) {
            if (!radio.name) continue;
            const key = `${radio.form ? radio.form.id || 'form' : 'doc'}::${radio.name}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(radio);
        }

        const entries = [];
        let index = 0;
        for (const radios of groups.values()) {
            index++;
            const visible = radios.filter((r) => isVisible(r) && !r.disabled);
            if (visible.length < 2) continue;
            if (radios.some((r) => r.checked)) continue;

            const first = visible[0];
            if ((first.name + ' ' + first.id).toLowerCase().match(/captcha/)) continue;
            if (first.closest('[class*="captcha" i], [id*="captcha" i]')) continue;
            if (isHoneypot(first)) continue;

            const options = [];
            for (const radio of visible) {
                let text = labelForControl(radio);
                if (!text) text = humanizeName(radio.value);
                if (!text) continue;
                if (options.some((o) => o.toLowerCase() === text.toLowerCase())) continue;
                options.push(text);
                if (options.length >= MAX_OPTIONS) break;
            }
            if (options.length < 2) continue;

            const entry = {
                id: `${FRAME_TOKEN}-r${index}`,
                tag: 'radio',
                type: 'radio',
                question: truncate(inputGroupQuestion(visible), MAX_QUESTION_LENGTH),
                options,
                maxLength: null,
                required: visible.some((r) => r.required)
            };
            for (const radio of visible) radio.setAttribute(ID_ATTR, entry.id);
            entries.push(entry);
        }
        return entries;
    }

    function detectCheckboxGroups() {
        const groups = new Map();
        for (const box of document.querySelectorAll('input[type="checkbox"]')) {
            if (!box.name) continue;
            const key = `${box.form ? box.form.id || 'form' : 'doc'}::${box.name}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(box);
        }

        const entries = [];
        let index = 0;
        for (const boxes of groups.values()) {
            index++;
            const visible = boxes.filter((b) => isVisible(b) && !b.disabled);
            if (visible.length < 2) continue;
            if (boxes.some((b) => b.checked)) continue;

            const first = visible[0];
            if ((first.name + ' ' + first.id).toLowerCase().match(/captcha/)) continue;
            if (first.closest('[class*="captcha" i], [id*="captcha" i]')) continue;
            if (isHoneypot(first)) continue;

            const question = inputGroupQuestion(visible);
            if (CONSENT_PATTERN.test(question) || CONSENT_PATTERN.test(first.name + ' ' + first.id)) continue;

            const options = [];
            for (const box of visible) {
                let text = labelForControl(box);
                if (!text) text = humanizeName(box.value);
                if (!text) continue;
                if (options.some((o) => o.toLowerCase() === text.toLowerCase())) continue;
                options.push(text);
                if (options.length >= MAX_OPTIONS) break;
            }
            if (options.length < 2) continue;

            const entry = {
                id: `${FRAME_TOKEN}-c${index}`,
                tag: 'checkbox-group',
                type: 'checkbox',
                question: truncate(question, MAX_QUESTION_LENGTH),
                options,
                maxLength: null,
                multi: true,
                required: visible.some((b) => b.required)
            };
            for (const box of visible) box.setAttribute(ID_ATTR, entry.id);
            entries.push(entry);
        }
        return entries;
    }

    function detectSingleCheckboxes() {
        const entries = [];
        let index = 0;
        for (const box of document.querySelectorAll('input[type="checkbox"]')) {
            index++;
            if (box.disabled || box.readOnly) continue;
            if (box.checked || box.indeterminate) continue;
            if (!box.isConnected || !isVisible(box)) continue;
            if (isHoneypot(box)) continue;
            if (box.name && box.closest('form')) {
                const siblings = Array.from(
                    (box.form || document).querySelectorAll(`input[type="checkbox"][name="${CSS.escape(box.name)}"]`)
                );
                if (siblings.length > 1) continue;
            }
            const question = labelForControl(box) || cleanText(box.getAttribute('aria-label') || box.title || '');
            if (!question) continue;
            if (CONSENT_PATTERN.test(question) || CONSENT_PATTERN.test((box.name || '') + ' ' + (box.id || ''))) continue;
            if (box.closest('[class*="captcha" i], [id*="captcha" i]')) continue;

            const entry = {
                id: `${FRAME_TOKEN}-s${index}`,
                tag: 'checkbox',
                type: 'checkbox',
                question: truncate(question, MAX_QUESTION_LENGTH),
                options: null,
                maxLength: null,
                required: !!(box.required || box.getAttribute('aria-required') === 'true')
            };
            box.setAttribute(ID_ATTR, entry.id);
            entries.push(entry);
        }
        return entries;
    }

    // BambooHR (Fabric) and other custom design systems hide the real <select>
    // and paint a dropdown on a button. The choices live in a menu that only
    // exists after a click, so the field cannot be filled from here, but the
    // user should still see it marked as one they have to answer.
    function isPlaceholderWidgetText(text) {
        const value = cleanText(text);
        if (!value) return true;
        if (/^(select|choose|pick|please|--|–|—|-|…|\.\.\.)/i.test(value)) return true;
        return /\bselect\b\s*[.…]*$/i.test(value);
    }

    function widgetQuestion(button) {
        let text = cleanText(button.getAttribute('aria-label') || button.getAttribute('title') || '');
        if (!text) text = textOf(button);
        return text.replace(/[\s–—-]*select[\s–—.…]*$/i, '').replace(/[\s–—-]*choose[\s–—.…]*$/i, '').trim();
    }

    function detectWidgetSelects() {
        const entries = [];
        let index = 0;
        for (const button of document.querySelectorAll('button[aria-haspopup="true"]')) {
            index++;
            if (button.disabled) continue;
            if (!button.closest('form')) continue;
            if (!isVisible(button)) continue;
            if (!isPlaceholderWidgetText(button.textContent)) continue;
            const question = widgetQuestion(button);
            if (!question) continue;

            const entry = {
                id: `${FRAME_TOKEN}-w${index}`,
                tag: 'select-widget',
                type: 'select',
                question: truncate(question, MAX_QUESTION_LENGTH),
                options: null,
                maxLength: null,
                required: button.getAttribute('aria-required') === 'true'
            };
            button.setAttribute(ID_ATTR, entry.id);
            entries.push(entry);
        }
        return entries;
    }

    function detect(maxFields) {
        const limit = Number(maxFields) > 0 ? Number(maxFields) : 30;
        const elements = Array.from(document.querySelectorAll(FIELD_SELECTOR));
        const fields = [];
        let index = 0;
        for (const el of elements) {
            if (fields.length >= limit) break;
            index++;
            const entry = detectField(el, index);
            if (entry) fields.push(entry);
        }
        for (const group of detectRadioGroups()) {
            if (fields.length >= limit) break;
            fields.push(group);
        }
        for (const group of detectCheckboxGroups()) {
            if (fields.length >= limit) break;
            fields.push(group);
        }
        for (const group of detectSingleCheckboxes()) {
            if (fields.length >= limit) break;
            fields.push(group);
        }
        for (const widget of detectWidgetSelects()) {
            if (fields.length >= limit) break;
            fields.push(widget);
        }
        return fields;
    }

    function isFillableControl(el) {
        if (!el) return false;
        if (el.disabled || el.readOnly) return false;
        if (el.tagName === 'BUTTON' || el.tagName === 'A') return false;
        return 'value' in el || el.isContentEditable;
    }

    function setNativeValue(el, value) {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
    }

    function dispatchEvents(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // React reads radio and checkbox changes from the click event, so a real
    // click is the only way the page learns about the answer.
    function setChecked(el, checked) {
        if (el.checked === checked) return true;
        try {
            el.click();
        } catch (error) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
            if (setter) setter.call(el, checked);
            dispatchEvents(el);
        }
        return el.checked === checked;
    }

    function matchOption(answer, options) {
        const target = cleanText(answer).toLowerCase();
        if (!target) return -1;
        let idx = options.findIndex((o) => cleanText(o).toLowerCase() === target);
        if (idx >= 0) return idx;
        idx = options.findIndex((o) => cleanText(o).toLowerCase().startsWith(target));
        if (idx >= 0) return idx;
        return options.findIndex((o) => cleanText(o).toLowerCase().includes(target));
    }

    function matchSelectOption(el, answer) {
        const byText = matchOption(answer, Array.from(el.options).map((o) => o.text));
        if (byText >= 0) return byText;
        return matchOption(answer, Array.from(el.options).map((o) => o.value));
    }

    function fillField(el, answer) {
        if (el instanceof HTMLSelectElement) {
            const idx = matchSelectOption(el, answer);
            if (idx < 0) return false;
            el.selectedIndex = idx;
            dispatchEvents(el);
            return true;
        }
        if (el.isContentEditable) {
            el.textContent = answer;
            dispatchEvents(el);
            return true;
        }
        const value = truncate(answer, el.maxLength > 0 ? el.maxLength : answer.length);
        setNativeValue(el, value);
        dispatchEvents(el);
        return el.value === value;
    }

    function fillCheckbox(el, answer) {
        const wants = /^(yes|y|true|1)\b/i.test(cleanText(answer));
        if (!wants) return true;
        if (el.checked) return true;
        return setChecked(el, true);
    }

    function fillCheckboxGroup(id, answer) {
        const boxes = Array.from(document.querySelectorAll(`input[type="checkbox"][${ID_ATTR}="${CSS.escape(id)}"]`));
        if (!boxes.length) return false;
        const labels = boxes.map((b) => labelForControl(b) || humanizeName(b.value));
        const tokens = cleanText(answer).split(',').map((t) => t.trim()).filter(Boolean);
        let acted = false;
        for (const token of tokens) {
            const idx = matchOption(token, labels);
            if (idx < 0) continue;
            if (boxes[idx].checked) {
                acted = true;
                continue;
            }
            setChecked(boxes[idx], true);
            acted = true;
        }
        return acted;
    }

    function fillRadioGroup(id, answer) {
        const radios = Array.from(document.querySelectorAll(`input[type="radio"][${ID_ATTR}="${CSS.escape(id)}"]`));
        if (!radios.length) return false;
        const labels = radios.map((r) => labelForControl(r) || humanizeName(r.value));
        const idx = matchOption(answer, labels);
        if (idx < 0) return false;
        return setChecked(radios[idx], true);
    }

    function fill(answers) {
        const list = Array.isArray(answers) ? answers : [];
        let attempted = 0;
        let filled = 0;

        for (const item of list) {
            const id = String(item?.id || '');
            const answer = typeof item?.answer === 'string' ? item.answer.trim() : '';
            if (!id || !answer) continue;
            if (!id.startsWith(FRAME_TOKEN)) continue;

            const radioGroup = document.querySelector(`input[type="radio"][${ID_ATTR}="${CSS.escape(id)}"]`);
            if (radioGroup) {
                attempted++;
                if (fillRadioGroup(id, answer)) filled++;
                continue;
            }

            const checkboxGroup = document.querySelector(`input[type="checkbox"][${ID_ATTR}="${CSS.escape(id)}"]`);
            if (checkboxGroup) {
                const boxes = Array.from(document.querySelectorAll(`input[type="checkbox"][${ID_ATTR}="${CSS.escape(id)}"]`));
                if (boxes.length > 1) {
                    attempted++;
                    if (fillCheckboxGroup(id, answer)) filled++;
                    continue;
                }
                attempted++;
                if (fillCheckbox(checkboxGroup, answer)) filled++;
                continue;
            }

            const el = document.querySelector(`[${ID_ATTR}="${CSS.escape(id)}"]`);
            if (!el || !isFillableControl(el)) continue;
            if (el.type === 'checkbox') {
                if (el.checked) continue;
                attempted++;
                if (fillCheckbox(el, answer)) filled++;
                continue;
            }
            const current = el.isContentEditable ? el.textContent : el.value;
            if (current && current.trim()) continue;
            attempted++;
            if (fillField(el, answer)) filled++;
        }

        return { attempted, filled };
    }

    function ensureFlagStyle() {
        if (document.getElementById(FLAG_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = FLAG_STYLE_ID;
        style.textContent = '.pr-flag{outline:2px dashed rgba(245,158,11,.9)!important;outline-offset:2px;background:rgba(245,158,11,.07)!important;}';
        (document.head || document.documentElement).appendChild(style);
    }

    // Marks fields that no saved answer could fill. Nothing is typed into them.
    function flag(ids) {
        ensureFlagStyle();
        let count = 0;
        for (const id of Array.isArray(ids) ? ids : []) {
            const key = String(id || '');
            if (!key) continue;
            const nodes = document.querySelectorAll(`[${ID_ATTR}="${CSS.escape(key)}"]`);
            nodes.forEach((node) => {
                node.setAttribute(FLAG_ATTR, '1');
                node.classList.add('pr-flag');
                count++;
            });
        }
        return count;
    }

    function unflag() {
        document.querySelectorAll(`[${FLAG_ATTR}]`).forEach((node) => {
            node.removeAttribute(FLAG_ATTR);
            node.classList.remove('pr-flag');
        });
        return true;
    }

    function toast(message) {
        const existing = document.getElementById('pocketresume-form-toast');
        if (existing) existing.remove();
        const el = document.createElement('div');
        el.id = 'pocketresume-form-toast';
        el.textContent = message;
        el.style.cssText = [
            'position: fixed',
            'bottom: 20px',
            'right: 20px',
            'z-index: 2147483647',
            'max-width: 320px',
            'padding: 10px 16px',
            'border-radius: 10px',
            'background: rgba(17, 24, 39, 0.94)',
            'color: #f9fafb',
            'font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25)',
            'pointer-events: none',
            'opacity: 0',
            'transform: translateY(6px)',
            'transition: opacity 250ms ease, transform 250ms ease'
        ].join('; ');
        document.body.appendChild(el);
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(6px)';
        }, 4500);
        setTimeout(() => el.remove(), 5200);
    }

    function dataUrlToBytes(dataUrl) {
        const base64 = String(dataUrl || '').split(',')[1] || '';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    // Everything that names an upload: the label, a nearby button or heading,
    // and the input's own attributes. Used to pick the right file input.
    function fileInputContext(el) {
        const parts = [];
        const direct = labelForControl(el);
        if (direct) parts.push(direct);
        let node = el;
        for (let depth = 0; node && depth < 3; depth++) {
            const parent = node.parentElement;
            if (!parent || parent.matches('form, body, html')) break;
            let prev = node.previousElementSibling;
            while (prev) {
                if (prev.matches('button, label')) {
                    const text = cleanText(prev.textContent);
                    if (text && text.length <= 80) {
                        parts.push(text);
                        break;
                    }
                }
                prev = prev.previousElementSibling;
            }
            node = parent;
        }
        parts.push(el.getAttribute('name') || '');
        parts.push(el.getAttribute('id') || '');
        parts.push(el.getAttribute('accept') || '');
        return cleanText(parts.join(' '));
    }

    function candidateFileInputs() {
        return Array.from(document.querySelectorAll('input[type="file"]')).filter((el) => {
            if (el.disabled || el.readOnly) return false;
            return !isHoneypot(el);
        });
    }

    const RESUME_UPLOAD = /\bresume\b|curriculum|vitae|\bcv\b/i;
    const LETTER_UPLOAD = /cover[\s_-]*letter/i;

    function requestedFileKind(value) {
        const kind = cleanText(value).toLowerCase();
        if (kind === 'cover-letter' || kind === 'letter') return 'cover-letter';
        if (kind === 'resume' || kind === 'cv') return 'resume';
        return '';
    }

    // How well a field's text names the file being attached. A form with a
    // Resume and a Cover Letter field scores the same for both without this,
    // and the first input in the DOM took every file (Ashby).
    function fileKindMatch(context, kind) {
        if (!kind || !context) return 0;
        const letter = LETTER_UPLOAD.test(context);
        const resume = RESUME_UPLOAD.test(context);
        if (kind === 'cover-letter') return letter ? 2 : 0;
        if (resume && !letter) return 2;
        if (resume && letter) return 1;
        return 0;
    }

    // True when the field asks for the other file and has no generic wording:
    // a cover letter must not replace the resume on a one-field form.
    function fileKindConflict(context, kind) {
        if (!kind || !context) return false;
        const letter = LETTER_UPLOAD.test(context);
        const resume = RESUME_UPLOAD.test(context);
        if (kind === 'cover-letter') return resume && !letter;
        return letter && !resume;
    }

    function hasAttachedFile(el) {
        try {
            return !!(el.files && el.files.length);
        } catch (error) {
            return false;
        }
    }

    function scoreFileInput(el, context, total, kindScore) {
        let score = 0;
        if (kindScore === 2) score += 6;
        else if (kindScore === 1) score += 5;
        else if (RESUME_UPLOAD.test(context) || LETTER_UPLOAD.test(context)) score += 4;
        else if (/upload|attach|browse|choose|select\s+(a\s+)?file/i.test(context)) score += 2;
        if (isVisible(el)) score += 2;
        else if (context) score += 1;
        if (/pdf/i.test(el.getAttribute('accept') || '')) score += 1;
        if (total === 1) score += 1;
        return score;
    }

    // Two generic "Upload file" fields are only told apart by where the file
    // was dropped, so the nearest field under the pointer wins the tie.
    function dropTargetBonus(el, target) {
        if (!target || typeof target.querySelectorAll !== 'function') return 0;
        let node = target;
        for (let depth = 0; node && depth < 6; depth++) {
            const inputs = Array.from(node.querySelectorAll('input[type="file"]'));
            if (inputs.length && inputs.length <= 2 && inputs.includes(el)) return Math.max(1, 6 - depth);
            if (node.nodeType !== 1 || node.matches('form, body, html')) break;
            node = node.parentElement;
        }
        return 0;
    }

    function visibleDialogs() {
        const nodes = document.querySelectorAll(
            '[role="dialog"], [aria-modal="true"], dialog[open], [class*="modal" i], [class*="dialog" i]'
        );
        const found = [];
        for (const node of nodes) {
            if (!isVisible(node)) continue;
            if (cleanText(node.innerText || '').length < 8) continue;
            found.push(node);
        }
        return found;
    }

    function highlightNode(node) {
        ensureFlagStyle();
        node.classList.add('pr-flag');
        try {
            node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (error) {
            try {
                node.scrollIntoView();
            } catch (inner) {
                // the node may already be detached
            }
        }
        setTimeout(() => {
            try {
                node.classList.remove('pr-flag');
            } catch (error) {
                // the node is gone
            }
        }, 12000);
    }

    // Application forms can hold the upload behind a consent dialog that opens
    // once a file is picked (Eightfold: "Data Privacy Agreement"). Nothing is
    // uploaded until it is answered, so the dialog is brought into view instead
    // of leaving the user with a page that looks like it did nothing.
    function watchForPrompt(before, filename) {
        const at = [250, 600, 1200, 2000];
        const check = (index) => {
            const fresh = visibleDialogs().filter((node) => !before.has(node));
            if (fresh.length) {
                highlightNode(fresh[0]);
                toast(`Attached ${filename} — answer the page's prompt to finish`);
                return;
            }
            if (index + 1 < at.length) {
                setTimeout(() => check(index + 1), at[index + 1] - at[index]);
            }
        };
        setTimeout(() => check(0), at[0]);
    }

    // Puts a file on the page's upload field. Dragging a file out of the panel
    // loses its bytes on some Chrome builds, so the panel can ask the page to
    // take the file directly.
    function attachFile(payload) {
        const request = payload || {};
        const filename = cleanText(request.filename || 'document.pdf') || 'document.pdf';
        const mime = cleanText(request.mime || 'application/pdf') || 'application/pdf';
        const kind = requestedFileKind(request.kind);
        const dialogsBefore = new Set(visibleDialogs());
        const inputs = candidateFileInputs();
        if (!inputs.length) return { attached: false, reason: 'no-input', filename };
        const ranked = inputs.map((el) => {
            const context = fileInputContext(el);
            return { el, context, kindScore: fileKindMatch(context, kind) };
        });
        // A field that names the file wins outright: a cover letter never
        // replaces the resume in the resume field, whatever sits closer.
        const typed = ranked.filter((entry) => entry.kindScore > 0);
        if (kind && !typed.length && ranked.every((entry) => fileKindConflict(entry.context, kind))) {
            return { attached: false, reason: 'kind-mismatch', filename };
        }
        const pool = typed.length ? typed : ranked;
        let best = null;
        let bestScore = -Infinity;
        for (const entry of pool) {
            let score = scoreFileInput(entry.el, entry.context, inputs.length, entry.kindScore);
            score += dropTargetBonus(entry.el, request.target);
            if (hasAttachedFile(entry.el)) score -= 3;
            if (score > bestScore) {
                bestScore = score;
                best = entry.el;
            }
        }
        if (!best) return { attached: false, reason: 'no-input', filename };
        const file = new File([dataUrlToBytes(request.dataUrl || '')], filename, { type: mime });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
        if (setter) setter.call(best, transfer.files);
        else best.files = transfer.files;
        best.dispatchEvent(new Event('input', { bubbles: true }));
        best.dispatchEvent(new Event('change', { bubbles: true }));
        toast(`Attached ${filename}`);
        watchForPrompt(dialogsBefore, filename);
        return { attached: true, filename, inputs: inputs.length };
    }

    globalThis.__PocketResumeForm = { detect, fill, toast, flag, unflag, attachFile };
})();
