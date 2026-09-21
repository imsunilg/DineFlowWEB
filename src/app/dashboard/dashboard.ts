import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { TableSummary } from '../core/models';
import { BarChartComponent, ChartPoint, DonutChartComponent } from '../shared/charts';
import { ErrorStateComponent, SkeletonComponent } from '../shared/ui';

interface Kpis {
  salesToday: number; ordersToday: number; customersToday: number; pendingOrders: number; expensesToday: number; purchasesToday: number;
  inventoryAlerts: number; barSalesToday: number; restaurantSalesToday: number;
}
interface Top { name: string; value: number; quantity: number }
interface LowStock { name: string; quantity: number; threshold: number; unit: string; source: string }
interface Dash {
  kpis: Kpis; dailySales: ChartPoint[]; weeklySales: ChartPoint[]; monthlySales: ChartPoint[]; barVsRestaurant: ChartPoint[]; paymentMix: ChartPoint[];
  topItems: Top[]; topCustomers: Top[]; lowStock: LowStock[];
}
type Range = 'daily' | 'weekly' | 'monthly';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, SkeletonComponent, ErrorStateComponent, BarChartComponent, DonutChartComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Welcome back, {{ firstName() }}</h1>
        <p class="text-sm text-gray-500">Live overview of {{ branding.displayName() }}</p>
      </div>

      @if (loading()) { <app-skeleton [count]="4" /> }
      @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
      @else if (dash(); as d) {
        <section class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key figures">
          @for (k of tiles(d.kpis); track k.label) {
            <div class="card p-4"><p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ k.label }}</p><p class="mt-1 text-2xl font-bold text-gray-900">{{ k.value }}</p>@if (k.hint) { <p class="text-xs text-gray-500">{{ k.hint }}</p> }</div>
          }
        </section>

        <section class="grid gap-4 lg:grid-cols-3">
          <div class="card p-5 lg:col-span-2">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-base font-semibold text-gray-900">Sales</h2>
              <div class="flex gap-1 rounded-lg bg-gray-100 p-1" role="tablist">
                @for (r of ranges; track r.key) { <button type="button" role="tab" [attr.aria-selected]="range() === r.key" class="rounded-md px-3 py-1 text-xs font-semibold" [class]="range() === r.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'" (click)="range.set(r.key)">{{ r.label }}</button> }
              </div>
            </div>
            <app-bar-chart [data]="series()" [label]="'Sales, ' + range()" />
          </div>
          <div class="card p-5">
            <h2 class="mb-3 text-base font-semibold text-gray-900">Bar vs restaurant (30 days)</h2>
            <app-donut-chart [data]="d.barVsRestaurant" label="Bar versus restaurant sales" />
            <h2 class="mb-3 mt-6 text-base font-semibold text-gray-900">Payment mix (30 days)</h2>
            <app-donut-chart [data]="d.paymentMix" label="Payment method mix" />
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-3">
          <div class="card p-5"><h2 class="mb-3 text-base font-semibold text-gray-900">Top items</h2>
            <ol class="space-y-2 text-sm">@for (t of d.topItems; track t.name; let i = $index) { <li class="flex items-center gap-3"><span class="w-5 text-gray-400">{{ i + 1 }}</span><span class="flex-1 truncate text-gray-800">{{ t.name }}</span><span class="text-gray-500">{{ t.quantity }} sold</span><span class="w-24 text-right font-semibold">{{ branding.money(t.value) }}</span></li> } @empty { <li class="text-gray-500">No sales yet</li> }</ol></div>
          <div class="card p-5"><h2 class="mb-3 text-base font-semibold text-gray-900">Top customers</h2>
            <ol class="space-y-2 text-sm">@for (t of d.topCustomers; track t.name; let i = $index) { <li class="flex items-center gap-3"><span class="w-5 text-gray-400">{{ i + 1 }}</span><span class="flex-1 truncate text-gray-800">{{ t.name }}</span><span class="text-gray-500">{{ t.quantity }} visits</span><span class="w-24 text-right font-semibold">{{ branding.money(t.value) }}</span></li> } @empty { <li class="text-gray-500">No customer sales yet</li> }</ol></div>
          <div class="card p-5"><div class="mb-3 flex items-center justify-between"><h2 class="text-base font-semibold text-gray-900">Low stock</h2><a routerLink="/inventory/stock" class="text-xs font-semibold text-brand hover:underline">Open stock</a></div>
            <ul class="space-y-2 text-sm">@for (l of d.lowStock; track l.name + l.source) { <li class="flex items-center gap-2"><span class="mi text-base text-amber-500">warning</span><span class="flex-1 truncate text-gray-800">{{ l.name }}</span><span class="text-gray-500">{{ l.quantity }} {{ l.unit }}</span></li> } @empty { <li class="text-gray-500">Everything is stocked</li> }</ul></div>
        </section>
      }

      @if (summary(); as s) {
        <section class="card p-6">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Table availability</h2>
            <a routerLink="/tables" class="text-sm font-semibold text-brand hover:underline">Open floor plan</a>
          </div>
          <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
            @for (t of tableTiles(s); track t.label) {
              <div class="rounded-2xl p-4" [class]="t.bg"><p class="text-3xl font-bold" [class]="t.fg">{{ t.value }}</p><p class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t.label }}</p></div>
            }
          </div>
          @if (s.total > 0) {
            <div class="mt-5 flex h-2.5 overflow-hidden rounded-full bg-gray-100" role="img" [attr.aria-label]="s.occupied + ' of ' + s.total + ' tables occupied'">
              <div class="bg-rose-500" [style.width.%]="pct(s.occupied, s.total)"></div><div class="bg-amber-400" [style.width.%]="pct(s.reserved, s.total)"></div><div class="bg-sky-400" [style.width.%]="pct(s.cleaning, s.total)"></div>
            </div>
          }
        </section>
      }
    </div>`,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly branding = inject(BrandingService);

  protected readonly ranges: { key: Range; label: string }[] = [{ key: 'daily', label: '14 days' }, { key: 'weekly', label: '8 weeks' }, { key: 'monthly', label: '12 months' }];
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly dash = signal<Dash | null>(null);
  protected readonly summary = signal<TableSummary | null>(null);
  protected readonly range = signal<Range>('daily');
  protected readonly firstName = computed(() => (this.auth.user()?.fullName ?? '').split(' ')[0] || 'there');
  protected readonly series = computed(() => {
    const d = this.dash();
    return !d ? [] : this.range() === 'daily' ? d.dailySales : this.range() === 'weekly' ? d.weeklySales : d.monthlySales;
  });

  ngOnInit(): void { this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    forkJoin({
      dash: this.api.get<Dash>('reports/dashboard'),
      tables: this.auth.hasPermission('Table.View') ? this.api.get<TableSummary>('tables/summary').pipe(catchError(() => of(null))) : of(null),
    }).subscribe({
      next: r => { this.dash.set(r.dash); this.summary.set(r.tables); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected tiles(k: Kpis): { label: string; value: string; hint?: string }[] {
    const m = (v: number) => this.branding.money(v);
    return [
      { label: 'Sales today', value: m(k.salesToday), hint: `Before tax: Bar ${m(k.barSalesToday)} · Restaurant ${m(k.restaurantSalesToday)}` },
      { label: 'Orders today', value: String(k.ordersToday), hint: `${k.pendingOrders} in progress` },
      { label: 'Customers today', value: String(k.customersToday) },
      { label: 'Stock alerts', value: String(k.inventoryAlerts) },
      { label: 'Expenses today', value: m(k.expensesToday) },
      { label: 'Purchases today', value: m(k.purchasesToday) },
    ];
  }

  protected tableTiles(s: TableSummary): { label: string; value: number; bg: string; fg: string }[] {
    return [
      { label: 'Available', value: s.available, bg: 'bg-emerald-50', fg: 'text-emerald-700' }, { label: 'Occupied', value: s.occupied, bg: 'bg-rose-50', fg: 'text-rose-700' },
      { label: 'Reserved', value: s.reserved, bg: 'bg-amber-50', fg: 'text-amber-700' }, { label: 'Cleaning', value: s.cleaning, bg: 'bg-sky-50', fg: 'text-sky-700' },
      { label: 'Blocked', value: s.blocked, bg: 'bg-gray-100', fg: 'text-gray-700' },
    ];
  }

  protected pct(n: number, total: number): number { return total ? (n / total) * 100 : 0; }
}
