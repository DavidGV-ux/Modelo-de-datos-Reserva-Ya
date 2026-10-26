import { Injectable, inject } from '@angular/core';
import { map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../core/config/environment';
import { ApiService } from '../../../core/http/api.service';
import {
  BackendTenant,
  BackendAppointment,
  mapAppointment,
  mapTenant,
  TenantMembership,
} from '../../../core/http/api-mappers';
import {
  OWNER_TENANT_KEY,
} from '../../../features/platform/pages/business-setup/business-setup.page';

/** Negocio seleccionado en la barra del panel (cualquier rol: owner/professional/client). */
export const ACTIVE_TENANT_KEY = 'reserwaya.activeTenant';
import { MOCK_APPOINTMENTS } from '../../../shared/mocks/dashboard.mock';
import { MOCK_PROFESSIONALS, MOCK_SERVICES, MOCK_TENANT } from '../../../shared/mocks/tenant.mock';
import { Appointment, LedgerEntry, Professional, Service, Tenant, WeeklySchedule } from '../../../shared/models/domain.model';

export interface OwnerOverview {
  tenant: Tenant;
  revenue: number;
  totalAppointments: number;
  confirmedToday: number;
  occupancy: number;
  commission: number;
  commissionRate: number;
  upcoming: Appointment[];
  movements: LedgerEntry[];
  owner: { keycloakUserId: string; role: string };
}

export interface ProfessionalAgenda {
  professionalId: string;
  appointments: Appointment[];
  blocks: Array<{ id: string; startTime: string; endTime: string; reason?: string }>;
}

export interface OwnerAppointmentRow {
  appointment: Appointment;
  advanceAmount: number;
  paidAmount: number;
  dueAmount: number;
  currency: string;
}

export interface OwnerAppointmentsResult {
  tenant: Tenant;
  rows: OwnerAppointmentRow[];
}

export interface AdminTenantRow {
  slug: string;
  name: string;
  country: string;
  plan: string;
  commission: number;
  status: 'active' | 'suspended';
}

interface BackendOwnerOverview {
  tenant: BackendTenant;
  revenue: number;
  totalAppointments: number;
  confirmedToday: number;
  occupancy: number;
  commission: number;
  commissionRate: number;
  upcoming: BackendAppointment[];
  movements: LedgerEntry[];
  owner: { keycloakUserId: string; role: string };
}

interface BackendAgenda {
  professionalId: string;
  appointments: BackendAppointment[];
  blocks: Array<{ id: string; startTime: string; endTime: string; reason?: string }>;
}

interface BackendOwnerAppointmentRow {
  appointment: BackendAppointment;
  advanceAmount: number;
  paidAmount: number;
  dueAmount: number;
  currency: string;
}

interface BackendOwnerAppointmentsResult {
  tenant: BackendTenant;
  rows: BackendOwnerAppointmentRow[];
}

function mockMembership(): TenantMembership {
  return {
    tenantId: MOCK_TENANT.tenantId,
    slug: MOCK_TENANT.slug,
    name: MOCK_TENANT.name,
    role: 'owner',
    roles: ['owner'],
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  /** Cache de membresías de la sesión por rol ('' = todas); se invalida tras onboarding o logout. */
  private tenantsCache = new Map<string, TenantMembership[]>();

  myTenants(role?: 'owner' | 'professional' | 'client'): Observable<TenantMembership[]> {
    const key = role ?? '';
    if (environment.useMockBackend) {
      return of(key === '' || key === 'owner' ? [mockMembership()] : []);
    }
    if (this.tenantsCache.has(key)) {
      return of(this.tenantsCache.get(key)!);
    }
    return this.api
      .get<TenantMembership[]>(`/me/tenants${role ? `?role=${role}` : ''}`)
      .pipe(
        tap((list) => {
          this.tenantsCache.set(key, list);
        }),
      );
  }

  invalidateTenants(): void {
    this.tenantsCache.clear();
  }

  storedOwnerTenant(): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(OWNER_TENANT_KEY) : null;
  }

  /** Selecciona el negocio (tenant) que el dueño administra en el panel. */
  selectOwnerTenant(tenantId: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OWNER_TENANT_KEY, tenantId);
      localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
    }
  }

  /** Negocio activo guardado (selección del switcher); con respaldo del tenant legacy de onboarding. */
  storedActiveTenant(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(ACTIVE_TENANT_KEY) ?? localStorage.getItem(OWNER_TENANT_KEY);
  }

  /** Selecciona el negocio activo de la barra (aplica a owner/professional/client). */
  selectActiveTenant(tenantId: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
      localStorage.setItem(OWNER_TENANT_KEY, tenantId);
    }
  }

  /** Membresías `owner` del usuario (los negocios que administra). */
  ownerTenants(): Observable<TenantMembership[]> {
    if (environment.useMockBackend) {
      return of([mockMembership()]);
    }
    return this.myTenants().pipe(map((list) => list.filter((m) => m.roles.includes('owner'))));
  }

  /**
   * Contexto del dueño que resuelve el dashboard del negocio:
   * primero el tenant guardado en localStorage (alta self-service o selección
   * explícita en el panel), y como respaldo el primer `owner` de `/me/tenants`.
   * Solo se consideran membresías con rol `owner`: un usuario puede también ser
   * professional/client de otro negocio sin ser dueño de él.
   */
  ownerContext(): Observable<TenantMembership | null> {
    const stored = this.storedActiveTenant();
    if (environment.useMockBackend) {
      return of({ ...mockMembership(), tenantId: stored ?? MOCK_TENANT.tenantId });
    }
    return this.myTenants('owner').pipe(
      map((owners) => {
        const preferred = stored ? owners.find((m) => m.tenantId === stored) : undefined;
        return preferred ?? owners[0] ?? null;
      }),
    );
  }

  /**
   * Contexto del profesional: SOLO negocios donde el usuario es `professional`
   * (nunca negocios que solo administra). Sin membresía como profesional => null.
   */
  professionalContext(): Observable<TenantMembership | null> {
    if (environment.useMockBackend) {
      return of({ ...mockMembership(), role: 'professional', roles: ['professional'] });
    }
    return this.myTenants('professional').pipe(
      map((list) => {
        const stored = this.storedActiveTenant();
        const preferred = stored ? list.find((m) => m.tenantId === stored) : undefined;
        return preferred ?? list[0] ?? null;
      }),
    );
  }

  /**
   * Negocio activo de la barra. Aplica a CUALQUIER membresía (owner/professional/client),
   * no solo a las del dueño: así "Mi agenda" y "Mis citas" quedan escalados al negocio
   * seleccionado en lugar de tomar la primera membresía del rol.
   */
  activeContext(): Observable<TenantMembership | null> {
    const stored = this.storedActiveTenant();
    if (environment.useMockBackend) {
      return of({ ...mockMembership(), tenantId: stored ?? MOCK_TENANT.tenantId });
    }
    return this.myTenants().pipe(
      map((list) => {
        if (list.length === 0) return null;
        const storedRow = stored ? list.find((m) => m.tenantId === stored) : undefined;
        if (storedRow) return storedRow;
        // Respaldos: owner -> professional -> client, y por nombre.
        const ROLE_PRIORITY: Record<string, number> = { owner: 0, professional: 1, client: 2 };
        return [...list].sort(
          (a, b) =>
            (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99) ||
            a.name.localeCompare(b.name),
        )[0];
      }),
    );
  }

  /**
   * Contexto de un rol específico, escalado al negocio ACTIVO:
   * - si el negocio activo tiene ese rol, devuelve su membresía;
   * - si el negocio activo es propiedad del usuario (owner), también puede ver
   *   las vistas de professional/client de su propio negocio (el backend lo permite);
   * - en cualquier otro caso devuelve null (la página muestra un estado vacío).
   */
  roleContext(role: 'owner' | 'professional' | 'client'): Observable<TenantMembership | null> {
    if (environment.useMockBackend) {
      return this.activeContext().pipe(
        map((active) => (role === 'owner' || active?.roles.includes('owner') ? active : null)),
      );
    }
    return this.activeContext().pipe(
      map((active) => {
        if (!active) return null;
        if (active.roles.includes(role)) return active;
        if (role !== 'owner' && active.roles.includes('owner')) return active;
        return null;
      }),
    );
  }

  /** Todas las citas del usuario como cliente, en TODOS los negocios (sección global "Mis reservas"). */
  allAppointments(): Observable<Appointment[]> {
    if (environment.useMockBackend) {
      return of(MOCK_APPOINTMENTS);
    }
    return this.api
      .get<BackendAppointment[]>('/me/appointments')
      .pipe(map((list) => list.map(mapAppointment)));
  }

  ownerOverview(tenantId: string): Observable<OwnerOverview> {
    if (environment.useMockBackend) {
      return of(this.mockOverview());
    }
    return this.api
      .get<BackendOwnerOverview>(`/owner/${tenantId}/overview`, tenantId)
      .pipe(
        map((o) => ({
          tenant: mapTenant(o.tenant),
          revenue: o.revenue,
          totalAppointments: o.totalAppointments,
          confirmedToday: o.confirmedToday,
          occupancy: o.occupancy,
          commission: o.commission,
          commissionRate: o.commissionRate,
          upcoming: o.upcoming.map(mapAppointment),
          movements: o.movements,
          owner: o.owner,
        })),
      );
  }

  ownerServices(tenantId: string): Observable<Service[]> {
    if (environment.useMockBackend) {
      return of(MOCK_SERVICES);
    }
    return this.api.get<Service[]>(`/owner/${tenantId}/services`, tenantId);
  }

  ownerAppointments(tenantId: string): Observable<OwnerAppointmentsResult> {
    if (environment.useMockBackend) {
      const rows = MOCK_APPOINTMENTS.map((a): OwnerAppointmentRow => {
        const advanceAmount =
          Math.round(a.serviceSnapshot.price * (MOCK_TENANT.settings.upfrontPercent / 100) * 100) / 100;
        const paidAmount = a.paymentStatus === 'approved' ? (a.paidAmount && a.paidAmount > 0 ? a.paidAmount : advanceAmount) : 0;
        return {
          appointment: a,
          advanceAmount,
          paidAmount,
          dueAmount: Math.round((a.serviceSnapshot.price - paidAmount) * 100) / 100,
          currency: a.serviceSnapshot.currency,
        };
      });
      return of({ tenant: MOCK_TENANT, rows });
    }
    return this.api.get<BackendOwnerAppointmentsResult>(`/owner/${tenantId}/appointments`, tenantId).pipe(
      map((r) => ({
        tenant: mapTenant(r.tenant),
        rows: r.rows.map((row) => ({
          appointment: mapAppointment(row.appointment),
          advanceAmount: row.advanceAmount,
          paidAmount: row.paidAmount,
          dueAmount: row.dueAmount,
          currency: row.currency,
        })),
      })),
    );
  }

  ownerSetAppointmentStatus(
    tenantId: string,
    appointmentId: string,
    status: 'completed' | 'no_show',
    version: number,
  ): Observable<OwnerAppointmentRow> {
    if (environment.useMockBackend) {
      const appt = MOCK_APPOINTMENTS.find((a) => a.id === appointmentId) ?? {
        ...MOCK_APPOINTMENTS[0],
        id: appointmentId,
      };
      const updated = { ...appt, status, version: version + 1 };
      const advanceAmount =
        Math.round(updated.serviceSnapshot.price * (MOCK_TENANT.settings.upfrontPercent / 100) * 100) / 100;
      const paidAmount = updated.paymentStatus === 'approved' ? (updated.paidAmount && updated.paidAmount > 0 ? updated.paidAmount : advanceAmount) : 0;
      return of({
        appointment: updated,
        advanceAmount,
        paidAmount,
        dueAmount: Math.round((updated.serviceSnapshot.price - paidAmount) * 100) / 100,
        currency: updated.serviceSnapshot.currency,
      });
    }
    return this.api
      .post<BackendOwnerAppointmentRow>(
        `/owner/${tenantId}/appointments/${appointmentId}/status`,
        { status, version },
        tenantId,
      )
      .pipe(
        map((row) => ({
          appointment: mapAppointment(row.appointment),
          advanceAmount: row.advanceAmount,
          paidAmount: row.paidAmount,
          dueAmount: row.dueAmount,
          currency: row.currency,
        })),
      );
  }

  cancelOwnerAppointment(
    tenantId: string,
    appointmentId: string,
    reason?: string,
  ): Observable<Appointment> {
    if (environment.useMockBackend) {
      const appt = MOCK_APPOINTMENTS.find((a) => a.id === appointmentId) ?? MOCK_APPOINTMENTS[0];
      return of({ ...appt, status: 'cancelled', version: (appt.version ?? 1) + 1 });
    }
    return this.api
      .post<BackendAppointment>(
        `/owner/${tenantId}/appointments/${appointmentId}/cancel`,
        reason ? { reason } : {},
        tenantId,
      )
      .pipe(map(mapAppointment));
  }

  ownerProfessionals(tenantId: string, serviceId?: string): Observable<Professional[]> {
    if (environment.useMockBackend) {
      return of(MOCK_PROFESSIONALS);
    }
    const qs = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : '';
    return this.api.get<Professional[]>(`/owner/${tenantId}/professionals${qs}`, tenantId);
  }

  updateProfessional(
    tenantId: string,
    professionalId: string,
    version: number,
    patch: Partial<Pick<Professional, 'name' | 'title' | 'avatarUrl' | 'serviceIds' | 'schedule'>>,
  ): Observable<Professional> {
    if (environment.useMockBackend) {
      return of({
        ...MOCK_PROFESSIONALS[0],
        version: version + 1,
        ...patch,
      } as Professional);
    }
    return this.api.patch<Professional>(
      `/owner/${tenantId}/professionals/${professionalId}`,
      { version, patch },
      tenantId,
    );
  }

  createService(
    tenantId: string,
    payload: {
      name: string;
      description?: string;
      price: number;
      durationMinutes: number;
      currency: string;
    },
  ): Observable<Service> {
    if (environment.useMockBackend) {
      const service: Service = {
        id: `svc_${Date.now()}`,
        tenantId,
        name: payload.name,
        description: payload.description,
        price: payload.price,
        currency: payload.currency as Service['currency'],
        durationMinutes: payload.durationMinutes,
        active: true,
        version: 1,
      };
      return of(service);
    }
    return this.api.post<Service>(`/owner/${tenantId}/services`, payload, tenantId);
  }

  clientAppointments(tenantId: string): Observable<Appointment[]> {
    if (environment.useMockBackend) {
      return of(MOCK_APPOINTMENTS);
    }
    return this.api
      .get<BackendAppointment[]>(`/client/${tenantId}/appointments`, tenantId)
      .pipe(map((list) => list.map(mapAppointment)));
  }

  professionalAgenda(tenantId: string, from: string, to: string): Observable<ProfessionalAgenda> {
    if (environment.useMockBackend) {
      return of({
        professionalId: MOCK_PROFESSIONALS[0].id,
        appointments: MOCK_APPOINTMENTS,
        blocks: [],
      });
    }
    return this.api
      .get<BackendAgenda>(
        `/professional/${tenantId}/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        tenantId,
      )
      .pipe(
        map((a) => ({
          professionalId: a.professionalId,
          appointments: a.appointments.map(mapAppointment),
          blocks: a.blocks,
        })),
      );
  }

  adminTenants(): Observable<AdminTenantRow[]> {
    if (environment.useMockBackend) {
      return of([
        {
          slug: 'barber-estilo',
          name: 'Barber Estilo',
          country: 'CO',
          plan: 'Básico',
          commission: 5,
          status: 'active',
        },
        {
          slug: 'clinica-vida',
          name: 'Clínica Vida',
          country: 'US',
          plan: 'Pro',
          commission: 3,
          status: 'active',
        },
      ]);
    }
    return this.api.get<AdminTenantRow[]>('/admin/tenants');
  }

  private mockOverview(): OwnerOverview {
    const movements = MOCK_APPOINTMENTS.filter((a) => a.paymentStatus === 'approved').map(
      (a, i): LedgerEntry => {
        const gross = a.serviceSnapshot.price * (MOCK_TENANT.settings.upfrontPercent / 100);
        const commission = Math.round(gross * a.commissionRateSnapshot * 100) / 100;
        const credit = Math.round((gross - commission) * 100) / 100;
        return {
          id: `led_${String(i).padStart(3, '0')}`,
          tenantId: a.tenantId,
          transactionId: `pay_${String(i).padStart(3, '0')}`,
          appointmentId: a.id,
          type: 'payment_approved',
          account: 'tenant_balance',
          direction: 'credit',
          amount: credit,
          currency: MOCK_TENANT.currency,
          commissionRateSnapshot: a.commissionRateSnapshot,
          status: 'posted',
          timestamp: a.startTime,
        };
      },
    );
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const confirmedToday = MOCK_APPOINTMENTS.filter(
      (a) => a.status === 'confirmed' && a.startTime >= dayStart.toISOString(),
    ).length;
    return {
      tenant: MOCK_TENANT,
      revenue: movements.reduce((sum, m) => sum + m.amount, 0),
      totalAppointments: MOCK_APPOINTMENTS.length,
      confirmedToday,
      occupancy: Math.min(
        100,
        Math.round(
          (MOCK_APPOINTMENTS.filter((a) => a.startTime >= dayStart.toISOString()).reduce(
            (s, a) => s + a.serviceSnapshot.durationMinutes,
            0,
          ) /
            (3 * 8 * 60)) *
            100,
        ),
      ),
      commission: movements.reduce(
        (s, m) => s + m.amount * ((m.commissionRateSnapshot ?? 0) / (1 - (m.commissionRateSnapshot ?? 0) || 1)),
        0,
      ),
      commissionRate: 0.05,
      upcoming: MOCK_APPOINTMENTS.filter((a) => a.status === 'confirmed').sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      ),
      movements,
      owner: { keycloakUserId: 'kc-owner-001', role: 'owner' },
    };
  }
}