#!/usr/bin/env node
/**
 * scripts/linkedin_keepalive.mjs — LinkedIn Silent Session Keep-Alive Heartbeat
 * 
 * Runs headlessly and silently in the background without opening any visible browser window.
 * Connects to LinkedIn using current session cookies, triggers a lightweight feed ping,
 * captures refreshed cookies returned by LinkedIn, and updates data/session/state.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { getBrowserLaunchOptions, getDefaultUserAgent } from './browser_env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, 'data', 'session', 'state.json');

export async function pingLinkedInSession() {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('⚠️ No state.json found. Import cookies first.');
    return { ok: false, reason: 'no_state_file' };
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const cookies = (state.cookies || []).map(c => {
    const copy = { ...c };
    if (copy.expires <= 0) {
      delete copy.expires;
    }
    return copy;
  });

  if (cookies.length === 0) {
    console.log('⚠️ state.json has no cookies stored.');
    return { ok: false, reason: 'empty_cookies' };
  }

  // 100% headless, completely silent, no visible window
  const browser = await chromium.launch(getBrowserLaunchOptions({
    headless: true
  }));

  try {
    const context = await browser.newContext({
      userAgent: getDefaultUserAgent(),
      viewport: { width: 1280, height: 800 }
    });

    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('💓 Enviando heartbeat silencioso a LinkedIn en segundo plano...');
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(2500);
    const url = page.url();

    if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/uas/login')) {
      console.log('⚠️ La sesión actual de LinkedIn está expirada o requiere checkpoint.');
      await browser.close();
      return { ok: false, reason: 'expired', url };
    }

    // Refresh cookies from response headers / context
    const freshCookies = await context.cookies();
    const newState = {
      cookies: freshCookies,
      origins: [],
      lastHeartbeat: new Date().toISOString()
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), 'utf8');

    console.log(`✅ Heartbeat exitoso: Sesión extendida y renovada (${freshCookies.length} cookies actualizadas a las ${new Date().toLocaleTimeString('es-AR')}).`);
    await browser.close();
    return { ok: true, timestamp: newState.lastHeartbeat, count: freshCookies.length };
  } catch (err) {
    console.error('Error durante el heartbeat silencioso:', err.message);
    await browser.close();
    return { ok: false, error: err.message };
  }
}

if (process.argv[1] && process.argv[1].endsWith('linkedin_keepalive.mjs')) {
  pingLinkedInSession().then(res => {
    if (!res.ok) process.exit(1);
  });
}
