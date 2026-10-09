import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

async function checkLinkedInInbox() {
  const userDir = path.resolve('data/session/persistent_chrome');
  const context = await chromium.launchPersistentContext(userDir, {
    headless: false,
    ignoreHTTPSErrors: true,
    executablePath: '/usr/bin/google-chrome',
    viewport: { width: 1400, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--ignore-certificate-errors']
  });

  try {
    const page = context.pages()[0] || await context.newPage();

    // 1. Mensajes directos en LinkedIn
    console.log('Navegando a LinkedIn Messaging...');
    await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'data/session/linkedin_messaging_view.png', fullPage: false });

    const messages = await page.evaluate(() => {
      const convos = Array.from(document.querySelectorAll('.msg-conversation-listitem, .msg-conversations-container__convo-item, li.msg-conversation-card'));
      return convos.slice(0, 10).map(c => {
        const name = c.querySelector('.msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names')?.innerText.trim() || '';
        const snippet = c.querySelector('.msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet')?.innerText.trim() || '';
        const time = c.querySelector('time')?.innerText.trim() || '';
        const isUnread = !!c.querySelector('.msg-conversation-card__unread-count, .notification-badge--unread');
        return { name, snippet, time, isUnread };
      });
    });

    console.log('Conversaciones detectadas:', messages);

    // 2. Notificaciones en LinkedIn
    console.log('\nNavegando a LinkedIn Notifications...');
    await page.goto('https://www.linkedin.com/notifications/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'data/session/linkedin_notifications_view.png', fullPage: false });

    const notifications = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('main div[id]'));
      const list = [];
      const seen = new Set();
      for (const el of elements) {
        if (el.id && el.id.length === 36 && el.id.includes('-')) {
          const text = el.innerText.trim();
          if (text && !seen.has(text) && text.length > 5) {
            seen.add(text);
            const time = el.querySelector('time')?.innerText.trim() || '';
            list.push({ text: text.replace(/\n+/g, ' '), time });
          }
        }
      }
      return list.slice(0, 10);
    });

    console.log('Notificaciones detectadas:', notifications);

    // 3. Invitaciones enviadas / Red
    console.log('\nNavegando a invitaciones enviadas en LinkedIn...');
    await page.goto('https://www.linkedin.com/mynetwork/invitation-manager/sent/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'data/session/linkedin_sent_invitations_view.png', fullPage: false });

    const sentInvites = await page.evaluate(() => {
      const listitems = Array.from(document.querySelectorAll('[role="listitem"], li'));
      const items = [];
      const seenNames = new Set();
      for (const li of listitems) {
        const text = li.innerText.trim();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.some(l => l.includes('Retirar') || l.includes('Withdraw'))) {
          const name = lines[0] || '';
          if (name && !seenNames.has(name)) {
            seenNames.add(name);
            const subtitle = lines[1] || '';
            const time = lines.find(l => l.startsWith('Enviado') || l.startsWith('Sent')) || lines[2] || '';
            const noteLine = lines.find(l => l.startsWith('Hola') || l.startsWith('Hi') || (l.length > 40 && !l.includes('Retirar') && !l.includes('Withdraw'))) || '';
            items.push({ name, subtitle, time, note: noteLine.replace('… mostrar más', '').trim() });
          }
        }
      }
      return items;
    });

    console.log('Invitaciones enviadas pendientes:', sentInvites);

    fs.writeFileSync('data/session/recruiter_check_results.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      messages,
      notifications,
      sentInvites
    }, null, 2));

    console.log('\n[SUCCESS] Resultados guardados en data/session/recruiter_check_results.json');

  } catch (err) {
    console.error('Error al chequear LinkedIn:', err);
  } finally {
    await context.close();
  }
}

checkLinkedInInbox();
