import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { ToastService } from '../core/toast.service';
import { ErrorStateComponent, SkeletonComponent } from '../shared/ui';

interface Tenant {
  id: string; tenantCode: string; tenantName: string; displayName: string; legalName: string | null; logoUrl: string | null; faviconUrl: string | null;
  primaryColor: string; secondaryColor: string; accentColor: string; currency: string; currencySymbol: string; country: string | null;
  timeZone: string; dateFormat: string; timeFormat: string; taxNumber: string | null; address: string | null; phone: string | null; email: string | null;
  website: string | null; receiptHeader: string | null; receiptFooter: string | null; features: Record<string, boolean>; isActive: boolean;
}

const FEATURE_LABELS: Record<string, string> = {
  barManagement: 'Bar management', restaurantManagement: 'Restaurant & POS', inventory: 'Inventory & purchasing', loyalty: 'Loyalty & offers',
  reservation: 'Reservations', staff: 'Staff', reports: 'Reports',
};
const TEXT_FIELDS: { key: string; label: string; type?: string; required?: boolean }[] = [
  { key: 'tenantName', label: 'Business name', required: true }, { key: 'displayName', label: 'Display name (shown in the app)', required: true },
  { key: 'legalName', label: 'Legal name' }, { key: 'taxNumber', label: 'Tax number' },
  { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'website', label: 'Website' }, { key: 'country', label: 'Country' },
  { key: 'address', label: 'Address' }, { key: 'logoUrl', label: 'Logo URL' }, { key: 'faviconUrl', label: 'Favicon URL' },
  { key: 'currency', label: 'Currency code', required: true }, { key: 'currencySymbol', label: 'Currency symbol', required: true },
  { key: 'timeZone', label: 'Time zone (IANA id)', required: true }, { key: 'dateFormat', label: 'Date format', required: true }, { key: 'timeFormat', label: 'Time format', required: true },
  { key: 'receiptHeader', label: 'Receipt header' }, { key: 'receiptFooter', label: 'Receipt footer' },
];

@Component({
  selector: 'app-tenant-settings',
  imports: [ReactiveFormsModule, SkeletonComponent, ErrorStateComponent],
  template: `
    <div class="mx-auto max-w-4xl space-y-6">
      <div><h1 class="text-2xl font-bold text-gray-900">Business settings</h1><p class="text-sm text-gray-500">Identity, branding, regional formats and enabled modules — applied everywhere instantly</p></div>
      @if (loading()) { <app-skeleton /> }
      @else if (error() && !tenant()) { <app-error-state [message]="error()" (retry)="load()" /> }
      @else if (tenant()) {
        <form class="space-y-6" [formGroup]="form" (ngSubmit)="save()">
          <section class="card space-y-4 p-5">
            <h2 class="text-base font-semibold text-gray-900">Branding</h2>
            <div class="grid gap-4 sm:grid-cols-3">
              @for (c of colors; track c.key) {
                <div><label class="label" [attr.for]="'t-' + c.key">{{ c.label }}</label>
                  <div class="flex items-center gap-2"><input [id]="'t-' + c.key" type="color" class="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" [formControlName]="c.key" /><span class="text-sm text-gray-500">{{ form.controls[c.key].value }}</span></div></div>
              }
            </div>
          </section>

          <section class="card p-5">
            <h2 class="mb-4 text-base font-semibold text-gray-900">Business details</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              @for (f of fields; track f.key) {
                <div><label class="label" [attr.for]="'t-' + f.key">{{ f.label }}</label><input [id]="'t-' + f.key" class="input" [type]="f.type ?? 'text'" [formControlName]="f.key" />
                  @if (form.controls[f.key].touched && form.controls[f.key].invalid) { <p class="field-error">{{ f.label }} is required.</p> }</div>
              }
            </div>
          </section>

          <section class="card p-5">
            <h2 class="mb-1 text-base font-semibold text-gray-900">Modules</h2><p class="mb-3 text-sm text-gray-500">Turn features off to hide them from menus and block access.</p>
            <div class="grid gap-2 sm:grid-cols-2">@for (k of featureKeys(); track k) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="features()[k]" [disabled]="!canUpdate()" (change)="setFeature(k, $any($event.target).checked)" />{{ featureLabel(k) }}</label> }</div>
          </section>

          @if (error()) { <p class="field-error">{{ error() }}</p> }
          @if (canUpdate()) { <div class="flex justify-end"><button type="submit" class="btn-primary" [disabled]="busy()">Save settings</button></div> }
        </form>
      }
    </div>`,
})
export class TenantSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly branding = inject(BrandingService);

  protected readonly fields = TEXT_FIELDS;
  protected readonly colors = [{ key: 'primaryColor', label: 'Primary' }, { key: 'secondaryColor', label: 'Secondary' }, { key: 'accentColor', label: 'Accent' }];
  protected readonly canUpdate = computed(() => this.auth.hasPermission('Tenant.Update'));
  protected readonly tenant = signal<Tenant | null>(null);
  protected readonly features = signal<Record<string, boolean>>({});
  protected readonly featureKeys = computed(() => Object.keys(this.features()));
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected form = new FormGroup<Record<string, FormControl>>({});

  ngOnInit(): void { this.load(); }

  protected featureLabel(k: string): string { return FEATURE_LABELS[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }
  protected setFeature(k: string, on: boolean): void { this.features.update(f => ({ ...f, [k]: on })); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.api.get<Tenant>('tenants/current').subscribe({
      next: t => {
        this.tenant.set(t); this.features.set({ ...t.features });
        const controls: Record<string, FormControl> = {};
        for (const k of [...this.colors.map(c => c.key), ...TEXT_FIELDS.map(f => f.key)]) {
          const required = TEXT_FIELDS.find(f => f.key === k)?.required;
          controls[k] = new FormControl({ value: (t as unknown as Record<string, string | null>)[k] ?? '', disabled: !this.canUpdate() }, { nonNullable: true, validators: required ? [Validators.required] : [] });
        }
        this.form = new FormGroup(controls);
        this.loading.set(false);
      },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected save(): void {
    const t = this.tenant();
    if (!t) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue() as Record<string, string>;
    const body: Record<string, unknown> = { features: this.features(), isActive: t.isActive };
    for (const [k, val] of Object.entries(v)) body[k] = val === '' ? null : val;
    this.busy.set(true); this.error.set('');
    this.api.put<Tenant>(`tenants/${t.id}`, body).subscribe({
      next: async () => { await this.branding.load(); this.busy.set(false); this.toast.success('Settings saved'); this.load(); },
      error: e => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }
}
