import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
});
