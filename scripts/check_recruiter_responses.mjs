import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { GmailMcpClient } from './check_gmail_mcp.mjs';

import { loadProfile } from './profile_loader.mjs';

const profile = loadProfile();

function getTrackedCompanies() {
  const trackerPath = path.resolve('data/applications.md');
  if (fs.existsSync(trackerPath)) {
    const content = fs.readFileSync(trackerPath, 'utf-8');
    const matches = [...content.matchAll(/\|\s*\d+\s*\|\s*[^|]+\|\s*([^|]+)\|/g)];
    const companies = matches.map(m => m[1].trim()).filter(c => c && c !== 'Company' && !c.includes('---'));
    if (companies.length > 0) return [...new Set(companies)];
  }
  return [];
}

const TARGET_COMPANIES = getTrackedCompanies();

/**
 * 1. Inspecciona Gmail vía Google Workspace MCP oficial
 */
async function checkGmailResponses() {
  console.log('⚡ Conectando a Gmail vía Google Workspace MCP para buscar respuestas de reclutadores...');
  const client = new GmailMcpClient();
  const foundMessages = [];

  try {
    await client.start();

    // Query para detectar correos de reclutadores, empresas aplicadas o invitaciones
    const queries = [
      profile.email ? `to:${profile.email} newer_than:3d` : 'label:INBOX newer_than:3d',
      'label:INBOX newer_than:3d (entrevista OR interview OR meet OR calendly OR coordinar OR "proceso de selección" OR "prueba técnica" OR assessment)'
    ];

    if (TARGET_COMPANIES.length > 0) {
      const companyQuery = TARGET_COMPANIES.slice(0, 10).map(c => `"${c}"`).join(' OR ');
      queries.push(`label:INBOX newer_than:3d (${companyQuery})`);
    }

    const seenIds = new Set();

    for (const q of queries) {
      const searchRes = await client.callTool('gmail.search', { query: q, maxResults: 15 });
      const parsed = JSON.parse(searchRes.content[0].text);

      if (parsed.messages && parsed.messages.length > 0) {
        for (const msg of parsed.messages) {
          if (seenIds.has(msg.id)) continue;
          seenIds.add(msg.id);

          const getRes = await client.callTool('gmail.get', { messageId: msg.id });
          const msgData = JSON.parse(getRes.content[0].text);

          const from = msgData.from || '';
          const subject = msgData.subject || '';
          const snippet = msgData.snippet || '';
          const body = (msgData.body || snippet).toLowerCase();

          // Ignorar rebotes de Mailer-Daemon y notificaciones genéricas de alertas
          if (/mailer-daemon|postmaster|alertas de empleo/i.test(from)) continue;

          // Categorización inteligente
          let category = 'NOTIFICATION';
          let requiresAction = false;

          if (/entrevista|interview|llamada|meet|calendly|agenda|coordinar una reunión/i.test(subject + ' ' + body)) {
            category = 'INTERVIEW_INVITATION';
            requiresAction = true;
          } else if (/prueba t[eé]cnica|assessment|challenge|desaf[ií]o|hackerRank|codility/i.test(subject + ' ' + body)) {
            category = 'TECHNICAL_ASSESSMENT';
            requiresAction = true;
          } else if (/lamentamos|no continuaremos|otra persona|proceso cerrado|desestimad/i.test(subject + ' ' + body)) {
            category = 'REJECTION';
          } else if (/recibida|confirmaci[oó]n|gracias por postularte|hemos recibido tu/i.test(subject + ' ' + body)) {
            category = 'ACKNOWLEDGMENT';
          } else if (/remuneraci[oó]n|disponibilidad|cv actualizado|podr[ií]as enviarnos/i.test(subject + ' ' + body)) {
            category = 'RECRUITER_QUERY';
            requiresAction = true;
          }

          // Vincular con empresa
          const matchedCompany = TARGET_COMPANIES.find(c => new RegExp(c, 'i').test(from + ' ' + subject + ' ' + snippet)) || 'Reclutador / IT';

          foundMessages.push({
            id: msg.id,
            threadId: msg.threadId,
            date: msgData.date,
            from,
            subject,
            snippet,
            company: matchedCompany,
            category,
            requiresAction
          });
        }
      }
    }

    return foundMessages;
  } finally {
    client.stop();
  }
}

