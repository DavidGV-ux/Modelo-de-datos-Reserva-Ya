// utils.js - utilidades compartidas (firma HMAC, parseo, teléfono, formato)
const crypto = require('crypto');
const https = require('https');

class Utils {
  static log(level, message, extra) {
    const line = `${new Date().toISOString()} [${level}] ${message}`;
    if (extra !== undefined) {
      console.log(line, extra);
    } else {
      console.log(line);
    }
  }

  static generateTrackingId() {
    return `ryw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  static safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // Firma X-Hub-Signature-256: HMAC-SHA256(APP_SECRET, rawBody) como "sha256=..."
  // FAIL-CLOSED: sin ningún appSecret configurado se rechaza todo.
  // Acepta un secret único o un arreglo (cuando el webhook recibe eventos de
  // varias apps de Meta firmadas con su propio app secret).
  static verifyWhatsAppSignature(rawBody, signatureHeader, secrets) {
    const list = Array.isArray(secrets) ? secrets : [secrets];
    const available = list.filter(Boolean);
    if (!available.length) {
      Utils.log('error', 'WHATSAPP_APP_SECRET no configurado. Rechazando webhooks (fail-closed).');
      return false;
    }
    if (!signatureHeader || typeof signatureHeader !== 'string') return false;
    if (!rawBody) return false;
    if (!signatureHeader.startsWith('sha256=')) return false;

    const provided = signatureHeader.slice('sha256='.length).trim();
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
    for (const secret of available) {
      const expected = crypto.createHmac('sha256', secret).update(bodyBuffer).digest('hex');
      if (Utils.safeEqual(expected, provided)) return true;
    }
    return false;
  }

  static validateWhatsAppMessage(body) {
    if (!body?.entry?.[0]?.changes?.[0]?.value) return { valid: false, error: 'invalid structure' };
    return { valid: true };
  }

  // Reenvía el webhook ORIGINAL (bytes crudos + firma intacta) a otro backend
  // (p. ej. fyn) para que siga procesando sus propios números. Devuelve true si
  // el destino respondió 2xx.
  static forwardWebhook(rawBody, signatureHeader, url) {
    return new Promise((resolve) => {
      try {
        const u = new URL(url);
        const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyBuf),
        };
        if (signatureHeader && typeof signatureHeader === 'string') {
          headers['X-Hub-Signature-256'] = signatureHeader;
        }
        const req = https.request({
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          method: 'POST',
          headers,
          timeout: 10000,
        }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
        });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
        req.write(bodyBuf);
        req.end();
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Extrae el mensaje entrante soportando textos y respuestas interactivas
   * (list_reply / button_reply). Los statuses (receipts) se ignoran.
   */
  static extractMessageInfo(body) {
    const entry = body.entry[0];
    const changes = entry.changes[0];
    const value = changes.value;

    const message = value.messages?.[0];
    if (!message) {
      return { isEmpty: true, from: null, messageBody: '', messageType: 'none', userName: '', messageId: null };
    }

    let messageBody = '';
    let messageType = message.type || 'text';

    if (message.text?.body) {
      messageBody = message.text.body;
    } else if (message.interactive?.list_reply) {
      messageType = 'interactive_list';
      messageBody = message.interactive.list_reply.id;
    } else if (message.interactive?.button_reply) {
      messageType = 'interactive_button';
      messageBody = message.interactive.button_reply.id;
    }

    return {
      isEmpty: false,
      from: message.from,
      messageId: message.id,
      timestamp: message.timestamp,
      messageBody,
      messageType,
      userName: value.contacts?.[0]?.profile?.name || 'Usuario',
      userWaId: value.contacts?.[0]?.wa_id || message.from,
      phoneNumberId: value.metadata?.phone_number_id || null,
      hasStatus: Array.isArray(value.statuses) && value.statuses.length > 0,
    };
  }

  static sanitizeTextForAI(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .trim()
      .replace(/[^\w\s\u00C0-\u017F\u0100-\u024F$¿?¡!.,;:()\-\/%]/g, '')
      .substring(0, 1000);
  }

  static formatResponseForWhatsApp(text) {
    const s = String(text ?? '').trim();
    if (s.length <= 4000) return s;
    return `${s.substring(0, 3997)}...`;
  }

  // Teléfono a E.164 (+57 por defecto) para clave canónica en la BD.
  static normalizePhoneE164(input, countryCode = '57') {
    if (typeof input !== 'string' || !input.trim()) return null;
    let digits = input.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('00')) digits = digits.slice(2);
    const hasCountryCode = digits.startsWith(countryCode) && digits.length > countryCode.length;
    if (!hasCountryCode) {
      if (digits.startsWith('0')) digits = digits.slice(1);
      if (digits.length === 10) return `+${countryCode}${digits}`;
    }
    if (digits.length < 10 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // Solo dígitos (para llaves de BD y comparación con client_info.phone).
  static phoneDigits(input) {
    const clean = String(input ?? '').replace(/\D/g, '');
    return clean.length >= 10 ? clean : null;
  }

  static money(value, currency = 'COP') {
    const n = Number(value ?? 0);
    if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`;
    return `$${Math.round(n).toLocaleString('es-CO')} COP`;
  }

