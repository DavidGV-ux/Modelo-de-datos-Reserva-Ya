import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { environment } from '../../../core/config/environment';

export const TENANT_CATEGORIES = [
  { id: 'beauty', icon: 'spa', labelKey: 'landing.category_beauty' },
  { id: 'health', icon: 'medical_services', labelKey: 'landing.category_health' },
  { id: 'pets', icon: 'pets', labelKey: 'landing.category_pets' },
  { id: 'food', icon: 'restaurant', labelKey: 'landing.category_food' },
  { id: 'bars_cafes', icon: 'local_cafe', labelKey: 'landing.category_bars_cafes' },
  { id: 'leisure', icon: 'theater_comedy', labelKey: 'landing.category_leisure' },
  { id: 'sports', icon: 'fitness_center', labelKey: 'landing.category_sports' },
  { id: 'education', icon: 'school', labelKey: 'landing.category_education' },
  { id: 'home', icon: 'home_repair_service', labelKey: 'landing.category_home' },
  { id: 'shopping', icon: 'storefront', labelKey: 'landing.category_shopping' },
  { id: 'events', icon: 'celebration', labelKey: 'landing.category_events' },
  { id: 'other', icon: 'more_horiz', labelKey: 'landing.category_other' },
] as const;

export type TenantCategoryId = (typeof TENANT_CATEGORIES)[number]['id'];

export interface PlatformTenant {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  country: string;
  city: string;
  currency: 'COP' | 'USD';
  category: TenantCategoryId;
  logoUrl?: string;
  coverUrl?: string;
  address?: string;
  servicesCount: number;
  professionalsCount: number;
}

export interface OnboardTenantResult {
  tenant: {
    slug: string;
    tenantId: string;
    name: string;
  };
  identity: { ownerRoleGranted: boolean };
  confirmation: { message: string; nextStep: string };
}

export interface UserProfile {
  phone: string;
  city: string;
  name?: string;
  email?: string;
  inviteSentAt?: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly api = inject(ApiService);

  directory(): Observable<PlatformTenant[]> {
    if (environment.useMockBackend) {
      return of([
        {
          slug: 'barber-estilo',
          name: 'Barber Estilo',
          tagline: 'Cortes de cabello y barba para caballeros.',
          description: 'Barbería con profesionales certificados.',
          country: 'CO',
          city: 'Bogotá',
          currency: 'COP',
          category: 'beauty',
          address: 'Calle 123 #45-67, Bogotá',
          servicesCount: 4,
          professionalsCount: 3,
        },
        {
          slug: 'clinica-vida',
          name: 'Clínica Vida',
          tagline: 'Salud y bienestar para toda la familia.',
          description: 'Consultas médicas y especialistas.',
          country: 'CO',
          city: 'Bogotá',
          currency: 'COP',
          category: 'health',
          address: 'Av. 68 #10-22, Bogotá',
          servicesCount: 0,
          professionalsCount: 0,
        },
      ]);
    }
    return this.api.get<PlatformTenant[]>('/public/tenants').pipe(
      map((list) =>
        [...list].sort(
          (a, b) =>
            b.servicesCount + b.professionalsCount - (a.servicesCount + a.professionalsCount),
        ),
      ),
    );
  }

  onboardTenant(payload: {
    slug: string;
    name: string;
    category?: TenantCategoryId;
    tagline?: string;
    description?: string;
    country?: string;
    currency?: 'COP' | 'USD';
    phone?: string;
    address?: string;
    settings?: {
      upfrontPercent?: number;
      cancellationToleranceHours?: number;
    };
  }): Observable<OnboardTenantResult> {
    if (environment.useMockBackend) {
      return of({
        tenant: { slug: payload.slug, tenantId: payload.slug, name: payload.name },
        identity: { ownerRoleGranted: true },
        confirmation: { message: 'ok', nextStep: '/app/owner' },
      });
    }
    return this.api.post<OnboardTenantResult>('/onboarding/tenants', payload);
  }

  inviteProfessional(
    tenantId: string,
    payload: {
      name: string;
      email: string;
      title?: string;
      serviceIds: string[];
      weeklySchedule?: Record<string, Array<{ start: string; end: string }>>;
    },
  ): Observable<{
    professional: { id: string; tenantId: string; name: string; keycloakUserId: string };
    linkedExistingAccount: boolean;
    temporaryPassword?: string;
  }> {
    if (environment.useMockBackend) {
      return of({
        professional: {
          id: `pr_${tenantId}_${payload.email.replace(/[^a-z0-9]/gi, '')}`,
          tenantId,
          name: payload.name,
          keycloakUserId: `kc_${payload.email.replace(/[^a-z0-9]/gi, '')}`,
        },
        linkedExistingAccount: false,
      });
    }
    return this.api.post(`/owner/${tenantId}/professionals/invite`, payload, tenantId);
  }

  /** Perfil complementario del usuario (teléfono + ciudad), usado por WhatsApp. */
  meProfile(): Observable<UserProfile | null> {
    if (environment.useMockBackend) return of(null);
    return this.api.get<{ profile: UserProfile | null }>('/me/profile').pipe(map((r) => r.profile ?? null));
  }

  saveMeProfile(payload: { phone: string; city: string }): Observable<UserProfile> {
    if (environment.useMockBackend) {
      return of({ phone: payload.phone, city: payload.city });
    }
    return this.api
      .put<{ profile: UserProfile }>('/me/profile', payload)
      .pipe(map((r) => r.profile));
  }
}