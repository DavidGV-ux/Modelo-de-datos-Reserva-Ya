// test/invite.test.js - Verifica que el evento user.invite dispare el mensaje
// automático de WhatsApp respetando el país del número (E.164).
const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config');
const whatsappService = require('../Services/whatsappService');
const app = require('../index');

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

test('user.invite envía WhatsApp a un número internacional sin forzar +57', { skip: !config.reservaYa.eventsAllowed }, async () => {
  const original = whatsappService.sendMessage;
  const sent = [];
  whatsappService.sendMessage = async (to, body) => {
    sent.push({ to, body });
    return { ok: true };
  };
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/internal/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.reservaYa.eventsAllowed}`,
      },
      body: JSON.stringify({
        type: 'user.invite',
        user: { name: 'Ana Torres', phone: '+1 415 555 2671', city: 'Bogotá' },
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, '+14155552671');
    assert.match(sent[0].body, /Ana Torres/);
    assert.match(sent[0].body, /ReservaYa/);

    const local = await fetch(`http://127.0.0.1:${port}/internal/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.reservaYa.eventsAllowed}`,
      },
      body: JSON.stringify({
        type: 'user.invite',
        user: { name: 'David', phone: '+57 300 118 0584', city: 'Bogotá' },
      }),
    });
    assert.equal(local.status, 200);
    assert.equal(sent[1].to, '+573001180584');
    assert.equal(whatsappService.sanitizeTo(sent[1].to), '573001180584');
  } finally {
    whatsappService.sendMessage = original;
    await close(server);
  }
});
