// Services/roleService.js - Resuelve el rol (owner/professional/client) por teléfono
const reservaYaApi = require('./reservaYaApi');
const Utils = require('../utils');

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

class RoleService {
  async resolve(phoneDigits) {
    const now = Date.now();
    const hit = cache.get(phoneDigits);
    if (hit && hit.expires > now) return hit.identity;

    let identity = { role: null, phone: `+${phoneDigits}` };
    try {
      const normalized =
        Utils.normalizePhoneE164(phoneDigits) || `+${phoneDigits}`;
      identity = await reservaYaApi.lookupPhone(normalized);
      identity = identity || { role: null, phone: normalized };
    } catch (err) {
      Utils.log('warn', `Role lookup falló para ${phoneDigits}: ${err.message}`);
    }

    cache.set(phoneDigits, { identity, expires: now + CACHE_TTL });
    return identity;
  }

  invalidate(phoneDigits) {
    cache.delete(phoneDigits);
  }
}

module.exports = new RoleService();