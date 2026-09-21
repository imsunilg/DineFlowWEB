import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { InvStockRow, InvTxn, Paged, StockAlert, Warehouse } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

const LEVEL_STYLE: Record<string, string> = { OK: 'bg-emerald-50 text-emerald-700', Low: 'bg-amber-100 text-amber-800', Out: 'bg-red-100 text-red-700', Over: 'bg-sky-100 text-sky-700' };
const TYPE_STYLE: Record<string, string> = {
  Opening: 'bg-sky-100 text-sky-700', Purchase: 'bg-emerald-100 text-emerald-700', Sale: 'bg-violet-100 text-violet-700', TransferIn: 'bg-teal-100 text-teal-700', TransferOut: 'bg-teal-100 text-teal-700',
  Adjustment: 'bg-amber-100 text-amber-700', Wastage: 'bg-orange-100 text-orange-700', Breakage: 'bg-red-100 text-red-700', Return: 'bg-gray-100 text-gray-700', PurchaseReturn: 'bg-rose-100 text-rose-700',
};

/** Warehouse stock levels with low-stock alerts, movement drawer, transfers and the movement ledger. */
@Component({
  selector: 'app-inventory-stock',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">{{ tab() === 'stock' ? 'Stock' : 'Stock adjustments' }}</h1><p class="text-sm text-gray-500">Quantities per warehouse, with every movement on record</p></div>
        <div class="flex flex-wrap items-center gap-2">
          <select class="input w-auto" aria-label="Warehouse" (change)="setWarehouse($any($event.target).value)">
            @for (w of warehouses(); track w.id) { <option [value]="w.id" [selected]="w.id === warehouseId()">{{ w.name }}{{ w.isDefault ? ' (default)' : '' }}</option> }
          </select>
          @if (canAdjust()) { <button type="button" class="btn-ghost" (click)="openTransfer()"><span class="mi">swap_horiz</span>Transfer</button> }
        </div>
      </div>

      @if (alerts().length > 0) {
        <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
          <span class="mi text-amber-600">warning</span>
          <div class="min-w-0 flex-1 text-sm text-amber-900"><p class="font-semibold">{{ alerts().length }} item{{ alerts().length > 1 ? 's' : '' }} need restocking</p>
            <p class="truncate text-amber-800">{{ alertNames() }}</p></div>
          <button type="button" class="btn-ghost" (click)="setLevel('Low')">Show low stock</button>
        </div>
      }

      <div class="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" class="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition" [class]="tab() === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'" (click)="setTab(t.key)">{{ t.label }}</button>
        }
      </div>

      @if (tab() === 'stock') {
        <div class="card flex flex-wrap items-center gap-3 p-4">
          <div class="relative min-w-52 flex-1"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
            <input class="input pl-10" placeholder="Search items" aria-label="Search items" (input)="search$.next($any($event.target).value)" /></div>
          <select class="input w-auto" aria-label="Filter by level" (change)="setLevel($any($event.target).value)">
            <option value="" [selected]="level() === ''">All levels</option><option value="Low" [selected]="level() === 'Low'">Low</option><option value="Out" [selected]="level() === 'Out'">Out of stock</option><option value="OK" [selected]="level() === 'OK'">OK</option><option value="Over" [selected]="level() === 'Over'">Over max</option>
          </select>
          <p class="ml-auto text-sm text-gray-500">Stock value <span class="font-semibold text-gray-900">{{ branding.money(pageValue()) }}</span></p>
        </div>
        <div class="card overflow-hidden">
          @if (loading()) { <div class="p-6"><app-skeleton /></div> }
          @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
          @else if (rows().length === 0) { <app-empty-state icon="inventory_2" title="No items match" hint="Add items under Inventory → Items & setup." /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Item</th><th class="px-5 py-3">Category</th><th class="px-5 py-3 text-right">On hand</th><th class="px-5 py-3 text-right">Reorder at</th><th class="px-5 py-3 text-right">Value</th><th class="px-5 py-3">Level</th><th class="px-5 py-3"></th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of rows(); track r.itemId) {
                  <tr class="hover:bg-gray-50/60">
                    <td class="px-5 py-3"><p class="font-semibold text-gray-900">{{ r.name }}</p><p class="text-xs text-gray-500">{{ r.code }}</p></td>
                    <td class="px-5 py-3 text-gray-600">{{ r.categoryName || '—' }}</td>
                    <td class="px-5 py-3 text-right font-semibold">{{ r.quantity | number: '1.0-3' }} <span class="font-normal text-gray-500">{{ r.unitCode }}</span></td>
                    <td class="px-5 py-3 text-right text-gray-600">{{ r.reorderLevel > 0 ? (r.reorderLevel | number: '1.0-3') : '—' }}</td>
                    <td class="px-5 py-3 text-right text-gray-600">{{ branding.money(r.stockValue) }}</td>
                    <td class="px-5 py-3"><span class="badge" [class]="levelStyle[r.level]">{{ r.level === 'Out' ? 'Out of stock' : r.level }}</span></td>
                    <td class="px-5 py-3 text-right">@if (canAdjust()) { <button type="button" class="text-sm font-semibold text-brand hover:underline" (click)="openMove(r)">Record movement</button> }</td>
                  </tr>
                }
              </tbody>
            </table></div>
            <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div>
          }
        </div>
      } @else {
        <div class="card overflow-hidden">
          @if (loading()) { <div class="p-6"><app-skeleton /></div> }
          @else if (txns().length === 0) { <app-empty-state icon="history" title="No movements yet" /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">When</th><th class="px-5 py-3">Item</th><th class="px-5 py-3">Warehouse</th><th class="px-5 py-3">Type</th><th class="px-5 py-3 text-right">Quantity</th><th class="px-5 py-3 text-right">Balance</th><th class="px-5 py-3">Note</th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (t of txns(); track t.id) {
                  <tr>
                    <td class="px-5 py-3 text-gray-500">{{ t.createdAt | date: 'short' }}</td><td class="px-5 py-3 font-semibold text-gray-900">{{ t.itemName }}</td><td class="px-5 py-3 text-gray-600">{{ t.warehouseName }}</td>
                    <td class="px-5 py-3"><span class="badge" [class]="typeStyle[t.type]">{{ t.type }}</span></td>
                    <td class="px-5 py-3 text-right font-semibold" [class]="t.quantity < 0 ? 'text-red-600' : 'text-emerald-600'">{{ t.quantity > 0 ? '+' : '' }}{{ t.quantity | number: '1.0-3' }} {{ t.unitCode }}</td>
                    <td class="px-5 py-3 text-right text-gray-600">{{ t.balanceAfter | number: '1.0-3' }}</td><td class="px-5 py-3 text-gray-500">{{ t.notes }}</td>
                  </tr>
                }
              </tbody>
            </table></div>
            <div class="px-5 pb-4"><app-pager [page]="txnPage()" [totalPages]="txnPages()" [total]="txnTotal()" (changed)="goTxn($event)" /></div>
          }
        </div>
      }
    </div>

    <app-drawer [open]="moveOpen()" [title]="'Stock movement' + (moveRow() ? ' · ' + moveRow()!.name : '')" (closed)="moveOpen.set(false)">
      @if (moveOpen()) {
        <form id="invMove" class="space-y-4" [formGroup]="moveForm" (ngSubmit)="saveMove()">
          <div><label class="label" for="imt">Movement</label>
            <select id="imt" class="input" formControlName="type"><option value="Purchase">Purchase (stock received)</option><option value="Opening">Opening stock</option><option value="Wastage">Wastage / spoilage</option><option value="Breakage">Breakage</option><option value="Adjustment">Adjustment (+ / −)</option><option value="Return">Return to stock</option></select></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="label" for="imq">Quantity ({{ moveRow()?.unitCode }})</label><input id="imq" type="number" step="0.001" class="input" formControlName="quantity" /></div>
            <div><label class="label" for="imc">Unit cost (optional)</label><input id="imc" type="number" step="0.01" min="0" class="input" formControlName="unitCost" /></div>
          </div>
          <p class="text-xs text-gray-500">Wastage and breakage are deducted automatically. For adjustments use a negative number to reduce stock.</p>
          <div><label class="label" for="imn">Note</label><input id="imn" class="input" maxlength="300" formControlName="notes" placeholder="e.g. stock count correction" /></div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </form>
      }
      <div drawer-actions><button type="button" class="btn-ghost" (click)="moveOpen.set(false)">Cancel</button><button type="submit" form="invMove" class="btn-primary" [disabled]="busy()">Save movement</button></div>
    </app-drawer>

    <app-drawer [open]="transferOpen()" title="Transfer between warehouses" (closed)="transferOpen.set(false)">
      @if (transferOpen()) {
        <form id="invTr" class="space-y-4" [formGroup]="transferForm" (ngSubmit)="saveTransfer()">
          <div class="grid grid-cols-2 gap-4">
            <div><label class="label" for="itf">From</label><select id="itf" class="input" formControlName="fromWarehouseId">@for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }</select></div>
            <div><label class="label" for="itt">To</label><select id="itt" class="input" formControlName="toWarehouseId">@for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }</select></div>
          </div>
          <div><label class="label" for="iti">Item</label><select id="iti" class="input" formControlName="itemId">@for (r of rows(); track r.itemId) { <option [value]="r.itemId">{{ r.name }} ({{ r.quantity | number: '1.0-3' }} {{ r.unitCode }})</option> }</select></div>
          <div><label class="label" for="itq">Quantity</label><input id="itq" type="number" min="0" step="0.001" class="input" formControlName="quantity" /></div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </form>
      }
      <div drawer-actions><button type="button" class="btn-ghost" (click)="transferOpen.set(false)">Cancel</button><button type="submit" form="invTr" class="btn-primary" [disabled]="busy()">Transfer</button></div>
    </app-drawer>`,
})
export class InventoryStockComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  protected readonly branding = inject(BrandingService);

  /** Route data: 'stock' (default) or 'movements' for the Adjustments menu entry. */
  readonly initialTab = input<'stock' | 'movements'>('stock');

  protected readonly levelStyle = LEVEL_STYLE;
  protected readonly typeStyle = TYPE_STYLE;
  protected readonly tabs: { key: 'stock' | 'movements'; label: string }[] = [{ key: 'stock', label: 'Stock levels' }, { key: 'movements', label: 'Movements' }];
  protected readonly tab = signal<'stock' | 'movements'>('stock');
  protected readonly warehouses = signal<Warehouse[]>([]);
  protected readonly warehouseId = signal('');
  protected readonly rows = signal<InvStockRow[]>([]);
  protected readonly txns = signal<InvTxn[]>([]);
  protected readonly alerts = signal<StockAlert[]>([]);
  protected readonly level = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly txnPage = signal(1);
  protected readonly txnPages = signal(1);
  protected readonly txnTotal = signal(0);
  protected readonly moveOpen = signal(false);
  protected readonly transferOpen = signal(false);
  protected readonly moveRow = signal<InvStockRow | null>(null);
  protected readonly search$ = new Subject<string>();
  protected readonly canAdjust = computed(() => this.auth.hasPermission('Inventory.Adjust'));
  protected readonly pageValue = computed(() => this.rows().reduce((s, r) => s + r.stockValue, 0));
  protected readonly alertNames = computed(() => this.alerts().slice(0, 6).map(a => a.name).join(', ') + (this.alerts().length > 6 ? '…' : ''));
  private search = '';

  protected readonly moveForm = this.fb.nonNullable.group({ type: ['Purchase'], quantity: [0, Validators.required], unitCost: [null as number | null], notes: [''] });
  protected readonly transferForm = this.fb.nonNullable.group({ fromWarehouseId: ['', Validators.required], toWarehouseId: ['', Validators.required], itemId: ['', Validators.required], quantity: [0] });

  constructor() { this.search$.pipe(debounceTime(300)).subscribe(s => { this.search = s; this.page.set(1); this.load(); }); }

  ngOnInit(): void {
    this.tab.set(this.initialTab() ?? 'stock');   // the router binds absent route data as undefined
    this.api.get<Warehouse[]>('inventory/warehouses').subscribe(w => {
      const active = w.filter(x => x.isActive);
      this.warehouses.set(active);
      this.warehouseId.set(active.find(x => x.isDefault)?.id ?? active[0]?.id ?? '');
      this.refresh();
    });
    this.api.get<StockAlert[]>('inventory/alerts').subscribe({ next: a => this.alerts.set(a.filter(x => x.source === 'Inventory')), error: () => undefined });
  }

  protected setWarehouse(id: string): void { this.warehouseId.set(id); this.page.set(1); this.txnPage.set(1); this.refresh(); }
  protected setTab(t: 'stock' | 'movements'): void { this.tab.set(t); this.refresh(); }
  protected setLevel(l: string): void { this.level.set(l); this.page.set(1); this.tab.set('stock'); this.load(); }
  protected goTo(p: number): void { this.page.set(p); this.load(); }
  protected goTxn(p: number): void { this.txnPage.set(p); this.loadTxns(); }
  private refresh(): void { if (this.tab() === 'stock') this.load(); else this.loadTxns(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.api.get<Paged<InvStockRow>>('inventory/stock', { warehouseId: this.warehouseId(), page: this.page(), pageSize: 15, search: this.search, level: this.level() }).subscribe({
      next: r => { this.rows.set(r.items); this.totalPages.set(r.totalPages); this.total.set(r.totalCount); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private loadTxns(): void {
    this.loading.set(true);
    this.api.get<Paged<InvTxn>>('inventory/stock/transactions', { warehouseId: this.warehouseId(), page: this.txnPage(), pageSize: 15 }).subscribe({
      next: r => { this.txns.set(r.items); this.txnPages.set(r.totalPages); this.txnTotal.set(r.totalCount); this.loading.set(false); },
      error: e => { this.toast.error(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected openMove(r: InvStockRow): void {
    this.formError.set(''); this.moveRow.set(r);
    this.moveForm.reset({ type: 'Purchase', quantity: 0, unitCost: null, notes: '' });
    this.moveOpen.set(true);
  }

  protected saveMove(): void {
    const r = this.moveRow(); if (!r) return;
    const v = this.moveForm.getRawValue();
    this.busy.set(true); this.formError.set('');
    this.api.post('inventory/stock/move', { warehouseId: this.warehouseId(), itemId: r.itemId, type: v.type, quantity: Number(v.quantity), unitCost: v.unitCost ?? null, notes: v.notes || null }).subscribe({
      next: () => { this.busy.set(false); this.moveOpen.set(false); this.toast.success('Stock updated'); this.load(); this.reloadAlerts(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected openTransfer(): void {
    this.formError.set('');
    const from = this.warehouseId(), to = this.warehouses().find(w => w.id !== from)?.id ?? '';
    this.transferForm.reset({ fromWarehouseId: from, toWarehouseId: to, itemId: this.rows()[0]?.itemId ?? '', quantity: 0 });
    this.transferOpen.set(true);
  }

  protected saveTransfer(): void {
    if (this.transferForm.invalid) { this.transferForm.markAllAsTouched(); return; }
    const v = this.transferForm.getRawValue();
    this.busy.set(true); this.formError.set('');
    this.api.post('inventory/stock/transfer', { ...v, quantity: Number(v.quantity), notes: null }).subscribe({
      next: () => { this.busy.set(false); this.transferOpen.set(false); this.toast.success('Stock transferred'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  private reloadAlerts(): void { this.api.get<StockAlert[]>('inventory/alerts').subscribe(a => this.alerts.set(a.filter(x => x.source === 'Inventory'))); }
}
