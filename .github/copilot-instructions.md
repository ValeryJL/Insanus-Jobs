# GitHub Copilot / VS Code Instructions for Insanus-Jobs

When helping the user inside VS Code with GitHub Copilot:

## Project Context
Insanus-Jobs is an AI agent-driven job search and application command center. The AI Agent acts as the copilot and operator, using internal scripts and tools to evaluate offers, tailor CVs, and assist with LinkedIn applications.

## How to Help the User (Agent Actions)

1. **"Buscar puestos" / Search Jobs:**
   - Execute internal search script: `node scripts/linkedin_search.mjs`
   - Present clean summaries of matches with titles, companies, locations, and fit scores.

2. **"Aplicar a este puesto" / Apply to Job:**
   - Review job against `cv.md` and candidate target profile.
   - Always perform a dry-run first: `node scripts/linkedin_apply.mjs --job-url "<URL>" --dry-run`
   - Verify filled fields. Ask for user approval before submitting.

3. **"Compilar CV a PDF" / Generate PDF:**
   - First check formatting: `node scripts/check_cv_format.mjs cv.html --expected-pages 2`
   - If clean, compile: `node scripts/generate_pdf.mjs cv.html output/cv.pdf --format=a4`

4. **"Traducir CV" / Translate CV:**
   - Translate HTML while preserving all classes, styles, and tags: `node scripts/translate_cv.mjs cv.html --to en`
   - Verify layout: `node scripts/check_cv_format.mjs output/cv-en.html --expected-pages 2`
   - Compile PDF: `node scripts/generate_pdf.mjs output/cv-en.html output/cv-en.pdf`

5. **"Verificar sesión de LinkedIn" / Check Session:**
   - Run: `python3 scripts/linkedin_session.py check`
   - If logged out: `python3 scripts/linkedin_session.py login-ui` or import cookies from file.

## Privacy & Safety Rules
- NEVER suggest adding or committing `cv.md`, `cv.html`, `config/profile.yml`, `data/applications.md`, `data/qa-bank.md`, or session cookies to Git.
- Always preserve the human-in-the-loop: verify before submitting any application.
