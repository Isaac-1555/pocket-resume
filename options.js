// options.js
document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyButton = document.getElementById('toggleApiKey');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');
  const tabBar = document.getElementById('tabBar');
  const tabContentArea = document.getElementById('tabContentArea');

  let resumes = [];
  let activeTabIndex = 0;
  let refiningResumeId = null;
  let statusTimeoutId = null;

  function generateId() {
    return 'r_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }

  function createResumeEntry(label, content) {
    return {
      id: generateId(),
      label: label || 'Resume 1',
      content: content || '',
      lastRefineBackup: '',
      lastRefineAppliedAt: '',
      pendingRefine: null
    };
  }

  function normalizeResumeEntry(resume, index) {
    return {
      id: typeof resume?.id === 'string' && resume.id.trim() ? resume.id : generateId(),
      label: typeof resume?.label === 'string' && resume.label.trim() ? resume.label : `Resume ${index + 1}`,
      content: typeof resume?.content === 'string' ? resume.content : '',
      lastRefineBackup: typeof resume?.lastRefineBackup === 'string' ? resume.lastRefineBackup : '',
      lastRefineAppliedAt: typeof resume?.lastRefineAppliedAt === 'string' ? resume.lastRefineAppliedAt : '',
      pendingRefine: null
    };
  }

  function serializeResumeEntry(resume) {
    return {
      id: resume.id,
      label: resume.label,
      content: resume.content,
      lastRefineBackup: resume.lastRefineBackup || '',
      lastRefineAppliedAt: resume.lastRefineAppliedAt || ''
    };
  }

  function getPersistedResumes() {
    return resumes.map(serializeResumeEntry);
  }

  function getActiveResume() {
    return resumes[activeTabIndex] || null;
  }

  function showStatus(text, type = 'success', autoHideMs = 2500) {
    if (statusTimeoutId) {
      clearTimeout(statusTimeoutId);
      statusTimeoutId = null;
    }

    statusDiv.textContent = text;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    if (autoHideMs > 0) {
      statusTimeoutId = setTimeout(() => {
        statusDiv.style.display = 'none';
        statusTimeoutId = null;
      }, autoHideMs);
    }
  }

  toggleApiKeyButton.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyButton.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyButton.textContent = 'Show';
    }
  });

  const data = await chrome.storage.local.get(['geminiApiKey', 'userProfile', 'resumes']);

  if (data.geminiApiKey) apiKeyInput.value = data.geminiApiKey;

  if (data.resumes && data.resumes.length > 0) {
    resumes = data.resumes.map((resume, index) => normalizeResumeEntry(resume, index));
  } else if (data.userProfile) {
    resumes = [createResumeEntry('Resume 1', data.userProfile)];
    await chrome.storage.local.set({ resumes: getPersistedResumes() });
    await chrome.storage.local.remove('userProfile');
  } else {
    resumes = [createResumeEntry('Resume 1', '')];
  }

  if (!resumes.length) {
    resumes = [createResumeEntry('Resume 1', '')];
  }

  function saveCurrentTabToState() {
    const labelInput = document.getElementById('resumeLabelInput');
    const contentTextarea = document.getElementById('resumeContentTextarea');
    const resume = getActiveResume();

    if (labelInput && contentTextarea && resume) {
      resume.label = labelInput.value.trim() || `Resume ${activeTabIndex + 1}`;
      resume.content = contentTextarea.value;
    }
  }

  function renderReviewPanel(resume) {
    if (!resume.pendingRefine) return '';

    const sourceChanged = resume.pendingRefine.source !== resume.content;
    const warnings = Array.isArray(resume.pendingRefine.warnings) ? resume.pendingRefine.warnings : [];
    const changeSummary = Array.isArray(resume.pendingRefine.changeSummary) ? resume.pendingRefine.changeSummary : [];

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

    return `
      <div class="review-panel">
        <h3>Review refined resume</h3>
        <p class="review-note${sourceChanged ? ' warning' : ''}">
          ${sourceChanged
            ? 'The source text changed after this draft was generated. Run Refine Resume again before applying it.'
            : 'Apply this draft to replace the current resume text. Undo will stay available after you apply it.'}
        </p>
        <div class="review-meta-grid">
          ${renderListCard('Change summary', changeSummary)}
          ${renderListCard('Warnings', warnings)}
        </div>
        <div class="review-preview-grid">
          <div class="review-preview-column">
            <label for="reviewCurrentResume">Current resume</label>
            <textarea id="reviewCurrentResume" class="review-preview-textarea" readonly>${escapeHtml(resume.pendingRefine.source)}</textarea>
          </div>
          <div class="review-preview-column">
            <label for="reviewProposedResume">Proposed refined version</label>
            <textarea id="reviewProposedResume" class="review-preview-textarea" readonly>${escapeHtml(resume.pendingRefine.refinedText)}</textarea>
          </div>
        </div>
        <div class="review-actions">
          <button type="button" id="applyRefineBtn" ${sourceChanged ? 'disabled' : ''}>Apply Refined Resume</button>
          <button type="button" class="ghost-btn" id="cancelRefineBtn">Cancel</button>
        </div>
      </div>
    `;
  }

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
      addBtn.addEventListener('click', () => {
        saveCurrentTabToState();
        resumes.push(createResumeEntry(`Resume ${resumes.length + 1}`, ''));
        activeTabIndex = resumes.length - 1;
        renderTabBar();
        renderTabContent();
      });
      tabBar.appendChild(addBtn);
    }
  }

  function renderTabContent() {
    const resume = getActiveResume();
    if (!resume) return;

    const isRefining = refiningResumeId === resume.id;

    tabContentArea.innerHTML = `
      <div class="resume-label-row">
        <input type="text" id="resumeLabelInput" class="resume-label-input"
               placeholder="Label (e.g. Project Manager)" value="${escapeAttr(resume.label)}" maxlength="40">
        ${resumes.length > 1 ? '<button type="button" class="delete-tab-btn" id="deleteTabBtn">Delete</button>' : ''}
      </div>
      <textarea id="resumeContentTextarea"
                placeholder="Paste your resume content for this profile here. The AI will use this to generate tailored resumes.">${escapeHtml(resume.content)}</textarea>
      <div class="resume-actions">
        <button type="button" class="secondary-action-btn" id="refineResumeBtn" ${isRefining ? 'disabled' : ''}>${isRefining ? 'Refining' : 'Refine Resume'}</button>
        ${resume.lastRefineBackup ? '<button type="button" class="ghost-btn" id="undoRefineBtn">Undo Last Refine</button>' : ''}
      </div>
      <small class="resume-help">Creates a single cross-style master resume: clearer structure, better sectioning, and safer wording for all supported layouts without inventing new facts.</small>
      ${renderReviewPanel(resume)}
    `;

    const labelInput = document.getElementById('resumeLabelInput');
    labelInput.addEventListener('input', () => {
      const tabBtns = tabBar.querySelectorAll('.tab-btn');
      if (tabBtns[activeTabIndex]) {
        tabBtns[activeTabIndex].textContent = labelInput.value.trim() || `Resume ${activeTabIndex + 1}`;
      }
    });

    const deleteBtn = document.getElementById('deleteTabBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (resumes.length <= 1) return;
        const label = resumes[activeTabIndex].label || `Resume ${activeTabIndex + 1}`;
        if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
        resumes.splice(activeTabIndex, 1);
        if (activeTabIndex >= resumes.length) activeTabIndex = resumes.length - 1;
        renderTabBar();
        renderTabContent();
      });
    }

    const refineResumeBtn = document.getElementById('refineResumeBtn');
    if (refineResumeBtn) {
      refineResumeBtn.addEventListener('click', handleRefineResume);
    }

    const undoRefineBtn = document.getElementById('undoRefineBtn');
    if (undoRefineBtn) {
      undoRefineBtn.addEventListener('click', handleUndoRefine);
    }

    const applyRefineBtn = document.getElementById('applyRefineBtn');
    if (applyRefineBtn) {
      applyRefineBtn.addEventListener('click', handleApplyRefine);
    }

    const cancelRefineBtn = document.getElementById('cancelRefineBtn');
    if (cancelRefineBtn) {
      cancelRefineBtn.addEventListener('click', handleCancelRefine);
    }
  }

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

    if (resume.content !== resume.pendingRefine.source) {
      resume.pendingRefine = null;
      renderTabContent();
      showStatus('Resume text changed after the draft was created. Please refine again.', 'error', 4500);
      return;
    }

    resume.lastRefineBackup = resume.content;
    resume.lastRefineAppliedAt = new Date().toISOString();
    resume.content = resume.pendingRefine.refinedText;
    resume.pendingRefine = null;
    renderTabBar();
    renderTabContent();
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
    renderTabBar();
    renderTabContent();
    showStatus('Original resume restored. Click Save Settings to persist.', 'info', 4500);
  }

  function handleRefineResume() {
    saveCurrentTabToState();
    const resume = getActiveResume();
    if (!resume) return;

    if (!resume.content.trim()) {
      showStatus('Add some resume content before refining it.', 'error', 3500);
      return;
    }

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Please add your Gemini API Key before refining.', 'error', 3500);
      return;
    }

    refiningResumeId = resume.id;
    renderTabContent();
    showStatus('Refining resume into a reusable cross-style master version…', 'loading', 0);

    chrome.runtime.sendMessage({
      type: 'REFINE_RESUME',
      payload: {
        resumeId: resume.id,
        sourceText: resume.content,
        apiKey
      }
    }, (response) => {
      refiningResumeId = null;

      if (chrome.runtime.lastError) {
        renderTabContent();
        showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error', 4500);
        return;
      }

      if (!response || response.status !== 'success' || !response.data) {
        renderTabContent();
        showStatus(`Error: ${response?.message || 'Unknown refinement error'}`, 'error', 4500);
        return;
      }

      resume.pendingRefine = {
        source: resume.content,
        refinedText: response.data.refinedText || '',
        warnings: Array.isArray(response.data.warnings) ? response.data.warnings : [],
        changeSummary: Array.isArray(response.data.changeSummary) ? response.data.changeSummary : []
      };

      renderTabContent();
      showStatus('Review the refined draft below. Apply it to replace the current resume text.', 'success', 5000);
    });
  }

  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  renderTabBar();
  renderTabContent();

  saveButton.addEventListener('click', () => {
    saveCurrentTabToState();

    chrome.storage.local.set({
      geminiApiKey: apiKeyInput.value.trim(),
      resumes: getPersistedResumes()
    }, () => {
      showStatus('Settings saved!', 'success');
    });
  });
});
