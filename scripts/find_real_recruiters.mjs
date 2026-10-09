import path from 'path';
import { chromium } from 'playwright';

import fs from 'fs';

function loadUrls() {
  const arg = process.argv[2];
  if (arg) {
    try {
      if (fs.existsSync(arg)) {
        return JSON.parse(fs.readFileSync(arg, 'utf-8'));
      }
      return JSON.parse(arg);
    } catch (e) {
      if (arg.startsWith('http')) {
        return [{ company: 'Target Company', url: arg }];
      }
    }
  }
  return [
    { company: 'Sample Company', url: 'https://www.linkedin.com/jobs/view/123456789/' }
  ];
}

const URLS = loadUrls();

async function inspectRecruiters() {
  const userDir = path.resolve('data/session/persistent_chrome');
  const context = await chromium.launchPersistentContext(userDir, {
    headless: false,
    executablePath: '/usr/bin/google-chrome',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--ignore-certificate-errors']
  });

  const page = context.pages()[0] || await context.newPage();
  const results = [];

  for (const item of URLS) {
    console.log(`\nNavigating to ${item.company}: ${item.url}`);
    await page.goto(item.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {
      // Look for hiring team / recruiter card
      const hiringTeamCard = document.querySelector('.hirer-card, [data-test-hirer-card], .jobs-poster, .jobs-hirer-card, section:has(.jobs-poster)');
      let recruiterInfo = null;

      if (hiringTeamCard) {
        const nameEl = hiringTeamCard.querySelector('h3, .jobs-poster__name, strong, a');
        const headlineEl = hiringTeamCard.querySelector('.jobs-poster__headline, p, span');
        const linkEl = hiringTeamCard.querySelector('a[href*="/in/"]');
        recruiterInfo = {
          name: nameEl ? nameEl.innerText.trim() : null,
          headline: headlineEl ? headlineEl.innerText.trim() : null,
          linkedinUrl: linkEl ? linkEl.href : null,
          rawText: hiringTeamCard.innerText.replace(/\n+/g, ' | ')
        };
      } else {
        // Search text for poster / anunciante / publicado por
        const allText = document.body.innerText;
        const match = allText.match(/(?:Publicado por|Conoce a la persona que publica|Meet the hiring team|Job poster)[\s\S]{1,200}/i);
        if (match) {
          recruiterInfo = { rawText: match[0].replace(/\n+/g, ' | ') };
        }
      }

      return { recruiterInfo };
    });

    console.log(`Result for ${item.company}:`, JSON.stringify(data, null, 2));
    results.push({ ...item, ...data });
  }

  await context.close();
  return results;
}

inspectRecruiters().catch(console.error);
