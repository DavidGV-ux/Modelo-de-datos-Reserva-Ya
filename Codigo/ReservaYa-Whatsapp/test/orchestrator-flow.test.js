// test/orchestrator-flow.test.js - Simulación del flujo conversacional con
// servicios externos simulados (WhatsApp, Mongo y Back).
const test = require('node:test');
const assert = require('node:assert/strict');

const dbService = require('../Services/dbService');
const whatsappService = require('../Services/whatsappService');
const reservaYaApi = require('../Services/reservaYaApi');
const roleService = require('../Services/roleService');
const { addDays, todayInZone } = require('../Services/timeParser');
const orchestrator = require('../Services/orchestrator');
const advisor = require('../Services/availabilityAdvisor');

const TZ = 'America/Bogota';
const MONDAY = '2026-11-02';
const WA = '573001112233';
const PHONE = WA;

function iso(date, hour, minute = 0) {
  return new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hour + 5,
    minute,
  )).toISOString();
}

function entry(date, hour, minute, professionalIds = ['p1']) {
  const start = iso(date, hour, minute);
  return {
    start,
    end: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(),
    timezone: TZ,
    available: true,
    blocked: false,
    professionalIds,
    professionalNames: professionalIds.map((id) => (id === 'p1' ? 'Carlos Pérez' : 'Andrés Ruiz')),
  };
}

const schedule = {
  monday: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
  tuesday: [{ start: '09:00', end: '18:00' }],
  wednesday: [{ start: '09:00', end: '18:00' }],
  thursday: [{ start: '09:00', end: '18:00' }],
  friday: [{ start: '09:00', end: '18:00' }],
  saturday: [{ start: '09:00', end: '13:00' }],
  sunday: [],
};

const p1 = { id: 'p1', name: 'Carlos Pérez', title: 'Barbero', schedule, serviceIds: ['s1'], active: true };
const p2 = { id: 'p2', name: 'Andrés Ruiz', title: 'Barbero', schedule, serviceIds: ['s1'], active: true };

const barberTenant = {
  tenantId: 'barber',
  name: 'Barber Estilo',
  category: 'beauty',
  timezone: TZ,
  currency: 'COP',
  settings: { slotGranularityMinutes: 15 },
};

const cafeTenant = {
  tenantId: 'cafe',
  name: 'Café Beta',
  category: 'bars_cafes',
  timezone: TZ,
  currency: 'COP',
  settings: { slotGranularityMinutes: 15, capacityPerSlot: 20 },
};

let store;
let sent;
let created;
let originals;

function reset(initialContext) {
  store = new Map();
  sent = [];
  created = [];
  store.set(PHONE, {
    phone: PHONE,
    waId: WA,
    name: 'Ana',
    city: 'Bogotá',
    role: 'guest',
    welcomed: true,
    context: structuredClone(initialContext),
  });
}

function buildContext({ tenant = barberTenant, pros = [p1], chosen = p1, entries, flow = 'slot' } = {}) {
  const merged = entries || [];
  return {
    flow,
    tenant,
    dayList: [MONDAY, '2026-11-03'],
    current: {
      serviceId: 's1',
      serviceName: 'Corte',
      price: 40000,
      currency: 'COP',
      durationMinutes: 30,
      professionals: pros,
      professional: chosen,
      anyProfessional: false,
      day: MONDAY,
    },
    dayAvailability: {
      date: MONDAY,
      timezone: tenant.timezone,
      policy: advisor.policyForTenant(tenant),
      merged,
      available: merged.filter((e) => e.available),
    },
    slotList: merged.filter((e) => e.available),
    allSlots: merged.filter((e) => e.available),
  };
}

async function send(text) {
  await orchestrator.handleIncoming({
    from: WA,
    messageBody: text,
    userName: 'Ana',
    messageId: `msg-${Date.now()}-${Math.random()}`,
    messageType: 'text',
  });
  return sent[sent.length - 1];
}

