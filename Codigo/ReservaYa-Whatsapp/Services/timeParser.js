// Services/timeParser.js - Interpretación tolerante de horas y fechas en español.
//
// El bot recibe mensajes como "a las 3 de la tard", "12:30", "12 y media",
// "1530", "tipo 4pm", "mañana a la 1", etc. Este módulo NO reserva nada:
// convierte el texto en una intención estructurada y deja que el orquestador
// valide contra la disponibilidad real del negocio.

const NUMBER_WORDS = {
  cero: 0,
  una: 1, uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16, dieciséis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21, veintiun: 21, veintiún: 21,
  veintidos: 22, veintidós: 22,
  veintitres: 23, veintitrés: 23,
  veinticuatro: 24,
};

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

const WEEKDAYS = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
  jueves: 4, viernes: 5, sabado: 6, sábado: 6,
};

const WEEKDAY_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTimeText(text) {
  let s = norm(text);

  // Meridiem explícito: "3 p. m.", "3pm", "3 A.M."
  s = s.replace(/\b(a\s*\.?\s*m\.?)\b/g, ' am ');
  s = s.replace(/\b(p\s*\.?\s*m\.?)\b/g, ' pm ');
  // "3p" / "3a" (forma corta que usa mucha gente en el chat).
  s = s.replace(/\b(\d{1,2})([ap])\b(?!\w)/g, (_m, h, p) => `${h} ${p === 'a' ? 'am' : 'pm'}`);

  // Casos especiales antes de las expresiones genéricas.
  s = s.replace(/\b12\s+de\s+la\s+noche\b/g, ' 12:00 am ');
  s = s.replace(/\b12\s+del\s+(?:medio\s+)?dia\b/g, ' 12:00 pm ');

  // Rango con la parte del día al final: "de 3 a 5 de la tarde" -> "de 3 a 5 pm".
  s = s.replace(
    /\b(de|entre|desde)\s+(\d{1,2})(?:\s*:\s*(\d{1,2}))?\s*(?:y|a|hasta|-)\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?\s+(de\s+la\s+tarde|de\s+la\s+noche|de\s+la\s+manana|de\s+la\s+madrugada)\b/g,
    (_m, pre, h1, m1, h2, m2, part) => {
      const mer = part.includes('tarde') || part.includes('noche') ? 'pm' : 'am';
      return `${pre} ${h1}${m1 ? `:${m1}` : ''} a ${h2}${m2 ? `:${m2}` : ''} ${mer}`;
    },
  );

  // Expresiones colombianas / naturales.
  s = s.replace(/\bde\s+la\s+manana\b|\bpor\s+la\s+manana\b|\ben\s+la\s+manana\b/g, ' am ');
  s = s.replace(/\bde\s+la\s+tarde\b|\bpor\s+la\s+tarde\b|\ben\s+la\s+tarde\b/g, ' pm ');
  s = s.replace(/\bde\s+la\s+noche\b|\bpor\s+la\s+noche\b|\ben\s+la\s+noche\b/g, ' pm ');
  s = s.replace(/\bde\s+la\s+madrugada\b|\bpor\s+la\s+madrugada\b|\ben\s+la\s+madrugada\b/g, ' am ');

  // Tolerancia a errores de tipeo en la parte del día: "3 de la tard", "7 de la noch".
  s = s.replace(/\b(\d{1,2})\s+de\s+la\s+(tard\w*|noch\w*|manan\w*|madrug\w*)\b/g, (_m, h, word) => {
    if (word.startsWith('tard') || word.startsWith('noch')) return `${h} pm`;
    return `${h} am`;
  });

  // Jerga: "3 tarde", "7 noche", "9 mañana".
  s = s.replace(/\b(\d{1,2})\s+(tarde|noche|madrugada|manana)\b/g, (_m, h, word) => {
    return `${h} ${word === 'tarde' || word === 'noche' ? 'pm' : 'am'}`;
  });

  // Mediodía / medianoche.
  s = s.replace(/\b(?:al?\s+)?mediodia\b|\bmedio\s+dia\b/g, ' 12:00 pm ');
  s = s.replace(/\bmedianoche\b|\bmedia\s+noche\b/g, ' 12:00 am ');

  // Muletillas y aproximaciones.
  s = s.replace(/\b(en\s+punto|exactas?|exacto|aprox\.?|aproximadamente|mas\s+o\s+menos|tipo|sobre|como\s+a|a\s+eso\s+de|ish)\b/g, ' ');
  s = s.replace(/(\d)\s*ish\b/g, '$1');
  s = s.replace(/\bhrs?\b|\bhoras?\b/g, ' ');
  s = s.replace(/\bcerca\s+de\s+las?\b/g, 'a las');

  // Números escritos con letra: "a la una", "a las tres y media".
  s = s.replace(
    /\b(a\s+las?|alas?|las?|para\s+las?|desde\s+las?|hasta\s+las?|antes\s+de\s+las?|despues\s+de\s+las?)\s+(cero|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintiun|veintidos|veintitres|veinticuatro)\b/g,
    (_m, pre, word) => `${pre} ${NUMBER_WORDS[word]}`,
  );
  // "nueve y media" sin preposición.
  s = s.replace(
    /\b(cero|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintiun|veintidos|veintitres|veinticuatro)\s+y\s+(media|cuarto)\b/g,
    (_m, word, suffix) => `${NUMBER_WORDS[word]}:${suffix === 'media' ? '30' : '15'}`,
  );
  // "diez treinta", "doce quince" (hora con letras).
  s = s.replace(
    /\b(cero|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintiun|veintidos|veintitres|veinticuatro)\s+(treinta|quince|cuarenta\s+y\s+cinco)\b/g,
    (_m, word, suffix) => {
      const mins = suffix === 'treinta' ? '30' : suffix === 'quince' ? '15' : '45';
      return `${NUMBER_WORDS[word]}:${mins}`;
    },
  );

  // "12 y media", "12 y cuarto", "12 y 30".
  s = s.replace(/\b(\d{1,2})\s+y\s+media\b/g, '$1:30');
  s = s.replace(/\b(\d{1,2})\s+y\s+cuarto\b/g, '$1:15');
  s = s.replace(/\b(\d{1,2})\s+y\s+(\d{2})\b/g, (m, h, mm) => (Number(mm) < 60 ? `${h}:${mm}` : m));

  // "3h30", "3 h", "3hrs".
  s = s.replace(/\b(\d{1,2})\s*h\s*(\d{2})\b/g, '$1:$2');
  s = s.replace(/\b(\d{1,2})\s*h\b/g, '$1:00');

  // "12.30" / "12 . 30" (sin tocar precios como 10.000).
  s = s.replace(/\b(\d{1,2})\s*\.\s*(\d{2})(?!\d)/g, '$1:$2');

  // "a las 12 30" (dos números separados).
  s = s.replace(
    /\b(a\s+las?|alas?|las?|tipo)\s+(\d{1,2})\s+(\d{2})\b/g,
    (m, pre, h, mm) => (Number(mm) < 60 ? `${pre} ${h}:${mm}` : m),
  );

  // Limpieza final de puntos sueltos (ej. "3 p. m." -> "3 pm").
  s = s.replace(/\s*\.\s*(?=\s|$)/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function validHour(h) {
  return Number.isInteger(h) && h >= 0 && h <= 23;
}

function validMinute(m) {
  return Number.isInteger(m) && m >= 0 && m <= 59;
}

/**
 * Resuelve una hora de 12 horas a 24 horas.
 * Devuelve { hour24, ambiguous, candidates }.
 * - "3 pm" -> 15, no ambiguo.
 * - "15:30" -> 15:30, no ambiguo.
 * - "3:30" -> ambiguo: 3:30 a. m. o 3:30 p. m.
 * - "12" -> ambiguo: 12:00 p. m. o 12:00 a. m.
 */
function resolveMeridiem(hour, minute, meridiem) {
  if (!validMinute(minute)) return null;
  const mer = meridiem === 'am' || meridiem === 'pm' ? meridiem : null;

  if (mer === 'pm') {
    if (hour === 12) return { hour24: 12, ambiguous: false, candidates: [] };
    if (hour >= 1 && hour <= 11) return { hour24: hour + 12, ambiguous: false, candidates: [] };
    return null;
  }
  if (mer === 'am') {
    if (hour === 12) return { hour24: 0, ambiguous: false, candidates: [] };
    if (hour >= 1 && hour <= 11) return { hour24: hour, ambiguous: false, candidates: [] };
    return null;
  }

  if (hour >= 13 && hour <= 23) return { hour24: hour, ambiguous: false, candidates: [] };
  if (hour === 0) return { hour24: 0, ambiguous: false, candidates: [] };
  if (hour >= 1 && hour <= 12) {
    const candidates = hour === 12 ? [12, 0] : [hour, hour + 12];
    return { hour24: null, ambiguous: true, candidates };
  }
  return null;
}

function meridiemFrom(raw) {
  if (/\bpm\b/.test(raw)) return 'pm';
  if (/\bam\b/.test(raw)) return 'am';
  return null;
}

function modifierFrom(s, matchIndex, matchText = '') {
  const own = String(matchText);
  if (/\bantes\s+de\s+las?\b/.test(own)) return 'before';
  if (/\bdespues\s+de\s+las?\b/.test(own)) return 'after';
  const before = s.slice(Math.max(0, matchIndex - 24), matchIndex);
  if (/\bantes\s+de\s+las?\s*$/.test(before)) return 'before';
  if (/\bdespues\s+de\s+las?\s*$/.test(before)) return 'after';
  return null;
}

function makeExact(hour, minute, meridiem, raw, extra = {}) {
  const resolved = resolveMeridiem(hour, minute, meridiem);
  if (!resolved) return null;
  return {
    kind: resolved.ambiguous ? 'ambiguous' : 'exact',
    hour: resolved.ambiguous ? null : resolved.hour24,
    minute,
    candidates: resolved.candidates,
    meridiem: meridiem || null,
    menuMeridiem: meridiem || null,
    text: raw,
    ...extra,
  };
}

/**
 * Interpreta una hora en texto libre.
 *
 * @param {string} text
 * @param {{ context?: 'slot'|'day'|'generic', allowBare?: boolean, allowCompact?: boolean }} options
 * @returns {object} { kind: 'exact'|'ambiguous'|'range'|'none', ... }
 */
function parseTimeRequest(text, options = {}) {
  const context = options.context || 'generic';
  const allowBare = options.allowBare ?? context === 'slot';
  const allowCompact = options.allowCompact ?? context === 'slot';
  const original = String(text ?? '');
  const s = normalizeTimeText(original);
  if (!s) return { kind: 'none', text: original };

  const approximate = /\b(tipo|mas o menos|aprox|aproximadamente|cerca de|sobre las|a eso de)\b|ish\b/.test(original.toLowerCase());

  // 1) Rangos: "de 3 a 5", "entre 2 y 4", "de 9 a 11 de la mañana".
  const range = s.match(
    /\b(?:de|entre|desde)\s+(\d{1,2})(?:\s*:\s*(\d{1,2}))?\s*(am|pm)?\s*(?:y|a|hasta|-)\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?\s*(am|pm)?\b/,
  );
  if (range) {
    const [, h1, m1, mer1, h2, m2, mer2] = range;
    const start = makeExact(Number(h1), Number(m1 || 0), mer1 || null, range[0]);
    const end = makeExact(Number(h2), Number(m2 || 0), mer2 || null, range[0]);
    if (start && end) {
      // Si solo el final trae meridiem ("de 3 a 5 pm"), se aplica a ambos.
      // Si el rango cruza el mediodía ("de 11 a 1 de la tarde"), el inicio es
      // de la mañana para no producir un rango 23:00-13:00.
      if (!mer1 && mer2 && Number(h1) >= 1 && Number(h1) <= 12) {
        const endResolved = resolveMeridiem(Number(h2), Number(m2 || 0), mer2);
        const startPm = makeExact(Number(h1), Number(m1 || 0), 'pm', range[0]);
        const startAm = makeExact(Number(h1), Number(m1 || 0), 'am', range[0]);
        let chosen = mer2 === 'pm' ? startPm : startAm;
        if (endResolved && !endResolved.ambiguous && startPm && !startPm.ambiguous
          && mer2 === 'pm' && startPm.hour >= endResolved.hour24) {
          chosen = startAm;
        }
        if (chosen && !chosen.ambiguous) {
          start.kind = chosen.kind;
          start.hour = chosen.hour;
          start.candidates = chosen.candidates;
          start.meridiem = chosen.meridiem;
        }
      }
      return {
        kind: 'range',
        from: start,
        to: end,
        approximate,
        text: range[0],
        raw: original,
      };
    }
  }

  // 1b) Rango sin preposición: "3 a 5", "3 y 5", "3-5".
  if (context === 'slot') {
    const bareRange = s.match(
      /\b(\d{1,2})(?:\s*:\s*(\d{1,2}))?\s*(?:a|y|hasta|-)\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?\s*(am|pm)?\b/,
    );
    if (bareRange && !/\b(?:de|entre|desde)\b/.test(s)) {
      const [, h1, m1, h2, m2, mer] = bareRange;
      const start = makeExact(Number(h1), Number(m1 || 0), mer || null, bareRange[0]);
      const end = makeExact(Number(h2), Number(m2 || 0), mer || null, bareRange[0]);
      if (start && end) {
        return {
          kind: 'range',
          from: start,
          to: end,
          approximate,
          text: bareRange[0],
          raw: original,
        };
      }
    }
  }

  // 2) "a las 3", "para las 3:30", "antes de las 5".
  const aLas = s.match(
    /\b(a\s+las?|alas?|las?|para\s+las?|desde\s+las?|hasta\s+las?|antes\s+de\s+las?|despues\s+de\s+las?)\s+(\d{1,2})(?:\s*:\s*(\d{1,2}))?\s*(am|pm)?\b/,
  );
  if (aLas) {
    const [, , h, m, mer] = aLas;
    const exact = makeExact(Number(h), Number(m || 0), mer || null, aLas[0], {
      modifier: modifierFrom(s, aLas.index || 0, aLas[0]),
      approximate,
    });
    if (exact) return { ...exact, raw: original };
  }

  // 3) "3:30", "15:30", "3:30 pm".
  const colon = s.match(/\b(\d{1,2})\s*:\s*(\d{1,2})\s*(am|pm)?\b/);
  if (colon) {
    const [, h, m, mer] = colon;
    const exact = makeExact(Number(h), Number(m), mer || null, colon[0], {
      modifier: modifierFrom(s, colon.index || 0, colon[0]),
      approximate,
    });
    if (exact) return { ...exact, raw: original };
  }

  // 4) "3 pm", "3am".
  const merOnly = s.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (merOnly) {
    const exact = makeExact(Number(merOnly[1]), 0, merOnly[2], merOnly[0], {
      modifier: modifierFrom(s, merOnly.index || 0, merOnly[0]),
      approximate,
    });
    if (exact) return { ...exact, raw: original };
  }

  // 5) "1530", "930" (horario militar / compacto). Solo en contexto de horas.
  if (allowCompact) {
    const compact = s.match(/\b(\d{3,4})\b/);
    if (compact) {
      const digits = compact[1];
      const h = Number(digits.slice(0, digits.length - 2));
      const m = Number(digits.slice(-2));
      if (validHour(h) && validMinute(m)) {
        const exact = makeExact(h, m, null, compact[0], {
          modifier: modifierFrom(s, compact.index || 0, compact[0]),
          approximate,
          compact: true,
        });
        if (exact) return { ...exact, raw: original };
      }
    }
  }

  // 6) Número suelto: "3". En el menú de horas se acepta como hora,
  //    pero el orquestador primero intenta interpretarlo como índice.
  if (allowBare) {
    const bare = s.match(/^\s*(\d{1,2})\s*$/);
    if (bare) {
      const exact = makeExact(Number(bare[1]), 0, null, bare[0], { approximate, bare: true });
      if (exact) return { ...exact, raw: original };
    }
  }

  // Si el texto claramente parece una hora pero no es válida (25:00, 3:75,
  // "a las 27"), se devuelve invalid para que el bot lo explique en vez de
  // ignorarlo y mostrar el menú como si no hubiera escrito nada.
  if (/\b\d{1,2}\s*:\s*\d{1,2}\b/.test(s) || /\b(?:a\s+las?|alas?)\s+\d{1,2}\b/.test(s) || /\b\d{1,2}\s*(?:am|pm)\b/.test(s)) {
    return { kind: 'invalid', reason: 'hour', text: original, raw: original };
  }

  return { kind: 'none', text: original, raw: original };
}

function parseDateNumber(day, month, year, today) {
  const todayParts = today.split('-').map(Number);
  let y = year || todayParts[0];
  let m = month;
  let d = day;
  if (!year && m < todayParts[1]) y += 1;
  if (!year && m === todayParts[1] && d < todayParts[2]) {
    // "el 5" cuando ya pasó: siguiente mes.
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/**
 * Interpreta una fecha en texto libre. `today` debe ser la fecha local del
 * negocio en formato YYYY-MM-DD.
 */
function parseDayRequest(text, { today } = {}) {
  const original = String(text ?? '');
  const s = norm(original);
  if (!s || !today) return null;

  // "pasado mañana" antes que "mañana".
  if (/\bpasado\s+manana\b/.test(s)) {
    return { date: addDays(today, 2), label: 'pasado mañana', text: original };
  }
  if (/\b(hoy|este\s+dia|el\s+mismo\s+dia)\b/.test(s)) {
    return { date: today, label: 'hoy', text: original };
  }
  if (/\bmanana\b/.test(s) && !/\bde\s+la\s+manana\b/.test(s)) {
    return { date: addDays(today, 1), label: 'mañana', text: original };
  }

  const inDays = s.match(/\b(en|dentro\s+de)\s+(\d{1,2})\s+dias?\b/);
  if (inDays) {
    return { date: addDays(today, Number(inDays[2])), label: `en ${inDays[2]} días`, text: original };
  }

  if (/\bfin\s+de\s+semana\b/.test(s)) {
    const wd = weekdayOf(today);
    const days = (6 - wd + 7) % 7;
    return { date: addDays(today, days), label: 'el fin de semana', text: original };
  }

  // "12/11", "12/11/2026".
  const slash = s.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : null;
    if (year != null && year < 100) year += 2000;
    const date = parseDateNumber(day, month, year, today);
    if (date) return { date, label: slash[0], text: original };
  }

  // "12 de noviembre", "12 de noviembre de 2026".
  const longDate = s.match(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?\b/,
  );
  if (longDate) {
    const day = Number(longDate[1]);
    const month = MONTHS[longDate[2]];
    const year = longDate[3] ? Number(longDate[3]) : null;
    const date = parseDateNumber(day, month, year, today);
    if (date) return { date, label: longDate[0], text: original };
  }

  // "el 12" / "el 5 de este mes".
  const dayOnly = s.match(/\b(?:el|para\s+el)\s+(\d{1,2})\b/);
  if (dayOnly && Number(dayOnly[1]) >= 1 && Number(dayOnly[1]) <= 31) {
    const todayParts = today.split('-').map(Number);
    let month = todayParts[1];
    let year = todayParts[0];
    if (Number(dayOnly[1]) < todayParts[2]) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    const date = parseDateNumber(Number(dayOnly[1]), month, year, today);
    if (date) return { date, label: dayOnly[0], text: original };
  }

  // Días de la semana: "el viernes", "este sábado", "próximo lunes".
  const weekdayMatch = s.match(
    /\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/,
  );
  if (weekdayMatch) {
    const target = WEEKDAYS[weekdayMatch[1]];
    const current = weekdayOf(today);
    let delta = (target - current + 7) % 7;
    if (/\b(proximo|siguiente|que\s+viene)\b/.test(s) && delta === 0) delta = 7;
    return {
      date: addDays(today, delta),
      label: weekdayMatch[0],
      weekday: target,
      text: original,
    };
  }

  if (/\b(proximo|siguiente|otro)\s+dia\b|\bmanana\s+siguiente\b/.test(s)) {
    return { date: addDays(today, 1), label: 'el día siguiente', text: original };
  }

  return null;
}

function weekdayKey(date) {
  return WEEKDAY_KEY[weekdayOf(date)];
}

function todayInZone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

module.exports = {
  parseTimeRequest,
  parseDayRequest,
  normalizeTimeText,
  resolveMeridiem,
  weekdayKey,
  weekdayOf,
  todayInZone,
  addDays,
  NUMBER_WORDS,
  MONTHS,
  WEEKDAYS,
};
