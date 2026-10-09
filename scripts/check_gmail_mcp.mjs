import { spawn } from 'child_process';

/**
 * Cliente interactivo con el servidor MCP oficial de Google Workspace (mantiene el proceso vivo)
 */
export class GmailMcpClient {
  constructor() {
    this.cp = null;
    this.buffer = '';
    this.reqId = 1;
    this.pendingCallbacks = new Map();
  }

  async start() {
    if (this.cp) return;
    const extensionPath = process.env.GOOGLE_WORKSPACE_MCP_PATH || 
      path.join(process.env.HOME || '', '.gemini/extensions/google-workspace/dist/index.js');
    this.cp = spawn('node', [
      extensionPath,
      '--use-dot-names'
    ], {
      env: { ...process.env, GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE: 'true' }
    });

    this.cp.stdout.on('data', data => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const msg = JSON.parse(line);
            if (msg.id && this.pendingCallbacks.has(msg.id)) {
              const { resolve, reject } = this.pendingCallbacks.get(msg.id);
              this.pendingCallbacks.delete(msg.id);
              if (msg.error) {
                reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              } else {
                resolve(msg.result);
              }
            }
          } catch (e) {}
        }
      }
      this.buffer = lines[lines.length - 1];
    });

    // Enviar inicialización
    await this.callRaw('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'gmail-persistent-client', version: '1.0' }
    });
  }

  callRaw(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.reqId++;
      this.pendingCallbacks.set(id, { resolve, reject });
      const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.cp.stdin.write(req);

      setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          reject(new Error(`Timeout en llamada MCP: ${method}`));
        }
      }, 15000);
    });
  }

  async callTool(name, args = {}) {
    await this.start();
    return this.callRaw('tools/call', { name, arguments: args });
  }

  stop() {
    if (this.cp) {
      this.cp.kill();
      this.cp = null;
    }
  }
}

/**
 * Consulta correos vía Google Workspace MCP oficial (llamada única rápida)
 */
export async function queryGmailMcp(methodName, params = {}) {
  const client = new GmailMcpClient();
  try {
    const res = await client.callTool(methodName, params);
    return res;
  } finally {
    client.stop();
  }
}

// Ejecución directa por CLI
if (process.argv[1] && process.argv[1].endsWith('check_gmail_mcp.mjs')) {
  (async () => {
    const client = new GmailMcpClient();
    try {
      console.log('⚡ Conectando a Gmail vía Google Workspace MCP en sesión continua...');
      const searchRes = await client.callTool('gmail.search', {
        query: 'label:INBOX newer_than:7d',
        maxResults: 5
      });
      const data = JSON.parse(searchRes.content[0].text);
      console.log(`Encontrados ${data.resultSizeEstimate || (data.messages ? data.messages.length : 0)} mensajes.`);
      if (data.messages) {
        for (const m of data.messages) {
          const detailRes = await client.callTool('gmail.get', { messageId: m.id });
          const p = JSON.parse(detailRes.content[0].text);
          console.log(`• [${p.date}] ${p.from} - ${p.subject}`);
        }
      }
    } catch (err) {
      console.error('Error al consultar Gmail MCP:', err.message);
    } finally {
      client.stop();
    }
  })();
}
