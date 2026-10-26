import { Appointment, AppointmentSource, ServiceSnapshot } from '../models/domain.model';
import { MOCK_PROFESSIONALS, MOCK_SERVICES, MOCK_TENANT } from './tenant.mock';

export type MockAppointmentStatus = Appointment['status'];

function isoHoursAgo(hours: number, minutesOffset = 0, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(9 + Math.floor(hours / 2), (hours % 2) * 30 + minutesOffset, 0, 0);
  return d.toISOString();
}

function snap(serviceId: string): ServiceSnapshot {
  const s = MOCK_SERVICES.find((x) => x.id === serviceId)!;
  return {
    serviceId: s.id,
    name: s.name,
    price: s.price,
    currency: MOCK_TENANT.currency,
    durationMinutes: s.durationMinutes,
  };
}

const client = (name: string, tel: string) => ({
  name,
  phone: tel,
  habeasDataConsent: true,
  habeasDataConsentAt: new Date().toISOString(),
});

const base = (id: string, serviceId: string, professionalId: string, dayOffset: number, startHour: number): Appointment => ({
  id,
  tenantId: MOCK_TENANT.tenantId,
  professionalId,
  serviceId,
  serviceSnapshot: snap(serviceId),
  commissionRateSnapshot: 0.05,
  planIdSnapshot: 'plan_basico',
  source: 'web' as AppointmentSource,
  clientInfo: client('Cliente Ejemplo', '+57 300 000 0000'),
  startTime: isoHoursAgo(startHour, 0, dayOffset),
  endTime: isoHoursAgo(startHour + 1, 0, dayOffset),
  status: 'confirmed',
  paymentStatus: 'approved',
  needsReassignment: false,
  version: 1,
});

export const MOCK_APPOINTMENTS: Appointment[] = [
  {
    ...base('appt_001', 'srv_001', 'prof_001', -6, 0),
    clientInfo: client('Daniel Espinosa', '+57 310 111 2233'),
    status: 'completed',
  },
  {
    ...base('appt_002', 'srv_002', 'prof_002', -5, 4),
    clientInfo: client('Carolina Ríos', '+57 311 222 3344'),
    status: 'completed',
  },
  {
    ...base('appt_003', 'srv_003', 'prof_001', -4, 2),
    clientInfo: client('Felipe Vargas', '+57 312 333 4455'),
    status: 'no_show',
  },
  {
    ...base('appt_004', 'srv_001', 'prof_003', -3, 6),
    clientInfo: client('Mariana Duarte', '+57 313 444 5566'),
    status: 'completed',
  },
  {
    ...base('appt_005', 'srv_004', 'prof_002', -2, 0),
    clientInfo: client('Samuel Pinzón', '+57 314 555 6677'),
    status: 'cancelled',
  },
  {
    ...base('appt_006', 'srv_002', 'prof_001', -1, 4),
    clientInfo: client('Laura Gómez', '+57 315 666 7788'),
    status: 'completed',
  },
  {
    ...base('appt_007', 'srv_001', 'prof_003', 0, 0),
    clientInfo: client('Andrés Silva', '+57 316 777 8899'),
    status: 'confirmed',
  },
  {
    ...base('appt_008', 'srv_002', 'prof_001', 0, 4),
    clientInfo: client('Valentina Mora', '+57 317 888 9900'),
    status: 'confirmed',
  },
  {
    ...base('appt_009', 'srv_003', 'prof_002', 1, 2),
    clientInfo: client('Camilo Restrepo', '+57 318 999 0011'),
    status: 'pending_payment',
    paymentStatus: 'pending',
  },
  {
    ...base('appt_010', 'srv_001', 'prof_003', 1, 6),
    clientInfo: client('Sara López', '+57 319 000 1122'),
    status: 'confirmed',
  },
  {
    ...base('appt_011', 'srv_002', 'prof_001', 2, 0),
    clientInfo: client('Óscar Prieto', '+57 320 111 2233'),
    status: 'confirmed',
  },
  {
    ...base('appt_012', 'srv_001', 'prof_002', 3, 5),
    clientInfo: client('Isabella Cruz', '+57 321 222 3344'),
    status: 'confirmed',
  },
];

export const MOCK_LEDGER_MOVEMENTS = MOCK_APPOINTMENTS.filter((a) => a.paymentStatus === 'approved').map((a, i) => {
  const gross = a.serviceSnapshot.price * (MOCK_TENANT.settings.upfrontPercent / 100);
  const commission = Math.round(gross * a.commissionRateSnapshot * 100) / 100;
  const credit = Math.round((gross - commission) * 100) / 100;
  return {
    id: `led_${String(i).padStart(3, '0')}`,
    tenantId: a.tenantId,
    transactionId: `pay_${String(i).padStart(3, '0')}`,
    appointmentId: a.id,
    type: 'payment_approved' as const,
    account: 'tenant_balance' as const,
    direction: 'credit' as const,
    amount: credit,
    currency: MOCK_TENANT.currency,
    commissionRateSnapshot: a.commissionRateSnapshot,
    status: 'posted' as const,
    timestamp: a.startTime,
  };
});

export const MOCK_TENANT_USERS = {
  owner: { keycloakUserId: 'kc-owner-001', role: 'owner', status: 'active' as const },
  professional: { keycloakUserId: 'kc-prof-001', role: 'professional' as const, status: 'active' as const },
};