import { parseResumeText, normalizeResumeProfile, splitContactParts, buildContactString, resumeProfileWarnings } from './resume-parse.js';

document.addEventListener('DOMContentLoaded', async () => {
  const saveButton = document.getElementById('save');
  const statusOverlay = document.getElementById('statusOverlay');
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const tabBar = document.getElementById('tabBar');
  const tabContentArea = document.getElementById('tabContentArea');
  const accountCard = document.getElementById('accountCard');
  const accountSignedOut = document.getElementById('accountSignedOut');
  const accountSignedIn = document.getElementById('accountSignedIn');
  const accountOfferBadge = document.getElementById('accountOfferBadge');
  const accountOfferTitle = document.getElementById('accountOfferTitle');
  const accountOfferSub = document.getElementById('accountOfferSub');
  const accountFeatureList = document.getElementById('accountFeatureList');
  const cloudCreateAccountBtn = document.getElementById('cloudCreateAccountBtn');
  const cloudSeePlansBtn = document.getElementById('cloudSeePlansBtn');
  const cloudSignInLink = document.getElementById('cloudSignInLink');
  const cloudAvatarImg = document.getElementById('cloudAvatarImg');
  const cloudAvatarInitials = document.getElementById('cloudAvatarInitials');
  const cloudAccountName = document.getElementById('cloudAccountName');
  const cloudAuthStatus = document.getElementById('cloudAuthStatus');
  const cloudManagePlanBtn = document.getElementById('cloudManagePlanBtn');
  const cloudSignOutBtn = document.getElementById('cloudSignOutBtn');
  const cloudSyncNote = document.getElementById('cloudSyncNote');
  const cloudPricingPanel = document.getElementById('cloudPricingPanel');
  const cloudPricingTable = document.getElementById('cloudPricingTable');
  const cloudPricingFallback = document.getElementById('cloudPricingFallback');
  const cloudClosePricingBtn = document.getElementById('cloudClosePricingBtn');
  const appProfileDetails = document.getElementById('appProfileDetails');
  const appProfileStatePill = document.getElementById('appProfileStatePill');
  const profileAutofillBtn = document.getElementById('profileAutofillBtn');
  const profileTourBtn = document.getElementById('profileTourBtn');
  const apEeoToggle = document.getElementById('apEeoToggle');
  const apEeoGrid = document.getElementById('apEeoGrid');
  const customQaList = document.getElementById('customQaList');
  const customQaQuestionInput = document.getElementById('customQaQuestionInput');
  const customQaAnswerInput = document.getElementById('customQaAnswerInput');
  const customQaAddBtn = document.getElementById('customQaAddBtn');
  const uclGreeting = document.getElementById('uclGreeting');
  const uclSignOff = document.getElementById('uclSignOff');
  const uclBody = document.getElementById('uclBody');
  const uclStatus = document.getElementById('uclStatus');
  const coverLetterFallbackPill = document.getElementById('coverLetterFallbackPill');
  const skillLexiconUpdateBtn = document.getElementById('skillLexiconUpdateBtn');
  const skillLexiconAutoToggle = document.getElementById('skillLexiconAutoToggle');
  const skillLexiconStatus = document.getElementById('skillLexiconStatus');
  const skillLexiconPill = document.getElementById('skillLexiconPill');
  const allowUnverifiedSkillsToggle = document.getElementById('allowUnverifiedSkillsToggle');
  const animationsToggle = document.getElementById('animationsToggle');
  const animationsPill = document.getElementById('animationsPill');

  let resumes = [];
  let activeTabIndex = 0;
  let statusTimeoutId = null;
  let healthChecking = false;
  let appProfileCustomQa = [];
  let appProfileAutofilling = false;
  let universalCoverLetter = null;
  let skillLexiconMeta = null;
  let healthError = '';

  function generateId() {
    return 'r_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }

  function applyMotionPreference(enabled) {
    document.documentElement.classList.toggle('no-motion', enabled === false);
    if (animationsPill) animationsPill.textContent = enabled === false ? 'Animations off' : 'Animations on';
  }

  chrome.storage.local.get('animationsEnabled', (stored) => applyMotionPreference(stored.animationsEnabled !== false));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.animationsEnabled) {
      applyMotionPreference(changes.animationsEnabled.newValue !== false);
      if (animationsToggle) animationsToggle.checked = changes.animationsEnabled.newValue !== false;
    }
  });

  if (window.location.hash === '#cloud-pricing') {
    setTimeout(showCloudPricingPanel, 300);
  }

  // Clerk's pricing table is a React tree. Mounting it twice, or clearing its
  // container while it is mounted, makes React call removeChild on nodes whose
  // parent is already gone (NotFoundError). The table is mounted once per page
  // and closing the panel only hides it; Clerk owns its DOM.
  let pricingMountState = 'idle';
  let pricingMountPromise = null;

  function showCloudPricingPanel() {
    if (!window.CloudSync || !window.CloudSync.mountPricingTable || !cloudPricingPanel || !cloudPricingTable) {
      showStatus('Pricing is not available in this extension build yet.', 'error', 5000);
      return Promise.resolve();
    }
    if (accountCard) accountCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    cloudPricingPanel.style.display = 'block';
    if (pricingMountState === 'mounting' || pricingMountState === 'mounted') {
      return pricingMountPromise || Promise.resolve();
    }

    pricingMountState = 'mounting';
    if (cloudPricingFallback) {
      cloudPricingFallback.textContent = '';
      cloudPricingFallback.style.display = 'none';
    }
    pricingMountPromise = (async () => {
      try {
        await window.CloudSync.mountPricingTable(cloudPricingTable);
        pricingMountState = 'mounted';
      } catch (error) {
        if (window.CloudSync && typeof window.CloudSync.unmountPricingTable === 'function' && cloudPricingTable) {
          try {
            window.CloudSync.unmountPricingTable(cloudPricingTable);
          } catch (unmountError) {
            console.warn('[Pricing] Unmount failed:', unmountError);
          }
        }
        pricingMountState = 'idle';
        pricingMountPromise = null;
        if (cloudPricingFallback) {
          cloudPricingFallback.textContent = `Could not load the Pro pricing table. Details: ${error.message} If it keeps failing, check the Settings page console (F12), then confirm Billing is enabled in Clerk with at least one public user plan.`;
          cloudPricingFallback.style.display = 'block';
        }
        showStatus('Could not load pricing. Check the message in the Pro panel.', 'error', 7000);
      }
    })();
    return pricingMountPromise;
  }
  if (cloudClosePricingBtn) {
    cloudClosePricingBtn.addEventListener('click', () => {
      if (cloudPricingPanel) cloudPricingPanel.style.display = 'none';
    });
  }

  function createResumeEntry(label, content, icon = '') {
    return {
      id: generateId(),
      label: label || 'Resume 1',
      icon: icon || '',
      content: content || '',
      jsonContent: '',
      legacyContent: '',
      parseReview: null,
      parseConfirmedAt: 0,
      updatedAt: Date.now(),
      _lastSavedContent: content || '',
      healthReport: null
    };
  }

  function normalizeResumeEntry(resume, index) {
    const content = typeof resume?.content === 'string' ? resume.content : '';
    const explicitUpdatedAt = Number(resume?.updatedAt);
    const updatedAt = Number.isFinite(explicitUpdatedAt) && explicitUpdatedAt > 0 ? explicitUpdatedAt : Date.now();
    return {
      id: typeof resume?.id === 'string' && resume.id.trim() ? resume.id : generateId(),
      label: typeof resume?.label === 'string' && resume.label.trim() ? resume.label : `Resume ${index + 1}`,
      icon: typeof resume?.icon === 'string' ? resume.icon : '',
      content,
      jsonContent: typeof resume?.jsonContent === 'string' ? resume.jsonContent : '',
      legacyContent: typeof resume?.legacyContent === 'string' ? resume.legacyContent : '',
      parseReview: resume?.parseReview && Array.isArray(resume.parseReview.warnings)
        ? { warnings: resume.parseReview.warnings.filter((item) => typeof item === 'string'), parsedAt: Number(resume.parseReview.parsedAt) || 0 }
        : null,
      parseConfirmedAt: Number(resume?.parseConfirmedAt) || 0,
      updatedAt,
      _lastSavedContent: content,
      healthReport: resume?.healthReport && typeof resume.healthReport === 'object' ? resume.healthReport : null,
      healthEnabledLocal: !!resume?.healthEnabledLocal,
      healthCooldownUntil: Number(resume?.healthCooldownUntil) || 0
    };
  }

  function serializeResumeEntry(resume) {
    return {
      id: resume.id,
      label: resume.label,
      icon: resume.icon || '',
      content: resume.content,
      jsonContent: resume.jsonContent || '',
      legacyContent: resume.legacyContent || '',
      parseReview: resume.parseReview || null,
      parseConfirmedAt: Number(resume.parseConfirmedAt) || 0,
      updatedAt: Number(resume.updatedAt) || 0,
      healthReport: resume.healthReport || null,
      healthEnabledLocal: !!resume.healthEnabledLocal,
      healthCooldownUntil: Number(resume.healthCooldownUntil) || 0
    };
  }

  function getPersistedResumes() {
    return resumes.map(serializeResumeEntry);
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

  function getActiveResume() {
    return resumes[activeTabIndex] || null;
  }

  const STATUS_ICONS = { success: '\u2713', error: '\u2715', info: '\u2139' };

  function hideStatusOverlay() {
    statusOverlay.classList.remove('visible', 'blocking');
    delete document.body.dataset.status;
    statusTimeoutId = null;
  }

  function showStatus(text, type = 'success', autoHideMs = 2500) {
    if (statusTimeoutId) {
      clearTimeout(statusTimeoutId);
      statusTimeoutId = null;
    }
    const normalizedType = ['loading', 'success', 'error', 'info'].includes(type) ? type : 'info';
    if (normalizedType === 'loading' || normalizedType === 'success' || normalizedType === 'error') {
      document.body.dataset.status = normalizedType;
    } else {
      delete document.body.dataset.status;
    }
    statusOverlay.dataset.state = normalizedType;
    statusOverlay.classList.add('visible');
    statusOverlay.classList.toggle('blocking', normalizedType === 'loading');
    statusIcon.textContent = STATUS_ICONS[normalizedType] || '';
    statusText.textContent = text;
    if (autoHideMs > 0) {
      statusTimeoutId = setTimeout(hideStatusOverlay, autoHideMs);
    }
  }

  function setLocalStorage(payload) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(payload, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  const APP_PROFILE_FIELDS = [
    ['apFirstName', 'firstName'],
    ['apLastName', 'lastName'],
    ['apEmail', 'email'],
    ['apPhone', 'phone'],
    ['apStreet', 'streetAddress'],
    ['apStreet2', 'addressLine2'],
    ['apCity', 'city'],
    ['apState', 'state'],
    ['apPostal', 'postalCode'],
    ['apCountry', 'country'],
    ['apSalary', 'salaryAmount', 'number'],
    ['apCurrency', 'salaryCurrency'],
    ['apSalaryPeriod', 'salaryPeriod'],
    ['apStartDate', 'startDate'],
    ['apYears', 'yearsExperience', 'number'],
    ['apWorkAuthorized', 'workAuthorized'],
    ['apSponsorship', 'needsSponsorship'],
    ['apOver18', 'over18'],
    ['apRelocate', 'willingToRelocate'],
    ['apRemote', 'remotePreference'],
    ['apLinkedin', 'linkedin'],
    ['apWebsite', 'website'],
    ['apGithub', 'github'],
    ['apEeoGender', 'eeo.gender'],
    ['apEeoRace', 'eeo.race'],
    ['apEeoHispanic', 'eeo.hispanicLatino'],
    ['apEeoVeteran', 'eeo.veteran'],
    ['apEeoDisability', 'eeo.disability']
  ];

  function setProfilePath(obj, path, value) {
    const parts = path.split('.');
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  function getProfilePath(obj, path) {
    let node = obj;
    for (const part of path.split('.')) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[part];
    }
    return node;
  }

  function isAppProfileComplete(profile) {
    return !!(profile &&
      typeof profile.firstName === 'string' && profile.firstName.trim() &&
      typeof profile.lastName === 'string' && profile.lastName.trim());
  }

  function readAppProfileFromForm() {
    const profile = {};
    for (const [id, key, kind] of APP_PROFILE_FIELDS) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (kind === 'number') {
        const num = el.value === '' ? null : Number(el.value);
        setProfilePath(profile, key, Number.isFinite(num) ? num : null);
      } else {
        setProfilePath(profile, key, el.value.trim());
      }
    }
    profile.eeoOptIn = !!(apEeoToggle && apEeoToggle.checked);
    profile.customQA = appProfileCustomQa
      .map((row) => ({ id: row.id, question: (row.question || '').trim(), answer: (row.answer || '').trim() }))
      .filter((row) => row.question && row.answer);
    profile.updatedAt = Date.now();
    return profile;
  }

  function fillAppProfileForm(profile) {
    for (const [id, key, kind] of APP_PROFILE_FIELDS) {
      const el = document.getElementById(id);
      if (!el) continue;
      const value = profile ? getProfilePath(profile, key) : '';
      if (kind === 'number') {
        el.value = value === null || value === undefined || value === '' ? '' : String(value);
      } else {
        el.value = value === null || value === undefined ? '' : String(value);
      }
    }
    if (apEeoToggle) {
      apEeoToggle.checked = !!(profile && profile.eeoOptIn);
      if (apEeoGrid) apEeoGrid.style.display = apEeoToggle.checked ? 'grid' : 'none';
    }
    appProfileCustomQa = profile && Array.isArray(profile.customQA)
      ? profile.customQA.map((row) => ({
          id: row.id || ('q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
          question: row.question || '',
          answer: row.answer || ''
        }))
      : [];
    renderCustomQa();
    updateAppProfilePill();
  }

  function updateAppProfilePill() {
    if (!appProfileStatePill) return;
    const complete = isAppProfileComplete(readAppProfileFromForm());
    appProfileStatePill.textContent = complete ? 'Ready' : 'Not set up';
    appProfileStatePill.className = complete ? 'cloud-status-pill synced' : 'cloud-status-pill';
  }

  function updateCoverLetterFallbackPill() {
    if (!coverLetterFallbackPill) return;
    const hasBody = !!(uclBody && uclBody.value.trim());
    coverLetterFallbackPill.textContent = hasBody ? 'Ready' : 'Not set';
    coverLetterFallbackPill.className = hasBody ? 'cloud-status-pill synced' : 'cloud-status-pill';
  }

  function readUniversalCoverLetter() {
    const body = uclBody ? uclBody.value.trim() : '';
    if (!body) return null;
    return {
      greeting: uclGreeting ? uclGreeting.value.trim() : '',
      signOff: uclSignOff ? uclSignOff.value.trim() : '',
      body,
      updatedAt: Date.now()
    };
  }

  function formatLexiconTimestamp(ms) {
    if (!ms) return 'never';
    try {
      return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return 'unknown';
    }
  }

  function renderSkillLexiconStatus(meta, fallback) {
    if (!skillLexiconStatus) return;
    if (meta && meta.count) {
      skillLexiconStatus.textContent = `${meta.count.toLocaleString()} skills · ${meta.version || 'O*NET'} · updated ${formatLexiconTimestamp(meta.fetchedAt)}`;
      if (skillLexiconPill) {
        skillLexiconPill.textContent = 'Updated';
        skillLexiconPill.className = 'cloud-status-pill synced';
      }
      if (meta.lastError) skillLexiconStatus.textContent += ` · last error: ${meta.lastError}`;
      return;
    }
    if (fallback) {
      skillLexiconStatus.textContent = fallback;
      return;
    }
    skillLexiconStatus.textContent = 'Bundled vocabulary in use.';
  }

  async function refreshSkillLexiconStatus() {
    const response = await sendRuntimeMessage({ type: 'GET_SKILL_LEXICON_STATUS' });
    if (response && response.status === 'success') {
      skillLexiconMeta = response.meta || null;
      if (skillLexiconStatus && (!response.meta || !response.meta.count)) {
        skillLexiconStatus.textContent = `${response.count ? response.count.toLocaleString() + ' ' : ''}bundled skills in use.`;
      }
      renderSkillLexiconStatus(response.meta, null);
    }
  }

  function fillSettings(data) {
    universalCoverLetter = data.universalCoverLetter || null;
    if (uclGreeting) uclGreeting.value = universalCoverLetter?.greeting || '';
    if (uclSignOff) uclSignOff.value = universalCoverLetter?.signOff || '';
    if (uclBody) uclBody.value = universalCoverLetter?.body || '';
    if (uclStatus) uclStatus.textContent = universalCoverLetter?.updatedAt
      ? `Saved ${formatLexiconTimestamp(universalCoverLetter.updatedAt)}.`
      : '';
    updateCoverLetterFallbackPill();
    renderCoverLetterPreview();
    if (skillLexiconAutoToggle) skillLexiconAutoToggle.checked = data.skillLexiconAutoUpdate !== false;
    if (allowUnverifiedSkillsToggle) allowUnverifiedSkillsToggle.checked = data.allowUnverifiedSkills !== false;
    if (animationsToggle) animationsToggle.checked = data.animationsEnabled !== false;
    refreshSkillLexiconStatus();
  }

  let coverLetterSaveTimer = null;

  function persistUniversalCoverLetter() {
    const letter = readUniversalCoverLetter();
    universalCoverLetter = letter;
    chrome.storage.local.set({ universalCoverLetter: letter }, () => {
      updateCoverLetterFallbackPill();
      if (uclStatus) {
        uclStatus.textContent = letter?.body
          ? `Saved automatically · ${letter.body.length} characters`
          : '';
      }
    });
  }

  function scheduleCoverLetterSave() {
    updateCoverLetterFallbackPill();
    if (coverLetterSaveTimer) clearTimeout(coverLetterSaveTimer);
    coverLetterSaveTimer = setTimeout(() => {
      coverLetterSaveTimer = null;
      persistUniversalCoverLetter();
    }, 700);
  }

  if (uclBody) uclBody.addEventListener('input', scheduleCoverLetterSave);
  if (uclGreeting) uclGreeting.addEventListener('input', scheduleCoverLetterSave);
  if (uclSignOff) uclSignOff.addEventListener('input', scheduleCoverLetterSave);
  if (uclBody) uclBody.addEventListener('blur', () => {
    if (coverLetterSaveTimer) {
      clearTimeout(coverLetterSaveTimer);
      coverLetterSaveTimer = null;
      persistUniversalCoverLetter();
    }
  });

  if (uclBody) {
    uclBody.addEventListener('input', updateCoverLetterFallbackPill);
  }

  const COVER_LETTER_PROMPT = `Write me a universal cover letter I can reuse for every job application.

Rules:
- 250-350 words, first person, specific and concrete.
- Keep these placeholders exactly as written: {{company}}, {{role}}, {{recipient}}.
- Do not invent employers, metrics, certifications, or credentials. Only use the facts I give you below.
- Opening paragraph: name the {{role}} role and one concrete reason this kind of company interests me.
- Two body paragraphs: one proof paragraph with my strongest result, one fit paragraph mapping my skills to the kind of work in a typical posting for this role.
- Close with a short paragraph and a sign-off.
- Plain text only. No markdown, no headings, no placeholders other than the three above.

My background:
[Paste your master resume text here.]`;

  function coverLetterPreviewMarkup() {
    const greeting = (uclGreeting?.value.trim()) || 'Dear {{recipient}},';
    const body = (uclBody?.value.trim()) || '';
    const signOff = (uclSignOff?.value.trim()) || 'Sincerely,';
    if (!body) return '';
    const fill = (value) => value
      .replace(/\{\{\s*company\s*\}\}/gi, 'Acme Corp')
      .replace(/\{\{\s*role\s*\}\}/gi, 'Senior Engineer')
      .replace(/\{\{\s*recipient\s*\}\}/gi, 'Hiring Manager');
    const paragraphs = body.replace(/\r/g, '').split(/\n\s*\n/).map((part) => fill(part).trim()).filter(Boolean);
    return [fill(greeting), ...paragraphs, fill(signOff)]
      .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function renderCoverLetterPreview() {
    const preview = document.getElementById('coverLetterPreview');
    if (!preview) return;
    preview.innerHTML = coverLetterPreviewMarkup();
  }

  const copyPromptBtn = document.getElementById('copyCoverLetterPromptBtn');
  if (copyPromptBtn) {
    copyPromptBtn.addEventListener('click', async () => {
      const status = document.getElementById('coverLetterCopyStatus');
      try {
        await navigator.clipboard.writeText(COVER_LETTER_PROMPT);
        if (status) status.textContent = 'Prompt copied. Paste it into your assistant with your resume below it.';
      } catch {
        if (status) status.textContent = 'Copy failed — select the sample prompt manually.';
      }
    });
  }

  const sampleToggleBtn = document.getElementById('toggleCoverLetterSampleBtn');
  if (sampleToggleBtn) {
    sampleToggleBtn.addEventListener('click', () => {
      const sample = document.getElementById('coverLetterSample');
      if (!sample) return;
      const visible = sample.style.display !== 'none';
      sample.style.display = visible ? 'none' : 'block';
      sampleToggleBtn.textContent = visible ? 'Show sample' : 'Hide sample';
    });
  }

  if (uclGreeting) uclGreeting.addEventListener('input', renderCoverLetterPreview);
  if (uclSignOff) uclSignOff.addEventListener('input', renderCoverLetterPreview);
  if (uclBody) uclBody.addEventListener('input', renderCoverLetterPreview);

  document.addEventListener('click', (event) => {
    const pop = document.getElementById('resumeIconPop');
    if (!pop || pop.style.display === 'none') return;
    if (pop.contains(event.target)) return;
    const btn = document.getElementById('resumeIconBtn');
    if (event.target === btn) return;
    pop.style.display = 'none';
  });

  if (skillLexiconAutoToggle) {
    skillLexiconAutoToggle.addEventListener('change', () => {
      chrome.storage.local.set({ skillLexiconAutoUpdate: skillLexiconAutoToggle.checked });
    });
  }

  if (allowUnverifiedSkillsToggle) {
    allowUnverifiedSkillsToggle.addEventListener('change', () => {
      chrome.storage.local.set({ allowUnverifiedSkills: allowUnverifiedSkillsToggle.checked });
    });
  }

  if (animationsToggle) {
    animationsToggle.addEventListener('change', () => {
      chrome.storage.local.set({ animationsEnabled: animationsToggle.checked });
      applyMotionPreference(animationsToggle.checked);
    });
  }

  function requestEndpointPermission(origin) {
    return chrome.permissions.request({ origins: [origin] }).catch(() => false);
  }

  if (skillLexiconUpdateBtn) {
    skillLexiconUpdateBtn.addEventListener('click', async () => {
      const granted = await chrome.permissions.request({ origins: ['https://www.onetcenter.org/*'] }).catch(() => false);
      if (!granted) {
        showStatus('Permission to reach onetcenter.org is required to update the skill directory.', 'info', 5000);
        return;
      }
      skillLexiconUpdateBtn.disabled = true;
      const original = skillLexiconUpdateBtn.textContent;
      skillLexiconUpdateBtn.textContent = 'Updating…';
      try {
        const response = await sendRuntimeMessage({ type: 'UPDATE_SKILL_LEXICON' });
        if (response && response.status === 'success') {
          skillLexiconMeta = response.meta || null;
          renderSkillLexiconStatus(skillLexiconMeta, null);
          showStatus(`Skill directory updated: ${(response.meta?.count || 0).toLocaleString()} skills.`, 'success', 4000);
        } else if (response && response.status === 'permission_required') {
          showStatus('Permission to reach onetcenter.org is required to update the skill directory.', 'info', 5000);
        } else {
          throw new Error(response?.message || 'Unknown update error');
        }
      } catch (error) {
        showStatus(`Skill directory update failed: ${error.message}`, 'error', 6000);
      } finally {
        if (skillLexiconUpdateBtn) {
          skillLexiconUpdateBtn.disabled = false;
          skillLexiconUpdateBtn.textContent = original;
        }
      }
    });
  }

  function renderCustomQa() {
    if (!customQaList) return;
    customQaList.innerHTML = '';
    appProfileCustomQa.forEach((row, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'custom-qa-row';
      wrap.innerHTML = `
        <input type="text" maxlength="200" placeholder="Question" value="${escapeAttr(row.question)}" data-qa-field="question">
        <textarea rows="2" placeholder="Answer" data-qa-field="answer">${escapeHtml(row.answer)}</textarea>
        <div class="custom-qa-row-actions">
          <button type="button" class="ghost-btn" data-qa-remove="${index}">Remove</button>
        </div>
      `;
      wrap.querySelectorAll('[data-qa-field]').forEach((el) => {
        el.addEventListener('input', () => {
          appProfileCustomQa[index][el.dataset.qaField] = el.value;
        });
      });
      wrap.querySelector('[data-qa-remove]').addEventListener('click', () => {
        appProfileCustomQa.splice(index, 1);
        renderCustomQa();
        updateAppProfilePill();
      });
      customQaList.appendChild(wrap);
    });
  }

  function getSettingsPayload() {
    return {
      applicationProfile: readAppProfileFromForm(),
      resumes: getPersistedResumes(),
      universalCoverLetter: readUniversalCoverLetter()
    };
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
    const source = profile?.name || profile?.email || 'Pro';
    cloudAvatarInitials.textContent = source.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  }

  function renderAccountOffer(promo) {
    if (accountOfferBadge) {
      accountOfferBadge.textContent = promo ? 'Free to try' : 'Pro';
      accountOfferBadge.style.display = 'inline-block';
    }
    if (accountOfferTitle) {
      accountOfferTitle.textContent = promo ? 'Free to try until Dec 31' : 'Keep generating after Dec 31';
    }
    if (accountOfferSub) {
      accountOfferSub.textContent = promo
        ? 'Create an account — no card required. Then $4/month (about $1/week) or $47/year, cancel anytime.'
        : 'Create an account and start a 7-day free trial. Monthly $4 (about $1/week), yearly $47, cancel anytime.';
    }
    if (accountFeatureList) {
      const items = promo
        ? [
            ['Resume engine', 'tailored PDFs, no API key'],
            ['Cover letters', 'one template, every job'],
            ['Job Tracker', 'pipeline board + analytics'],
          ]
        : [
            ['Resume engine', 'tailored PDFs, no API key'],
            ['Cover letters', 'one template, every job'],
            ['Cloud sync', 'resumes on every device'],
          ];
      accountFeatureList.innerHTML = items
        .map(([label, desc]) => `<li><span class="pfl-check" aria-hidden="true">&#10003;</span><span class="pfl-text"><strong>${label}</strong> — ${desc}</span></li>`)
        .join('');
    }
  }

  async function updateCloudStatus() {
    if (!accountCard) return;
    const configured = !!(window.CloudSync && window.CloudSync.isConfigured && window.CloudSync.isConfigured());
    if (!configured) {
      accountCard.style.display = 'none';
      return;
    }
    accountCard.style.display = 'flex';

    try {
      await window.CloudSync.init();
      const signedIn = await window.CloudSync.isSignedIn();
      const access = window.CloudSync.getAccessState ? await window.CloudSync.getAccessState() : { promoActive: false };

      if (signedIn) {
        const profile = window.CloudSync.getUserProfile ? await window.CloudSync.getUserProfile() : null;
        if (accountSignedOut) accountSignedOut.style.display = 'none';
        if (accountSignedIn) accountSignedIn.style.display = 'flex';
        if (cloudAccountName) cloudAccountName.textContent = profile?.name || profile?.email || 'Signed in';
        setCloudAvatar(profile);
        const canSync = !!access.cloudSyncAccess;
        if (access.isPro && access.trialDaysLeft > 0) {
          cloudAuthStatus.textContent = `Trial · ${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? '' : 's'} left`;
          cloudAuthStatus.className = 'cloud-status-pill synced';
        } else if (access.isPro) {
          cloudAuthStatus.textContent = access.planPeriod === 'year' ? 'Pro · Yearly' : 'Pro';
          cloudAuthStatus.className = 'cloud-status-pill synced';
        } else if (access.withinWindow || access.proAccess) {
          cloudAuthStatus.textContent = 'Free until Dec 31';
          cloudAuthStatus.className = 'cloud-status-pill synced';
        } else {
          cloudAuthStatus.textContent = 'No plan';
          cloudAuthStatus.className = 'cloud-status-pill error';
        }
        if (cloudManagePlanBtn) cloudManagePlanBtn.textContent = access.isPro ? 'Manage plan' : 'Start free trial';
        if (cloudSyncNote) {
          cloudSyncNote.textContent = canSync
            ? 'Resumes sync automatically to the cloud.'
            : 'Sync is paused. Your cloud resumes are kept — subscribe to sync again.';
        }
        if (canSync) runAutoSync();
      } else {
        if (accountSignedIn) accountSignedIn.style.display = 'none';
        if (accountSignedOut) accountSignedOut.style.display = 'flex';
        renderAccountOffer(!!access.promoActive);
      }
    } catch (error) {
      if (accountSignedIn) accountSignedIn.style.display = 'none';
      if (accountSignedOut) accountSignedOut.style.display = 'flex';
      renderAccountOffer(false);
    }
  }

  let autoSyncRunning = false;

  async function recordDeletedResume(id) {
    try {
      const data = await chrome.storage.local.get('deletedResumeIds');
      const list = Array.isArray(data.deletedResumeIds) ? data.deletedResumeIds : [];
      list.push({ id, deletedAt: Date.now() });
      await chrome.storage.local.set({ deletedResumeIds: list.slice(-50) });
    } catch (error) {
      console.warn('[CloudSync] Could not record deletion:', error);
    }
  }

  async function runAutoSync() {
    if (autoSyncRunning) return;
    if (!window.CloudSync || typeof window.CloudSync.syncResumes !== 'function') return;
    autoSyncRunning = true;
    try {
      const result = await window.CloudSync.syncResumes();
      if (result && result.changed && Array.isArray(result.resumes) && result.resumes.length) {
        const data = await chrome.storage.local.get('resumes');
        if (Array.isArray(data.resumes) && data.resumes.length) {
          resumes = data.resumes.map((resume, index) => normalizeResumeEntry(resume, index));
          activeTabIndex = Math.min(activeTabIndex, resumes.length - 1);
          renderTabBar();
          renderTabContent();
        }
        showStatus('Resumes synced with the cloud.', 'success', 3000);
      }
    } catch (error) {
      console.warn('[CloudSync] Auto-sync skipped:', error);
    } finally {
      autoSyncRunning = false;
    }
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



  function parseProfileText(text) {
    return normalizeResumeProfile(parseResumeText(text));
  }

  function resumeDraft(resume) {
    if (!resume) return normalizeResumeProfile({});
    if (resume._draft) return resume._draft;
    let raw = null;
    if (resume.jsonContent) {
      try {
        raw = JSON.parse(resume.jsonContent);
      } catch {
        raw = null;
      }
    }
    if (!raw && resume.content && resume.content.trim()) {
      raw = parseResumeText(resume.content);
      if (!resume.legacyContent) resume.legacyContent = resume.content;
    }
    resume._draft = normalizeResumeProfile(raw || {});
    return resume._draft;
  }

  function serializeProfile(profile) {
    const normalized = normalizeResumeProfile(profile);
    const contactParts = splitContactParts(normalized);
    normalized.contact = buildContactString(contactParts);
    return JSON.stringify(normalized, null, 2);
  }

  function applyParsedText(resume, text) {
    const parsed = parseProfileText(text);
    resume._draft = parsed;
    resume.legacyContent = text;
    resume.content = text;
    resume.parseReview = {
      warnings: Array.isArray(parsed.parseWarnings) ? parsed.parseWarnings.slice(0, 6) : [],
      parsedAt: Date.now()
    };
    resume.updatedAt = Date.now();
    return parsed;
  }

  updateCloudStatus();

  let cloudStatusRefreshAt = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.proAccessCache) return;
    if (Date.now() - cloudStatusRefreshAt < 2000) return;
    cloudStatusRefreshAt = Date.now();
    updateCloudStatus();
  });

  async function startAuth(mode) {
    try {
      if (!window.CloudSync) throw new Error('Account service failed to load.');
      showStatus(mode === 'signUp' ? 'Opening sign-up...' : 'Opening sign-in...', 'loading', 0);
      if (mode === 'signUp' && typeof window.CloudSync.signUp === 'function') {
        await window.CloudSync.signUp();
      } else {
        await window.CloudSync.signIn();
      }
      showStatus('Complete this in the window that just opened.', 'info', 6000);
      setTimeout(updateCloudStatus, 800);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error', 6000);
    }
  }

  if (cloudCreateAccountBtn) {
    cloudCreateAccountBtn.addEventListener('click', () => startAuth('signUp'));
  }

  if (cloudSignInLink) {
    cloudSignInLink.addEventListener('click', () => startAuth('signIn'));
  }

  if (cloudSeePlansBtn) {
    cloudSeePlansBtn.addEventListener('click', () => showCloudPricingPanel());
  }

  if (cloudManagePlanBtn) {
    cloudManagePlanBtn.addEventListener('click', () => showCloudPricingPanel());
  }

  if (cloudSignOutBtn) {
    cloudSignOutBtn.addEventListener('click', async () => {
      try {
        if (!window.CloudSync) throw new Error('Account service failed to load.');
        showStatus('Signing out...', 'loading', 0);
        await window.CloudSync.signOut();
        showStatus('Signed out.', 'success', 4000);
        setTimeout(updateCloudStatus, 500);
      } catch (error) {
        showStatus(`Error: ${error.message}`, 'error', 6000);
      }
    });
  }

  const data = await chrome.storage.local.get([
    'resumes', 'userProfile', 'resumeType', 'resumeLayout', 'selectedResumeId', 'onboarding',
    'onboardingCompleted', 'universalCoverLetter', 'applicationProfile', 'skillLexiconAutoUpdate',
    'pendingExtract', 'openCoverLetterSection', 'allowUnverifiedSkills', 'animationsEnabled'
  ]);
  universalCoverLetter = data.universalCoverLetter || null;

  if (data.resumes && data.resumes.length > 0) {
    resumes = data.resumes.map((resume, index) => normalizeResumeEntry(resume, index));
  } else if (data.userProfile) {
    resumes = [createResumeEntry('Resume 1', data.userProfile)];
    await chrome.storage.local.remove('userProfile');
  } else {
    resumes = [createResumeEntry('Resume 1', '')];
  }

  let migrated = false;
  resumes.forEach((resume) => {
    if ((!resume.jsonContent || !resume.jsonContent.trim()) && resume.content && resume.content.trim()) {
      const parsed = parseProfileText(resume.content);
      resume._draft = parsed;
      resume.legacyContent = resume.content;
      resume.jsonContent = serializeProfile(parsed);
      resume.parseReview = { warnings: Array.isArray(parsed.parseWarnings) ? parsed.parseWarnings : [], parsedAt: Date.now() };
      resume.parseConfirmedAt = 0;
      resume.updatedAt = Date.now();
      migrated = true;
    }
  });
  if (migrated) await setLocalStorage({ resumes: getPersistedResumes() });

  const hasResumes = resumes.some((resume) => (resume.jsonContent || resume.content || '').trim());
  if (hasResumes && !data.onboardingCompleted) renderSetupCompleteCard();

  if (!resumes.length) {
    resumes = [createResumeEntry('Resume 1', '')];
  }

  runAutoSync();

  // Resume edits sync from a page realm: the service worker cannot mint a Convex
  // token, so the storage listener has to live where the Clerk session is.
  if (window.CloudSync && typeof window.CloudSync.startAutoSync === 'function') {
    window.CloudSync.startAutoSync();
  }

  // --- Form Filler setup (Application Questions) ---
  fillAppProfileForm(data.applicationProfile || null);
  fillSettings(data);

  if (data.pendingExtract) {
    chrome.storage.local.remove('pendingExtract');
    setTimeout(() => {
      const paste = document.getElementById('rfPasteInput');
      if (paste) {
        paste.focus();
        paste.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      showStatus('Paste your resume text above, then click Parse resume.', 'info', 6000);
    }, 500);
  }

  if (data.openCoverLetterSection) {
    chrome.storage.local.remove('openCoverLetterSection');
    setTimeout(() => {
      const details = document.getElementById('coverLetterDetails');
      if (details) {
        details.open = true;
        details.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (uclBody) uclBody.focus();
    }, 400);
  }

  let openAuthConsuming = false;

  async function consumeOpenAuthIntent() {
    if (openAuthConsuming) return;
    openAuthConsuming = true;
    try {
      const stored = await chrome.storage.local.get('openAuth');
      const mode = stored.openAuth === 'signUp' ? 'signUp' : stored.openAuth === 'signIn' ? 'signIn' : '';
      if (!mode) return;
      await chrome.storage.local.remove('openAuth');
      if (accountCard) accountCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      startAuth(mode);
    } finally {
      setTimeout(() => { openAuthConsuming = false; }, 1500);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.openAuth && changes.openAuth.newValue) {
      consumeOpenAuthIntent();
    }
  });
  consumeOpenAuthIntent();

  if (apEeoToggle) {
    apEeoToggle.addEventListener('change', () => {
      if (apEeoGrid) apEeoGrid.style.display = apEeoToggle.checked ? 'grid' : 'none';
    });
  }

  if (customQaAddBtn) {
    customQaAddBtn.addEventListener('click', () => {
      const question = customQaQuestionInput.value.trim();
      const answer = customQaAnswerInput.value.trim();
      if (!question || !answer) {
        showStatus('Add both a question and an answer.', 'info', 3000);
        return;
      }
      appProfileCustomQa.push({
        id: 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        question,
        answer
      });
      customQaQuestionInput.value = '';
      customQaAnswerInput.value = '';
      renderCustomQa();
      updateAppProfilePill();
    });
  }

  if (appProfileDetails) {
    appProfileDetails.addEventListener('input', updateAppProfilePill);
    appProfileDetails.addEventListener('change', updateAppProfilePill);
  }

  async function handleProfileAutofill() {
    if (appProfileAutofilling) return;
    saveCurrentTabToState();
    const resume = getActiveResume();
    const sourceText = (resume?.jsonContent || '').trim() || (resume?.content || '').trim();
    if (!sourceText) {
      showStatus('Paste your resume in the Resume Content tab first, then run Auto-fill.', 'error', 4500);
      return;
    }
    appProfileAutofilling = true;
    if (profileAutofillBtn) profileAutofillBtn.disabled = true;
    showStatus('Extracting your answers from your resume...', 'loading', 0);
    try {
      const response = await sendRuntimeMessage({ type: 'PROFILE_AUTOFILL', payload: { sourceText } });
      if (!response || response.status !== 'success' || !response.data) {
        throw new Error(response?.message || 'Unknown extraction error');
      }
      const extracted = response.data;
      let offered = 0;
      let filled = 0;
      for (const [id, key] of APP_PROFILE_FIELDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        const value = getProfilePath(extracted, key);
        if (value === null || value === undefined || value === '') continue;
        offered++;
        if (el.value.trim()) continue;
        el.value = String(value);
        filled++;
      }
      updateAppProfilePill();
      if (offered) {
        showStatus(`Filled ${filled} of ${offered} fields from your resume. Review and click Save Settings.`, 'success', 6000);
      } else {
        showStatus('Your resume had no details for these questions. Fill the boxes manually.', 'info', 5000);
      }
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error', 5000);
    } finally {
      appProfileAutofilling = false;
      if (profileAutofillBtn) profileAutofillBtn.disabled = false;
    }
  }


  function saveCurrentTabToState() {
    resumes.forEach((resume, index) => {
      const labelInput = document.getElementById('resumeLabelInput');
      if (labelInput && index === activeTabIndex) {
        resume.label = labelInput.value.trim() || `Resume ${index + 1}`;
      }
      if (resume._draft) {
        const nextJson = serializeProfile(resume._draft);
        if (nextJson !== resume.jsonContent) {
          resume.jsonContent = nextJson;
          resume.updatedAt = Date.now();
        }
      }
    });
  }

  const HEALTH_COOLDOWN_MS = 60000;
  const HEALTH_SCORE_WEIGHTS = { critical: 8, warning: 5, suggestion: 3 };
  let healthCountdownTimer = null;

  function getHealthStale(resume) {
    if (!resume?.healthReport) return false;
    const checkedAt = resume.healthReport.checkedAt || 0;
    const updatedAt = resume.updatedAt || 0;
    return updatedAt > checkedAt;
  }

  function healthCooldownRemaining(resume) {
    const until = Number(resume?.healthCooldownUntil) || 0;
    return Math.max(0, until - Date.now());
  }

  function openHealthIssues(report) {
    return (Array.isArray(report?.issues) ? report.issues : []).filter((issue) => issue.status !== 'fixed');
  }

  function recomputeHealthScore(report) {
    if (!report) return 0;
    const base = Number(report.baseScore ?? report.score) || 0;
    const bump = (Array.isArray(report.issues) ? report.issues : [])
      .filter((issue) => issue.status === 'fixed')
      .reduce((sum, issue) => sum + (HEALTH_SCORE_WEIGHTS[issue.severity] || 0), 0);
    return Math.min(100, Math.round(base + bump));
  }

  function healthScoreClass(score) {
    if (score >= 80) return 'health-score-green';
    if (score >= 60) return 'health-score-amber';
    return 'health-score-red';
  }

  function healthPillLabel(resume) {
    if (!resume) return 'Not checked';
    if (!resume.healthReport) return resume.healthEnabledLocal ? 'Ready' : 'Off';
    return `${resume.healthReport.score || 0}/100`;
  }

  function stopHealthCountdown() {
    if (healthCountdownTimer) {
      clearInterval(healthCountdownTimer);
      healthCountdownTimer = null;
    }
  }

  function describeHealthProvider(report) {
    if (!report?.providerLabel) return '';
    return report.provider === 'ollama'
      ? `Checked with ${report.providerLabel} (${report.model}) — nothing left this machine.`
      : `Checked with ${report.providerLabel}.`;
  }

  function renderHealthPanel() {
    const container = document.getElementById('healthPanel');
    if (!container) return;
    stopHealthCountdown();

    const pill = document.getElementById('healthScorePill');
    const resume = getActiveResume();
    if (pill) {
      pill.textContent = healthPillLabel(resume);
      pill.classList.remove('health-score-green', 'health-score-amber', 'health-score-red');
      if (resume?.healthReport) pill.classList.add(healthScoreClass(resume.healthReport.score || 0));
    }

    if (!resume) {
      container.innerHTML = '<p class="health-panel-state">Select a resume to check it.</p>';
      return;
    }

    if (!resume.healthEnabledLocal) {
      container.innerHTML = `
        <p class="health-panel-state">Checks the rules recruiters scan for: action-verb openers, measurable impact, tense, contact details, skills, and filler. Off by default — nothing is sent until you enable it.</p>
        <div class="tracker-toggle-row">
          <div class="tracker-toggle-text"><p>Enable online health check</p></div>
          <label class="toggle-switch"><input type="checkbox" id="healthEnableToggle"><span class="toggle-slider"></span></label>
        </div>
        <small class="resume-help">Contact details are redacted before sending. Pollinations runs first, local Ollama is the fallback.</small>
      `;
      const toggle = document.getElementById('healthEnableToggle');
      if (toggle) {
        toggle.addEventListener('change', async () => {
          if (toggle.checked) {
            await requestEndpointPermission('http://localhost:11434/*');
          }
          resume.healthEnabledLocal = toggle.checked;
          resume.healthCooldownUntil = toggle.checked ? (resume.healthCooldownUntil || 0) : 0;
          await setLocalStorage({ resumes: getPersistedResumes() });
          renderHealthPanel();
        });
      }
      return;
    }

    const report = resume.healthReport;
    const stale = getHealthStale(resume);
    const issues = Array.isArray(report?.issues) ? report.issues : [];
    const open = issues.filter((issue) => issue.status !== 'fixed');
    const fixedCount = issues.length - open.length;
    const cooldown = healthCooldownRemaining(resume);
    const allFixed = !!report && issues.length > 0 && open.length === 0;
    const blockedByOpenIssues = !!report && open.length > 0 && !stale;
    const canCheck = !healthChecking && !blockedByOpenIssues && cooldown === 0 && !!resume.jsonContent;

    const buttonLabel = healthChecking
      ? 'Checking…'
      : cooldown > 0
        ? `Re-check in ${Math.ceil(cooldown / 1000)}s`
        : report
          ? 'Re-check resume'
          : 'Check resume';

    const parts = [];
    parts.push(`
      <div class="tracker-toggle-row">
        <div class="tracker-toggle-text"><p>Enable online health check</p></div>
        <label class="toggle-switch"><input type="checkbox" id="healthEnableToggle" checked><span class="toggle-slider"></span></label>
      </div>
    `);

    if (healthError) {
      parts.push(`<p class="health-note warn">${escapeHtml(healthError)}</p>`);
    }

    if (!report) {
      parts.push('<p class="health-panel-state">Run the first check to see what to fix.</p>');
    } else {
      parts.push(`
        <div class="health-score-row">
          <div class="health-score ${healthScoreClass(report.score || 0)}">${report.score || 0}/100</div>
          <div class="health-summary">${escapeHtml(report.summary || '')}</div>
        </div>
        <p class="resume-help">${open.length} open · ${fixedCount} fixed${report.checkedAt ? ` · checked ${formatLexiconTimestamp(report.checkedAt)}` : ''}</p>
        ${describeHealthProvider(report) ? `<p class="resume-help">${escapeHtml(describeHealthProvider(report))}</p>` : ''}
        ${stale ? '<p class="health-note warn">Resume changed since this check. Re-run to match the current text.</p>' : ''}
        ${!stale && open.length === 0 ? '<p class="health-note">All issues marked fixed. Run a re-check to confirm the new score.</p>' : ''}
        ${allFixed ? '' : `
          <div class="health-issues">
            ${open.map((issue) => {
              const idx = issues.indexOf(issue);
              return `
                <div class="health-issue" data-issue-idx="${idx}">
                  <div class="health-issue-head">
                    <span class="health-sev ${issue.severity}">${issue.severity}</span>
                    <strong>${escapeHtml(issue.item || '')}</strong>
                  </div>
                  <p class="health-problem">${escapeHtml(issue.problem || '')}</p>
                  ${issue.fix ? `<p class="health-fix"><em>Fix:</em> ${escapeHtml(issue.fix)}</p>` : ''}
                  <button type="button" class="ghost-btn health-fix-btn" data-fix-idx="${idx}">Mark fixed</button>
                </div>
              `;
            }).join('')}
          </div>
        `}
      `);
    }

    parts.push(`
      <div class="health-actions">
        <button type="button" class="secondary-action-btn" id="healthCheckBtn" ${canCheck ? '' : 'disabled'}>${buttonLabel}</button>
      </div>
      ${blockedByOpenIssues ? '<p class="health-note">Mark the remaining issues fixed before running another check.</p>' : ''}
      ${!resume.jsonContent ? '<p class="health-note">Parse and save this resume first — the check reads the structured profile.</p>' : ''}
    `);

    container.innerHTML = parts.join('');

    const toggle = document.getElementById('healthEnableToggle');
    if (toggle) {
      toggle.addEventListener('change', async () => {
        if (toggle.checked) {
          await requestEndpointPermission('http://localhost:11434/*');
        }
        resume.healthEnabledLocal = toggle.checked;
        if (!toggle.checked) resume.healthCooldownUntil = 0;
        await setLocalStorage({ resumes: getPersistedResumes() });
        renderHealthPanel();
      });
    }

    container.querySelectorAll('.health-fix-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.fixIdx);
        if (!report || !Array.isArray(report.issues) || !report.issues[idx]) return;
        report.issues[idx].status = 'fixed';
        report.issues[idx].fixedAt = Date.now();
        report.score = recomputeHealthScore(report);
        await setLocalStorage({ resumes: getPersistedResumes() });
        renderHealthPanel();
        if (openHealthIssues(report).length === 0) {
          showStatus('All issues marked fixed. Run a re-check to confirm.', 'success', 4000);
        }
      });
    });

    const checkBtn = document.getElementById('healthCheckBtn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => runResumeHealthCheck(resume));
    }

    if (cooldown > 0 && !healthChecking) {
      healthCountdownTimer = setInterval(() => {
        const remaining = healthCooldownRemaining(resume);
        const target = document.getElementById('healthCheckBtn');
        if (!target) {
          stopHealthCountdown();
          return;
        }
        if (remaining <= 0) {
          stopHealthCountdown();
          renderHealthPanel();
          return;
        }
        target.textContent = `Re-check in ${Math.ceil(remaining / 1000)}s`;
      }, 1000);
    }
  }

  async function runResumeHealthCheck(resume) {
    if (!resume || !resume.jsonContent || healthChecking) return;
    const stale = getHealthStale(resume);
    const report = resume.healthReport;
    if (report && openHealthIssues(report).length > 0 && !stale) {
      showStatus('Mark the remaining issues fixed before running another check.', 'info', 4000);
      return;
    }
    if (healthCooldownRemaining(resume) > 0) return;

    healthChecking = true;
    healthError = '';
    resume.healthCooldownUntil = Date.now() + HEALTH_COOLDOWN_MS;
    await setLocalStorage({ resumes: getPersistedResumes() });
    renderHealthPanel();
    showStatus('Running resume health check…', 'loading', 0);

    try {
      const response = await sendRuntimeMessage({
        type: 'CHECK_RESUME_HEALTH',
        payload: { jsonContent: resume.jsonContent }
      });
      if (!response || response.status !== 'success' || !response.data) {
        throw new Error(response?.message || 'Health check failed');
      }
      resume.healthReport = response.data;
      resume.healthReport.score = recomputeHealthScore(resume.healthReport);
      await setLocalStorage({ resumes: getPersistedResumes() });
      showStatus(response.data.provider === 'ollama'
        ? 'Health check complete (local Ollama).'
        : 'Health check complete.', 'success', 3000);
    } catch (error) {
      healthError = error.message;
      showStatus(`Health check failed: ${error.message}`, 'error', 6000);
    } finally {
      healthChecking = false;
      renderHealthPanel();
    }
  }

  function renderTabBar() {
    tabBar.innerHTML = '';

    resumes.forEach((resume, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-btn' + (index === activeTabIndex ? ' active' : '');
      btn.innerHTML = `${resumeIconSvg(resume.icon)}<span>${escapeHtml(resume.label || `Resume ${index + 1}`)}</span>`;
      btn.addEventListener('click', () => {
        saveCurrentTabToState();
        activeTabIndex = index;
        renderTabBar();
        renderTabContent();
      });
      tabBar.appendChild(btn);
    });

    if (resumes.length < 3) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'add-tab-btn';
      addBtn.textContent = '+';
      addBtn.title = 'Add a new resume (max 3)';
      addBtn.addEventListener('click', async () => {
        saveCurrentTabToState();
        resumes.push(createResumeEntry(`Resume ${resumes.length + 1}`, ''));
        activeTabIndex = resumes.length - 1;
        await setLocalStorage({ resumes: getPersistedResumes() });
        renderTabBar();
        renderTabContent();
        runAutoSync();
      });
      tabBar.appendChild(addBtn);
    }
  }

  const ENTRY_GROUPS = {
    experience: {
      label: 'Experience',
      addLabel: 'experience',
      fields: [['title', 'Role'], ['company', 'Company'], ['location', 'Location'], ['period', 'Dates (Jan 2020 – Present)']]
    },
    projects: {
      label: 'Projects',
      addLabel: 'project',
      fields: [['title', 'Project'], ['platform', 'Stack / link'], ['period', 'Dates']]
    },
    education: {
      label: 'Education',
      addLabel: 'education entry',
      fields: [['degree', 'Degree'], ['school', 'School'], ['year', 'Year'], ['location', 'Location']]
    }
  };

  function blankEntry(group) {
    if (group === 'education') return { degree: '', school: '', year: '', location: '', details: [] };
    if (group === 'projects') return { title: '', company: '', platform: '', period: '', points: [], description: '', url: '', stars: '', venue: '' };
    return { title: '', company: '', location: '', period: '', points: [] };
  }

  function entryPoints(entry, group, index) {
    const points = Array.isArray(entry.points) ? entry.points : [];
    return points.map((point, pointIndex) => `
      <div class="rf-point">
        <textarea rows="2" data-rf-point="${group}" data-idx="${index}" data-pidx="${pointIndex}" placeholder="What you did and the result">${escapeHtml(point)}</textarea>
        <button type="button" class="rf-icon-btn" data-rf-delpoint="${group}" data-idx="${index}" data-pidx="${pointIndex}" title="Remove bullet">&#215;</button>
      </div>`).join('');
  }

  function renderEntryGroup(group, draft) {
    const config = ENTRY_GROUPS[group];
    const entries = Array.isArray(draft[group]) ? draft[group] : [];
    const cards = entries.map((entry, index) => `
      <div class="rf-entry">
        <div class="rf-entry-head">
          <span>${escapeHtml(entry.title || entry.degree || entry.company || entry.school || `Entry ${index + 1}`)}</span>
          <button type="button" class="rf-icon-btn" data-rf-del="${group}" data-idx="${index}" title="Remove entry">&#215;</button>
        </div>
        <div class="rf-grid">
          ${config.fields.map(([key, label]) => `
            <div class="rf-field">
              <label>${label}</label>
              <input type="text" data-rf-entry="${group}" data-idx="${index}" data-key="${key}" value="${escapeAttr(entry[key] || '')}">
            </div>`).join('')}
        </div>
        ${entryPoints(entry, group, index)}
        <button type="button" class="rf-add" data-rf-addpoint="${group}" data-idx="${index}">+ Add bullet</button>
      </div>`).join('');
    return `
      <div class="rf-card">
        <div class="rf-card-head">
          <span class="rf-card-title">${config.label}</span>
          <span class="resume-help">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        ${cards || '<small class="resume-help">Nothing here yet.</small>'}
        <button type="button" class="rf-add" data-rf-add="${group}">+ Add ${config.addLabel}</button>
      </div>`;
  }

  function resumeProfileWarningsFor(resume) {
    return resumeProfileWarnings(resumeDraft(resume));
  }

  function refreshDraftWarnings() {
    const resume = getActiveResume();
    const warn = document.getElementById('rfWarn');
    if (!resume || !warn) return;
    const list = resumeProfileWarningsFor(resume);
    warn.classList.toggle('visible', list.length > 0 || !!resume.parseReview);
    const target = warn.querySelector('[data-rf-warn-list]');
    if (target) target.textContent = list.join(' ');
  }

  function renderTabContent() {
    const resume = getActiveResume();
    if (!resume) return;
    healthError = '';
    const draft = resumeDraft(resume);
    const review = resume.parseReview
      ? (Array.isArray(resume.parseReview.warnings) ? resume.parseReview.warnings : [])
      : null;
    const linksValue = (draft.links || []).map((link) => link.url || link.text || '').filter(Boolean).join('\n');

    const labelRow = `
      <div class="resume-label-row">
        <div class="resume-icon-wrap">
          <button type="button" class="resume-icon-btn" id="resumeIconBtn" title="Pick an icon">${resumeIconSvg(resume.icon)}</button>
          <div class="resume-icon-pop" id="resumeIconPop" style="display: none;">
            ${Object.keys(RESUME_ICONS).map((iconId) => `
              <button type="button" class="resume-icon-option${(resume.icon || 'doc') === iconId ? ' active' : ''}" data-icon="${iconId}" title="${iconId}">${resumeIconSvg(iconId)}</button>
            `).join('')}
          </div>
        </div>
        <input type="text" id="resumeLabelInput" class="resume-label-input"
               placeholder="Label (e.g. Project Manager)" value="${escapeAttr(resume.label)}" maxlength="40">
        ${resumes.length > 1 ? '<button type="button" class="delete-tab-btn" id="deleteTabBtn">Delete</button>' : ''}
      </div>
    `;

    tabContentArea.innerHTML = labelRow + `
      <div class="rf">
        <div class="rf-warn" id="rfWarn">
          <strong>Almost there.</strong> <span data-rf-warn-list></span>
          ${review ? `
            <p class="resume-help" style="margin:6px 0 0" data-rf-review-copy></p>
            <div class="paste-card-actions" style="margin-top:8px">
              <button type="button" class="success-btn" id="rfConfirmResume">Looks right — confirm</button>
            </div>
          ` : ''}
        </div>

        <div class="rf-card paste-card">
          <div class="rf-card-head">
            <span class="rf-card-title">Paste an existing resume</span>
            <span class="resume-help">Local parser · nothing leaves this device</span>
          </div>
          <textarea id="rfPasteInput" placeholder="Paste your resume text here. Headings like EXPERIENCE, SKILLS, EDUCATION help the parser."></textarea>
          <div class="paste-card-actions">
            <button type="button" class="secondary-action-btn" id="rfParseBtn">Parse resume</button>
            <small class="resume-help" id="rfParseStatus"></small>
          </div>
        </div>

        <div class="rf-card">
          <div class="rf-card-head"><span class="rf-card-title">Header</span></div>
          <div class="rf-grid">
            <div class="rf-field">
              <label>Full name</label>
              <input type="text" data-rf-field="name" value="${escapeAttr(draft.name || '')}">
            </div>
            <div class="rf-field">
              <label>Headline</label>
              <input type="text" data-rf-field="subtitle" value="${escapeAttr(draft.subtitle || '')}">
            </div>
            <div class="rf-field">
              <label>Email</label>
              <input type="text" data-rf-field="email" value="${escapeAttr(draft.email || '')}">
            </div>
            <div class="rf-field">
              <label>Phone</label>
              <input type="text" data-rf-field="phone" value="${escapeAttr(draft.phone || '')}">
            </div>
            <div class="rf-field">
              <label>Location</label>
              <input type="text" data-rf-field="location" value="${escapeAttr(draft.location || '')}">
            </div>
          </div>
          <div class="rf-field">
            <label>Links (one per line)</label>
            <textarea rows="3" data-rf-links placeholder="linkedin.com/in/you&#10;github.com/you">${escapeHtml(linksValue)}</textarea>
          </div>
        </div>

        <div class="rf-card">
          <div class="rf-card-head"><span class="rf-card-title">Summary</span></div>
          <div class="rf-field">
            <textarea rows="4" data-rf-field="summary" placeholder="Two or three sentences: what you do, your scale, and the result you are known for.">${escapeHtml(draft.summary || '')}</textarea>
          </div>
        </div>

        <div class="rf-card">
          <div class="rf-card-head">
            <span class="rf-card-title">Skills</span>
            <span class="resume-help">Comma separated</span>
          </div>
          <div class="rf-field">
            <textarea rows="3" data-rf-csv="skills" placeholder="React, TypeScript, Node.js, PostgreSQL">${escapeHtml((draft.skills || []).join(', '))}</textarea>
          </div>
        </div>

        ${renderEntryGroup('experience', draft)}
        ${renderEntryGroup('projects', draft)}
        ${renderEntryGroup('education', draft)}

        <div class="rf-card">
          <div class="rf-card-head"><span class="rf-card-title">Certifications</span></div>
          <div class="rf-field">
            <textarea rows="3" data-rf-lines="certifications" placeholder="One per line">${escapeHtml((draft.certifications || []).join('\n'))}</textarea>
          </div>
        </div>

        <div class="rf-card rf-advanced">
          <details>
            <summary>Advanced — JSON</summary>
            <div class="rf-field" style="margin-top:8px">
              <textarea id="rfJson" class="rf-json" spellcheck="false">${escapeHtml(serializeProfile(draft))}</textarea>
            </div>
            <div class="rf-json-actions">
              <button type="button" class="ghost-btn" id="rfCopyJsonBtn">Copy JSON</button>
              <button type="button" class="ghost-btn" id="rfApplyJsonBtn">Apply JSON</button>
              <button type="button" class="ghost-btn" id="rfRefreshJsonBtn">Refresh preview</button>
            </div>
          </details>
        </div>

      </div>
    `;

    renderHealthPanel();

    const labelInput = document.getElementById('resumeLabelInput');
    if (labelInput) {
      labelInput.addEventListener('input', () => {
        const tabBtns = tabBar.querySelectorAll('.tab-btn');
        const labelSpan = tabBtns[activeTabIndex] ? tabBtns[activeTabIndex].querySelector('span') : null;
        if (labelSpan) {
          labelSpan.textContent = labelInput.value.trim() || `Resume ${activeTabIndex + 1}`;
        }
      });
    }

    const iconBtn = document.getElementById('resumeIconBtn');
    const iconPop = document.getElementById('resumeIconPop');
    if (iconBtn && iconPop) {
      iconBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        iconPop.style.display = iconPop.style.display === 'none' ? 'grid' : 'none';
      });
      iconPop.addEventListener('click', async (event) => {
        const option = event.target.closest('[data-icon]');
        if (!option) return;
        resume.icon = option.dataset.icon;
        await setLocalStorage({ resumes: getPersistedResumes() });
        renderTabBar();
        renderTabContent();
        runAutoSync();
      });
    }

    const deleteBtn = document.getElementById('deleteTabBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (resumes.length <= 1) return;
        const target = resumes[activeTabIndex];
        const label = target.label || `Resume ${activeTabIndex + 1}`;
        if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
        await recordDeletedResume(target.id);
        resumes.splice(activeTabIndex, 1);
        if (activeTabIndex >= resumes.length) activeTabIndex = resumes.length - 1;
        await setLocalStorage({ resumes: getPersistedResumes() });
        renderTabBar();
        renderTabContent();
        runAutoSync();
      });
    }

    const parseBtn = document.getElementById('rfParseBtn');
    if (parseBtn) {
      parseBtn.addEventListener('click', () => {
        const input = document.getElementById('rfPasteInput');
        const text = input ? input.value.trim() : '';
        if (!text) {
          showStatus('Paste your resume text first.', 'error', 3000);
          return;
        }
        const parsed = applyParsedText(resume, text);
        renderTabBar();
        renderTabContent();
        const counted = [];
        if (parsed.experience.length) counted.push(`${parsed.experience.length} roles`);
        if (parsed.skills.length) counted.push(`${parsed.skills.length} skills`);
        if (parsed.education.length) counted.push(`${parsed.education.length} education`);
        showStatus(`Parsed ${counted.join(' · ') || 'no sections'}. Check the form, then confirm.`, 'success', 6000);
      });
    }

    const confirmBtn = document.getElementById('rfConfirmResume');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        resume.parseReview = null;
        resume.parseConfirmedAt = Date.now();
        saveCurrentTabToState();
        await setLocalStorage({ resumes: getPersistedResumes(), parseConfirmedAt: Date.now() });
        renderTabContent();
        showStatus('Resume confirmed. Generation is unlocked.', 'success', 4000);
      });
    }

    const jsonArea = document.getElementById('rfJson');
    const copyJsonBtn = document.getElementById('rfCopyJsonBtn');
    if (copyJsonBtn && jsonArea) {
      copyJsonBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(jsonArea.value);
          showStatus('JSON copied.', 'success', 2000);
        } catch {
          showStatus('Copy failed — select the JSON and copy manually.', 'error', 4000);
        }
      });
    }

    const refreshingJsonBtn = document.getElementById('rfRefreshJsonBtn');
    if (refreshingJsonBtn && jsonArea) {
      refreshingJsonBtn.addEventListener('click', () => {
        jsonArea.value = serializeProfile(resumeDraft(resume));
        showStatus('JSON preview refreshed.', 'info', 2000);
      });
    }

    const applyJsonBtn = document.getElementById('rfApplyJsonBtn');
    if (applyJsonBtn && jsonArea) {
      applyJsonBtn.addEventListener('click', () => {
        try {
          const parsed = normalizeResumeProfile(JSON.parse(jsonArea.value));
          resume._draft = parsed;
          renderTabContent();
          showStatus('JSON applied to the form.', 'success', 3000);
        } catch (error) {
          showStatus(`JSON is not valid: ${error.message}`, 'error', 5000);
        }
      });
    }

    if (review) {
      const copy = document.querySelector('[data-rf-review-copy]');
      if (copy) {
        copy.textContent = review.length
          ? 'We rebuilt this from your pasted text. Fix anything above, then confirm to unlock generation.'
          : 'We rebuilt this from your pasted text. Confirm to unlock generation.';
      }
      document.getElementById('rfWarn').classList.add('visible');
    }
    refreshDraftWarnings();
  }

  tabContentArea.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const resume = getActiveResume();
    if (!resume) return;
    const draft = resumeDraft(resume);

    if (target.dataset.rfField) {
      draft[target.dataset.rfField] = target.value;
      if (target.dataset.rfField === 'subtitle') draft.position = target.value;
    } else if (target.dataset.rfCsv) {
      draft[target.dataset.rfCsv] = target.value.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean);
    } else if (target.dataset.rfLines) {
      draft[target.dataset.rfLines] = target.value.split('\n').map((value) => value.trim()).filter(Boolean);
    } else if ('rfLinks' in target.dataset) {
      draft.links = target.value
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((url) => ({
          label: /linkedin/i.test(url) ? 'LinkedIn' : /github/i.test(url) ? 'GitHub' : 'Portfolio',
          text: url.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
          url: /^https?:\/\//i.test(url) ? url : `https://${url}`
        }));
    } else if (target.dataset.rfEntry) {
      const entries = draft[target.dataset.rfEntry];
      const entry = Array.isArray(entries) ? entries[Number(target.dataset.idx)] : null;
      if (entry) entry[target.dataset.key] = target.value;
    } else if (target.dataset.rfPoint) {
      const entries = draft[target.dataset.rfPoint];
      const entry = Array.isArray(entries) ? entries[Number(target.dataset.idx)] : null;
      if (entry && Array.isArray(entry.points)) entry.points[Number(target.dataset.pidx)] = target.value;
    } else {
      return;
    }
    refreshDraftWarnings();
  });

  tabContentArea.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const resume = getActiveResume();
    if (!resume) return;
    const draft = resumeDraft(resume);

    if (button.dataset.rfAdd) {
      const group = button.dataset.rfAdd;
      if (!Array.isArray(draft[group])) draft[group] = [];
      draft[group].push(blankEntry(group));
      renderTabContent();
      return;
    }
    if (button.dataset.rfDel) {
      const group = button.dataset.rfDel;
      const index = Number(button.dataset.idx);
      if (Array.isArray(draft[group])) draft[group].splice(index, 1);
      renderTabContent();
      return;
    }
    if (button.dataset.rfAddpoint) {
      const group = button.dataset.rfAddpoint;
      const entry = Array.isArray(draft[group]) ? draft[group][Number(button.dataset.idx)] : null;
      if (entry) {
        if (!Array.isArray(entry.points)) entry.points = [];
        entry.points.push('');
        renderTabContent();
      }
      return;
    }
    if (button.dataset.rfDelpoint) {
      const group = button.dataset.rfDelpoint;
      const entry = Array.isArray(draft[group]) ? draft[group][Number(button.dataset.idx)] : null;
      if (entry && Array.isArray(entry.points)) {
        entry.points.splice(Number(button.dataset.pidx), 1);
        renderTabContent();
      }
    }
  });



  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  renderTabBar();
  renderTabContent();

  // --- Onboarding spotlight tour ---
  const tourOverlay = document.getElementById('tourOverlay');
  const tourHighlight = document.getElementById('tourHighlight');
  const tourCard = document.getElementById('tourCard');
  const tourStepLabel = document.getElementById('tourStepLabel');
  const tourTitle = document.getElementById('tourTitle');
  const tourBody = document.getElementById('tourBody');
  const tourHint = document.getElementById('tourHint');
  const tourBackBtn = document.getElementById('tourBackBtn');
  const tourNextBtn = document.getElementById('tourNextBtn');
  const tourSkipBtn = document.getElementById('tourSkipBtn');

  const TOUR_STEPS = [
    {
      target: '#accountCard',
      title: 'One account, every device',
      body: 'Create an account to sync resumes and keep the Job Tracker on every device. Free to try until Dec 31, then $4/month (about $1/week) or $47/year.'
    },
    {
      target: '#rfPasteInput',
      title: 'Paste your resume once',
      body: 'Paste your current resume text. The on-device parser turns it into an editable profile — no upload, no API key, nothing leaves this browser.'
    },
    {
      target: '#rfParseBtn',
      title: 'Parse, then correct',
      body: 'Click Parse resume. The parser fills the form below; fix anything it got wrong, then confirm.'
    },
    {
      target: '#coverLetterDetails',
      title: 'One cover letter, every job',
      body: 'Copy the prompt into your favourite assistant, paste the reply here, and every application gets a letter with the company and role filled in.'
    },
    {
      target: '#save',
      title: 'Save Settings',
      body: 'Click Save Settings. Then open the popup on a job posting and generate a tailored resume.'
    }
  ];

  const PROFILE_TOUR_STEPS = [
    {
      target: '#appProfileDetails',
      title: 'Form Filler setup',
      body: 'Answer these once. Fill Form starts from your saved answers on every application, so common questions get filled instantly and correctly.'
    },
    {
      target: '#profileAutofillBtn',
      title: 'Auto-fill from your resume',
      body: 'One click pulls what it can from your resume into the empty boxes. You review and correct before saving.'
    },
    {
      target: '#apFirstName',
      title: 'Your name',
      body: 'First and last name are kept separate, so "First name" and "Last name" boxes on forms each get the right part.'
    },
    {
      target: '#apCity',
      title: 'Where you live',
      body: 'Street, city, postal code and country are reused for address questions. Salary and start date live just below.'
    },
    {
      target: '#apWorkAuthorized',
      title: 'Screening questions',
      body: 'Set Yes/No once for work authorization, sponsorship, relocation and similar questions most application forms ask.'
    },
    {
      target: '#customQaQuestionInput',
      title: 'Anything else',
      body: 'Add custom questions you see often, with your usual answer. They match by question text.'
    },
    {
      target: '#save',
      title: 'Save Settings',
      body: 'Click Save Settings to store your answers. Fill Form is then ready to go.'
    }
  ];



  let tourActive = false;
  let tourStepIndex = 0;
  let tourSteps = TOUR_STEPS;
  let tourMode = 'setup';

  function tourPersistStep() {
    if (tourMode !== 'setup') return;
    const step = tourStepIndex < TOUR_STEPS.length ? tourStepIndex + 1 : null;
    chrome.storage.local.set({ onboarding: { step, dismissed: false } });
  }

  function tourDismiss() {
    tourActive = false;
    tourOverlay.classList.remove('open');
    if (tourMode === 'profile') {
      chrome.storage.local.set({ appProfileOnboarding: { active: false } });
      return;
    }
    chrome.storage.local.set({ onboarding: { step: null, dismissed: true } });
  }

  function positionTourCard(rect) {
    const margin = 14;
    let top;
    if (tourStepIndex >= tourSteps.length || !rect) {
      top = Math.max(margin, (window.innerHeight - tourCard.offsetHeight) / 2);
    } else {
      top = rect.bottom + 14;
      if (top + tourCard.offsetHeight > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - tourCard.offsetHeight - 14);
      }
    }
    const left = Math.max(margin, Math.min(
      (rect ? rect.left + rect.width / 2 : window.innerWidth / 2) - 160,
      window.innerWidth - 320 - margin
    ));
    tourCard.style.top = `${Math.round(top)}px`;
    tourCard.style.left = `${Math.round(left)}px`;
  }

  function renderTourStep() {
    if (tourStepIndex >= tourSteps.length) {
      tourHighlight.style.display = 'none';
      tourStepLabel.textContent = 'Setup complete';
      tourTitle.textContent = tourMode === 'profile' ? 'Form Filler is ready' : "You're all set";
      tourBody.textContent = tourMode === 'profile'
        ? 'Click Save Settings to keep your answers. Fill Form will start from them on every application.'
        : 'Open the PocketResume popup and click Generate PDF Resume.';
      tourHint.style.display = 'none';
      tourBackBtn.style.visibility = 'hidden';
      tourNextBtn.textContent = 'Done';
      positionTourCard(null);
      return;
    }

    const step = tourSteps[tourStepIndex];
    const el = document.querySelector(step.target);
    if (el) el.scrollIntoView({ block: 'center' });
    tourHighlight.style.display = el ? 'block' : 'none';
    tourStepLabel.textContent = `Step ${tourStepIndex + 1} of ${tourSteps.length}`;
    tourTitle.textContent = step.title;
    tourBody.textContent = step.body;
    tourHint.style.display = 'none';
    tourBackBtn.style.visibility = tourStepIndex === 0 ? 'hidden' : 'visible';
    tourNextBtn.textContent = 'Next';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const pad = 6;
        tourHighlight.style.top = `${Math.round(rect.top - pad)}px`;
        tourHighlight.style.left = `${Math.round(rect.left - pad)}px`;
        tourHighlight.style.width = `${Math.round(rect.width + pad * 2)}px`;
        tourHighlight.style.height = `${Math.round(rect.height + pad * 2)}px`;
        positionTourCard(rect);
      });
    });
  }

  function tourOpenAt(index, mode) {
    tourMode = mode === 'profile' ? 'profile' : 'setup';
    tourSteps = tourMode === 'profile' ? PROFILE_TOUR_STEPS : TOUR_STEPS;
    tourActive = true;
    tourStepIndex = Math.max(0, Math.min(index, tourSteps.length));
    tourOverlay.classList.add('open');
    renderTourStep();
  }

  function tourNotifySaved() {
    if (!tourActive || tourMode !== 'setup') return;
    if (tourStepIndex < TOUR_STEPS.length) {
      tourStepIndex = TOUR_STEPS.length;
      renderTourStep();
    }
  }

  tourNextBtn.addEventListener('click', () => {
    if (tourStepIndex >= tourSteps.length) {
      tourDismiss();
      return;
    }
    tourStepIndex += 1;
    tourPersistStep();
    renderTourStep();
  });

  tourBackBtn.addEventListener('click', () => {
    if (tourStepIndex === 0) return;
    tourStepIndex -= 1;
    tourPersistStep();
    renderTourStep();
  });

  tourSkipBtn.addEventListener('click', tourDismiss);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tourActive) tourDismiss();
  });

  if (profileTourBtn) {
    profileTourBtn.addEventListener('click', () => {
      if (appProfileDetails) appProfileDetails.open = true;
      tourOpenAt(0, 'profile');
    });
  }

  function startProfileTourFromTrigger() {
    if (tourActive) return;
    if (appProfileDetails) appProfileDetails.open = true;
    chrome.storage.local.set({ appProfileOnboarding: { active: false } });
    tourOpenAt(0, 'profile');
  }





  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (tourActive) return;
    if (changes.onboarding) {
      const ob = changes.onboarding.newValue;
      if (ob && typeof ob.step === 'number') tourOpenAt(ob.step - 1);
    }
    if (changes.appProfileOnboarding) {
      const pv = changes.appProfileOnboarding.newValue;
      if (pv && pv.active) startProfileTourFromTrigger();
    }
  });

  const obData = await chrome.storage.local.get(['onboarding']);
  if (obData.onboarding && typeof obData.onboarding.step === 'number') {
    tourOpenAt(obData.onboarding.step - 1);
  }

  const profileObData = await chrome.storage.local.get(['appProfileOnboarding']);
  if (profileObData.appProfileOnboarding && profileObData.appProfileOnboarding.active) {
    startProfileTourFromTrigger();
  }



  saveButton.addEventListener('click', async () => {
    saveCurrentTabToState();
    const resume = getActiveResume();
    const warnings = resume ? resumeProfileWarningsFor(resume) : [];
    saveButton.disabled = true;

    try {
      await setLocalStorage(getSettingsPayload());
      universalCoverLetter = readUniversalCoverLetter();
      if (uclStatus) {
        uclStatus.textContent = universalCoverLetter?.body
          ? `Saved ${formatLexiconTimestamp(universalCoverLetter.updatedAt)}.`
          : '';
      }
      updateCoverLetterFallbackPill();
      renderCoverLetterPreview();
      resumes.forEach((entry) => {
        entry._lastSavedContent = entry.content;
      });
      tourNotifySaved();

      if (warnings.length) {
        showStatus(`Settings saved. ${warnings.length} field${warnings.length === 1 ? '' : 's'} still need attention.`, 'info', 5000);
      } else {
        showStatus('Settings saved!', 'success');
      }
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error', 4500);
    } finally {
      saveButton.disabled = false;
    }
  });
});