/**
 * 2. Inspecciona la bandeja de mensajes de LinkedIn vía persistent_chrome
 */
async function checkLinkedInMessages() {
  console.log('⚡ Conectando a LinkedIn Messaging para chequear respuestas de recruiters...');
  const userDir = path.resolve('data/session/persistent_chrome');
  const context = await chromium.launchPersistentContext(userDir, {
    headless: false,
    executablePath: '/usr/bin/google-chrome',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--ignore-certificate-errors']
  });

  const page = context.pages()[0] || await context.newPage();
  const linkedInMessages = [];

  try {
    await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'data/session/linkedin_messaging_inbox.png' });

    // Extraer conversaciones recientes de la lista de chats
    const conversations = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li.msg-conversation-listitem, div.msg-conversation-card'));
      return items.slice(0, 10).map(item => {
        const nameEl = item.querySelector('.msg-conversation-listitem__participant-names, h3, .msg-conversation-card__participant-names');
        const snippetEl = item.querySelector('.msg-conversation-card__message-snippet, p');
        const timeEl = item.querySelector('time');
        const unreadIndicator = item.querySelector('.msg-conversation-card__unread-count, .notification-badge--show');

        return {
          sender: nameEl ? nameEl.innerText.trim() : 'Desconocido',
          snippet: snippetEl ? snippetEl.innerText.trim() : '',
          time: timeEl ? timeEl.innerText.trim() : '',
          isUnread: Boolean(unreadIndicator)
        };
      }).filter(c => c.sender && c.sender !== 'Desconocido');
    });

    console.log(`Encontradas ${conversations.length} conversaciones recientes en LinkedIn.`);

    for (const c of conversations) {
      // Filtrar si es un recruiter o contacto relevante
      const isRelevant = /recruiter|talent|hr|people|iquall|adecco|segunda|crossing|indistaffing|java|backend|postulaci/i.test(c.sender + ' ' + c.snippet) || c.isUnread;
      if (isRelevant) {
        linkedInMessages.push({
          channel: 'LinkedIn Message',
          ...c,
          requiresAction: c.isUnread
        });
      }
    }

    return linkedInMessages;
  } catch (err) {
    console.error('Error inspeccionando LinkedIn Messaging:', err.message);
    return [];
  } finally {
    await context.close();
  }
}

/**
 * 3. Actualiza aplicaciones.md si una empresa respondió
 */
function updateTrackerStatus(gmailResponses, linkedInResponses) {
  const appsFile = path.resolve('data/applications.md');
  if (!fs.existsSync(appsFile)) return [];

  let content = fs.readFileSync(appsFile, 'utf8');
  const lines = content.split('\n');
  const updates = [];

  const allResponses = [...gmailResponses, ...linkedInResponses];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|') || line.includes('| # |') || line.includes('|---|')) continue;

    const cols = line.split('|').map(c => c.trim());
    if (cols.length < 9) continue;

    const num = cols[1];
    const company = cols[3];
    const currentStatus = cols[5];

    // Buscar si hay respuesta para esta empresa
    const match = allResponses.find(r => new RegExp(company, 'i').test(r.company || r.sender || ''));
    if (match) {
      let newStatus = currentStatus;
      if (match.category === 'INTERVIEW_INVITATION') {
        newStatus = 'Interview';
      } else if (match.category === 'REJECTION') {
        newStatus = 'Rejected';
      } else if (match.category === 'RECRUITER_QUERY' || match.channel === 'LinkedIn Message') {
        newStatus = 'Responded';
      }

      if (newStatus !== currentStatus && newStatus !== 'Applied') {
        cols[5] = newStatus;
        lines[i] = cols.join(' | ');
        updates.push({ num, company, oldStatus: currentStatus, newStatus, reason: match.subject || match.snippet });
      }
    }
  }

  if (updates.length > 0) {
    fs.writeFileSync(appsFile, lines.join('\n'));
    console.log(`✅ Actualizado status en data/applications.md para ${updates.length} aplicaciones.`);
  }

  return updates;
}

