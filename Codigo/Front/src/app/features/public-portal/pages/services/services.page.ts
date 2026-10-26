import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectChange } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import { TenantService, tenantSlugFromSnapshot } from '../../services/tenant.service';
import { PortalDataService } from '../../services/portal-data.service';
import { Professional, Service } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-services-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatSelectModule,
    MatIconModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="services-page">
      <div class="services-page__head">
        <h1>{{ 'services.title' | translate }}</h1>
        <p>{{ 'services.subtitle' | translate }}</p>
      </div>

      <mat-form-field class="services-page__filter" appearance="outline">
        <mat-label>{{ 'booking.select_professional' | translate }}</mat-label>
        <mat-select
          [value]="selectedProfessional()"
          (selectionChange)="onProfessionalChange($event)"
        >
          <mat-option [value]="null">{{ 'booking.any_professional' | translate }}</mat-option>
          @for (professional of professionals(); track professional.id) {
            <mat-option [value]="professional.id">{{ professional.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div class="services-page__grid">
        @for (service of filteredServices(); track service.id) {
          <mat-card class="service">
            <div class="service__body">
              <h3>{{ service.name }}</h3>
              <p>{{ service.description }}</p>
            </div>
            <div class="service__meta">
              <span class="service__chip">
                <mat-icon>schedule</mat-icon>
                {{ service.durationMinutes }} {{ 'common.minutes' | translate }}
              </span>
              <span class="service__price">{{ service.price | appMoney: tenant()?.currency }}</span>
            </div>
            <mat-card-actions align="end">
              <a mat-flat-button [routerLink]="['/', tenant()?.slug, 'reservar']" [queryParams]="{ servicio: service.id }">
                {{ 'services.book' | translate }}
              </a>
            </mat-card-actions>
          </mat-card>
        } @empty {
          <p class="services-page__empty">{{ 'common.noAvailability' | translate }}</p>
        }
      </div>
    </div>
  `,
  styles: `
    .services-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 20px;
    }

    .services-page__head {
      text-align: center;
      margin-bottom: 32px;

      h1 {
        margin: 0;
        font-size: 38px;
        letter-spacing: -0.02em;
      }

      p {
        color: var(--mat-sys-on-surface-variant);
        margin: 8px 0 0;
      }
    }

    .services-page__filter {
      width: 300px;
      margin-bottom: 24px;
    }

    .services-page__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    .service {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
    }

    .service__body h3 {
      margin: 0 0 6px;
    }

    .service__body p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 14px;
    }

    .service__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
    }

    .service__chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .service__price {
      font-weight: 700;
      font-size: 18px;
    }

    .services-page__empty {
      grid-column: 1 / -1;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);
  private readonly data = inject(PortalDataService);

  protected readonly tenant = this.tenants.currentTenant;

  private readonly allServices = signal<Service[]>([]);
  private readonly pros = signal<Professional[]>([]);
  private readonly selectedFilter = signal<string | null>(null);

  protected readonly professionals = this.pros.asReadonly();
  protected readonly selectedProfessional = this.selectedFilter.asReadonly();
  protected readonly filteredServices = signal<Service[]>([]);

  ngOnInit(): void {
    const slug = tenantSlugFromSnapshot(this.route.snapshot);
    if (!slug) return;
    this.tenants.resolve(slug).subscribe((tenant) => {
      this.data.services(tenant.tenantId).subscribe((s) => {
        this.allServices.set(s);
        this.applyFilter();
      });
      this.data.professionals(tenant.tenantId).subscribe((p) => this.pros.set(p));
    });
  }

  applyFilter(): void {
    const filter = this.selectedFilter();
    if (!filter) {
      this.filteredServices.set(this.allServices());
      return;
    }
    const svcIds = new Set(
      this.pros().find((p) => p.id === filter)?.serviceIds ?? [],
    );
    this.filteredServices.set(this.allServices().filter((s) => svcIds.has(s.id)));
  }

  onProfessionalChange(event: MatSelectChange): void {
    this.selectedFilter.set(event.value);
    this.applyFilter();
  }
}