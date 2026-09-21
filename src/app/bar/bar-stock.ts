import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { BarCounter, Paged, StockReportRow, StockRow, StockTxn } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

type Tab = 'stock' | 'movements' | 'report';
const TYPE_STYLE: Record<string, string> = {
  Opening: 'bg-sky-100 text-sky-700', Purchase: 'bg-emerald-100 text-emerald-700', Sale: 'bg-violet-100 text-violet-700', TransferIn: 'bg-teal-100 text-teal-700',
  TransferOut: 'bg-teal-100 text-teal-700', Breakage: 'bg-red-100 text-red-700', Wastage: 'bg-orange-100 text-orange-700', Adjustment: 'bg-amber-100 text-amber-700', Return: 'bg-gray-100 text-gray-700',
};

/** Bottle-level bar inventory: current levels, movement ledger and period report (opening → closing). */
@Component({
  selector: 'app-bar-stock',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Bar stock</h1><p class="text-sm text-gray-500">Bottle-level inventory tracked to the millilitre</p></div>
        <div class="flex flex-wrap items-center gap-2">
          <select class="input w-auto" aria-label="Bar counter" (change)="setCounter($any($event.target).value)">
            @for (c of counters(); track c.id) { <option [value]="c.id" [selected]="c.id === counterId()">{{ c.name }}{{ c.isDefault ? ' (default)' : '' }}</option> }
          </select>
          @if (canStock()) { <button type="button" class="btn-ghost" (click)="openTransfer()"><span class="mi">swap_horiz</span>Transfer</button> }
        </div>
      </div>

      <div class="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" class="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition" [class]="tab() === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'" (click)="setTab(t.key)">{{ t.label }}</button>
        }
      </div>

      @if (tab() === 'stock') {
        <div class="card overflow-hidden">
          @if (loading()) { <div class="p-6"><app-skeleton /></div> }
          @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
          @else if (stock().length === 0) { <app-empty-state icon="liquor" title="No bar products yet" hint="Add brands and products first, then record opening stock." /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Product</th><th class="px-5 py-3">Category</th><th class="px-5 py-3">In stock</th><th class="px-5 py-3">Level</th><th class="px-5 py-3"></th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (s of stock(); track s.productId) {
                  <tr class="hover:bg-gray-50/60">
                    <td class="px-5 py-3 font-semibold text-gray-900">{{ s.productName }}</td>
                    <td class="px-5 py-3 text-gray-600">{{ s.categoryName }}</td>
                    <td class="px-5 py-3"><span class="font-semibold">{{ s.wholeBottles }}</span> <span class="text-gray-500">bottles</span>@if (s.looseMl > 0) { <span class="text-gray-500"> + {{ s.looseMl }} ml</span> }</td>
                    <td class="px-5 py-3">
                      @if (s.isLow) { <span class="badge bg-red-100 text-red-700">Low · reorder at {{ s.reorderLevelBottles }}</span> }
                      @else if (s.reorderLevelBottles > 0) { <span class="badge bg-emerald-50 text-emerald-700">OK</span> }
                      @else { <span class="text-gray-400">—</span> }
                    </td>
                    <td class="px-5 py-3 text-right">@if (canStock()) { <button type="button" class="text-sm font-semibold text-brand hover:underline" (click)="openMove(s)">Record movement</button> }</td>
                  </tr>
                }
              </tbody>
            </table></div>
          }
        </div>
      }

      @if (tab() === 'movements') {
        <div class="card overflow-hidden">
          @if (loading()) { <div class="p-6"><app-skeleton /></div> }
          @else if (txns().length === 0) { <app-empty-state icon="history" title="No movements yet" /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">When</th><th class="px-5 py-3">Product</th><th class="px-5 py-3">Counter</th><th class="px-5 py-3">Type</th><th class="px-5 py-3 text-right">Bottles</th><th class="px-5 py-3 text-right">Balance (ml)</th><th class="px-5 py-3">Note</th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (t of txns(); track t.id) {
                  <tr>
                    <td class="px-5 py-3 text-gray-500">{{ t.createdAt | date: 'short' }}</td><td class="px-5 py-3 font-semibold text-gray-900">{{ t.productName }}</td><td class="px-5 py-3 text-gray-600">{{ t.counterName }}</td>
                    <td class="px-5 py-3"><span class="badge" [class]="typeStyle[t.type]">{{ t.type }}</span></td>
                    <td class="px-5 py-3 text-right font-semibold" [class]="t.quantityMl < 0 ? 'text-red-600' : 'text-emerald-600'">{{ t.quantityMl > 0 ? '+' : '' }}{{ t.quantityBottles | number: '1.0-2' }}</td>
                    <td class="px-5 py-3 text-right text-gray-600">{{ t.balanceAfterMl | number }}</td><td class="px-5 py-3 text-gray-500">{{ t.notes }}</td>
                  </tr>
                }
              </tbody>
            </table></div>
            <div class="px-5 pb-4"><app-pager [page]="txnPage()" [totalPages]="txnPages()" [total]="txnTotal()" (changed)="goTxn($event)" /></div>
          }
        </div>
      }

      @if (tab() === 'report') {
        <div class="card flex flex-wrap items-end gap-3 p-4">
          <div><label class="label" for="rfrom">From</label><input id="rfrom" type="date" class="input" [value]="from()" (change)="from.set($any($event.target).value)" /></div>
          <div><label class="label" for="rto">To</label><input id="rto" type="date" class="input" [value]="to()" (change)="to.set($any($event.target).value)" /></div>
          <button type="button" class="btn-primary" (click)="loadReport()">Run report</button>
          <p class="ml-auto text-xs text-gray-500">Quantities in bottles · all counters combined</p>
        </div>
        <div class="card overflow-hidden">
          @if (report().length === 0) { <app-empty-state icon="assessment" title="No movements in this period" /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Product</th><th class="px-3 py-3 text-right">Opening</th><th class="px-3 py-3 text-right">Purchased</th><th class="px-3 py-3 text-right">Sold</th><th class="px-3 py-3 text-right">Transfers</th><th class="px-3 py-3 text-right">Breakage</th><th class="px-3 py-3 text-right">Wastage</th><th class="px-3 py-3 text-right">Adjust.</th><th class="px-5 py-3 text-right">Closing</th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of report(); track r.productId) {
                  <tr>
                    <td class="px-5 py-3"><p class="font-semibold text-gray-900">{{ r.productName }}</p><p class="text-xs text-gray-500">{{ r.categoryName }}</p></td>
                    <td class="px-3 py-3 text-right">{{ r.opening | number: '1.0-2' }}</td><td class="px-3 py-3 text-right text-emerald-600">{{ r.purchased | number: '1.0-2' }}</td>
                    <td class="px-3 py-3 text-right">{{ r.sold | number: '1.0-2' }}</td><td class="px-3 py-3 text-right">{{ r.transfersNet | number: '1.0-2' }}</td>
                    <td class="px-3 py-3 text-right text-red-600">{{ r.breakage | number: '1.0-2' }}</td><td class="px-3 py-3 text-right text-orange-600">{{ r.wastage | number: '1.0-2' }}</td>
                    <td class="px-3 py-3 text-right">{{ r.other | number: '1.0-2' }}</td><td class="px-5 py-3 text-right font-bold text-gray-900">{{ r.closing | number: '1.0-2' }}</td>
                  </tr>
                }
              </tbody>
            </table></div>
          }
        </div>
      }
    </div>

    <app-drawer [open]="moveOpen()" [title]="'Stock movement' + (moveProduct() ? ' · ' + moveProduct()!.productName : '')" (closed)="moveOpen.set(false)">
      <form id="moveForm" class="space-y-4" [formGroup]="moveForm" (ngSubmit)="saveMove()">
        <div><label class="label" for="mtype">Movement</label>
          <select id="mtype" class="input" formControlName="type">
            <option value="Purchase">Purchase (stock received)</option><option value="Opening">Opening stock</option><option value="Breakage">Breakage</option>
            <option value="Wastage">Wastage / spillage</option><option value="Adjustment">Adjustment (+ / −)</option><option value="Return">Return to stock</option>
          </select></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="mb">Bottles</label><input id="mb" type="number" step="0.01" class="input" formControlName="bottles" /></div>
          <div><label class="label" for="mm">Extra ml</label><input id="mm" type="number" step="1" class="input" formControlName="ml" /></div>
        </div>
        <p class="text-xs text-gray-500">Breakage and wastage are deducted automatically. For adjustments use a negative number to reduce stock.</p>
        <div><label class="label" for="mn">Note</label><input id="mn" class="input" maxlength="300" formControlName="notes" placeholder="e.g. supplier invoice, dropped bottle" /></div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      <div drawer-actions><button type="button" class="btn-ghost" (click)="moveOpen.set(false)">Cancel</button><button type="submit" form="moveForm" class="btn-primary" [disabled]="busy()">Save movement</button></div>
    </app-drawer>

    <app-drawer [open]="transferOpen()" title="Transfer between counters" (closed)="transferOpen.set(false)">
      <form id="trForm" class="space-y-4" [formGroup]="transferForm" (ngSubmit)="saveTransfer()">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="tf">From</label><select id="tf" class="input" formControlName="fromCounterId">@for (c of counters(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
          <div><label class="label" for="tt">To</label><select id="tt" class="input" formControlName="toCounterId">@for (c of counters(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
        </div>
        <div><label class="label" for="tp">Product</label><select id="tp" class="input" formControlName="productId">@for (s of stock(); track s.productId) { <option [value]="s.productId">{{ s.productName }}</option> }</select></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="tb">Bottles</label><input id="tb" type="number" min="0" step="0.01" class="input" formControlName="bottles" /></div>
          <div><label class="label" for="tm">Extra ml</label><input id="tm" type="number" min="0" step="1" class="input" formControlName="ml" /></div>
        </div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      <div drawer-actions><button type="button" class="btn-ghost" (click)="transferOpen.set(false)">Cancel</button><button type="submit" form="trForm" class="btn-primary" [disabled]="busy()">Transfer</button></div>
    </app-drawer>`,
})
export class BarStockComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly tabs: { key: Tab; label: string }[] = [{ key: 'stock', label: 'Current stock' }, { key: 'movements', label: 'Movements' }, { key: 'report', label: 'Period report' }];
  protected readonly typeStyle = TYPE_STYLE;
  protected readonly tab = signal<Tab>('stock');
  protected readonly counters = signal<BarCounter[]>([]);
  protected readonly counterId = signal('');
  protected readonly stock = signal<StockRow[]>([]);
  protected readonly txns = signal<StockTxn[]>([]);
  protected readonly report = signal<StockReportRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly txnPage = signal(1);
  protected readonly txnPages = signal(1);
  protected readonly txnTotal = signal(0);
  protected readonly moveOpen = signal(false);
  protected readonly transferOpen = signal(false);
  protected readonly moveProduct = signal<StockRow | null>(null);
  protected readonly from = signal(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  protected readonly to = signal(new Date().toISOString().slice(0, 10));
  protected readonly canStock = computed(() => this.auth.hasPermission('Bar.Stock'));

  protected readonly moveForm = this.fb.nonNullable.group({ type: ['Purchase'], bottles: [0], ml: [0], notes: [''] });
  protected readonly transferForm = this.fb.nonNullable.group({
    fromCounterId: ['', Validators.required], toCounterId: ['', Validators.required], productId: ['', Validators.required], bottles: [0], ml: [0],
  });

  ngOnInit(): void {
    this.api.get<BarCounter[]>('bar/counters').subscribe(c => {
      const active = c.filter(x => x.isActive);
      this.counters.set(active);
      this.counterId.set(active.find(x => x.isDefault)?.id ?? active[0]?.id ?? '');
      this.load();
    });
  }

  protected setCounter(id: string): void { this.counterId.set(id); this.txnPage.set(1); this.refresh(); }
  protected setTab(t: Tab): void { this.tab.set(t); this.refresh(); }
  protected goTxn(p: number): void { this.txnPage.set(p); this.loadTxns(); }

  private refresh(): void { if (this.tab() === 'stock') this.load(); else if (this.tab() === 'movements') this.loadTxns(); else this.loadReport(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.api.get<StockRow[]>('bar/stock', { counterId: this.counterId() }).subscribe({
      next: s => { this.stock.set(s); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private loadTxns(): void {
    this.loading.set(true);
    this.api.get<Paged<StockTxn>>('bar/stock/transactions', { counterId: this.counterId(), page: this.txnPage(), pageSize: 15 }).subscribe({
      next: r => { this.txns.set(r.items); this.txnPages.set(r.totalPages); this.txnTotal.set(r.totalCount); this.loading.set(false); },
      error: e => { this.toast.error(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected loadReport(): void {
    this.api.get<StockReportRow[]>('bar/stock/report', { from: this.from(), to: this.to() }).subscribe({ next: r => this.report.set(r), error: e => this.toast.error(errorMessage(e)) });
  }

  protected openMove(s: StockRow): void {
    this.formError.set(''); this.moveProduct.set(s);
    this.moveForm.reset({ type: 'Purchase', bottles: 0, ml: 0, notes: '' });
    this.moveOpen.set(true);
  }

  protected saveMove(): void {
    const p = this.moveProduct(); if (!p) return;
    const v = this.moveForm.getRawValue();
    this.busy.set(true); this.formError.set('');
    this.api.post('bar/stock/move', { counterId: this.counterId(), productId: p.productId, type: v.type, bottles: v.bottles || 0, ml: v.ml || 0, notes: v.notes || null }).subscribe({
      next: () => { this.busy.set(false); this.moveOpen.set(false); this.toast.success('Stock updated'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected openTransfer(): void {
    this.formError.set('');
    const from = this.counterId(), to = this.counters().find(c => c.id !== from)?.id ?? '';
    this.transferForm.reset({ fromCounterId: from, toCounterId: to, productId: this.stock()[0]?.productId ?? '', bottles: 0, ml: 0 });
    this.transferOpen.set(true);
  }

  protected saveTransfer(): void {
    if (this.transferForm.invalid) { this.transferForm.markAllAsTouched(); return; }
    const v = this.transferForm.getRawValue();
    this.busy.set(true); this.formError.set('');
    this.api.post('bar/stock/transfer', { ...v, bottles: v.bottles || 0, ml: v.ml || 0, notes: null }).subscribe({
      next: () => { this.busy.set(false); this.transferOpen.set(false); this.toast.success('Stock transferred'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }
}
