# Security Policy

## Supported Versions

Only the latest version of PocketResume on `main` receives security updates. Older versions are not patched.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

**Please do not file a public issue for security vulnerabilities.**

Use one of these private channels:

1. **Preferred:** [GitHub Security Advisories](../../security/advisories/new) — private disclosure to maintainers
2. **Alternative:** Open a private issue / contact the maintainer via GitHub profile

Include as much of the following as you can:

- Description of the vulnerability and impact
- Reproduction steps / proof of concept
- Affected version(s)
- Your assessment of severity
- Suggested fix (optional)

You should receive an acknowledgment within 72 hours. A fix timeline will be discussed after triage.

## Scope

In scope:

- Content script injection / XSS via crafted pages
- Prompt injection against the AI provider calls
- API key exposure in storage or logs
- Cloud sync auth bypass (Clerk / Convex)
- Permissions or host_permissions abuse in `manifest.json`
- Unsafe PDF generation (code execution via crafted JSON)

Out of scope:

- Vulnerabilities in upstream dependencies (Gemini SDK, OpenAI SDK, Clerk, Convex, jsPDF) — report to those projects
- Social engineering or phishing
- Denial of service against the AI provider endpoints

## Safe Harbor

We will not pursue legal action against researchers who:
- Make a good-faith effort to avoid privacy violations, data destruction, or service disruption
- Only interact with accounts they own or have explicit permission to access
- Stop testing immediately if they encounter user data and report it
- Do not exploit a vulnerability beyond what is necessary to demonstrate it