function lastButtonIds() {
  const last = [...sent].reverse().find((m) => m.kind === 'buttons');
  return (last?.buttons || []).map((b) => b.id);
}

function bodyOf(message) {
  return message?.body || '';
}

test.beforeEach(() => {
  originals = {
    connect: dbService.connect,
    markMessageProcessed: dbService.markMessageProcessed,
    getConversation: dbService.getConversation,
    upsertConversation: dbService.upsertConversation,
    clearContext: dbService.clearContext,
    sendMessage: whatsappService.sendMessage,
    sendButtons: whatsappService.sendButtons,
    getSlots: reservaYaApi.getSlots,
    getAvailabilityDays: reservaYaApi.getAvailabilityDays,
    createAppointment: reservaYaApi.createAppointment,
  };

  dbService.connect = async () => {};
  dbService.markMessageProcessed = async () => false;
  dbService.getConversation = async (phone) => {
    const conv = store.get(phone);
    return conv ? structuredClone(conv) : null;
  };
  dbService.upsertConversation = async (phone, patch) => {
    const current = store.get(phone) || { phone };
    store.set(phone, { ...current, ...patch });
  };
  dbService.clearContext = async (phone) => {
    const current = store.get(phone);
    if (current) {
      delete current.context;
      store.set(phone, current);
    }
  };
  whatsappService.sendMessage = async (_to, body) => {
    sent.push({ kind: 'text', body });
    return { ok: true };
  };
  whatsappService.sendButtons = async (_to, body, buttons) => {
    sent.push({ kind: 'buttons', body, buttons });
    return { ok: true };
  };
  reservaYaApi.getSlots = async () => [];
  reservaYaApi.getAvailabilityDays = async () => [MONDAY, '2026-11-03'];
  reservaYaApi.createAppointment = async (_tenantId, payload) => {
    created.push(payload);
    return {
      replay: false,
      appointment: { id: 'apt-test', startTime: payload.startTime, status: 'pending_payment' },
      intent: { advanceAmount: 0, fullAmount: 40000, currency: 'COP' },
    };
  };
});

test.afterEach(() => {
  dbService.connect = originals.connect;
  dbService.markMessageProcessed = originals.markMessageProcessed;
  dbService.getConversation = originals.getConversation;
  dbService.upsertConversation = originals.upsertConversation;
  dbService.clearContext = originals.clearContext;
  whatsappService.sendMessage = originals.sendMessage;
  whatsappService.sendButtons = originals.sendButtons;
  reservaYaApi.getSlots = originals.getSlots;
  reservaYaApi.getAvailabilityDays = originals.getAvailabilityDays;
  reservaYaApi.createAppointment = originals.createAppointment;
});

test('12:30 sin AM/PM pide confirmación, detecta almuerzo y reserva la hora cercana', async () => {
  const entries = [
    entry(MONDAY, 9, 0),
    entry(MONDAY, 12, 0),
    entry(MONDAY, 13, 0),
    entry(MONDAY, 13, 30),
  ];
  reset(buildContext({ entries }));
  reservaYaApi.getSlots = async () => entries.map((e) => ({
    start: e.start,
    end: e.end,
    available: true,
    blocked: false,
  }));

  const ask = await send('12:30');
  assert.equal(ask.kind, 'buttons');
  assert.match(bodyOf(ask), /12:30 p\. m\./);
  assert.match(bodyOf(ask), /12:30 a\. m\./);
  assert.deepEqual(lastButtonIds(), ['time:am', 'time:pm', 'time:other']);

  const lunch = await send('pm');
  assert.equal(lunch.kind, 'buttons');
  assert.match(bodyOf(lunch), /pausa de almuerzo/);
  assert.match(bodyOf(lunch), /1:00 p\. m\./);
  assert.ok(lastButtonIds().includes('time:nearest'));

  const confirm = await send('time:nearest');
  assert.equal(confirm.kind, 'buttons');
  assert.match(bodyOf(confirm), /Confirma tu reserva/);
  assert.match(bodyOf(confirm), /1:00 p\. m\./);

  await send('confirm:yes');
  const done = sent.find((m) => /Reserva registrada/.test(bodyOf(m)));
  assert.ok(done, 'debe enviar el mensaje de reserva registrada');
  assert.match(bodyOf(done), /Estado: confirmada/);
  assert.equal(created.length, 1);
  assert.equal(created[0].startTime, iso(MONDAY, 13, 0));
});

