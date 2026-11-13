(function () {
    function safeText(value) {
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'number') return String(value);
        if (!value || typeof value !== 'object') return '';
        return safeText(value.text || value.label || value.name || value.title || value.value || '');
    }

    const SMART_CHARS = {
        '\u2018': "'",
        '\u2019': "'",
        '\u201C': '"',
        '\u201D': '"',
        '\u2013': '-',
        '\u2014': '-',
        '\u2026': '...'
    };

    function sanitizePdfText(text) {
        const mapped = safeText(text).replace(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2026]/g, (char) => SMART_CHARS[char]);
        return mapped
            .replace(/\u00A0/g, ' ')
            .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u2022]/g, ' ')
            .trim();
    }

    function toStringArray(value) {
        if (Array.isArray(value)) {
            return value.map((item) => sanitizePdfText(item)).filter(Boolean);
        }
        if (typeof value === 'string') {
            return value.split(/\s*\|\s*|\s*\u2022\s*|\s*,\s*/).map((item) => sanitizePdfText(item)).filter(Boolean);
        }
        return [];
    }

    function toCommaList(value) {
        const items = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
        return items
            .flatMap((item) => sanitizePdfText(item).split(/\s*,\s*/))
            .map((item) => item.trim())
            .filter(Boolean);
    }

    function normalizeDetailList(value) {
        if (Array.isArray(value)) {
            return value.map((item) => {
                if (typeof item === 'string' || typeof item === 'number') return sanitizePdfText(item);
                if (!item || typeof item !== 'object') return '';
                return sanitizePdfText(item.detail || item.text || item.description || item.title || item.name || '');
            }).filter(Boolean);
        }
        if (typeof value === 'string') {
            const clean = sanitizePdfText(value);
            return clean ? [clean] : [];
        }
        return [];
    }

    function normalizeLinkKey(value) {
        return String(value || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').trim();
    }

    function isLinkPart(part, links) {
        const key = normalizeLinkKey(part);
        if (!key) return false;
        return links.some((link) => {
            const text = normalizeLinkKey(link.text);
            const url = normalizeLinkKey(link.url);
            if (!text && !url) return false;
            if (key === text || key === url) return true;
            if (text && key.includes(text)) return true;
            if (url && key.includes(url)) return true;
            return false;
        });
    }

    function normalizeLinks(links, contact) {
        const normalized = Array.isArray(links)
            ? links.map((link) => {
                if (typeof link === 'string') {
                    const text = sanitizePdfText(link);
                    return text ? { label: '', text, url: '' } : null;
                }
                if (!link || typeof link !== 'object') return null;
                const label = sanitizePdfText(link.label || link.name || '');
                const text = sanitizePdfText(link.text || link.url || link.value || label);
                const url = safeText(link.url || '');
                if (!text && !label && !url) return null;
                return { label, text: text || label, url };
            }).filter(Boolean)
            : [];

        if (normalized.length > 0) return normalized;

        return safeText(contact)
            .split('|')
            .map((part) => sanitizePdfText(part))
            .filter(Boolean)
            .map((part) => ({ label: '', text: part, url: '' }));
    }

    function normalizeSkillGroups(raw) {
        if (Array.isArray(raw.skillGroups)) {
            return raw.skillGroups.map((group) => {
                if (typeof group === 'string') {
                    const text = sanitizePdfText(group);
                    return text ? { label: 'Core', items: [text] } : null;
                }
                if (!group || typeof group !== 'object') return null;
                const label = sanitizePdfText(group.label || group.name || 'Core');
                const items = toStringArray(group.items || group.skills || group.values);
                if (!items.length) return null;
                return { label, items };
            }).filter(Boolean);
        }

        if (raw.skills && !Array.isArray(raw.skills) && typeof raw.skills === 'object') {
            return Object.entries(raw.skills)
                .map(([label, items]) => {
                    const normalizedItems = toStringArray(items);
                    if (!normalizedItems.length) return null;
                    return { label: sanitizePdfText(label), items: normalizedItems };
                })
                .filter(Boolean);
        }

        const flatSkills = toStringArray(raw.skills);
        return flatSkills.length ? [{ label: 'Core Skills', items: flatSkills }] : [];
    }

    function normalizeExperience(items) {
        return Array.isArray(items)
            ? items.map((item) => {
                if (!item || typeof item !== 'object') return null;
                return {
                    title: sanitizePdfText(item.title || item.role || item.position),
                    company: sanitizePdfText(item.company || item.organization || item.employer),
                    location: sanitizePdfText(item.location),
                    period: sanitizePdfText(item.period || item.dates || item.year),
                    points: normalizeDetailList(item.points || item.highlights || item.bullets || item.details)
                };
            }).filter((item) => item && (item.title || item.company || item.points.length))
            : [];
    }

    function normalizeProjects(items) {
        return Array.isArray(items)
            ? items.map((item) => {
                if (!item || typeof item !== 'object') return null;
                return {
                    title: sanitizePdfText(item.title || item.name || item.role),
                    platform: sanitizePdfText(item.platform || item.company || item.subtitle || item.category),
                    period: sanitizePdfText(item.period || item.year || item.dates),
                    points: normalizeDetailList(item.points || item.highlights || item.bullets || item.details),
                    description: sanitizePdfText(item.description),
                    url: safeText(item.url || item.link || ''),
                    stars: sanitizePdfText(item.stars || item.githubStars || ''),
                    venue: sanitizePdfText(item.venue || item.publication || '')
                };
            }).filter((item) => item && (item.title || item.description || item.points.length))
            : [];
    }

    function normalizeEducation(items) {
        return Array.isArray(items)
            ? items.map((item) => {
                if (!item || typeof item !== 'object') return null;
                return {
                    degree: sanitizePdfText(item.degree || item.program || item.title),
                    school: sanitizePdfText(item.school || item.institution || item.university),
                    year: sanitizePdfText(item.year || item.period || item.dates),
                    location: sanitizePdfText(item.location),
                    details: normalizeDetailList(item.details || item.highlights || item.notes)
                };
            }).filter((item) => item && (item.degree || item.school))
            : [];
    }

    function normalizeHonors(items) {
        return Array.isArray(items)
            ? items.map((item) => {
                if (typeof item === 'string') {
                    const text = sanitizePdfText(item);
                    return text ? { title: text, issuer: '', year: '', detail: '' } : null;
                }
                if (!item || typeof item !== 'object') return null;
                return {
                    title: sanitizePdfText(item.title || item.name),
                    issuer: sanitizePdfText(item.issuer || item.organization || item.awarder),
                    year: sanitizePdfText(item.year || item.period),
                    detail: sanitizePdfText(item.detail || item.description)
                };
            }).filter((item) => item && item.title)
            : [];
    }

    function normalizePublications(items) {
        return Array.isArray(items)
            ? items.map((item) => {
                if (!item || typeof item !== 'object') return null;
                return {
                    title: sanitizePdfText(item.title || item.name),
                    venue: sanitizePdfText(item.venue || item.publication || item.journal),
                    year: sanitizePdfText(item.year || item.period),
                    authors: sanitizePdfText(item.authors),
                    detail: sanitizePdfText(item.detail || item.description),
                    citations: sanitizePdfText(item.citations || item.citationCount),
                    url: safeText(item.url || item.link || '')
                };
            }).filter((item) => item && (item.title || item.venue))
            : [];
    }

    function normalizeAcademicSection(items) {
        return Array.isArray(items)
            ? items.map((item) => {
                if (!item || typeof item !== 'object') return null;
                return {
                    title: sanitizePdfText(item.title || item.role || item.name),
                    organization: sanitizePdfText(item.organization || item.company || item.school),
                    period: sanitizePdfText(item.period || item.year || item.dates),
                    details: normalizeDetailList(item.details || item.points || item.highlights)
                };
            }).filter((item) => item && (item.title || item.organization || item.details.length))
            : [];
    }

    function saveDocument(doc, filename) {
        if (typeof window.PocketResumeSavePdf === 'function') {
            window.PocketResumeSavePdf(doc, filename, { kind: 'resume' });
            return;
        }
        doc.save(filename);
    }

    function buildContactParts(data) {
        const links = data.links;
        const raw = safeText(data.contact)
            .split('|')
            .map((part) => sanitizePdfText(part))
            .filter(Boolean);

        if (!raw.length) return [];

        const filtered = data.hasExplicitLinks ? raw.filter((part) => !isLinkPart(part, links)) : raw;
        if (filtered.length) return filtered;
        return data.hasExplicitLinks ? [] : raw;
    }

    function normalizeResumeData(raw) {
        const data = raw && typeof raw === 'object' ? raw : {};
        const skillGroups = normalizeSkillGroups(data);
        const flatSkills = Array.isArray(data.skills) ? toStringArray(data.skills) : [];
        const skills = flatSkills.length
            ? flatSkills
            : skillGroups.flatMap((group) => group.items).filter(Boolean);
        const projects = normalizeProjects(data.projects);
        const openSourceProjects = normalizeProjects(data.openSourceProjects);
        const links = normalizeLinks(data.links, data.contact);

        return {
            name: sanitizePdfText(data.name),
            subtitle: sanitizePdfText(data.subtitle),
            position: sanitizePdfText(data.position || data.headline),
            location: sanitizePdfText(data.location),
            contact: sanitizePdfText(data.contact),
            email: sanitizePdfText(data.email),
            phone: sanitizePdfText(data.phone),
            summary: sanitizePdfText(data.summary || data.profile || data.about),
            skills,
            skillGroups,
            links,
            hasExplicitLinks: Array.isArray(data.links) && data.links.length > 0,
            experience: normalizeExperience(data.experience),
            projects,
            openSourceProjects,
            education: normalizeEducation(data.education),
            certifications: toStringArray(data.certifications),
            honors: normalizeHonors(data.honors || data.awards),
            publicationsSummary: sanitizePdfText(data.publicationsSummary || data.publicationSummary),
            publications: normalizePublications(data.publications),
            researchInterests: toCommaList(data.researchInterests || data.researchAreas),
            teaching: normalizeAcademicSection(data.teaching),
            service: normalizeAcademicSection(data.service || data.committees)
        };
    }

    function formatContactLine(data) {
        const parts = buildContactParts(data);
        if (parts.length) return parts.join(' | ');
        return '';
    }

    function fileNameFor(data, prefix) {
        const stem = sanitizePdfText(data.name || 'Generated').replace(/\s+/g, '_') || 'Generated';
        return `${prefix}_${stem}.pdf`;
    }

    function addWrappedText(doc, text, x, y, maxWidth, fontSize, fontStyle, lineHeight, options = {}) {
        const clean = sanitizePdfText(text);
        if (!clean) return { nextY: y, height: 0, lines: [] };

        doc.setFontSize(fontSize);
        doc.setFont('helvetica', fontStyle);
        doc.setLineHeightFactor(lineHeight);
        if (options.color) doc.setTextColor(options.color);
        else doc.setTextColor('#000000');

        const lines = doc.splitTextToSize(clean, maxWidth);
        if (options.align === 'center') {
            doc.text(lines, x, y, { align: 'center' });
        } else if (options.align === 'right') {
            doc.text(lines, x, y, { align: 'right' });
        } else {
            doc.text(lines, x, y);
        }

        const height = lines.length * fontSize * lineHeight;
        return { nextY: y + height, height, lines };
    }

    function fitFontSize(doc, text, maxWidth, startSize, minSize, fontStyle) {
        let size = startSize;
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(size);
        while (size > minSize && doc.getTextWidth(sanitizePdfText(text)) > maxWidth) {
            size -= 1;
            doc.setFontSize(size);
        }
        return size;
    }

    function drawRightAlignedWrapped(doc, text, rightX, y, maxWidth, fontSize, fontStyle, lineHeight) {
        const clean = sanitizePdfText(text);
        if (!clean) return { nextY: y, lines: 0 };
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(clean, maxWidth);
        lines.forEach((line, index) => {
            doc.text(line, rightX, y + index * fontSize * lineHeight, { align: 'right' });
        });
        return { nextY: y + lines.length * fontSize * lineHeight, lines: lines.length };
    }

    const DEEDY_CONFIGS = [
        { margin: 30, nameSize: 29, subtitleSize: 11.8, sectionSize: 11.8, bodySize: 9.6, smallSize: 8.9, lineHeight: 1.18, columnGap: 18, leftRatio: 0.31, headerGap: 25, blockGap: 9, headerStackGap: 4 },
        { margin: 28, nameSize: 26, subtitleSize: 10.9, sectionSize: 11, bodySize: 8.9, smallSize: 8.2, lineHeight: 1.15, columnGap: 17, leftRatio: 0.31, headerGap: 23, blockGap: 8, headerStackGap: 3 },
        { margin: 26, nameSize: 24, subtitleSize: 10, sectionSize: 10.5, bodySize: 8.4, smallSize: 7.8, lineHeight: 1.12, columnGap: 16, leftRatio: 0.31, headerGap: 20, blockGap: 7, headerStackGap: 3 },
        { margin: 22, nameSize: 22, subtitleSize: 9.4, sectionSize: 10, bodySize: 8, smallSize: 7.4, lineHeight: 1.08, columnGap: 14, leftRatio: 0.31, headerGap: 16, blockGap: 6, headerStackGap: 2 },
        { margin: 18, nameSize: 20, subtitleSize: 8.8, sectionSize: 9.5, bodySize: 7.5, smallSize: 7, lineHeight: 1.04, columnGap: 12, leftRatio: 0.31, headerGap: 14, blockGap: 5, headerStackGap: 2 },
        { margin: 16, nameSize: 18, subtitleSize: 8.4, sectionSize: 9, bodySize: 7.2, smallSize: 6.8, lineHeight: 1, columnGap: 11, leftRatio: 0.32, headerGap: 12, blockGap: 4, headerStackGap: 2 },
        { margin: 14, nameSize: 17, subtitleSize: 8, sectionSize: 8.6, bodySize: 7, smallSize: 6.6, lineHeight: 0.98, columnGap: 10, leftRatio: 0.32, headerGap: 10, blockGap: 3.5, headerStackGap: 1.5 }
    ];

    const DEEDY_DROP_ORDER = ['openSource', 'awards', 'publications', 'certifications', 'links', 'projects', 'summary'];

    const DEEDY_DROP_LABELS = {
        openSource: 'Open Source',
        awards: 'Awards',
        publications: 'Publications',
        certifications: 'Certifications',
        links: 'Links',
        projects: 'Projects',
        summary: 'Summary',
        experience: 'oldest roles'
    };

    function deedyConfig(doc, cfg) {
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const contentWidth = pageWidth - cfg.margin * 2;
        const leftWidth = contentWidth * cfg.leftRatio;
        const rightWidth = contentWidth - leftWidth - cfg.columnGap;
        return {
            pageWidth,
            pageHeight,
            contentWidth,
            leftWidth,
            rightWidth,
            leftX: cfg.margin,
            rightX: cfg.margin + leftWidth + cfg.columnGap,
            bottom: pageHeight - cfg.margin
        };
    }

    function createColumn(doc, cfg, geometry, x, width, startY) {
        const column = {
            doc,
            cfg,
            x,
            width,
            y: startY,
            bottom: geometry.bottom,
            overflow: false,
            stopped: false,
            size(role) {
                return role === 'small' ? cfg.smallSize : cfg.bodySize;
            },
            lineHeight(fontSize) {
                return fontSize * cfg.lineHeight;
            },
            ensure(height) {
                if (column.stopped) return false;
                if (column.y + height > column.bottom) {
                    column.overflow = true;
                    column.stopped = true;
                    return false;
                }
                return true;
            },
            measureLines(text, fontSize, fontStyle, maxWidth) {
                const clean = sanitizePdfText(text);
                if (!clean) return [];
                doc.setFont('helvetica', fontStyle);
                doc.setFontSize(fontSize);
                return doc.splitTextToSize(clean, maxWidth);
            },
            measureParagraph(text, fontSize, fontStyle, maxWidth) {
                const lines = column.measureLines(text, fontSize, fontStyle, maxWidth);
                return lines.length ? lines.length * column.lineHeight(fontSize) : 0;
            },
            paragraph(text, options = {}) {
                const fontSize = options.fontSize || column.size(options.size);
                const fontStyle = options.fontStyle || options.style || 'normal';
                const gap = options.gap || 0;
                const maxWidth = options.maxWidth || column.width;
                const lines = column.measureLines(text, fontSize, fontStyle, maxWidth);
                if (!lines.length) return true;
                const height = lines.length * column.lineHeight(fontSize);
                if (!column.ensure(height + gap)) return false;
                doc.setFont('helvetica', fontStyle);
                doc.setFontSize(fontSize);
                doc.setTextColor(options.color || '#000000');
                doc.text(lines, column.x, column.y);
                column.y += height + gap;
                return true;
            },
            bullet(text, fontSize) {
                const indent = 7;
                const lines = column.measureLines(text, fontSize, 'normal', column.width - indent);
                if (!lines.length) return true;
                const height = lines.length * column.lineHeight(fontSize);
                if (!column.ensure(height + 1)) return false;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(fontSize);
                doc.setTextColor('#000000');
                doc.text('\u2022', column.x, column.y);
                doc.text(lines, column.x + indent, column.y);
                column.y += height + 1;
                return true;
            },
            entryHeader(primary, period) {
                const cleanPrimary = sanitizePdfText(primary);
                const cleanPeriod = sanitizePdfText(period);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(column.cfg.smallSize);
                const periodWidth = cleanPeriod ? doc.getTextWidth(cleanPeriod) : 0;
                const available = column.width - (cleanPeriod ? periodWidth + 8 : 0);
                const lines = column.measureLines(cleanPrimary, column.cfg.bodySize, 'bold', available);
                if (!lines.length) return true;
                const height = lines.length * column.lineHeight(column.cfg.bodySize);
                if (!column.ensure(height)) return false;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(column.cfg.bodySize);
                doc.setTextColor('#000000');
                doc.text(lines, column.x, column.y);
                if (cleanPeriod) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(column.cfg.smallSize);
                    doc.text(cleanPeriod, column.x + column.width, column.y, { align: 'right' });
                }
                column.y += height;
                return true;
            }
        };
        return column;
    }

    function deedySectionTitleHeight(cfg) {
        return cfg.sectionSize + cfg.blockGap + 5;
    }

    function drawDeedySectionTitle(column, title) {
        const { doc, cfg } = column;
        const clean = sanitizePdfText(title).toUpperCase();
        if (!clean) return true;
        if (!column.ensure(deedySectionTitleHeight(cfg))) return false;
        column.y += 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cfg.sectionSize);
        doc.setTextColor('#000000');
        doc.text(clean, column.x, column.y);
        column.y += 3;
        doc.setLineWidth(0.6);
        doc.setDrawColor(0, 0, 0);
        doc.line(column.x, column.y, column.x + column.width, column.y);
        column.y += cfg.blockGap + 2;
        return true;
    }

    function deedyOpHeight(column, op) {
        const { cfg } = column;
        switch (op.kind) {
        case 'paragraph':
            return column.measureParagraph(op.text, op.fontSize || column.size(op.size), op.fontStyle || 'normal', op.maxWidth || column.width) + (op.gap || 0);
        case 'bullet': {
            const fontSize = op.fontSize || cfg.smallSize;
            const lines = column.measureLines(op.text, fontSize, 'normal', column.width - 7);
            return lines.length ? lines.length * column.lineHeight(fontSize) + 1 : 0;
        }
        case 'entry': {
            const primary = op.primary;
            const period = op.period;
            column.doc.setFont('helvetica', 'normal');
            column.doc.setFontSize(cfg.smallSize);
            const periodWidth = period ? column.doc.getTextWidth(sanitizePdfText(period)) : 0;
            const available = column.width - (period ? periodWidth + 8 : 0);
            const headerLines = column.measureLines(primary, cfg.bodySize, 'bold', available);
            let height = headerLines.length * column.lineHeight(cfg.bodySize);
            if (op.secondary) height += column.measureParagraph(op.secondary, cfg.smallSize, 'italic', column.width) + 1;
            (op.bullets || []).forEach((point) => {
                height += column.measureParagraph(point, cfg.smallSize, 'normal', column.width - 7) + 1;
            });
            return height + (cfg.blockGap - 1);
        }
        case 'project': {
            const title = [op.title, op.venue].filter(Boolean).join(' | ');
            let height = column.measureParagraph(title, cfg.bodySize, 'bold', column.width) + 1;
            if (op.meta) height += column.measureParagraph(op.meta, cfg.smallSize, 'italic', column.width) + 1;
            (op.bullets || []).forEach((point) => {
                height += column.measureParagraph(point, cfg.smallSize, 'normal', column.width - 7) + 1;
            });
            if (!op.bullets || !op.bullets.length) {
                if (op.description) height += column.measureParagraph(op.description, cfg.smallSize, 'normal', column.width) + 1;
            }
            return height + (cfg.blockGap - 1);
        }
        case 'line':
            return column.measureParagraph(op.text, op.fontSize || column.size(op.size), op.fontStyle || 'normal', column.width) + (op.gap || 2);
        case 'space':
            return op.height || 0;
        default:
            return 0;
        }
    }

    function drawDeedyOp(column, op) {
        const { cfg } = column;
        switch (op.kind) {
        case 'paragraph':
            return column.paragraph(op.text, op);
        case 'bullet':
            return column.bullet(op.text, op.fontSize || cfg.smallSize);
        case 'entry': {
            if (!column.entryHeader(op.primary, op.period)) return false;
            if (op.secondary) {
                if (!column.paragraph(op.secondary, { fontSize: cfg.smallSize, fontStyle: 'italic', gap: 1 })) return false;
            }
            for (const point of op.bullets || []) {
                if (!column.bullet(point, cfg.smallSize)) return false;
            }
            column.y += cfg.blockGap - 1;
            return true;
        }
        case 'project': {
            const title = [op.title, op.venue].filter(Boolean).join(' | ');
            if (!column.paragraph(title, { fontSize: cfg.bodySize, fontStyle: 'bold', gap: 1 })) return false;
            if (op.meta) {
                if (!column.paragraph(op.meta, { fontSize: cfg.smallSize, fontStyle: 'italic', gap: 1 })) return false;
            }
            if (op.bullets && op.bullets.length) {
                for (const point of op.bullets) {
                    if (!column.bullet(point, cfg.smallSize)) return false;
                }
            } else if (op.description) {
                if (!column.paragraph(op.description, { fontSize: cfg.smallSize, fontStyle: 'normal', gap: 1 })) return false;
            }
            column.y += cfg.blockGap - 1;
            return true;
        }
        case 'line':
            return column.paragraph(op.text, { fontSize: op.fontSize || column.size(op.size), fontStyle: op.fontStyle || 'normal', gap: op.gap || 2 });
        case 'space':
            if (!column.ensure(op.height || 0)) return false;
            column.y += op.height || 0;
            return true;
        default:
            return true;
        }
    }

    function buildDeedySections(data, state) {
        const sections = [];
        const maxBullets = state.maxBullets;
        const dropped = state.dropped;
        const skillGroups = data.skillGroups.length ? data.skillGroups : (data.skills.length ? [{ label: 'Core Skills', items: data.skills }] : []);

        if (skillGroups.some((group) => group.items.length)) {
            const ops = [];
            skillGroups.forEach((group) => {
                if (group.label) ops.push({ kind: 'paragraph', text: group.label, size: 'body', fontStyle: 'bold', gap: 1 });
                ops.push({ kind: 'paragraph', text: group.items.join(' \u2022 '), size: 'small', gap: 3 });
            });
            sections.push({ id: 'skills', side: 'left', title: 'Skills', ops });
        }

        if (data.hasExplicitLinks && data.links.length && !dropped.has('links')) {
            sections.push({
                id: 'links',
                side: 'left',
                title: 'Links',
                ops: data.links.map((link) => ({
                    kind: 'line',
                    text: link.label ? `${link.label}: ${link.text}` : link.text,
                    size: 'small',
                    gap: 2
                }))
            });
        }

        if (data.openSourceProjects.length && !dropped.has('openSource')) {
            sections.push({
                id: 'openSource',
                side: 'left',
                title: 'Open Source',
                ops: data.openSourceProjects.map((project) => ({
                    kind: 'project',
                    title: project.title || project.platform,
                    venue: project.venue,
                    meta: [project.title ? project.platform : '', project.period].filter(Boolean).join(' | '),
                    bullets: (project.points || []).slice(0, 2),
                    description: project.description
                }))
            });
        }

        if (data.education.length) {
            const ops = [];
            data.education.forEach((education) => {
                const heading = education.school || education.degree;
                const degreeLine = education.degree && education.school && education.degree !== education.school ? education.degree : '';
                ops.push({ kind: 'paragraph', text: heading, size: 'body', fontStyle: 'bold', gap: 1 });
                if (degreeLine) ops.push({ kind: 'paragraph', text: degreeLine, size: 'small', gap: 1 });
                const meta = [education.year, education.location].filter(Boolean).join(' | ');
                if (meta) ops.push({ kind: 'paragraph', text: meta, size: 'small', fontStyle: 'italic', gap: 3 });
                else ops.push({ kind: 'space', height: 3 });
            });
            sections.push({ id: 'education', side: 'left', title: 'Education', ops });
        }

        if (data.certifications.length && !dropped.has('certifications')) {
            sections.push({
                id: 'certifications',
                side: 'left',
                title: 'Certifications',
                ops: data.certifications.map((certification) => ({ kind: 'line', text: certification, size: 'small', gap: 2 }))
            });
        }

        if (data.summary && !dropped.has('summary')) {
            sections.push({
                id: 'summary',
                side: 'right',
                title: 'Summary',
                ops: [{ kind: 'paragraph', text: data.summary, size: 'body', gap: 2 }]
            });
        }

        if (data.experience.length) {
            const entries = data.experience.slice(0, state.experienceLimit);
            const ops = [];
            entries.forEach((entry) => {
                const primary = entry.company || entry.title;
                const showTitle = entry.title && entry.company && entry.title !== entry.company;
                const secondary = [
                    showTitle ? entry.title : '',
                    entry.location
                ].filter(Boolean).join(' | ');
                ops.push({
                    kind: 'entry',
                    primary,
                    period: entry.period,
                    secondary,
                    bullets: (entry.points || []).slice(0, maxBullets)
                });
            });
            sections.push({ id: 'experience', side: 'right', title: 'Experience', ops });
        }

        if (data.projects.length && !dropped.has('projects')) {
            sections.push({
                id: 'projects',
                side: 'right',
                title: 'Selected Projects',
                ops: data.projects.map((project) => ({
                    kind: 'project',
                    title: project.title || project.platform,
                    venue: project.venue,
                    meta: [project.title ? project.platform : '', project.period].filter(Boolean).join(' | '),
                    bullets: (project.points || []).slice(0, 2),
                    description: project.description
                }))
            });
        }

        if (!dropped.has('publications') && (data.publicationsSummary || data.publications.length)) {
            const ops = [];
            if (data.publicationsSummary) {
                ops.push({ kind: 'paragraph', text: data.publicationsSummary, size: 'body', gap: 2 });
            } else {
                data.publications.forEach((publication) => {
                    const yearExtra = publication.year && !`${publication.title} ${publication.venue}`.includes(publication.year)
                        ? publication.year
                        : '';
                    ops.push({
                        kind: 'line',
                        text: [publication.title, publication.venue, yearExtra].filter(Boolean).join(' | '),
                        size: 'small',
                        gap: 2
                    });
                });
            }
            sections.push({ id: 'publications', side: 'right', title: 'Publications', ops });
        }

        if (data.honors.length && !dropped.has('awards')) {
            sections.push({
                id: 'awards',
                side: 'right',
                title: 'Awards',
                ops: data.honors.map((honor) => ({
                    kind: 'line',
                    text: [honor.year, honor.title, honor.issuer].filter(Boolean).join(' | '),
                    size: 'small',
                    gap: 2
                }))
            });
        }

        return sections;
    }

    function drawDeedyHeader(doc, data, cfg, geometry) {
        const subtitle = sanitizePdfText(data.position || data.subtitle);
        const contact = formatContactLine(data);
        const name = sanitizePdfText(data.name || 'Generated Resume');
        const nameSize = fitFontSize(doc, name, geometry.contentWidth, cfg.nameSize, 13, 'bold');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(nameSize);
        doc.setTextColor('#000000');
        doc.text(name, cfg.margin, cfg.margin + 8);

        let y = cfg.margin + nameSize;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(cfg.subtitleSize);

        const subtitleWidth = subtitle ? doc.getTextWidth(subtitle) : 0;
        const contactWidth = contact ? doc.getTextWidth(contact) : 0;

        if (subtitle && contact && subtitleWidth + contactWidth + 16 <= geometry.contentWidth) {
            doc.text(subtitle, cfg.margin, y);
            doc.text(contact, geometry.pageWidth - cfg.margin, y, { align: 'right' });
            y += cfg.subtitleSize * cfg.lineHeight;
        } else {
            if (subtitle) {
                const result = addWrappedText(doc, subtitle, cfg.margin, y, geometry.contentWidth, cfg.subtitleSize, 'normal', cfg.lineHeight);
                y = result.nextY + (contact ? cfg.headerStackGap : 0);
            }
            if (contact) {
                const result = drawRightAlignedWrapped(doc, contact, geometry.pageWidth - cfg.margin, y, geometry.contentWidth, cfg.subtitleSize, 'normal', cfg.lineHeight);
                y = result.nextY;
            }
        }

        return y + cfg.headerGap;
    }

    function renderDeedyAttempt(data, cfg, state) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        const geometry = deedyConfig(doc, cfg);
        const startY = drawDeedyHeader(doc, data, cfg, geometry);
        const left = createColumn(doc, cfg, geometry, geometry.leftX, geometry.leftWidth, startY);
        const right = createColumn(doc, cfg, geometry, geometry.rightX, geometry.rightWidth, startY);

        buildDeedySections(data, state).forEach((section) => {
            const column = section.side === 'left' ? left : right;
            if (column.stopped) return;
            const firstHeight = section.ops.length ? deedyOpHeight(column, section.ops[0]) : 0;
            if (!column.ensure(deedySectionTitleHeight(cfg) + firstHeight)) return;
            if (!drawDeedySectionTitle(column, section.title)) return;
            for (const op of section.ops) {
                if (!drawDeedyOp(column, op)) return;
            }
        });

        const overflow = left.overflow || right.overflow || left.y > left.bottom + 0.5 || right.y > right.bottom + 0.5;
        return { doc, overflow };
    }

    function deedyStages(data) {
        const maxAvailable = Math.max(1, Math.min(3, ...data.experience.map((entry) => Math.max(1, entry.points.length))));
        const stages = [];
        for (let bullets = maxAvailable; bullets >= 1; bullets -= 1) {
            stages.push({ maxBullets: bullets, dropped: new Set(), experienceLimit: data.experience.length });
        }
        const dropped = new Set();
        DEEDY_DROP_ORDER.forEach((id) => {
            if (id === 'summary' && !data.summary) return;
            if (id === 'projects' && !data.projects.length) return;
            dropped.add(id);
            stages.push({ maxBullets: 1, dropped: new Set(dropped), experienceLimit: data.experience.length });
        });
        const limitDropped = new Set(dropped);
        for (let limit = data.experience.length - 1; limit >= 1; limit -= 1) {
            limitDropped.add('experience');
            stages.push({ maxBullets: 1, dropped: new Set(limitDropped), experienceLimit: limit });
        }
        return stages;
    }

    function describeDeedyDrops(state, data) {
        const labels = [];
        DEEDY_DROP_ORDER.forEach((id) => {
            if (state.dropped.has(id)) labels.push(DEEDY_DROP_LABELS[id] || id);
        });
        if (state.experienceLimit < data.experience.length) labels.push(DEEDY_DROP_LABELS.experience);
        return labels;
    }

    function renderDeedyLayout(rawData) {
        const data = normalizeResumeData(rawData);
        const stages = deedyStages(data);
        let best = null;
        let chosen = null;

        for (const state of stages) {
            for (let index = 0; index < DEEDY_CONFIGS.length; index += 1) {
                const attempt = renderDeedyAttempt(data, DEEDY_CONFIGS[index], state);
                best = attempt;
                if (!attempt.overflow) {
                    chosen = { ...state, doc: attempt.doc };
                    break;
                }
            }
            if (chosen) break;
        }

        const dropped = chosen ? describeDeedyDrops(chosen, data) : [];
        const bulletsReduced = chosen ? chosen.maxBullets < Math.max(1, Math.min(3, ...data.experience.map((entry) => entry.points.length))) : false;

        saveDocument(chosen ? chosen.doc : best.doc, fileNameFor(data, 'Resume'));

        return {
            layout: 'deedy',
            pages: 1,
            fitted: !!chosen,
            dropped,
            bulletsReduced
        };
    }

    function renderAcademicCvLayout(rawData) {
        const data = normalizeResumeData(rawData);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        const margin = 48;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const contentWidth = pageWidth - margin * 2;
        const headingColor = '#101CA4';
        const mutedColor = '#4A4A4A';
        const lineHeight = 1.22;
        const footerY = pageHeight - 26;
        const bottom = () => pageHeight - margin;
        let y = 58;

        function newPage() {
            doc.addPage();
            y = margin;
        }

        function ensure(height) {
            if (y + height > bottom()) newPage();
        }

        function measure(text, fontSize, fontStyle, maxWidth) {
            const clean = sanitizePdfText(text);
            if (!clean) return [];
            doc.setFont('helvetica', fontStyle);
            doc.setFontSize(fontSize);
            return doc.splitTextToSize(clean, maxWidth);
        }

        function measureHeight(text, fontSize, fontStyle, maxWidth) {
            return measure(text, fontSize, fontStyle, maxWidth).length * fontSize * lineHeight;
        }

        function writeLines(lines, x, fontSize, fontStyle, color) {
            if (!lines.length) return;
            doc.setFont('helvetica', fontStyle);
            doc.setFontSize(fontSize);
            doc.setTextColor(color || '#000000');
            const step = fontSize * lineHeight;
            lines.forEach((line) => {
                if (y + step > bottom()) newPage();
                doc.setFont('helvetica', fontStyle);
                doc.setFontSize(fontSize);
                doc.setTextColor(color || '#000000');
                doc.text(line, x, y);
                y += step;
            });
        }

        function addParagraph(text, fontSize = 10.5, fontStyle = 'normal', gap = 4, color = '#000000', maxWidth = contentWidth) {
            const lines = measure(text, fontSize, fontStyle, maxWidth);
            if (!lines.length) return;
            writeLines(lines, margin, fontSize, fontStyle, color);
            y += gap;
        }

        function addSection(title, firstBlockHeight = 0) {
            const height = 6 + 16 + 14;
            ensure(height + firstBlockHeight);
            y += 6;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(headingColor);
            doc.text(sanitizePdfText(title).toUpperCase(), margin, y);
            y += 4;
            doc.setLineWidth(0.7);
            doc.setDrawColor(16, 28, 164);
            doc.line(margin, y, pageWidth - margin, y);
            y += 10;
        }

        function addBullet(text, indent = 12, fontSize = 10.2) {
            const lines = measure(text, fontSize, 'normal', contentWidth - indent);
            if (!lines.length) return;
            const height = lines.length * fontSize * lineHeight;
            ensure(height + 2);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(fontSize);
            doc.setTextColor('#000000');
            doc.circle(margin + 2, y - fontSize / 3, 1.1, 'F');
            writeLines(lines, margin + indent, fontSize, 'normal', '#000000');
            y += 2;
        }

        function entryHeader(primary, rightText, secondary, minFollowing = 0) {
            const cleanPrimary = sanitizePdfText(primary);
            const cleanRight = sanitizePdfText(rightText);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const rightWidth = cleanRight ? doc.getTextWidth(cleanRight) : 0;
            const available = contentWidth - (cleanRight ? rightWidth + 14 : 0);
            const primaryLines = measure(cleanPrimary, 11, 'bold', available);
            const primaryHeight = primaryLines.length * 11 * lineHeight;
            const secondaryHeight = secondary ? measureHeight(secondary, 10, 'italic', contentWidth) + 1 : 0;
            ensure(primaryHeight + secondaryHeight + 2 + minFollowing);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor('#000000');
            primaryLines.forEach((line, index) => {
                doc.text(line, margin, y + index * 11 * lineHeight);
            });
            if (cleanRight) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text(cleanRight, pageWidth - margin, y, { align: 'right' });
            }
            y += primaryHeight;
            if (secondary) {
                const lines = measure(secondary, 10, 'italic', contentWidth);
                writeLines(lines, margin, 10, 'italic', '#000000');
                y += 1;
            }
        }

        function firstBulletHeight(points) {
            if (!points || !points.length) return 0;
            return measureHeight(points[0], 10.2, 'normal', contentWidth - 12) + 2;
        }

        const name = sanitizePdfText(data.name || 'Generated CV');
        const nameSize = fitFontSize(doc, name, contentWidth, 22, 14, 'bold');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(nameSize);
        doc.setTextColor('#000000');
        doc.text(name, margin, y);
        y += nameSize * 0.9 + 4;

        const roleLine = sanitizePdfText(data.position || data.subtitle);
        if (roleLine) addParagraph(roleLine, 11, 'normal', 2, headingColor);

        const contactLine = formatContactLine(data);
        if (contactLine) addParagraph(contactLine, 10, 'normal', 4);

        if (data.hasExplicitLinks && data.links.length) {
            addParagraph(data.links.map((link) => link.label ? `${link.label}: ${link.text}` : link.text).join(' | '), 9.5, 'normal', 8);
        }

        if (data.summary) {
            addSection('Profile', measureHeight(data.summary, 10.5, 'normal', contentWidth));
            addParagraph(data.summary, 10.5, 'normal', 2);
        }

        if (data.researchInterests.length) {
            const interests = data.researchInterests.join(' \u2022 ');
            addSection('Research Interests', measureHeight(interests, 10.2, 'normal', contentWidth));
            addParagraph(interests, 10.2, 'normal', 2);
        }

        if (data.education.length) {
            addSection('Education', 30);
            data.education.forEach((education) => {
                entryHeader(
                    education.school || education.degree,
                    education.year,
                    education.degree && education.degree !== (education.school || education.degree) ? education.degree : '',
                    firstBulletHeight(education.details)
                );
                if (education.location) addParagraph(education.location, 9.8, 'italic', 2);
                education.details.forEach((detail) => addBullet(detail));
                y += 4;
            });
        }

        if (data.experience.length) {
            addSection('Experience', 30);
            data.experience.forEach((experience) => {
                entryHeader(
                    experience.title || experience.company,
                    experience.period,
                    [experience.company, experience.location].filter(Boolean).join(' | '),
                    firstBulletHeight(experience.points)
                );
                experience.points.forEach((point) => addBullet(point));
                y += 4;
            });
        }

        if (data.projects.length) {
            addSection('Research Projects', 30);
            data.projects.forEach((project) => {
                const followHeight = project.description
                    ? measureHeight(project.description, 10, 'normal', contentWidth) + 2
                    : firstBulletHeight(project.points);
                entryHeader(
                    project.title || project.platform,
                    project.period,
                    [project.title ? project.platform : '', project.venue].filter(Boolean).join(' | '),
                    followHeight
                );
                if (project.description) addParagraph(project.description, 10, 'normal', 2);
                project.points.forEach((point) => addBullet(point));
                y += 4;
            });
        }

        if (data.publications.length || data.publicationsSummary) {
            addSection('Publications', 34);
            if (data.publications.length) {
                data.publications.forEach((publication, index) => {
                    const indexLabel = `[${index + 1}] `;
                    const titleText = `${indexLabel}${publication.title || publication.venue}`;
                    const yearExtra = publication.year && !`${titleText} ${publication.venue}`.includes(publication.year)
                        ? publication.year
                        : '';
                    const metaParts = [publication.venue, yearExtra].filter(Boolean).join(', ');
                    const metaLine = [publication.citations ? `Citations: ${publication.citations}` : '', publication.url].filter(Boolean).join(' | ');

                    const blockHeight = (publication.authors ? measureHeight(publication.authors, 9.8, 'normal', contentWidth) + 1 : 0)
                        + measureHeight(titleText, 10.2, 'italic', contentWidth) + 1
                        + (metaParts ? measureHeight(metaParts, 9.8, 'normal', contentWidth) + 1 : 0)
                        + (publication.detail ? measureHeight(publication.detail, 9.8, 'normal', contentWidth) + 1 : 0)
                        + (metaLine ? measureHeight(metaLine, 9, 'normal', contentWidth) + 2 : 0);

                    ensure(blockHeight);
                    if (publication.authors) addParagraph(publication.authors, 9.8, 'normal', 1);
                    addParagraph(titleText, 10.2, 'italic', 1);
                    if (metaParts) addParagraph(metaParts, 9.8, 'normal', 1);
                    if (publication.detail) addParagraph(publication.detail, 9.8, 'normal', 1);
                    if (metaLine) addParagraph(metaLine, 9, 'normal', 2, mutedColor);
                    y += 3;
                });
            } else {
                addParagraph(data.publicationsSummary, 10.2, 'normal', 2);
            }
        }

        if (data.teaching.length) {
            addSection('Teaching', 30);
            data.teaching.forEach((item) => {
                entryHeader(item.title || item.organization, item.period, item.organization, firstBulletHeight(item.details));
                item.details.forEach((detail) => addBullet(detail));
                y += 3;
            });
        }

        if (data.service.length) {
            addSection('Service', 30);
            data.service.forEach((item) => {
                entryHeader(item.title || item.organization, item.period, item.organization, firstBulletHeight(item.details));
                item.details.forEach((detail) => addBullet(detail));
                y += 3;
            });
        }

        if (data.honors.length) {
            addSection('Honors & Awards', 26);
            data.honors.forEach((honor) => {
                entryHeader(
                    honor.title,
                    honor.year,
                    honor.issuer,
                    honor.detail ? measureHeight(honor.detail, 9.8, 'normal', contentWidth) + 2 : 0
                );
                if (honor.detail) addParagraph(honor.detail, 9.8, 'normal', 2);
                y += 2;
            });
        }

        const skillGroups = data.skillGroups.length ? data.skillGroups : (data.skills.length ? [{ label: 'Skills', items: data.skills }] : []);
        if (skillGroups.some((group) => group.items.length)) {
            const firstGroup = skillGroups.find((group) => group.items.length);
            const firstLine = `${firstGroup.label}: ${firstGroup.items.join(', ')}`;
            addSection('Skills', measureHeight(firstLine, 10, 'normal', contentWidth));
            skillGroups.forEach((group) => {
                addParagraph(`${group.label}: ${group.items.join(', ')}`, 10, 'normal', 2);
            });
        }

        if (data.certifications.length) {
            addSection('Certifications', 10.2 * lineHeight);
            data.certifications.forEach((certification) => addBullet(certification, 12, 10));
        }

        const totalPages = doc.internal.getNumberOfPages();
        if (totalPages > 1) {
            for (let page = 1; page <= totalPages; page += 1) {
                doc.setPage(page);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(mutedColor);
                doc.text(`${name} - ${page}`, pageWidth / 2, footerY, { align: 'center' });
            }
        }

        saveDocument(doc, fileNameFor(data, 'CV'));

        return {
            layout: 'academic-cv',
            pages: totalPages,
            fitted: true,
            dropped: [],
            bulletsReduced: false
        };
    }

    function generateResumePDF(rawData, _type, layout) {
        const selectedLayout = safeText(layout) || 'pocketresume';
        if (selectedLayout === 'deedy') {
            return renderDeedyLayout(rawData);
        }
        if (selectedLayout === 'academic-cv') {
            return renderAcademicCvLayout(rawData);
        }
        throw new Error(`Unsupported resume layout: ${selectedLayout}`);
    }

    window.ResumeRenderers = {
        generateResumePDF
    };
})();
