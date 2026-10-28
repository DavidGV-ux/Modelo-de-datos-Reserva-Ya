// test/invite.test.js - Verifica que el evento user.invite dispare el mensaje
// automático de WhatsApp respetando el país del número (E.164) y usando una
// plantilla aprobada para el primer contacto.
const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config');
const whatsappService = require('../Services/whatsappService');
const app = require('../index');

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function withServer(fn) {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    await fn(server.address().port);
  } finally {
    await close(server);
  }
}

function invite(port, user) {
  return fetch(`http://127.0.0.1:${port}/internal/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.reservaYa.eventsAllowed}`,
    },
    body: JSON.stringify({ type: 'user.invite', user }),
  });
}

test('user.invite usa una plantilla y respeta números internacionales', { skip: !config.reservaYa.eventsAllowed }, async () => {
  const originalTemplate = whatsappService.sendTemplate;
  const originalMessage = whatsappService.sendMessage;
  const templates = [];
  const texts = [];
  whatsappService.sendTemplate = async (to, name, language, params) => {
    templates.push({ to, name, language, params });
    return { ok: true };
  };
  whatsappService.sendMessage = async (to, body) => {
    texts.push({ to, body });
    return { ok: true };
  };
  try {
    await withServer(async (port) => {
      const response = await invite(port, { name: 'Ana Torres', phone: '+1 415 555 2671', city: 'Bogotá' });
      assert.equal(response.status, 200);
      assert.equal(templates.length, 1);
      assert.equal(templates[0].to, '+14155552671');
      assert.equal(templates[0].name, 'bienvenida_reservaya');
      assert.deepEqual(templates[0].params, ['Ana Torres']);
      assert.equal(texts.length, 0);

      const local = await invite(port, { name: 'David', phone: '+57 300 118 0584', city: 'Bogotá' });
      assert.equal(local.status, 200);
      assert.equal(templates[1].to, '+573001180584');
      assert.equal(whatsappService.sanitizeTo(templates[1].to), '573001180584');
    });
  } finally {
    whatsappService.sendTemplate = originalTemplate;
    whatsappService.sendMessage = originalMessage;
  }
});

test('user.invite cae a texto libre si la plantilla no está aprobada', { skip: !config.reservaYa.eventsAllowed }, async () => {
  const originalTemplate = whatsappService.sendTemplate;
  const originalMessage = whatsappService.sendMessage;
  const texts = [];
  whatsappService.sendTemplate = async () => {
    throw new Error('template pending');
  };
  whatsappService.sendMessage = async (to, body) => {
    texts.push({ to, body });
    return { ok: true };
  };
  try {
    await withServer(async (port) => {
      const response = await invite(port, { name: 'David', phone: '300 118 0584', city: 'Bogotá' });
      assert.equal(response.status, 200);
      assert.equal(texts.length, 1);
      assert.equal(texts[0].to, '+573001180584');
      assert.match(texts[0].body, /ReservaYa/);
    });
  } finally {
    whatsappService.sendTemplate = originalTemplate;
    whatsappService.sendMessage = originalMessage;
  }
});
