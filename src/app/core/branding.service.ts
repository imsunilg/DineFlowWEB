import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from './app-config.service';
import { AuthService } from './auth.service';
import { ApiResponse, Branding } from './models';

/** Single source of truth for tenant identity: name, logo, colours, currency, features. Nothing else hard-codes these. */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  readonly branding = signal<Branding | null>(null);
  readonly name = computed(() => this.branding()?.applicationName ?? '');
  readonly displayName = computed(() => this.branding()?.displayName ?? '');
  readonly currencySymbol = computed(() => this.branding()?.currencySymbol ?? '');

  async load(): Promise<void> {
    const tenantCode = this.auth.user()?.tenantCode ?? this.config.defaultTenantCode;
    try {
      const res = await firstValueFrom(this.http.get<ApiResponse<Branding>>(`${this.config.apiBaseUrl}/config/branding`, { params: tenantCode ? { tenantCode } : {} }));
      this.apply(res.data);
    } catch {
      document.title = 'Sign in';
    }
  }

  isEnabled(feature: string | undefined): boolean {
    if (!feature) return true;
    return this.branding()?.features[feature] !== false;
  }

  money(value: number): string {
    const symbol = this.branding()?.currencySymbol ?? '';
    const amount = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${value < 0 ? '-' : ''}${symbol}${amount}`;
  }

  private apply(b: Branding): void {
    this.branding.set(b);
    const root = document.documentElement.style;
    root.setProperty('--brand-primary', b.primaryColor);
    root.setProperty('--brand-secondary', b.secondaryColor);
    root.setProperty('--brand-accent', b.accentColor);
    document.title = b.displayName;
    const icon = document.getElementById('app-favicon') as HTMLLinkElement | null;
    if (icon && b.faviconUrl) icon.href = b.faviconUrl;
  }
}
