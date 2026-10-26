import { Injectable, inject } from '@angular/core';
import { of, Observable } from 'rxjs';
import { environment } from '../../../core/config/environment';
import { ApiService } from '../../../core/http/api.service';
import { MOCK_PROFESSIONALS, MOCK_SERVICES } from '../../../shared/mocks/tenant.mock';
import { Professional, Service } from '../../../shared/models/domain.model';

@Injectable({ providedIn: 'root' })
export class PortalDataService {
  private readonly api = inject(ApiService);

  services(tenantId: string): Observable<Service[]> {
    if (environment.useMockBackend) {
      return of(MOCK_SERVICES.filter((s) => s.tenantId === tenantId && s.active));
    }
    return this.api.get<Service[]>(`/public/${tenantId}/services`);
  }

  professionals(tenantId: string): Observable<Professional[]> {
    if (environment.useMockBackend) {
      return of(MOCK_PROFESSIONALS.filter((p) => p.tenantId === tenantId && p.active));
    }
    return this.api.get<Professional[]>(`/public/${tenantId}/professionals`);
  }

  professionalsForService(tenantId: string, serviceId: string): Observable<Professional[]> {
    if (environment.useMockBackend) {
      return of(
        MOCK_PROFESSIONALS.filter(
          (p) => p.tenantId === tenantId && p.active && p.serviceIds.includes(serviceId),
        ),
      );
    }
    return this.api.get<Professional[]>(
      `/public/${tenantId}/professionals?serviceId=${encodeURIComponent(serviceId)}`,
    );
  }
}