// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generateBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const resumeType = document.getElementById('resumeType');
  const statusDiv = document.getElementById('status');
  const resultArea = document.getElementById('resultArea');
  const outputContent = document.getElementById('outputContent');
  const copyBtn = document.getElementById('copyBtn');

  // Check if settings are configured
  chrome.storage.local.get(['geminiApiKey', 'userProfile'], (data) => {
    if (!data.geminiApiKey || !data.userProfile) {
      showStatus("Please configure your API Key and Profile in Settings first.", "error");
      generateBtn.disabled = true;
    }
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  generateBtn.addEventListener('click', async () => {
    // UI Reset
    showStatus("Capturing page and generating resume... This may take 10-20 seconds.", "loading");
    generateBtn.disabled = true;
    resultArea.style.display = 'none';

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to Background to start the pipeline
    chrome.runtime.sendMessage({
      type: 'START_GENERATION',
      payload: {
        tabId: tab.id,
        resumeType: resumeType.value
      }
    }, (response) => {
      // Handle response (this might be immediate or async depending on the background handling)
      // Actually, standard sendMessage response might timeout for long requests. 
      // Better to listen for a completion message or keep the channel open.
      
      if (chrome.runtime.lastError) {
        showStatus("Error: " + chrome.runtime.lastError.message, "error");
        generateBtn.disabled = false;
        return;
      }

      if (response && response.status === 'success') {
        showStatus("Resume generated successfully!", "success");
        outputContent.value = response.data;
        resultArea.style.display = 'block';
      } else {
        showStatus("Error: " + (response ? response.message : "Unknown error"), "error");
      }
      generateBtn.disabled = false;
    });
  });

  copyBtn.addEventListener('click', () => {
    outputContent.select();
    document.execCommand('copy');
    copyBtn.textContent = "Copied!";
    setTimeout(() => copyBtn.textContent = "Copy to Clipboard", 2000);
  });

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.className = type; // loading, error, success
    statusDiv.style.display = 'block';
  }
});
