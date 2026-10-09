#!/usr/bin/env node
/**
 * scripts/check_inbox.mjs — Unified Inbox & Recruiter Response Monitor
 * 
 * Inspects:
 * 1. Gmail inbox via Google Workspace MCP (interviews, tests, recruiter queries)
 * 2. LinkedIn direct messages, live notifications, and sent invitations
 */
import { spawn } from 'child_process';
import path from 'path';

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n===============================================================`);
    console.log(`▶ Ejecutando: ${scriptName}`);
    console.log(`===============================================================`);
    const p = spawn('node', [path.resolve('scripts', scriptName)], { stdio: 'inherit' });
    p.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} finalizó con código ${code}`));
    });
  });
}

async function main() {
  try {
    await runScript('check_recruiter_responses.mjs');
    await runScript('check_linkedin_inbox.mjs');
    console.log('\n✅ [SUCCESS] Chequeo unificado de inbox y respuestas completado exitosamente.');
  } catch (err) {
    console.error('Error durante el chequeo unificado:', err.message);
  }
}

main();
