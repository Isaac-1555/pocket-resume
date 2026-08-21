document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyButton = document.getElementById('toggleApiKey');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');
  const tabBar = document.getElementById('tabBar');
  const tabContentArea = document.getElementById('tabContentArea');

  const apiKeyLabel = document.getElementById('apiKeyLabel');
  const apiKeyWrapper = document.getElementById('apiKeyWrapper');
  const providerHelperText = document.getElementById('providerHelperText');
  const modelRow = document.getElementById('modelRow');
  const modelInput = document.getElementById('modelInput');
  const cloudModelDatalist = document.getElementById('cloudModelDatalist');
  const loadModelsBtn = document.getElementById('loadModelsBtn');
  const customEndpointsSection = document.getElementById('customEndpointsSection');
  const endpointNameInput = document.getElementById('endpointNameInput');
  const endpointBaseUrlInput = document.getElementById('endpointBaseUrlInput');
  const endpointApiKeyInput = document.getElementById('endpointApiKeyInput');
  const endpointModelInput = document.getElementById('endpointModelInput');
  const endpointModelDatalist = document.getElementById('endpointModelDatalist');
  const testEndpointBtn = document.getElementById('testEndpointBtn');
  const saveEndpointBtn = document.getElementById('saveEndpointBtn');
  const cancelEndpointEditBtn = document.getElementById('cancelEndpointEditBtn');
  const endpointStatusText = document.getElementById('endpointStatusText');
  const endpointsList = document.getElementById('endpointsList');
  const setActiveProviderBtn = document.getElementById('setActiveProviderBtn');
  const providerIcons = document.querySelectorAll('.provider-icon-wrapper');
  const cloudAuthStatus = document.getElementById('cloudAuthStatus');
  const cloudSignInBtn = document.getElementById('cloudSignInBtn');
  const cloudSignOutBtn = document.getElementById('cloudSignOutBtn');
  const cloudUpgradeBtn = document.getElementById('cloudUpgradeBtn');
  const cloudPushBtn = document.getElementById('cloudPushBtn');
  const cloudRestoreBtn = document.getElementById('cloudRestoreBtn');
  const cloudRestorePanel = document.getElementById('cloudRestorePanel');
  const cloudRestorePreview = document.getElementById('cloudRestorePreview');
  const cloudApplyRestoreBtn = document.getElementById('cloudApplyRestoreBtn');
  const cloudCancelRestoreBtn = document.getElementById('cloudCancelRestoreBtn');
  const cloudPricingPanel = document.getElementById('cloudPricingPanel');
  const cloudPricingTable = document.getElementById('cloudPricingTable');
  const cloudPricingFallback = document.getElementById('cloudPricingFallback');
  const cloudClosePricingBtn = document.getElementById('cloudClosePricingBtn');
  const cloudSyncDetails = document.getElementById('cloudSyncDetails');
  const modeToggle = document.getElementById('modeToggle');
  const refineModal = document.getElementById('refineModal');
  const refineModalContent = document.getElementById('refineModalContent');

  let apiKeys = {
    google: '',
    openrouter: '',
    openai: '',
    anthropic: ''
  };
  let activeProvider = 'google';
  let currentlyViewedProvider = 'google';
  let cloudRestoreDraft = [];
  let providerModels = { google: '', openai: '', anthropic: '', openrouter: '' };
  let customEndpoints = [];
  let activeCustomEndpointId = '';
  let editingEndpointId = null;

  let resumes = [];
  let activeTabIndex = 0;
  let refiningResumeId = null;
  let extractingResumeId = null;
  let statusTimeoutId = null;
  let editorMode = 'resume';

  function generateId() {
    return 'r_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }

  const PROVIDER_NAMES = {
    google: 'Google Gemini',
    openrouter: 'OpenRouter',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    custom: 'Custom / Local'
  };

  const ENDPOINT_PRESETS = {
    ollama: { name: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: '' },
    lmstudio: { name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '' },
    nvidia: { name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'mistralai/mistral-small-3.1-24b-instruct-2503' }
  };

  if (window.location.hash === '#cloud-pricing') {
    setTimeout(showCloudPricingPanel, 300);
  }

  if (cloudUpgradeBtn) {
    cloudUpgradeBtn.addEventListener('click', async () => {
      if (cloudSyncDetails) cloudSyncDetails.open = true;
      await showCloudPricingPanel();
    });
  }

  async function showCloudPricingPanel() {
    try {
      if (!window.CloudSync || !window.CloudSync.mountPricingTable || !cloudPricingPanel || !cloudPricingTable) {
        showStatus('Pricing is not available in this extension build yet.', 'error', 5000);
        return;
      }
      if (cloudSyncDetails) cloudSyncDetails.open = true;
      cloudPricingPanel.style.display = 'block';
      if (cloudPricingFallback) {
        cloudPricingFallback.textContent = '';
        cloudPricingFallback.style.display = 'none';
      }
      cloudPricingTable.innerHTML = '';
      await window.CloudSync.mountPricingTable(cloudPricingTable);
    } catch (error) {
      if (cloudPricingFallback) {
        cloudPricingFallback.textContent = `Could not load Clerk pricing. Confirm Billing is enabled and at least one user plan is public in Clerk. Details: ${error.message}`;
        cloudPricingFallback.style.display = 'block';
      }
      showStatus('Could not load pricing. Check the message in the Cloud Sync panel.', 'error', 7000);
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
      lastRefineBackup: '',
      lastRefineAppliedAt: '',
      _lastSavedContent: content || '',
      pendingRefine: null
    };
  }

  function normalizeResumeEntry(resume, index) {
    const content = typeof resume?.content === 'string' ? resume.content : '';
    return {
      id: typeof resume?.id === 'string' && resume.id.trim() ? resume.id : generateId(),
      label: typeof resume?.label === 'string' && resume.label.trim() ? resume.label : `Resume ${index + 1}`,
      content,
      jsonContent: typeof resume?.jsonContent === 'string' ? resume.jsonContent : '',
      lastRefineBackup: typeof resume?.lastRefineBackup === 'string' ? resume.lastRefineBackup : '',
      lastRefineAppliedAt: typeof resume?.lastRefineAppliedAt === 'string' ? resume.lastRefineAppliedAt : '',
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

  function getSettingsPayload() {
    return {
      apiProvider: activeProvider,
      geminiApiKey: apiKeys.google,
      openrouterApiKey: apiKeys.openrouter,
      openaiApiKey: apiKeys.openai,
      anthropicApiKey: apiKeys.anthropic,
      googleModel: providerModels.google,
      openaiModel: providerModels.openai,
      anthropicModel: providerModels.anthropic,
      openrouterModel: providerModels.openrouter,
      customEndpoints: customEndpoints,
      activeCustomEndpointId: activeCustomEndpointId,
      resumes: getPersistedResumes()
    };
  }

  async function updateCloudStatus() {
    if (!cloudAuthStatus) return;
    const configured = !!(window.CloudSync && window.CloudSync.isConfigured && window.CloudSync.isConfigured());
    if (!configured) {
      cloudAuthStatus.textContent = 'Cloud sync coming soon';
      cloudAuthStatus.className = 'cloud-status-pill';
      if (cloudSignInBtn) cloudSignInBtn.style.display = 'none';
      if (cloudSignOutBtn) cloudSignOutBtn.style.display = 'none';
      if (cloudUpgradeBtn) cloudUpgradeBtn.style.display = 'none';
      if (cloudPushBtn) cloudPushBtn.style.display = 'none';
      if (cloudRestoreBtn) cloudRestoreBtn.style.display = 'none';
      return;
    }
    if (cloudPushBtn) cloudPushBtn.style.display = 'inline-block';
    if (cloudRestoreBtn) cloudRestoreBtn.style.display = 'inline-block';

    try {
      if (window.CloudSync) {
        await window.CloudSync.init();
        const signedIn = await window.CloudSync.isSignedIn();
        if (signedIn) {
          const email = await window.CloudSync.getUserEmail();
          const hasAccess = await window.CloudSync.hasCloudSyncAccess();
          if (hasAccess) {
            cloudAuthStatus.textContent = email ? `Cloud Sync active: ${email}` : 'Cloud Sync active';
            cloudAuthStatus.className = 'cloud-status-pill synced';
            if (cloudPushBtn) cloudPushBtn.style.display = 'inline-block';
            if (cloudRestoreBtn) cloudRestoreBtn.style.display = 'inline-block';
            if (cloudUpgradeBtn) cloudUpgradeBtn.style.display = 'none';
          } else {
            cloudAuthStatus.textContent = 'Cloud Sync needs a paid plan';
            cloudAuthStatus.className = 'cloud-status-pill error';
            if (cloudPushBtn) cloudPushBtn.style.display = 'none';
            if (cloudRestoreBtn) cloudRestoreBtn.style.display = 'none';
            if (cloudUpgradeBtn) cloudUpgradeBtn.style.display = 'inline-block';
          }
          if (cloudSignInBtn) cloudSignInBtn.style.display = 'none';
          if (cloudSignOutBtn) cloudSignOutBtn.style.display = 'inline-block';
        } else {
          cloudAuthStatus.textContent = 'Configured, signed out';
          cloudAuthStatus.className = 'cloud-status-pill';
          if (cloudSignInBtn) cloudSignInBtn.style.display = 'inline-block';
          if (cloudSignOutBtn) cloudSignOutBtn.style.display = 'none';
          if (cloudUpgradeBtn) cloudUpgradeBtn.style.display = 'none';
        }
      }
    } catch (error) {
      cloudAuthStatus.textContent = 'Cloud sync error';
      cloudAuthStatus.className = 'cloud-status-pill error';
    }
  }

  function normalizeCloudResume(doc, index) {
    return {
      id: typeof doc.resumeId === 'string' && doc.resumeId ? doc.resumeId : generateId(),
      label: doc.label || `Resume ${index + 1}`,
      content: doc.content || '',
      jsonContent: doc.jsonContent || '',
      lastRefineBackup: '',
      lastRefineAppliedAt: '',
      _lastSavedContent: doc.content || '',
      pendingRefine: null
    };
  }

  function formatExtractedJson(rawText) {
    try {
      let rawData = (rawText || '').trim();
      if (rawData.startsWith('```json')) rawData = rawData.replace(/^```json/, '').replace(/```$/, '');
      else if (rawData.startsWith('```')) rawData = rawData.replace(/^```/, '').replace(/```$/, '');
      return JSON.stringify(JSON.parse(rawData), null, 2);
    } catch (e) {
      return rawText;
    }
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
    resume.content = resume.pendingRefine.refinedText;
    resume.pendingRefine = null;
    return { applied: true, stale: false };
  }

  async function extractJsonForResume(resume) {
    if (!resume?.content?.trim()) {
      throw new Error('Add some resume content before extracting JSON.');
    }
    extractingResumeId = resume.id;
    renderTabContent();
    showStatus('Extracting profile to JSON...', 'loading', 0);

    try {
      const response = await sendRuntimeMessage({
        type: 'EXTRACT_RESUME_JSON',
        payload: {
          resumeId: resume.id,
          sourceText: resume.content
        }
      });
      if (!response || response.status !== 'success' || !response.data) {
        throw new Error(response?.message || 'Unknown extraction error');
      }
      resume.jsonContent = formatExtractedJson(response.data);
      await setLocalStorage({ resumes: getPersistedResumes() });
      resume._lastSavedContent = resume.content;
      return resume.jsonContent;
    } finally {
      extractingResumeId = null;
      renderTabContent();
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

  const updateViewedProvider = (provider) => {
    if (currentlyViewedProvider && currentlyViewedProvider !== provider) {
      apiKeys[currentlyViewedProvider] = apiKeyInput.value.trim();
      if (providerModels.hasOwnProperty(currentlyViewedProvider)) {
        providerModels[currentlyViewedProvider] = modelInput.value.trim();
      }
    }
    currentlyViewedProvider = provider;
    const isCustom = provider === 'custom';

    providerIcons.forEach(icon => {
      icon.classList.toggle('active-view', icon.dataset.provider === provider);
    });

    apiKeyWrapper.style.display = isCustom ? 'none' : 'flex';
    modelRow.style.display = isCustom ? 'none' : 'flex';
    customEndpointsSection.style.display = isCustom ? 'flex' : 'none';

    if (!isCustom) {
      apiKeyInput.value = apiKeys[provider] || '';
      modelInput.value = providerModels[provider] || '';
      cloudModelDatalist.innerHTML = '';
      modelHelperText.textContent = "Leave empty to use this provider's default model.";
    } else {
      resetEndpointForm();
      renderEndpointsList();
    }

    apiKeyLabel.textContent = `${PROVIDER_NAMES[provider]} API Key:`;
    const helperTexts = {
      google: 'Get your Google key from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>',
      openrouter: 'Get your OpenRouter key from <a href="https://openrouter.ai/keys" target="_blank">OpenRouter</a>',
      openai: 'Get your OpenAI key from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>',
      anthropic: 'Get your Anthropic key from <a href="https://console.anthropic.com/settings/keys" target="_blank">Anthropic Console</a>',
      custom: 'Connect any OpenAI-compatible API: Ollama, LM Studio, NVIDIA NIM, Groq, DeepSeek and more.'
    };
    providerHelperText.innerHTML = helperTexts[provider];
    setActiveProviderBtn.style.display = provider === activeProvider ? 'none' : 'inline-block';
  };

  const updateActiveProvider = (provider) => {
    activeProvider = provider;
    providerIcons.forEach(icon => {
      icon.classList.toggle('active-provider', icon.dataset.provider === provider);
    });
    setActiveProviderBtn.style.display = 'none';
  };

  providerIcons.forEach(icon => {
    icon.addEventListener('click', () => {
      updateViewedProvider(icon.dataset.provider);
    });
  });

  setActiveProviderBtn.addEventListener('click', () => {
    updateActiveProvider(currentlyViewedProvider);
  });

  apiKeyInput.addEventListener('input', () => {
    apiKeys[currentlyViewedProvider] = apiKeyInput.value.trim();
  });

  modelInput.addEventListener('input', () => {
    if (providerModels.hasOwnProperty(currentlyViewedProvider)) {
      providerModels[currentlyViewedProvider] = modelInput.value.trim();
    }
  });

  async function fetchCloudProviderModels(provider) {
    if (provider === 'google') {
      const key = apiKeys.google;
      if (!key) throw new Error('Enter your Google API key first.');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      return (data.models || []).map((m) => (m.name || '').replace(/^models\//, '')).filter(Boolean);
    }
    if (provider === 'openai') {
      const key = apiKeys.openai;
      if (!key) throw new Error('Enter your OpenAI API key first.');
      const res = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${key}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      return (data.data || []).map((m) => m.id).filter(Boolean);
    }
    if (provider === 'anthropic') {
      const key = apiKeys.anthropic;
      if (!key) throw new Error('Enter your Anthropic API key first.');
      const res = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      return (data.data || []).map((m) => m.id).filter(Boolean);
    }
    if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/models');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      return (data.data || []).map((m) => m.id).filter(Boolean);
    }
    throw new Error('Select a cloud provider first.');
  }

  loadModelsBtn.addEventListener('click', async () => {
    const provider = currentlyViewedProvider;
    if (!providerModels.hasOwnProperty(provider)) return;
    loadModelsBtn.disabled = true;
    try {
      const models = (await fetchCloudProviderModels(provider)).sort();
      cloudModelDatalist.innerHTML = models.map((m) => `<option value="${escapeAttr(m)}"></option>`).join('');
      modelHelperText.textContent = models.length
        ? `${models.length} models loaded. Click the model field to pick one.`
        : 'No models found for this key.';
    } catch (error) {
      modelHelperText.textContent = `Could not load models: ${error.message}`;
    } finally {
      loadModelsBtn.disabled = false;
    }
  });

  function getEndpointOrigin(baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.origin + '/*';
    } catch (error) {
      return null;
    }
  }

  async function ensureEndpointPermission(baseUrl) {
    const origin = getEndpointOrigin(baseUrl);
    if (!origin) throw new Error('Enter a valid http(s) Base URL.');
    const alreadyGranted = await chrome.permissions.contains({ origins: [origin] });
    if (alreadyGranted) return;
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error(`Permission denied for ${origin}`);
  }

  function normalizeEndpointBase(baseUrl) {
    return (baseUrl || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  }

  async function fetchCustomEndpointModels(baseUrl, apiKey) {
    const normalized = normalizeEndpointBase(baseUrl);
    if (!normalized) throw new Error('Enter a Base URL first.');
    const headers = {};
    if ((apiKey || '').trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    const res = await fetch(`${normalized}/models`, { headers });
    let data;
    try {
      data = await res.json();
    } catch (error) {
      throw new Error(`HTTP ${res.status} with a non-JSON response.`);
    }
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    return (Array.isArray(data.data) ? data.data : []).map((m) => m?.id).filter(Boolean);
  }

  function resetEndpointForm() {
    editingEndpointId = null;
    endpointNameInput.value = '';
    endpointBaseUrlInput.value = '';
    endpointApiKeyInput.value = '';
    endpointModelInput.value = '';
    endpointModelDatalist.innerHTML = '';
    endpointStatusText.textContent = '';
    cancelEndpointEditBtn.style.display = 'none';
    saveEndpointBtn.textContent = 'Save Endpoint';
  }

  function renderEndpointsList() {
    endpointsList.innerHTML = '';
    if (!customEndpoints.length) {
      endpointsList.innerHTML = '<small>No saved endpoints yet.</small>';
      return;
    }
    customEndpoints.forEach((endpoint) => {
      const isActive = endpoint.id === activeCustomEndpointId;
      const item = document.createElement('div');
      item.className = 'endpoint-item' + (isActive ? ' active-endpoint' : '');
      item.innerHTML = `
        <div class="endpoint-item-info">
          <div class="endpoint-item-name">${escapeHtml(endpoint.name)}${isActive ? '<span class="endpoint-active-badge">Active</span>' : ''}</div>
          <div class="endpoint-item-url">${escapeHtml(endpoint.baseUrl)} · ${escapeHtml(endpoint.model)}</div>
        </div>
        <div class="endpoint-item-actions">
          ${isActive ? '' : '<button type="button" data-action="activate">Set Active</button>'}
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="delete">Delete</button>
        </div>
      `;
      item.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => handleEndpointAction(btn.dataset.action, endpoint.id));
      });
      endpointsList.appendChild(item);
    });
  }

  async function handleEndpointAction(action, endpointId) {
    const endpoint = customEndpoints.find((e) => e.id === endpointId);
    if (!endpoint) return;

    if (action === 'edit') {
      editingEndpointId = endpointId;
      endpointNameInput.value = endpoint.name || '';
      endpointBaseUrlInput.value = endpoint.baseUrl || '';
      endpointApiKeyInput.value = endpoint.apiKey || '';
      endpointModelInput.value = endpoint.model || '';
      endpointModelDatalist.innerHTML = '';
      endpointStatusText.textContent = '';
      cancelEndpointEditBtn.style.display = 'inline-block';
      saveEndpointBtn.textContent = 'Update Endpoint';
      return;
    }

    if (action === 'activate') {
      activeCustomEndpointId = endpointId;
      try {
        await setLocalStorage({ customEndpoints, activeCustomEndpointId });
      } catch (error) {
        showStatus(`Error: ${error.message}`, 'error', 4500);
        return;
      }
      renderEndpointsList();
      return;
    }

    if (action === 'delete') {
      if (!confirm(`Delete endpoint "${endpoint.name}"?`)) return;
      customEndpoints = customEndpoints.filter((e) => e.id !== endpointId);
      if (activeCustomEndpointId === endpointId) {
        activeCustomEndpointId = customEndpoints.length ? customEndpoints[0].id : '';
      }
      try {
        await setLocalStorage({ customEndpoints, activeCustomEndpointId });
      } catch (error) {
        showStatus(`Error: ${error.message}`, 'error', 4500);
        return;
      }
      if (editingEndpointId === endpointId) resetEndpointForm();
      renderEndpointsList();
    }
  }

  document.querySelectorAll('.endpoint-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = ENDPOINT_PRESETS[btn.dataset.preset];
      if (!preset) return;
      resetEndpointForm();
      endpointNameInput.value = preset.name;
      endpointBaseUrlInput.value = preset.baseUrl;
      endpointModelInput.focus();
    });
  });

  testEndpointBtn.addEventListener('click', async () => {
    const baseUrl = endpointBaseUrlInput.value.trim();
    endpointStatusText.textContent = '';
    try {
      await ensureEndpointPermission(baseUrl);
      endpointStatusText.textContent = 'Testing connection...';
      const models = await fetchCustomEndpointModels(baseUrl, endpointApiKeyInput.value);
      endpointModelDatalist.innerHTML = models.map((m) => `<option value="${escapeAttr(m)}"></option>`).join('');
      endpointStatusText.textContent = models.length
        ? `Success — ${models.length} models available. Click the model field to pick one.`
        : 'Success — endpoint reachable, but no models listed.';
    } catch (error) {
      endpointStatusText.textContent = `Failed: ${error.message}`;
    }
  });

  cancelEndpointEditBtn.addEventListener('click', resetEndpointForm);

  saveEndpointBtn.addEventListener('click', async () => {
    const name = endpointNameInput.value.trim() || 'My Endpoint';
    const baseUrl = endpointBaseUrlInput.value.trim();
    const apiKey = endpointApiKeyInput.value.trim();
    const model = endpointModelInput.value.trim();

    if (!getEndpointOrigin(baseUrl)) {
      endpointStatusText.textContent = 'Enter a valid http(s) Base URL.';
      return;
    }
    if (!model) {
      endpointStatusText.textContent = 'Enter the model ID to use (Test Connection lists options).';
      return;
    }

    try {
      await ensureEndpointPermission(baseUrl);
    } catch (error) {
      endpointStatusText.textContent = error.message;
      return;
    }

    if (editingEndpointId) {
      const entry = customEndpoints.find((e) => e.id === editingEndpointId);
      if (entry) Object.assign(entry, { name, baseUrl, apiKey, model });
      if (activeCustomEndpointId === entry.id) activeCustomEndpointId = entry.id;
    } else {
      const entry = { id: generateId(), name, baseUrl, apiKey, model };
      customEndpoints.push(entry);
      if (!activeCustomEndpointId) activeCustomEndpointId = entry.id;
    }

    try {
      await setLocalStorage({ customEndpoints, activeCustomEndpointId });
    } catch (error) {
      endpointStatusText.textContent = `Error: ${error.message}`;
      return;
    }

    endpointStatusText.textContent = `Endpoint "${name}" saved.`;
    resetEndpointForm();
    renderEndpointsList();
  });

  const data = await chrome.storage.local.get(['geminiApiKey', 'openrouterApiKey', 'openaiApiKey', 'anthropicApiKey', 'googleModel', 'openaiModel', 'anthropicModel', 'openrouterModel', 'customEndpoints', 'activeCustomEndpointId', 'apiProvider', 'userProfile', 'resumes', 'trackerCaptureEnabled']);
  const trackerCaptureToggle = document.getElementById('trackerCaptureToggle');
  if (trackerCaptureToggle) {
    trackerCaptureToggle.checked = data.trackerCaptureEnabled !== false;
    trackerCaptureToggle.addEventListener('change', () => {
      chrome.storage.local.set({ trackerCaptureEnabled: trackerCaptureToggle.checked });
    });
  }

  if (data.apiProvider) activeProvider = data.apiProvider;
  if (data.geminiApiKey) apiKeys.google = data.geminiApiKey;
  if (data.openrouterApiKey) apiKeys.openrouter = data.openrouterApiKey;
  if (data.openaiApiKey) apiKeys.openai = data.openaiApiKey;
  if (data.anthropicApiKey) apiKeys.anthropic = data.anthropicApiKey;
  if (data.googleModel) providerModels.google = data.googleModel;
  if (data.openaiModel) providerModels.openai = data.openaiModel;
  if (data.anthropicModel) providerModels.anthropic = data.anthropicModel;
  if (data.openrouterModel) providerModels.openrouter = data.openrouterModel;
  if (Array.isArray(data.customEndpoints)) {
    customEndpoints = data.customEndpoints.filter((e) => e && typeof e.baseUrl === 'string' && e.baseUrl.trim());
  }
  activeCustomEndpointId = customEndpoints.some((e) => e.id === data.activeCustomEndpointId)
    ? data.activeCustomEndpointId
    : (customEndpoints.length ? customEndpoints[0].id : '');

  updateActiveProvider(activeProvider);
  updateViewedProvider(activeProvider);
  updateCloudStatus();

  if (cloudSignInBtn) {
    cloudSignInBtn.addEventListener('click', async () => {
      try {
        if (!window.CloudSync) throw new Error('Cloud sync service failed to load.');
        await window.CloudSync.signIn();
      } catch (error) {
        showStatus(`Error: ${error.message}`, 'error', 6000);
      }
    });
  }

  if (cloudSignOutBtn) {
    cloudSignOutBtn.addEventListener('click', async () => {
      try {
        if (window.CloudSync) await window.CloudSync.signOut();
        await updateCloudStatus();
      } catch (error) {
        showStatus(`Error: ${error.message}`, 'error', 4500);
      }
    });
  }

  if (cloudPushBtn) {
    cloudPushBtn.addEventListener('click', async () => {
      try {
        saveCurrentTabToState();
        await setLocalStorage(getSettingsPayload());
        if (!window.CloudSync) throw new Error('Cloud sync service failed to load.');
        showStatus('Pushing resumes to cloud...', 'loading', 0);
        await window.CloudSync.init();
        await window.CloudSync.pushAllResumes(getPersistedResumes());
        showStatus('Resumes pushed to cloud.', 'success', 5000);
        await updateCloudStatus();
      } catch (error) {
        showStatus(`Cloud push failed: ${error.message}`, 'error', 7000);
      }
    });
  }

  if (cloudRestoreBtn) {
    cloudRestoreBtn.addEventListener('click', async () => {
      try {
        if (!window.CloudSync) throw new Error('Cloud sync service failed to load.');
        showStatus('Loading cloud resumes...', 'loading', 0);
        await window.CloudSync.init();
        const cloudDocs = await window.CloudSync.pullAllResumes();
        cloudRestoreDraft = cloudDocs.map(normalizeCloudResume);
        if (!cloudRestoreDraft.length) {
          showStatus('No cloud resumes found.', 'info', 4000);
          return;
        }
        if (cloudSyncDetails) cloudSyncDetails.open = true;
        cloudRestorePreview.value = JSON.stringify(cloudRestoreDraft.map(serializeResumeEntry), null, 2);
        cloudRestorePanel.style.display = 'block';
        showStatus('Review cloud resumes before replacing local data.', 'info', 5000);
      } catch (error) {
        showStatus(`Restore failed: ${error.message}`, 'error', 7000);
      }
    });
  }

  if (cloudApplyRestoreBtn) {
    cloudApplyRestoreBtn.addEventListener('click', async () => {
      if (!cloudRestoreDraft.length) return;
      if (!confirm('Replace local resumes with cloud resumes? This changes local storage.')) return;
      resumes = cloudRestoreDraft.map((resume, index) => normalizeResumeEntry(resume, index)).slice(0, 3);
      activeTabIndex = 0;
      await setLocalStorage({ resumes: getPersistedResumes() });
      cloudRestorePanel.style.display = 'none';
      cloudRestoreDraft = [];
      renderTabBar();
      renderTabContent();
      showStatus('Local resumes replaced with cloud data.', 'success', 5000);
    });
  }

  if (cloudCancelRestoreBtn) {
    cloudCancelRestoreBtn.addEventListener('click', () => {
      cloudRestoreDraft = [];
      cloudRestorePanel.style.display = 'none';
      cloudRestorePreview.value = '';
    });
  }

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
    const resume = getActiveResume();
    const labelInput = document.getElementById('resumeLabelInput');
    if (labelInput && resume) {
      resume.label = labelInput.value.trim() || `Resume ${activeTabIndex + 1}`;
    }
    const contentTextarea = document.getElementById('resumeContentTextarea');
    if (contentTextarea) {
      resume.content = contentTextarea.value;
    }
    const jsonTextarea = document.getElementById('resumeJsonTextarea');
    if (jsonTextarea) {
      resume.jsonContent = jsonTextarea.value;
    }
  }

  function setEditorMode(mode) {
    saveCurrentTabToState();
    editorMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    renderTabContent();
  }

  modeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === editorMode) return;
    setEditorMode(mode);
  });

  function showRefineModal(resume) {
    if (!resume?.pendingRefine) return;

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

    refineModalContent.innerHTML = `
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
          <label>Current resume</label>
          <textarea class="review-preview-textarea" readonly>${escapeHtml(resume.pendingRefine.source)}</textarea>
        </div>
        <div class="review-preview-column">
          <label>Proposed refined version</label>
          <textarea class="review-preview-textarea" readonly>${escapeHtml(resume.pendingRefine.refinedText)}</textarea>
        </div>
      </div>
      <div class="review-actions">
        <button type="button" class="secondary-action-btn" id="applyRefineBtn" ${sourceChanged ? 'disabled' : ''}>Apply Refined Resume</button>
        <button type="button" class="ghost-btn" id="cancelRefineBtn">Cancel</button>
      </div>
    `;

    refineModal.style.display = 'flex';

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
    const isExtracting = extractingResumeId === resume.id;
    const mode = editorMode;

    const labelRow = `
      <div class="resume-label-row">
        <input type="text" id="resumeLabelInput" class="resume-label-input"
               placeholder="Label (e.g. Project Manager)" value="${escapeAttr(resume.label)}" maxlength="40">
        ${resumes.length > 1 ? '<button type="button" class="delete-tab-btn" id="deleteTabBtn">Delete</button>' : ''}
      </div>
    `;

    const subTabs = `
      <div class="editor-sub-tabs">
        <button type="button" class="editor-sub-tab${mode === 'resume' ? ' active' : ''}" data-mode="resume">Resume Content</button>
        <button type="button" class="editor-sub-tab${mode === 'json' ? ' active' : ''}" data-mode="json">JSON Profile</button>
      </div>
    `;

    let editorHTML = '';
    if (mode === 'resume') {
      editorHTML = `
        <textarea id="resumeContentTextarea"
                  placeholder="Paste your resume content for this profile here. The AI will use this to generate tailored resumes.">${escapeHtml(resume.content)}</textarea>
        <div class="resume-actions">
          <button type="button" class="secondary-action-btn" id="refineResumeBtn" ${isRefining ? 'disabled' : ''}>${isRefining ? 'Refining...' : 'Refine Resume'}</button>
          ${resume.lastRefineBackup ? '<button type="button" class="ghost-btn" id="undoRefineBtn">Undo Last Refine</button>' : ''}
        </div>
        <small class="resume-help">Creates a single cross-style master resume: clearer structure, better sectioning, and safer wording for all supported layouts without inventing new facts.</small>
      `;
    } else {
      editorHTML = `
        <textarea id="resumeJsonTextarea"
                  placeholder="Structured JSON profile data. Click Extract JSON to generate from your resume content, or edit manually.">${escapeHtml(resume.jsonContent)}</textarea>
        <div class="resume-actions">
          <button type="button" class="secondary-action-btn" id="extractJsonBtn" ${isExtracting ? 'disabled' : ''}>${isExtracting ? 'Extracting JSON...' : 'Extract JSON'}</button>
        </div>
        <small class="resume-help">Save settings to generate structured profile data, or click Extract JSON to retry manually.</small>
      `;
    }

    tabContentArea.innerHTML = labelRow + subTabs + editorHTML;

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

    document.querySelectorAll('.editor-sub-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === editorMode) return;
        setEditorMode(mode);
      });
    });

    const refineResumeBtn = document.getElementById('refineResumeBtn');
    if (refineResumeBtn) {
      refineResumeBtn.addEventListener('click', handleRefineResume);
    }

    const extractJsonBtn = document.getElementById('extractJsonBtn');
    if (extractJsonBtn) {
      extractJsonBtn.addEventListener('click', handleExtractJson);
    }

    const undoRefineBtn = document.getElementById('undoRefineBtn');
    if (undoRefineBtn) {
      undoRefineBtn.addEventListener('click', handleUndoRefine);
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
    renderTabBar();
    renderTabContent();
    showStatus('Original resume restored. Click Save Settings to persist.', 'info', 4500);
  }

  async function handleExtractJson() {
    saveCurrentTabToState();
    const resume = getActiveResume();
    if (!resume) return;
    if (!resume.content.trim()) {
      showStatus('Add some resume content before extracting JSON.', 'error', 3500);
      return;
    }
    try {
      await extractJsonForResume(resume);
      showStatus('JSON profile extracted and saved successfully.', 'success', 5000);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error', 4500);
    }
  }

  function handleRefineResume() {
    saveCurrentTabToState();
    const resume = getActiveResume();
    if (!resume) return;
    if (!resume.content.trim()) {
      showStatus('Add some resume content before refining it.', 'error', 3500);
      return;
    }

    refiningResumeId = resume.id;
    renderTabContent();
    showStatus('Refining resume into a reusable cross-style master version…', 'loading', 0);

    chrome.runtime.sendMessage({
      type: 'REFINE_RESUME',
      payload: {
        resumeId: resume.id,
        sourceText: resume.content
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
      showRefineModal(resume);
      showStatus('Review the refined draft in the dialog.', 'success', 5000);
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

  saveButton.addEventListener('click', async () => {
    saveCurrentTabToState();
    apiKeys[currentlyViewedProvider] = apiKeyInput.value.trim();
    const resume = getActiveResume();
    const contentChanged = !!resume && resume.content !== resume._lastSavedContent;
    const refineResult = applyPendingRefineDraft(resume);
    const shouldExtractJson = !!resume?.content?.trim() && (
      refineResult.applied ||
      contentChanged ||
      !(resume.jsonContent || '').trim()
    );

    if (shouldExtractJson && (refineResult.applied || contentChanged)) {
      resume.jsonContent = '';
    }
    resumes.forEach((entry) => {
      if (entry.id !== resume?.id && entry.content !== entry._lastSavedContent) {
        entry.jsonContent = '';
      }
    });
    renderTabBar();
    renderTabContent();

    saveButton.disabled = true;

    try {
      await setLocalStorage(getSettingsPayload());
      resumes.forEach((entry) => {
        entry._lastSavedContent = entry.content;
      });
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error', 4500);
      saveButton.disabled = false;
      return;
    }

    if (!resume?.content?.trim()) {
      saveButton.disabled = false;
      showStatus('Settings saved!', 'success');
      return;
    }
    if (!shouldExtractJson) {
      saveButton.disabled = false;
      showStatus(refineResult.stale ? 'Settings saved. Stale refine draft skipped.' : 'Settings saved!', 'success');
      return;
    }

    const loadingMessage = refineResult.stale
      ? 'Settings saved. Refine draft was stale; extracting JSON from current resume...'
      : refineResult.applied
        ? 'Settings saved. Refined resume applied. Extracting JSON profile...'
        : 'Settings saved. Extracting JSON profile...';
    showStatus(loadingMessage, 'loading', 0);

    try {
      await extractJsonForResume(resume);
      const successMessage = refineResult.applied
        ? 'Settings saved. Refined resume applied and JSON profile extracted.'
        : refineResult.stale
          ? 'Settings saved. Stale refine draft skipped and JSON profile extracted.'
          : 'Settings saved and JSON profile extracted.';
      showStatus(successMessage, 'success', 5000);
    } catch (error) {
      showStatus(`Settings saved, but JSON extraction failed: ${error.message}. Open Advanced and retry Extract JSON.`, 'error', 7000);
    } finally {
      saveButton.disabled = false;
    }
  });
});
