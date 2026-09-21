import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { Customer, MenuItem, Paged, TableSummary } from '../core/models';
import { SkeletonComponent } from '../shared/ui';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Welcome back, {{ firstName() }}</h1>
        <p class="text-sm text-gray-500">Live overview of {{ branding.displayName() }}</p>
      </div>

      @if (loading()) { <app-skeleton [count]="3" /> } @else {
        @if (summary(); as s) {
          <section class="card p-6">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-base font-semibold text-gray-900">Table availability</h2>
              <a routerLink="/tables" class="text-sm font-semibold text-brand hover:underline">Open floor plan</a>
            </div>
            <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
              @for (t of tiles(s); track t.label) {
                <div class="rounded-2xl p-4" [class]="t.bg">
                  <p class="text-3xl font-bold" [class]="t.fg">{{ t.value }}</p>
                  <p class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t.label }}</p>
                </div>
              }
            </div>
            @if (s.total > 0) {
              <div class="mt-5 flex h-2.5 overflow-hidden rounded-full bg-gray-100" role="img" [attr.aria-label]="s.occupied + ' of ' + s.total + ' tables occupied'">
                <div class="bg-rose-500" [style.width.%]="pct(s.occupied, s.total)"></div>
                <div class="bg-amber-400" [style.width.%]="pct(s.reserved, s.total)"></div>
                <div class="bg-sky-400" [style.width.%]="pct(s.cleaning, s.total)"></div>
              </div>
            }
          </section>
        }
        <section class="grid gap-4 md:grid-cols-2">
          @if (itemCount() !== null) {
            <a routerLink="/menu" class="card flex items-center gap-4 p-6 hover:shadow-md">
              <span class="mi grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand">restaurant_menu</span>
              <div><p class="text-2xl font-bold">{{ itemCount() }}</p><p class="text-sm text-gray-500">Menu items</p></div>
            </a>
          }
          @if (customerCount() !== null) {
            <a routerLink="/customers" class="card flex items-center gap-4 p-6 hover:shadow-md">
              <span class="mi grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-accent">groups</span>
              <div><p class="text-2xl font-bold">{{ customerCount() }}</p><p class="text-sm text-gray-500">Customers</p></div>
            </a>
          }
        </section>
      }
    </div>`,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly branding = inject(BrandingService);

  protected readonly loading = signal(true);
  protected readonly summary = signal<TableSummary | null>(null);
  protected readonly itemCount = signal<number | null>(null);
  protected readonly customerCount = signal<number | null>(null);

  protected firstName(): string { return (this.auth.user()?.fullName ?? '').split(' ')[0]; }
  protected pct(n: number, total: number): number { return total ? (n / total) * 100 : 0; }

  protected tiles(s: TableSummary) {
    return [
      { label: 'Available', value: s.available, bg: 'bg-emerald-50', fg: 'text-emerald-700' },
      { label: 'Occupied', value: s.occupied, bg: 'bg-rose-50', fg: 'text-rose-700' },
      { label: 'Reserved', value: s.reserved, bg: 'bg-amber-50', fg: 'text-amber-700' },
      { label: 'Cleaning', value: s.cleaning, bg: 'bg-sky-50', fg: 'text-sky-700' },
      { label: 'Blocked', value: s.blocked, bg: 'bg-gray-100', fg: 'text-gray-700' },
    ];
  }

  ngOnInit(): void {
    const can = (p: string) => this.auth.hasPermission(p);
    forkJoin({
      summary: can('Table.View') ? this.api.get<TableSummary>('tables/summary') : of(null),
      items: can('Menu.View') ? this.api.get<Paged<MenuItem>>('menu/items', { pageSize: 1 }) : of(null),
      customers: can('Customer.View') ? this.api.get<Paged<Customer>>('customers', { pageSize: 1 }) : of(null),
    }).subscribe({
      next: r => {
        this.summary.set(r.summary);
        this.itemCount.set(r.items?.totalCount ?? null);
        this.customerCount.set(r.customers?.totalCount ?? null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
