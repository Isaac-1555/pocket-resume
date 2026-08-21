# Privacy Policy for Pocket Resume

**Last updated:** May 2026

Pocket Resume is a Chrome extension designed to help users create, store, and view resumes and cover letters directly within their browser, with AI-powered generation capabilities.

Your privacy is important. This policy explains what data Pocket Resume collects, how it is used, and how it is transmitted.

## Information Collection and Use

Pocket Resume collects and processes the following user data to provide its core functionality:

### Data Collected

* **User Profile Information**: Professional details you enter in the extension settings (such as work experience, education, skills, and contact information)
* **Job Description Content**: Text extracted from job posting web pages you are viewing
* **Page Screenshots**: A screenshot (viewport image) of the job posting page you are viewing

### How Data is Used

This data is used solely to generate tailored resumes and cover letters based on your profile and the job description you are viewing. No data is collected for advertising, analytics, or tracking purposes.

## Data Transmission to Third-Party Services

To provide AI-powered resume and cover letter generation, Pocket Resume transmits data to whichever AI Provider you have selected in your settings (**Google Gemini, OpenAI, Anthropic, or OpenRouter**). Specifically:

### What is Sent

When you initiate resume generation, the extension sends the following to your chosen AI provider via HTTPS POST requests:

1. **Prompt Data (text)**: A text prompt containing:
   - Your user profile information (as entered in settings)
   - The extracted text content from the current job posting page
   - Instructions for resume formatting
   - If cover letter generation is enabled, a separate request is made with instructions for cover letter formatting

2. **Inline Data (image)**: If supported and enabled by the current provider, a JPEG screenshot of the current browser tab viewport (the job posting page) to provide additional visual context for the AI.

### Purpose of Transmission

This data is transmitted solely to generate a tailored resume (and optionally a cover letter) using the selected AI model. The API processes the data and returns structured content in JSON format.

### API Keys

The extension requires you to provide your own API key for your chosen provider. These keys are stored locally in your browser and are used to authenticate requests to the respective API. Your API keys are never shared with anyone other than the specific API service they belong to.

### Provider Privacy Practices

Data sent to your chosen AI provider is subject to their respective privacy policies and terms of service. Please refer to:
- [Google Cloud Privacy Notice](https://cloud.google.com/terms/cloud-privacy-notice)
- [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy/)
- [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- [OpenRouter Privacy Policy](https://openrouter.ai/privacy)

## Local Data Storage

Pocket Resume stores the following data locally on your device using Chrome's built-in storage APIs:

* Your user profile information
* Your API keys
* Your preferences (cover letter toggle, selected resume style, active AI provider)
* Generated resumes and cover letters

This locally stored data:
* Remains entirely under your control
* Can be removed at any time by clearing the extension's data or uninstalling the extension

## Data Security

* All data transmitted to AI APIs is sent over secure HTTPS connections
* Your API keys and profile data are stored locally in Chrome's secure extension storage
* No data is stored on external servers controlled by the extension developer

## Permissions

Pocket Resume requests only the permissions necessary for core functionality:

* **Active Tab / Tab Capture**: To capture screenshots and extract text from job posting pages
* **Storage**: To save your profile, API key, preferences, and generated documents locally
* **Scripting**: To extract text content from web pages
* **Host Permissions**: To bypass CORS restrictions specifically for communicating with the supported AI provider APIs (`api.openai.com`, `api.anthropic.com`, `openrouter.ai`, and `generativelanguage.googleapis.com`)
* **Optional Host Permissions**: If you add a custom or local endpoint (e.g. Ollama, LM Studio, NVIDIA NIM), Chrome will ask for your explicit consent before the extension is granted access to that endpoint's domain. You can revoke this at any time in Chrome's extension permission settings.

These permissions are used exclusively to enable the resume and cover letter generation features and are not used to collect data for other purposes.

## Data Retention

* **Local Data**: Stored until you clear the extension's data or uninstall the extension
* **Data Sent to Providers**: Retention is governed by the respective AI provider's data policies. The extension developer does not have access to or control over data processed by these APIs.

## User Control

You can:
* View and edit your stored profile at any time through the extension settings
* Delete all locally stored data by clearing extension data or uninstalling the extension
* Choose when to initiate resume generation (data is only sent when you click the generate button)

## Changes to This Policy

If the privacy policy changes, updates will be posted on this page with a revised "Last updated" date.

## Contact

If you have questions about this privacy policy, you can contact the developer via the GitHub repository:

https://github.com/Isaac-1555/pocket-resume
