# 🚀 Insanus-Jobs

> **Autonomous AI Agent Job Search & Application Command Center**  
> Agente autónomo de búsqueda de empleo, adaptación de CVs a medida de 2 páginas ATS, postulación con emulación humana en LinkedIn Easy Apply, outreach a reclutadores reales y monitoreo de respuestas en vivo.

---

## 🌟 Características Principales

1. **🤖 Flujo Autónomo `/search-jobs`**: Ciclo integral de 7 fases coordinado de extremo a extremo:
   - Chequeo de inbox y reclutadores (Gmail MCP + LinkedIn).
   - Búsqueda y filtrado de vacantes según salario, rol y modalidad.
   - Generación de CV a medida en HTML compilado a PDF (2 páginas exactas, 0 desborde).
   - Postulación automática en LinkedIn Easy Apply con stealth Playwright.
   - Registro y control del pipeline en `data/applications.md`.
   - Outreach personalizado a reclutadores reales de IT/HR.
   - Monitoreo final de acuses de recibo.
2. **📄 Motor HTML → PDF con Validación ATS**: Plantillas modernas con fuentes web, validación de desborde milimétrico y normalización automática de caracteres.
3. **📬 Integración Google Workspace MCP**: Búsqueda en Gmail de respuestas de entrevistas, invitaciones técnicas y envío directo de presentaciones sin intermediarios.
4. **🔒 Privacidad por Diseño**: Los datos personales, cookies, credenciales y trackers están excluidos de Git por defecto. Se incluyen ejemplos limpios para fácil configuración.

---

## 📁 Estructura del Proyecto

```
insanus-jobs/
├── AGENTS.md                      # Instrucciones maestras del agente y definición de fases
├── README.md                      # Documentación general del repositorio
├── package.json                   # Dependencias y scripts de ejecución
├── .gitignore                     # Protección estricta de datos personales y sesiones
│
├── config/
│   ├── profile.example.yml        # Plantilla de perfil para el candidato
│   ├── profile.yml                # (Local / Gitignored) Datos reales del candidato
│   └── portals.yml                # Configuración de portales y palabras clave
│
├── templates/
│   └── cv-template.html           # Modelo HTML del CV moderno de 2 páginas
│
├── cv.example.md                  # Ejemplo en Markdown del contenido del CV
├── cv.md                          # (Local / Gitignored) Tu CV real en Markdown
├── cv.html                        # (Local / Gitignored) Tu CV real en HTML
│
├── examples/
│   ├── sample-cv.html             # Ejemplo sanitizado de CV HTML
│   └── sample-cv.pdf              # Ejemplo de PDF compilado
│
├── scripts/                       # Herramientas del pipeline
│   ├── check_inbox.mjs            # Fase 1 & 7: Chequeo de Gmail (MCP) e Inbox LinkedIn
│   ├── check_recruiter_responses.mjs # Monitor detallado de respuestas de reclutadores
│   ├── check_linkedin_inbox.mjs   # Inspector de mensajes, notificaciones e invitaciones
│   ├── linkedin_search.mjs        # Fase 2: Búsqueda y extracción de vacantes
│   ├── generate_pdf.mjs           # Fase 3: Compilación HTML -> PDF con ATS normalization
│   ├── check_cv_format.mjs        # Fase 3: Validador estricto de paginación
│   ├── linkedin_apply.mjs         # Fase 4: Form filler de Easy Apply con Playwright
│   ├── verify_pipeline.mjs        # Fase 5: Verificación de integridad del tracker
│   ├── merge_tracker.mjs          # Fase 5: Ingesta de postulaciones en el tracker
│   ├── recruiter_outreach.mjs     # Fase 6: Despacho directo vía Google Workspace MCP
│   ├── linkedin_send_connect.mjs  # Fase 6: Solicitud de conexión con nota personalizada
│   ├── profile_loader.mjs         # Utilidad: Carga dinámica de perfil
│   └── check_gmail_mcp.mjs        # Utilidad: Conexión persistente con Gmail MCP
│
├── data/
│   ├── applications.example.md    # Plantilla del tracker de postulaciones
│   ├── applications.md            # (Local / Gitignored) Tracker real de postulaciones
│   ├── pipeline.md                # (Local / Gitignored) Cola de URLs pendientes
│   ├── session/                   # (Local / Gitignored) Sesión persistente de Chrome
│   └── history_scripts/           # (Local / Gitignored) Scripts de lotes históricos
│
├── output/                        # (Local / Gitignored) PDFs y CVs compilados (.gitkeep)
└── reports/                       # (Local / Gitignored) Reportes de evaluación (.gitkeep)
```

---

## ⚡ Inicio Rápido

### 1. Instalación de dependencias
```bash
npm install
npx playwright install chromium
```

### 2. Configurar Perfil
Copia la plantilla de ejemplo y completa tus datos:
```bash
cp config/profile.example.yml config/profile.yml
cp cv.example.md cv.md
```

### 3. Ejecutar el flujo o tareas individuales
```bash
# Verificar la salud del tracker
npm run verify

# Chequear respuestas de reclutadores y estado de LinkedIn
npm run check:inbox

# Compilar un CV a PDF verificando 2 páginas exactas
node scripts/generate_pdf.mjs templates/cv-template.html output/cv.pdf
```

---

## 🔐 Dónde se guardan las Credenciales y Sesiones (100% Fuera de Git)

Para operar de forma autónoma sin comprometer seguridad, las credenciales se almacenan estrictamente de forma local y están excluidas de Git:

1. **Gmail / Google Workspace (OAuth 2.0):**
   - **Ubicación:** `~/.gemini/extensions/google-workspace/gemini-cli-workspace-token.json` (almacenado de forma encriptada en tu directorio `HOME`, fuera del repositorio).
   - **Gestión:** Autenticación oficial vía Google Workspace MCP (`auth.refreshToken`). No se guarda ningún password o token en los archivos del proyecto.
   
2. **LinkedIn (Sesión y Cookies de Playwright):**
   - **Ubicación principal (Perfil de navegador persistente):** `data/session/persistent_chrome/` (directorio gitignorado con la sesión autenticada).
   - **Exportación de Cookies (opcional / backup):** `cookies.json` o `data/cookies.json` (archivos raíz o en `data/`, ambos estrictamente gitignorados).
   - **Importar sesión:** `node scripts/linkedin_session.mjs import cookies.json` o `node scripts/linkedin_session.mjs set-liat "<valor_li_at>"`.

3. **Variables de Entorno y Claves de API:**
   - **Ubicación:** `.env` (creado a partir de `.env.example`, gitignorado).
   - Contiene claves como `GEMINI_API_KEY` u otras integraciones.

---

## 📄 Licencia

MIT License.
