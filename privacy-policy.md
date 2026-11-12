# Privacy Policy for Pocket Resume

**Last updated:** November 2026

Pocket Resume is a Chrome extension designed to help users create, store, and view resumes and cover letters directly within their browser, using an on-device resume engine. Optional features you start — the Resume health check and Generate letter — use a third-party AI provider; nothing is sent unless you click their buttons.

Your privacy is important. This policy explains what data Pocket Resume collects, how it is used, and how it is transmitted.

## Information Collection and Use

Pocket Resume collects and processes the following user data to provide its core functionality:

### Data Collected

* **User Profile Information**: Professional details you enter in the extension settings (such as work experience, education, skills, and contact information)
* **Job Description Content**: Text extracted from job posting web pages you are viewing

### How Data is Used

This data is used solely to generate tailored resumes and cover letters based on your profile and the job description you are viewing. No data is collected for advertising purposes.

## Data Transmission

**Resume generation is local.** Resume generation runs inside the extension: your saved resume and the job posting text stay in the browser, and the resume is aligned to the posting with deterministic rules. The extension does not ask for or store API keys.

**Optional AI features.** Two features can send data to an AI provider, and only after you start them:

- **Resume health check** — sends a redacted copy of the selected resume to [Pollinations](https://pollinations.ai); if that fails, it falls back to a local Ollama server at `http://localhost:11434` on your machine.
- **Generate letter** (Settings → Cover letter) — sends a redacted copy of the selected resume to the same Pollinations endpoint, with the same local Ollama fallback, to write a general cover letter body.

Before sending, name, email, phone, location, and link URLs are replaced with redaction markers. No job-posting text, page content, or browsing history is included, and no identifiers are stored by the extension after the reply is returned.

### Accounts and Cloud Sync (optional)

Signing in is optional for editing and required for generation. If you create an account:

- Authentication and plan checks run through [Clerk](https://clerk.com).
- Resumes you choose to sync are stored in the developer's [Convex](https://convex.dev) deployment, keyed to your account, so they can be restored on another device.
- No job-posting text, page content, or browsing history is sent to Clerk or Convex.
- Signing out stops sync; deleting a resume records a local tombstone that is also removed from the cloud.

## Skill Directory Download

To recognise skills in job descriptions, the extension downloads a public skill vocabulary from the O*NET Resource Center (`onetcenter.org`) — the U.S. Department of Labor occupational database, licensed CC BY 4.0. This is a plain GET for a public data file. **No personal data, resume content, job text, or identifiers are sent.** The file is parsed locally and the result is stored in your browser. The vocabulary is checked once a day when the extension starts or Settings is opened, and the CSV files are only re-downloaded when O*NET publishes a new release. There is no toggle; the extension also ships a bundled snapshot so the engine works before the first download.

## Local Data Storage

Pocket Resume stores the following data locally on your device using Chrome's built-in storage APIs:

* Your resume profiles (structured JSON form data), each with its own cover letter
* Your preferences (selected resume style, tracker capture toggle)
* Generated resumes, cover letters, and captured job applications

This locally stored data:
* Remains entirely under your control
* Can be removed at any time by clearing the extension's data or uninstalling the extension

## Data Security

* Account and sync traffic uses HTTPS
* Resume data is stored locally in Chrome's extension storage; cloud copies exist only when you are signed in and sync is enabled
* Job-posting text is never uploaded or stored on external servers

## Permissions

Pocket Resume requests only the permissions necessary for core functionality:

* **Active Tab**: To read the job posting in the tab you are generating for
* **Storage**: To save your resume profiles, preferences, tracker cards, and generated documents locally
* **Scripting**: To extract text content from the job posting page when the content script is not already present
* **Alarms**: To schedule the daily skill-vocabulary check; no browsing data is read
* **Downloads**: To save generated resume and cover-letter PDFs reliably
* **Host Permissions**: To reach Clerk (sign-in), Convex (optional resume sync), Pollinations (opt-in Resume health check and Generate letter), and the public O*NET skill vocabulary (`onetcenter.org`)
* **Optional Host Permissions**: Requested only when you turn on the local Ollama fallback — `http://localhost:11434`. Chrome asks for your explicit consent before granting it; you can revoke it at any time in Chrome's extension settings.

These permissions are used exclusively to enable the resume and cover letter generation features and are not used to collect data for other purposes.

## Data Retention

* **Local Data**: Stored until you clear the extension's data or uninstall the extension
* **Synced Data**: Cloud resume copies remain until you delete the resume while signed in or delete your account

## User Control

You can:
* View and edit your stored profile at any time through the extension settings
* Delete all locally stored data by clearing extension data or uninstalling the extension
* Sign out at any time to stop cloud sync
* Choose when to initiate generation; job text is only read when you click generate

## Changes to This Policy

If the privacy policy changes, updates will be posted on this page with a revised "Last updated" date.

## Contact

If you have questions about this privacy policy, you can contact the developer via the website or the GitHub repository:

https://pocket-resume.xyz

https://github.com/Isaac-1555/pocket-resume
