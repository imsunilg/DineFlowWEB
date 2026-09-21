import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../core/api.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { Order, OrderSummary, Paged } from '../core/models';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

const STATUSES = ['Draft', 'Confirmed', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'];
const STATUS_STYLE: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700', Confirmed: 'bg-sky-100 text-sky-700', Preparing: 'bg-amber-100 text-amber-700', Ready: 'bg-emerald-100 text-emerald-700',
  Served: 'bg-teal-100 text-teal-700', Completed: 'bg-gray-800 text-white', Cancelled: 'bg-red-100 text-red-700',
};

@Component({
  selector: 'app-orders',
  imports: [DatePipe, RouterLink, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div><h1 class="text-2xl font-bold text-gray-900">Orders</h1><p class="text-sm text-gray-500">Every order, from the first tap to payment</p></div>

      <div class="card flex flex-wrap items-center gap-3 p-4">
        <div class="relative min-w-56 flex-1"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
          <input class="input pl-10" placeholder="Search by order number" aria-label="Search orders" (input)="search$.next($any($event.target).value)" /></div>
        <select class="input w-auto" aria-label="Filter by status" (change)="setStatus($any($event.target).value)">
          <option value="">All statuses</option>@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <select class="input w-auto" aria-label="Filter by type" (change)="setType($any($event.target).value)">
          <option value="">All types</option><option value="DineIn">Dine-in</option><option value="Takeaway">Takeaway</option><option value="Delivery">Delivery</option>
        </select>
      </div>

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (orders().length === 0) { <app-empty-state icon="receipt_long" title="No orders found" hint="Orders created in the POS will appear here." /> }
        @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Order</th><th class="px-5 py-3">Where</th><th class="px-5 py-3">Customer</th><th class="px-5 py-3">Status</th><th class="px-5 py-3 text-right">Items</th><th class="px-5 py-3 text-right">Total</th><th class="px-5 py-3">Created</th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (o of orders(); track o.id) {
                  <tr class="cursor-pointer hover:bg-gray-50/60" tabindex="0" (click)="open(o)" (keydown.enter)="open(o)">
                    <td class="px-5 py-3 font-semibold text-gray-900">{{ o.orderNo }}</td>
                    <td class="px-5 py-3 text-gray-600">{{ o.tableCode ? 'Table ' + o.tableCode : o.orderType }}</td>
                    <td class="px-5 py-3 text-gray-600">{{ o.customerName || '—' }}</td>
                    <td class="px-5 py-3"><span class="badge" [class]="style[o.status]">{{ o.status }}</span></td>
                    <td class="px-5 py-3 text-right">{{ o.itemCount }}</td>
                    <td class="px-5 py-3 text-right font-semibold">{{ branding.money(o.grandTotal) }}</td>
                    <td class="px-5 py-3 text-gray-500">{{ o.createdAt | date: 'short' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div>
        }
      </div>
    </div>

    <app-drawer [open]="detail() !== null" [title]="detail()?.orderNo ?? ''" (closed)="detail.set(null)">
      @if (detail(); as d) {
        <div class="space-y-5">
          <div class="flex items-center gap-2"><span class="badge" [class]="style[d.status]">{{ d.status }}</span><span class="text-sm text-gray-500">{{ d.tableCode ? 'Table ' + d.tableCode : d.orderType }}@if (d.customerName) { · {{ d.customerName }} }</span></div>
          <ul class="divide-y divide-gray-100 rounded-xl border border-gray-100">
            @for (l of d.lines; track l.id) {
              <li class="flex items-start justify-between gap-3 px-4 py-3 text-sm" [class.opacity-50]="l.status === 'Cancelled'">
                <div><p class="font-semibold text-gray-900">{{ l.quantity }} × {{ l.itemName }}@if (l.variantName) { <span class="font-normal text-gray-500"> ({{ l.variantName }})</span> }</p>
                  @if (l.notes) { <p class="text-xs italic text-amber-700">“{{ l.notes }}”</p> }<p class="text-xs text-gray-500">{{ l.status }} · {{ l.station }}</p></div>
                <span class="font-semibold">{{ branding.money(l.lineSubtotal) }}</span>
              </li>
            }
          </ul>
          <dl class="space-y-1 text-sm">
            <div class="flex justify-between text-gray-600"><dt>Subtotal</dt><dd>{{ branding.money(d.subtotal) }}</dd></div>
            @if (d.discountAmount > 0) { <div class="flex justify-between text-emerald-700"><dt>Discount{{ d.discountReason ? ' (' + d.discountReason + ')' : '' }}</dt><dd>-{{ branding.money(d.discountAmount) }}</dd></div> }
            <div class="flex justify-between text-gray-600"><dt>Tax</dt><dd>{{ branding.money(d.taxAmount) }}</dd></div>
            <div class="flex justify-between text-gray-600"><dt>Service charge</dt><dd>{{ branding.money(d.serviceChargeAmount) }}</dd></div>
            <div class="flex justify-between pt-2 text-lg font-bold text-gray-900"><dt>Total</dt><dd>{{ branding.money(d.grandTotal) }}</dd></div>
          </dl>
          @if (d.tableId && d.status !== 'Completed' && d.status !== 'Cancelled') { <a [routerLink]="['/pos']" [queryParams]="{ table: d.tableId }" class="btn-primary w-full">Open in POS</a> }
        </div>
      }
    </app-drawer>`,
})
export class OrdersComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly branding = inject(BrandingService);

  protected readonly statuses = STATUSES;
  protected readonly style = STATUS_STYLE;
  protected readonly search$ = new Subject<string>();
  protected readonly orders = signal<OrderSummary[]>([]);
  protected readonly detail = signal<Order | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  private search = ''; private status = ''; private type = '';

  constructor() { this.search$.pipe(debounceTime(300)).subscribe(s => { this.search = s; this.page.set(1); this.load(); }); }

  ngOnInit(): void { this.load(); }
  protected setStatus(v: string): void { this.status = v; this.page.set(1); this.load(); }
  protected setType(v: string): void { this.type = v; this.page.set(1); this.load(); }
  protected goTo(p: number): void { this.page.set(p); this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.api.get<Paged<OrderSummary>>('orders', { page: this.page(), pageSize: 15, search: this.search, status: this.status, orderType: this.type }).subscribe({
      next: r => { this.orders.set(r.items); this.totalPages.set(r.totalPages); this.total.set(r.totalCount); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected open(o: OrderSummary): void { this.api.get<Order>(`orders/${o.id}`).subscribe(d => this.detail.set(d)); }
}
