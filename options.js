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
  const cloudPricingPanel = document.getElementById('cloudPricingPanel');
  const cloudPricingTable = document.getElementById('cloudPricingTable');
  const cloudPricingFallback = document.getElementById('cloudPricingFallback');
  const cloudClosePricingBtn = document.getElementById('cloudClosePricingBtn');
  const refineModal = document.getElementById('refineModal');
  const refineModalContent = document.getElementById('refineModalContent');
  const refineQuestionsModal = document.getElementById('refineQuestionsModal');
  const refineQuestionsContent = document.getElementById('refineQuestionsContent');
  const atsResultModal = document.getElementById('atsResultModal');
  const atsResultContent = document.getElementById('atsResultContent');
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

  let resumes = [];
  let activeTabIndex = 0;
  let refiningResumeId = null;
  let refineQuestionsState = null;
  let checkingAtsResumeId = null;
  let statusTimeoutId = null;
  let appProfileCustomQa = [];
  let appProfileAutofilling = false;
  let universalCoverLetter = null;
  let skillLexiconMeta = null;

  function generateId() {
    return 'r_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }

  if (window.location.hash === '#cloud-pricing') {
    setTimeout(showCloudPricingPanel, 300);
  }

  async function showCloudPricingPanel() {
    try {
      if (!window.CloudSync || !window.CloudSync.mountPricingTable || !cloudPricingPanel || !cloudPricingTable) {
        showStatus('Pricing is not available in this extension build yet.', 'error', 5000);
        return;
      }
      if (accountCard) accountCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      cloudPricingPanel.style.display = 'block';
      if (cloudPricingFallback) {
        cloudPricingFallback.textContent = '';
        cloudPricingFallback.style.display = 'none';
      }
      cloudPricingTable.innerHTML = '';
      await window.CloudSync.mountPricingTable(cloudPricingTable);
    } catch (error) {
      if (cloudPricingFallback) {
        cloudPricingFallback.textContent = `Could not load the Pro pricing table. Details: ${error.message} If it keeps failing, check the Settings page console (F12), then confirm Billing is enabled in Clerk with at least one public user plan.`;
        cloudPricingFallback.style.display = 'block';
      }
      showStatus('Could not load pricing. Check the message in the Pro panel.', 'error', 7000);
    }
  }
  if (cloudClosePricingBtn) {
    cloudClosePricingBtn.addEventListener('click', () => {
      if (window.CloudSync && window.CloudSync.unmountPricingTable && cloudPricingTable) {
        window.CloudSync.unmountPricingTable(cloudPricingTable);
      }
      if (cloudPricingTable) cloudPricingTable.innerHTML = '';
      if (cloudPricingPanel) cloudPricingPanel.style.display = 'none';
    });
  }

  function createResumeEntry(label, content) {
    return {
      id: generateId(),
      label: label || 'Resume 1',
      content: content || '',
      jsonContent: '',
      legacyContent: '',
      parseReview: null,
      parseConfirmedAt: 0,
      lastRefineBackup: '',
      lastRefineAppliedAt: '',
      refineAnswers: [],
      updatedAt: Date.now(),
      _lastSavedContent: content || '',
      pendingRefine: null
    };
  }

  function normalizeRefineAnswersList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const question = typeof item.question === 'string' ? item.question.trim() : '';
        if (!question) return null;
        const answer = typeof item.answer === 'string' ? item.answer.trim() : '';
        return {
          question,
          answer,
          skipped: item.skipped === true || !answer,
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ''
        };
      })
      .filter(Boolean)
      .slice(0, 10);
  }

  function normalizeResumeEntry(resume, index) {
    const content = typeof resume?.content === 'string' ? resume.content : '';
    const lastRefineAppliedAt = typeof resume?.lastRefineAppliedAt === 'string' ? resume.lastRefineAppliedAt : '';
    const explicitUpdatedAt = Number(resume?.updatedAt);
    const updatedAt = Number.isFinite(explicitUpdatedAt) && explicitUpdatedAt > 0
      ? explicitUpdatedAt
      : (Date.parse(lastRefineAppliedAt) || 0);
    return {
      id: typeof resume?.id === 'string' && resume.id.trim() ? resume.id : generateId(),
      label: typeof resume?.label === 'string' && resume.label.trim() ? resume.label : `Resume ${index + 1}`,
      content,
      jsonContent: typeof resume?.jsonContent === 'string' ? resume.jsonContent : '',
      legacyContent: typeof resume?.legacyContent === 'string' ? resume.legacyContent : '',
      parseReview: resume?.parseReview && Array.isArray(resume.parseReview.warnings)
        ? { warnings: resume.parseReview.warnings.filter((item) => typeof item === 'string'), parsedAt: Number(resume.parseReview.parsedAt) || 0 }
        : null,
      parseConfirmedAt: Number(resume?.parseConfirmedAt) || 0,
      lastRefineBackup: typeof resume?.lastRefineBackup === 'string' ? resume.lastRefineBackup : '',
      lastRefineAppliedAt,
      refineAnswers: normalizeRefineAnswersList(resume?.refineAnswers),
      updatedAt,
      _lastSavedContent: content,
      pendingRefine: null
    };
  }

  function serializeResumeEntry(resume) {
    return {
      id: resume.id,
      label: resume.label,
      content: resume.content,
      jsonContent: resume.jsonContent || '',
      legacyContent: resume.legacyContent || '',
      parseReview: resume.parseReview || null,
      parseConfirmedAt: Number(resume.parseConfirmedAt) || 0,
      lastRefineBackup: resume.lastRefineBackup || '',
      lastRefineAppliedAt: resume.lastRefineAppliedAt || '',
      refineAnswers: normalizeRefineAnswersList(resume.refineAnswers),
      updatedAt: Number(resume.updatedAt) || 0
    };
  }

  function getPersistedResumes() {
    return resumes.map(serializeResumeEntry);
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
    if (allowUnverifiedSkillsToggle) allowUnverifiedSkillsToggle.checked = data.allowUnverifiedSkills === true;
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
    if (accountOfferBadge) accountOfferBadge.style.display = promo ? 'inline-block' : 'none';
    if (accountOfferTitle) {
      accountOfferTitle.textContent = promo ? 'Everything free until Dec 31' : 'Keep your resumes in sync';
    }
    if (accountOfferSub) {
      accountOfferSub.textContent = promo
        ? 'Create a free account — no card required. The resume engine, cover letters, and Job Tracker are all unlocked during the free period.'
        : 'Create a free account to sync across devices, or upgrade any time to keep generating after Dec 31.';
    }
    if (accountFeatureList) {
      const items = promo
        ? [
            ['Resume engine', 'tailored PDFs, no API key'],
            ['Cover letters', 'one template, every job'],
            ['Job Tracker', 'pipeline board + analytics'],
          ]
        : [
            ['Cloud sync', 'resumes on every device'],
            ['Job Tracker', 'pipeline board + analytics'],
            ['Resume engine', 'tailored PDFs, no API key'],
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
        if (canSync && access.isPro) {
          cloudAuthStatus.textContent = 'Pro active';
          cloudAuthStatus.className = 'cloud-status-pill synced';
        } else if (access.withinWindow || access.proAccess) {
          cloudAuthStatus.textContent = 'Free until Dec 31';
          cloudAuthStatus.className = 'cloud-status-pill synced';
        } else if (canSync) {
          cloudAuthStatus.textContent = 'Free plan';
          cloudAuthStatus.className = 'cloud-status-pill';
        } else {
          cloudAuthStatus.textContent = 'Free account required';
          cloudAuthStatus.className = 'cloud-status-pill error';
        }
        if (cloudManagePlanBtn) cloudManagePlanBtn.textContent = access.isPro ? 'Manage plan' : 'Upgrade to Pro';
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

  function mergeRefineAnswers(resume, draftAnswers) {
    const existing = normalizeRefineAnswersList(resume.refineAnswers);
    const incoming = (Array.isArray(draftAnswers) ? draftAnswers : [])
      .map((item) => {
        if (!item || typeof item.question !== 'string' || !item.question.trim()) return null;
        const answer = typeof item.answer === 'string' ? item.answer.trim() : '';
        return {
          question: item.question.trim(),
          answer,
          skipped: item.skipped === true || !answer,
          updatedAt: new Date().toISOString()
        };
      })
      .filter(Boolean);
    const merged = [...incoming];
    existing.forEach((entry) => {
      if (!merged.some((m) => m.question === entry.question)) {
        merged.push(entry);
      }
    });
    resume.refineAnswers = merged.slice(0, 10);
  }

  function applyPendingRefineDraft(resume) {
    if (!resume?.pendingRefine) {
      return { applied: false, stale: false };
    }
    if (resume.content !== resume.pendingRefine.source) {
      resume.pendingRefine = null;
      return { applied: false, stale: true };
    }
    resume.lastRefineBackup = resume.content;
    resume.lastRefineAppliedAt = new Date().toISOString();
    resume.updatedAt = Date.now();
    resume.content = resume.pendingRefine.refinedText;
    mergeRefineAnswers(resume, resume.pendingRefine.answers);
    resume.pendingRefine = null;
    return { applied: true, stale: false };
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
    'pendingExtract', 'openCoverLetterSection', 'allowUnverifiedSkills'
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

  function showRefineModal(resume) {
    if (!resume?.pendingRefine) return;

    const sourceChanged = resume.pendingRefine.source !== resume.content;
    const warnings = Array.isArray(resume.pendingRefine.warnings) ? resume.pendingRefine.warnings : [];
    const changeSummary = Array.isArray(resume.pendingRefine.changeSummary) ? resume.pendingRefine.changeSummary : [];
    const aiFilled = Array.isArray(resume.pendingRefine.aiFilled) ? resume.pendingRefine.aiFilled : [];
    const atsData = resume.pendingRefine.ats || null;
    const atsBefore = atsData ? atsData.before : null;
    const atsAfter = atsData ? atsData.after : null;
    const hasAtsScores = typeof atsBefore === 'number' && typeof atsAfter === 'number';
    const issues = atsData && Array.isArray(atsData.criticalIssues) ? atsData.criticalIssues : [];
    const bulletIssues = atsData && Array.isArray(atsData.bulletIssues) ? atsData.bulletIssues : [];

    function renderListCard(title, items) {
      if (!items.length) return '';
      return `
        <div class="review-card">
          <h4>${title}</h4>
          <ul>
            ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    refineModalContent.innerHTML = `
      <h3>Review refined resume</h3>
      <p class="review-note${sourceChanged ? ' warning' : ''}">
        ${sourceChanged
          ? 'The source text changed after this draft was generated. Run Refine Resume again before applying it.'
          : 'Apply this draft to replace the current resume text. Undo will stay available after you apply it.'}
      </p>
      <div class="review-meta-grid">
        ${renderListCard('Change summary', changeSummary)}
        ${renderListCard('AI filled in (questions you skipped — please double-check)', aiFilled)}
        ${renderListCard('Warnings', warnings)}
      </div>
      ${hasAtsScores ? `
      <div class="ats-hero">
        ${buildAtsGaugeMarkup(atsAfter)}
        <div class="ats-hero-text">
          <h4>ATS readiness</h4>
          <p>Where an automated ATS parser stands on the refinement: score of your current resume vs the proposed version below.</p>
          <div class="ats-score-summary ${getAtsSummaryClass(atsAfter)}">Before ${atsBefore} &rarr; After ${atsAfter}</div>
        </div>
      </div>
      ${renderAtsIssuesCard(issues)}
      ${renderBulletIssuesCard(bulletIssues)}` : ''}
      <div class="review-preview-grid">
        <div class="review-preview-column">
          <label>Current resume</label>
          <textarea class="review-preview-textarea" readonly>${escapeHtml(resume.pendingRefine.source)}</textarea>
        </div>
        <div class="review-preview-column">
          <label>Proposed refined version</label>
          <textarea class="review-preview-textarea" readonly>${escapeHtml(resume.pendingRefine.refinedText)}</textarea>
        </div>
      </div>
      <div class="review-actions">
        <button type="button" class="success-btn" id="applyRefineBtn" ${sourceChanged ? 'disabled' : ''}>Apply Refined Resume</button>
        <button type="button" class="ghost-btn" id="cancelRefineBtn">Cancel</button>
      </div>
    `;

    refineModal.style.display = 'flex';

    if (hasAtsScores) {
      animateAtsGauge(refineModalContent, atsBefore, atsAfter, 1400);
    }
    wireAtsFixToggles();

    document.getElementById('applyRefineBtn').addEventListener('click', () => {
      closeRefineModal();
      handleApplyRefine();
    });

    document.getElementById('cancelRefineBtn').addEventListener('click', () => {
      closeRefineModal();
      handleCancelRefine();
    });
  }

  function closeRefineModal() {
    refineModal.style.display = 'none';
    refineModalContent.innerHTML = '';
  }

  refineModal.addEventListener('click', (e) => {
    if (e.target === refineModal) {
      closeRefineModal();
      handleCancelRefine();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && refineModal.style.display === 'flex') {
      closeRefineModal();
      handleCancelRefine();
    }
  });

  function renderTabBar() {
    tabBar.innerHTML = '';

    resumes.forEach((resume, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-btn' + (index === activeTabIndex ? ' active' : '');
      btn.textContent = resume.label || `Resume ${index + 1}`;
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
    const draft = resumeDraft(resume);
    const review = resume.parseReview
      ? (Array.isArray(resume.parseReview.warnings) ? resume.parseReview.warnings : [])
      : null;
    const linksValue = (draft.links || []).map((link) => link.url || link.text || '').filter(Boolean).join('\n');

    const labelRow = `
      <div class="resume-label-row">
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

    const labelInput = document.getElementById('resumeLabelInput');
    if (labelInput) {
      labelInput.addEventListener('input', () => {
        const tabBtns = tabBar.querySelectorAll('.tab-btn');
        if (tabBtns[activeTabIndex]) {
          tabBtns[activeTabIndex].textContent = labelInput.value.trim() || `Resume ${activeTabIndex + 1}`;
        }
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

  function handleCancelRefine() {
    const resume = getActiveResume();
    if (!resume?.pendingRefine) return;
    resume.pendingRefine = null;
    renderTabContent();
    showStatus('Refinement draft discarded.', 'info');
  }

  function handleApplyRefine() {
    saveCurrentTabToState();
    const resume = getActiveResume();
    if (!resume?.pendingRefine) return;
    const result = applyPendingRefineDraft(resume);
    renderTabBar();
    renderTabContent();
    if (result.stale) {
      showStatus('Resume text changed after the draft was created. Please refine again.', 'error', 4500);
      return;
    }
    showStatus('Refined resume applied. Click Save Settings to persist or Undo to restore the original.', 'success', 5000);
  }

  function handleUndoRefine() {
    saveCurrentTabToState();
    const resume = getActiveResume();
    if (!resume?.lastRefineBackup) return;
    if (!confirm('Undo will replace the current resume text with the pre-refine version. Continue?')) return;
    resume.pendingRefine = null;
    resume.content = resume.lastRefineBackup;
    resume.lastRefineBackup = '';
    resume.lastRefineAppliedAt = '';
    resume.updatedAt = Date.now();
    renderTabBar();
    renderTabContent();
    showStatus('Original resume restored. Click Save Settings to persist.', 'info', 4500);
  }

  async function handleRefineResume() {
    saveCurrentTabToState();
    const resume = getActiveResume();
    if (!resume) return;
    if (!resume.content.trim()) {
      showStatus('Add some resume content before refining it.', 'error', 3500);
      return;
    }

    refiningResumeId = resume.id;
    renderTabContent();
    showStatus('Reading your resume to see if any questions are missing…', 'loading', 0);

    let freshQuestions = [];
    try {
      const questionsResponse = await sendRuntimeMessage({
        type: 'GET_REFINE_QUESTIONS',
        payload: { resumeId: resume.id, sourceText: resume.content }
      });
      if (questionsResponse?.status === 'success' && Array.isArray(questionsResponse.data?.questions)) {
        freshQuestions = questionsResponse.data.questions;
      }
    } catch (error) {
      showStatus('Could not check for open questions — refining without them.', 'info', 3500);
    }

    refineQuestionsState = null;
    if (freshQuestions.length && refineQuestionsModal) {
      refineQuestionsState = buildRefineQuestionsState(resume, freshQuestions);
      showRefineQuestionsModal();
      renderTabContent();
      refiningResumeId = null;
      showStatus('A few questions before refining. Answer them or let the AI fill in.', 'info', 6000);
      return;
    }

    showStatus('Refining resume into a reusable cross-style master version…', 'loading', 0);
    await runRefineGeneration(resume);
  }

  function buildRefineQuestionsState(resume, questions) {
    const items = questions.slice(0, 5).map((q) => {
      const stored = (resume.refineAnswers || []).find((a) => normalizeQuestionText(a.question) === normalizeQuestionText(q.question));
      return {
        id: q.id,
        question: q.question,
        why: q.why || '',
        value: stored && !stored.skipped ? stored.answer : '',
        skipped: stored ? stored.skipped : false,
        reused: !!(stored && !stored.skipped)
      };
    });
    return { resumeId: resume.id, items, index: 0 };
  }

  function normalizeQuestionText(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function getRefineQuestionPrimaryLabel(item, state) {
    if (!item.value.trim()) return 'Skip, let AI fill it';
    return state.index >= state.items.length - 1 ? 'Refine Resume' : 'Next';
  }

  function showRefineQuestionsModal() {
    const state = refineQuestionsState;
    if (!state) return;
    const item = state.items[state.index];
    if (!item) return;

    refineQuestionsContent.innerHTML = `
      <h3>Before refining</h3>
      <p class="review-note">The AI needs a bit of context to write a stronger resume. Answer below, or skip and let the AI fill it in conservatively.</p>
      <div class="review-card refine-question-card">
        <h4>Question ${state.index + 1} of ${state.items.length}${item.reused ? ' (from last time)' : ''}</h4>
        <p class="refine-question-text">${escapeHtml(item.question)}</p>
        ${item.why ? `<p class="review-note refine-question-why">${escapeHtml(item.why)}</p>` : ''}
        <label>Your answer${item.skipped && !item.value ? ' (optional — skipped for now)' : ''}</label>
        <textarea class="review-preview-textarea refine-question-input" id="refineQuestionInput" placeholder="Type your answer, or leave empty and skip">${escapeHtml(item.value || '')}</textarea>
      </div>
      <div class="review-actions refine-question-actions">
        <button type="button" class="secondary-action-btn" id="refineQuestionNextBtn">${getRefineQuestionPrimaryLabel(item, state)}</button>
        ${state.index > 0 ? '<button type="button" class="ghost-btn" id="refineQuestionBackBtn">Back</button>' : ''}
        <button type="button" class="ghost-btn" id="refineQuestionCancelBtn">Cancel</button>
      </div>
    `;

    refineQuestionsModal.style.display = 'flex';

    const input = document.getElementById('refineQuestionInput');
    const nextBtn = document.getElementById('refineQuestionNextBtn');
    input.addEventListener('input', () => {
      item.value = input.value;
      item.skipped = false;
      nextBtn.textContent = getRefineQuestionPrimaryLabel(item, state);
    });
    input.focus();

    nextBtn.addEventListener('click', handleRefineQuestionNext);
    const backBtn = document.getElementById('refineQuestionBackBtn');
    if (backBtn) backBtn.addEventListener('click', () => {
      item.value = input.value;
      state.index = Math.max(0, state.index - 1);
      showRefineQuestionsModal();
    });
    document.getElementById('refineQuestionCancelBtn').addEventListener('click', handleRefineQuestionsCancel);
  }

  function handleRefineQuestionNext() {
    const state = refineQuestionsState;
    if (!state) return;
    const item = state.items[state.index];
    if (!item.value.trim()) {
      item.value = '';
      item.skipped = true;
    } else {
      item.skipped = false;
    }

    if (state.index < state.items.length - 1) {
      state.index += 1;
      showRefineQuestionsModal();
      return;
    }
    handleRefineQuestionFinish();
  }

  async function handleRefineQuestionFinish() {
    const state = refineQuestionsState;
    if (!state) return;
    const item = state.items[state.index];
    if (item && !item.value.trim() && !item.skipped) item.skipped = true;

    const resume = resumes.find((r) => r.id === state.resumeId) || getActiveResume();
    const answers = state.items.map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.skipped ? '' : q.value.trim(),
      skipped: q.skipped
    }));

    closeRefineQuestionsModal();
    refineQuestionsState = null;
    if (!resume) {
      renderTabContent();
      return;
    }
    showStatus('Refining resume into a reusable cross-style master version…', 'loading', 0);
    await runRefineGeneration(resume, answers);
  }

  function handleRefineQuestionsCancel() {
    closeRefineQuestionsModal();
    refineQuestionsState = null;
    showStatus('Refinement questions closed. Resume unchanged.', 'info');
  }

  function closeRefineQuestionsModal() {
    refineQuestionsModal.style.display = 'none';
    refineQuestionsContent.innerHTML = '';
  }

  refineQuestionsModal.addEventListener('click', (e) => {
    if (e.target === refineQuestionsModal && !!refineQuestionsState) {
      handleRefineQuestionsCancel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && refineQuestionsModal.style.display === 'flex' && !!refineQuestionsState) {
      handleRefineQuestionsCancel();
    }
  });

  // --- ATS rendering helpers (shared by refine review + Check ATS) ---
  const ATS_GAUGE_RADIUS = 40;
  const ATS_GAUGE_CIRC = 2 * Math.PI * ATS_GAUGE_RADIUS;

  function getAtsColorClass(score) {
    if (score === null || score === undefined) return '';
    if (score >= 80) return 'ats-green';
    if (score >= 60) return 'ats-amber';
    return 'ats-red';
  }

  function getAtsSummaryClass(score) {
    if (score === null || score === undefined) return '';
    if (score >= 80) return 'ats-summary-green';
    if (score >= 60) return 'ats-summary-amber';
    return 'ats-summary-red';
  }

  function getAtsScorePhrase(score) {
    if (score === null || score === undefined) return 'Not scored';
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Strong';
    if (score >= 60) return 'Needs work';
    return 'Poor';
  }

  function buildAtsGaugeMarkup(score) {
    const cls = getAtsColorClass(score);
    return `
      <div class="ats-gauge-wrap">
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <circle class="ats-gauge-track" cx="46" cy="46" r="${ATS_GAUGE_RADIUS}"></circle>
          <circle class="ats-gauge-value ${cls}" cx="46" cy="46" r="${ATS_GAUGE_RADIUS}"
                  stroke-dasharray="${ATS_GAUGE_CIRC.toFixed(1)}" stroke-dashoffset="${ATS_GAUGE_CIRC.toFixed(1)}"></circle>
        </svg>
        <div class="ats-gauge-number">0</div>
      </div>
    `;
  }

  function animateAtsGauge(container, fromScore, toScore, duration = 1200) {
    const circle = container.querySelector('.ats-gauge-value');
    const numberEl = container.querySelector('.ats-gauge-number');
    if (!circle || !numberEl) return;
    const startVal = Number.isFinite(fromScore) ? fromScore : 0;
    const target = Number.isFinite(toScore) ? toScore : 0;
    let start = null;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const frame = (ts) => {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const value = startVal + (target - startVal) * easeOut(t);
      numberEl.textContent = Math.round(value);
      circle.style.strokeDashoffset = `${(ATS_GAUGE_CIRC * (1 - value / 100)).toFixed(1)}`;
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function renderAtsIssueRow(item, index, key = 'ats') {
    const showStage = item.stage === 'after' || item.stage === 'both';
    const fixHtml = item.suggestedFix
      ? `<button type="button" class="ghost-btn ats-fix-toggle" data-${key}-issue-index="${index}">Fix</button>`
      : '';
    return `
      <div class="ats-issue-row">
        <div class="ats-issue-head">
          ${showStage ? `<span class="ats-issue-stage ats-stage-${item.stage === 'both' ? 'after' : item.stage}">${item.stage}</span>` : ''}
          <div class="ats-issue-body">
            <strong>${escapeHtml(item.issue)}</strong>
            ${item.whyFlagged ? `<span>${escapeHtml(item.whyFlagged)}</span>` : ''}
          </div>
          ${fixHtml}
        </div>
        ${item.suggestedFix ? `<div class="ats-fix-reveal" data-${key}-issue-reveal="${index}" style="display: none;"><em>AI suggested fix</em>${escapeHtml(item.suggestedFix)}</div>` : ''}
        ${item.userMustFix ? `<div class="ats-user-fix"><em>You'll need to</em>${escapeHtml(item.userMustFix)}</div>` : ''}
      </div>
    `;
  }

  function renderAtsIssuesCard(items) {
    if (!Array.isArray(items) || !items.length) {
      return '<div class="ats-issues-none">No critical ATS issues found — an automated parser should read this cleanly.</div>';
    }
    return `
      <div class="ats-issues">
        <h4>Critical ATS issues</h4>
        ${items.map((item, index) => renderAtsIssueRow(item, index, 'ats')).join('')}
      </div>
    `;
  }

  function renderBulletIssuesCard(items) {
    if (!Array.isArray(items) || !items.length) return '';
    return `
      <div class="ats-issues">
        <h4>Bullet quality (does not affect the score)</h4>
        ${items.map((item, index) => renderAtsIssueRow(item, index, 'bullet')).join('')}
      </div>
    `;
  }

  function wireAtsFixToggles() {
    document.querySelectorAll('.ats-fix-toggle').forEach((btn) => {
      const rawKey = (btn.getAttributeNames() || []).find((name) => name.startsWith('data-') && name.endsWith('-issue-index'));
      if (!rawKey) return;
      const key = rawKey.slice('data-'.length, -'-issue-index'.length);
      const index = btn.getAttribute(rawKey);
      const reveal = document.querySelector(`[data-${key}-issue-reveal="${index}"]`);
      if (!reveal) return;
      btn.addEventListener('click', () => {
        const open = reveal.style.display === 'block';
        reveal.style.display = open ? 'none' : 'block';
        btn.textContent = open ? 'Fix' : 'Hide fix';
      });
    });
  }

  function showAtsResultModal(data) {
    const score = typeof data?.score === 'number' ? data.score : 0;
    const issues = Array.isArray(data?.criticalIssues) ? data.criticalIssues : [];
    const bulletIssues = Array.isArray(data?.bulletIssues) ? data.bulletIssues : [];
    const cls = getAtsColorClass(score);

    atsResultContent.innerHTML = `
      <h3>ATS check</h3>
      <div class="ats-hero">
        ${buildAtsGaugeMarkup(score)}
        <div class="ats-hero-text">
          <h4>${getAtsScorePhrase(score)} parse readiness</h4>
          <p>How cleanly an automated ATS parser can read this resume.</p>
          <div class="ats-score-summary ${getAtsSummaryClass(score)}">${score}/100</div>
        </div>
      </div>
      ${renderAtsIssuesCard(issues)}
      ${renderBulletIssuesCard(bulletIssues)}
      <div class="review-actions refine-question-actions">
        <button type="button" class="ghost-btn" id="atsCloseBtn">Close</button>
      </div>
    `;

    atsResultModal.style.display = 'flex';
    wireAtsFixToggles();
    document.getElementById('atsCloseBtn').addEventListener('click', closeAtsResultModal);
    animateAtsGauge(atsResultContent, 0, score);
  }

  function closeAtsResultModal() {
    atsResultModal.style.display = 'none';
    atsResultContent.innerHTML = '';
  }

  atsResultModal.addEventListener('click', (e) => {
    if (e.target === atsResultModal) closeAtsResultModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && atsResultModal.style.display === 'flex') closeAtsResultModal();
  });

  async function handleCheckAts() {
    saveCurrentTabToState();
    const resume = getActiveResume();
    if (!resume) return;
    if (!resume.content.trim()) {
      showStatus('Add some resume content before checking the ATS score.', 'error', 3500);
      return;
    }

    checkingAtsResumeId = resume.id;
    renderTabContent();
    showStatus('Scanning your resume the way an ATS would\u2026', 'loading', 0);

    try {
      const response = await sendRuntimeMessage({
        type: 'CHECK_ATS',
        payload: { resumeId: resume.id, sourceText: resume.content }
      });
      if (!response || response.status !== 'success' || !response.data) {
        throw new Error(response?.message || 'Unknown ATS check error');
      }
      showAtsResultModal(response.data);
      showStatus('ATS check complete.', 'success', 4000);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error', 4500);
    } finally {
      checkingAtsResumeId = null;
      renderTabContent();
    }
  }

  async function runRefineGeneration(resume, answers = []) {
    if (!resume) {
      refiningResumeId = null;
      renderTabContent();
      return;
    }
    try {
      const response = await sendRuntimeMessage({
        type: 'REFINE_RESUME',
        payload: {
          resumeId: resume.id,
          sourceText: resume.content,
          answers
        }
      });

      if (!response || response.status !== 'success' || !response.data) {
        renderTabContent();
        showStatus(`Error: ${response?.message || 'Unknown refinement error'}`, 'error', 4500);
        return;
      }

      resume.pendingRefine = {
        source: resume.content,
        refinedText: response.data.refinedText || '',
        warnings: Array.isArray(response.data.warnings) ? response.data.warnings : [],
        changeSummary: Array.isArray(response.data.changeSummary) ? response.data.changeSummary : [],
        aiFilled: Array.isArray(response.data.aiFilled) ? response.data.aiFilled : [],
        ats: response.data.ats && typeof response.data.ats === 'object' ? response.data.ats : null,
        answers
      };

      renderTabContent();
      showRefineModal(resume);
      showStatus('Review the refined draft in the dialog.', 'success', 5000);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error', 4500);
    } finally {
      refiningResumeId = null;
      renderTabContent();
    }
  }

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
      body: 'Create a free account to sync resumes and keep the Job Tracker on every device. Everything is free until Dec 31.'
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

  const NUDGE_TOUR_STEPS = [
    {
      target: '#refineResumeBtn',
      title: 'Refine again in 8.1',
      body: 'Refine Resume now asks a few questions first — like what problem the company had before you joined. Answer them (answers are remembered) or let the AI fill in conservatively. Click the button to try it.'
    }
  ];

  const ATS_NUDGE_TOUR_STEPS = [
    {
      target: '#checkAtsBtn',
      title: 'New: Check ATS',
      body: 'One click scores your resume the way an automated parser reads it — with an animated gauge and concrete fixes for every critical issue. Click the button to scan your resume now.'
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
    if (tourMode === 'nudge') {
      chrome.storage.local.set({ refineNudge: { active: false } });
      return;
    }
    if (tourMode === 'atsnudge') {
      chrome.storage.local.set({ atsNudge: { active: false } });
      return;
    }
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
      tourStepLabel.textContent = tourMode === 'nudge' ? 'All set' : 'Setup complete';
      tourTitle.textContent = tourMode === 'nudge'
        ? 'Ready when you are'
        : tourMode === 'profile' ? 'Form Filler is ready' : "You're all set";
      tourBody.textContent = tourMode === 'nudge'
        ? 'Your answers are remembered for next time. Click Refine Resume whenever you want to refresh your master resume.'
        : tourMode === 'profile'
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
    tourMode = mode === 'profile' ? 'profile' : mode === 'nudge' ? 'nudge' : mode === 'atsnudge' ? 'atsnudge' : 'setup';
    tourSteps = tourMode === 'profile'
      ? PROFILE_TOUR_STEPS
      : tourMode === 'nudge'
        ? NUDGE_TOUR_STEPS
        : tourMode === 'atsnudge'
          ? ATS_NUDGE_TOUR_STEPS
          : TOUR_STEPS;
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

  function startRefineNudgeFromTrigger() {
    if (tourActive) return;
    chrome.storage.local.set({ refineNudge: { active: false } });
    tourOpenAt(0, 'nudge');
  }

  function startAtsNudgeFromTrigger() {
    if (tourActive) return;
    chrome.storage.local.set({ atsNudge: { active: false } });
    tourOpenAt(0, 'atsnudge');
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
    if (changes.refineNudge) {
      const nv = changes.refineNudge.newValue;
      if (nv && nv.active) startRefineNudgeFromTrigger();
    }
    if (changes.atsNudge) {
      const av = changes.atsNudge.newValue;
      if (av && av.active) startAtsNudgeFromTrigger();
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

  const nudgeData = await chrome.storage.local.get(['refineNudge']);
  if (nudgeData.refineNudge && nudgeData.refineNudge.active) {
    startRefineNudgeFromTrigger();
  }

  const atsNudgeData = await chrome.storage.local.get(['atsNudge']);
  if (atsNudgeData.atsNudge && atsNudgeData.atsNudge.active) {
    startAtsNudgeFromTrigger();
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
