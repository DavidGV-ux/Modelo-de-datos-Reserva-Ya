import { Tenant, Service, Professional } from '../models/domain.model';

export const MOCK_TENANT: Tenant = {
  id: '60f1c0a0e6b3f2a1b4c2d3e4',
  tenantId: 't_barber_estilo',
  slug: 'barber-estilo',
  planId: 'plan_pro',
  name: 'Barber Estilo',
  tagline: 'Cortes de cabello y barbería con cita previa',
  description:
    'Barbería con profesionales certificados. Agenda tu cita en línea, paga tu anticipo y llega al local sin esperas.',
  timezone: 'America/Bogota',
  currency: 'COP',
  phone: '+57 320 123 4567',
  address: 'Calle 23 # 45-12, Bogotá',
  settings: {
    defaultLanguage: 'es',
    activeLanguages: ['es', 'en'],
    cancellationWindowHours: 24,
    reminderHours: 24,
    upfrontPercent: 30,
    paymentTimeoutMinutes: 15,
  },
  bookingStatus: 'active',
  version: 1,
};

export const MOCK_SERVICES: Service[] = [
  {
    id: 'srv_001',
    tenantId: 't_barber_estilo',
    name: 'Corte clásico',
    description: 'Corte de cabello con tijera y máquina, lavado incluido.',
    price: 35000,
    currency: 'COP',
    durationMinutes: 45,
    active: true,
    version: 1,
  },
  {
    id: 'srv_002',
    tenantId: 't_barber_estilo',
    name: 'Corte + barba',
    description: 'Corte de cabello y arreglo de barba con toalla caliente.',
    price: 55000,
    currency: 'COP',
    durationMinutes: 75,
    active: true,
    version: 1,
  },
  {
    id: 'srv_003',
    tenantId: 't_barber_estilo',
    name: 'Ritual de barba',
    description: 'Arreglo de barba, perfilado y afeitado clásico.',
    price: 30000,
    currency: 'COP',
    durationMinutes: 45,
    active: true,
    version: 1,
  },
  {
    id: 'srv_004',
    tenantId: 't_barber_estilo',
    name: 'Corte infantil',
    description: 'Corte de cabello para niños hasta 12 años.',
    price: 28000,
    currency: 'COP',
    durationMinutes: 30,
    active: true,
    version: 1,
  },
];

export const MOCK_PROFESSIONALS: Professional[] = [
  {
    id: 'prof_001',
    tenantId: 't_barber_estilo',
    name: 'Carlos Mendoza',
    title: 'Barbero senior',
    serviceIds: ['srv_001', 'srv_002', 'srv_003'],
    active: true,
    version: 1,
  },
  {
    id: 'prof_002',
    tenantId: 't_barber_estilo',
    name: 'Andrea Torres',
    title: 'Estilista',
    serviceIds: ['srv_001', 'srv_002', 'srv_004'],
    active: true,
    version: 1,
  },
  {
    id: 'prof_003',
    tenantId: 't_barber_estilo',
    name: 'Julián Prada',
    title: 'Barbero',
    serviceIds: ['srv_001', 'srv_002', 'srv_003'],
    active: true,
    version: 1,
  },
];

export const MOCK_SCHEDULE_WINDOW_DAYS = 14;

export const MOCK_WEEK_SCHEDULE = [
  { dayOfWeek: 1, start: '09:00', end: '18:00' },
  { dayOfWeek: 2, start: '09:00', end: '18:00' },
  { dayOfWeek: 3, start: '09:00', end: '18:00' },
  { dayOfWeek: 4, start: '09:00', end: '18:00' },
  { dayOfWeek: 5, start: '09:00', end: '20:00' },
  { dayOfWeek: 6, start: '09:00', end: '20:00' },
];