  // Formatea un ISO UTC a una hora local legible con la timezone del negocio.
  static formatSlotLocal(isoStart, timezone) {
    const date = new Date(isoStart);
    const formatter = new Intl.DateTimeFormat('es-CO', {
      timeZone: timezone || 'America/Bogota',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(date);
  }

  static parseCategoryFromText(text) {
    const map = [
      { re: /peluquer|barber|corte|uña|manicur|estilist|beauty/i, category: 'beauty' },
      { re: /salud|medic|clinica|fisio|odont|psicolog|doctor/i, category: 'health' },
      { re: /mascota|perro|gato|vet|peluquer.canina|pet/i, category: 'pets' },
      { re: /restaurante|comida|almuerzo|hamburguesa|pizza|food/i, category: 'food' },
      { re: /caf[ée](teria)?|\bbar(es)?\b|cerveza|drink|coctel|coffee/i, category: 'bars_cafes' },
      { re: /gimnasio|fitness|yoga|deporte|padel|tenis|sport/i, category: 'sports' },
      { re: /esparcimiento|ocio|diversi|juego|leisure/i, category: 'leisure' },
      { re: /educaci|tutor|curso|clase|estudio/i, category: 'education' },
      { re: /hogar|limpieza|plomer|electricist|home/i, category: 'home' },
      { re: /compras|shop|tienda|mercado/i, category: 'shopping' },
      { re: /evento|fiesta|organizaci|concert|event/i, category: 'events' },
    ];
    for (const m of map) {
      if (m.re.test(text)) return m.category;
    }
    return null;
  }

  // Distancia de Levenshtein (variante OSA) para tolerar errores de tipeo típicos.
  static typoDistance(a, b) {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (Math.abs(m - n) > 1) return 99;
    const dp = [];
    for (let i = 0; i <= m; i++) {
      dp[i] = new Array(n + 1);
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
        }
      }
    }
    return dp[m][n];
  }

  // Busca una categoría tolerando errores de tipeo (distancia <= 1) cuando el
  // matcheo estricto de parseCategoryFromText no encontró nada.
  static fuzzyCategoryFromText(text) {
    const n = String(text ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const tokens = n.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    if (!tokens.length) return null;
    const map = [
      { category: 'beauty', words: ['peluqueria', 'peluquero', 'peluqueros', 'barberia', 'barber', 'barbero', 'corte', 'cortes', 'cortar', 'unas', 'manicura', 'estilista', 'estilistas', 'peinado', 'beauty'] },
      { category: 'health', words: ['salud', 'medico', 'clinica', 'fisio', 'odonotologia', 'odontologia', 'dentista', 'psicologo', 'psicologia', 'doctor', 'doctora', 'medicina'] },
      { category: 'pets', words: ['mascota', 'mascotas', 'perro', 'perros', 'gato', 'gatos', 'veterinaria', 'veterinario', 'pet', 'pets'] },
      { category: 'food', words: ['restaurante', 'restaurantes', 'comida', 'comidas', 'almuerzo', 'alamuerzos', 'almuerzos', 'hamburguesa', 'hamburguesas', 'pizza', 'pizzas', 'food'] },
      { category: 'bars_cafes', words: ['cafe', 'cafeteria', 'cafetaria', 'bares', 'cerveza', 'coctel', 'cocteles', 'coctail', 'coffee', 'bar'] },
      { category: 'sports', words: ['gimnasio', 'gimnasios', 'fitness', 'yoga', 'deporte', 'deportes', 'padel', 'tenis', 'sport', 'sports'] },
      { category: 'leisure', words: ['esparcimiento', 'ocio', 'diversion', 'juego', 'juegos', 'leisure'] },
      { category: 'education', words: ['educacion', 'tutor', 'tutoria', 'tutorias', 'curso', 'cursos', 'clase', 'clases', 'estudio'] },
      { category: 'home', words: ['hogar', 'limpieza', 'plomeria', 'plomero', 'electricista', 'electricidad', 'home'] },
      { category: 'shopping', words: ['compras', 'shop', 'shopping', 'tienda', 'tiendas', 'mercado'] },
      { category: 'events', words: ['evento', 'eventos', 'fiesta', 'fiestas', 'organizacion', 'concert', 'concierto', 'event', 'events'] },
    ];
    for (const { category, words } of map) {
      for (const token of tokens) {
        if (words.some((w) => Utils.typoDistance(w, token) <= 1)) return category;
      }
    }
    return null;
  }
}

module.exports = Utils;