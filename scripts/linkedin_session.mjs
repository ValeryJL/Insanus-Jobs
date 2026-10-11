#!/usr/bin/env node
/**
 * scripts/linkedin_session.mjs — Node.js LinkedIn Session Manager
 *
 * Verifies session, injects cookies, and tests authentication against LinkedIn feed.
 *
 * Usage:
 *   node scripts/linkedin_session.mjs check
 *   node scripts/linkedin_session.mjs import <cookies.json>
 *   node scripts/linkedin_session.mjs login-ui
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { getBrowserLaunchOptions, getPersistentLaunchOptions, getDefaultUserAgent } from './browser_env.mjs';

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
    console.log('   1. Log in via browser: node scripts/linkedin_session.mjs login-ui');
    console.log('   2. OR export all cookies with Cookie-Editor into cookies.json and run:');
    console.log('      node scripts/linkedin_session.mjs import cookies.json');
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

  const browser = await chromium.launch(getBrowserLaunchOptions({
    headless: true
  }));

  const context = await browser.newContext({
    userAgent: getDefaultUserAgent(),
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true
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

async function importCookies(input) {
  let list = [];
  try {
    if (typeof input === 'string' && (input.trim().startsWith('[') || input.trim().startsWith('{'))) {
      const raw = JSON.parse(input);
      list = Array.isArray(raw) ? raw : (raw.cookies || []);
    } else {
      const resolved = path.resolve(input);
      if (!fs.existsSync(resolved)) {
        console.error(`❌ File not found: ${resolved}`);
        process.exit(1);
      }
      const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      list = Array.isArray(raw) ? raw : (raw.cookies || []);
    }
  } catch (err) {
    console.error(`❌ Error parsing cookies: ${err.message}`);
    process.exit(1);
  }

  const validCookies = list.map(c => {
    let domain = c.domain || '.linkedin.com';
    if (domain.endsWith('linkedin.com')) {
      domain = '.linkedin.com';
    }
    const item = {
      name: c.name,
      value: c.value,
      domain: domain,
      path: c.path || '/'
    };
    if (c.secure !== undefined) item.secure = Boolean(c.secure);
    if (c.httpOnly !== undefined) item.httpOnly = Boolean(c.httpOnly);

    // Evitar que Playwright borre las cookies de sesión con expiración pasada o negativa
    const exp = c.expires || c.expirationDate;
    if (exp && Number(exp) > Date.now() / 1000) {
      item.expires = Math.floor(Number(exp));
    } else {
      // 1 año de vigencia para evitar que Playwright las descarte en memoria
      item.expires = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    }

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

  console.log(`✅ Importadas ${validCookies.length} cookies exitosamente en ${STATE_FILE}`);
  console.log('🔍 Verificando sesión de forma silenciosa...');
  await checkSession();
}

async function setToken(token) {
  if (!token) {
    console.error('❌ Falta especificar el valor de la cookie li_at.');
    console.error('Uso: node scripts/linkedin_session.mjs set-token <token_li_at>');
    process.exit(1);
  }

  const cleanToken = token.trim().replace(/^["']|["']$/g, '');
  const oneYearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

  let existingCookies = [];
  if (fs.existsSync(STATE_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      existingCookies = (prev.cookies || []).filter(c => c.name !== 'li_at');
    } catch (_) {}
  }

  const newLiAt = {
    name: 'li_at',
    value: cleanToken,
    domain: '.linkedin.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'None',
    expires: oneYearFromNow
  };

  const finalCookies = [newLiAt, ...existingCookies];
  if (!finalCookies.some(c => c.name === 'JSESSIONID')) {
    finalCookies.push({
      name: 'JSESSIONID',
      value: `ajax:${Math.floor(Date.now() / 1000)}`,
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'None',
      expires: oneYearFromNow
    });
  }

  const state = { cookies: finalCookies, origins: [] };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  console.log(`✅ Token li_at actualizado con éxito (${cleanToken.slice(0, 10)}...) en ${STATE_FILE}`);
  console.log('🔍 Verificando sesión de forma 100% silenciosa (sin abrir ventanas)...');
  await checkSession();
}

async function loginUi() {
  console.log('🖥️ Abriendo ventana única para login en LinkedIn...');
  const userDir = path.resolve('data/session/persistent_chrome');
  const context = await chromium.launchPersistentContext(userDir, getPersistentLaunchOptions({
    headless: false,
    viewport: { width: 1280, height: 900 }
  }));

  // Limpiar cookies viejas/caducadas para evitar el bucle de redirecciones (ERR_TOO_MANY_REDIRECTS)
  await context.clearCookies();

  const page = context.pages()[0] || await context.newPage();
  console.log('🌐 Navegando a la pantalla limpia de login...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log('👉 Iniciá sesión en LinkedIn en la ventana emergente (tildá "Recordarme" si aparece).');
  console.log('⏳ Esperando inicio de sesión exitoso (hasta 3 minutos)...');

  try {
    // Detectar cuando el usuario ya no está en login ni checkpoint
    await page.waitForFunction(() => {
      const u = window.location.href;
      const isLoginOrAuth = u.includes('/login') || u.includes('/checkpoint') || u.includes('/uas/login');
      const hasNav = !!document.querySelector('.global-nav, .feed-identity-module, a[href*="/feed"], nav.global-nav');
      return (!isLoginOrAuth && (u.includes('/feed') || u.includes('/jobs') || u.includes('/mynetwork') || u.includes('/in/') || hasNav));
    }, { timeout: 180000, polling: 1000 });

    console.log('🎉 ¡Sesión iniciada con éxito!');
    await page.waitForTimeout(3000); // Dar 3 segundos para que Chromium sincronice cookies en disco

    const fullCookies = await context.cookies();
    const state = { cookies: fullCookies, origins: [], lastLogin: new Date().toISOString() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

    console.log(`💾 Sesión guardada de forma permanente en data/session/persistent_chrome (${fullCookies.length} cookies).`);
    console.log('🚀 ¡Configuración completada! A partir de ahora todas las postulaciones correrán 100% HEADLESS en segundo plano.');
  } catch (e) {
    console.warn('⚠️ Tiempo de espera agotado o ventana cerrada antes de completar el login.');
  } finally {
    await context.close();
  }
}

async function main() {
  if (command === 'check') {
    await checkSession();
  } else if (command === 'import') {
    if (!args[1]) {
      console.error('Usage: node scripts/linkedin_session.mjs import <cookies.json>');
      process.exit(1);
    }
    await importCookies(args[1]);
  } else if (command === 'set-token') {
    await setToken(args[1]);
  } else if (command === 'login-ui') {
    await loginUi();
  } else {
    console.log(`Unknown command: ${command}`);
    console.log('Available commands: check | import <cookies.json> | set-token <token> | login-ui');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
