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

function getResumeStyleConfig(selectedStyle) {
  switch (selectedStyle) {
    case "jake":
      return { promptStyle: "faang", layout: "jake" };
    case "deedy":
      return { promptStyle: "faang", layout: "deedy" };
    case "academic-cv":
      return { promptStyle: "academic-cv", layout: "academic-cv" };
    case "professional":
      return { promptStyle: "professional", layout: "pocketresume" };
    case "faang":
      return { promptStyle: "faang", layout: "pocketresume" };
    case "basic":
    default:
      return { promptStyle: "basic", layout: "pocketresume" };
  }
}

async function callGemini(apiKey, userProfile, jobDescription, resumeStyle, screenshotBase64, subtitleEnabled) {
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const styleConfig = getResumeStyleConfig(resumeStyle);
  const selectedLayout = styleConfig.layout;

  let styleGuide = "";
  if (styleConfig.promptStyle === "academic-cv") {
    styleGuide = "Use an academic CV style: emphasize research, publications, teaching, service, academic distinctions, and faithful chronology. Preserve factual detail without forcing everything into an industry-resume framing.";
  } else if (styleConfig.promptStyle === "faang") {
    styleGuide = "Use the 'FAANG' style: Single column, black and white, highly dense, focus on metrics/impact (X% improvement, Y$ saved), technical skills first, strict reverse chronological. No summary/objective unless specified. Use strong action verbs.";
  } else if (styleConfig.promptStyle === "professional") {
    styleGuide = "Use a 'Professional' style: Clean, balanced whitespace, professional summary at top, clear section headings, standard corporate formatting. Focus on leadership and clarity.";
  } else {
    styleGuide = "Use a 'Basic' style: Simple, easy to read, standard structure. Good for general applications.";
  }

  const subtitleInstruction = subtitleEnabled
    ? "Generate a tailored professional tagline/subtitle for this specific job (e.g. 'Technical Product Manager - B2B SaaS & Internal Tools'). Keep it under 10 words."
    : "Copy the professional tagline/subtitle exactly as it appears in my profile. If none exists, create a brief one under 10 words.";

  let layoutGuide = "Use the current PocketResume layout structure: summary, skills, experience, featured projects, education, and certifications.";
  let documentTask = "Write a tailored, ONE-PAGE resume for this job description based on my profile.";
  let pageRule = "The final PDF will be rendered on a single US-Letter page. Keep bullet points concise so everything fits.";
  let bulletRule = "Each experience/project bullet point MUST be a single concise line (under ~120 characters). Use short impact statements: Action Verb + Result. Do NOT write multi-line bullet points.";

  if (selectedLayout === "jake") {
    layoutGuide = "Use a Jake-style layout adapted for PocketResume: ATS-safe, single-column, compact section rules, technical skills before education, concise publications summary, and honors/awards if present.";
  } else if (selectedLayout === "deedy") {
    layoutGuide = "Use a Deedy-style layout adapted for PocketResume: dense two-column industry resume. Prefer skills, links, open-source projects, and education for left-column-friendly content, and experience, selected projects, publications, and awards for right-column-friendly content.";
  } else if (selectedLayout === "academic-cv") {
    layoutGuide = "Use an academic CV layout adapted for PocketResume: multi-page is allowed, with education, research/work experience, research projects, publications, honors, teaching, and service only when those sections are supported by the source profile.";
    documentTask = "Write a tailored academic/research CV for this job description based on my profile.";
    pageRule = "The final PDF may span multiple pages when needed. Stay concise, but do not force the document onto one page.";
    bulletRule = "Use concise, impact-focused bullets when appropriate, but academic CV sections may also contain short descriptive detail lines where needed.";
  }

  const prompt = `
    You are an expert Resume/CV Writer.
    
    MY PROFILE:
    ${userProfile}

    JOB DESCRIPTION (extracted text):
    ${jobDescription}

    TASK:
    ${documentTask}
    ${styleGuide}
    ${layoutGuide}

    CONTENT RULES (critical — preserve all profile content):
    - ${pageRule}
    - Include ALL experiences from my profile. Do NOT drop any. Tailor bullet point wording to match JD keywords.
    - Include ALL projects from my profile. Do NOT drop any. Tailor bullet point wording to match JD keywords.
    - Include ALL education entries from my profile.
    - Include ALL skills from my profile. Reorder so the most JD-relevant skills appear first.
    - Include ALL certifications from my profile as a flat list.
    - If the profile clearly includes links, honors/awards, publications, teaching, service, or academic distinctions, include them in the structured fields below.
    - ${bulletRule}
    - Professional summary: 2-3 sentences max unless the academic CV layout needs a slightly longer profile section.
    - Treat my profile as the authoritative source for structure. Mirror its sections and entries — your job is to rephrase and tailor language, not to filter or remove content.
    - ${subtitleInstruction}
    
    IMPORTANT:
    - Output strictly valid JSON.
    - Do NOT use Markdown code blocks (like \`\`\`json). Just output the raw JSON string.
    - If you must use code blocks, I will strip them, but prefer raw text.
    - Schema:
    {
      "name": "String (My Name)",
      "subtitle": "String (Professional tagline — see subtitle instruction above)",
      "position": "String (Optional concise role/title for dense or academic layouts)",
      "location": "String (Optional header location if available)",
      "contact": "String (Include ALL contact info from my profile: Phone, Email, LinkedIn, Portfolio/Website, Location, etc. — separated by | )",
      "summary": "String",
      "skills": ["String", "String"],
      "skillGroups": [
        { "label": "String", "items": ["String"] }
      ],
      "links": [
        { "label": "String", "text": "String", "url": "String" }
      ],
      "experience": [
        {
          "title": "String",
          "company": "String",
          "location": "String",
          "period": "String",
          "points": ["String"]
        }
      ],
      "projects": [
        {
          "title": "String",
          "platform": "String",
          "period": "String",
          "points": ["String"],
          "description": "String",
          "url": "String",
          "stars": "String",
          "venue": "String"
        }
      ],
      "openSourceProjects": [
        {
          "title": "String",
          "description": "String",
          "url": "String",
          "stars": "String",
          "venue": "String"
        }
      ],
      "education": [
        { "degree": "String", "school": "String", "year": "String", "location": "String", "details": ["String"] }
      ],
      "certifications": ["String"],
      "honors": [
        { "title": "String", "issuer": "String", "year": "String", "detail": "String" }
      ],
      "publicationsSummary": "String",
      "publications": [
        { "title": "String", "venue": "String", "year": "String", "authors": "String", "detail": "String", "citations": "String", "url": "String" }
      ],
      "researchInterests": ["String"],
      "teaching": [
        { "title": "String", "organization": "String", "period": "String", "details": ["String"] }
      ],
      "service": [
        { "title": "String", "organization": "String", "period": "String", "details": ["String"] }
      ]
    }
    - Do not invent facts. Rephrase existing profile data to match JD keywords.
    - IMPORTANT: If a specific field is NOT provided in the source profile, leave string fields as "" and array fields as []. Do NOT put "N/A", "Unknown", "Ongoing", or "Present".
    - Ensure bullet points are impactful (Action Verb + Context + Result) and concise unless the academic CV layout needs a short descriptive detail line.
  `;

  const parts = [{ text: prompt }];

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

async function callGeminiCoverLetter(apiKey, userProfile, jobDescription, resumeStyle, screenshotBase64) {
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const styleConfig = getResumeStyleConfig(resumeStyle);

  let toneGuide = "";
  if (styleConfig.promptStyle === "faang") {
    toneGuide = "Use a confident, results-driven tone. Emphasize measurable impact, technical depth, and scale of systems worked on.";
  } else if (styleConfig.promptStyle === "professional" || styleConfig.promptStyle === "academic-cv") {
    toneGuide = "Use a polished, corporate tone. Emphasize leadership, strategic thinking, and professional accomplishments.";
  } else {
    toneGuide = "Use a clear, approachable, and professional tone. Keep it straightforward and sincere.";
  }

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = `
    You are an expert Cover Letter Writer.
    
    TODAY'S DATE: ${today}

    MY PROFILE:
    ${userProfile}

    JOB DESCRIPTION (extracted text):
    ${jobDescription}

    TASK:
    Write a professional cover letter for this specific job based on my profile.
    ${toneGuide}
    
    CONSTRAINTS:
    - Target length: 250-350 words (3-4 short paragraphs).
    - Absolute maximum: 400 words.
    - The letter MUST fit on a single page. Do NOT write a multi-page letter.
    - Professional, corporate tone appropriate for business correspondence.
    - Do NOT invent facts. Use only information from the provided profile.
    - Tailor the letter specifically to the job description. Reference the company and role.
    - Opening paragraph: Express enthusiasm for the specific role and company. Briefly state why you are a strong fit.
    - Body paragraphs (1-2): Highlight relevant experience, skills, and accomplishments that directly match the JD requirements. Use specific examples from the profile.
    - Closing paragraph: Reiterate interest, express eagerness to discuss further, and include a professional call to action.

    IMPORTANT:
    - Output strictly valid JSON.
    - Do NOT use Markdown code blocks (like \`\`\`json). Just output the raw JSON string.
    - If you must use code blocks, I will strip them, but prefer raw text.
    - Schema:
    {
      "applicant_name": "String (My full name)",
      "applicant_contact": "String (Phone | Email | Location)",
      "date": "String (Use TODAY'S DATE provided above, formatted as: Month Day, Year e.g. 'February 10, 2026')",
      "recipient_name": "String (Hiring manager name from JD if available, else 'Hiring Manager')",
      "recipient_title": "String (Hiring manager title from JD if available, else empty string)",
      "company_name": "String (Company name from JD)",
      "company_address": "String (Company address from JD if available, else empty string)",
      "job_title": "String (Position title being applied for)",
      "greeting": "String (e.g. 'Dear Hiring Manager,' or 'Dear Mr./Ms. LastName,')",
      "opening_paragraph": "String (First paragraph - enthusiasm and fit)",
      "body_paragraphs": ["String (Supporting paragraph 1)", "String (Optional supporting paragraph 2)"],
      "closing_paragraph": "String (Final paragraph - call to action)",
      "sign_off": "String (e.g. 'Sincerely,')"
    }
    - IMPORTANT: If a specific field is NOT available from the job description or profile, leave it as an empty string "". Do NOT put "N/A", "Unknown", or placeholders.
  `;

  const parts = [{ text: prompt }];

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
    throw new Error(data.error?.message || "Gemini API Error (Cover Letter)");
  }

  return data.candidates[0].content.parts[0].text;
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_GENERATION') {
    
    // Async execution wrapper
    (async () => {
      try {
        const { tabId, resumeStyle, resumeType, resumeLayout, resumeId, subtitleEnabled } = message.payload;
        const selectedResumeStyle =
          resumeStyle ||
          (resumeLayout === 'jake' ? 'jake' :
            resumeLayout === 'deedy' ? 'deedy' :
            resumeLayout === 'academic-cv' ? 'academic-cv' :
            resumeType || 'basic');

        // 1. Get Settings
        const settings = await chrome.storage.local.get(['geminiApiKey', 'resumes', 'userProfile', 'coverLetterEnabled']);
        if (!settings.geminiApiKey) {
          throw new Error("Please set your API Key in the extension settings.");
        }

        // Resolve the user profile content from the resumes array (or fallback to legacy userProfile)
        let userProfile = '';
        if (settings.resumes && settings.resumes.length > 0) {
          // Find the selected resume by ID, or fall back to first resume
          const selected = settings.resumes.find(r => r.id === resumeId) || settings.resumes[0];
          userProfile = selected.content || '';
        } else if (settings.userProfile) {
          // Legacy fallback
          userProfile = settings.userProfile;
        }

        if (!userProfile.trim()) {
          throw new Error("Please add your resume/profile content in the extension settings.");
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

        const jobText = contentData.text ? contentData.text.substring(0, 40000) : "No text found on page.";

        // 5. Call Pipeline (Gemini) - Resume
        const resumeText = await callGemini(
          settings.geminiApiKey,
          userProfile,
          jobText,
          selectedResumeStyle,
          screenshot,
          subtitleEnabled
        );

        // 6. Conditionally generate cover letter
        let coverLetterText = null;
        if (settings.coverLetterEnabled) {
          coverLetterText = await callGeminiCoverLetter(
            settings.geminiApiKey,
            userProfile,
            jobText,
            selectedResumeStyle,
            screenshot
          );
        }

        // 7. Success
        sendResponse({ status: 'success', data: resumeText, coverLetterData: coverLetterText });

      } catch (error) {
        console.error("Pipeline Error:", error);
        sendResponse({ status: 'error', message: error.message });
      }
    })();

    return true; // Keep channel open
  }
});
