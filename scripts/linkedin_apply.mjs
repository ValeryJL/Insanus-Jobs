#!/usr/bin/env node
/**
 * scripts/linkedin_apply.mjs — LinkedIn Easy Apply Assistant in Node.js Playwright
 *
 * Usage:
 *   node scripts/linkedin_apply.mjs "<JOB_URL>" [--cv <path-to-pdf>] [--dry-run] [--submit]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, 'data', 'session', 'state.json');
const SCREENSHOT_FILE = path.join(ROOT, 'data', 'session', 'dry_run_review.png');

const args = process.argv.slice(2);
const jobUrl = args.find(a => !a.startsWith('--'));

function getArg(flag, def) {
  const idx = args.indexOf(flag);
  return (idx !== -1 && args[idx + 1]) ? args[idx + 1] : def;
}

import { loadProfile } from './profile_loader.mjs';

const profile = loadProfile();
const cvPath = getArg('--cv', path.join(ROOT, 'output', 'cv.pdf'));
const isSubmit = args.includes('--submit');
const isDryRun = !isSubmit; // Default to dry-run for safety

if (!jobUrl) {
  console.error(JSON.stringify({ error: "Job URL is required. Usage: node scripts/linkedin_apply.mjs <url> [--cv <pdf>] [--dry-run | --submit]" }));
  process.exit(1);
}

const candidate = {
  name: profile.firstName,
  surname: profile.fullName.split(' ').slice(1).join(' ') || 'Candidate',
  fullName: profile.fullName,
  phone: profile.phone.replace(/[^0-9]/g, ''),
  phonePrefix: profile.phone.startsWith('+') ? profile.phone.slice(0, 3) : '+54',
  email: profile.email,
  city: profile.location.split(',')[0]?.trim() || 'City',
  province: profile.location.split(',')[1]?.trim() || 'Province',
  country: profile.location.split(',')[2]?.trim() || "Argentina",
  salaryARS: String(profile.compensation?.minimum || "1500000"),
  salaryUSD: String(profile.compensation?.minimum_usd || "1200"),
  noticeDays: "15",
  english: "Professional working proficiency",
  spanish: "Native",
  years: {
    "java": "2",
    "spring": "1",
    "python": "2",
    "fastapi": "1",
    "sql": "2",
    "postgresql": "2",
    "git": "2",
    "linux": "3",
    "docker": "1",
    "soporte": "2",
    "support": "2",
    "help desk": "2",
    "data entry": "2",
    "excel": "3",
    "c++": "2",
    "c": "2"
  }
};

function answerQuestion(text, qType = "text", options = []) {
  const t = (text || "").toLowerCase().trim();

  // Contact info
  if (t.includes("phone") || t.includes("teléfono") || t.includes("celular") || t.includes("móvil")) {
    return candidate.phone;
  }
  if (t.includes("prefix") || t.includes("prefijo") || t.includes("código de país")) {
    return candidate.phonePrefix;
  }
  if (t.includes("email") || t.includes("correo")) {
    return candidate.email;
  }
  if (t.includes("city") || t.includes("ciudad") || t.includes("localidad")) {
    return candidate.city;
  }

  // Legal / Sponsorship / Rights
  if (t.includes("authorized") || t.includes("autorizado") || t.includes("derecho a trabajar") || t.includes("legally")) {
    return selectYes(options) || "Yes";
  }
  if (t.includes("visa") || t.includes("sponsorship") || t.includes("patrocinio") || t.includes("requieres visa")) {
    return selectNo(options) || "No";
  }
  if (t.includes("18 years") || t.includes("mayor de 18") || t.includes("edad legal")) {
    return selectYes(options) || "Yes";
  }

  // Languages
  if (t.includes("english") || t.includes("inglés")) {
    if (options.length > 0) {
      for (const opt of options) {
        if (/professional|b2|c1|intermediate|intermedio|avanzado/i.test(opt)) return opt;
      }
      return options[0];
    }
    return candidate.english;
  }
  if (t.includes("spanish") || t.includes("español")) {
    if (options.length > 0) {
      for (const opt of options) {
        if (/native|nativo|fluent|fluido/i.test(opt)) return opt;
      }
      return options[0];
    }
    return candidate.spanish;
  }

  // Salary
  if (t.includes("salary") || t.includes("sueldo") || t.includes("remuneración") || t.includes("pretensión") || t.includes("compensation")) {
    if (t.includes("usd") || t.includes("dollar") || t.includes("dólar")) {
      return candidate.salaryUSD;
    }
    return candidate.salaryARS;
  }

  // Availability / Notice period
  if (t.includes("notice") || t.includes("preaviso") || t.includes("start date") || t.includes("incorporación") || t.includes("disponibilidad")) {
    if (options.length > 0) {
      for (const opt of options) {
        if (/immediate|inmediat|15|2 week/i.test(opt)) return opt;
      }
      return options[0];
    }
    return `${candidate.noticeDays} días`;
  }

  // Skills & experience in years
  for (const [skill, yrs] of Object.entries(candidate.years)) {
    if (t.includes(skill)) {
      if (options.length > 0) {
        for (const opt of options) {
          if (opt.includes(yrs)) return opt;
        }
        return options[0];
      }
      return yrs;
    }
  }

  // Generic Yes/No questions (e.g. "Do you have experience with...")
  if (options.length > 0) {
    return selectYes(options);
  }

  if (qType === "number") {
    return "1";
  }

  return "Yes";
}

function selectYes(options) {
  if (!options || options.length === 0) return "Yes";
  for (const o of options) {
    if (/^(yes|sí|si|true)$/i.test(o.trim())) return o;
  }
  return options[0];
}

function selectNo(options) {
  if (!options || options.length === 0) return "No";
  for (const o of options) {
    if (/^(no|false)$/i.test(o.trim())) return o;
  }
  return options[options.length - 1];
}

async function run() {
  if (!fs.existsSync(STATE_FILE)) {
    console.error(JSON.stringify({ error: "Session file not found at " + STATE_FILE }));
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const cookies = state.cookies || [];

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
  `);

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);

    // Extract title, company, description
    const jobInfo = await page.evaluate(() => {
      const title = document.querySelector('h1.t-24, .job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title')?.innerText?.trim() || '';
      const company = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, a[href*="/company/"]')?.innerText?.trim() || '';
      const location = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet')?.innerText?.trim() || '';
      const description = document.querySelector('#job-details, .jobs-description-content__text, .jobs-box__html-content')?.innerText?.trim() || '';
      return { title, company, location, description: description.slice(0, 2000) };
    });

    // Check Easy Apply button
    const applyBtn = page.locator('button.jobs-apply-button, button[aria-label*="Easy Apply"], button[aria-label*="Solicitud sencilla"], button:has-text("Easy Apply"), button:has-text("Solicitud sencilla")').first();
    const hasApply = await applyBtn.count() > 0 && await applyBtn.isVisible();

    if (!hasApply) {
      await browser.close();
      console.log(JSON.stringify({
        success: false,
        error: "Easy Apply button not found (it might be an external application link or closed).",
        jobInfo
      }, null, 2));
      return;
    }

    await applyBtn.click();
    await page.waitForTimeout(2500);

    const modal = page.locator('div.jobs-easy-apply-modal, div[role="dialog"]').first();
    if (await modal.count() === 0) {
      await browser.close();
      console.log(JSON.stringify({ success: false, error: "Application modal did not open.", jobInfo }, null, 2));
      return;
    }

    let steps = 0;
    const maxSteps = 12;
    const questionsAnswered = [];

    while (steps < maxSteps) {
      steps++;
      await page.waitForTimeout(1000);

      // 1. Text / Number / Tel inputs
      const textInputs = await modal.locator('input[type="text"], input[type="number"], input[type="tel"], input:not([type]), textarea').all();
      for (const inp of textInputs) {
        if (await inp.isVisible()) {
          const val = await inp.inputValue();
          if (!val || val.trim() === '') {
            const qType = (await inp.getAttribute('type')) || 'text';
            const ans = answerQuestion(label, qType);
            await inp.click();
            await page.waitForTimeout(Math.floor(Math.random() * 200) + 150);
            await inp.pressSequentially(String(ans), { delay: Math.floor(Math.random() * 45) + 35 });
            questionsAnswered.push({ question: label, answer: String(ans), type: qType });
          }
        }
      }

      // 2. Select dropdowns
      const selects = await modal.locator('select').all();
      for (const sel of selects) {
        if (await sel.isVisible()) {
          const label = (await sel.getAttribute('aria-label')) || (await sel.getAttribute('id')) || 'select';
          const options = await sel.locator('option').allInnerTexts();
          const cleanOpts = options.map(o => o.trim()).filter(Boolean);
          const ans = answerQuestion(label, 'select', cleanOpts);
          try {
            await sel.selectOption({ label: ans });
            questionsAnswered.push({ question: label, answer: ans, type: 'select' });
          } catch {
            // fallback index 1
            if (cleanOpts.length > 1) await sel.selectOption({ index: 1 });
          }
        }
      }

      // 3. Radio groups
      const fieldsets = await modal.locator('fieldset').all();
      for (const fs of fieldsets) {
        if (await fs.isVisible()) {
          const legend = fs.locator('legend').first();
          const qText = (await legend.count()) > 0 ? (await legend.innerText()).trim() : 'radio';
          const radios = await fs.locator('input[type="radio"]').all();
          if (radios.length > 0) {
            const options = [];
            const rMap = new Map();
            for (const r of radios) {
              const rId = await r.getAttribute('id');
              let lbl = '';
              if (rId) {
                const lEl = fs.locator(`label[for="${rId}"]`).first();
                if (await lEl.count() > 0) lbl = (await lEl.innerText()).trim();
              }
              if (!lbl) lbl = (await r.getAttribute('value')) || '';
              options.push(lbl);
              rMap.set(lbl, r);
            }
            const ans = answerQuestion(qText, 'radio', options);
            const targetRadio = rMap.get(ans) || radios[0];
            const isChecked = await targetRadio.isChecked();
            if (!isChecked) {
              await targetRadio.check({ force: true });
              questionsAnswered.push({ question: qText, answer: ans, type: 'radio' });
            }
          }
        }
      }

      // 4. File upload (CV) if requested
      const fileInput = modal.locator('input[type="file"]').first();
      if (await fileInput.count() > 0 && fs.existsSync(cvPath)) {
        try {
          await fileInput.setInputFiles(cvPath);
          questionsAnswered.push({ question: "Resume/CV upload", answer: path.basename(cvPath), type: "file" });
        } catch (e) {
          // already has resume selected
        }
      }

      // 5. Look for primary action button
      const actionBtn = modal.locator('button.artdeco-button--primary').last();
      if (await actionBtn.count() === 0) break;

      const btnText = (await actionBtn.innerText()).trim().toLowerCase();

      if (btnText.includes('submit') || btnText.includes('enviar') || btnText.includes('solicitar')) {
        if (isDryRun) {
          fs.mkdirSync(path.dirname(SCREENSHOT_FILE), { recursive: true });
          await page.screenshot({ path: SCREENSHOT_FILE });

          // Dismiss modal cleanly
          const dismissBtn = modal.locator('button[aria-label="Dismiss"], button.artdeco-modal__dismiss').first();
          if (await dismissBtn.count() > 0) {
            await dismissBtn.click();
            await page.waitForTimeout(1000);
            const discardBtn = page.locator('button:has-text("Discard"), button:has-text("Descartar")').first();
            if (await discardBtn.count() > 0) await discardBtn.click();
          }
          await browser.close();

          console.log(JSON.stringify({
            success: true,
            status: "DryRun",
            jobInfo,
            steps,
            questionsAnswered,
            screenshot: SCREENSHOT_FILE,
            message: "Dry-run successful! Form filled, review screenshot captured, discarded before submission."
          }, null, 2));
          return;
        } else {
          // ACTUAL SUBMIT
          await actionBtn.click();
          await page.waitForTimeout(3500);
          await browser.close();
          console.log(JSON.stringify({
            success: true,
            status: "Applied",
            jobInfo,
            steps,
            questionsAnswered,
            message: "Application submitted successfully."
          }, null, 2));
          return;
        }
      } else if (btnText.includes('review') || btnText.includes('revisar')) {
        if (isDryRun) {
          await actionBtn.click();
          await page.waitForTimeout(2000);
          fs.mkdirSync(path.dirname(SCREENSHOT_FILE), { recursive: true });
          await page.screenshot({ path: SCREENSHOT_FILE });

          const dismissBtn = modal.locator('button[aria-label="Dismiss"], button.artdeco-modal__dismiss').first();
          if (await dismissBtn.count() > 0) {
            await dismissBtn.click();
            await page.waitForTimeout(1000);
            const discardBtn = page.locator('button:has-text("Discard"), button:has-text("Descartar")').first();
            if (await discardBtn.count() > 0) await discardBtn.click();
          }
          await browser.close();

          console.log(JSON.stringify({
            success: true,
            status: "DryRun",
            jobInfo,
            steps,
            questionsAnswered,
            screenshot: SCREENSHOT_FILE,
            message: "Reached review step in dry-run mode. Review screenshot captured."
          }, null, 2));
          return;
        } else {
          await actionBtn.click();
          await page.waitForTimeout(2000);
        }
      } else {
        // Next / Siguiente
        await actionBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    await browser.close();
    console.log(JSON.stringify({
      success: false,
      error: "Wizard completed maximum steps without reaching review or submit button.",
      jobInfo
    }, null, 2));

  } catch (err) {
    await browser.close();
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

run().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
