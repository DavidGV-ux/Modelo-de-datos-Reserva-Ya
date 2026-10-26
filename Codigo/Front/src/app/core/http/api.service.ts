import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../config/environment';
import { LanguageService } from '../i18n/language.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);

  static readonly TENANT_HEADER = 'x-tenant-id';
  static readonly LANGUAGE_HEADER = 'Accept-Language';
  static readonly ACCESS_TOKEN_KEY = 'access_token';

  private defaultHeaders(tenantId?: string): HttpHeaders {
    let headers = new HttpHeaders().set(
      ApiService.LANGUAGE_HEADER,
      this.language.currentLanguage(),
    );
    if (tenantId) {
      headers = headers.set(ApiService.TENANT_HEADER, tenantId);
    }
    const token = this.bearerToken();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private bearerToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(ApiService.ACCESS_TOKEN_KEY);
  }

  get<T>(path: string, tenantId?: string): Observable<T> {
    return this.http.get<T>(`${environment.apiBaseUrl}${path}`, {
      headers: this.defaultHeaders(tenantId),
    });
  }

  post<T>(path: string, body: unknown, tenantId?: string): Observable<T> {
    return this.http.post<T>(`${environment.apiBaseUrl}${path}`, body, {
      headers: this.defaultHeaders(tenantId),
    });
  }

  put<T>(path: string, body: unknown, tenantId?: string): Observable<T> {
    return this.http.put<T>(`${environment.apiBaseUrl}${path}`, body, {
      headers: this.defaultHeaders(tenantId),
    });
  }

  patch<T>(path: string, body: unknown, tenantId?: string): Observable<T> {
    return this.http.patch<T>(`${environment.apiBaseUrl}${path}`, body, {
      headers: this.defaultHeaders(tenantId),
    });
  }

  delete<T>(path: string, tenantId?: string): Observable<T> {
    return this.http.delete<T>(`${environment.apiBaseUrl}${path}`, {
      headers: this.defaultHeaders(tenantId),
    });
  }
}