// form-filler.js
// Injected on demand by background.js (FILL_APPLICATION_FORM) with allFrames: true.
// Exposes globalThis.__PocketResumeForm for follow-up executeScript calls.

(() => {
    if (globalThis.__PocketResumeForm) return;

    const FIELD_SELECTOR = [
        'textarea',
        'select',
        'input:not([type])',
        'input[type="text"]',
        'input[type="tel"]',
        'input[type="number"]',
        '[contenteditable="true"]',
        '[contenteditable=""]'
    ].join(', ');

    const MAX_QUESTION_LENGTH = 300;
    const MAX_OPTIONS = 30;

    const FRAME_TOKEN = 'pf' + Math.random().toString(36).slice(2, 8);
    const ID_ATTR = 'data-pocketresume-id';

    function cleanText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function humanizeName(name) {
        return (name || '')
            .replace(/[_\-]+/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isVisible(el) {
        if (!el.isConnected) return false;
        if (el.closest('[aria-hidden="true"]')) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function truncate(text, max) {
        if (!max || max <= 0) return text;
        return text.length > max ? text.slice(0, max) : text;
    }

    function labelForControl(el) {
        if (el.id) {
            const label = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label) return cleanText(label.textContent);
        }
        const wrappingLabel = el.closest('label');
        if (wrappingLabel) {
            const clone = wrappingLabel.cloneNode(true);
            clone.querySelectorAll('input, textarea, select').forEach((n) => n.remove());
            const text = cleanText(clone.textContent);
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

    function questionFromContext(el) {
        const block = el.closest('[data-qa], [class*="question" i], fieldset, li, td');
        if (block) {
            const legend = block.matches('fieldset') ? block.querySelector('legend') : null;
            if (legend) return cleanText(legend.textContent);
            const heading = block.querySelector('h1, h2, h3, h4, h5, h6, label, p, [data-qa], span');
            if (heading && !heading.contains(el)) {
                const text = cleanText(heading.textContent);
                if (text) return text;
            }
        }

        let container = el.parentElement;
        for (let depth = 0; container && depth < 3; depth++) {
            if (container.matches('form, body, html')) break;
            const clone = container.cloneNode(true);
            clone.querySelectorAll('input, textarea, select, script, style, button').forEach((n) => n.remove());
            const text = cleanText(clone.textContent);
            if (text && text.length <= MAX_QUESTION_LENGTH) return text;
            container = container.parentElement;
        }

        return '';
    }

    function questionForField(el) {
        const direct = labelForControl(el);
        if (direct) return direct;
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

    function radioGroupQuestion(radios) {
        const first = radios[0];
        const legend = first.closest('fieldset')?.querySelector('legend');
        if (legend) return cleanText(legend.textContent);

        for (const radio of radios) {
            const aria = cleanText(radio.getAttribute('aria-label') || radio.title || '');
            if (aria) return aria;
        }

        const forIds = new Set(radios.map((r) => r.id).filter(Boolean));
        let container = first.parentElement;
        while (container && !container.matches('form, body, html') && !radios.every((r) => container.contains(r))) {
            container = container.parentElement;
        }
        if (container && !container.matches('form, body, html')) {
            const questionLabel = Array.from(container.querySelectorAll('label')).find((label) => {
                const forId = label.getAttribute('for');
                if (forId && forIds.has(forId)) return false;
                if (label.querySelector('input, textarea, select')) return false;
                return cleanText(label.textContent).length > 0;
            });
            if (questionLabel) return cleanText(questionLabel.textContent);

            const clone = container.cloneNode(true);
            clone.querySelectorAll('input, textarea, select, script, style, button, label').forEach((n) => n.remove());
            const text = cleanText(clone.textContent);
            if (text) return text;
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
                question: truncate(radioGroupQuestion(visible), MAX_QUESTION_LENGTH),
                options,
                maxLength: null,
                required: visible.some((r) => r.required)
            };
            for (const radio of visible) radio.setAttribute(ID_ATTR, entry.id);
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
        return fields;
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

    function matchOption(answer, options) {
        const target = cleanText(answer).toLowerCase();
        if (!target) return -1;
        let idx = options.findIndex((o) => cleanText(o).toLowerCase() === target);
        if (idx >= 0) return idx;
        idx = options.findIndex((o) => cleanText(o).toLowerCase().startsWith(target));
        if (idx >= 0) return idx;
        return options.findIndex((o) => cleanText(o).toLowerCase().includes(target));
    }

    function fillField(el, answer) {
        if (el instanceof HTMLSelectElement) {
            const idx = matchOption(answer, Array.from(el.options).map((o) => o.text));
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

    function fillRadioGroup(id, answer) {
        const radios = Array.from(document.querySelectorAll(`input[type="radio"][${ID_ATTR}="${CSS.escape(id)}"]`));
        if (!radios.length) return false;
        const labels = radios.map((r) => labelForControl(r) || humanizeName(r.value));
        const idx = matchOption(answer, labels);
        if (idx < 0) return false;
        radios[idx].checked = true;
        dispatchEvents(radios[idx]);
        return true;
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

            const el = document.querySelector(`[${ID_ATTR}="${CSS.escape(id)}"]`);
            if (!el || el.disabled || el.readOnly) continue;
            const current = el.isContentEditable ? el.textContent : el.value;
            if (current && current.trim()) continue;
            attempted++;
            if (fillField(el, answer)) filled++;
        }

        return { attempted, filled };
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

    globalThis.__PocketResumeForm = { detect, fill, toast };
})();
