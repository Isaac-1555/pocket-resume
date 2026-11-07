// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generateBtn');
  const fillFormBtn = document.getElementById('fillFormBtn');
  const fillFormLabel = document.getElementById('fillFormLabel');
  let statusTimer = null;
  let scrambleTimer = null;
  let letterScrambleTimer = null;
  let letterStatusTimer = null;
  let motionPreference = true;
  let fillStatusTimer = null;
  let lastError = '';
  let lastErrorRaw = '';
  const settingsBtn = document.getElementById('settingsBtn');
  const quickDownloadBtn = document.getElementById('quickDownloadBtn');
  const resumeType = document.getElementById('resumeType');
  const resumeSelectorDiv = document.getElementById('resumeSelector');
  const coverLetterBtn = document.getElementById('coverLetterBtn');
  const coverLetterLabel = document.getElementById('coverLetterLabel');
  const generateLabel = document.getElementById('generateLabel');
  const errorInfoBtn = document.getElementById('errorInfoBtn');
  const errorModal = document.getElementById('errorModal');
  const errorBackdrop = document.getElementById('errorBackdrop');
  const errorMessageText = document.getElementById('errorMessageText');
  const errorCopyBtn = document.getElementById('errorCopyBtn');
  const errorCloseBtn = document.getElementById('errorCloseBtn');
  const errorOpenSettingsBtn = document.getElementById('errorOpenSettingsBtn');
  const setupCard = document.getElementById('setupCard');
  const setupCompact = document.getElementById('setupCompact');
  const setupSkipBtn = document.getElementById('setupSkipBtn');
  const setupDoneBtn = document.getElementById('setupDoneBtn');
  const setupDoneText = document.getElementById('setupDoneText');
  const setupVideoOffer = document.getElementById('setupVideoOffer');
  const setupWatchVideoBtn = document.getElementById('setupWatchVideoBtn');
  const setupVideoNoBtn = document.getElementById('setupVideoNoBtn');
  const featureVideoBtn = document.getElementById('featureVideoBtn');
  const setupResumeBtn = document.getElementById('setupResumeBtn');
  const accountBtn = document.getElementById('accountBtn');
  const signinCard = document.getElementById('signinCard');
  const reviewCard = document.getElementById('reviewCard');
  const planLockCard = document.getElementById('planLockCard');
  const accessReminder = document.getElementById('accessReminder');
  const accessReminderText = document.getElementById('accessReminderText');
  const offlineNotice = document.getElementById('offlineNotice');
  const offlineReport = document.getElementById('offlineReport');
  const offlineLetterNote = document.getElementById('offlineLetterNote');
  const offlineLetterNoteText = document.getElementById('offlineLetterNoteText');
  const offlineLetterSettingsBtn = document.getElementById('offlineLetterSettingsBtn');

  let universalCoverLetter = null;
  let lastJobMeta = null;
  let generationActive = false;
  let gate = { state: 'signin' };

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function motionOn() {
    return motionPreference && !prefersReducedMotion();
  }

  function applyMotionPreference(enabled) {
    motionPreference = enabled !== false;
    document.documentElement.classList.toggle('no-motion', !motionPreference);
  }

  chrome.storage.local.get('animationsEnabled', (data) => applyMotionPreference(data.animationsEnabled !== false));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.animationsEnabled) {
      applyMotionPreference(changes.animationsEnabled.newValue !== false);
    }
  });

  function savePdfDocument(doc, filename) {
    const anchorFallback = () => {
      try {
        doc.save(filename);
        console.log('[PDF] saved via anchor download', filename);
      } catch (error) {
        console.error('[PDF] save failed', filename, error);
      }
    };

    if (!chrome.downloads || typeof chrome.downloads.download !== 'function') {
      anchorFallback();
      return;
    }

    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError || downloadId === undefined) {
          console.warn('[PDF] downloads API failed, using anchor download:', chrome.runtime.lastError?.message);
          URL.revokeObjectURL(url);
          anchorFallback();
          return;
        }
        console.log('[PDF] saved', filename, downloadId);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      });
    } catch (error) {
      console.warn('[PDF] blob export failed, using anchor download:', error);
      anchorFallback();
    }
  }

  window.PocketResumeSavePdf = savePdfDocument;

  function setMatchReport(report, hasCoverLetter = false) {
    if (!offlineReport) return;
    if (!report) {
      offlineReport.textContent = '';
      offlineReport.classList.remove('show');
      return;
    }
    const confidence = report.parseQuality === 'low' ? ' · low confidence' : '';
    const keywords = report.jdSkillCount ? ` · ${report.jdSkillCount} keywords` : '';
    const skillsAdded = report.skillsAdded && report.skillsAdded.length ? ` · +${report.skillsAdded.length} skills` : '';
    const unverified = report.skillsAddedUnverified && report.skillsAddedUnverified.length
      ? ` · +${report.skillsAddedUnverified.length} from the posting (unverified)`
      : '';
    const noEvidence = (!report.skillsAdded || !report.skillsAdded.length) && report.skillsSkippedNoEvidence && report.skillsSkippedNoEvidence.length
      ? ` · ${report.skillsSkippedNoEvidence.length} JD skills not in your resume`
      : '';
    const noMasterSkills = report.masterSkillCount === 0 ? ' · your resume has no skills — add them in Settings' : '';
    const missing = report.missingRequired && report.missingRequired.length
      ? ` · missing: ${report.missingRequired.slice(0, 3).join(', ')}`
      : '';
    const letter = hasCoverLetter ? ' · cover letter' : '';
    const noKeywords = report.jdWarnings && report.jdWarnings.length
      ? ' · no JD keywords found — reload the posting and try again'
      : '';
    offlineReport.textContent = `JD match ${report.score}%${keywords}${skillsAdded}${unverified}${noEvidence}${noMasterSkills}${confidence}${missing}${noKeywords}${letter}`;
    offlineReport.classList.add('show');
  }

  function hasUniversalLetter() {
    return !!(universalCoverLetter && String(universalCoverLetter.body || '').trim());
  }

  function setOfflineLetterNote(visible, reason = 'Cover letter not set up —') {
    if (!offlineLetterNote) return;
    offlineLetterNote.style.display = visible ? 'block' : 'none';
    if (visible && offlineLetterNoteText) offlineLetterNoteText.textContent = reason;
  }

  function openUniversalLetterSettings() {
    chrome.storage.local.set({ openCoverLetterSection: true }, () => {
      chrome.runtime.openOptionsPage();
    });
  }

  if (offlineLetterSettingsBtn) {
    offlineLetterSettingsBtn.addEventListener('click', openUniversalLetterSettings);
  }

  let trackerCaptureEnabled = true;
  chrome.storage.local.get(['trackerCaptureEnabled'], (data) => {
    trackerCaptureEnabled = data.trackerCaptureEnabled !== false;
  });

  // --- Resume selector state ---
  let loadedResumes = [];
  let selectedResumeId = null;
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
      default:
        return 'professional';
    }
  }

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


  // Load settings + resumes
  chrome.storage.local.get(['resumes', 'userProfile', 'resumeType', 'resumeLayout', 'selectedResumeId', 'onboarding', 'onboardingCompleted', 'universalCoverLetter'], (data) => {
    universalCoverLetter = data.universalCoverLetter || null;
    // Migrate legacy profile
    if (data.userProfile && (!data.resumes || data.resumes.length === 0)) {
      loadedResumes = [{ id: 'migrated_1', label: 'Resume 1', content: data.userProfile }];
    } else if (data.resumes && data.resumes.length > 0) {
      loadedResumes = data.resumes;
    }

    const hasResumes = loadedResumes.some((resume) => (resume.jsonContent || resume.content || '').trim());
    if (hasResumes && !data.onboardingCompleted) {
      renderSetupCompleteCard();
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
      btn.className = 'glass style-btn' + (resume.id === selectedResumeId ? ' active' : '');
      btn.title = resume.label || `Resume ${index + 1}`;
      btn.innerHTML = `${resumeIconSvg(resume.icon)}<span class="rs-label">${escapeHtml(resume.label || `Resume ${index + 1}`)}</span>`;
      btn.addEventListener('click', () => {
        selectedResumeId = resume.id;
        chrome.storage.local.set({ selectedResumeId: resume.id });
        // Update active state
        resumeSelectorDiv.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      resumeSelectorDiv.appendChild(btn);
    });
  }

  const RESUME_ICONS = {
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
    data: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
  };

  function resumeIconSvg(iconId) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RESUME_ICONS[iconId] || RESUME_ICONS.doc}</svg>`;
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function sanitizeJsonControlChars(text) {
    let out = '';
    let inString = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (!inString) {
        if (ch === '"') inString = true;
        out += ch;
        continue;
      }
      if (ch === '\\') {
        out += ch + (text[i + 1] || '');
        i++;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        if (code === 0x0A) out += '\\n';
        else if (code === 0x0D) out += '\\r';
        else if (code === 0x09) out += '\\t';
        else out += '\\u' + code.toString(16).padStart(4, '0');
        continue;
      }
      out += ch;
    }
    return out;
  }

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // --- Quick Download: render the saved resume JSON as a professional PDF (no AI) ---
  if (quickDownloadBtn) {
    quickDownloadBtn.addEventListener('click', async () => {
      const checked = await refreshGate();
      if (checked.state !== 'ready') return;
      chrome.storage.local.get(['resumes', 'selectedResumeId', 'userProfile'], (data) => {
        let resumes = Array.isArray(data.resumes) ? data.resumes.slice() : [];
        if (resumes.length === 0 && data.userProfile) {
          resumes = [{ id: 'migrated_1', label: 'Resume 1', content: data.userProfile }];
        }

        if (resumes.length === 0) {
          setError('Quick Download needs a saved resume. Open Settings to add one.');
          return;
        }

        const selected = resumes.find((r) => r.id === data.selectedResumeId) || resumes[0];
        const rawJson = selected && selected.jsonContent ? String(selected.jsonContent).trim() : '';
        if (!rawJson) {
          setError('Quick Download needs a built resume. Open Settings and add one.');
          return;
        }

        let resumeData;
        try {
          let clean = rawJson;
          if (clean.startsWith('```json')) {
            clean = clean.replace(/^```json/, '').replace(/```$/, '');
          } else if (clean.startsWith('```')) {
            clean = clean.replace(/^```/, '').replace(/```$/, '');
          }
          resumeData = JSON.parse(sanitizeJsonControlChars(clean));
        } catch (e) {
          console.error('Quick Download JSON Parse Error:', e);
          setError('Could not read your saved resume. Open Settings and check the form.');
          return;
        }

        try {
          generatePDF(resumeData, 'professional');
        } catch (e) {
          console.error('Quick Download Error:', e);
          setError(e.message || 'Quick Download failed. Please try again.');
        }
      });
    });
  }

  // --- Setup / onboarding card ---
  function setSetupStepDone(stepId, done) {
    const row = document.getElementById(stepId);
    if (row) row.classList.toggle('done', done);
  }

  function renderSetupCard() {
    if (!setupCard) return;
    hideGateCards();
    setSetupStepDone('setupStepAccount', !!gate.signedIn);
    setSetupStepDone('setupStepResume', false);
    setSetupStepDone('setupStepCover', hasUniversalLetter());
    setSetupStepDone('setupStepSave', !!gate.signedIn);
    setupCard.style.display = 'block';
  }

  function renderSetupCompleteCard() {
    if (!setupCard) return;
    if (setupCompact) setupCompact.style.display = 'none';
    const stepsEl = document.getElementById('setupSteps');
    const doneEl = document.getElementById('setupDoneState');
    const skipBtn = document.getElementById('setupSkipBtn');
    const titleEl = document.getElementById('setupTitle');
    if (stepsEl) stepsEl.style.display = 'none';
    if (skipBtn) skipBtn.style.display = 'none';
    if (doneEl) doneEl.style.display = 'block';
    if (titleEl) titleEl.textContent = 'Setup complete';
    if (setupDoneText) setupDoneText.innerHTML = "You're all set. Visit a job posting and click <strong>Generate Resume</strong>. Want a quick tour of every feature first?";
    setupCard.style.display = 'block';
    chrome.storage.local.set({ onboardingCompleted: true });
  }

  function startFeatureVideo() {
    // The tour frames are being re-captured for the new UI.
  }

  function startSetupTour(step) {
    chrome.storage.local.set({ onboarding: { step, dismissed: false } }, () => {
      chrome.runtime.openOptionsPage();
    });
  }

  document.querySelectorAll('#setupCard .setup-goto[data-tour-step]').forEach((btn) => {
    btn.addEventListener('click', () => startSetupTour(parseInt(btn.dataset.tourStep, 10) || 1));
  });
  if (setupSkipBtn) {
    setupSkipBtn.addEventListener('click', () => {
      chrome.storage.local.set({ onboarding: { step: null, dismissed: true } });
      setupCard.style.display = 'none';
      if (setupCompact) setupCompact.style.display = 'block';
    });
  }
  if (setupDoneBtn) {
    setupDoneBtn.addEventListener('click', () => {
      if (setupCard) setupCard.style.display = 'none';
    });
  }
  if (setupWatchVideoBtn) {
    setupWatchVideoBtn.addEventListener('click', () => startFeatureVideo(false));
  }
  if (setupVideoNoBtn) {
    setupVideoNoBtn.addEventListener('click', () => {
      chrome.storage.local.set({ featureVideoDeclined: true });
      if (setupVideoOffer) setupVideoOffer.style.display = 'none';
      if (setupDoneText) {
        setupDoneText.innerHTML = "You're all set. You can watch the <strong>feature tour</strong> anytime — the ▶ Feature tour button in the header above.";
      }
    });
  }
  if (featureVideoBtn) {
    featureVideoBtn.addEventListener('click', () => startFeatureVideo(true));
  }
  if (setupResumeBtn) {
    setupResumeBtn.addEventListener('click', () => startSetupTour(1));
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  }

  function localAccessState() {
    const cloudSync = window.CloudSync;
    if (!cloudSync || typeof cloudSync.getAccessState !== 'function') return Promise.resolve(null);
    if (typeof cloudSync.isConfigured === 'function' && !cloudSync.isConfigured()) return Promise.resolve(null);
    return withTimeout(cloudSync.getAccessState().catch(() => null), 2500);
  }

  function requestBackgroundAccess(retried) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CHECK_PRO_ACCESS' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Popup] CHECK_PRO_ACCESS failed:', chrome.runtime.lastError.message);
          if (!retried) {
            setTimeout(() => resolve(requestBackgroundAccess(true)), 300);
            return;
          }
          resolve({ allowed: false, promoActive: false, signedIn: false, error: true });
          return;
        }
        resolve(response || { allowed: false, promoActive: false, signedIn: false, error: true });
      });
    });
  }

  // The popup holds a real Clerk session, so its own copy of the plan is
  // authoritative. The service worker only has the page-published snapshot, used
  // when the page client cannot resolve.
  async function checkProAccess() {
    const local = await localAccessState();
    if (local && local.healthy) {
      return {
        allowed: !!local.proAccess,
        promoActive: !!local.promoActive,
        signedIn: !!local.signedIn,
        isPro: !!local.isPro,
        withinWindow: !!local.withinWindow,
        trialEndsAt: local.trialEndsAt || 0,
        trialDaysLeft: local.trialDaysLeft || 0,
        planPeriod: local.planPeriod || '',
        source: 'page',
      };
    }
    const background = await requestBackgroundAccess(false);
    return { ...background, source: background.source || 'sw' };
  }

  async function updateAccountButton() {
    if (!accountBtn) return;
    const access = await checkProAccess();
    console.log('[Popup] access', {
      source: access.source,
      signedIn: !!access.signedIn,
      isPro: !!access.isPro,
      allowed: !!access.allowed,
      error: !!access.error,
    });
    const ACCOUNT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';
    const setAccountLabel = (label) => { accountBtn.innerHTML = ACCOUNT_ICON + '<span>' + label + '</span>'; };
    if (access.allowed) {
      accountBtn.style.display = 'inline-flex';
      accountBtn.classList.add('pro');
      if (access.isPro && access.trialDaysLeft > 0) {
        setAccountLabel(`Trial · ${access.trialDaysLeft}d`);
      } else if (access.isPro) {
        setAccountLabel(access.planPeriod === 'year' ? 'Pro · Yearly' : 'Pro');
      } else {
        setAccountLabel('Free until Dec 31');
      }
      accountBtn.dataset.target = access.isPro ? 'options' : 'pricing';
      return;
    }
    accountBtn.style.display = 'inline-flex';
    accountBtn.classList.remove('pro');
    if (access.signedIn) {
      setAccountLabel('Start free trial');
      accountBtn.dataset.target = 'pricing';
    } else {
      setAccountLabel('Sign in');
      accountBtn.dataset.target = 'auth';
    }
  }

  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      if (accountBtn.dataset.target === 'auth') {
        openAccountAuth('signIn');
        return;
      }
      const target = accountBtn.dataset.target === 'pricing' ? 'options.html#cloud-pricing' : 'options.html';
      chrome.tabs.create({ url: chrome.runtime.getURL(target) });
    });
    updateAccountButton();
  }

  function renderResumePdf(resumeData, selectedStyle, styleConfig) {
    if (styleConfig.layout === 'pocketresume') {
      generatePDF(resumeData, selectedStyle);
      return;
    }
    if (window.ResumeRenderers && typeof window.ResumeRenderers.generateResumePDF === 'function') {
      window.ResumeRenderers.generateResumePDF(resumeData, selectedStyle, styleConfig.layout);
      return;
    }
    throw new Error('Resume renderer module failed to load.');
  }

  function setGenerateEnabled(enabled) {
    if (generateBtn) generateBtn.disabled = !enabled;
    if (coverLetterBtn) coverLetterBtn.disabled = !enabled;
  }

  function hideGateCards() {
    [signinCard, reviewCard, planLockCard, setupCard, setupCompact].forEach((card) => {
      if (card) card.style.display = 'none';
    });
  }

  function activeResumeFromStore(data) {
    const list = Array.isArray(data.resumes) ? data.resumes : [];
    return { list, resume: list.find((item) => item.id === data.selectedResumeId) || list[0] || null };
  }

  async function refreshGate() {
    const access = await checkProAccess();
    const data = await chrome.storage.local.get(['resumes', 'userProfile', 'selectedResumeId', 'onboarding']);
    let list = Array.isArray(data.resumes) ? data.resumes : [];
    if (!list.length && data.userProfile) {
      list = [{ id: 'migrated_1', label: 'Resume 1', content: data.userProfile }];
    }
    const resume = list.find((item) => item.id === data.selectedResumeId) || list[0] || null;
    const hasResume = !!(resume && (resume.jsonContent || '').trim());
    const signedIn = !!access.signedIn;
    const reviewNeeded = !!(resume && resume.parseReview && !resume.parseConfirmedAt);

    let state = 'ready';
    if (!signedIn) state = 'signin';
    else if (!hasResume) state = 'setup';
    else if (reviewNeeded) state = 'review';
    else if (!access.allowed) state = 'plan';

    gate = { state, resume, list, signedIn, allowed: !!access.allowed, access };
    applyGateUi();
    return gate;
  }

  function applyGateUi() {
    hideGateCards();
    if (gate.state === 'signin') {
      if (signinCard) signinCard.style.display = 'block';
      setGenerateEnabled(false);
      return;
    }
    if (gate.state === 'plan') {
      if (planLockCard) planLockCard.style.display = 'block';
      setGenerateEnabled(false);
      return;
    }
    if (gate.state === 'review') {
      if (reviewCard) reviewCard.style.display = 'block';
      setGenerateEnabled(false);
      return;
    }
    if (gate.state === 'setup') {
      renderSetupCard();
      setGenerateEnabled(false);
      return;
    }
    const busy = generationActive
      || document.body.dataset.status === 'generating'
      || document.body.dataset.letterStatus === 'generating';
    setGenerateEnabled(!busy);
  }

  // Signing in happens in the Settings tab (the popup bundle has no Clerk UI).
  function openAccountAuth(mode) {
    const next = mode === 'signUp' ? 'signUp' : 'signIn';
    chrome.storage.local.set({ openAuth: next }, () => {
      chrome.runtime.openOptionsPage();
    });
  }

  function openSettings(hash = '') {
    if (hash) {
      chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) });
      return;
    }
    chrome.runtime.openOptionsPage();
  }

  function openPricing() {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#cloud-pricing') });
  }

  function maybeShowAccessReminder(access) {
    if (!accessReminder) return;
    if (!access || !access.withinWindow) {
      accessReminder.style.display = 'none';
      return;
    }
    const now = new Date();
    const reminderStart = new Date(now.getFullYear(), 11, 24);
    if (now < reminderStart) {
      accessReminder.style.display = 'none';
      return;
    }
    const today = now.toISOString().slice(0, 10);
    const daysLeft = Math.max(0, Math.ceil((new Date(now.getFullYear(), 11, 31, 23, 59, 59) - now) / 86400000));
    chrome.storage.local.get('accessReminderLastShown', (data) => {
      if (data.accessReminderLastShown === today) return;
      if (accessReminderText) accessReminderText.textContent = `Free until Dec 31 — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.`;
      accessReminder.style.display = 'flex';
    });
  }

  if (accessReminder) {
    const dismiss = document.getElementById('reminderDismissBtn');
    const plans = document.getElementById('reminderPlansBtn');
    if (dismiss) {
      dismiss.addEventListener('click', () => {
        chrome.storage.local.set({ accessReminderLastShown: new Date().toISOString().slice(0, 10) });
        accessReminder.style.display = 'none';
      });
    }
    if (plans) plans.addEventListener('click', openPricing);
  }

  const popupSignInBtn = document.getElementById('popupSignInBtn');
  const popupSignUpBtn = document.getElementById('popupSignUpBtn');
  const reviewOpenSettingsBtn = document.getElementById('reviewOpenSettingsBtn');
  const planUnlockBtn = document.getElementById('planUnlockBtn');
  const planExportBtn = document.getElementById('planExportBtn');
  const setupAccountBtn = document.getElementById('setupAccountBtn');

  if (popupSignInBtn) {
    popupSignInBtn.addEventListener('click', () => openAccountAuth('signIn'));
  }
  if (popupSignUpBtn) {
    popupSignUpBtn.addEventListener('click', () => openAccountAuth('signUp'));
  }
  if (setupAccountBtn) setupAccountBtn.addEventListener('click', () => { if (popupSignUpBtn) popupSignUpBtn.click(); });
  if (reviewOpenSettingsBtn) reviewOpenSettingsBtn.addEventListener('click', () => openSettings());
  if (planUnlockBtn) planUnlockBtn.addEventListener('click', openPricing);
  if (planExportBtn) {
    planExportBtn.addEventListener('click', () => {
      chrome.storage.local.get(['resumes', 'selectedResumeId'], (data) => {
        const { resume } = activeResumeFromStore(data);
        if (!resume || !resume.jsonContent) {
          setError('No saved resume to export yet.');
          return;
        }
        const filename = `pocketresume-${(resume.label || 'resume').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
        const blob = new Blob([resume.jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename, saveAs: false }, () => {
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        });
      });
    });
  }

  async function runGeneration(output = 'resume') {
    if (generationActive) return;
    const checked = await refreshGate();
    if (checked.state !== 'ready') return;

    const letterRun = output === 'cover-letter';
    const errorTarget = letterRun ? 'letter' : 'resume';

    const selectedStyle = normalizeResumeStyle(resumeType.value || 'professional');
    const styleConfig = getResumeStyleConfig(selectedStyle);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      setError('No active tab found. Open the job posting and try again.', errorTarget);
      return;
    }

    generationActive = true;
    setGenerateEnabled(false);
    lastError = '';
    lastErrorRaw = '';
    if (errorInfoBtn) errorInfoBtn.style.display = 'none';
    closeErrorModal();
    setFillStatus(null);
    if (letterRun) {
      setLetterStatus('generating');
    } else {
      setStatus('generating');
      if (generateLabel) generateLabel.textContent = 'Matching job description\u2026';
    }

    chrome.runtime.sendMessage({
      type: 'GENERATE',
      payload: {
        tabId: tab.id,
        resumeStyle: selectedStyle,
        resumeId: selectedResumeId,
        output
      }
    }, async (response) => {
      generationActive = false;

      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message || 'Could not reach the background service. Please try again.', errorTarget);
        setGenerateEnabled(true);
        return;
      }

      if (response && (response.status === 'signin_required' || response.status === 'plan_required' || response.status === 'review_required')) {
        if (letterRun) setLetterStatus('idle'); else setStatus('idle');
        await refreshGate();
        return;
      }
      if (response && (response.status === 'needs_resume' || response.status === 'needs_json')) {
        if (letterRun) setLetterStatus('idle'); else setStatus('idle');
        await refreshGate();
        setError(response.message || 'Build your resume in Settings first.', errorTarget);
        return;
      }
      if (!response || response.status !== 'success') {
        setError(response?.message || 'Generation failed. Please try again.', errorTarget);
        setGenerateEnabled(true);
        return;
      }

      try {
        const resumeData = JSON.parse(sanitizeJsonControlChars(String(response.data || '')));
        lastJobMeta = response.jobMeta || null;

        if (trackerCaptureEnabled && tab) {
          saveApplicationToTracker(resumeData, tab, selectedResumeId, selectedStyle);
        }

        if (!letterRun) {
          if (response.coverLetterData) {
            const coverParsed = JSON.parse(sanitizeJsonControlChars(String(response.coverLetterData)));
            generateCoverLetterPDF(coverParsed);
            setOfflineLetterNote(false);
          }
          playResumeLoop(() => {
            try {
              renderResumePdf(resumeData, selectedStyle, styleConfig);
              setMatchReport(response.report || null, !!response.coverLetterData);
              setStatus('success');
              if (generateLabel) generateLabel.textContent = 'Generate Resume';
              setGenerateEnabled(true);
            } catch (error) {
              console.error('Generation parse error:', error);
              setError(error.message || 'Could not read the generated resume. Please try again.');
              if (generateLabel) generateLabel.textContent = 'Generate Resume';
              setGenerateEnabled(true);
            }
          });
          return;
        }

        setMatchReport(response.report || null, !!response.coverLetterData);

        playCoverLetterLoop(async () => {
          try {
            if (response.coverLetterData) {
              const coverParsed = JSON.parse(sanitizeJsonControlChars(String(response.coverLetterData)));
              generateCoverLetterPDF(coverParsed);
              setOfflineLetterNote(false);
            } else {
              const data = await chrome.storage.local.get('universalCoverLetter');
              universalCoverLetter = data.universalCoverLetter || null;
              setOfflineLetterNote(true, response.coverLetterStatus === 'empty'
                ? 'Cover letter is empty —'
                : 'No cover letter saved —');
            }
            setLetterStatus('success');
            setGenerateEnabled(true);
          } catch (error) {
            console.error('Cover letter error:', error);
            setError(error.message || 'Could not build the cover letter. Please try again.', 'letter');
            setGenerateEnabled(true);
          }
        });
      } catch (error) {
        console.error('Generation parse error:', error);
        setError(error.message || 'Could not read the generated resume. Please try again.', errorTarget);
        if (generateLabel) generateLabel.textContent = 'Generate Resume';
        setGenerateEnabled(true);
      }
    });
  }

  if (coverLetterBtn) {
    coverLetterBtn.addEventListener('click', () => runGeneration('cover-letter'));
  }

  const trackerBtn = document.getElementById('trackerBtn');
  if (trackerBtn) {
    trackerBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('tracker.html') });
    });
  }

  if (fillFormBtn) {
    fillFormBtn.addEventListener('click', (event) => {
      event.preventDefault();
      setError('Form Filler is being rebuilt. It will return in a later update.');
    });
  }

  // --- NEW badge on Job Tracker (permanently dismissed after first hover) ---
  const trackerNewBadge = document.getElementById('trackerNewBadge');
  chrome.storage.local.get('trackerNewBadgeDismissed', (data) => {
    if (data.trackerNewBadgeDismissed) {
      if (trackerNewBadge) trackerNewBadge.remove();
    } else if (trackerNewBadge) {
      const dismiss = () => {
        trackerNewBadge.classList.add('gone');
        trackerNewBadge.addEventListener('transitionend', () => trackerNewBadge.remove(), { once: true });
        chrome.storage.local.set({ trackerNewBadgeDismissed: true });
      };
      trackerBtn.addEventListener('mouseenter', dismiss, { once: true });
      trackerBtn.addEventListener('focus', dismiss, { once: true });
    }
  });

  // --- NEW badge on Fill Form (permanently dismissed after first hover) ---
  const fillFormNewBadge = document.getElementById('fillFormNewBadge');
  chrome.storage.local.get('fillFormNewBadgeDismissed', (data) => {
    if (data.fillFormNewBadgeDismissed) {
      if (fillFormNewBadge) fillFormNewBadge.remove();
    } else if (fillFormNewBadge) {
      const dismiss = () => {
        fillFormNewBadge.classList.add('gone');
        fillFormNewBadge.addEventListener('transitionend', () => fillFormNewBadge.remove(), { once: true });
        chrome.storage.local.set({ fillFormNewBadgeDismissed: true });
      };
      fillFormBtn.addEventListener('mouseenter', dismiss, { once: true });
      fillFormBtn.addEventListener('focus', dismiss, { once: true });
    }
  });

  // --- NEW badge on Quick Download (permanently dismissed after first hover) ---
  const quickDownloadNewBadge = document.getElementById('quickDownloadNewBadge');
  chrome.storage.local.get('quickDownloadNewBadgeDismissed', (data) => {
    if (data.quickDownloadNewBadgeDismissed) {
      if (quickDownloadNewBadge) quickDownloadNewBadge.remove();
    } else if (quickDownloadNewBadge) {
      quickDownloadBtn.classList.add('has-badge');
      const dismiss = () => {
        quickDownloadNewBadge.classList.add('gone');
        quickDownloadNewBadge.addEventListener('transitionend', () => quickDownloadNewBadge.remove(), { once: true });
        quickDownloadBtn.classList.remove('has-badge');
        chrome.storage.local.set({ quickDownloadNewBadgeDismissed: true });
      };
      quickDownloadBtn.addEventListener('mouseenter', dismiss, { once: true });
      quickDownloadBtn.addEventListener('focus', dismiss, { once: true });
    }
  });

  // --- What's New modal (once per version) ---
  const whatsNewModal = document.getElementById('whatsNewModal');
  const whatsNewGotBtn = document.getElementById('whatsNewGotBtn');
  const whatsNewPlansBtn = document.getElementById('whatsNewPlansBtn');
  const whatsNewVersionEl = document.getElementById('whatsNewVersion');
  const ANNOUNCEMENT_VERSION = '10.4.0';
  const ANNOUNCEMENT_SEEN_VALUE = '10.4.0';

  function startProfileSetup() {
    chrome.storage.local.set({ appProfileOnboarding: { active: true } }, () => {
      chrome.runtime.openOptionsPage();
    });
  }

  function dismissWhatsNew() {
    chrome.storage.local.set({ lastSeenAnnouncement: ANNOUNCEMENT_SEEN_VALUE });
    if (whatsNewModal) whatsNewModal.style.display = 'none';
  }

  chrome.storage.local.get(['lastSeenAnnouncement'], (data) => {
    if (!whatsNewModal) return;
    if (data.lastSeenAnnouncement === ANNOUNCEMENT_SEEN_VALUE) return;
    if (whatsNewVersionEl) whatsNewVersionEl.textContent = ANNOUNCEMENT_VERSION;
    whatsNewModal.style.display = 'flex';
  });
  if (whatsNewGotBtn) whatsNewGotBtn.addEventListener('click', dismissWhatsNew);
  if (whatsNewPlansBtn) {
    whatsNewPlansBtn.addEventListener('click', () => {
      dismissWhatsNew();
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    });
  }

  function parseJobFromTitle(title) {
    const t = (title || '').trim();
    if (!t) return { company: '', role: '' };
    const match = t.match(/^(.*?)\s+(?:at|@)\s+(.+?)(?:\s*[|·–—-]\s*.*)?$/);
    if (match && match[1] && match[2]) {
      return { company: match[2].trim(), role: match[1].trim() };
    }
    return { company: '', role: t };
  }

  function saveApplicationToTracker(resumeData, tab, resumeIdUsed, resumeStyle) {
    if (!tab) return;

    const aiCompany = typeof resumeData?.company === 'string' ? resumeData.company.trim() : '';
    const aiRole = typeof resumeData?.position === 'string' && resumeData.position.trim()
      ? resumeData.position.trim()
      : (typeof resumeData?.subtitle === 'string' ? resumeData.subtitle.trim() : '');
    const aiRecruiterName = typeof resumeData?.recruiterName === 'string' ? resumeData.recruiterName.trim() : '';
    const aiRecruiterEmail = typeof resumeData?.recruiterEmail === 'string' ? resumeData.recruiterEmail.trim() : '';

    const titleParsed = parseJobFromTitle(tab.title);
    const company = aiCompany || titleParsed.company;
    const role = aiRole || titleParsed.role;
    let sourceTag = 'ai';
    if (!aiCompany && !aiRole) {
      sourceTag = titleParsed.company || titleParsed.role ? 'title-heuristic' : 'fallback';
    }
    console.info('[Tracker] Captured application', { company, role, recruiterName: aiRecruiterName, sourceTag });
    if (!company && !role) {
      console.warn('[Tracker] Capture fallback: no company/role available', {
        title: tab.title,
        url: tab.url,
        resumeData: resumeData
      });
    }

    const application = {
      id: 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      company: company || '',
      role: role || '',
      url: tab.url || '',
      recruiterName: aiRecruiterName || '',
      recruiterEmail: aiRecruiterEmail || '',
      status: 'saved',
      dateSaved: Date.now(),
      appliedDate: null,
      interviewDate: null,
      notes: '',
      resumeIdUsed: resumeIdUsed || null,
      resumeStyle: resumeStyle || null,
      source: sourceTag,
      updatedAt: Date.now()
    };
    chrome.storage.local.get('applications', (data) => {
      const apps = Array.isArray(data.applications) ? data.applications : [];
      const existingIdx = apps.findIndex((a) => a.url && a.url === application.url && a.status === 'saved');
      if (existingIdx >= 0) {
        apps[existingIdx] = { ...apps[existingIdx], ...application, id: apps[existingIdx].id, dateSaved: apps[existingIdx].dateSaved, updatedAt: Date.now() };
      } else {
        apps.push(application);
      }
      chrome.storage.local.set({ applications: apps });
    });
  }

  generateBtn.addEventListener('click', () => runGeneration('resume'));

  const BUSY_LABELS = ['Reading job page…', 'Matching keywords…', 'Tailoring bullets…', 'Polishing layout…', 'Almost there…'];
  const BUSY_LETTER_LABELS = ['Reading job page…', 'Filling company and role…', 'Matching your template…', 'Typesetting the letter…'];
  const SCRAMBLE_CHARS = 'ABCDEFGHKMNPRSTUVWXYZ23456789#/<>*+';

  function stopScramble() {
    if (scrambleTimer) {
      clearInterval(scrambleTimer);
      scrambleTimer = null;
    }
  }

  function startScramble() {
    if (!generateLabel) return;
    stopScramble();
    if (!motionOn()) {
      generateLabel.textContent = 'Generating…';
      return;
    }
    let labelIdx = 0;
    let frame = 0;
    const settleFrames = 13;
    const holdFrames = 30;
    scrambleTimer = setInterval(() => {
      frame++;
      const target = BUSY_LABELS[labelIdx % BUSY_LABELS.length];
      if (frame > settleFrames + holdFrames) {
        labelIdx++;
        frame = 0;
        return;
      }
      const settled = Math.floor((frame / settleFrames) * target.length);
      let out = '';
      for (let i = 0; i < target.length; i++) {
        if (i < settled || target[i] === ' ' || target[i] === '\u2026') {
          out += target[i];
        } else {
          out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      generateLabel.textContent = out;
    }, 34);
  }

  function renderScrambleFrame(target, settledCount) {
    let out = '';
    for (let i = 0; i < target.length; i++) {
      if (i < settledCount || target[i] === ' ' || target[i] === '\u2026') {
        out += target[i];
      } else {
        out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
    }
    generateLabel.textContent = out;
  }

  function playResumeLoop(done) {
    if (!generateLabel) {
      done();
      return;
    }
    stopScramble();
    if (!motionOn()) {
      generateLabel.textContent = 'Generating…';
      done();
      return;
    }
    let labelIdx = 0;
    let frame = 0;
    const settleFrames = 9;
    const holdFrames = 15;
    scrambleTimer = setInterval(() => {
      frame++;
      const target = BUSY_LABELS[labelIdx % BUSY_LABELS.length];
      if (frame > settleFrames + holdFrames) {
        labelIdx++;
        frame = 0;
        if (labelIdx >= BUSY_LABELS.length) {
          stopScramble();
          generateLabel.textContent = BUSY_LABELS[BUSY_LABELS.length - 1];
          done();
          return;
        }
        return;
      }
      renderScrambleFrame(target, Math.floor((frame / settleFrames) * target.length));
    }, 32);
  }

  function stopLetterScramble() {
    if (letterScrambleTimer) {
      clearInterval(letterScrambleTimer);
      letterScrambleTimer = null;
    }
  }

  function renderLetterFrame(target, settledCount) {
    if (!coverLetterLabel) return;
    let out = '';
    for (let i = 0; i < target.length; i++) {
      if (i < settledCount || target[i] === ' ' || target[i] === '\u2026') {
        out += target[i];
      } else {
        out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
    }
    coverLetterLabel.textContent = out;
  }

  function startLetterScramble() {
    if (!coverLetterLabel) return;
    stopLetterScramble();
    if (!motionOn()) {
      coverLetterLabel.textContent = 'Building cover letter…';
      return;
    }
    let labelIdx = 0;
    let frame = 0;
    const settleFrames = 13;
    const holdFrames = 30;
    letterScrambleTimer = setInterval(() => {
      frame++;
      const target = BUSY_LETTER_LABELS[labelIdx % BUSY_LETTER_LABELS.length];
      if (frame > settleFrames + holdFrames) {
        labelIdx++;
        frame = 0;
        return;
      }
      renderLetterFrame(target, Math.floor((frame / settleFrames) * target.length));
    }, 34);
  }

  function playCoverLetterLoop(done) {
    if (!coverLetterLabel) {
      done();
      return;
    }
    stopLetterScramble();
    if (!motionOn()) {
      coverLetterLabel.textContent = 'Building cover letter…';
      done();
      return;
    }
    let labelIdx = 0;
    let frame = 0;
    const settleFrames = 9;
    const holdFrames = 15;
    letterScrambleTimer = setInterval(() => {
      frame++;
      const target = BUSY_LETTER_LABELS[labelIdx % BUSY_LETTER_LABELS.length];
      if (frame > settleFrames + holdFrames) {
        labelIdx++;
        frame = 0;
        if (labelIdx >= BUSY_LETTER_LABELS.length) {
          stopLetterScramble();
          coverLetterLabel.textContent = BUSY_LETTER_LABELS[BUSY_LETTER_LABELS.length - 1];
          done();
          return;
        }
        return;
      }
      renderLetterFrame(target, Math.floor((frame / settleFrames) * target.length));
    }, 32);
  }

  function setLetterStatus(state) {
    if (letterStatusTimer) {
      clearTimeout(letterStatusTimer);
      letterStatusTimer = null;
    }
    const uiState = state === 'error' ? 'failure' : state;
    if (!uiState || uiState === 'idle') {
      delete document.body.dataset.letterStatus;
      stopLetterScramble();
      if (coverLetterLabel) coverLetterLabel.textContent = 'Generate Cover Letter';
      return;
    }
    document.body.dataset.letterStatus = uiState;
    if (uiState === 'generating') {
      startLetterScramble();
      return;
    }
    stopLetterScramble();
    if (coverLetterLabel) {
      coverLetterLabel.textContent =
        uiState === 'success' ? 'Cover letter ready'
          : 'Failed \u2014 try again';
    }
    if (uiState === 'failure') return;
    letterStatusTimer = setTimeout(() => {
      setLetterStatus('idle');
      letterStatusTimer = null;
    }, 4000);
  }

  function setFillStatus(state, persist = false) {
    if (fillStatusTimer) {
      clearTimeout(fillStatusTimer);
      fillStatusTimer = null;
    }
    if (state) {
      document.body.dataset.fillStatus = state;
    } else {
      delete document.body.dataset.fillStatus;
    }
    if (persist || state === 'filling' || state === 'fill-failure' || !state) return;
    fillStatusTimer = setTimeout(() => {
      delete document.body.dataset.fillStatus;
      fillStatusTimer = null;
    }, 4000);
  }

  function setStatus(state, persist = false) {
    const uiState = state === 'error' ? 'failure' : state;
    document.body.dataset.status = uiState;

    if (uiState === 'generating') {
      startScramble();
    } else {
      stopScramble();
      if (generateLabel) {
        generateLabel.textContent =
          uiState === 'success' ? 'Done \u2014 PDF ready'
            : uiState === 'failure' ? 'Failed \u2014 try again'
              : 'Generate Resume';
      }
    }

    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    if (persist || uiState === 'generating' || uiState === 'failure') return;
    statusTimer = setTimeout(() => {
      setStatus('idle');
      statusTimer = null;
    }, 4000);
  }

  function mapErrorMessage(raw) {
    const msg = (raw || '').trim();
    if (!msg) return 'Something went wrong. Please try again.';
    const lower = msg.toLowerCase();

    if (/sign in|signed out|session/i.test(lower)) {
      return 'Sign in to keep generating. Open the account card to continue.';
    }
    if (/pro plan|free period|subscription|upgrade|trial/i.test(lower)) {
      return 'Your free period ended. Start a Pro plan to keep generating.';
    }
    if (/confirm your|parsed resume/i.test(lower)) {
      return 'Confirm your parsed resume in Settings first.';
    }
    if (/build your resume|add your resume|no resume/i.test(lower)) {
      return 'No resume saved yet. Open Settings and build one.';
    }
    if (/failed to fetch|network|connection|timeout|unable to connect/i.test(lower)) {
      return 'Network error. Check your connection and try again.';
    }
    if (/no active tab/i.test(lower)) {
      return 'No active tab found. Open the job posting and try again.';
    }
    if (/quick download|export|settings|cover letter/i.test(lower)) {
      return msg;
    }
    if (/parse|invalid json|unexpected token|json/i.test(lower)) {
      return 'Could not read the saved resume. Open Settings and check the form.';
    }
    if (msg.length > 200) {
      return msg.slice(0, 200) + '\u2026';
    }
    return msg;
  }

  function setError(message, target = 'resume') {
    lastErrorRaw = message || '';
    lastError = mapErrorMessage(message);
    if (errorInfoBtn) errorInfoBtn.style.display = 'flex';
    if (target === 'letter') setLetterStatus('failure');
    else setStatus('error');
  }

  function openErrorModal() {
    if (!errorModal || !lastError) return;
    if (errorMessageText) errorMessageText.textContent = lastError;
    const needsSettings = /settings/i.test(lastError);
    if (errorOpenSettingsBtn) errorOpenSettingsBtn.style.display = needsSettings ? 'inline-block' : 'none';
    errorModal.style.display = 'flex';
  }

  function closeErrorModal() {
    if (errorModal) errorModal.style.display = 'none';
  }

  if (errorInfoBtn && errorModal) {
    errorInfoBtn.addEventListener('click', () => {
      if (lastError) openErrorModal();
    });
    if (errorBackdrop) errorBackdrop.addEventListener('click', closeErrorModal);
    if (errorCloseBtn) errorCloseBtn.addEventListener('click', closeErrorModal);
    if (errorOpenSettingsBtn) {
      errorOpenSettingsBtn.addEventListener('click', () => {
        closeErrorModal();
        chrome.runtime.openOptionsPage();
      });
    }
    if (errorCopyBtn) {
      errorCopyBtn.addEventListener('click', async () => {
        const text = lastErrorRaw || lastError;
        try {
          await navigator.clipboard.writeText(text);
          const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          const CHECK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
          const original = errorCopyBtn.innerHTML;
          errorCopyBtn.innerHTML = CHECK_ICON + '<span>Copied!</span>';
          setTimeout(() => { errorCopyBtn.innerHTML = original; }, 1500);
        } catch (e) {
          console.error('Copy failed:', e);
        }
      });
    }
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeErrorModal();
    });
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
        savePdfDocument(doc, `Resume_${(data.name || 'Generated').replace(/\s+/g, '_')}.pdf`);
        return;
      }
    }

    // Fallback: save tightest attempt even if >1 page
    const fallbackDoc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    renderResume(fallbackDoc, configs[configs.length - 1]);
    savePdfDocument(fallbackDoc, `Resume_${(data.name || 'Generated').replace(/\s+/g, '_')}.pdf`);
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
    savePdfDocument(doc, clFilename);
  }

  // --- Growth Prompts (Rating & Share) ---
  const STORE_URL = 'https://chromewebstore.google.com/detail/pocketresume/mdplmgfkpgalajmchilemiamifoaneip';
  const WEBSITE_URL = 'https://pocket-resume.xyz';
  const PROMPT_REPEAT_MS = 7 * 24 * 60 * 60 * 1000;

  const ratingModal = document.getElementById('ratingPromptModal');
  const ratingActionBtn = document.getElementById('ratingActionBtn');
  const ratingCloseBtn = document.getElementById('ratingCloseBtn');
  const shareModal = document.getElementById('sharePromptModal');
  const shareActionBtn = document.getElementById('shareActionBtn');
  const shareCloseBtn = document.getElementById('shareCloseBtn');
  let pendingShare = false;

  function getPromptState(key, callback) {
    chrome.storage.local.get([key], (data) => callback(data[key] || {}));
  }

  function setPromptState(key, patch) {
    chrome.storage.local.get([key], (data) => {
      const state = data[key] || {};
      chrome.storage.local.set({ [key]: Object.assign(state, patch) });
    });
  }

  function shouldShowPrompt(state) {
    if (state.converted) return false;
    if (state.actionTs && !state.dismissedTs) return true;
    if (!state.dismissedTs) return true;
    return Date.now() - state.dismissedTs >= PROMPT_REPEAT_MS;
  }

  function showPrompt(modal) {
    if (modal) modal.style.display = 'flex';
  }

  function hidePrompt(modal) {
    if (modal) modal.style.display = 'none';
  }

  function closePrompt(key, modal) {
    getPromptState(key, (state) => {
      if (state.actionTs) {
        setPromptState(key, { converted: true });
      } else {
        setPromptState(key, { dismissedTs: Date.now() });
      }
      hidePrompt(modal);
    });
  }

  function isOverlayVisible() {
    const whatsNew = document.getElementById('whatsNewModal');
    return (whatsNew && whatsNew.style.display === 'flex') ||
      (errorModal && errorModal.style.display === 'flex');
  }

  function maybeShowPrompts() {
    getPromptState('growthRatingPrompt', (ratingState) => {
      getPromptState('growthSharePrompt', (shareState) => {
        const ratingDue = shouldShowPrompt(ratingState);
        const shareDue = shouldShowPrompt(shareState);
        pendingShare = shareDue;
        if (isOverlayVisible()) return;
        if (ratingDue) {
          showPrompt(ratingModal);
        } else if (shareDue) {
          showPrompt(shareModal);
          pendingShare = false;
        }
      });
    });
  }

  if (ratingActionBtn) {
    ratingActionBtn.addEventListener('click', () => {
      setPromptState('growthRatingPrompt', { actionTs: Date.now() });
      chrome.tabs.create({ url: STORE_URL });
    });
  }

  if (ratingCloseBtn) {
    ratingCloseBtn.addEventListener('click', () => {
      closePrompt('growthRatingPrompt', ratingModal);
      if (pendingShare && !isOverlayVisible()) {
        showPrompt(shareModal);
        pendingShare = false;
      }
    });
  }

  async function sharePocketResume() {
    const shareData = {
      title: 'PocketResume',
      text: 'PocketResume — one-click tailored resume from any job description. Free!',
      url: WEBSITE_URL
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareData.text + ' ' + WEBSITE_URL);
      const original = shareActionBtn.innerHTML;
      const CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      shareActionBtn.innerHTML = CHECK_SVG + '<span>Link Copied!</span>';
      setTimeout(() => { shareActionBtn.innerHTML = original; }, 2000);
    } catch (clipError) {
      chrome.tabs.create({ url: WEBSITE_URL });
    }
  }

  if (shareActionBtn) {
    shareActionBtn.addEventListener('click', () => {
      setPromptState('growthSharePrompt', { actionTs: Date.now() });
      sharePocketResume();
    });
  }

  if (shareCloseBtn) {
    shareCloseBtn.addEventListener('click', () => {
      closePrompt('growthSharePrompt', shareModal);
    });
  }

  const openWebsite = () => {
    chrome.tabs.create({ url: WEBSITE_URL });
  };

  const websiteLink = document.getElementById('websiteLink');
  if (websiteLink) {
    websiteLink.addEventListener('click', openWebsite);
    websiteLink.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openWebsite();
      }
    });
  }

  const logoLink = document.getElementById('logoLink');
  if (logoLink) {
    logoLink.addEventListener('click', openWebsite);
  }

  let gateRefreshAt = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.universalCoverLetter) {
      universalCoverLetter = changes.universalCoverLetter.newValue || null;
    }
    if (changes.resumes || changes.selectedResumeId || changes.proAccessCache) {
      if (changes.proAccessCache) {
        if (Date.now() - gateRefreshAt < 1500) return;
        gateRefreshAt = Date.now();
      }
      refreshGate().catch(() => {});
      updateAccountButton();
    }
  });

  refreshGate().then((state) => {
    maybeShowAccessReminder(state.access);
    updateAccountButton();
  });

  setTimeout(maybeShowPrompts, 400);
});
