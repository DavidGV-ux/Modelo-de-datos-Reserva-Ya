// test/time-parser.test.js - Pruebas del intérprete de horas/fechas del bot.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTimeRequest,
  parseDayRequest,
  normalizeTimeText,
  todayInZone,
  addDays,
  weekdayKey,
} = require('../Services/timeParser');

function p(text, options = { context: 'slot' }) {
  return parseTimeRequest(text, options);
}

test('normaliza puntos, comas y abreviaturas de hora', () => {
  assert.equal(normalizeTimeText('12.30'), '12:30');
  assert.equal(normalizeTimeText('12h30'), '12:30');
  assert.equal(normalizeTimeText('3:00 hrs'), '3:00');
  assert.equal(normalizeTimeText('3 p. m.'), '3 pm');
  assert.equal(normalizeTimeText('3:30p'), '3:30 pm');
});

test('hora explícita AM/PM', () => {
  assert.deepEqual(p('3 pm'), {
    kind: 'exact', hour: 15, minute: 0, candidates: [], meridiem: 'pm',
    menuMeridiem: 'pm', text: '3 pm', modifier: null, approximate: false, raw: '3 pm',
  });
  assert.equal(p('9am').hour, 9);
  assert.equal(p('12:30 pm').hour, 12);
  assert.equal(p('12:30 am').hour, 0);
  assert.equal(p('11 de la noche').hour, 23);
  assert.equal(p('7 de la noche').hour, 19);
  assert.equal(p('3 de la tarde').hour, 15);
  assert.equal(p('3 de la tard').hour, 15);
  assert.equal(p('3 de la mañana').hour, 3);
});

test('formato 24 horas y militar', () => {
  assert.equal(p('15:30').hour, 15);
  assert.equal(p('15:30').kind, 'exact');
  assert.equal(p('1530').hour, 15);
  assert.equal(p('1530').minute, 30);
  assert.equal(p('0:30').hour, 0);
  assert.equal(p('a las 0:30').hour, 0);
});

test('sin AM/PM se pide confirmación (nunca se asume)', () => {
  const r = p('12:30');
  assert.equal(r.kind, 'ambiguous');
  assert.deepEqual(r.candidates, [12, 0]);
  assert.equal(r.minute, 30);

  const r3 = p('a las 3');
  assert.equal(r3.kind, 'ambiguous');
  assert.deepEqual(r3.candidates, [3, 15]);

  const r12 = p('12 y media');
  assert.equal(r12.kind, 'ambiguous');
  assert.deepEqual(r12.candidates, [12, 0]);
  assert.equal(r12.minute, 30);

  assert.equal(p('12 del día').hour, 12);
  assert.equal(p('12 de la noche').hour, 0);
  assert.equal(p('mediodía').hour, 12);
  assert.equal(p('medianoche').hour, 0);
});

test('jerga colombiana, letras y errores de tipeo', () => {
  assert.equal(p('a la una').candidates[0], 1);
  assert.equal(p('a la 1 y cuarto').minute, 15);
  assert.equal(p('nueve y media').minute, 30);
  assert.equal(p('diez treinta').minute, 30);
  assert.equal(p('3ish').approximate, true);
  assert.equal(p('tipo 4pm').hour, 16);
  assert.equal(p('ala 3 de la tarde').hour, 15);
  assert.equal(p('a las 3 de la tard').hour, 15);
  assert.equal(p('3p').hour, 15);
  assert.equal(p('3:30p').hour, 15);
  assert.equal(p('3:30p').minute, 30);
});

test('rangos horarios', () => {
  const a = p('entre 2 y 4');
  assert.equal(a.kind, 'range');
  assert.equal(a.from.kind, 'ambiguous');
  assert.equal(a.to.kind, 'ambiguous');

  const b = p('entre 2 y 4 de la tarde');
  assert.equal(b.kind, 'range');
  assert.equal(b.from.hour, 14);
  assert.equal(b.to.hour, 16);

  const c = p('de 9 a 11 de la mañana');
  assert.equal(c.kind, 'range');
  assert.equal(c.from.hour, 9);
  assert.equal(c.to.hour, 11);

  const bare = p('3 a 5');
  assert.equal(bare.kind, 'range');
  assert.equal(bare.from.kind, 'ambiguous');
  assert.deepEqual(bare.from.candidates, [3, 15]);

  const crossing = p('de 11 a 1 de la tarde');
  assert.equal(crossing.kind, 'range');
  assert.equal(crossing.from.hour, 11);
  assert.equal(crossing.to.hour, 13);
});

test('antes/después conserva el modificador', () => {
  assert.equal(p('después de las 5').modifier, 'after');
  assert.equal(p('antes de las 4').modifier, 'before');
});

test('rechaza horas anormales como inválidas', () => {
  assert.equal(p('25:00').kind, 'invalid');
  assert.equal(p('3:75').kind, 'invalid');
  assert.equal(p('a las 27').kind, 'invalid');
  assert.equal(p('13 pm').kind, 'invalid');
});

test('no confunde precios ni fechas con horas', () => {
  assert.equal(p('10.000 pesos', { context: 'day' }).kind, 'none');
  assert.equal(p('12 de noviembre', { context: 'day' }).kind, 'none');
  assert.equal(p('2026', { context: 'day' }).kind, 'none');
});

test('fechas naturales y relativas', () => {
  const today = '2026-10-28'; // miércoles
  assert.equal(parseDayRequest('hoy', { today }).date, today);
  assert.equal(parseDayRequest('mañana', { today }).date, '2026-10-29');
  assert.equal(parseDayRequest('pasado mañana', { today }).date, '2026-10-30');
  assert.equal(parseDayRequest('el viernes', { today }).date, '2026-10-30');
  assert.equal(parseDayRequest('el sábado', { today }).date, '2026-10-31');
  assert.equal(parseDayRequest('próximo lunes', { today }).date, '2026-11-02');
  assert.equal(parseDayRequest('12/11', { today }).date, '2026-11-12');
  assert.equal(parseDayRequest('12 de noviembre', { today }).date, '2026-11-12');
  assert.equal(parseDayRequest('el 5', { today }).date, '2026-11-05');
  assert.equal(parseDayRequest('en 3 días', { today }).date, '2026-10-31');
});

test('utilidades de fecha', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(weekdayKey('2026-10-30'), 'friday');
  assert.match(todayInZone('America/Bogota'), /^\d{4}-\d{2}-\d{2}$/);
});