test('si el profesional está ocupado, ofrece otro profesional a la misma hora', async () => {
  const other = entry(MONDAY, 10, 0, ['p2']);
  reset(buildContext({ pros: [p1, p2], chosen: p1, entries: [other] }));
  reservaYaApi.getSlots = async (_tenantId, { professionalId }) =>
    professionalId === 'p2'
      ? [{ start: other.start, end: other.end, available: true, blocked: false }]
      : [];

  const suggestion = await send('10 am');
  assert.equal(suggestion.kind, 'buttons');
  assert.match(bodyOf(suggestion), /Andrés Ruiz/);
  assert.ok(lastButtonIds().includes('time:otherpro'));

  const confirm = await send('time:otherpro');
  assert.equal(confirm.kind, 'buttons');
  assert.match(bodyOf(confirm), /Andrés Ruiz/);

  await send('confirm:yes');
  assert.equal(created.length, 1);
  assert.equal(created[0].professionalId, 'p2');
});

test('si el horario se ocupa entre la selección y la confirmación, revalida y ofrece alternativa', async () => {
  const entries = [entry(MONDAY, 10, 0), entry(MONDAY, 11, 0)];
  const ctx = buildContext({ entries, flow: 'confirm' });
  ctx.current.slotStart = iso(MONDAY, 10, 0);
  reset(ctx);
  reservaYaApi.getSlots = async () => [
    { start: iso(MONDAY, 11, 0), end: iso(MONDAY, 11, 30), available: true, blocked: false },
  ];

  await send('confirm:yes');
  assert.equal(created.length, 0);
  const revalidated = sent.find((m) => /acaba de ocuparse/.test(bodyOf(m)));
  assert.ok(revalidated, 'debe avisar que el horario se ocupó');
  assert.ok(lastButtonIds().includes('time:nearest'));
  assert.match(bodyOf(sent[sent.length - 1]), /11:00 a\. m\./);
});

test('si el usuario insiste en una hora ocupada, no reserva y explica la alternativa', async () => {
  const entries = [entry(MONDAY, 9, 0), entry(MONDAY, 13, 0)];
  reset(buildContext({ entries }));

  const first = await send('12:30 pm');
  assert.match(bodyOf(first), /pausa de almuerzo/);

  const insist = await send('12:30 pm');
  assert.match(bodyOf(insist), /no puedo reservarlo/);
  assert.match(bodyOf(insist), /1:00 p\. m\./);
  assert.equal(created.length, 0);
});

test('hora antes de abrir: explica el horario y propone la apertura', async () => {
  reset(buildContext({ entries: [entry(MONDAY, 9, 0)] }));
  const reply = await send('8 am');
  assert.match(bodyOf(reply), /todavía no abren/);
  assert.match(bodyOf(reply), /9:00 a\. m\./);
  assert.ok(lastButtonIds().includes('time:nearest'));
});

test('acepta errores de tipeo y jerga: "a las 3 de la tard"', async () => {
  reset(buildContext({ entries: [entry(MONDAY, 15, 0)] }));
  const reply = await send('a las 3 de la tard');
  assert.equal(reply.kind, 'buttons');
  assert.match(bodyOf(reply), /Confirma tu reserva/);
  assert.match(bodyOf(reply), /3:00 p\. m\./);
});

test('acepta hora militar compacta: "1530"', async () => {
  reset(buildContext({ entries: [entry(MONDAY, 15, 30)] }));
  const reply = await send('1530');
  assert.match(bodyOf(reply), /Confirma tu reserva/);
  assert.match(bodyOf(reply), /3:30 p\. m\./);
});

