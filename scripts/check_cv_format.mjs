#!/usr/bin/env node
/**
 * CV Format & Pagination Checker
 * 
 * Verifies that an HTML CV renders cleanly onto the intended page count (e.g. exactly 1 or 2 pages)
 * without unintentional bleeding or orphan lines.
 *
 * Usage:
 *   node scripts/check_cv_format.mjs <path-to-html> [--expected-pages 2]
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error("Usage: node scripts/check_cv_format.mjs <path-to-html> [--expected-pages <num>]");
  process.exit(1);
}

let expectedPages = 2;
const expectedIdx = process.argv.indexOf('--expected-pages');
if (expectedIdx !== -1 && process.argv[expectedIdx + 1]) {
  expectedPages = parseInt(process.argv[expectedIdx + 1], 10);
}

async function checkFormat() {
  const absolutePath = path.resolve(htmlPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  } else {
    const fallbacks = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
    for (const p of fallbacks) {
      if (fs.existsSync(p)) {
        launchOptions.executablePath = p;
        break;
      }
    }
  }
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();

  await page.goto(`file://${absolutePath}`, { waitUntil: 'networkidle' });

  // Generate temporary PDF to count exact pages
  const tempPdfPath = path.join(path.dirname(absolutePath), '.temp_check.pdf');
  await page.pdf({
    path: tempPdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' }
  });

  // Read binary PDF to extract exact page count
  const pdfBuffer = fs.readFileSync(tempPdfPath);
  const pdfText = pdfBuffer.toString('latin1');
  const pageMatches = pdfText.match(/\/Type\s*\/Page\b/g);
  const totalPages = pageMatches ? pageMatches.length : 1;

  try {
    fs.unlinkSync(tempPdfPath);
  } catch (e) {}

  console.log(`\n======================================================`);
  console.log(`📄 Chequeo de Formato de CV: ${path.basename(htmlPath)}`);
  console.log(`======================================================`);
  console.log(`Páginas generadas: ${totalPages}`);
  console.log(`Páginas esperadas: ${expectedPages}`);

  let status = "OK";
  if (totalPages === expectedPages) {
    console.log(`\n✅ ¡Formato Prolijo! El CV ocupa exactamente ${expectedPages} página(s) sin desbordes.`);
  } else if (totalPages > expectedPages) {
    console.log(`\n⚠️ ALERTA DE DESBORDE: El CV generó ${totalPages} páginas (se esperaba ${expectedPages}).`);
    console.log(`   Hay contenido que se está derramando hacia una página extra.`);
    console.log(`   Sugerencia: Reducir ligeramente margins, gap entre secciones o font-size.`);
    status = "OVERFLOW";
  } else {
    console.log(`\nℹ️ El CV generó ${totalPages} página(s), menos de las ${expectedPages} esperadas.`);
  }
  console.log(`======================================================\n`);

  await browser.close();

  if (status === "OVERFLOW") {
    process.exit(2);
  }
}

checkFormat().catch(err => {
  console.error("Error durante el chequeo:", err);
  process.exit(1);
});
