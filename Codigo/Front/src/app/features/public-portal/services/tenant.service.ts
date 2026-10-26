import { Injectable, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot } from '@angular/router';
import { map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../core/config/environment';
import { ApiService } from '../../../core/http/api.service';
import { BackendTenant, mapTenant } from '../../../core/http/api-mappers';
import { MOCK_TENANT } from '../../../shared/mocks/tenant.mock';
import { Tenant } from '../../../shared/models/domain.model';

export function tenantSlugFromSnapshot(snapshot: ActivatedRouteSnapshot): string | null {
  let node: ActivatedRouteSnapshot | null = snapshot;
  while (node) {
    const slug = node.paramMap.get('tenantSlug');
    if (slug) return slug;
    node = node.parent;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly api = inject(ApiService);
  private readonly tenant = signal<Tenant | null>(null);

  readonly currentTenant = this.tenant.asReadonly();

  resolve(slug: string): Observable<Tenant> {
    if (environment.useMockBackend) {
      const resolved: Tenant =
        slug === MOCK_TENANT.slug
          ? MOCK_TENANT
          : { ...MOCK_TENANT, slug, name: MOCK_TENANT.name };
      return of(resolved).pipe(tap((t) => this.tenant.set(t)));
    }
    return this.api.get<BackendTenant>(`/public/tenants/${encodeURIComponent(slug)}`).pipe(
      map(mapTenant),
      tap((t) => this.tenant.set(t)),
    );
  }
}