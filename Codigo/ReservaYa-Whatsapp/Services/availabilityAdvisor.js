// Services/availabilityAdvisor.js - Inteligencia de disponibilidad para el bot.
//
// Centraliza las reglas que el usuario espera al pedir una hora:
//  - horario real del profesional (incluye pausas/almuerzo si el horario está partido),
//  - citas ya ocupadas del profesional,
//  - alternativas con otros profesionales,
//  - modo de capacidad compartida (cafés/restaurantes: varias mesas a la vez),
//  - siguiente día con disponibilidad.
const reservaYaApi = require('./reservaYaApi');
const Utils = require('../utils');
const { weekdayKey } = require('./timeParser');

const DEFAULT_WEEK = {
  monday: [{ start: '09:00', end: '18:00' }],
  tuesday: [{ start: '09:00', end: '18:00' }],
  wednesday: [{ start: '09:00', end: '18:00' }],
  thursday: [{ start: '09:00', end: '18:00' }],
  friday: [{ start: '09:00', end: '18:00' }],
  saturday: [{ start: '09:00', end: '18:00' }],
  sunday: [],
};

// Categorías donde el "profesional" no es un recurso exclusivo: un mesero o
// barista puede atender varias mesas/clientes en la misma franja. La capacidad
// real la controla el Back con `capacityPerSlot`.
const SHARED_CAPACITY_CATEGORIES = new Set(['food', 'bars_cafes', 'leisure', 'events', 'shopping']);
const DEFAULT_CAPACITY = {
  food: 20,
  bars_cafes: 20,
  leisure: 30,
  events: 50,
  shopping: 10,
};

function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function policyForTenant(tenant) {
  const configured = tenant?.settings?.bookingMode;
  const mode = configured === 'capacity' || configured === 'exclusive'
    ? configured
    : (SHARED_CAPACITY_CATEGORIES.has(tenant?.category) ? 'capacity' : 'exclusive');
  if (mode === 'exclusive') return { mode, capacityPerSlot: 1 };
  const configuredCapacity = Number(tenant?.settings?.capacityPerSlot);
  const fallback = DEFAULT_CAPACITY[tenant?.category] ?? 10;
  const capacity = Number.isFinite(configuredCapacity) && configuredCapacity > 0
    ? Math.floor(configuredCapacity)
    : fallback;
  return { mode, capacityPerSlot: Math.max(1, capacity) };
}

function intervalsForDate(professional, date) {
  const key = weekdayKey(date);
  const schedule = professional?.schedule || {};
  const raw = Array.isArray(schedule[key]) ? schedule[key] : [];
  if (raw.length) {
    return raw
      .map((w) => ({
        start: Utils.minutesFromClock(w.start),
        end: Utils.minutesFromClock(w.end),
      }))
      .filter((w) => w.start != null && w.end != null && w.end > w.start)
      .sort((a, b) => a.start - b.start);
  }
  const hasAny = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .some((d) => Array.isArray(schedule[d]) && schedule[d].length > 0);
  if (hasAny) return [];
  // Igual que el Back: un profesional sin horario configurado usa el default.
  return (DEFAULT_WEEK[key] || [])
    .map((w) => ({
      start: Utils.minutesFromClock(w.start),
      end: Utils.minutesFromClock(w.end),
    }))
    .filter((w) => w.start != null && w.end != null && w.end > w.start);
}

