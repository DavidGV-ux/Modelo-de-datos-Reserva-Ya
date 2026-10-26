import { Routes } from '@angular/router';
import { requireRoles, requireAuth } from './core/auth/auth.guards';
import { USER_ROLES } from './core/auth/roles';
import { PublicLayout } from './layouts/public-layout/public-layout.component';
import { DashboardLayout } from './layouts/dashboard-layout/dashboard-layout.component';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layouts/platform-layout/platform-layout.component').then((m) => m.PlatformLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/platform/pages/landing/landing.page').then((m) => m.LandingPage),
      },
      {
        path: 'crear-negocio',
        loadComponent: () =>
          import('./features/platform/pages/business-setup/business-setup.page').then(
            (m) => m.BusinessSetupPage,
          ),
      },
      {
        path: 'privacidad',
        loadComponent: () =>
          import('./features/platform/pages/privacy-policy/privacy-policy.page').then(
            (m) => m.PrivacyPolicyPage,
          ),
      },
      {
        path: 'crear-cuenta',
        loadComponent: () =>
          import('./features/auth/pages/register/register.page').then((m) => m.RegisterPage),
      },
    ],
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./core/auth/auth-callback-page').then((m) => m.AuthCallbackPage),
  },
  {
    path: 'app',
    component: DashboardLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/platform/pages/app-landing/app-landing.page').then((m) => m.AppLandingPage),
      },
      {
        path: 'owner',
        canActivate: [requireRoles([USER_ROLES.OWNER])],
        loadComponent: () =>
          import('./features/owner/pages/overview/overview.page').then((m) => m.OwnerOverviewPage),
      },
      {
        path: 'owner/services',
        canActivate: [requireRoles([USER_ROLES.OWNER])],
        loadComponent: () =>
          import('./features/owner/pages/services-mgmt/services.page').then((m) => m.OwnerServicesPage),
      },
      {
        path: 'owner/professionals',
        canActivate: [requireRoles([USER_ROLES.OWNER])],
        loadComponent: () =>
          import('./features/owner/pages/professionals/professionals.page').then((m) => m.OwnerProfessionalsPage),
      },
      {
        path: 'owner/citas',
        canActivate: [requireRoles([USER_ROLES.OWNER])],
        loadComponent: () =>
          import('./features/owner/pages/appointments/appointments.page').then((m) => m.OwnerAppointmentsPage),
      },
      {
        path: 'owner/pagos',
        canActivate: [requireRoles([USER_ROLES.OWNER])],
        loadComponent: () =>
          import('./features/owner/pages/payments/payments.page').then((m) => m.OwnerPaymentsPage),
      },
      {
        path: 'owner/reports',
        canActivate: [requireRoles([USER_ROLES.OWNER])],
        loadComponent: () =>
          import('./features/owner/pages/overview/overview.page').then((m) => m.OwnerOverviewPage),
      },
      {
        path: 'professional',
        canActivate: [requireRoles([USER_ROLES.PROFESSIONAL])],
        loadComponent: () =>
          import('./features/professional/pages/my-schedule/my-schedule.page').then((m) => m.MySchedulePage),
      },
      {
        path: 'client',
        pathMatch: 'full',
        canActivate: [requireAuth()],
        loadComponent: () =>
          import('./features/client/pages/my-appointments/my-appointments.page').then(
            (m) => m.ClientMyAppointmentsPage,
          ),
      },
      {
        path: 'client/pagos',
        canActivate: [requireAuth()],
        loadComponent: () =>
          import('./features/client/pages/payments/payments.page').then(
            (m) => m.ClientPaymentsPage,
          ),
      },
      {
        path: 'reservas',
        canActivate: [requireRoles([USER_ROLES.CLIENT, USER_ROLES.PROFESSIONAL, USER_ROLES.OWNER, USER_ROLES.ADMIN])],
        loadComponent: () =>
          import('./features/client/pages/my-reservations/my-reservations.page').then(
            (m) => m.ClientMyReservationsPage,
          ),
      },
      {
        path: 'admin',
        canActivate: [requireRoles([USER_ROLES.ADMIN])],
        loadComponent: () =>
          import('./features/admin/pages/tenants/tenants.page').then((m) => m.AdminTenantsPage),
      },
    ],
  },
  {
    path: 'pagar/:tenantId/:appointmentId',
    loadComponent: () =>
      import('./features/public-portal/pages/pay/pay.page').then((m) => m.PayPage),
  },
  {
    path: ':tenantSlug',
    component: PublicLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/public-portal/pages/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'servicios',
        loadComponent: () =>
          import('./features/public-portal/pages/services/services.page').then((m) => m.ServicesPage),
      },
      {
        path: 'reservar',
        loadComponent: () =>
          import('./features/public-portal/pages/booking/booking.page').then((m) => m.BookingPage),
      },
      {
        path: 'confirmacion',
        loadComponent: () =>
          import('./features/public-portal/pages/confirmation/confirmation.page').then(
            (m) => m.ConfirmationPage,
          ),
      },
      {
        path: 'mi-historial',
        loadComponent: () =>
          import('./features/public-portal/pages/history/history.page').then((m) => m.HistoryPage),
      },
    ],
  },
  {
    path: 'not-found',
    loadComponent: () =>
      import('./shared/components/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
  {
    path: '**',
    redirectTo: '/',
  },
];