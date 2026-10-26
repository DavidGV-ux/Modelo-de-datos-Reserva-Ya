// lambdaReminders.js - Cron (CloudWatch): recordatorios 8h y 1h antes de cada cita
const config = require('./config');
const Utils = require('./utils');
const dbService = require('./Services/dbService');
const reservaYaApi = require('./Services/reservaYaApi');
const whatsappService = require('./Services/whatsappService');
const { sendReminders } = require('./Services/notifyService');

exports.handler = async () => {
  const started = Date.now();
  const now = new Date();

  if (!config.mongo.uri) {
    Utils.log('warn', 'MONGODB_URI no configurado. Recordatorios omitidos.');
    return;
  }

  let db;
  try {
    db = await dbService.connect();
  } catch (err) {
    Utils.log('error', `No se pudo conectar a BD: ${err.message}`);
    return;
  }

  const nowIso = now.toISOString();
  const appointments = await dbService.listAppointmentsToRemind(nowIso);
  Utils.log('info', `Recordatorios a evaluar: ${appointments.length}`);

  for (const app of appointments) {
    const hoursUntil = (new Date(app.startTime).getTime() - now.getTime()) / 3600000;
    if (hoursUntil <= 0) continue;

    // Reconciliamos el estado real con el Back antes de avisar
    let status = app.status;
    try {
      const fresh = await reservaYaApi.getAppointment(app.tenantId, app.appointmentId);
      status = fresh?.appointment?.status || fresh?.status || app.status;
      if (status !== app.status) {
        await dbService
          .getDb()
          .collection('appointments')
          .updateOne({ tenantId: app.tenantId, appointmentId: app.appointmentId }, { $set: { status } });
      }
    } catch {
      // sin acceso al Back: usamos el estado guardado (no bloquea el recordatorio)
    }

    if (!['confirmed', 'pending_payment'].includes(status)) continue;

    if (hoursUntil <= 8 && hoursUntil > 1 && !app.reminded8h) {
      await sendReminders(app, '8h');
      await dbService.markReminded(app.tenantId, app.appointmentId, 'reminded8h');
    }

    if (hoursUntil <= 1 && !app.reminded1h) {
      await sendReminders(app, '1h');
      await dbService.markReminded(app.tenantId, app.appointmentId, 'reminded1h');
    }
  }

  Utils.log('info', `Ciclo de recordatorios terminado en ${Date.now() - started}ms`);
};