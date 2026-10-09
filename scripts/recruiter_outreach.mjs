import fs from 'fs';
import path from 'path';
import { GmailMcpClient } from './check_gmail_mcp.mjs';
import { loadProfile } from './profile_loader.mjs';

const profile = loadProfile();

function candidateSignature() {
  return `
${profile.fullName}
${profile.headline}
Email: ${profile.email}
Phone: ${profile.phone}
${profile.portfolio ? `Portfolio: ${profile.portfolio}\n` : ''}LinkedIn: ${profile.linkedin}
GitHub: ${profile.github}`;
}

export function buildOutreachProfiles() {
  const arg = process.argv[2];
  if (arg) {
    try {
      if (fs.existsSync(arg)) {
        return JSON.parse(fs.readFileSync(arg, 'utf-8'));
      }
      return JSON.parse(arg);
    } catch (e) {
      console.warn(`[WARN] Could not parse outreach profiles: ${e.message}`);
    }
  }
  return [
    {
      company: 'Example Tech Corp',
      recipient: 'recruiter@example.com',
      recruiterName: 'Hiring Team',
      role: 'Backend Software Engineer',
      subject: `Application: Backend Software Engineer | ${profile.fullName}`,
      body: `Hello Hiring Team,

I recently applied for the Backend Software Engineer position and wanted to follow up with my introduction.

My experience centers on backend engineering, scalable API development, and distributed systems.

You will find my tailored resume attached. I would welcome the opportunity to discuss how my background fits your team.

Best regards,
${candidateSignature()}`
    }
  ];
}

export const OUTREACH_PROFILES = buildOutreachProfiles();

export async function sendOutreachDirectly(item) {
  const client = new GmailMcpClient();
  try {
    await client.start();
    console.log(`🚀 Enviando correo directamente a ${item.company} (${item.recipient})...`);
    await client.callTool('gmail.send', {
      to: item.recipient,
      subject: item.subject,
      body: item.body
    });
    console.log(`✅ Correo enviado exitosamente a ${item.recipient}!`);
    return { ...item, sentAt: new Date().toISOString(), status: 'Sent' };
  } finally {
    client.stop();
  }
}

export async function sendAllOutreach(profiles = buildOutreachProfiles()) {
  console.log('⚡ Conectando a Google Workspace MCP para enviar correos de presentación directamente...');
  const client = new GmailMcpClient();
  const sentResults = [];

  try {
    await client.start();
    for (const item of profiles) {
      console.log(`🚀 Despachando correo a ${item.company} (${item.recipient})...`);
      try {
        await client.callTool('gmail.send', {
          to: item.recipient,
          subject: item.subject,
          body: item.body
        });
        console.log(`✅ Enviado a ${item.recipient}`);
        sentResults.push({ ...item, sentAt: new Date().toISOString(), status: 'Sent' });
      } catch (err) {
        console.error(`❌ Error enviando a ${item.recipient}:`, err.message);
        sentResults.push({ ...item, status: 'Failed', error: err.message });
      }
    }

    fs.writeFileSync('data/session/outreach_sent.json', JSON.stringify(sentResults, null, 2));
    console.log('Registro de envíos guardado en data/session/outreach_sent.json');
    return sentResults;
  } finally {
    client.stop();
  }
}

if (process.argv[1] && process.argv[1].endsWith('recruiter_outreach.mjs')) {
  sendAllOutreach().catch(console.error);
}
