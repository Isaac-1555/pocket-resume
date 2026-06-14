# PocketResume

PocketResume is a Chrome extension that leverages AI (Google Gemini, OpenAI, Anthropic, or OpenRouter) to generate tailored resumes and cover letters based on job descriptions directly from your browser. It analyzes the job posting on your active tab and rewrites your resume to highlight relevant skills and experiences, helping you stand out to recruiters and ATS systems.

## Features

- **AI-Powered Generation:** Generates resumes tailored to the specific job description on your active tab. Supports multiple AI providers: Google Gemini, OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-haiku-20241022`), and OpenRouter.
- **Cover Letter Generation:** Optionally generates a professional, single-page cover letter (250-400 words) alongside your resume with a single click.
- **Contextual Understanding:** Extracts text from the job description page for accurate tailoring.
- **Multiple Layouts & Styles:** Choose from "Professional", "FAANG", "Double Sided", or "Academic CV" resume styles. The cover letter tone adapts to match.
- **PDF Export:** Automatically formats and exports the generated resume (and cover letter) as clean, professional PDFs.
- **State Persistence:** Your selected resume style and cover letter preference are saved across sessions.
- **Privacy Focused:** Your API keys and profile data are stored locally on your device.
- **Customizable Profile:** Save up to 3 master profiles/resumes once and let the AI adapt them for every application.

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
3.  **AI Provider Selection:** 
    -   Click the icon of your preferred AI provider (OpenAI, Anthropic, Google Gemini, or OpenRouter).
    -   Enter the API key for that provider.
    -   Click "Set as Active Provider".
4.  **User Profile:** 
    -   Paste your master resume or a detailed professional summary into the resume text area.
    -   Include your work history, education, skills, and projects. The more detail you provide here, the better the AI can tailor the result.
5.  **Cover Letter Toggle:**
    -   Enable or disable the "Generate Cover Letter" toggle to automatically generate a cover letter alongside your resume.
6.  Click **Save**. PocketResume will save your profile and extract the structured JSON profile automatically when needed.

## Usage

1.  Navigate to a job posting (e.g., LinkedIn, Indeed, company career page).
2.  Click the **PocketResume** extension icon.
3.  Select your desired resume style from the dropdown:
    -   **FAANG:** Dense, metrics-heavy, technical skills first. Ideal for big tech.
    -   **Professional:** Clean, balanced whitespace, standard corporate format.
    -   **Double Sided:** Dense two-column layout with compact side content.
    -   **Academic CV:** Multi-page academic/research CV format.
4.  Click **Generate Resume**.
5.  Wait for the AI to analyze the page and your profile (approx. 10-20 seconds for resume only, 20-40 seconds if cover letter is enabled).
6.  The extension will automatically download the tailored resume as a PDF. If the cover letter toggle is enabled in Settings, a separate cover letter PDF will also be downloaded.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (Vanilla)
- **AI Models:** Multiple providers supported (Gemini, OpenAI GPT-4o-mini, Anthropic Claude 3.5 Haiku, OpenRouter)
- **PDF Generation:** jsPDF
- **Chrome APIs:** Scripting, Storage, Tabs, ActiveTab

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source.
