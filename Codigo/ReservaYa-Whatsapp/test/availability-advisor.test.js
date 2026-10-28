// test/availability-advisor.test.js - Reglas de disponibilidad, pausas y capacidad.
const test = require('node:test');
const assert = require('node:assert/strict');
const reservaYaApi = require('../Services/reservaYaApi');
const advisor = require('../Services/availabilityAdvisor');

const TZ = 'America/Bogota';
const MONDAY = '2026-11-02'; // lunes

function bogotaIso(date, hour, minute = 0) {
  // Bogotá es UTC-5 todo el año.
  const utcHour = hour + 5;
  const d = new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    utcHour,
    minute,
  ));
  return d.toISOString();
}

function slot(date, hour, minute = 0, available = true, blocked = false) {
  return {
    start: bogotaIso(date, hour, minute),
    end: bogotaIso(date, hour, minute + 30),
    available,
    blocked,
  };
}

const mondaySchedule = {
  monday: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
  tuesday: [{ start: '09:00', end: '18:00' }],
  wednesday: [{ start: '09:00', end: '18:00' }],
  thursday: [{ start: '09:00', end: '18:00' }],
  friday: [{ start: '09:00', end: '18:00' }],
  saturday: [{ start: '09:00', end: '13:00' }],
  sunday: [],
};

function professional(id, name, schedule = mondaySchedule) {
  return { id, name, title: 'Barbero', schedule };
}

const cafeTenant = {
  tenantId: 'cafe',
  name: 'Café Beta',
  category: 'bars_cafes',
  timezone: TZ,
  settings: { slotGranularityMinutes: 15 },
};

const barberTenant = {
  tenantId: 'barber',
  name: 'Barber Estilo',
  category: 'beauty',
  timezone: TZ,
  settings: { slotGranularityMinutes: 15 },
};

function withSlots(impl, fn) {
  const original = reservaYaApi.getSlots;
  reservaYaApi.getSlots = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => { reservaYaApi.getSlots = original; });
}

test('política de capacidad: cafés comparten capacidad, barberías son exclusivas', () => {
  const cafe = advisor.policyForTenant(cafeTenant);
  assert.equal(cafe.mode, 'capacity');
  assert.equal(cafe.capacityPerSlot, 20);

  const barber = advisor.policyForTenant(barberTenant);
  assert.equal(barber.mode, 'exclusive');
  assert.equal(barber.capacityPerSlot, 1);

  const override = advisor.policyForTenant({
    ...cafeTenant,
    settings: { bookingMode: 'exclusive' },
  });
  assert.equal(override.mode, 'exclusive');

  const custom = advisor.policyForTenant({
    ...cafeTenant,
    settings: { bookingMode: 'capacity', capacityPerSlot: 7 },
  });
  assert.equal(custom.capacityPerSlot, 7);
});

test('detecta pausa de almuerzo y ofrece la hora después de la pausa', async () => {
  const slots = [
    slot(MONDAY, 9, 0), slot(MONDAY, 9, 30), slot(MONDAY, 10, 0),
    slot(MONDAY, 11, 30), slot(MONDAY, 13, 0), slot(MONDAY, 13, 30),
  ];
  await withSlots(async () => slots, async () => {
    const p = professional('p1', 'Laura Gómez');
    const availability = await advisor.loadAvailability({
      tenant: cafeTenant,
      professionals: [p],
      date: MONDAY,
      durationMinutes: 30,
    });
    const diagnosis = advisor.diagnose({
      tenant: cafeTenant,
      professionals: [p],
      chosenProfessional: p,
      date: MONDAY,
      targetMinutes: 12 * 60 + 30,
      availability,
    });
    assert.equal(diagnosis.reason, 'break');
    assert.deepEqual(diagnosis.breakWindow, { start: 12 * 60, end: 13 * 60 });
    assert.equal(diagnosis.sameDay.start, bogotaIso(MONDAY, 13, 0));
  });
});

test('detecta antes de abrir y después de cerrar', async () => {
  const slots = [slot(MONDAY, 9, 0), slot(MONDAY, 17, 30)];
  await withSlots(async () => slots, async () => {
    const p = professional('p1', 'Laura Gómez');
    const availability = await advisor.loadAvailability({
      tenant: cafeTenant,
      professionals: [p],
      date: MONDAY,
      durationMinutes: 30,
    });
    const before = advisor.diagnose({
      tenant: cafeTenant, professionals: [p], chosenProfessional: p,
      date: MONDAY, targetMinutes: 8 * 60, availability,
    });
    assert.equal(before.reason, 'before_open');
    assert.equal(before.sameDay.start, bogotaIso(MONDAY, 9, 0));

    const after = advisor.diagnose({
      tenant: cafeTenant, professionals: [p], chosenProfessional: p,
      date: MONDAY, targetMinutes: 19 * 60, availability,
    });
    assert.equal(after.reason, 'after_close');
    assert.equal(after.sameDay.start, bogotaIso(MONDAY, 17, 30));
  });
});

