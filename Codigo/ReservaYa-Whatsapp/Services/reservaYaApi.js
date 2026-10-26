// Services/reservaYaApi.js - Cliente de la API pública de ReservaYa
const axios = require('axios');
const config = require('../config');

class ReservaYaApi {
  constructor() {
    this.client = axios.create({
      baseURL: config.reservaYa.apiUrl,
      timeout: config.reservaYa.requestTimeoutMs,
      headers: { 'content-type': 'application/json' },
    });
  }

  async get(path, params, headers) {
    const { data } = await this.client.get(path, { params, headers });
    return data;
  }

  async post(path, body) {
    const { data } = await this.client.post(path, body);
    return data;
  }

  async getDirectory() {
    return this.get('/public/tenants');
  }

  async getTenantBySlug(slug) {
    return this.get(`/public/tenants/${encodeURIComponent(slug)}`);
  }

  async getServices(tenantId) {
    return this.get(`/public/${encodeURIComponent(tenantId)}/services`);
  }

  async getProfessionals(tenantId, serviceId) {
    return this.get(`/public/${encodeURIComponent(tenantId)}/professionals`, serviceId ? { serviceId } : undefined);
  }

  async getAvailabilityDays(tenantId, professionalIds, windowDays = 14) {
    return this.get(`/public/${encodeURIComponent(tenantId)}/availability/days`, {
      professionalIds: professionalIds.join(','),
      window: windowDays,
    });
  }

  async getSlots(tenantId, { professionalId, date, durationMinutes }) {
    return this.get(`/public/${encodeURIComponent(tenantId)}/availability`, {
      professionalId,
      date,
      durationMinutes,
    });
  }

  async createAppointment(tenantId, payload) {
    return this.post(`/public/${encodeURIComponent(tenantId)}/appointments`, payload);
  }

  async createPaymentSession(tenantId, appointmentId, mode) {
    return this.post(
      `/public/${encodeURIComponent(tenantId)}/appointments/${encodeURIComponent(appointmentId)}/payment-session`,
      { mode },
    );
  }

  async getAppointment(tenantId, appointmentId) {
    return this.get(`/public/${encodeURIComponent(tenantId)}/appointments/${encodeURIComponent(appointmentId)}`);
  }

  async getClientHistory(tenantId, phone) {
    return this.get(`/public/${encodeURIComponent(tenantId)}/appointments/history`, { phone });
  }

  async lookupPhone(phone) {
    return this.get(
      '/public/whatsapp/lookup',
      { phone },
      config.reservaYa.botSecret ? { 'x-whatsapp-secret': config.reservaYa.botSecret } : undefined,
    );
  }
}

module.exports = new ReservaYaApi();