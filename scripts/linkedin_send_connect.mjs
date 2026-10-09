import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

function loadTargets() {
  const arg = process.argv[2];
  if (arg) {
    try {
      if (fs.existsSync(arg)) {
        return JSON.parse(fs.readFileSync(arg, 'utf-8'));
      }
      return JSON.parse(arg);
    } catch (e) {
      console.warn(`[WARN] Could not parse targets from arguments: ${e.message}`);
    }
  }
  return [
    {
      name: 'Sample Recruiter',
      role: 'Talent Acquisition Partner',
      company: 'Tech Solutions Inc',
      url: 'https://www.linkedin.com/in/sample-recruiter/',
      note: 'Hello! I recently applied to the Software Engineer position. I would love to connect and share more about my engineering background.'
    }
  ];
}

async function sendConnect(target, context) {
  const page = context.pages()[0] || await context.newPage();
  console.log(`\n======================================================`);
  console.log(`Visiting profile: ${target.name} (${target.company})`);
  console.log(`URL: ${target.url}`);
  console.log(`Note (${target.note.length} chars): "${target.note}"`);
  console.log(`======================================================`);

  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    const slug = target.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    await page.screenshot({ path: `data/session/profile_${slug}_initial.png` });

    // Check if already connected or pending
    const bodyText = await page.innerText('body');
    if (bodyText.includes('Pendiente') || bodyText.includes('Pending') || bodyText.includes('1er grado') || bodyText.includes('1st')) {
      console.log(`[INFO] Connection already pending or already 1st degree connection with ${target.name}!`);
      return { success: true, status: 'Already Connected / Pending' };
    }

    // Try finding "Conectar" or "Connect" button directly
    let connectBtn = page.locator('main button:has-text("Conectar"), div.ph5 button:has-text("Conectar"), button:has-text("Connect")').first();
    let isVisible = await connectBtn.isVisible().catch(() => false);

    if (!isVisible) {
      console.log(`[INFO] "Conectar" button not immediately visible in main banner. Checking "Más" / "More" menu...`);
      const moreBtn = page.locator('main button:has-text("Más"), div.ph5 button:has-text("Más"), button:has-text("More"), button[aria-label*="Más acciones"]').first();
      if (await moreBtn.isVisible().catch(() => false)) {
        console.log(`[INFO] Clicking "Más"...`);
        await moreBtn.click();
        await page.waitForTimeout(1000);
        connectBtn = page.locator('div[role="menu"] div:has-text("Conectar"), div[role="menu"] span:has-text("Conectar"), div[role="menu"] [aria-label*="Conectar"]').first();
        isVisible = await connectBtn.isVisible().catch(() => false);
      }
    }

    if (!isVisible) {
      console.log(`[WARN] Could not locate "Conectar" button for ${target.name}. Capturing debug screen.`);
      await page.screenshot({ path: `data/session/profile_${slug}_no_connect.png` });
      return { success: false, reason: 'No connect button found' };
    }

    console.log(`[INFO] Clicking "Conectar"...`);
    await connectBtn.click();
    await page.waitForTimeout(2000);

    // Look for "Añadir una nota" / "Add a note"
    const addNoteBtn = page.locator('button:has-text("Añadir una nota"), button:has-text("Add a note")').first();
    if (await addNoteBtn.isVisible().catch(() => false)) {
      console.log(`[INFO] Clicking "Añadir una nota"...`);
      await addNoteBtn.click();
      await page.waitForTimeout(1000);

      const textArea = page.locator('textarea[name="message"], textarea#custom-message, div[role="dialog"] textarea').first();
      if (await textArea.isVisible().catch(() => false)) {
        console.log(`[INFO] Typing personalized note...`);
        await textArea.fill(target.note);
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `data/session/connect_${slug}_with_note.png` });

        // Send invitation
        const sendBtn = page.locator('button:has-text("Enviar"), button:has-text("Send")').first();
        if (await sendBtn.isVisible().catch(() => false)) {
          console.log(`[INFO] Clicking "Enviar"...`);
          await sendBtn.click();
          await page.waitForTimeout(3000);
          await page.screenshot({ path: `data/session/connect_${slug}_sent.png` });
          console.log(`[DONE] Personalized connection request sent to ${target.name}!`);
          return { success: true, status: 'Sent with note' };
        }
      }
    } else {
      // If modal opens directly with Send or without Add Note button
      const sendWithoutNote = page.locator('button:has-text("Enviar sin nota"), button:has-text("Send without a note")').first();
      if (await sendWithoutNote.isVisible().catch(() => false)) {
        console.log(`[INFO] "Añadir una nota" not shown, option "Enviar sin nota" visible.`);
      }
    }

    return { success: false, reason: 'Modal flow incomplete' };
  } catch (err) {
    console.error(`[ERROR] Failed to send connection request to ${target.name}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function main() {
  const userDir = path.resolve('data/session/persistent_chrome');
  const context = await chromium.launchPersistentContext(userDir, {
    headless: false,
    executablePath: '/usr/bin/google-chrome',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--ignore-certificate-errors']
  });

  const targets = loadTargets();
  const results = [];
  for (const target of targets) {
    const res = await sendConnect(target, context);
    results.push({ name: target.name, company: target.company, ...res });
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n================ OUTREACH SUMMARY ================');
  console.log(JSON.stringify(results, null, 2));

  await context.close();
}

main().catch(console.error);