test('día sin horario se reporta como day_off', async () => {
  await withSlots(async () => [], async () => {
    const p = professional('p1', 'Laura Gómez', { ...mondaySchedule, sunday: [] });
    const availability = await advisor.loadAvailability({
      tenant: cafeTenant,
      professionals: [p],
      date: '2026-11-01', // domingo
      durationMinutes: 30,
    });
    const diagnosis = advisor.diagnose({
      tenant: cafeTenant, professionals: [p], chosenProfessional: p,
      date: '2026-11-01', targetMinutes: 10 * 60, availability,
    });
    assert.equal(diagnosis.reason, 'day_off');
  });
});

test('encuentra otro profesional disponible a la misma hora', async () => {
  const p1 = professional('p1', 'Laura Gómez');
  const p2 = professional('p2', 'Andrés Ruiz');
  await withSlots(async (_tenant, { professionalId }) => {
    if (professionalId === 'p1') return [slot(MONDAY, 10, 0, false)];
    return [slot(MONDAY, 10, 0, true)];
  }, async () => {
    const availability = await advisor.loadAvailability({
      tenant: barberTenant,
      professionals: [p1, p2],
      date: MONDAY,
      durationMinutes: 30,
    });
    const exact = advisor.exactSlot(availability, 10 * 60);
    assert.equal(exact.available, true);
    assert.deepEqual(exact.professionalIds, ['p2']);
    const diagnosis = advisor.diagnose({
      tenant: barberTenant, professionals: [p1], chosenProfessional: p1,
      date: MONDAY, targetMinutes: 10 * 60, availability,
    });
    assert.deepEqual(diagnosis.otherProfessionals, ['p2']);
  });
});

test('capacidad compartida: una hora ocupada para un profesional sigue disponible para el negocio', async () => {
  const p1 = professional('p1', 'Laura Gómez');
  // El Back en modo capacidad devuelve available=true aunque ya haya reservas,
  // hasta llegar al aforo. Simulamos esa respuesta.
  await withSlots(async () => [slot(MONDAY, 10, 0, true)], async () => {
    const availability = await advisor.loadAvailability({
      tenant: cafeTenant,
      professionals: [p1],
      date: MONDAY,
      durationMinutes: 30,
    });
    const diagnosis = advisor.diagnose({
      tenant: cafeTenant, professionals: [p1], chosenProfessional: p1,
      date: MONDAY, targetMinutes: 10 * 60, availability,
    });
    assert.equal(diagnosis.reason, 'available');
    assert.equal(advisor.policyForTenant(cafeTenant).mode, 'capacity');
  });
});

test('siguiente día disponible', async () => {
  const p1 = professional('p1', 'Laura Gómez');
  const originalDays = reservaYaApi.getAvailabilityDays;
  reservaYaApi.getAvailabilityDays = async () => ['2026-11-03', '2026-11-04'];
  try {
    await withSlots(async (_tenant, { date }) => [slot(date, 9, 0)], async () => {
      const next = await advisor.nextAvailableDay({
        tenant: cafeTenant,
        professionals: [p1],
        afterDate: MONDAY,
        durationMinutes: 30,
        targetMinutes: 10 * 60,
      });
      assert.equal(next.date, '2026-11-03');
      assert.equal(next.slot.start, bogotaIso('2026-11-03', 9, 0));
    });
  } finally {
    reservaYaApi.getAvailabilityDays = originalDays;
  }
});

test('empareja nombres con errores de tipeo', () => {
  const list = [professional('p1', 'Laura Gómez'), professional('p2', 'Andrés Ruiz')];
  assert.deepEqual(advisor.matchProfessionals(list, 'Laura'), [list[0]]);
  assert.deepEqual(advisor.matchProfessionals(list, 'lura'), [list[0]]);
  assert.deepEqual(advisor.matchProfessionals(list, 'andres'), [list[1]]);
  assert.deepEqual(advisor.matchProfessionals(list, 'xyz'), []);
});

test('texto de horario legible', () => {
  const intervals = advisor.intervalsForDate(professional('p1', 'Laura'), MONDAY);
  assert.equal(
    advisor.scheduleText(intervals),
    '9:00 a. m. a 12:00 p. m. y 1:00 p. m. a 6:00 p. m.',
  );
});
