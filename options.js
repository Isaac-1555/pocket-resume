// options.js
document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyButton = document.getElementById('toggleApiKey');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');
  const tabBar = document.getElementById('tabBar');
  const tabContentArea = document.getElementById('tabContentArea');

  // --- State ---
  let resumes = []; // Array of { id, label, content }
  let activeTabIndex = 0;

  // --- Generate unique ID ---
  function generateId() {
    return 'r_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }

  // Toggle API Key visibility
  toggleApiKeyButton.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyButton.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyButton.textContent = 'Show';
    }
  });

  // --- Migration & Load ---
  const data = await chrome.storage.local.get(['geminiApiKey', 'userProfile', 'resumes']);

  if (data.geminiApiKey) apiKeyInput.value = data.geminiApiKey;

  if (data.resumes && data.resumes.length > 0) {
    // Already migrated
    resumes = data.resumes;
  } else if (data.userProfile) {
    // Migrate from old single-resume format
    resumes = [{ id: generateId(), label: 'Resume 1', content: data.userProfile }];
    // Persist migration immediately
    await chrome.storage.local.set({ resumes });
    await chrome.storage.local.remove('userProfile');
  } else {
    // Brand new user - start with one empty resume
    resumes = [{ id: generateId(), label: 'Resume 1', content: '' }];
  }

  // --- Save current tab content to in-memory state ---
  function saveCurrentTabToState() {
    const labelInput = document.getElementById('resumeLabelInput');
    const contentTextarea = document.getElementById('resumeContentTextarea');
    if (labelInput && contentTextarea && resumes[activeTabIndex]) {
      resumes[activeTabIndex].label = labelInput.value.trim() || `Resume ${activeTabIndex + 1}`;
      resumes[activeTabIndex].content = contentTextarea.value;
    }
  }

  // --- Render Tab Bar ---
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

    // Add tab button (max 3)
    if (resumes.length < 3) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'add-tab-btn';
      addBtn.textContent = '+';
      addBtn.title = 'Add a new resume (max 3)';
      addBtn.addEventListener('click', () => {
        saveCurrentTabToState();
        const newResume = { id: generateId(), label: `Resume ${resumes.length + 1}`, content: '' };
        resumes.push(newResume);
        activeTabIndex = resumes.length - 1;
        renderTabBar();
        renderTabContent();
      });
      tabBar.appendChild(addBtn);
    }
  }

  // --- Render Tab Content ---
  function renderTabContent() {
    const resume = resumes[activeTabIndex];
    if (!resume) return;

    tabContentArea.innerHTML = `
      <div class="resume-label-row">
        <input type="text" id="resumeLabelInput" class="resume-label-input"
               placeholder="Label (e.g. Project Manager)" value="${escapeAttr(resume.label)}" maxlength="40">
        ${resumes.length > 1 ? '<button type="button" class="delete-tab-btn" id="deleteTabBtn">Delete</button>' : ''}
      </div>
      <textarea id="resumeContentTextarea"
                placeholder="Paste your resume content for this profile here. The AI will use this to generate tailored resumes.">${escapeHtml(resume.content)}</textarea>
    `;

    // Update tab bar text live as user types label
    const labelInput = document.getElementById('resumeLabelInput');
    labelInput.addEventListener('input', () => {
      const tabBtns = tabBar.querySelectorAll('.tab-btn');
      if (tabBtns[activeTabIndex]) {
        tabBtns[activeTabIndex].textContent = labelInput.value.trim() || `Resume ${activeTabIndex + 1}`;
      }
    });

    // Delete handler
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
  }

  // --- Escape helpers ---
  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Initial Render ---
  renderTabBar();
  renderTabContent();

  // --- Save Settings ---
  saveButton.addEventListener('click', () => {
    // Commit current tab edits to state
    saveCurrentTabToState();

    chrome.storage.local.set({
      geminiApiKey: apiKeyInput.value.trim(),
      resumes: resumes
    }, () => {
      statusDiv.style.display = 'block';
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 2000);
    });
  });
});
