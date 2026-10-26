// Services/dbService.js - Base de datos propia de ReservaYa-Whatsapp (Atlas, BD independiente)
const { MongoClient } = require('mongodb');
const config = require('../config');
const Utils = require('../utils');

class DbService {
  constructor() {
    this.client = null;
    this.db = null;
    this.indexesReady = false;
  }

  getDb() {
    if (!this.db) throw new Error('MongoDB no inicializado. Llama dbService.connect() primero.');
    return this.db;
  }

  async connect() {
    if (this.db) return this.db;
    if (!config.mongo.uri) {
      throw new Error('MONGODB_URI no está configurado');
    }
    if (!this.client) {
      this.client = new MongoClient(config.mongo.uri, {
        maxPoolSize: 5,
        // SRV / handshake de Atlas puede tardar: no usar timeouts tan cortos en Lambda
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 10000,
      });
    }
    try {
      await this.client.connect();
    } catch (err) {
      // Dejar el cliente para reintentar en el siguiente mensaje
      this.db = null;
      throw err;
    }
    this.db = this.client.db(config.mongo.database);
    await this.ensureIndexes();
    Utils.log('info', `Conectado a MongoDB (${this.db.databaseName})`);
    return this.db;
  }

  async ensureIndexes() {
    if (this.indexesReady) return;
    const conv = this.db.collection('conversations');
    await conv.createIndex({ phone: 1 }, { unique: true });
    const msgs = this.db.collection('messages');
    await msgs.createIndex({ messageId: 1 }, { unique: true });
    const apps = this.db.collection('appointments');
    await apps.createIndex({ tenantId: 1, appointmentId: 1 }, { unique: true });
    await apps.createIndex({ startTime: 1 });
    this.indexesReady = true;
  }

  // ---- Idempotencia de mensajes (sobrevive cold starts de Lambda) ----
  async markMessageProcessed(messageId) {
    if (!messageId) return false;
    const col = this.db.collection('messages');
    try {
      await col.insertOne({ messageId, processedAt: new Date().toISOString() });
      return false; // no estaba procesado
    } catch (err) {
      if (err?.code === 11000) return true; // ya estaba
      throw err;
    }
  }

  // ---- Conversaciones ----
  async getConversation(phone) {
    const col = this.db.collection('conversations');
    return col.findOne({ phone });
  }

  async upsertConversation(phone, patch) {
    const col = this.db.collection('conversations');
    const update = { $set: { ...patch, updatedAt: new Date().toISOString() } };
    if (patch.context === null) {
      delete update.$set.context;
      update.$unset = { context: '' };
    }
    await col.updateOne({ phone }, update, { upsert: true });
  }

  async clearContext(phone) {
    const col = this.db.collection('conversations');
    await col.updateOne(
      { phone },
      { $unset: { context: '' }, $set: { updatedAt: new Date().toISOString() } },
    );
  }

  // ---- Citas recibidas por evento (para recordatorios) ----
  async saveAppointmentEvent(appointment, tenant, professional) {
    const col = this.db.collection('appointments');
    const timezone = tenant?.timezone || 'America/Bogota';
    const doc = {
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      tenantName: tenant?.name || '',
      city: tenant?.city || '',
      timezone,
      professionalId: appointment.professionalId,
      professionalName: professional?.name || '',
      professionalPhone: professional?.phone || null,
      ownerPhone: tenant?.businessPhone || null,
      serviceName: appointment.serviceName,
      price: appointment.price,
      currency: appointment.currency,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      paymentReference: appointment.paymentReference,
      clientName: appointment.clientName,
      clientPhone: appointment.clientPhone,
      reminded8h: false,
      reminded1h: false,
      notifiedOwner: true,
      notifiedProfessional: Boolean(professional?.phone && professional.phone !== appointment.clientPhone),
      createdAt: new Date().toISOString(),
    };
    await col.updateOne(
      { tenantId: doc.tenantId, appointmentId: doc.appointmentId },
      { $set: doc },
      { upsert: true },
    );
    return doc;
  }

  async listAppointmentsToRemind(nowIso) {
    const col = this.db.collection('appointments');
    return col
      .find({
        startTime: { $gt: nowIso },
        status: { $in: ['confirmed', 'pending_payment'] },
        $or: [{ reminded8h: { $ne: true } }, { reminded1h: { $ne: true } }],
      })
      .sort({ startTime: 1 })
      .toArray();
  }

  async markReminded(tenantId, appointmentId, field) {
    const col = this.db.collection('appointments');
    const set = { [field]: true, [`${field}At`]: new Date().toISOString() };
    await col.updateOne({ tenantId, appointmentId }, { $set: set });
  }
}

module.exports = new DbService();