function mergeIntervals(list) {
  const flat = list
    .flat()
    .filter((w) => w.start != null && w.end != null && w.end > w.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const w of flat) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

function intervalsForProfessionals(professionals, date) {
  return mergeIntervals((professionals || []).map((p) => intervalsForDate(p, date)));
}

function isWithin(intervals, minutes) {
  return intervals.some((w) => minutes >= w.start && minutes < w.end);
}

function breakAround(intervals, minutes) {
  for (let i = 0; i < intervals.length - 1; i += 1) {
    const gapStart = intervals[i].end;
    const gapEnd = intervals[i + 1].start;
    if (gapEnd - gapStart >= 20 && minutes >= gapStart && minutes < gapEnd) {
      return { start: gapStart, end: gapEnd };
    }
  }
  return null;
}

function scheduleText(intervals) {
  if (!intervals || intervals.length === 0) return 'sin horario ese día';
  return intervals
    .map((w) => `${Utils.formatMinutes(w.start)} a ${Utils.formatMinutes(w.end)}`)
    .join(' y ');
}

function nearestEntry(entries, targetMinutes, { preferAfter = false } = {}) {
  const list = (entries || []).filter(Boolean);
  if (!list.length) return null;
  const scored = list.map((e) => {
    const mins = Utils.localMinutes(e.start, e.timezone) ?? e.minutes;
    return { entry: e, mins, distance: Math.abs(mins - targetMinutes) };
  });
  scored.sort((a, b) => {
    if (preferAfter) {
      const aAfter = a.mins >= targetMinutes ? 0 : 1;
      const bAfter = b.mins >= targetMinutes ? 0 : 1;
      if (aAfter !== bAfter) return aAfter - bAfter;
    }
    return a.distance - b.distance;
  });
  return scored[0]?.entry || null;
}

function slotEntry(slot, professional, timezone) {
  return {
    start: slot.start,
    end: slot.end,
    timezone,
    professionalId: professional.id,
    professionalName: professional.name,
    professional,
  };
}

class AvailabilityAdvisor {
  policyForTenant(tenant) {
    return policyForTenant(tenant);
  }

  intervalsForDate(professional, date) {
    return intervalsForDate(professional, date);
  }

  intervalsForProfessionals(professionals, date) {
    return intervalsForProfessionals(professionals, date);
  }

  scheduleText(intervals) {
    return scheduleText(intervals);
  }

  breakAround(intervals, minutes) {
    return breakAround(intervals, minutes);
  }

  /**
   * Consulta la disponibilidad de un día para uno o varios profesionales y la
   * consolida por hora de inicio.
   */
  async loadAvailability({ tenant, professionals, date, durationMinutes }) {
    const timezone = tenant?.timezone || 'America/Bogota';
    const list = (professionals || []).filter(Boolean);
    const byProfessional = new Map();
    const merged = new Map();

    await Promise.all(list.map(async (professional) => {
      let slots = [];
      try {
        slots = await reservaYaApi.getSlots(tenant.tenantId, {
          professionalId: professional.id,
          date,
          durationMinutes,
        });
      } catch (err) {
        Utils.log('warn', `availability ${professional.id} ${date}: ${err.message}`);
      }
      byProfessional.set(professional.id, Array.isArray(slots) ? slots : []);
      for (const slot of Array.isArray(slots) ? slots : []) {
        const key = slot.start;
        const entry = merged.get(key) || {
          start: slot.start,
          end: slot.end,
          timezone,
          available: false,
          blocked: false,
          professionalIds: [],
          professionalNames: [],
        };
        if (slot.blocked) entry.blocked = true;
        if (slot.available && !slot.blocked) {
          entry.available = true;
          entry.professionalIds.push(professional.id);
          entry.professionalNames.push(professional.name);
        }
        merged.set(key, entry);
      }
    }));

    const mergedList = [...merged.values()].sort((a, b) => new Date(a.start) - new Date(b.start));
    const available = mergedList.filter((e) => e.available);
    return {
      date,
      timezone,
      policy: policyForTenant(tenant),
      byProfessional,
      merged: mergedList,
      available,
    };
  }

  exactSlot(availability, targetMinutes) {
    return (availability?.merged || []).find(
      (e) => Utils.localMinutes(e.start, availability.timezone) === targetMinutes,
    ) || null;
  }

  nearestAlternative(availability, targetMinutes, { preferAfter = false } = {}) {
    return nearestEntry(availability?.available || [], targetMinutes, { preferAfter });
  }

  /**
   * Diagnostica por qué una hora pedida no se puede reservar y reúne las
   * alternativas: otro profesional a la misma hora, hora cercana el mismo día
   * y siguiente día disponible.
   */
  diagnose({ tenant, professionals, chosenProfessional, date, targetMinutes, availability }) {
    const timezone = tenant?.timezone || 'America/Bogota';
    const policy = policyForTenant(tenant);
    const chosenIntervals = chosenProfessional
      ? intervalsForDate(chosenProfessional, date)
      : intervalsForProfessionals(professionals, date);
    const exact = this.exactSlot(availability, targetMinutes);
    const breakWindow = breakAround(chosenIntervals, targetMinutes);
    const within = isWithin(chosenIntervals, targetMinutes);

    const otherProfessionals = exact?.available
      ? (exact.professionalIds || []).filter((id) => !chosenProfessional || id !== chosenProfessional.id)
      : [];

    let reason = 'booked';
    if (exact?.available) reason = 'available';
    else if (breakWindow) reason = 'break';
    else if (chosenIntervals.length === 0) reason = 'day_off';
    else if (targetMinutes < chosenIntervals[0].start) reason = 'before_open';
    else if (targetMinutes >= chosenIntervals[chosenIntervals.length - 1].end) reason = 'after_close';
    else if (!within) reason = 'outside';
    else if (policy.mode === 'capacity') reason = 'full';
    else if (otherProfessionals.length) reason = 'other_professional';

    const preferAfter = reason === 'break' || reason === 'before_open';
    const sameDay = this.nearestAlternative(availability, targetMinutes, { preferAfter });

    return {
      reason,
      policy,
      date,
      timezone,
      targetMinutes,
      intervals: chosenIntervals,
      scheduleText: scheduleText(chosenIntervals),
      breakWindow,
      exact,
      otherProfessionals,
      sameDay,
      // Se completa en el orquestador si hace falta buscar otro día.
      nextDay: null,
    };
  }

  /**
   * Busca el siguiente día con disponibilidad a partir de `afterDate`
   * (exclusivo) y devuelve la mejor hora cercana a `targetMinutes`.
   */
  async nextAvailableDay({ tenant, professionals, afterDate, durationMinutes, targetMinutes = 9 * 60, windowDays = 14 }) {
    const ids = (professionals || []).map((p) => p.id).filter(Boolean);
    if (!ids.length) return null;
    let days = [];
    try {
      days = await reservaYaApi.getAvailabilityDays(tenant.tenantId, ids, windowDays);
    } catch (err) {
      Utils.log('warn', `nextAvailableDay days: ${err.message}`);
      return null;
    }
    const candidates = (Array.isArray(days) ? days : [])
      .filter((d) => d > afterDate)
      .slice(0, 8);
    for (const day of candidates) {
      const availability = await this.loadAvailability({
        tenant,
        professionals,
        date: day,
        durationMinutes,
      });
      if (!availability.available.length) continue;
      const nearest = nearestEntry(availability.available, targetMinutes, { preferAfter: false });
      return { date: day, availability, slot: nearest };
    }
    return null;
  }

  /**
   * Empareja el texto del usuario con profesionales por nombre o cargo,
   * tolerando errores de tipeo.
   */
  matchProfessionals(list, text) {
    const n = norm(text).trim();
    if (!n) return [];
    const scored = [];
    for (const p of list || []) {
      const name = norm(p.name);
      const title = norm(p.title || '');
      if (name === n || title === n) {
        scored.push({ p, score: 0 });
        continue;
      }
      if (name.includes(n) || n.includes(name) || (title && (title.includes(n) || n.includes(title)))) {
        scored.push({ p, score: 1 });
        continue;
      }
      const tokens = n.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
      let best = 99;
      for (const token of tokens) {
        for (const word of name.split(/\s+/).concat(title.split(/\s+/))) {
          if (word.length < 3) continue;
          best = Math.min(best, Utils.typoDistance(word, token));
        }
      }
      if (best <= 1) scored.push({ p, score: 2 + best });
    }
    scored.sort((a, b) => a.score - b.score);
    const top = scored[0]?.score;
    return scored.filter((s) => s.score === top).map((s) => s.p);
  }

  /**
   * Elige, entre varias opciones de una misma hora, el profesional con menos
   * citas ese día (reparte carga en negocios con varios profesionales).
   */
  pickProfessional(entry) {
    return entry?.professionalIds?.[0] || null;
  }
}

module.exports = new AvailabilityAdvisor();
module.exports.policyForTenant = policyForTenant;
module.exports.intervalsForDate = intervalsForDate;
module.exports.intervalsForProfessionals = intervalsForProfessionals;
module.exports.breakAround = breakAround;
module.exports.scheduleText = scheduleText;
module.exports.SHARED_CAPACITY_CATEGORIES = SHARED_CAPACITY_CATEGORIES;
module.exports.DEFAULT_CAPACITY = DEFAULT_CAPACITY;
