// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generateBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const resumeType = document.getElementById('resumeType');
  const statusDiv = document.getElementById('status');
  const resumeSelectorDiv = document.getElementById('resumeSelector');
  const coverLetterToggle = document.getElementById('coverLetterToggle');
  const cloudAccountCard = document.getElementById('cloudAccountCard');
  const cloudAccountTitle = document.getElementById('cloudAccountTitle');
  const cloudAccountSubtitle = document.getElementById('cloudAccountSubtitle');
  const cloudPlanBadge = document.getElementById('cloudPlanBadge');
  const cloudAvatarBtn = document.getElementById('cloudAvatarBtn');
  const cloudAvatarImg = document.getElementById('cloudAvatarImg');
  const cloudAvatarInitials = document.getElementById('cloudAvatarInitials');
  const cloudAccountMenu = document.getElementById('cloudAccountMenu');
  const cloudMenuAuthBtn = document.getElementById('cloudMenuAuthBtn');
  const cloudMenuPlansBtn = document.getElementById('cloudMenuPlansBtn');

  // --- Cover Letter Toggle ---
  chrome.storage.local.get(['coverLetterEnabled'], (data) => {
    coverLetterToggle.checked = !!data.coverLetterEnabled;
  });
  coverLetterToggle.addEventListener('change', () => {
    chrome.storage.local.set({ coverLetterEnabled: coverLetterToggle.checked });
  });

  // --- Resume selector state ---
  let loadedResumes = [];
  let selectedResumeId = null;
  let cloudSignedIn = false;

  // Custom Select Logic
  const customSelect = document.querySelector('.custom-select');
  const customOptions = document.querySelectorAll('.custom-option');
  const customSelectText = document.getElementById('customSelectText');
  const arrow = document.querySelector('.arrow');

  function normalizeResumeStyle(selectedStyle) {
    switch (selectedStyle) {
      case 'deedy':
      case 'academic-cv':
      case 'professional':
      case 'faang':
        return selectedStyle;
      case 'basic':
      case 'jake':
      default:
        return 'professional';
    }
  }

  async function updateCloudAccountState() {
    if (!cloudAccountCard || !window.CloudSync || !window.CloudSync.isConfigured || !window.CloudSync.isConfigured()) {
      if (cloudAccountCard) cloudAccountCard.style.display = 'none';
      return;
    }

    cloudAccountCard.style.display = 'block';
    cloudAccountCard.classList.add('inactive');
    if (cloudPlanBadge) {
      cloudPlanBadge.textContent = 'Checking Cloud Sync';
      cloudPlanBadge.className = 'cloud-plan-badge inactive';
    }

    try {
      await window.CloudSync.init();
      cloudSignedIn = await window.CloudSync.isSignedIn();
      const hasAccess = cloudSignedIn ? await window.CloudSync.hasCloudSyncAccess() : false;
      const profile = cloudSignedIn && window.CloudSync.getUserProfile ? await window.CloudSync.getUserProfile() : null;

      if (cloudSignedIn) {
        cloudAccountTitle.textContent = profile?.name || 'Signed in';
        cloudAccountSubtitle.textContent = profile?.email || 'Cloud account connected';
        cloudMenuAuthBtn.textContent = 'Sign Out';
        setCloudAvatar(profile);
      } else {
        cloudAccountTitle.textContent = 'Cloud Sync';
        cloudAccountSubtitle.textContent = 'Sign in to sync across devices';
        cloudMenuAuthBtn.textContent = 'Sign In';
        setCloudAvatar(null);
      }

      if (hasAccess) {
        cloudAccountCard.classList.remove('inactive');
        cloudPlanBadge.textContent = 'Cloud Sync active';
        cloudPlanBadge.className = 'cloud-plan-badge';
      } else if (cloudSignedIn) {
        cloudAccountCard.classList.add('inactive');
        cloudPlanBadge.textContent = 'Plan required';
        cloudPlanBadge.className = 'cloud-plan-badge inactive';
      } else {
        cloudAccountCard.classList.add('inactive');
        cloudPlanBadge.textContent = 'Signed out';
        cloudPlanBadge.className = 'cloud-plan-badge inactive';
      }
    } catch (error) {
      cloudAccountTitle.textContent = 'Cloud Sync';
      cloudAccountSubtitle.textContent = 'Could not load account state';
      cloudPlanBadge.textContent = 'Unavailable';
      cloudPlanBadge.className = 'cloud-plan-badge inactive';
      cloudAccountCard.classList.add('inactive');
    }
  }

  function setCloudAvatar(profile) {
    if (!cloudAvatarImg || !cloudAvatarInitials) return;
    if (profile?.imageUrl) {
      cloudAvatarImg.src = profile.imageUrl;
      cloudAvatarImg.style.display = 'block';
      cloudAvatarInitials.style.display = 'none';
      return;
    }
    cloudAvatarImg.removeAttribute('src');
    cloudAvatarImg.style.display = 'none';
    cloudAvatarInitials.style.display = 'inline';
    const source = profile?.name || profile?.email || 'Cloud Sync';
    cloudAvatarInitials.textContent = source.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  }

  function openPlansPage() {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#cloud-pricing') });
  }

  if (cloudAvatarBtn && cloudAccountMenu) {
    cloudAvatarBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      cloudAccountMenu.classList.toggle('open');
    });
    window.addEventListener('click', (event) => {
      if (!cloudAccountCard.contains(event.target)) {
        cloudAccountMenu.classList.remove('open');
      }
    });
  }

  if (cloudMenuAuthBtn) {
    cloudMenuAuthBtn.addEventListener('click', async () => {
      cloudAccountMenu.classList.remove('open');
      try {
        if (!window.CloudSync) return;
        if (cloudSignedIn) {
          await window.CloudSync.signOut();
        } else {
          await window.CloudSync.signIn();
        }
        setTimeout(updateCloudAccountState, 500);
      } catch (error) {
        showStatus(error.message || 'Cloud account action failed.', 'error');
      }
    });
  }

  if (cloudMenuPlansBtn) {
    cloudMenuPlansBtn.addEventListener('click', () => {
      cloudAccountMenu.classList.remove('open');
      openPlansPage();
    });
  }

  updateCloudAccountState();

  function getResumeStyleConfig(selectedStyle) {
    switch (normalizeResumeStyle(selectedStyle)) {
      case 'deedy':
        return { promptStyle: 'faang', layout: 'deedy' };
      case 'academic-cv':
        return { promptStyle: 'academic-cv', layout: 'academic-cv' };
      case 'faang':
        return { promptStyle: 'faang', layout: 'pocketresume' };
      case 'professional':
      default:
        return { promptStyle: 'professional', layout: 'pocketresume' };
    }
  }

  function resolveStoredResumeStyle(storedStyle, storedLayout) {
    if (storedLayout === 'deedy') return 'deedy';
    if (storedLayout === 'academic-cv') return 'academic-cv';
    return normalizeResumeStyle(storedStyle);
  }

  if (customSelect && customSelectText) {
      // Toggle dropdown
      document.querySelector('.custom-select__trigger').addEventListener('click', function(e) {
        customSelect.classList.toggle('open');
        e.stopPropagation();
      });

      // Handle option selection
      customOptions.forEach(option => {
        option.addEventListener('click', function(e) {
          if (!this.classList.contains('selected')) {
            // Update selected class
            customOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            
            // Update text
            customSelectText.textContent = this.textContent;
            
            // Update hidden select
            const value = this.getAttribute('data-value');
            resumeType.value = value;

            // Persist selection
            chrome.storage.local.set({ resumeType: value }, () => {
              chrome.storage.local.remove('resumeLayout');
            });
          }
          // Close dropdown
          customSelect.classList.remove('open');
          e.stopPropagation();
        });
      });

      // Close when clicking outside
      window.addEventListener('click', function(e) {
        if (!customSelect.contains(e.target)) {
          customSelect.classList.remove('open');
        }
      });
  }


  // Check if settings are configured + load resumes
  chrome.storage.local.get(['geminiApiKey', 'openrouterApiKey', 'openaiApiKey', 'anthropicApiKey', 'apiProvider', 'resumes', 'userProfile', 'resumeType', 'resumeLayout', 'selectedResumeId'], (data) => {
    // Migrate legacy profile
    if (data.userProfile && (!data.resumes || data.resumes.length === 0)) {
      loadedResumes = [{ id: 'migrated_1', label: 'Resume 1', content: data.userProfile }];
    } else if (data.resumes && data.resumes.length > 0) {
      loadedResumes = data.resumes;
    }

    const hasResumes = loadedResumes.length > 0 && loadedResumes.some(r => r.content && r.content.trim());
    const provider = data.apiProvider || 'google';
    
    let hasApiKey = false;
    if (provider === 'google' && data.geminiApiKey) hasApiKey = true;
    if (provider === 'openrouter' && data.openrouterApiKey) hasApiKey = true;
    if (provider === 'openai' && data.openaiApiKey) hasApiKey = true;
    if (provider === 'anthropic' && data.anthropicApiKey) hasApiKey = true;

    if (!hasApiKey || !hasResumes) {
      showStatus("Please configure your API Key and Profile in Settings first.", "error");
      generateBtn.disabled = true;
    }

    // Set selected resume
    if (data.selectedResumeId && loadedResumes.find(r => r.id === data.selectedResumeId)) {
      selectedResumeId = data.selectedResumeId;
    } else if (loadedResumes.length > 0) {
      selectedResumeId = loadedResumes[0].id;
    }

    // Render resume selector (only if 2+ resumes)
    renderResumeSelector();

    // Restore persisted resume style
    const storedResumeStyle = resolveStoredResumeStyle(data.resumeType, data.resumeLayout);
    if (storedResumeStyle) {
      resumeType.value = storedResumeStyle;
      // Update custom dropdown UI to match
      if (customSelectText) {
        customOptions.forEach(opt => {
          if (opt.getAttribute('data-value') === storedResumeStyle) {
            customOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            customSelectText.textContent = opt.textContent;
          }
        });
      }
    }

    if (data.resumeLayout || data.resumeType !== storedResumeStyle) {
      chrome.storage.local.set({ resumeType: storedResumeStyle }, () => {
        chrome.storage.local.remove('resumeLayout');
      });
    }
  });

  // --- Resume Selector Rendering ---
  function renderResumeSelector() {
    if (loadedResumes.length < 2) {
      resumeSelectorDiv.style.display = 'none';
      return;
    }

    resumeSelectorDiv.style.display = 'flex';
    resumeSelectorDiv.innerHTML = '';

    loadedResumes.forEach((resume, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'resume-selector-btn' + (resume.id === selectedResumeId ? ' active' : '');
      btn.title = resume.label || `Resume ${index + 1}`;
      btn.innerHTML = `<span class="rs-number">${index + 1}</span><span class="rs-label">${escapeHtml(resume.label || `Resume ${index + 1}`)}</span>`;
      btn.addEventListener('click', () => {
        selectedResumeId = resume.id;
        chrome.storage.local.set({ selectedResumeId: resume.id });
        // Update active state
        resumeSelectorDiv.querySelectorAll('.resume-selector-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      resumeSelectorDiv.appendChild(btn);
    });
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  generateBtn.addEventListener('click', async () => {
    // UI Reset
    generateBtn.disabled = true;
    const selectedStyle = normalizeResumeStyle(resumeType.value || 'professional');
    resumeType.value = selectedStyle;
    const styleConfig = getResumeStyleConfig(selectedStyle);

    // Check toggles to show appropriate status
    const settings = await chrome.storage.local.get(['coverLetterEnabled']);
    const coverLetterEnabled = !!settings.coverLetterEnabled;

    if (coverLetterEnabled) {
      showStatus("Generating resume and cover letter... This may take 20-40 seconds.", "loading");
    } else {
      showStatus("Capturing page and generating resume... This may take 10-20 seconds.", "loading");
    }

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to Background to start the pipeline
    chrome.runtime.sendMessage({
      type: 'START_GENERATION',
      payload: {
        tabId: tab.id,
        resumeStyle: selectedStyle,
        resumeId: selectedResumeId
      }
    }, (response) => {
      
      if (chrome.runtime.lastError) {
        showStatus("Error: " + chrome.runtime.lastError.message, "error");
        generateBtn.disabled = false;
        return;
      }

      if (response && response.status === 'success') {
        try {
          // Clean the resume response (Strip Markdown code blocks if present)
          let rawData = response.data.trim();
          if (rawData.startsWith('```json')) {
            rawData = rawData.replace(/^```json/, '').replace(/```$/, '');
          } else if (rawData.startsWith('```')) {
            rawData = rawData.replace(/^```/, '').replace(/```$/, '');
          }

          const resumeData = JSON.parse(rawData);
          if (styleConfig.layout === 'pocketresume') {
            generatePDF(resumeData, selectedStyle);
          } else if (window.ResumeRenderers && typeof window.ResumeRenderers.generateResumePDF === 'function') {
            window.ResumeRenderers.generateResumePDF(resumeData, selectedStyle, styleConfig.layout);
          } else {
            throw new Error('Resume renderer module failed to load.');
          }

          // Handle cover letter if present
          if (response.coverLetterData) {
            try {
              let rawCL = response.coverLetterData.trim();
              if (rawCL.startsWith('```json')) {
                rawCL = rawCL.replace(/^```json/, '').replace(/```$/, '');
              } else if (rawCL.startsWith('```')) {
                rawCL = rawCL.replace(/^```/, '').replace(/```$/, '');
              }

              const coverLetterParsed = JSON.parse(rawCL);
              generateCoverLetterPDF(coverLetterParsed);
              showStatus("Resume and cover letter downloaded successfully!", "success");
            } catch (clError) {
              console.error("Cover Letter JSON Parse Error:", clError);
              console.log("Raw CL Data:", response.coverLetterData);
              showStatus("Resume downloaded. Cover letter parsing failed - please try again.", "error");
            }
          } else {
            showStatus("Resume downloaded successfully!", "success");
          }
        } catch (e) {
          console.error("JSON Parse Error:", e);
          console.log("Raw Data:", response.data);
          showStatus("Error parsing generated resume. Please try again.", "error");
        }
      } else {
        showStatus("Error: " + (response ? response.message : "Unknown error"), "error");
      }
      generateBtn.disabled = false;
    });
  });

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.className = type; // loading, error, success
    statusDiv.style.display = 'block';
  }

  function generatePDF(data, type) {
    const { jsPDF } = window.jspdf;

    // Blue accent matching the reference resume
    const HEADER_COLOR = '#1A5DC0';
    const HEADER_RGB = [26, 93, 192];

    // Progressive configs: default → tightest (for auto-fit loop)
    const configs = [
      { margin: 40, nameSize: 14, subtitleSize: 11, contactSize: 10, headerSize: 12, bodySize: 11, lineHeight: 1.3, sectionTopGap: 8, sectionBottomGap: 14, bulletBottom: 2, jobBottom: 4, startY: 45, bulletIndent: 12 },
      { margin: 38, nameSize: 14, subtitleSize: 10.5, contactSize: 9.5, headerSize: 11.5, bodySize: 10.5, lineHeight: 1.2, sectionTopGap: 6, sectionBottomGap: 12, bulletBottom: 1.5, jobBottom: 3, startY: 42, bulletIndent: 11 },
      { margin: 36, nameSize: 13, subtitleSize: 10, contactSize: 9, headerSize: 11, bodySize: 10, lineHeight: 1.15, sectionTopGap: 4, sectionBottomGap: 10, bulletBottom: 1, jobBottom: 2, startY: 40, bulletIndent: 10 },
      { margin: 32, nameSize: 13, subtitleSize: 9.5, contactSize: 9, headerSize: 10.5, bodySize: 9.5, lineHeight: 1.1, sectionTopGap: 3, sectionBottomGap: 8, bulletBottom: 0.5, jobBottom: 1.5, startY: 38, bulletIndent: 10 },
    ];

    // --- Sanitise text for standard PDF fonts ---
    function sanitize(text) {
      if (!text) return '';
      return text.replace(/[^\x00-\x7F]/g, (char) => {
        if (char === '\u2018' || char === '\u2019') return "'";
        if (char === '\u201C' || char === '\u201D') return '"';
        if (char === '\u2013' || char === '\u2014') return '-';
        if (char === '\u2022') return '';
        return ' ';
      }).trim();
    }

    // --- Core renderer (driven by cfg) ---
    function renderResume(doc, cfg) {
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - cfg.margin * 2;
      let y = cfg.startY;

      // --- Helpers ---
      function checkPageBreak(h) {
        if (y + h > pageHeight - cfg.margin) { doc.addPage(); y = cfg.startY; }
      }

      function addText(text, fontSize, fontStyle, options) {
        if (!text) return;
        options = options || {};
        const align = options.align || 'left';
        const color = options.color || '#000000';
        const maxWidth = options.maxWidth || contentWidth;
        const bottomSpacing = options.bottomSpacing || 0;

        doc.setFontSize(fontSize);
        doc.setFont('helvetica', fontStyle);
        doc.setTextColor(color);

        const clean = sanitize(text);
        const lines = doc.splitTextToSize(clean, maxWidth);
        const height = lines.length * fontSize * cfg.lineHeight;
        checkPageBreak(height);

        if (align === 'center') doc.text(lines, pageWidth / 2, y, { align: 'center' });
        else if (align === 'right') doc.text(lines, pageWidth - cfg.margin, y, { align: 'right' });
        else doc.text(lines, cfg.margin, y);

        y += height + bottomSpacing;
      }

      function addSectionHeader(title) {
        checkPageBreak(25);
        y += cfg.sectionTopGap;

        doc.setFontSize(cfg.headerSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(HEADER_COLOR);
        doc.text(title.toUpperCase(), cfg.margin, y);

        y += 5;
        doc.setLineWidth(0.75);
        doc.setDrawColor(HEADER_RGB[0], HEADER_RGB[1], HEADER_RGB[2]);
        doc.line(cfg.margin, y, pageWidth - cfg.margin, y);

        y += cfg.sectionBottomGap;
      }

      function addBullet(text) {
        doc.setFontSize(cfg.bodySize);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#000000');

        const clean = sanitize(text);
        const maxWidth = contentWidth - cfg.bulletIndent;
        const lines = doc.splitTextToSize(clean, maxWidth);
        const height = lines.length * cfg.bodySize * cfg.lineHeight;
        checkPageBreak(height);

        doc.setFillColor(0, 0, 0);
        doc.circle(cfg.margin + 3, y - cfg.bodySize / 3, 1.5, 'F');
        doc.text(lines, cfg.margin + cfg.bulletIndent, y);
        y += height + cfg.bulletBottom;
      }

      // Inline list with bullet-dot separators (skills / certifications)
      function addInlineList(items) {
        const fs = cfg.bodySize;
        doc.setFontSize(fs);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#000000');

        const h = fs * cfg.lineHeight;
        const bRadius = 1.5;
        const bGap = 4;
        const sanitized = items.map(s => sanitize(s)).filter(Boolean);
        let cx = cfg.margin;
        checkPageBreak(h);

        sanitized.forEach((text, i) => {
          doc.setFontSize(fs);
          doc.setFont('helvetica', 'normal');
          const tw = doc.getTextWidth(text);

          if (cx > cfg.margin && cx + tw > pageWidth - cfg.margin) { cx = cfg.margin; y += h; checkPageBreak(h); }

          if (tw > contentWidth) {
            const wrapped = doc.splitTextToSize(text, contentWidth);
            wrapped.forEach((line, li) => {
              checkPageBreak(h); doc.text(line, cfg.margin, y);
              if (li < wrapped.length - 1) { y += h; cx = cfg.margin; } else { cx = cfg.margin + doc.getTextWidth(line); }
            });
          } else {
            doc.text(text, cx, y); cx += tw;
          }

          if (i < sanitized.length - 1) {
            const totalBW = bGap + bRadius * 2 + bGap;
            if (cx + totalBW > pageWidth - cfg.margin) { cx = cfg.margin; y += h; checkPageBreak(h); }
            cx += bGap;
            doc.setFillColor(0, 0, 0);
            doc.circle(cx + bRadius, y - fs / 3, bRadius, 'F');
            cx += bRadius * 2 + bGap;
          }
        });

        y += h + cfg.sectionTopGap;
      }

      // Entry header row: "Bold Primary  |  Italic Secondary"  ...  Period (right)
      function addEntryHeader(primary, secondary, period) {
        doc.setFontSize(cfg.bodySize);
        doc.setTextColor('#000000');

        const cleanPeriod = sanitize(period);
        const cleanPrimary = sanitize(primary);
        const cleanSecondary = sanitize(secondary);

        // Period (right)
        doc.setFont('helvetica', 'normal');
        const periodWidth = cleanPeriod ? doc.getTextWidth(cleanPeriod) : 0;
        if (cleanPeriod) doc.text(cleanPeriod, pageWidth - cfg.margin, y, { align: 'right' });

        const availableWidth = contentWidth - periodWidth - 15;

        // Primary (bold)
        doc.setFont('helvetica', 'bold');
        doc.text(cleanPrimary, cfg.margin, y);
        const primaryWidth = doc.getTextWidth(cleanPrimary);

        // " | " + Secondary (italic)
        if (cleanSecondary) {
          const sep = '  |  ';
          doc.setFont('helvetica', 'normal');
          const sepWidth = doc.getTextWidth(sep);
          doc.setFont('helvetica', 'italic');
          const secWidth = doc.getTextWidth(cleanSecondary);

          if (primaryWidth + sepWidth + secWidth <= availableWidth) {
            doc.setFont('helvetica', 'normal');
            doc.text(sep, cfg.margin + primaryWidth, y);
            doc.setFont('helvetica', 'italic');
            doc.text(cleanSecondary, cfg.margin + primaryWidth + sepWidth, y);
          } else {
            y += cfg.bodySize * cfg.lineHeight;
            doc.setFont('helvetica', 'italic');
            doc.text(cleanSecondary, cfg.margin, y);
          }
        }

        y += cfg.bodySize * cfg.lineHeight;
      }

      // ========================
      // === RENDERING LOGIC  ===
      // ========================

      // 1. Name
      addText(data.name, cfg.nameSize, 'bold', { align: 'center', bottomSpacing: 2 });

      // 2. Subtitle
      if (data.subtitle) {
        addText(data.subtitle, cfg.subtitleSize, 'normal', { align: 'center', color: HEADER_COLOR, bottomSpacing: 3 });
      }

      // 3. Contact
      addText(data.contact, cfg.contactSize, 'normal', { align: 'center', bottomSpacing: 8 });

      // 4. Summary
      if (data.summary) {
        addSectionHeader('Professional Summary');
        addText(data.summary, cfg.bodySize, 'normal', { bottomSpacing: 4 });
      }

      // 5. Skills
      if (data.skills && data.skills.length > 0) {
        addSectionHeader('Skills');
        addInlineList(data.skills);
      }

      // 6. Experience
      if (data.experience && data.experience.length > 0) {
        addSectionHeader('Experience');
        data.experience.forEach(exp => {
          checkPageBreak(30);
          const location = (exp.location && !/^n\/a$/i.test(exp.location)) ? exp.location : '';
          const company = exp.company + (location ? ' \u2014 ' + location : '');
          const period = (exp.period && !/^n\/a$/i.test(exp.period)) ? exp.period : '';
          addEntryHeader(exp.title, company, period);
          y += 2;
          if (exp.points && Array.isArray(exp.points)) { exp.points.forEach(p => addBullet(p)); }
          y += cfg.jobBottom;
        });
      }

      // 7. Featured Projects
      if (data.projects && data.projects.length > 0) {
        addSectionHeader('Featured Projects');
        data.projects.forEach(proj => {
          checkPageBreak(30);
          // Support old schema (name/description) and new schema (title/platform/period/points)
          const title = proj.title || proj.name || '';
          const platform = proj.platform || '';
          const period = proj.period || '';
          addEntryHeader(title, platform, period);

          if (proj.points && Array.isArray(proj.points)) {
            y += 2;
            proj.points.forEach(p => addBullet(p));
          } else if (proj.description) {
            addText(proj.description, cfg.bodySize, 'normal', { bottomSpacing: 4 });
          }
          y += cfg.jobBottom;
        });
      }

      // 8. Education
      if (data.education && data.education.length > 0) {
        addSectionHeader('Education');
        data.education.forEach(edu => {
          checkPageBreak(20);
          const yearText = (edu.year && !/^n\/a$/i.test(edu.year)) ? edu.year : '';
          addEntryHeader(edu.degree, edu.school, yearText);
          y += 2;
        });
      }

      // 9. Certifications (inline)
      if (data.certifications && data.certifications.length > 0) {
        addSectionHeader('Certifications');
        // Support old schema (array of objects) and new schema (array of strings)
        const certStrings = data.certifications.map(cert => {
          if (typeof cert === 'string') return cert;
          let text = cert.name || '';
          const issuer = (cert.issuer && !/^(n\/a|none|unknown|ongoing)$/i.test(cert.issuer)) ? cert.issuer : '';
          const yr = (cert.year && !/^(n\/a|none|unknown|ongoing|present)$/i.test(cert.year)) ? cert.year : '';
          if (issuer) text += ' - ' + issuer;
          if (yr) text += ' (' + yr + ')';
          return text;
        }).filter(Boolean);
        addInlineList(certStrings);
      }
    }

    // --- Auto-fit loop: try each config, save first that fits 1 page ---
    for (const cfg of configs) {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      renderResume(doc, cfg);
      if (doc.internal.getNumberOfPages() === 1) {
        doc.save(`Resume_${(data.name || 'Generated').replace(/\s+/g, '_')}.pdf`);
        return;
      }
    }

    // Fallback: save tightest attempt even if >1 page
    const fallbackDoc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    renderResume(fallbackDoc, configs[configs.length - 1]);
    fallbackDoc.save(`Resume_${(data.name || 'Generated').replace(/\s+/g, '_')}.pdf`);
  }

  function generateCoverLetterPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter'
    });

    const margin = 60;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);
    const lineHeight = 1.4;
    let y = 60;

    // --- Helper: Sanitize text for standard fonts ---
    function sanitize(text) {
      if (!text) return "";
      return text.replace(/[^\x00-\x7F]/g, (char) => {
        if (char === '\u2018' || char === '\u2019') return "'";
        if (char === '\u201C' || char === '\u201D') return '"';
        if (char === '\u2013' || char === '\u2014') return '-';
        return " ";
      });
    }

    // --- Helper: Add text block ---
    function addTextBlock(text, fontSize, fontStyle, options = {}) {
      if (!text) return;

      const align = options.align || 'left';
      const bottomSpacing = options.bottomSpacing || 0;
      const maxWidth = options.maxWidth || contentWidth;

      doc.setFontSize(fontSize);
      doc.setFont("helvetica", fontStyle);
      doc.setTextColor("#000000");

      const cleanText = sanitize(text);
      const lines = doc.splitTextToSize(cleanText, maxWidth);
      const height = lines.length * fontSize * lineHeight;

      // Page break check
      if (y + height > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = 60;
      }

      if (align === 'center') {
        doc.text(lines, pageWidth / 2, y, { align: 'center' });
      } else {
        doc.text(lines, margin, y);
      }

      y += height + bottomSpacing;
    }

    // --- Rendering ---

    // 1. Applicant Name (header)
    addTextBlock(data.applicant_name, 14, 'bold', { align: 'center', bottomSpacing: 4 });

    // 2. Contact Info
    addTextBlock(data.applicant_contact, 10, 'normal', { align: 'center', bottomSpacing: 6 });

    // 3. Horizontal rule
    doc.setLineWidth(0.5);
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    // 4. Date
    addTextBlock(data.date, 11, 'normal', { bottomSpacing: 10 });

    // 5. Recipient block
    if (data.recipient_name && data.recipient_name !== 'Hiring Manager') {
      addTextBlock(data.recipient_name, 11, 'normal', { bottomSpacing: 2 });
      if (data.recipient_title) {
        addTextBlock(data.recipient_title, 11, 'normal', { bottomSpacing: 2 });
      }
    }
    if (data.company_name) {
      addTextBlock(data.company_name, 11, 'normal', { bottomSpacing: 2 });
    }
    if (data.company_address) {
      addTextBlock(data.company_address, 11, 'normal', { bottomSpacing: 2 });
    }
    y += 6;

    // 6. Greeting
    addTextBlock(data.greeting, 11, 'normal', { bottomSpacing: 8 });

    // 7. Opening paragraph
    addTextBlock(data.opening_paragraph, 11, 'normal', { bottomSpacing: 8 });

    // 8. Body paragraphs
    if (data.body_paragraphs && Array.isArray(data.body_paragraphs)) {
      data.body_paragraphs.forEach(paragraph => {
        addTextBlock(paragraph, 11, 'normal', { bottomSpacing: 8 });
      });
    }

    // 9. Closing paragraph
    addTextBlock(data.closing_paragraph, 11, 'normal', { bottomSpacing: 14 });

    // 10. Sign-off
    addTextBlock(data.sign_off, 11, 'normal', { bottomSpacing: 6 });

    // 11. Signature (applicant name)
    addTextBlock(data.applicant_name, 11, 'bold', { bottomSpacing: 0 });

    // Save
    const clFilename = `CoverLetter_${(data.applicant_name || 'Generated').replace(/\s+/g, '_')}.pdf`;
    doc.save(clFilename);
  }

  // --- Cloud Sync Onboarding ---
  const modal = document.getElementById('cloudOnboardingModal');
  const setupBtn = document.getElementById('cloudOnboardingSetupBtn');
  const dismissBtn = document.getElementById('cloudOnboardingDismissBtn');

  if (modal && setupBtn && dismissBtn && window.CloudSync) {
    window.CloudSync.shouldShowOnboarding().then((show) => {
      if (show) {
        modal.style.display = 'flex';
      }
    });

    setupBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      chrome.runtime.openOptionsPage();
    });

    dismissBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      if (window.CloudSync) {
        window.CloudSync.dismissOnboarding();
      }
    });
  }
});
