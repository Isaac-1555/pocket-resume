# Privacy Policy for Pocket Resume

**Last updated:** February 2026

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

To provide AI-powered resume and cover letter generation, Pocket Resume transmits data to **Google's Gemini API** (generativelanguage.googleapis.com). Specifically:

### What is Sent

When you initiate resume generation, the extension sends the following to Google's Gemini API via HTTPS POST requests:

1. **Prompt Data (text)**: A text prompt containing:
   - Your user profile information (as entered in settings)
   - The extracted text content from the current job posting page
   - Instructions for resume formatting
   - If cover letter generation is enabled, a separate request is made with instructions for cover letter formatting

2. **Inline Data (image)**: A JPEG screenshot of the current browser tab viewport (the job posting page) to provide additional visual context for the AI

### Purpose of Transmission

This data is transmitted solely to generate a tailored resume (and optionally a cover letter) using Google's Gemini AI model. The API processes the data and returns structured content in JSON format.

### API Key

The extension requires you to provide your own Google Gemini API key. This key is stored locally in your browser and is used to authenticate requests to Google's API. The API key is never shared with anyone other than Google's API services.

### Google's Privacy Practices

Data sent to Google's Gemini API is subject to Google's privacy policies and terms of service. Please refer to:
- [Google Cloud Privacy Notice](https://cloud.google.com/terms/cloud-privacy-notice)
- [Google API Terms of Service](https://developers.google.com/terms)

## Local Data Storage

Pocket Resume stores the following data locally on your device using Chrome's built-in storage APIs:

* Your user profile information
* Your Gemini API key
* Your preferences (cover letter toggle, selected resume style)
* Generated resumes and cover letters

This locally stored data:
* Remains entirely under your control
* Can be removed at any time by clearing the extension's data or uninstalling the extension

## Data Security

* All data transmitted to Google's Gemini API is sent over secure HTTPS connections
* Your API key and profile data are stored locally in Chrome's secure extension storage
* No data is stored on external servers controlled by the extension developer

## Permissions

Pocket Resume requests only the permissions necessary for core functionality:

* **Active Tab / Tab Capture**: To capture screenshots and extract text from job posting pages
* **Storage**: To save your profile, API key, preferences, and generated documents locally
* **Scripting**: To extract text content from web pages

These permissions are used exclusively to enable the resume and cover letter generation features and are not used to collect data for other purposes.

## Data Retention

* **Local Data**: Stored until you clear the extension's data or uninstall the extension
* **Data Sent to Google**: Retention is governed by Google's data policies. The extension developer does not have access to or control over data processed by Google's API

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
