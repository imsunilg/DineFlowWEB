import { Injectable } from '@angular/core';

export interface DemoUser { label: string; loginId: string; password: string }
export interface AppConfig {
  apiBaseUrl: string;
  defaultTenantCode: string;
  features?: { demoLogin?: boolean };
  demoUsers?: DemoUser[];
}

/** Runtime configuration loaded from /config.json so the same build can be deployed anywhere. */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private config: AppConfig = { apiBaseUrl: '/api/v1', defaultTenantCode: '' };

  async load(): Promise<void> {
    try {
      const res = await fetch('/config.json', { cache: 'no-store' });
      if (res.ok) this.config = { ...this.config, ...(await res.json()) };
    } catch { /* fall back to defaults */ }
  }

  get apiBaseUrl(): string { return this.config.apiBaseUrl; }
  get defaultTenantCode(): string { return this.config.defaultTenantCode; }
  /** Demo Login is a development/demo convenience; the runtime config for any real deployment must set this false. */
  get demoLoginEnabled(): boolean { return this.config.features?.demoLogin === true; }
  get demoUsers(): DemoUser[] { return this.config.demoUsers ?? []; }
}
