import {
  Appointment,
  AppointmentSource,
  ClientInfo,
  Currency,
  LanguageCode,
  Tenant,
} from '../../shared/models/domain.model';

interface BackendTenantConfig {
  defaultLanguage?: string;
  activeLanguages?: string[];
  cancellationToleranceHours?: number;
  paymentTimeoutMinutes?: number;
  advancePaymentPercentage?: number;
  reminderHours?: number;
  whatsappPhoneNumberId?: string;
}

export interface BackendTenant {
  id: string;
  tenantId: string;
  slug: string;
  planId: string;
  name: string;
  tagline?: string;
  description?: string;
  timezone: string;
  currency?: string;
  logoUrl?: string;
  coverUrl?: string;
  address?: string;
  phone?: string;
  settings?: BackendTenantConfig;
  bookingStatus: 'active' | 'suspended' | 'migration';
  version?: number;
}

export interface BackendClientInfo {
  clientId?: string;
  name?: string;
  phone?: string;
  email?: string;
  documentId?: string;
  habeasDataConsent?: boolean;
  habeasDataConsentAt?: string;
  habeasDataAcceptedAt?: string;
}

export interface BackendAppointment {
  id: string;
  tenantId: string;
  professionalId: string;
  serviceId: string;
  serviceSnapshot: {
    serviceId: string;
    name: string;
    price: number;
    currency: Currency;
    durationMinutes: number;
  };
  commissionRateSnapshot: number;
  planIdSnapshot: string;
  idempotencyKey?: string;
  source?: AppointmentSource;
  paymentReference?: string;
  latestPaymentTransactionId?: string;
  createdAt?: string;
  clientInfo?: BackendClientInfo;
  startTime: string;
  endTime: string;
  status: Appointment['status'];
  paymentStatus: Appointment['paymentStatus'];
  cancellation?: Appointment['cancellation'];
  needsReassignment?: boolean;
  version?: number;
}

export interface BookingIntent {
  advanceAmount: number;
  currency: Currency;
  paymentReference: string;
  providerTransactionId?: string;
  chargeMode?: 'hosted' | 'demo';
  publicKey?: string;
  amountInCents?: number;
  signatureIntegrity?: string;
}

export interface BookingResult {
  appointment: BackendAppointment;
  intent: BookingIntent;
  replay: boolean;
}

export function mapTenant(t: BackendTenant): Tenant {
  const currency: Currency = t.currency === 'USD' ? 'USD' : 'COP';
  const language = (value?: string): LanguageCode => (value === 'en' ? 'en' : 'es');
  return {
    id: t.id,
    tenantId: t.tenantId,
    slug: t.slug,
    planId: t.planId,
    name: t.name,
    tagline: t.tagline ?? '',
    description: t.description ?? '',
    timezone: t.timezone,
    currency,
    logoUrl: t.logoUrl,
    coverUrl: t.coverUrl,
    address: t.address,
    phone: t.phone,
    settings: {
      defaultLanguage: language(t.settings?.defaultLanguage),
      activeLanguages: (t.settings?.activeLanguages ?? ['es', 'en']).map(language),
      cancellationWindowHours: t.settings?.cancellationToleranceHours ?? 24,
      reminderHours: t.settings?.reminderHours ?? 24,
      upfrontPercent: t.settings?.advancePaymentPercentage ?? 30,
      paymentTimeoutMinutes: t.settings?.paymentTimeoutMinutes ?? 15,
      whatsappPhoneNumberId: t.settings?.whatsappPhoneNumberId,
    },
    bookingStatus: t.bookingStatus,
    version: t.version ?? 1,
  };
}

export function mapAppointment(a: BackendAppointment): Appointment {
  const clientInfo = mapClientInfo(a.clientInfo);
  return {
    id: a.id,
    tenantId: a.tenantId,
    professionalId: a.professionalId,
    serviceId: a.serviceId,
    serviceSnapshot: a.serviceSnapshot,
    commissionRateSnapshot: a.commissionRateSnapshot,
    planIdSnapshot: a.planIdSnapshot,
    idempotencyKey: a.idempotencyKey,
    source: a.source ?? 'web',
    paymentReference: a.paymentReference,
    latestPaymentTransactionId: a.latestPaymentTransactionId,
    createdAt: a.createdAt,
    clientInfo,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    paymentStatus: a.paymentStatus,
    cancellation: a.cancellation,
    needsReassignment: a.needsReassignment ?? false,
    version: a.version ?? 1,
  };
}

function mapClientInfo(c?: BackendClientInfo): ClientInfo {
  const acceptedAt = c?.habeasDataAcceptedAt ?? c?.habeasDataConsentAt;
  return {
    name: c?.name ?? '',
    phone: c?.phone,
    email: c?.email,
    documentId: c?.documentId,
    habeasDataConsent: Boolean(c?.habeasDataConsent ?? acceptedAt),
    habeasDataConsentAt: acceptedAt,
  };
}

export interface TenantMembership {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  roles: string[];
}