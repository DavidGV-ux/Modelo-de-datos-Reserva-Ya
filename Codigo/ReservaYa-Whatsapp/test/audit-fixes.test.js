// test/audit-fixes.test.js - Regresiones de los hallazgos de auditoría.
const test = require('node:test');
const assert = require('node:assert/strict');

test('sendVerificationCodeViaFyn envía el header x-internal-secret', async () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const originalUrl = process.env.FYN_SEND_URL;
  process.env.INTERNAL_SERVICE_SECRET = 'shared-internal-secret';
  process.env.FYN_SEND_URL = 'http://localhost:3001/user/verify-code';

  let captured = null;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200 };
  };

  try {
    const whatsappService = require('../Services/whatsappService');
    const result = await whatsappService.sendVerificationCodeViaFyn({
      phone: '573001234567', code: '123456', name: 'Test',
    });
    assert.equal(result, true);
    assert.equal(captured?.options?.headers?.['x-internal-secret'], 'shared-internal-secret');
  } finally {
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.INTERNAL_SERVICE_SECRET;
    else process.env.INTERNAL_SERVICE_SECRET = originalSecret;
    if (originalUrl === undefined) delete process.env.FYN_SEND_URL;
    else process.env.FYN_SEND_URL = originalUrl;
  }
});

test('matchVerificationCode solo acepta mensajes exactamente de 6 dígitos', () => {
  const { matchVerificationCode } = require('../audit-helpers');
  assert.equal(matchVerificationCode('123456')?.[0], '123456');
  assert.equal(matchVerificationCode('  123456  ')?.[0], '123456');
  assert.equal(matchVerificationCode('pedido 123456'), null);
  assert.equal(matchVerificationCode('1234567'), null);
  assert.equal(matchVerificationCode('abc123'), null);
  assert.equal(matchVerificationCode(''), null);
});