async function main() {
  console.log('===============================================================');
  console.log('🔍 INICIANDO MONITOR DE RESPUESTAS DE RECRUITERS Y EMPRESAS');
  console.log('===============================================================');

  const gmailResponses = await checkGmailResponses();
  const linkedInResponses = await checkLinkedInMessages();
  const trackerUpdates = updateTrackerStatus(gmailResponses, linkedInResponses);

  const report = {
    timestamp: new Date().toISOString(),
    totalGmailInspected: gmailResponses.length,
    totalLinkedInInspected: linkedInResponses.length,
    trackerUpdates,
    actionRequired: [
      ...gmailResponses.filter(m => m.requiresAction),
      ...linkedInResponses.filter(m => m.requiresAction)
    ],
    allGmailResponses: gmailResponses,
    allLinkedInResponses: linkedInResponses
  };

  fs.writeFileSync('data/session/recruiter_responses_report.json', JSON.stringify(report, null, 2));

  // Generar reporte en Markdown
  let md = `# Monitor de Respuestas de Reclutadores\n`;
  md += `**Fecha y hora:** ${new Date().toLocaleString('es-AR')}\n\n`;

  if (report.actionRequired.length > 0) {
    md += `### 🚨 Respuestas que requieren tu atención inmediata (${report.actionRequired.length}):\n\n`;
    for (const item of report.actionRequired) {
      md += `* **[${item.category || 'Mensaje'}] ${item.company || item.sender}**: *${item.subject || item.snippet}*\n`;
      md += `  * De: \`${item.from || item.sender}\` | Canal: ${item.channel || 'Gmail'}\n`;
      md += `  * Extracto: _"${item.snippet}"_\n\n`;
    }
  } else {
    md += `> ✅ **Sin respuestas pendientes de acción:** No hay invitaciones a entrevistas ni preguntas adicionales que requieran respuesta inmediata.\n\n`;
  }

  md += `### 📬 Novedades y Acuses Recientes:\n\n`;
  md += `| Canal | Empresa / Remitente | Asunto / Mensaje | Categoría | Estado |\n`;
  md += `|---|---|---|---|:---:|\n`;

  for (const g of gmailResponses.slice(0, 8)) {
    md += `| Gmail | **${g.company}** | ${g.subject} | \`${g.category}\` | ${g.requiresAction ? '🔴 Requiere Acción' : '⚪ Informativo'} |\n`;
  }
  for (const l of linkedInResponses.slice(0, 5)) {
    md += `| LinkedIn | **${l.sender}** | ${l.snippet.slice(0, 50)}... | \`Mensaje Directo\` | ${l.requiresAction ? '🔴 No leído' : '⚪ Leído'} |\n`;
  }

  if (trackerUpdates.length > 0) {
    md += `\n### 🔄 Actualizaciones en Applications Tracker:\n`;
    for (const u of trackerUpdates) {
      md += `* **#${u.num} ${u.company}**: Estado cambiado de \`${u.oldStatus}\` a **\`${u.newStatus}\`** (${u.reason})\n`;
    }
  }

  fs.writeFileSync('data/session/recruiter_responses_report.md', md);
  console.log('\n✅ Reporte guardado en data/session/recruiter_responses_report.md');
  console.log('JSON estructurado en data/session/recruiter_responses_report.json');
}

main().catch(console.error);
