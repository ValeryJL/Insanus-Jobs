/**
 * Insanus-Jobs — LinkedIn Easy Apply Human Emulation Autofiller
 * 
 * Instructions:
 * 1. Open any LinkedIn Job page where you want to apply (where "Solicitud sencilla" is available).
 * 2. Press F12 -> Console -> Paste this entire script and press Enter (or save as a Bookmarklet).
 * 3. It will open Easy Apply, fill every question with human typing delays, advance steps, 
 *    and stop safely at the "Revisar" (Review) screen.
 */

(async function insanusJobsAutofill() {
  console.log("%c🚀 Insanus-Jobs: Iniciando autocompletado con emulación humana...", "color: #2563eb; font-weight: bold; font-size: 14px;");

  // Candidate configuration (Customize with your profile info)
  const candidate = {
    name: "Alex",
    surname: "Morgan",
    fullName: "Alex Morgan",
    phone: "1234567890",
    phonePrefix: "+1",
    email: "alex.morgan@example.com",
    city: "Remote",
    salaryARS: "1800000",
    salaryUSD: "1800",
    noticeDays: "15",
    english: "Professional working proficiency",
    spanish: "Native",
    years: {
      "java": "2",
      "spring": "1",
      "python": "2",
      "fastapi": "1",
      "sql": "2",
      "postgresql": "2",
      "git": "2",
      "docker": "1",
      "linux": "3",
      "c++": "2",
      "c": "2",
      "backend": "2",
      "soporte": "2",
      "software": "2"
    }
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const humanDelay = (min = 300, max = 800) => sleep(Math.floor(Math.random() * (max - min)) + min);

  // Human typing emulator
  async function humanType(inputEl, text) {
    inputEl.focus();
    await humanDelay(150, 300);
    inputEl.value = '';
    
    // Use modern input event dispatch
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      nativeInputValueSetter.call(inputEl, inputEl.value + char);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Random keystroke delay with occasional micro-pause
      const delay = (char === ' ' || char === '.') ? Math.random() * 120 + 80 : Math.random() * 50 + 35;
      await sleep(delay);
    }
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
    await humanDelay(200, 450);
  }

  function getAnswer(label, type, options = []) {
    const t = (label || '').toLowerCase().trim();

    if (t.includes('phone') || t.includes('teléfono') || t.includes('celular') || t.includes('móvil')) return candidate.phone;
    if (t.includes('prefix') || t.includes('prefijo') || t.includes('código')) return candidate.phonePrefix;
    if (t.includes('email') || t.includes('correo')) return candidate.email;
    if (t.includes('city') || t.includes('ciudad') || t.includes('localidad')) return candidate.city;

    if (t.includes('authorized') || t.includes('autorizado') || t.includes('derecho a trabajar')) {
      return findOption(options, ['yes', 'sí', 'si', 'true']) || 'Yes';
    }
    if (t.includes('visa') || t.includes('sponsorship') || t.includes('patrocinio') || t.includes('requieres')) {
      return findOption(options, ['no', 'false']) || 'No';
    }
    if (t.includes('18 years') || t.includes('mayor de 18')) {
      return findOption(options, ['yes', 'sí', 'si', 'true']) || 'Yes';
    }

    if (t.includes('english') || t.includes('inglés')) {
      return findOption(options, ['professional', 'b2', 'c1', 'intermediate', 'intermedio', 'avanzado']) || candidate.english;
    }
    if (t.includes('spanish') || t.includes('español')) {
      return findOption(options, ['native', 'nativo', 'fluent']) || candidate.spanish;
    }

    if (t.includes('salary') || t.includes('sueldo') || t.includes('remuneración') || t.includes('pretensión') || t.includes('compensation')) {
      if (t.includes('usd') || t.includes('dollar') || t.includes('dólar')) return candidate.salaryUSD;
      return candidate.salaryARS;
    }

    if (t.includes('notice') || t.includes('preaviso') || t.includes('start date') || t.includes('incorporación') || t.includes('disponibilidad')) {
      return findOption(options, ['immediate', 'inmediat', '15', '2 week']) || 'Inmediata';
    }

    for (const [skill, yrs] of Object.entries(candidate.years)) {
      if (t.includes(skill)) {
        return findOption(options, [yrs]) || yrs;
      }
    }

    if (options.length > 0) return findOption(options, ['yes', 'sí', 'si', 'true']) || options[0];
    if (type === 'number') return '2';
    return 'Sí';
  }

  function findOption(options, matches) {
    if (!options || options.length === 0) return null;
    for (const opt of options) {
      const o = opt.toLowerCase();
      if (matches.some(m => o.includes(m.toLowerCase()))) return opt;
    }
    return null;
  }

  // 1. Click Easy Apply button if modal not open
  let modal = document.querySelector('div.jobs-easy-apply-modal, div[role="dialog"]');
  if (!modal) {
    const applyBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const txt = (b.innerText || '').toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return txt.includes('solicitud sencilla') || txt.includes('easy apply') || aria.includes('solicitud sencilla') || aria.includes('easy apply');
    });

    if (applyBtn) {
      console.log("👆 Haciendo clic en Solicitud sencilla...");
      applyBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await humanDelay(400, 700);
      applyBtn.click();
      await humanDelay(1500, 2200);
      modal = document.querySelector('div.jobs-easy-apply-modal, div[role="dialog"]');
    }
  }

  if (!modal) {
    alert("❌ No se encontró el modal de Solicitud sencilla. Abrí una vacante con Easy Apply y volvé a ejecutar.");
    return;
  }

  let step = 0;
  const maxSteps = 10;

  while (step < maxSteps) {
    step++;
    console.log(`📋 Procesando paso ${step}...`);
    await humanDelay(600, 1000);

    // Fill text & number inputs
    const inputs = modal.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], textarea');
    for (const inp of inputs) {
      if (inp.offsetParent !== null && (!inp.value || inp.value.trim() === '')) {
        const label = inp.getAttribute('aria-label') || (inp.labels && inp.labels[0] && inp.labels[0].innerText) || inp.id || '';
        const qType = inp.getAttribute('type') || 'text';
        const ans = getAnswer(label, qType);
        console.log(`✍️ Completando: "${label.slice(0, 40)}" ➔ ${ans}`);
        await humanType(inp, String(ans));
      }
    }

    // Fill selects
    const selects = modal.querySelectorAll('select');
    for (const sel of selects) {
      if (sel.offsetParent !== null) {
        const label = sel.getAttribute('aria-label') || (sel.labels && sel.labels[0] && sel.labels[0].innerText) || sel.id || '';
        const options = Array.from(sel.options).map(o => o.text.trim()).filter(Boolean);
        const ans = getAnswer(label, 'select', options);
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].text.trim() === ans || (ans && sel.options[i].text.toLowerCase().includes(ans.toLowerCase()))) {
            sel.selectedIndex = i;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`🔘 Seleccionado: "${label.slice(0, 30)}" ➔ ${sel.options[i].text}`);
            break;
          }
        }
        await humanDelay(200, 400);
      }
    }

    // Fill radios
    const fieldsets = modal.querySelectorAll('fieldset');
    for (const fs of fieldsets) {
      if (fs.offsetParent !== null) {
        const legend = fs.querySelector('legend');
        const qText = legend ? legend.innerText.trim() : '';
        const radios = Array.from(fs.querySelectorAll('input[type="radio"]'));
        if (radios.length > 0 && !radios.some(r => r.checked)) {
          const opts = radios.map(r => {
            const lbl = fs.querySelector(`label[for="${r.id}"]`);
            return lbl ? lbl.innerText.trim() : r.value;
          });
          const ans = getAnswer(qText, 'radio', opts);
          const targetIdx = opts.findIndex(o => o === ans || (ans && o.toLowerCase().includes(ans.toLowerCase())));
          const radioToCheck = radios[targetIdx !== -1 ? targetIdx : 0];
          radioToCheck.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          await humanDelay(150, 300);
          radioToCheck.click();
          radioToCheck.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`🔘 Radio: "${qText.slice(0, 30)}" ➔ ${opts[targetIdx !== -1 ? targetIdx : 0]}`);
          await humanDelay(200, 400);
        }
      }
    }

    // Look for primary action button
    const primaryBtns = Array.from(modal.querySelectorAll('button.artdeco-button--primary, button[type="submit"]')).filter(b => b.offsetParent !== null);
    const nextBtn = primaryBtns[primaryBtns.length - 1];

    if (!nextBtn) break;
    const btnText = (nextBtn.innerText || '').toLowerCase();

    if (btnText.includes('revisar') || btnText.includes('review')) {
      console.log("🛑 Llegamos a la pantalla de REVISIÓN final.");
      nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await humanDelay(500, 800);
      nextBtn.click();
      await humanDelay(1000, 1500);

      // Create success banner
      const banner = document.createElement('div');
      banner.style = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #16a34a; color: white; padding: 14px 24px; border-radius: 10px; font-weight: bold; font-family: sans-serif; font-size: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); z-index: 9999999;";
      banner.innerHTML = "✅ Insanus-Jobs: Formulario autocompletado con éxito.<br><span style='font-size: 12px; font-weight: normal;'>Verificá el CV adjunto y hacé clic en 'Enviar solicitud' cuando estés lista.</span>";
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 10000);
      return;
    }

    if (btnText.includes('enviar') || btnText.includes('submit')) {
      console.log("🛑 Botón de ENVÍO visible. Deteniendo antes de enviar.");
      const banner = document.createElement('div');
      banner.style = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #2563eb; color: white; padding: 14px 24px; border-radius: 10px; font-weight: bold; font-family: sans-serif; font-size: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); z-index: 9999999;";
      banner.innerHTML = "🎯 Todo completado. Hacé clic en 'Enviar solicitud' para confirmar.";
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 10000);
      return;
    }

    // Advance to next step
    console.log(`➡️ Avanzando al siguiente paso (${btnText.trim()})...`);
    nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await humanDelay(400, 700);
    nextBtn.click();
    await humanDelay(1200, 1800);
  }

  console.log("🏁 Proceso de autocompletado finalizado.");
})();
