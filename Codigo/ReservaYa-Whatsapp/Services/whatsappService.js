// Services/whatsappService.js - Cliente de la Cloud API de Meta (WhatsApp)
const axios = require('axios');
const config = require('../config');

class WhatsAppService {
  constructor() {
    if (!config.whatsapp.phoneId || !config.whatsapp.token) {
      console.warn('⚠️ WhatsApp sin configurar (WHATSAPP_PHONE_ID/WHATSAPP_TOKEN).');
    }
    this.apiUrl = `${config.whatsapp.apiUrl}/${config.whatsapp.phoneId}`;
    this.token = config.whatsapp.token;
  }

  async post(endpoint, payload) {
    if (!this.token || !config.whatsapp.phoneId) {
      throw new Error('WhatsApp no configurado (token/phoneId)');
    }
    const { data } = await axios.post(`${this.apiUrl}${endpoint}`, payload, {
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      timeout: 12000,
    });
    return data;
  }

  // La Cloud API espera E.164 sin '+'. Si llega un número local de 10 dígitos
  // asumimos Colombia (+57); si ya viene con prefijo internacional, se respeta.
  sanitizeTo(to) {
    let digits = String(to ?? '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return `57${digits.slice(1)}`;
    if (digits.length === 10) return `57${digits}`;
    return digits;
  }

  async sendMessage(to, message) {
    return this.post('/messages', {
      messaging_product: 'whatsapp',
      to: this.sanitizeTo(to),
      text: { body: message },
    });
  }

  /**
   * Envía una plantilla aprobada. Es obligatoria para iniciar conversación con
   * un número que nunca ha escrito al negocio (regla de 24 horas de Meta).
   */
  async sendTemplate(to, name, language, bodyParameters = []) {
    const components = bodyParameters.length
      ? [{
          type: 'body',
          parameters: bodyParameters.map((text) => ({ type: 'text', text: String(text) })),
        }]
      : undefined;
    return this.post('/messages', {
      messaging_product: 'whatsapp',
      to: this.sanitizeTo(to),
      type: 'template',
      template: {
        name,
        language: { code: language },
        ...(components ? { components } : {}),
      },
    });
  }

  async sendButtons(to, body, buttons) {
    return this.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.sanitizeTo(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    });
  }

  async sendList(to, header, body, buttonText, sections) {
    return this.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.sanitizeTo(to),
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: header },
        body: { text: body },
        action: {
          button: buttonText,
          sections: sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.description ? String(r.description).substring(0, 72) : undefined,
            })),
          })),
        },
      },
    });
  }

  async markRead(to) {
    try {
      await this.post('/messages', { messaging_product: 'whatsapp', status: 'read', message_id: '', to: this.sanitizeTo(to) });
    } catch {
      // El marcado de leído es best-effort
    }
  }
}

module.exports = new WhatsAppService();