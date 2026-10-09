#!/usr/bin/env node
/**
 * scripts/linkedin_search.mjs — Search LinkedIn Jobs via Authenticated Session
 *
 * Usage:
 *   node scripts/linkedin_search.mjs --keywords "Junior Backend" --location "Argentina" --limit 5
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, 'data', 'session', 'state.json');

const args = process.argv.slice(2);
function getArg(flag, def) {
  const idx = args.indexOf(flag);
  return (idx !== -1 && args[idx + 1]) ? args[idx + 1] : def;
}

const keywords = getArg('--keywords', 'Junior Backend Developer');
const location = getArg('--location', 'Argentina');
const limit = parseInt(getArg('--limit', '5'), 10);
const remote = args.includes('--remote');

async function searchJobs() {
  if (!fs.existsSync(STATE_FILE)) {
    console.error(JSON.stringify({ error: 'No session found. Run linkedin_session.mjs first.' }));
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const cookies = state.cookies || [];

  const params = new URLSearchParams({
    keywords: keywords,
    location: location,
    f_AL: 'true', // Easy Apply
    sortBy: 'DD'
  });
  if (remote) {
    params.set('f_WT', '2'); // Remote
  }

  const searchUrl = `https://www.linkedin.com/jobs/search/?${params.toString()}`;

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  await context.addCookies(cookies);

  const page = await context.newPage();
  await page.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
  `);

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Scroll down to load jobs
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);

    const jobs = await page.evaluate((max) => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/jobs/view/"]');
      for (const link of links) {
        if (results.length >= max) break;

        const rawHref = link.getAttribute('href') || '';
        const href = (rawHref.startsWith('http') ? rawHref : 'https://www.linkedin.com' + rawHref).split('?')[0];
        const jobId = (href.match(/\/view\/.*?(\d{8,})/i) || href.match(/\/view\/(\d+)/) || [])[1] || '';

        // Try to find parent card or container
        const card = link.closest('.job-card-container, .jobs-search-results__list-item, div[data-job-id], li.ember-view, .base-card, div') || link;
        
        let title = link.innerText.trim();
        const titleEl = card.querySelector('.job-card-list__title, .artdeco-entity-lockup__title, strong, h3');
        if (titleEl && titleEl.innerText.trim().length > 3) {
          title = titleEl.innerText.trim();
        }

        let company = '';
        const companyEl = card.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle, a[href*="/company/"]');
        if (companyEl) company = companyEl.innerText.trim();

        let locationText = '';
        const locEl = card.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption, .job-search-card__location');
        if (locEl) locationText = locEl.innerText.trim();

        // Clean repeated text in titles (e.g. "Title\nTitle")
        if (title.includes('\n')) {
          const lines = title.split('\n').map(l => l.trim()).filter(Boolean);
          title = lines[0] || title;
        }

        if (title && href && !results.some(r => r.url === href || (jobId && r.job_id === jobId))) {
          results.push({
            job_id: jobId,
            title: title,
            company: company,
            location: locationText,
            url: href,
            easy_apply: true
          });
        }
      }
      return results;
    }, limit);

    await browser.close();
    console.log(JSON.stringify({ query: { keywords, location, limit }, count: jobs.length, jobs }, null, 2));
  } catch (err) {
    await browser.close();
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

searchJobs().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
