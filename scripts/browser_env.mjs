import fs from 'fs';
import path from 'path';

/**
 * Resolves the path to a Chrome or Chromium executable across Windows, Linux, and macOS.
 * Checks environment variables first, then standard platform-specific installation paths.
 */
export function getChromeExecutablePath() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const candidates = [];

  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    candidates.push(
      path.join(progFiles, 'Google/Chrome/Application/chrome.exe'),
      path.join(progFilesX86, 'Google/Chrome/Application/chrome.exe'),
      path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
      path.join(progFiles, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(progFilesX86, 'Microsoft/Edge/Application/msedge.exe')
    );
  } else if (isMac) {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    // Linux and Unix-like
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
      '/usr/bin/edge'
    );
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Returns standard Playwright launch options configured for the current OS.
 */
export function getBrowserLaunchOptions(overrides = {}) {
  const executablePath = getChromeExecutablePath();
  const baseArgs = [
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled'
  ];

  return {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    ...overrides,
    args: [...baseArgs, ...(overrides.args || [])]
  };
}

/**
 * Returns standard Playwright persistent context launch options configured for the current OS.
 */
export function getPersistentLaunchOptions(overrides = {}) {
  const executablePath = getChromeExecutablePath();
  const baseArgs = [
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--ignore-certificate-errors'
  ];

  return {
    headless: false,
    ignoreHTTPSErrors: true,
    ...(executablePath ? { executablePath } : {}),
    ...overrides,
    args: [...baseArgs, ...(overrides.args || [])]
  };
}
