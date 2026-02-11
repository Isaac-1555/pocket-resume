# PocketResume

PocketResume is a Chrome extension that leverages Google's Gemini AI to generate tailored resumes and cover letters based on job descriptions directly from your browser. It analyzes the job posting on your active tab and rewrites your resume to highlight relevant skills and experiences, helping you stand out to recruiters and ATS systems.

## Features

- **AI-Powered Generation:** Generates resumes tailored to the specific job description on your active tab using Google Gemini 2.5 Flash.
- **Cover Letter Generation:** Optionally generates a professional, single-page cover letter (250-400 words) alongside your resume with a single click.
- **Contextual Understanding:** Captures both text and screenshots of the job description for accurate tailoring.
- **Multiple Styles:** Choose from "FAANG" (dense, impact-focused), "Professional" (balanced), or "Basic" (simple) resume styles. The cover letter tone adapts to match.
- **PDF Export:** Automatically formats and exports the generated resume (and cover letter) as clean, professional PDFs.
- **State Persistence:** Your selected resume style and cover letter preference are saved across sessions.
- **Privacy Focused:** Your API key and profile data are stored locally on your device.
- **Customizable Profile:** Save your master profile once and let the AI adapt it for every application.

## Installation

Since this extension is not yet in the Chrome Web Store, you need to install it manually:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/pocketresume.git
    cd pocketresume
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```
    *Note: This project uses `npm` to manage dependencies like `jspdf`.*

3.  **Load into Chrome:**
    1.  Open Chrome and navigate to `chrome://extensions`.
    2.  Enable **Developer mode** in the top right corner.
    3.  Click **Load unpacked** in the top left.
    4.  Select the `PocketResume` directory (the folder containing `manifest.json`).

## Configuration

Before generating resumes, you need to set up your API key and profile:

1.  Click the **PocketResume** extension icon in your toolbar.
2.  Click the **Settings** (gear) icon, or right-click the extension icon and select **Options**.
3.  **Gemini API Key:** 
    -   Get a free API key from [Google AI Studio](https://aistudio.google.com/).
    -   Paste it into the "Gemini API Key" field.
4.  **User Profile:** 
    -   Paste your master resume or a detailed professional summary into the "Your Profile / Master Resume" text area.
    -   Include your work history, education, skills, and projects. The more detail you provide here, the better the AI can tailor the result.
5.  **Cover Letter Toggle:**
    -   Enable or disable the "Generate Cover Letter" toggle to automatically generate a cover letter alongside your resume.
6.  Click **Save**.

## Usage

1.  Navigate to a job posting (e.g., LinkedIn, Indeed, company career page).
2.  Click the **PocketResume** extension icon.
3.  Select your desired resume style from the dropdown:
    -   **FAANG:** Dense, metrics-heavy, technical skills first. Ideal for big tech.
    -   **Professional:** Clean, balanced whitespace, standard corporate format.
    -   **Basic:** Simple structure, easy to read.
4.  Click **Generate Resume**.
5.  Wait for the AI to analyze the page and your profile (approx. 10-20 seconds for resume only, 20-40 seconds if cover letter is enabled).
6.  The extension will automatically download the tailored resume as a PDF. If the cover letter toggle is enabled in Settings, a separate cover letter PDF will also be downloaded.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (Vanilla)
- **AI Model:** Google Gemini 2.5 Flash
- **PDF Generation:** jsPDF
- **Chrome APIs:** Scripting, Storage, Tabs, ActiveTab

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source.
