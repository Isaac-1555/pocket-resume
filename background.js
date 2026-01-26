// background.js

// --- Pipeline Utilities ---
async function captureTabScreenshot(windowId) {
  try {
    // Capture visible tab
    // Note: This is viewport only. Full page capture requires complex scrolling/stitching 
    // or external libraries which might be brittle on dynamic sites.
    // For AI context, viewport + full text is usually sufficient.
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 60 });
    return dataUrl;
  } catch (e) {
    console.warn("Screenshot failed (likely restricted page):", e);
    return null;
  }
}

async function callGemini(apiKey, userProfile, jobDescription, resumeType, screenshotBase64) {
  const model = "gemini-2.5-flash"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Tailor prompt based on type
  let styleGuide = "";
  if (resumeType === "faang") {
    styleGuide = "Use the 'FAANG' style: Single column, black and white, highly dense, focus on metrics/impact (X% improvement, Y$ saved), technical skills first, strict reverse chronological. No summary/objective unless specified. Use strong action verbs.";
  } else if (resumeType === "professional") {
    styleGuide = "Use a 'Professional' style: Clean, balanced whitespace, professional summary at top, clear section headings, standard corporate formatting. Focus on leadership and clarity.";
  } else {
    styleGuide = "Use a 'Basic' style: Simple, easy to read, standard structure. Good for general applications.";
  }

  const prompt = `
    You are an expert Resume Writer.
    
    MY PROFILE:
    ${userProfile}

    JOB DESCRIPTION (extracted text):
    ${jobDescription}

    TASK:
    Write a tailored resume for this job description based on my profile.
    ${styleGuide}
    
    IMPORTANT: 
    - Output strictly valid JSON.
    - Do NOT use Markdown code blocks (like \`\`\`json). Just output the raw JSON string.
    - If you must use code blocks, I will strip them, but prefer raw text.
    - Schema:
    {
      "name": "String (My Name)",
      "contact": "String (Phone | Email | LinkedIn | Location)",
      "summary": "String (Professional Summary - keep it concise)",
      "experience": [
        { 
          "title": "String", 
          "company": "String", 
          "location": "String",
          "period": "String", 
          "points": ["String", "String"] 
        }
      ],
      "education": [
         { "degree": "String", "school": "String", "year": "String", "location": "String" }
      ],
      "skills": ["String", "String"],
      "certifications": [
        { "name": "String", "issuer": "String", "year": "String" }
      ],
      "projects": [
        { "name": "String", "description": "String", "link": "String (Optional)" }
      ]
    }
    - Do not invent facts. Rephrase existing profile data to match JD keywords.
    - Ensure bullet points are impactful (Action Verb + Context + Result).
  `;

  // Prepare body
  const parts = [{ text: prompt }];

  // Add image if available (Multi-modal)
  if (screenshotBase64) {
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: screenshotBase64.split(',')[1] 
      }
    });
  }

  const requestBody = {
    contents: [{ parts: parts }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini API Error");
  }

  return data.candidates[0].content.parts[0].text;
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_GENERATION') {
    
    // Async execution wrapper
    (async () => {
      try {
        const { tabId, resumeType } = message.payload;

        // 1. Get Settings
        const settings = await chrome.storage.local.get(['geminiApiKey', 'userProfile']);
        if (!settings.geminiApiKey || !settings.userProfile) {
          throw new Error("Please set your API Key and Profile in the extension settings.");
        }

        // 2. Get Tab Info for Window ID
        const tab = await chrome.tabs.get(tabId);

        // 3. Get Content from Tab
        const contentData = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (response) => {
            if (chrome.runtime.lastError) {
              // Inject if missing
              chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
              }, () => {
                 chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' }, (res) => {
                   if (chrome.runtime.lastError) resolve({ text: "" }); // Fallback
                   else resolve(res);
                 });
              });
            } else {
              resolve(response);
            }
          });
        });

        // 4. Capture Screenshot (Viewport)
        // Pass the correct windowId from the tab object
        const screenshot = await captureTabScreenshot(tab.windowId);

        // 5. Call Pipeline (Gemini)
        const resumeText = await callGemini(
          settings.geminiApiKey,
          settings.userProfile,
          contentData.text ? contentData.text.substring(0, 40000) : "No text found on page.",
          resumeType,
          screenshot
        );

        // 6. Success
        sendResponse({ status: 'success', data: resumeText });

      } catch (error) {
        console.error("Pipeline Error:", error);
        sendResponse({ status: 'error', message: error.message });
      }
    })();

    return true; // Keep channel open
  }
});