test('rechaza una hora anormal sin reservar', async () => {
  reset(buildContext({ entries: [entry(MONDAY, 10, 0)] }));
  const reply = await send('25:00');
  const invalid = sent.find((m) => /no existe|no es válida/.test(bodyOf(m)));
  assert.ok(invalid, 'debe explicar que la hora no es válida');
  assert.equal(created.length, 0);
});

test('día natural + hora: "en 7 días a las 10" pregunta AM/PM y reserva', async () => {
  const target = addDays(todayInZone(TZ), 7);
  const ctx = buildContext({ flow: 'day', entries: [] });
  ctx.dayList = [target];
  ctx.current.day = target;
  reset(ctx);
  reservaYaApi.getSlots = async (_tenantId, { date }) => [
    { start: iso(date, 10, 0), end: iso(date, 10, 30), available: true, blocked: false },
    { start: iso(date, 15, 0), end: iso(date, 15, 30), available: true, blocked: false },
  ];

  const ask = await send('en 7 días a las 10');
  assert.equal(ask.kind, 'buttons');
  assert.match(bodyOf(ask), /10:00 a\. m\./);
  assert.match(bodyOf(ask), /10:00 p\. m\./);

  const confirm = await send('am');
  assert.match(bodyOf(confirm), /Confirma tu reserva/);
  assert.match(bodyOf(confirm), /10:00 a\. m\./);
});

test('rango "de 2 a 4 de la tarde" muestra solo las horas del rango', async () => {
  const entries = [
    entry(MONDAY, 13, 30),
    entry(MONDAY, 14, 0),
    entry(MONDAY, 14, 30),
    entry(MONDAY, 15, 0),
    entry(MONDAY, 16, 0),
  ];
  reset(buildContext({ entries }));
  const reply = await send('de 2 a 4 de la tarde');
  assert.equal(reply.kind, 'text');
  assert.match(bodyOf(reply), /2:00 p\. m\./);
  assert.match(bodyOf(reply), /3:00 p\. m\./);
  assert.doesNotMatch(bodyOf(reply), /1:30 p\. m\./);

  const firstOption = await send('1');
  assert.match(bodyOf(firstOption), /Confirma tu reserva/);
  assert.match(bodyOf(firstOption), /2:00 p\. m\./);
});

test('café con capacidad compartida permite reservar sin tratarlo como exclusivo', async () => {
  const cafePro = { ...p1, name: 'Laura Gómez', title: 'Barista' };
  const entries = [entry(MONDAY, 10, 0)];
  reset(buildContext({ tenant: cafeTenant, pros: [cafePro], chosen: cafePro, entries }));
  reservaYaApi.getSlots = async () => entries.map((e) => ({
    start: e.start,
    end: e.end,
    available: true,
    blocked: false,
  }));

  const confirm = await send('10 am');
  assert.match(bodyOf(confirm), /Confirma tu reserva/);
  assert.match(bodyOf(confirm), /Laura Gómez/);

  await send('confirm:yes');
  assert.equal(created.length, 1);
  assert.equal(created[0].professionalId, 'p1');
});

test('sanitizeTo respeta números internacionales y agrega +57 solo a locales', () => {
  assert.equal(whatsappService.sanitizeTo('+573001180584'), '573001180584');
  assert.equal(whatsappService.sanitizeTo('3001180584'), '573001180584');
  assert.equal(whatsappService.sanitizeTo('+14155552671'), '14155552671');
  assert.equal(whatsappService.sanitizeTo('+525512345678'), '525512345678');
  assert.equal(whatsappService.sanitizeTo('+34612345678'), '34612345678');
  assert.equal(whatsappService.sanitizeTo('+5511999999999'), '5511999999999');
  assert.equal(whatsappService.sanitizeTo('00573001180584'), '573001180584');
});
