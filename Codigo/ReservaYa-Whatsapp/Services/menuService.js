// Services/menuService.js - Construcción de menús y catálogo (categorías, negocios, servicios)
const Utils = require('../utils');

const CATEGORY_ORDER = [
  'beauty', 'health', 'pets', 'food', 'bars_cafes', 'leisure',
  'sports', 'education', 'home', 'shopping', 'events', 'other',
];

const CATEGORY_META = {
  beauty: { emoji: '💇', label: 'Belleza' },
  health: { emoji: '🩺', label: 'Salud' },
  pets: { emoji: '🐾', label: 'Mascotas' },
  food: { emoji: '🍔', label: 'Comida' },
  bars_cafes: { emoji: '☕', label: 'Bares & Cafés' },
  leisure: { emoji: '🎮', label: 'Ocio' },
  sports: { emoji: '🏋️', label: 'Deportes' },
  education: { emoji: '📚', label: 'Educación' },
  home: { emoji: '🏠', label: 'Hogar' },
  shopping: { emoji: '🛍️', label: 'Compras' },
  events: { emoji: '🎉', label: 'Eventos' },
  other: { emoji: '✨', label: 'Otros' },
};

function categoryLabel(id) {
  return CATEGORY_META[id] ? `${CATEGORY_META[id].emoji} ${CATEGORY_META[id].label}` : id;
}

function categoryIdFromLabel(text) {
  const lower = String(text).toLowerCase();
  for (const id of CATEGORY_ORDER) {
    const meta = CATEGORY_META[id];
    const tokens = [meta.label, id].map((t) => t.toLowerCase());
    if (tokens.some((t) => lower.includes(t))) return id;
  }
  const parsed = Utils.parseCategoryFromText(lower);
  return parsed;
}

function buildMainMenu(name, city) {
  const greeting = name ? `${name} 👋` : 'Hola 👋';
  return `${greeting}\nSoy el asistente de *ReservaYa*.\nPuedo ayudarte a agendar citas y servicios en tu ciudad.\n\n` +
    `_Ciudad actual:_ *${city}*\n\n` +
    `Elige una opción:\n\n` +
    `1️⃣ Explorar negocios\n` +
    `2️⃣ Cambiar ciudad\n` +
    `3️⃣ Mis reservas\n` +
    `4️⃣ Ayuda\n\n` +
    `O escríbeme algo como: *"café en Bogotá por menos de 10.000"* ☕`;
}

function buildHelp() {
  return `*¿Cómo funciono?* 🤖\n\n` +
    `• Escribe *1* para explorar negocios por categoría.\n` +
    `• Escribe *2* para cambiar de ciudad (ubicación).\n` +
    `• Escribe *3* para ver tus reservas.\n` +
    `• Escríbeme en lenguaje natural: *"necesito una peluquería en Medellín"*, *"café por menos de 10.000 pesos"*.\n\n` +
    `Cuando reserves, el negocio y tú recibirán confirmación por este chat. 📲`;
}

function buildCityOptions(cities) {
  const lines = cities.map((c, i) => `${i + 1}. ${c}`);
  return `*¿Desde qué ciudad quieres agendar?* 🏙️\n\n${lines.join('\n')}\n\nEscribe el número o el nombre de la ciudad.`;
}

function buildCategoryMenu() {
  const lines = CATEGORY_ORDER.map((id, i) => `${i + 1}. ${categoryLabel(id)}`);
  return `*¿Qué tipo de negocio buscas?* 🗂️\n\n${lines.join('\n')}\n\nEscribe el número de la categoría (o *0* para volver al menú).`;
}

function businessLine(b, idx) {
  let line = `${idx + 1}. *${b.name}*`;
  if (b.tagline) line += `\n   ${b.tagline}`;
  line += `\n   📍 ${b.city || '—'}${b.address ? ` · ${b.address}` : ''}`;
  return line;
}

function buildBusinessMenu(list) {
  const lines = list.map(businessLine);
  return `*Negocios disponibles* 🏪\n\n${lines.join('\n\n')}\n\nEscribe el número del negocio (o *0* para volver).`;
}

function serviceLine(s, idx) {
  const dur = s.durationMinutes >= 60 ? `${Math.floor(s.durationMinutes / 60)}h${s.durationMinutes % 60 ? ` ${s.durationMinutes % 60}m` : ''}` : `${s.durationMinutes} min`;
  return `${idx + 1}. *${s.name}* — ${Utils.money(s.price, s.currency)} (${dur})`;
}

function buildServiceMenu(list) {
  const lines = list.map(serviceLine);
  return `*Servicios* 💈\n\n${lines.join('\n\n')}\n\nElige el número del servicio (o *0* para volver).`;
}

function buildProfessionalMenu(list) {
  const lines = list.map((p, i) => `${i + 1}. *${p.name}*${p.title ? ` — ${p.title}` : ''}`);
  return `*¿Con quién agendar?* 🧑‍🔬\n\n${lines.join('\n')}\n\n` +
    `Elige el número, escribe el nombre o di *"cualquiera"* (o *0* para volver).`;
}

function buildDayMenu(days, timezone) {
  const fmt = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const today = Utils.todayInZone(timezone);
  const lines = days.map((d, i) => {
    const label = fmt.format(new Date(`${d}T12:00:00Z`));
    const suffix = d === today ? ' (hoy)' : d === addOneDay(today) ? ' (mañana)' : '';
    return `${i + 1}. ${label}${suffix}`;
  });
  return `*Elige el día* 📅\n\n${lines.join('\n')}\n\n` +
    `Escribe el número o el día (ej. *mañana*, *el viernes*, *12/11*).`;
}

function addOneDay(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function buildSlotMenu(slots, timezone) {
  const fmt = new Intl.DateTimeFormat('es-CO', {
    timeZone: timezone || 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const visible = slots
    .filter((s) => s.available && !s.blocked)
    .slice(0, 18);
  const lines = visible.map((s, i) => `${i + 1}. ${fmt.format(new Date(s.start))}`);
  const extra = slots.filter((s) => s.available && !s.blocked).length - visible.length;
  return `*Elige la hora* 🕐\n\n${lines.join('\n')}${extra > 0 ? `\n… y ${extra} más` : ''}\n\n` +
    `Escribe el número, o dime la hora como quieras: *"3:30 pm"*, *"a las 12 y media"*, *"1530"*.`;
}

function slotsInTimezone(slots, timezone) {
  return slots.map((s) => {
    const f = new Intl.DateTimeFormat('es-CO', {
      timeZone: timezone || 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return { ...s, label: f.format(new Date(s.start)), rawStart: s.start };
  });
}

function pickIndex(text, max) {
  const n = Number(String(text ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n - 1;
}

function statusLabel(status) {
  const map = {
    pending_payment: '⏳ Pendiente de pago',
    confirmed: '✅ Confirmada',
    completed: '✔️ Completada',
    cancelled: '❌ Cancelada',
    no_show: '🚫 No asistió',
    expired: '⌛ Expirada',
    needs_reassignment: '🔄 Por reagendar',
  };
  return map[status] || status;
}

module.exports = {
  CATEGORY_ORDER,
  CATEGORY_META,
  categoryLabel,
  categoryIdFromLabel,
  buildMainMenu,
  buildHelp,
  buildCityOptions,
  buildCategoryMenu,
  buildBusinessMenu,
  buildServiceMenu,
  buildProfessionalMenu,
  buildDayMenu,
  buildSlotMenu,
  slotsInTimezone,
  pickIndex,
  statusLabel,
};