// test/verification-feedback.test.js - El usuario siempre recibe respuesta en
// el chat, incluso cuando la verificación falla o el Back no responde.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verificationFailureMessage } = require('../audit-helpers');

test('verificationFailureMessage distingue cada causa y nunca queda callado', () => {
  const error = (code) => ({ response: { data: { error: { code } } } });
  const cases = [
    error('CODE_EXPIRED'),
    error('NO_PENDING_REGISTRATION'),
    error('INVALID_CODE'),
    error('TOO_MANY_ATTEMPTS'),
    error('INTERNAL'),
  ];
  const messages = cases.map(verificationFailureMessage);
  messages.forEach((message) => assert.match(message, /\S/));
  assert.match(messages[0], /venció/);
  assert.match(messages[1], /mismo número|registro/);
  assert.match(messages[2], /no es correcto/);
  assert.match(messages[3], /demasiados intentos/);
  assert.notEqual(messages[4], messages[2]);
});

test('verificationFailureMessage tolera errores sin respuesta del Back', () => {
  assert.match(verificationFailureMessage(new Error('Request failed with status code 500')), /Inténtalo/);
  assert.match(verificationFailureMessage(null), /Inténtalo/);
});
