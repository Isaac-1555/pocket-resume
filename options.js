// options.js
document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const userProfileInput = document.getElementById('userProfile');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');

  // Load saved settings
  const data = await chrome.storage.local.get(['geminiApiKey', 'userProfile']);
  if (data.geminiApiKey) apiKeyInput.value = data.geminiApiKey;
  if (data.userProfile) userProfileInput.value = data.userProfile;

  // Save settings
  saveButton.addEventListener('click', () => {
    chrome.storage.local.set({
      geminiApiKey: apiKeyInput.value.trim(),
      userProfile: userProfileInput.value.trim()
    }, () => {
      statusDiv.style.display = 'block';
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 2000);
    });
  });
});
