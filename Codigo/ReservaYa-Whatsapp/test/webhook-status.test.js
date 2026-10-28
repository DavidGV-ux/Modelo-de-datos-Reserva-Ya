// test/webhook-status.test.js - Verifica que los recibos de Meta conserven el
// phone_number_id y el estado, para no reenviarlos al bot equivocado.
const test = require('node:test');
const assert = require('node:assert/strict');
const Utils = require('../utils');

test('extractMessageInfo conserva phone_number_id y estado de entrega', () => {
  const info = Utils.extractMessageInfo({
    object: 'whatsapp_business_account',
    entry: [{
      id: '1520216522563392',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '573123054870',
            phone_number_id: '1284208204783584',
          },
          statuses: [{
            id: 'wamid.test',
            status: 'failed',
            recipient_id: '573334316534',
            errors: [{ code: 131047, title: 'Re-engagement message' }],
          }],
        },
      }],
    }],
  });

  assert.equal(info.isEmpty, true);
  assert.equal(info.hasStatus, true);
  assert.equal(info.phoneNumberId, '1284208204783584');
  assert.equal(info.from, '573334316534');
  assert.equal(info.status, 'failed');
  assert.equal(info.statusErrors[0].code, 131047);
});
