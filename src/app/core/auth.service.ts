import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { AppConfigService } from './app-config.service';
import { ApiResponse, AuthResponse, UserProfile } from './models';

const STORAGE_KEY = 'auth.session';

interface Session { accessToken: string; refreshToken: string; user: UserProfile }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly router = inject(Router);

  private readonly session = signal<Session | null>(this.read());
  private refreshing$: Observable<string> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);

  login(email: string, password: string, tenantCode?: string): Observable<UserProfile> {
    return this.http.post<ApiResponse<AuthResponse>>(`${this.config.apiBaseUrl}/auth/login`, { email, password, tenantCode: tenantCode || null })
      .pipe(map(r => r.data), tap(d => this.store(d)), map(d => d.user));
  }

  /** Single-flight refresh: concurrent 401s share one refresh request. */
  refresh(): Observable<string> {
    const current = this.session();
    if (!current) return throwError(() => new Error('No session'));
    if (!this.refreshing$) {
      this.refreshing$ = this.http.post<ApiResponse<AuthResponse>>(`${this.config.apiBaseUrl}/auth/refresh`, { refreshToken: current.refreshToken }).pipe(
        map(r => r.data),
        tap(d => this.store(d)),
        map(d => d.accessToken),
        catchError(err => { this.clear(); return throwError(() => err); }),
        finalize(() => (this.refreshing$ = null)),
        shareReplay(1));
    }
    return this.refreshing$;
  }

  logout(): void {
    const current = this.session();
    if (current) {
      this.http.post(`${this.config.apiBaseUrl}/auth/logout`, { refreshToken: current.refreshToken }).pipe(catchError(() => [])).subscribe();
    }
    this.clear();
    this.router.navigate(['/login']);
  }

  expire(): void {
    this.clear();
    this.router.navigate(['/login']);
  }

  hasPermission(permission: string): boolean {
    return this.session()?.user.permissions.includes(permission) ?? false;
  }

  hasAnyRole(...roles: string[]): boolean {
    const mine = this.session()?.user.roles ?? [];
    return roles.some(r => mine.includes(r));
  }

  private store(d: AuthResponse): void {
    const s: Session = { accessToken: d.accessToken, refreshToken: d.refreshToken, user: d.user };
    this.session.set(s);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
  }

  private clear(): void {
    this.session.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  }

  private read(): Session | null {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { return null; }
  }
}
