// config.js - ADAPTADO PARA AWS LAMBDA (proyecto independiente ReservaYa-Whatsapp)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // WhatsApp Cloud API
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0',
    phoneId: process.env.WHATSAPP_PHONE_ID || '',
    token: process.env.WHATSAPP_TOKEN || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    // App Secret de Meta para verificar la firma X-Hub-Signature-256 del webhook.
    // IMPORTANTE: fail-closed; sin este valor el webhook rechaza todo.
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    // App Secret alternativo: cuando recibimos webhooks de otra app de Meta
    // (p. ej. la app Live de fyn como transporte del 312), Meta firma con EL
    // app secret de ESA app. Se aceptan ambos.
    appSecretAlt: process.env.WHATSAPP_APP_SECRET_ALT || '',
  },

  // fyn (canal/transporte Live del 315): reenviamos sus eventos intactos para
  // que su bot siga funcionando mientras el webhook de su app apunta a nosotros.
  fyn: {
    webhookUrl: process.env.FYN_WEBHOOK_URL || '',
    phoneId: process.env.FYN_PHONE_ID || '890472847487137',
  },

  // Groq IA
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: Number(process.env.GROQ_MAX_TOKENS) || 200,
    temperature: Number(process.env.GROQ_TEMPERATURE) || 0.1,
    intentTimeoutMs: Number(process.env.GROQ_INTENT_TIMEOUT_MS) || 8000,
  },

  // API de ReservaYa (backend compartido)
  reservaYa: {
    apiUrl: process.env.RESERVAYA_API_URL || '',
    // Secreto compartido con el Back para /api/public/whatsapp/lookup
    botSecret: process.env.RESERVAYA_BOT_SECRET || '',
    // Endpoint interno del Back que publica eventos (appointment.created)
    eventsAllowed: process.env.RESERVAYA_EVENTS_TOKEN || '',
    requestTimeoutMs: Number(process.env.RESERVAYA_TIMEOUT_MS) || 10000,
  },

  // Base de datos propia (Atlas, misma cluster, BD independiente)
  mongo: {
    uri: process.env.MONGODB_URI || '',
    database: process.env.MONGODB_DATABASE || 'reserva_ya_whatsapp',
  },

  // Ciudad por defecto para el flujo de ubicación
  defaultCity: process.env.DEFAULT_CITY || 'Bogotá',

  adminSecret: process.env.ADMIN_SECRET || '',
  blockedUsers: (process.env.BLOCKED_USERS || '').split(',').map((s) => s.trim()).filter(Boolean),
};