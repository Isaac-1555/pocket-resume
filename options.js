// options.js
document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyButton = document.getElementById('toggleApiKey');
  const userProfileInput = document.getElementById('userProfile');
  const coverLetterToggle = document.getElementById('coverLetterToggle');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');

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

  // Load saved settings
  const data = await chrome.storage.local.get(['geminiApiKey', 'userProfile', 'coverLetterEnabled']);
  if (data.geminiApiKey) apiKeyInput.value = data.geminiApiKey;
  if (data.userProfile) userProfileInput.value = data.userProfile;
  coverLetterToggle.checked = !!data.coverLetterEnabled;

  // Save settings
  saveButton.addEventListener('click', () => {
    chrome.storage.local.set({
      geminiApiKey: apiKeyInput.value.trim(),
      userProfile: userProfileInput.value.trim(),
      coverLetterEnabled: coverLetterToggle.checked
    }, () => {
      statusDiv.style.display = 'block';
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 2000);
    });
  });
});
