// index.js - Servidor Express: webhook Meta (verificación HMAC), eventos internos y salud
const express = require('express');
const config = require('./config');
const Utils = require('./utils');
const whatsappService = require('./Services/whatsappService');
const orchestrator = require('./Services/orchestrator');
const dbService = require('./Services/dbService');
const { notifyNewAppointment } = require('./Services/notifyService');

const app = express();

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // para verificar la firma X-Hub-Signature-256
    },
  }),
);

app.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), env: config.nodeEnv });
});

// Verificación inicial que pide Meta al registrar el webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    Utils.log('info', 'Webhook verificado por Meta.');
    return res.send(challenge);
  }
  return res.status(403).send('Verificación de webhook fallida.');
});

// Mensajes entrantes de WhatsApp
app.post('/webhook', async (req, res) => {
  if (!Utils.verifyWhatsAppSignature(req.rawBody, req.headers['x-hub-signature-256'], [config.whatsapp.appSecret, config.whatsapp.appSecretAlt])) {
    Utils.log('warn', 'Firma de webhook inválida. Rechazado.');
    return res.status(403).send('Firma inválida.');
  }

  const validation = Utils.validateWhatsAppMessage(req.body);
  if (!validation.valid) return res.status(200).send('REJECTED');

  const info = Utils.extractMessageInfo(req.body);

  // Multi-número: solo atendemos los eventos de NUEStro número (phone id del
  // 312). Los eventos de otros números (315 de fyn, etc.) se reenVIAN intactos
  // (bytes crudos + firma original) a fyn para que su bot siga funcionando.
  const isOurs = info.phoneNumberId && String(info.phoneNumberId) === String(config.whatsapp.phoneId);
  if (!isOurs) {
    if (config.fyn.webhookUrl) {
      const fwd = await Utils.forwardWebhook(req.rawBody, req.headers['x-hub-signature-256'], config.fyn.webhookUrl);
      if (fwd) Utils.log('info', `Reenviado a fyn (${info.phoneNumberId || 'sin pid'}).`);
      else Utils.log('warn', `Fallo reenvío a fyn (${info.phoneNumberId || info.from || '?'}).`);
    } else {
      Utils.log('info', `Evento no nuestro (${info.phoneNumberId || 'sin pid'}), sin fyn configurado, ignorado.`);
    }
    return res.status(200).send('OK');
  }

  if (info.isEmpty || info.hasStatus) {
    return res.status(200).send('OK'); // solo statuses (recibos), no responder
  }

  whatsappService.markRead(info.from).catch(() => {});
  // IMPORTANTE: esperamos el procesamiento antes de responder. Si se responde
  // al HTTP API sin esperar, el runtime congela el loop de eventos y el bot
  // no llega a atender el mensaje.
  try {
    await orchestrator.handleIncoming({
      from: info.from,
      messageBody: info.messageBody,
      userName: info.userName,
      messageId: info.messageId,
      messageType: info.messageType,
    });
  } catch (err) {
    Utils.log('error', `handleIncoming: ${err.message}`);
  }

  return res.status(200).send('OK');
});

// Eventos internos publicados por el Back (appointment.created)
app.post('/internal/events', async (req, res) => {
  const token = config.reservaYa.eventsAllowed;
  const auth = req.headers.authorization || '';
  if (!token || auth !== `Bearer ${token}`) {
    Utils.log('warn', 'Intento sin autorización a /internal/events.');
    return res.status(403).send('forbidden');
  }

  const event = req.body?.type || req.body?.event;
  if (event === 'appointment.created') {
    const { appointment, tenant, professional } = req.body || {};
    if (!appointment?.id || !appointment?.tenantId) {
      return res.status(400).send('invalid event');
    }
    try {
      await dbService.connect();
      await dbService.saveAppointmentEvent(appointment, tenant, professional);
      await notifyNewAppointment({
        ownerPhone: tenant?.businessPhone || null,
        professionalPhone: professional?.phone || null,
        clientPhone: appointment.clientPhone || null,
        tenantName: tenant?.name || 'ReservaYa',
        serviceName: appointment.serviceName,
        clientName: appointment.clientName,
        price: appointment.price,
        currency: appointment.currency,
        startTime: appointment.startTime,
        timezone: tenant?.timezone || 'America/Bogota',
        paymentReference: appointment.paymentReference,
        status: appointment.status,
      });
      return res.status(200).send('ok');
    } catch (err) {
      // Si falla la BD, igual acusamos recibo (más adelante el cron lo reconstruye vía lookup)
      Utils.log('error', `appointment.created: ${err.message}`);
      return res.status(200).send('accepted');
    }
  }

  if (event === 'appointment.updated') {
    try {
      await dbService.connect();
      const { appointment, tenant, professional } = req.body || {};
      if (appointment?.id && appointment?.tenantId) {
        await dbService.saveAppointmentEvent(appointment, tenant, professional);
      }
    } catch (err) {
      Utils.log('error', `appointment.updated: ${err.message}`);
    }
    return res.status(200).send('ok');
  }

  // El usuario completo su perfil web (teléfono + ciudad): le enviamos la
  // invitación a usar el servicio por WhatsApp con asistente de IA.
  if (event === 'user.invite') {
    const user = req.body?.user || {};
    const phone = Utils.normalizePhoneE164(user.phone);
    if (!phone) {
      return res.status(400).send('invalid user phone');
    }
    try {
      const greeting = user.name ? `Hola *${user.name}* 👋` : 'Hola 👋';
      const city = user.city ? ` en *${user.city}*` : '';
      const message =
        `${greeting}\nSoy el asistente de *ReservaYa*.\n\n` +
        `Con tu cuenta ya puedes agendarte también por este chat: escribeme tu necesidad ` +
        `(ej. *"corte de cabello accesible"*, *"café por menos de 10.000 pesos"*${city ? `, *"en ${user.city}"*` : ''}) ` +
        `y con mi asistente de IA te ayudo a encontrar negocios, comparar precios, reservar y ` +
        `recibir recordatorios. ¡Sin salir de WhatsApp! 📲`;
      await whatsappService.sendMessage(phone, message);
      Utils.log('info', `user.invite enviado a ${phone}`);
      return res.status(200).send('ok');
    } catch (err) {
      Utils.log('error', `user.invite: ${err.message}`);
      return res.status(200).send('accepted');
    }
  }

  return res.status(200).send('unknown');
});

module.exports = app;

if (require.main === module && config.nodeEnv !== 'production') {
  app.listen(config.port, () => {
    Utils.log('info', `ReservaYa-Whatsapp escuchando en el puerto ${config.port}`);
  });
}