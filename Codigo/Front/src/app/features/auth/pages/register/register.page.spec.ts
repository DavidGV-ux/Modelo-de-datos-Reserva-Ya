import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { RegisterPage } from './register.page';

describe('RegisterPage — reanudación tras salir del registro', () => {
  it('EMAIL_TAKEN entra con las credenciales ya enviadas en vez de mostrar el error', async () => {
    const loginWithPassword = async (email: string, password: string) =>
      email === 'ana@test.com' && password === 'secreta123';
    const navigateByUrl = async () => true;
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideTranslateService({ lang: 'es', fallbackLang: 'es' }),
        { provide: AuthService, useValue: { loginWithPassword, login: () => undefined } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });

    const fixture = TestBed.createComponent(RegisterPage);
    const page = fixture.componentInstance as any;
    page.registerEmail.set('ana@test.com');
    page.registerPassword.set('secreta123');

    await page.onError('EMAIL_TAKEN');

    expect(page.step()).toBe('verified');
    expect(page.autoLoginFailed()).toBe(false);
    expect(page.registerPassword()).toBe('');
  });

  it('al volver de WhatsApp comprueba el estado sin esperar al siguiente intervalo', async () => {
    const navigateByUrl = async () => true;
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideTranslateService({ lang: 'es', fallbackLang: 'es' }),
        {
          provide: AuthService,
          useValue: {
            loginWithPassword: async () => true,
            login: () => undefined,
          },
        },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });

    const fixture = TestBed.createComponent(RegisterPage);
    const page = fixture.componentInstance as any;
    const http = TestBed.inject(HttpTestingController);
    page.verificationToken.set('p1');
    page.registerEmail.set('ana@test.com');
    page.registerPassword.set('secreta123');
    page.step.set('code');

    page.startVerificationPolling();
    http.match((req) => req.url.includes('verify-status')).forEach((req) =>
      req.flush({ completed: false, verified: false }),
    );

    document.dispatchEvent(new Event('visibilitychange'));

    const pending = http.match((req) => req.url.includes('verify-status'));
    expect(pending).toHaveLength(1);
    pending[0].flush({ completed: true, verified: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(page.step()).toBe('verified');
    page.stopVerificationPolling();
  });
});
