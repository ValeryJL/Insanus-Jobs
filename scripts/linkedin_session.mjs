#!/usr/bin/env node
/**
 * scripts/linkedin_session.mjs — Node.js LinkedIn Session Manager
 *
 * Verifies session, injects cookies, and tests authentication against LinkedIn feed.
 *
 * Usage:
 *   node scripts/linkedin_session.mjs check
 *   node scripts/linkedin_session.mjs import <cookies.json>
 *   node scripts/linkedin_session.mjs set-liat <li_at_cookie_value>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_DIR = path.join(ROOT, 'data', 'session');
const STATE_FILE = path.join(SESSION_DIR, 'state.json');

fs.mkdirSync(SESSION_DIR, { recursive: true });

const args = process.argv.slice(2);
const command = args[0] || 'check';

async function checkSession() {
  console.log('🔍 Checking LinkedIn authentication status...');

  if (!fs.existsSync(STATE_FILE)) {
    console.log('❌ No session state found at data/session/state.json');
    console.log('ℹ️ To authenticate, you can:');
    console.log('   1. Export cookies from your browser (using Cookie-Editor extension) into cookies.json');
    console.log('   2. Run: node scripts/linkedin_session.mjs import cookies.json');
    console.log('   OR');
    console.log('   3. Run: node scripts/linkedin_session.mjs set-liat "<your_li_at_cookie>"');
    return { authenticated: false, reason: 'missing_cookies' };
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    console.error('❌ Failed to parse state.json:', err.message);
    return { authenticated: false, error: err.message };
  }

  const cookies = state.cookies || [];
  if (cookies.length === 0) {
    console.log('❌ state.json has no cookies stored.');
    return { authenticated: false, reason: 'empty_cookies' };
  }

  console.log(`🍪 Loaded ${cookies.length} cookie(s) from state.json`);

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
    console.log('🌐 Connecting to https://www.linkedin.com/feed/ ...');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 25000 });
    const currentUrl = page.url();
    console.log('📍 Current URL:', currentUrl);

    if (currentUrl.includes('/checkpoint')) {
      console.log('⚠️ Security checkpoint or CAPTCHA detected by LinkedIn.');
      await browser.close();
      return { authenticated: false, reason: 'checkpoint', url: currentUrl };
    }

    if (currentUrl.includes('/login') || currentUrl.includes('/authwall') || currentUrl.includes('/uas/login')) {
      console.log('❌ Session expired or cookies invalid (Redirected to login).');
      await browser.close();
      return { authenticated: false, reason: 'logged_out', url: currentUrl };
    }

    const isFeed = currentUrl.includes('/feed');
    if (isFeed) {
      console.log('✅ Authenticated successfully! Connected to your LinkedIn feed.');
      try {
        const fullCookies = await context.cookies();
        const state = { cookies: fullCookies, origins: [] };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
        console.log(`💾 Saved ${fullCookies.length} full session cookies to state.json`);
      } catch (err) {}
      await browser.close();
      return { authenticated: true, url: currentUrl };
    }

    console.log('ℹ️ Response received, URL:', currentUrl);
    await browser.close();
    return { authenticated: false, reason: 'unknown_url', url: currentUrl };
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    await browser.close();
    return { authenticated: false, error: err.message };
  }
}

function importCookies(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ File not found: ${resolved}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const list = Array.isArray(raw) ? raw : (raw.cookies || []);

  const validCookies = list.map(c => {
    let domain = c.domain || '.linkedin.com';
    const item = {
      name: c.name,
      value: c.value,
      domain: domain,
      path: c.path || '/'
    };
    if (c.secure !== undefined) item.secure = Boolean(c.secure);
    if (c.httpOnly !== undefined) item.httpOnly = Boolean(c.httpOnly);
    const ss = (c.sameSite || '').toLowerCase();
    if (ss === 'no_restriction' || ss === 'none') {
      item.sameSite = 'None';
    } else if (ss === 'lax') {
      item.sameSite = 'Lax';
    } else if (ss === 'strict') {
      item.sameSite = 'Strict';
    }
    return item;
  }).filter(c => c.name && c.value !== undefined);

  const state = { cookies: validCookies, origins: [] };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

  console.log(`✅ Imported ${validCookies.length} cookies into ${STATE_FILE}`);
}

function setLiAt(val) {
  const cookieVal = val.trim();
  const cookies = [
    {
      name: 'li_at',
      value: cookieVal,
      domain: '.www.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: true
    },
    {
      name: 'li_at',
      value: cookieVal,
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: true
    }
  ];
  const state = { cookies, origins: [] };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  console.log(`✅ Configured li_at cookie in ${STATE_FILE}`);
}

async function main() {
  if (command === 'check') {
    await checkSession();
  } else if (command === 'import') {
    if (!args[1]) {
      console.error('Usage: node scripts/linkedin_session.mjs import <cookies.json>');
      process.exit(1);
    }
    importCookies(args[1]);
    await checkSession();
  } else if (command === 'set-liat') {
    if (!args[1]) {
      console.error('Usage: node scripts/linkedin_session.mjs set-liat <cookie_value>');
      process.exit(1);
    }
    setLiAt(args[1]);
    await checkSession();
  } else {
    console.log(`Unknown command: ${command}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
