(function () {
  function safeText(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (!value || typeof value !== 'object') return '';
    return safeText(value.text || value.label || value.name || value.title || value.value || '');
  }

  function sanitizePdfText(text) {
    return safeText(text).replace(/[^\x00-\x7F]/g, (char) => {
      if (char === '\u2018' || char === '\u2019') return "'";
      if (char === '\u201C' || char === '\u201D') return '"';
      if (char === '\u2013' || char === '\u2014') return '-';
      if (char === '\u2022') return '';
      if (char === '\u00A0') return ' ';
      return ' ';
    }).trim();
  }

  function toStringArray(value) {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizePdfText(item)).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(/\s*\|\s*|\s*•\s*|\s*,\s*/).map((item) => sanitizePdfText(item)).filter(Boolean);
    }
    return [];
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

    if (normalized.length > 0) return normalized.slice(0, 8);

    return safeText(contact)
      .split('|')
      .map((part) => sanitizePdfText(part))
      .filter(Boolean)
      .map((part) => ({ label: '', text: part, url: '' }))
      .slice(0, 8);
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

  function normalizeResumeData(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const skillGroups = normalizeSkillGroups(data);
    const flatSkills = Array.isArray(data.skills) ? toStringArray(data.skills) : [];
    const skills = flatSkills.length
      ? flatSkills
      : skillGroups.flatMap((group) => group.items).filter(Boolean);
    const projects = normalizeProjects(data.projects);
    const openSourceProjects = normalizeProjects(data.openSourceProjects);

    return {
      name: sanitizePdfText(data.name),
      subtitle: sanitizePdfText(data.subtitle),
      position: sanitizePdfText(data.position || data.headline),
      location: sanitizePdfText(data.location),
      contact: sanitizePdfText(data.contact),
      summary: sanitizePdfText(data.summary || data.profile || data.about),
      skills,
      skillGroups,
      links: normalizeLinks(data.links, data.contact),
      experience: normalizeExperience(data.experience),
      projects,
      openSourceProjects: openSourceProjects.length
        ? openSourceProjects
        : projects.filter((project) => project.url || project.stars || project.venue).slice(0, 4),
      education: normalizeEducation(data.education),
      certifications: toStringArray(data.certifications),
      honors: normalizeHonors(data.honors || data.awards),
      publicationsSummary: sanitizePdfText(data.publicationsSummary || data.publicationSummary),
      publications: normalizePublications(data.publications),
      researchInterests: toStringArray(data.researchInterests || data.researchAreas),
      teaching: normalizeAcademicSection(data.teaching),
      service: normalizeAcademicSection(data.service || data.committees)
    };
  }

  function formatContactLine(data) {
    const parts = [];
    if (data.contact) parts.push(...data.contact.split('|').map((part) => sanitizePdfText(part)).filter(Boolean));
    if (!parts.length) {
      parts.push(...data.links.map((link) => sanitizePdfText(link.text)).filter(Boolean));
    }
    return parts.join(' | ');
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

  function estimateDeedyDensity(data) {
    const skillGroups = data.skillGroups.length ? data.skillGroups : (data.skills.length ? [{ label: 'Core Skills', items: data.skills }] : []);
    let score = 0;

    if (data.summary) score += Math.min(6, Math.ceil(data.summary.length / 110));

    score += skillGroups.reduce((total, group) => {
      const itemsText = group.items.join(' • ');
      return total + 1 + Math.ceil(itemsText.length / 36);
    }, 0);

    score += data.links.length * 0.8;

    score += data.openSourceProjects.reduce((total, project) => {
      const detailCount = Math.max(project.points.length, project.description ? 1 : 0);
      return total + 1.2 + (detailCount * 0.85);
    }, 0);

    score += data.education.reduce((total, education) => {
      return total + 1.5 + (education.degree ? 0.5 : 0) + ((education.year || education.location) ? 0.4 : 0) + (Math.min(education.details.length, 2) * 0.5);
    }, 0);

    score += data.certifications.length * 0.45;

    score += data.experience.reduce((total, entry) => {
      return total + 1.8 + (Math.max(entry.points.length, 1) * 1.05) + ((entry.title && entry.company) ? 0.3 : 0);
    }, 0);

    score += data.projects.reduce((total, project) => {
      const detailCount = Math.max(project.points.length, project.description ? 1 : 0);
      return total + 1.5 + (Math.max(detailCount, 1) * 0.95);
    }, 0);

    score += data.publicationsSummary
      ? Math.min(3, Math.ceil(data.publicationsSummary.length / 120))
      : data.publications.length * 0.85;

    score += data.honors.length * 0.7;

    return score;
  }

  function renderDeedyLayout(rawData) {
    const data = normalizeResumeData(rawData);
    const { jsPDF } = window.jspdf;
    const densityScore = estimateDeedyDensity(data);
    const standardConfigs = [
      { margin: 26, nameSize: 24, subtitleSize: 10, sectionSize: 10.5, bodySize: 8.4, smallSize: 7.8, lineHeight: 1.12, columnGap: 16, leftRatio: 0.31, headerGap: 20, blockGap: 7, headerStackGap: 3 },
      { margin: 22, nameSize: 22, subtitleSize: 9.4, sectionSize: 10, bodySize: 8, smallSize: 7.4, lineHeight: 1.08, columnGap: 14, leftRatio: 0.31, headerGap: 16, blockGap: 6, headerStackGap: 2 },
      { margin: 18, nameSize: 20, subtitleSize: 8.8, sectionSize: 9.5, bodySize: 7.5, smallSize: 7, lineHeight: 1.04, columnGap: 12, leftRatio: 0.31, headerGap: 14, blockGap: 5, headerStackGap: 2 }
    ];
    const mediumConfigs = [
      { margin: 28, nameSize: 26, subtitleSize: 10.9, sectionSize: 11, bodySize: 8.9, smallSize: 8.2, lineHeight: 1.15, columnGap: 17, leftRatio: 0.31, headerGap: 23, blockGap: 8, headerStackGap: 3 }
    ];
    const roomyConfigs = [
      { margin: 30, nameSize: 29, subtitleSize: 11.8, sectionSize: 11.8, bodySize: 9.6, smallSize: 8.9, lineHeight: 1.18, columnGap: 18, leftRatio: 0.31, headerGap: 25, blockGap: 9, headerStackGap: 4 },
      { margin: 28, nameSize: 27, subtitleSize: 11.2, sectionSize: 11.2, bodySize: 9.2, smallSize: 8.5, lineHeight: 1.16, columnGap: 17, leftRatio: 0.31, headerGap: 24, blockGap: 8.5, headerStackGap: 3 }
    ];
    const configs = densityScore <= 34
      ? roomyConfigs.concat(standardConfigs)
      : densityScore <= 44
        ? mediumConfigs.concat(standardConfigs)
        : standardConfigs;

    function render(doc, cfg) {
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - cfg.margin * 2;
      const leftWidth = contentWidth * cfg.leftRatio;
      const rightWidth = contentWidth - leftWidth - cfg.columnGap;
      const bottom = pageHeight - cfg.margin;
      let leftColumn;
      let rightColumn;
      let overflow = false;

      function markOverflow(column) {
        if (column.y > bottom) overflow = true;
      }

      function addSection(column, title) {
        column.y += 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cfg.sectionSize);
        doc.setTextColor('#000000');
        doc.text(sanitizePdfText(title).toUpperCase(), column.x, column.y);
        column.y += 3;
        doc.setLineWidth(0.6);
        doc.setDrawColor(0, 0, 0);
        doc.line(column.x, column.y, column.x + column.width, column.y);
        column.y += cfg.blockGap + 2;
        markOverflow(column);
      }

      function addParagraph(column, text, fontSize = cfg.bodySize, fontStyle = 'normal', bottomGap = 0) {
        const clean = sanitizePdfText(text);
        if (!clean) return;
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setLineHeightFactor(cfg.lineHeight);
        const lines = doc.splitTextToSize(clean, column.width);
        doc.text(lines, column.x, column.y);
        column.y += lines.length * fontSize * cfg.lineHeight + bottomGap;
        markOverflow(column);
      }

      function addSmallList(column, items) {
        items.filter(Boolean).forEach((item) => addParagraph(column, item, cfg.smallSize, 'normal', 2));
      }

      function addDenseExperience(column, entry) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cfg.bodySize);
        doc.text(sanitizePdfText(entry.company || entry.title), column.x, column.y);
        if (entry.period) {
          doc.setFont('helvetica', 'normal');
          doc.text(sanitizePdfText(entry.period), column.x + column.width, column.y, { align: 'right' });
        }
        column.y += cfg.bodySize * cfg.lineHeight;
        const roleLine = [entry.title, entry.location].filter(Boolean).join(' | ');
        if (roleLine) addParagraph(column, roleLine, cfg.smallSize, 'italic', 1);
        entry.points.forEach((point) => addParagraph(column, `• ${point}`, cfg.smallSize, 'normal', 1));
        column.y += cfg.blockGap - 1;
      }

      function addDenseProject(column, project) {
        const headingParts = [project.title, project.stars ? `★ ${project.stars}` : '', project.venue].filter(Boolean);
        addParagraph(column, headingParts.join(' | '), cfg.bodySize, 'bold', 1);
        const secondaryLine = [project.platform, project.period].filter(Boolean).join(' | ');
        if (secondaryLine) addParagraph(column, secondaryLine, cfg.smallSize, 'italic', 1);
        if (project.points.length) {
          project.points.slice(0, 2).forEach((point) => addParagraph(column, `• ${point}`, cfg.smallSize, 'normal', 1));
        } else if (project.description) {
          addParagraph(column, project.description, cfg.smallSize, 'normal', 1);
        }
        column.y += cfg.blockGap - 1;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cfg.nameSize);
      doc.text(sanitizePdfText(data.name || 'Generated Resume'), cfg.margin, cfg.margin + 8);
      const headerLineY = cfg.margin + cfg.nameSize;
      let headerBottomY = headerLineY;

      const subtitle = sanitizePdfText(data.position || data.subtitle);
      const contactLine = formatContactLine(data);
      if (subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(cfg.subtitleSize);
      }

      if (subtitle && contactLine) {
        const subtitleWidth = doc.getTextWidth(subtitle);
        const contactWidth = doc.getTextWidth(contactLine);
        const minHeaderGap = 12;
        const stackGap = cfg.headerStackGap || 2;

        if (subtitleWidth + contactWidth + minHeaderGap <= contentWidth) {
          doc.text(subtitle, cfg.margin, headerLineY);
          doc.text(contactLine, pageWidth - cfg.margin, headerLineY, { align: 'right' });
          headerBottomY = headerLineY + (cfg.subtitleSize * cfg.lineHeight);
        } else {
          const subtitleResult = addWrappedText(doc, subtitle, cfg.margin, headerLineY, contentWidth, cfg.subtitleSize, 'normal', cfg.lineHeight);
          const contactResult = addWrappedText(doc, contactLine, cfg.margin, subtitleResult.nextY + stackGap, contentWidth, cfg.subtitleSize, 'normal', cfg.lineHeight);
          headerBottomY = contactResult.nextY;
        }
      } else if (subtitle) {
        headerBottomY = addWrappedText(doc, subtitle, cfg.margin, headerLineY, contentWidth, cfg.subtitleSize, 'normal', cfg.lineHeight).nextY;
      } else if (contactLine) {
        headerBottomY = addWrappedText(doc, contactLine, pageWidth - cfg.margin, headerLineY, contentWidth, cfg.subtitleSize, 'normal', cfg.lineHeight, { align: 'right' }).nextY;
      }

      const defaultHeaderHeight = cfg.subtitleSize * cfg.lineHeight;
      const extraHeaderHeight = Math.max(0, headerBottomY - headerLineY - defaultHeaderHeight);
      const startY = cfg.margin + cfg.nameSize + 18 + cfg.headerGap + extraHeaderHeight;
      leftColumn = { x: cfg.margin, y: startY, width: leftWidth };
      rightColumn = { x: cfg.margin + leftWidth + cfg.columnGap, y: startY, width: rightWidth };

      const skillGroups = data.skillGroups.length ? data.skillGroups : [{ label: 'Core Skills', items: data.skills }];
      if (skillGroups.some((group) => group.items.length)) {
        addSection(leftColumn, 'Skills');
        skillGroups.forEach((group) => {
          addParagraph(leftColumn, group.label, cfg.bodySize, 'bold', 1);
          addParagraph(leftColumn, group.items.join(' • '), cfg.smallSize, 'normal', 3);
        });
      }

      if (data.links.length) {
        addSection(leftColumn, 'Links');
        addSmallList(leftColumn, data.links.map((link) => link.label ? `${link.label}: ${link.text}` : link.text));
      }

      if (data.openSourceProjects.length) {
        addSection(leftColumn, 'Open Source');
        data.openSourceProjects.slice(0, 4).forEach((project) => addDenseProject(leftColumn, project));
      }

      if (data.education.length) {
        addSection(leftColumn, 'Education');
        data.education.forEach((education) => {
          addParagraph(leftColumn, education.school || education.degree, cfg.bodySize, 'bold', 1);
          addParagraph(leftColumn, education.degree, cfg.smallSize, 'normal', 1);
          addParagraph(leftColumn, [education.year, education.location].filter(Boolean).join(' | '), cfg.smallSize, 'italic', 3);
        });
      }

      if (data.certifications.length) {
        addSection(leftColumn, 'Certifications');
        addSmallList(leftColumn, data.certifications.slice(0, 8));
      }

      if (data.summary) {
        addSection(rightColumn, 'Summary');
        addParagraph(rightColumn, data.summary, cfg.bodySize, 'normal', 2);
      }

      if (data.experience.length) {
        addSection(rightColumn, 'Experience');
        data.experience.forEach((entry) => addDenseExperience(rightColumn, entry));
      }

      if (data.projects.length) {
        addSection(rightColumn, 'Selected Projects');
        data.projects.forEach((project) => addDenseProject(rightColumn, project));
      }

      if (data.publicationsSummary || data.publications.length) {
        addSection(rightColumn, 'Publications');
        if (data.publicationsSummary) {
          addParagraph(rightColumn, data.publicationsSummary, cfg.bodySize, 'normal', 2);
        } else {
          data.publications.slice(0, 4).forEach((publication) => {
            addParagraph(rightColumn, [publication.title, publication.venue, publication.year].filter(Boolean).join(' | '), cfg.smallSize, 'normal', 2);
          });
        }
      }

      if (data.honors.length) {
        addSection(rightColumn, 'Awards');
        data.honors.slice(0, 6).forEach((honor) => {
          addParagraph(rightColumn, [honor.year, honor.title, honor.issuer].filter(Boolean).join(' | '), cfg.smallSize, 'normal', 2);
        });
      }

      if (leftColumn.y > bottom || rightColumn.y > bottom) overflow = true;
      return { overflow };
    }

    let outputDoc = null;
    let fallbackDoc = null;
    configs.forEach((cfg) => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const result = render(doc, cfg);
      fallbackDoc = doc;
      if (!outputDoc && !result.overflow) {
        outputDoc = doc;
      }
    });

    (outputDoc || fallbackDoc).save(fileNameFor(data, 'Resume'));
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
    const lineHeight = 1.22;
    let y = 58;

    function ensureSpace(height) {
      if (y + height > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    }

    function addSection(title) {
      ensureSpace(28);
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

    function addParagraph(text, fontSize = 10.5, fontStyle = 'normal', bottomGap = 4, color = '#000000') {
      const clean = sanitizePdfText(text);
      if (!clean) return;
      doc.setTextColor(color);
      const result = addWrappedText(doc, clean, margin, y, contentWidth, fontSize, fontStyle, lineHeight);
      y = result.nextY + bottomGap;
    }

    function addBullet(text, indent = 12, fontSize = 10.2) {
      const clean = sanitizePdfText(text);
      if (!clean) return;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      doc.setLineHeightFactor(lineHeight);
      const lines = doc.splitTextToSize(clean, contentWidth - indent);
      const height = lines.length * fontSize * lineHeight;
      ensureSpace(height + 2);
      doc.circle(margin + 2, y - fontSize / 3, 1.1, 'F');
      doc.text(lines, margin + indent, y);
      y += height + 2;
    }

    function addEntryHeader(primary, rightText, secondary) {
      ensureSpace(26);
      doc.setTextColor('#000000');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(sanitizePdfText(primary), margin, y);
      if (rightText) {
        doc.setFont('helvetica', 'normal');
        doc.text(sanitizePdfText(rightText), pageWidth - margin, y, { align: 'right' });
      }
      y += 11 * lineHeight;
      if (secondary) {
        const result = addWrappedText(doc, secondary, margin, y, contentWidth, 10, 'italic', lineHeight);
        y = result.nextY + 1;
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor('#000000');
    doc.text(sanitizePdfText(data.name || 'Generated CV'), margin, y);
    y += 20;

    const roleLine = sanitizePdfText(data.position || data.subtitle);
    if (roleLine) {
      addParagraph(roleLine, 11, 'normal', 2, headingColor);
    }

    const headerLine = [formatContactLine(data), data.location].filter(Boolean).join(' | ');
    if (headerLine) addParagraph(headerLine, 10, 'normal', 4);

    if (data.links.length) {
      addParagraph(data.links.map((link) => link.label ? `${link.label}: ${link.text}` : link.text).join(' | '), 9.5, 'normal', 8);
    }

    if (data.summary) {
      addSection('Profile');
      addParagraph(data.summary, 10.5, 'normal', 2);
    }

    if (data.researchInterests.length) {
      addSection('Research Interests');
      addParagraph(data.researchInterests.join(' • '), 10.2, 'normal', 2);
    }

    if (data.education.length) {
      addSection('Education');
      data.education.forEach((education) => {
        addEntryHeader(education.school || education.degree, education.year, education.degree);
        if (education.location) addParagraph(education.location, 9.8, 'italic', 2);
        education.details.forEach((detail) => addBullet(detail));
        y += 4;
      });
    }

    if (data.experience.length) {
      addSection('Experience');
      data.experience.forEach((experience) => {
        addEntryHeader(experience.title || experience.company, experience.period, [experience.company, experience.location].filter(Boolean).join(' | '));
        experience.points.forEach((point) => addBullet(point));
        y += 4;
      });
    }

    if (data.projects.length) {
      addSection('Research Projects');
      data.projects.forEach((project) => {
        addEntryHeader(project.title || project.platform, project.period, [project.platform, project.venue].filter(Boolean).join(' | '));
        if (project.description) addParagraph(project.description, 10, 'normal', 2);
        project.points.forEach((point) => addBullet(point));
        y += 4;
      });
    }

    if (data.publications.length || data.publicationsSummary) {
      addSection('Publications');
      if (data.publications.length) {
        data.publications.forEach((publication) => {
          addEntryHeader(publication.title || publication.venue, publication.year, publication.venue);
          if (publication.authors) addParagraph(publication.authors, 9.8, 'italic', 1);
          if (publication.detail) addParagraph(publication.detail, 9.8, 'normal', 1);
          const meta = [publication.citations ? `Citations: ${publication.citations}` : '', publication.url].filter(Boolean).join(' | ');
          if (meta) addParagraph(meta, 9.2, 'normal', 2, headingColor);
          y += 2;
        });
      } else {
        addParagraph(data.publicationsSummary, 10.2, 'normal', 2);
      }
    }

    if (data.teaching.length) {
      addSection('Teaching');
      data.teaching.forEach((item) => {
        addEntryHeader(item.title || item.organization, item.period, item.organization);
        item.details.forEach((detail) => addBullet(detail));
        y += 3;
      });
    }

    if (data.service.length) {
      addSection('Service');
      data.service.forEach((item) => {
        addEntryHeader(item.title || item.organization, item.period, item.organization);
        item.details.forEach((detail) => addBullet(detail));
        y += 3;
      });
    }

    if (data.honors.length) {
      addSection('Honors & Awards');
      data.honors.forEach((honor) => {
        addEntryHeader(honor.title, honor.year, honor.issuer);
        if (honor.detail) addParagraph(honor.detail, 9.8, 'normal', 2);
        y += 2;
      });
    }

    const skillGroups = data.skillGroups.length ? data.skillGroups : [{ label: 'Skills', items: data.skills }];
    if (skillGroups.some((group) => group.items.length)) {
      addSection('Skills');
      skillGroups.forEach((group) => {
        addParagraph(`${group.label}: ${group.items.join(', ')}`, 10, 'normal', 2);
      });
    }

    if (data.certifications.length) {
      addSection('Certifications');
      data.certifications.forEach((certification) => addBullet(certification, 12, 10));
    }

    doc.save(fileNameFor(data, 'CV'));
  }

  function generateResumePDF(rawData, _type, layout) {
    const selectedLayout = safeText(layout) || 'pocketresume';
    if (selectedLayout === 'deedy') {
      renderDeedyLayout(rawData);
      return;
    }
    if (selectedLayout === 'academic-cv') {
      renderAcademicCvLayout(rawData);
      return;
    }
    throw new Error(`Unsupported resume layout: ${selectedLayout}`);
  }

  window.ResumeRenderers = {
    generateResumePDF
  };
})();
