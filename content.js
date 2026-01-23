// content.js
console.log("PocketResume Content Script Ready");

function extractPageText() {
  // Simple extraction: Get the main body text
  // We could use readibility libraries, but innerText is often enough for LLMs
  const bodyText = document.body.innerText;
  
  // Clean up excessive whitespace
  return bodyText.replace(/\s+/g, ' ').trim().substring(0, 100000); // Limit to 100k chars
}

// Listen for direct requests from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PAGE_CONTENT') {
    const text = extractPageText();
    sendResponse({ text: text, title: document.title, url: window.location.href });
  }
  return true;
});
