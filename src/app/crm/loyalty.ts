import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { LoyaltyAccount, LoyaltySettings, Paged, Tier } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ConfigCrudComponent, CrudSection } from '../shared/config-crud';
import { EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

const TIER_SECTIONS: CrudSection[] = [
  { key: 'tiers', label: 'Tiers', singular: 'tier', path: 'loyalty/tiers',
    cols: [{ key: 'name', label: 'Tier' }, { key: 'minLifetimePoints', label: 'Lifetime points needed' }, { key: 'earnMultiplier', label: 'Earn multiplier' }, { key: 'perks', label: 'Perks' }],
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'minLifetimePoints', label: 'Lifetime points needed', type: 'number' }, { key: 'earnMultiplier', label: 'Earn multiplier (1 = normal, 2 = double)', type: 'number', step: '0.1', required: true },
      { key: 'perks', label: 'Perks shown to staff', type: 'text' }, { key: 'sortOrder', label: 'Sort order', type: 'number' }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

/** Members, membership tiers and program rules. */
@Component({
  selector: 'app-loyalty',
  imports: [ReactiveFormsModule, DecimalPipe, ConfigCrudComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div><h1 class="text-2xl font-bold text-gray-900">Loyalty</h1><p class="text-sm text-gray-500">Points, tiers and rewards that bring guests back</p></div>
      <div class="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" class="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition" [class]="tab() === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'" (click)="setTab(t.key)">{{ t.label }}</button>
        }
      </div>

      @if (tab() === 'members') {
        <div class="grid gap-4 sm:grid-cols-3">
          @for (t of tiers(); track t.id) {
            <div class="card p-5"><p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t.name }}</p><p class="mt-1 text-2xl font-bold text-gray-900">{{ tierCount(t.id) }}</p><p class="text-xs text-gray-500">members on this page · {{ t.earnMultiplier }}× points</p></div>
          }
        </div>
        <div class="card p-4"><div class="relative"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
          <input class="input pl-10" placeholder="Search by name, phone or referral code" aria-label="Search members" (input)="search$.next($any($event.target).value)" /></div></div>
        <div class="card overflow-hidden">
          @if (loading()) { <div class="p-6"><app-skeleton /></div> }
          @else if (error()) { <app-error-state [message]="error()" (retry)="loadMembers()" /> }
          @else if (members().length === 0) { <app-empty-state icon="loyalty" title="No members yet" hint="Guests join automatically with their first billed order, or enrol them from their customer profile." /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Member</th><th class="px-5 py-3">Tier</th><th class="px-5 py-3 text-right">Balance</th><th class="px-5 py-3 text-right">Lifetime</th><th class="px-5 py-3">Referral code</th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (m of members(); track m.id) {
                  <tr>
                    <td class="px-5 py-3"><p class="font-semibold text-gray-900">{{ m.customerName }}</p><p class="text-xs text-gray-500">{{ m.phone || '—' }}</p></td>
                    <td class="px-5 py-3"><span class="badge bg-brand/10 text-brand">{{ m.tierName || '—' }}</span></td>
                    <td class="px-5 py-3 text-right font-semibold">{{ m.pointsBalance | number }}</td><td class="px-5 py-3 text-right text-gray-600">{{ m.lifetimePoints | number }}</td>
                    <td class="px-5 py-3 font-mono text-gray-600">{{ m.referralCode }}</td>
                  </tr>
                }
              </tbody>
            </table></div>
            <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div>
          }
        </div>
      }

      @if (tab() === 'tiers') { <app-config-crud title="Membership tiers" subtitle="Guests move up automatically as they earn lifetime points" [sections]="tierSections" [canManage]="canManage()" /> }

      @if (tab() === 'settings') {
        <form class="card max-w-2xl space-y-5 p-6" [formGroup]="form" (ngSubmit)="saveSettings()">
          <label class="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" formControlName="enabled" /> Loyalty program enabled</label>
          <div class="grid gap-4 sm:grid-cols-2">
            <div><label class="label" for="s1">Points earned per 1 spent</label><input id="s1" type="number" step="0.001" min="0" class="input" formControlName="pointsPerCurrency" /><p class="mt-1 text-xs text-gray-500">0.01 = 1 point for every 100 spent.</p></div>
            <div><label class="label" for="s2">Value of 1 point when redeemed</label><input id="s2" type="number" step="0.01" min="0" class="input" formControlName="redeemValuePerPoint" /></div>
            <div><label class="label" for="s3">Minimum points to redeem</label><input id="s3" type="number" min="0" class="input" formControlName="minRedeemPoints" /></div>
            <div><label class="label" for="s4">Max share of a bill payable in points (%)</label><input id="s4" type="number" min="0" max="100" class="input" formControlName="maxRedeemPercent" /></div>
            <div><label class="label" for="s5">Referral bonus (points, each side)</label><input id="s5" type="number" min="0" class="input" formControlName="referralBonusPoints" /></div>
          </div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
          @if (canManage()) { <button type="submit" class="btn-primary" [disabled]="busy()">Save settings</button> }
        </form>
      }
    </div>`,
})
export class LoyaltyComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly tierSections = TIER_SECTIONS;
  protected readonly tabs: { key: 'members' | 'tiers' | 'settings'; label: string }[] = [{ key: 'members', label: 'Members' }, { key: 'tiers', label: 'Tiers' }, { key: 'settings', label: 'Program rules' }];
  protected readonly tab = signal<'members' | 'tiers' | 'settings'>('members');
  protected readonly members = signal<LoyaltyAccount[]>([]);
  protected readonly tiers = signal<Tier[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly search$ = new Subject<string>();
  protected readonly canManage = computed(() => this.auth.hasPermission('Loyalty.Manage'));
  private search = '';

  protected readonly form = this.fb.nonNullable.group({
    enabled: [true], pointsPerCurrency: [0, [Validators.required, Validators.min(0)]], redeemValuePerPoint: [0, [Validators.required, Validators.min(0)]],
    minRedeemPoints: [0, Validators.min(0)], maxRedeemPercent: [0, [Validators.min(0), Validators.max(100)]], referralBonusPoints: [0, Validators.min(0)],
  });

  constructor() { this.search$.pipe(debounceTime(300)).subscribe(s => { this.search = s; this.page.set(1); this.loadMembers(); }); }

  ngOnInit(): void {
    this.api.get<Tier[]>('loyalty/tiers').subscribe(t => this.tiers.set(t.filter(x => x.isActive)));
    this.api.get<LoyaltySettings>('loyalty/settings').subscribe(s => this.form.reset(s));
    this.loadMembers();
  }

  protected setTab(t: 'members' | 'tiers' | 'settings'): void { this.tab.set(t); }
  protected goTo(p: number): void { this.page.set(p); this.loadMembers(); }
  protected tierCount(id: string): number { return this.members().filter(m => m.tierId === id).length; }

  protected loadMembers(): void {
    this.loading.set(true); this.error.set('');
    this.api.get<Paged<LoyaltyAccount>>('loyalty/accounts', { page: this.page(), pageSize: 15, search: this.search }).subscribe({
      next: r => { this.members.set(r.items); this.totalPages.set(r.totalPages); this.total.set(r.totalCount); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected saveSettings(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.busy.set(true); this.formError.set('');
    this.api.put<LoyaltySettings>('loyalty/settings', { ...v, pointsPerCurrency: Number(v.pointsPerCurrency), redeemValuePerPoint: Number(v.redeemValuePerPoint), minRedeemPoints: Number(v.minRedeemPoints), maxRedeemPercent: Number(v.maxRedeemPercent), referralBonusPoints: Number(v.referralBonusPoints) }).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Program rules saved'); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }
}
