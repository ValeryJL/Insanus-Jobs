import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const EXTENSION_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', '.gemini/extensions/google-workspace');
const MASTER_KEY_PATH = path.join(EXTENSION_DIR, '.gemini-cli-workspace-master-key');
const TOKEN_PATH = path.join(EXTENSION_DIR, 'gemini-cli-workspace-token.json');

export function getAuthUrl() {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const state = Buffer.from(JSON.stringify({ manual: true, csrf: csrfToken })).toString('base64');
  const clientId = '338689075775-o75k922vn5fdl18qergr96rp8g63e4d7.apps.googleusercontent.com';
  const redirectUri = 'https://google-workspace-extension.geminicli.com';
  const scopes = [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/chat.spaces',
    'https://www.googleapis.com/auth/chat.messages',
    'https://www.googleapis.com/auth/chat.memberships',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/directory.readonly',
    'https://www.googleapis.com/auth/presentations.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    state: state,
    prompt: 'consent'
  });

  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

export function saveOAuthCredentials(credentialsJson) {
  const data = typeof credentialsJson === 'string' ? JSON.parse(credentialsJson) : credentialsJson;
  
  if (!data.access_token || !data.refresh_token) {
    throw new Error('El JSON de credenciales debe contener al menos "access_token" y "refresh_token".');
  }

  // Asegurar master key
  let masterKey;
  if (fs.existsSync(MASTER_KEY_PATH)) {
    masterKey = fs.readFileSync(MASTER_KEY_PATH);
  } else {
    masterKey = crypto.randomBytes(32);
    fs.writeFileSync(MASTER_KEY_PATH, masterKey);
  }

  // Derivar clave de cifrado
  const salt = `${os.hostname()}-${os.userInfo().username}-gemini-cli-workspace`;
  const encryptionKey = crypto.scryptSync(masterKey, salt, 32);

  // Formato interno de tokens de Google Workspace MCP
  const tokens = {
    'main-account': {
      serverName: 'main-account',
      token: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expiry_date || (Date.now() + 3600 * 1000),
        tokenType: data.token_type || 'Bearer',
        scope: data.scope || ''
      }
    }
  };

  const jsonStr = JSON.stringify(tokens, null, 2);

  // Cifrado AES-256-GCM
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  const fileContent = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  fs.writeFileSync(TOKEN_PATH, fileContent, { encoding: 'utf-8' });

  console.log('✅ Credenciales guardadas exitosamente en:', TOKEN_PATH);
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('setup_gmail_token.mjs')) {
  const arg = process.argv[2];
  if (!arg || arg === '--url') {
    console.log('\n🔗 URL de Autorización de Google Workspace:\n');
    console.log(getAuthUrl());
    console.log('\n1. Abre este enlace en el navegador.');
    console.log('2. Inicia sesión y autoriza.');
    console.log('3. Copia el JSON que aparece al finalizar y ejecútalo con:');
    console.log('   node scripts/setup_gmail_token.mjs "<JSON_COPIADO>"\n');
  } else {
    try {
      saveOAuthCredentials(arg);
    } catch (e) {
      console.error('Error al guardar credenciales:', e.message);
    }
  }
}
