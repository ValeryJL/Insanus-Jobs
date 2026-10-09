#!/usr/bin/env node
/**
 * scripts/translate_cv.mjs — Automatic HTML CV Translator
 * 
 * Translates an HTML CV between languages (e.g. Spanish -> English, English -> Spanish)
 * while strictly preserving HTML layout, inline styles, CSS classes, and tags.
 *
 * Usage:
 *   node scripts/translate_cv.mjs <input.html> [--to en|es] [--output <output.html>]
 *
 * Can run via:
 * 1. Gemini API (if GEMINI_API_KEY is defined in .env or environment)
 * 2. Directly by the AI Agent (the agent reads HTML, translates content, and writes target file)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env if present
try {
  const { config } = await import('dotenv');
  config();
} catch {}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.log(`
Usage:
  node scripts/translate_cv.mjs <input.html> [--to <lang>] [--output <output.html>]

Options:
  --to <lang>       Target language code (en, es, de, fr, ja). Default: en
  --output <path>   Output file path. Default: output/<filename>-<to>.html
`);
  process.exit(0);
}

const inputPath = path.resolve(args[0]);
if (!fs.existsSync(inputPath)) {
  console.error(`❌ Error: Input file not found: ${inputPath}`);
  process.exit(1);
}

let targetLang = 'en';
const toIdx = args.indexOf('--to');
if (toIdx !== -1 && args[toIdx + 1]) {
  targetLang = args[toIdx + 1].toLowerCase();
}

let outputPath = '';
const outIdx = args.indexOf('--output');
if (outIdx !== -1 && args[outIdx + 1]) {
  outputPath = path.resolve(args[outIdx + 1]);
} else {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  outputPath = path.resolve('output', `${baseName}-${targetLang}.html`);
}

const langNames = {
  en: 'English (US professional)',
  es: 'Spanish (Español profesional neutro)',
  de: 'German (Deutsch)',
  fr: 'French (Français)',
  ja: 'Japanese (日本語)'
};

const targetLangName = langNames[targetLang] || targetLang;

const inputHtml = fs.readFileSync(inputPath, 'utf8');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.log(`
ℹ️ No GEMINI_API_KEY found in environment or .env.
When running interactively with an AI agent (Antigravity, Claude Code, Copilot, Gemini CLI):
The AI agent will perform the translation directly using its active model.

Target Language: ${targetLangName}
Input: ${inputPath}
Target Output: ${outputPath}

Instruction for AI Agent:
"Please read ${inputPath}, translate all visible text into ${targetLangName}, preserve all HTML tags, attributes, CSS, page structure, and save to ${outputPath}. Then run 'node scripts/check_cv_format.mjs ${outputPath} --expected-pages 2' and 'node generate-pdf.mjs ${outputPath}'."
`);
  process.exit(0);
}

// If API key is present, perform automatic translation via Gemini API
console.log(`🌐 Translating ${path.basename(inputPath)} to ${targetLangName} via Gemini API...`);

try {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are an expert bilingual technical CV translator and ATS optimization specialist.
Translate the following HTML CV from its current language into ${targetLangName}.

STRICT RULES:
1. DO NOT modify any HTML tags, class names, styles, attributes, or layout structures.
2. DO NOT modify personal names, URLs, email addresses, phone numbers, or GitHub/LinkedIn handles.
3. Translate all job titles, descriptions, skills categories, presentation text, and headers accurately into professional ${targetLangName} terminology.
4. Keep the translation concise so it does not alter the physical line height or cause page overflow.
5. Return ONLY the raw HTML code without markdown code blocks (no \`\`\`html ... \`\`\`).

HTML TO TRANSLATE:
${inputHtml}
`;

  const result = await model.generateContent(prompt);
  let translatedHtml = result.response.text().trim();

  // Strip markdown code fences if model included them
  if (translatedHtml.startsWith('```html')) {
    translatedHtml = translatedHtml.slice(7);
  } else if (translatedHtml.startsWith('```')) {
    translatedHtml = translatedHtml.slice(3);
  }
  if (translatedHtml.endsWith('```')) {
    translatedHtml = translatedHtml.slice(0, -3);
  }
  translatedHtml = translatedHtml.trim();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, translatedHtml, 'utf8');

  console.log(`✅ Translated HTML saved to: ${outputPath}`);
} catch (err) {
  console.error(`❌ Translation API failed:`, err.message);
  process.exit(1);
}
