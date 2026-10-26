// Services/notifyService.js - Mensajes de notificación (nueva reserva, recordatorios)
const whatsappService = require('./whatsappService');
const Utils = require('../utils');

function formatAppointment(app) {
  const when = Utils.formatSlotLocal(app.startTime, app.timezone);
  return (
    `📅 *Nueva reserva* en ${app.tenantName}\n` +
    `• Cliente: ${app.clientName}\n` +
    `• Servicio: ${app.serviceName} — ${Utils.money(app.price, app.currency)}\n` +
    `• Fecha: ${when}\n` +
    `• Ref: ${app.paymentReference}\n` +
    `• Estado: ${app.status === 'confirmed' ? '✅ Confirmada' : '⏳ Pendiente de pago'}`
  );
}

async function notifyNewAppointment(app) {
  const errors = [];
  // Dueño del negocio
  if (app.ownerPhone && app.ownerPhone !== app.clientPhone) {
    try {
      await whatsappService.sendMessage(app.ownerPhone, formatAppointment(app));
    } catch (err) {
      errors.push(`owner: ${err.message}`);
    }
  }
  // Profesional asignado
  if (app.professionalPhone && app.professionalPhone !== app.clientPhone) {
    try {
      await whatsappService.sendMessage(
        app.professionalPhone,
        `🔔 *${app.tenantName}*\nTienes una nueva reserva:\n` +
          `• Cliente: ${app.clientName}\n• Servicio: ${app.serviceName} (${Utils.money(app.price, app.currency)})\n` +
          `• Fecha: ${Utils.formatSlotLocal(app.startTime, app.timezone)}\n\nPrepárate para atender a tu cliente. 🙌`,
      );
    } catch (err) {
      errors.push(`professional: ${err.message}`);
    }
  }
  if (errors.length) {
    Utils.log('warn', `Notificaciones de nueva reserva con errores: ${errors.join(' | ')}`);
  }
}

async function sendReminders(app, kind) {
  const hour = kind === '8h' ? 8 : 1;
  const when = Utils.formatSlotLocal(app.startTime, app.timezone);
  const line =
    `⏰ *Recordatorio* (${hour}h antes)\n` +
    `Tienes una cita en *${app.tenantName}*:\n` +
    `• Servicio: ${app.serviceName}\n• Fecha: ${when}\n` +
    `Te esperamos. ¡Nos vemos ahí! 👋`;

  const targets = [];
  if (app.clientPhone) targets.push(app.clientPhone);
  if (app.professionalPhone && app.professionalPhone !== app.clientPhone) targets.push(app.professionalPhone);

  const errors = [];
  for (const to of targets) {
    try {
      await whatsappService.sendMessage(to, line);
    } catch (err) {
      errors.push(`${to}: ${err.message}`);
    }
  }
  if (errors.length) {
    Utils.log('warn', `Recordatorio ${kind}h con errores: ${errors.join(' | ')}`);
  }
}

module.exports = { notifyNewAppointment, sendReminders, formatAppointment };