import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { BarCounter, BarProduct, InvItem, Paged, PaymentMethod, PurchaseInvoice, PurchaseOrder, PurchaseOrderSummary, Supplier, Warehouse } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ConfirmService, DrawerComponent, EmptyStateComponent, ErrorStateComponent, ModalComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

const STATUS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700', Ordered: 'bg-sky-100 text-sky-700', PartiallyReceived: 'bg-amber-100 text-amber-700', Received: 'bg-emerald-100 text-emerald-700', Cancelled: 'bg-red-100 text-red-700',
  Unpaid: 'bg-red-100 text-red-700', PartiallyPaid: 'bg-amber-100 text-amber-700', Paid: 'bg-emerald-100 text-emerald-700', Void: 'bg-gray-100 text-gray-500',
};

type Line = FormGroup<{ kind: FormControl<'item' | 'bar'>; refId: FormControl<string>; quantity: FormControl<number>; unitPrice: FormControl<number>; taxPercent: FormControl<number> }>;
type QtyRow = FormGroup<{ poLineId: FormControl<string>; description: FormControl<string>; max: FormControl<number>; quantity: FormControl<number> }>;

/** Purchase orders → goods received → invoice → payment, plus supplier returns. */
@Component({
  selector: 'app-purchases',
  imports: [ReactiveFormsModule, DecimalPipe, DrawerComponent, ModalComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Purchases</h1><p class="text-sm text-gray-500">Order from suppliers, receive goods into stock and settle invoices</p></div>
        @if (canCreate()) { <button type="button" class="btn-primary" (click)="openForm()"><span class="mi">add</span>New purchase order</button> }
      </div>

      <div class="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" class="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition" [class]="tab() === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'" (click)="setTab(t.key)">{{ t.label }}</button>
        }
      </div>

      <div class="card flex flex-wrap items-center gap-3 p-4">
        <div class="relative min-w-52 flex-1"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
          <input class="input pl-10" [placeholder]="tab() === 'orders' ? 'Search PO number' : 'Search invoice number'" aria-label="Search" (input)="onSearch($any($event.target).value)" /></div>
        <select class="input w-auto" aria-label="Status" (change)="setStatus($any($event.target).value)">
          <option value="">All statuses</option>
          @for (s of tab() === 'orders' ? poStatuses : invStatuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </div>

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (tab() === 'orders') {
          @if (orders().length === 0) { <app-empty-state icon="local_shipping" title="No purchase orders" hint="Create one to start receiving stock." /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">PO</th><th class="px-5 py-3">Supplier</th><th class="px-5 py-3">Date</th><th class="px-5 py-3">Status</th><th class="px-5 py-3 text-right">Lines</th><th class="px-5 py-3 text-right">Total</th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (o of orders(); track o.id) {
                  <tr class="cursor-pointer hover:bg-gray-50/60" tabindex="0" (click)="openOrder(o.id)" (keydown.enter)="openOrder(o.id)">
                    <td class="px-5 py-3 font-semibold text-gray-900">{{ o.poNo }}</td><td class="px-5 py-3 text-gray-600">{{ o.supplierName }}</td><td class="px-5 py-3 text-gray-500">{{ o.orderDate }}</td>
                    <td class="px-5 py-3"><span class="badge" [class]="style[o.status]">{{ o.status }}</span></td><td class="px-5 py-3 text-right">{{ o.lineCount }}</td><td class="px-5 py-3 text-right font-semibold">{{ branding.money(o.total) }}</td>
                  </tr>
                }
              </tbody>
            </table></div>
          }
        } @else {
          @if (invoices().length === 0) { <app-empty-state icon="receipt" title="No supplier invoices" hint="Invoices are raised from fully received purchase orders." /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Invoice</th><th class="px-5 py-3">Supplier</th><th class="px-5 py-3">Due</th><th class="px-5 py-3">Status</th><th class="px-5 py-3 text-right">Total</th><th class="px-5 py-3 text-right">Due amount</th><th class="px-5 py-3"></th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (i of invoices(); track i.id) {
                  <tr class="hover:bg-gray-50/60">
                    <td class="px-5 py-3"><p class="font-semibold text-gray-900">{{ i.invoiceNo }}</p><p class="text-xs text-gray-500">{{ i.poNo }}</p></td><td class="px-5 py-3 text-gray-600">{{ i.supplierName }}</td><td class="px-5 py-3 text-gray-500">{{ i.dueDate || '—' }}</td>
                    <td class="px-5 py-3"><span class="badge" [class]="style[i.status]">{{ i.status }}</span></td><td class="px-5 py-3 text-right">{{ branding.money(i.total) }}</td><td class="px-5 py-3 text-right font-semibold">{{ branding.money(i.dueAmount) }}</td>
                    <td class="px-5 py-3 text-right">@if (canManage() && i.dueAmount > 0 && i.status !== 'Void') { <button type="button" class="text-sm font-semibold text-brand hover:underline" (click)="openPay(i)">Record payment</button> }</td>
                  </tr>
                }
              </tbody>
            </table></div>
          }
        }
        @if (!loading() && !error()) { <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div> }
      </div>
    </div>

    <!-- create / edit PO -->
    <app-drawer [open]="formOpen()" [title]="editingId() ? 'Edit purchase order' : 'New purchase order'" (closed)="formOpen.set(false)">
      @if (formOpen()) {
        <form id="poForm" class="space-y-4" [formGroup]="poForm" (ngSubmit)="savePo()">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2"><label class="label" for="posup">Supplier</label><select id="posup" class="input" formControlName="supplierId">@for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select></div>
            <div><label class="label" for="pod">Order date</label><input id="pod" type="date" class="input" formControlName="orderDate" /></div>
            <div><label class="label" for="poe">Expected delivery</label><input id="poe" type="date" class="input" formControlName="expectedDate" /></div>
          </div>
          <div><label class="label" for="pon">Notes</label><input id="pon" class="input" maxlength="500" formControlName="notes" /></div>
          <div class="space-y-2">
            <p class="label mb-0">Lines</p>
            @for (l of lines.controls; track $index) {
              <div class="grid grid-cols-12 items-center gap-2 rounded-xl border border-gray-200 p-2" [formGroup]="l">
                <select class="input col-span-3" aria-label="Line type" formControlName="kind" (change)="onKind(l)"><option value="item">Inventory</option><option value="bar">Bar bottle</option></select>
                <select class="input col-span-9" aria-label="Product" formControlName="refId">
                  @if (l.controls.kind.value === 'item') { @for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }} ({{ i.unitCode }})</option> } }
                  @else { @for (p of products(); track p.id) { <option [value]="p.id">{{ p.displayName }}</option> } }
                </select>
                <input class="input col-span-3" type="number" min="0" step="0.001" aria-label="Quantity" placeholder="Qty" formControlName="quantity" />
                <input class="input col-span-4" type="number" min="0" step="0.01" aria-label="Unit price" placeholder="Unit price" formControlName="unitPrice" />
                <input class="input col-span-3" type="number" min="0" max="100" step="0.1" aria-label="Tax percent" placeholder="Tax %" formControlName="taxPercent" />
                <button type="button" class="col-span-2 rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Remove line" (click)="lines.removeAt($index)"><span class="mi">close</span></button>
              </div>
            }
            <button type="button" class="text-sm font-semibold text-brand" (click)="addLine()">+ Add line</button>
          </div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </form>
      }
      <div drawer-actions><button type="button" class="btn-ghost" (click)="formOpen.set(false)">Cancel</button><button type="submit" form="poForm" class="btn-primary" [disabled]="busy()">Save draft</button></div>
    </app-drawer>

    <!-- PO detail -->
    <app-drawer [open]="detail() !== null" [title]="detail()?.poNo ?? ''" (closed)="detail.set(null)">
      @if (detail(); as d) {
        <div class="space-y-5">
          <div class="flex flex-wrap items-center gap-2"><span class="badge" [class]="style[d.status]">{{ d.status }}</span><span class="text-sm text-gray-500">{{ d.supplierName }} · ordered {{ d.orderDate }}@if (d.expectedDate) { · due {{ d.expectedDate }} }</span></div>
          @if (d.notes) { <p class="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">{{ d.notes }}</p> }
          <ul class="divide-y divide-gray-100 rounded-xl border border-gray-100">
            @for (l of d.lines; track l.id) {
              <li class="px-4 py-3 text-sm">
                <div class="flex items-start justify-between gap-3"><p class="font-semibold text-gray-900">{{ l.description }}</p><p class="font-semibold">{{ branding.money(l.lineTotal) }}</p></div>
                <p class="text-xs text-gray-500">{{ l.quantity | number: '1.0-3' }} × {{ branding.money(l.unitPrice) }} · tax {{ l.taxPercent }}%</p>
                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div class="h-full bg-emerald-500" [style.width.%]="l.quantity ? (l.receivedQuantity / l.quantity) * 100 : 0"></div></div>
                <p class="mt-1 text-xs text-gray-500">Received {{ l.receivedQuantity | number: '1.0-3' }} of {{ l.quantity | number: '1.0-3' }}@if (l.returnedQuantity > 0) { · returned {{ l.returnedQuantity | number: '1.0-3' }} }</p>
              </li>
            }
          </ul>
          <dl class="space-y-1 text-sm"><div class="flex justify-between text-gray-600"><dt>Subtotal</dt><dd>{{ branding.money(d.subtotal) }}</dd></div><div class="flex justify-between text-gray-600"><dt>Tax</dt><dd>{{ branding.money(d.taxAmount) }}</dd></div>
            <div class="flex justify-between pt-1 text-lg font-bold text-gray-900"><dt>Total</dt><dd>{{ branding.money(d.total) }}</dd></div></dl>
          @if (d.receipts.length) { <div><p class="label">Goods receipts</p>@for (r of d.receipts; track r.id) { <p class="text-sm text-gray-600">{{ r.grnNo }} · {{ r.receivedDate }}@if (r.notes) { · {{ r.notes }} }</p> }</div> }
          @if (d.invoices.length) { <div><p class="label">Invoices</p>@for (i of d.invoices; track i.id) { <p class="text-sm text-gray-600">{{ i.invoiceNo }} · {{ branding.money(i.total) }} · <span class="font-semibold">{{ i.status }}</span></p> }</div> }
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </div>
      }
      <div drawer-actions>
        @if (detail(); as d) {
          @if (d.status === 'Draft') {
            @if (canManage()) { <button type="button" class="btn-ghost mr-auto text-red-600" (click)="cancelPo(d)">Cancel order</button> }
            @if (canCreate()) { <button type="button" class="btn-ghost" (click)="openForm(d)">Edit</button><button type="button" class="btn-primary" [disabled]="busy()" (click)="place(d)">Place order</button> }
          }
          @if (d.status === 'Ordered' && canManage()) { <button type="button" class="btn-ghost mr-auto text-red-600" (click)="cancelPo(d)">Cancel order</button> }
          @if ((d.status === 'Ordered' || d.status === 'PartiallyReceived') && canReceive()) { <button type="button" class="btn-primary" (click)="openReceive(d)">Receive goods</button> }
          @if (d.status === 'Received' || d.status === 'PartiallyReceived') {
            @if (canManage() && hasReceived(d) && d.invoices.length === 0) { <button type="button" class="btn-ghost" (click)="openReturn(d)">Return to supplier</button> }
          }
          @if (d.status === 'Received' && canManage() && d.invoices.length === 0) { <button type="button" class="btn-primary" (click)="openInvoice(d)">Record invoice</button> }
        }
      </div>
    </app-drawer>

    <!-- receive / return -->
    <app-modal [open]="qtyMode() !== null" [title]="qtyMode() === 'receive' ? 'Receive goods' : 'Return to supplier'" width="max-w-2xl" (closed)="qtyMode.set(null)">
      @if (qtyMode()) {
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            @if (needsWarehouse()) { <div><label class="label" for="qw">Warehouse</label><select id="qw" class="input" (change)="qtyWarehouse.set($any($event.target).value)">@for (w of warehouses(); track w.id) { <option [value]="w.id" [selected]="w.id === qtyWarehouse()">{{ w.name }}</option> }</select></div> }
            @if (needsCounter()) { <div><label class="label" for="qc">Bar counter</label><select id="qc" class="input" (change)="qtyCounter.set($any($event.target).value)">@for (c of counters(); track c.id) { <option [value]="c.id" [selected]="c.id === qtyCounter()">{{ c.name }}</option> }</select></div> }
          </div>
          @for (r of qtyRows.controls; track $index) {
            <div class="grid grid-cols-12 items-center gap-2" [formGroup]="r">
              <p class="col-span-7 text-sm font-semibold text-gray-900">{{ r.controls.description.value }}<span class="block text-xs font-normal text-gray-500">up to {{ r.controls.max.value | number: '1.0-3' }}</span></p>
              <input class="input col-span-5" type="number" min="0" [max]="r.controls.max.value" step="0.001" [attr.aria-label]="'Quantity for ' + r.controls.description.value" formControlName="quantity" />
            </div>
          }
          <div><label class="label" for="qn">{{ qtyMode() === 'receive' ? 'Note' : 'Reason (required)' }}</label><input id="qn" class="input" maxlength="300" [value]="qtyNote()" (input)="qtyNote.set($any($event.target).value)" /></div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </div>
      }
      <div modal-actions><button type="button" class="btn-ghost" (click)="qtyMode.set(null)">Cancel</button><button type="button" class="btn-primary" [disabled]="busy()" (click)="submitQty()">{{ qtyMode() === 'receive' ? 'Confirm receipt' : 'Record return' }}</button></div>
    </app-modal>

    <!-- invoice -->
    <app-modal [open]="invoiceFor() !== null" title="Record supplier invoice" (closed)="invoiceFor.set(null)">
      <form id="invForm" class="space-y-3" [formGroup]="invoiceForm" (ngSubmit)="saveInvoice()">
        <p class="text-sm text-gray-500">The amount is calculated from the goods received and kept.</p>
        <div><label class="label" for="in1">Supplier invoice number</label><input id="in1" class="input" formControlName="invoiceNo" />@if (invoiceForm.controls.invoiceNo.touched && invoiceForm.controls.invoiceNo.invalid) { <p class="field-error">Invoice number is required.</p> }</div>
        <div class="grid grid-cols-2 gap-3"><div><label class="label" for="in2">Invoice date</label><input id="in2" type="date" class="input" formControlName="invoiceDate" /></div><div><label class="label" for="in3">Due date (optional)</label><input id="in3" type="date" class="input" formControlName="dueDate" /></div></div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      <div modal-actions><button type="button" class="btn-ghost" (click)="invoiceFor.set(null)">Cancel</button><button type="submit" form="invForm" class="btn-primary" [disabled]="busy()">Save invoice</button></div>
    </app-modal>

    <!-- pay -->
    <app-modal [open]="payFor() !== null" title="Record payment" (closed)="payFor.set(null)">
      @if (payFor(); as i) {
        <form id="payForm" class="space-y-3" [formGroup]="payForm" (ngSubmit)="savePayment()">
          <p class="text-sm text-gray-600">{{ i.invoiceNo }} · {{ i.supplierName }} — due <span class="font-semibold">{{ branding.money(i.dueAmount) }}</span></p>
          <div><label class="label" for="pm">Method</label><select id="pm" class="input" formControlName="paymentMethodId">@for (m of methods(); track m.id) { <option [value]="m.id">{{ m.name }}</option> }</select></div>
          <div class="grid grid-cols-2 gap-3"><div><label class="label" for="pa">Amount</label><input id="pa" type="number" min="0.01" step="0.01" class="input" formControlName="amount" /></div><div><label class="label" for="pr">Reference</label><input id="pr" class="input" formControlName="reference" /></div></div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </form>
      }
      <div modal-actions><button type="button" class="btn-ghost" (click)="payFor.set(null)">Cancel</button><button type="submit" form="payForm" class="btn-primary" [disabled]="busy()">Record payment</button></div>
    </app-modal>`,
})
export class PurchasesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);
  protected readonly branding = inject(BrandingService);

  protected readonly style = STATUS;
  protected readonly poStatuses = ['Draft', 'Ordered', 'PartiallyReceived', 'Received', 'Cancelled'];
  protected readonly invStatuses = ['Unpaid', 'PartiallyPaid', 'Paid'];
  protected readonly tabs: { key: 'orders' | 'invoices'; label: string }[] = [{ key: 'orders', label: 'Purchase orders' }, { key: 'invoices', label: 'Supplier invoices' }];
  protected readonly tab = signal<'orders' | 'invoices'>('orders');
  protected readonly orders = signal<PurchaseOrderSummary[]>([]);
  protected readonly invoices = signal<PurchaseInvoice[]>([]);
  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly items = signal<InvItem[]>([]);
  protected readonly products = signal<BarProduct[]>([]);
  protected readonly warehouses = signal<Warehouse[]>([]);
  protected readonly counters = signal<BarCounter[]>([]);
  protected readonly methods = signal<PaymentMethod[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly detail = signal<PurchaseOrder | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly qtyMode = signal<'receive' | 'return' | null>(null);
  protected readonly qtyWarehouse = signal('');
  protected readonly qtyCounter = signal('');
  protected readonly qtyNote = signal('');
  protected readonly invoiceFor = signal<PurchaseOrder | null>(null);
  protected readonly payFor = signal<PurchaseInvoice | null>(null);
  protected readonly canCreate = computed(() => this.auth.hasPermission('Purchase.Create'));
  protected readonly canManage = computed(() => this.auth.hasPermission('Purchase.Manage'));
  protected readonly canReceive = computed(() => this.auth.hasPermission('Inventory.Create'));
  private search = ''; private status = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly poForm = this.fb.nonNullable.group({ supplierId: ['', Validators.required], orderDate: [''], expectedDate: [''], notes: [''] });
  protected readonly lines = new FormArray<Line>([]);
  protected readonly qtyRows = new FormArray<QtyRow>([]);
  protected readonly invoiceForm = this.fb.nonNullable.group({ invoiceNo: ['', Validators.required], invoiceDate: [''], dueDate: [''] });
  protected readonly payForm = this.fb.nonNullable.group({ paymentMethodId: ['', Validators.required], amount: [0, [Validators.required, Validators.min(0.01)]], reference: [''] });
  protected readonly needsWarehouse = computed(() => this.qtyRowsHave('item'));
  protected readonly needsCounter = computed(() => this.qtyRowsHave('bar'));

  ngOnInit(): void {
    forkJoin({
      suppliers: this.api.get<Paged<Supplier>>('purchases/suppliers', { pageSize: 200 }), items: this.api.get<Paged<InvItem>>('inventory/items', { pageSize: 200 }),
      warehouses: this.api.get<Warehouse[]>('inventory/warehouses'), methods: this.api.get<PaymentMethod[]>('payments/methods'),
    }).subscribe(r => {
      this.suppliers.set(r.suppliers.items.filter(s => s.isActive)); this.items.set(r.items.items.filter(i => i.isActive));
      this.warehouses.set(r.warehouses.filter(w => w.isActive)); this.methods.set(r.methods);
    });
    if (this.auth.hasPermission('Bar.View')) {
      this.api.get<BarProduct[]>('bar/products').subscribe(p => this.products.set(p.filter(x => x.isActive)));
      this.api.get<BarCounter[]>('bar/counters').subscribe(c => this.counters.set(c.filter(x => x.isActive)));
    }
    this.load();
  }

  protected setTab(t: 'orders' | 'invoices'): void { this.tab.set(t); this.status = ''; this.page.set(1); this.load(); }
  protected setStatus(s: string): void { this.status = s; this.page.set(1); this.load(); }
  protected goTo(p: number): void { this.page.set(p); this.load(); }
  protected onSearch(v: string): void { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.search = v; this.page.set(1); this.load(); }, 300); }
  protected hasReceived(d: PurchaseOrder): boolean { return d.lines.some(l => l.receivedQuantity - l.returnedQuantity > 0); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    const params = { page: this.page(), pageSize: 12, search: this.search, status: this.status };
    if (this.tab() === 'orders') {
      this.api.get<Paged<PurchaseOrderSummary>>('purchases/orders', params).subscribe({ next: r => this.done(r, this.orders), error: e => this.fail(e) });
    } else {
      this.api.get<Paged<PurchaseInvoice>>('purchases/invoices', params).subscribe({ next: r => this.done(r, this.invoices), error: e => this.fail(e) });
    }
  }

  private done<T>(r: Paged<T>, target: { set(v: T[]): void }): void { target.set(r.items); this.totalPages.set(r.totalPages); this.total.set(r.totalCount); this.loading.set(false); }
  private fail(e: unknown): void { this.error.set(errorMessage(e)); this.loading.set(false); }

  protected openOrder(id: string): void { this.formError.set(''); this.api.get<PurchaseOrder>(`purchases/orders/${id}`).subscribe(d => this.detail.set(d)); }
  private refreshDetail(id: string): void { this.api.get<PurchaseOrder>(`purchases/orders/${id}`).subscribe(d => this.detail.set(d)); this.load(); }

  // ---- create / edit ----
  private lineGroup(kind: 'item' | 'bar' = 'item', refId = '', quantity = 1, unitPrice = 0, taxPercent = 0): Line {
    const first = kind === 'item' ? this.items()[0]?.id : this.products()[0]?.id;
    return new FormGroup({
      kind: new FormControl(kind, { nonNullable: true }), refId: new FormControl(refId || first || '', { nonNullable: true, validators: Validators.required }),
      quantity: new FormControl(quantity, { nonNullable: true, validators: [Validators.required, Validators.min(0.001)] }),
      unitPrice: new FormControl(unitPrice, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
      taxPercent: new FormControl(taxPercent, { nonNullable: true, validators: [Validators.min(0), Validators.max(100)] }),
    });
  }

  protected addLine(): void { this.lines.push(this.lineGroup()); }
  protected onKind(l: Line): void { const first = l.controls.kind.value === 'item' ? this.items()[0]?.id : this.products()[0]?.id; l.controls.refId.setValue(first ?? ''); }

  protected openForm(po?: PurchaseOrder): void {
    this.formError.set(''); this.detail.set(null);
    this.editingId.set(po?.id ?? null);
    this.poForm.reset({ supplierId: po?.supplierId ?? this.suppliers()[0]?.id ?? '', orderDate: po?.orderDate ?? new Date().toISOString().slice(0, 10), expectedDate: po?.expectedDate ?? '', notes: po?.notes ?? '' });
    this.lines.clear();
    for (const l of po?.lines ?? []) this.lines.push(this.lineGroup(l.inventoryItemId ? 'item' : 'bar', l.inventoryItemId ?? l.barProductId ?? '', l.quantity, l.unitPrice, l.taxPercent));
    if (!po) this.addLine();
    this.formOpen.set(true);
  }

  protected savePo(): void {
    if (this.poForm.invalid || this.lines.invalid || this.lines.length === 0) { this.poForm.markAllAsTouched(); this.lines.markAllAsTouched(); this.formError.set('Complete the supplier and every line (quantity above zero, price and tax).'); return; }
    const v = this.poForm.getRawValue();
    const body = {
      supplierId: v.supplierId, orderDate: v.orderDate || null, expectedDate: v.expectedDate || null, notes: v.notes || null,
      lines: this.lines.getRawValue().map(l => ({ inventoryItemId: l.kind === 'item' ? l.refId : null, barProductId: l.kind === 'bar' ? l.refId : null, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxPercent: Number(l.taxPercent) })),
    };
    const id = this.editingId();
    this.busy.set(true); this.formError.set('');
    (id ? this.api.put<PurchaseOrder>(`purchases/orders/${id}`, body) : this.api.post<PurchaseOrder>('purchases/orders', body)).subscribe({
      next: po => { this.busy.set(false); this.formOpen.set(false); this.toast.success('Purchase order saved'); this.detail.set(po); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected place(d: PurchaseOrder): void {
    this.busy.set(true);
    this.api.post<PurchaseOrder>(`purchases/orders/${d.id}/place`, {}).subscribe({
      next: po => { this.busy.set(false); this.detail.set(po); this.toast.success('Order placed'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected async cancelPo(d: PurchaseOrder): Promise<void> {
    if (!(await this.confirm.ask({ title: `Cancel ${d.poNo}?`, message: 'The order will be closed. This cannot be undone.', confirmText: 'Cancel order', danger: true }))) return;
    this.api.post<PurchaseOrder>(`purchases/orders/${d.id}/cancel`, {}).subscribe({ next: po => { this.detail.set(po); this.toast.success('Order cancelled'); this.load(); }, error: e => this.formError.set(errorMessage(e)) });
  }

  // ---- receive / return ----
  private qtyRowsHave(kind: 'item' | 'bar'): boolean {
    const d = this.detail();
    return !!d && this.qtyRows.controls.some(r => { const l = d.lines.find(x => x.id === r.controls.poLineId.value); return kind === 'item' ? !!l?.inventoryItemId : !!l?.barProductId; });
  }

  protected openReceive(d: PurchaseOrder): void { this.startQty(d, 'receive', l => l.remainingQuantity); }
  protected openReturn(d: PurchaseOrder): void { this.startQty(d, 'return', l => l.receivedQuantity - l.returnedQuantity); }

  private startQty(d: PurchaseOrder, mode: 'receive' | 'return', max: (l: PurchaseOrder['lines'][number]) => number): void {
    this.formError.set(''); this.qtyNote.set('');
    this.qtyRows.clear();
    for (const l of d.lines) {
      const m = max(l);
      if (m > 0) this.qtyRows.push(new FormGroup({ poLineId: new FormControl(l.id, { nonNullable: true }), description: new FormControl(l.description, { nonNullable: true }), max: new FormControl(m, { nonNullable: true }), quantity: new FormControl(mode === 'receive' ? m : 0, { nonNullable: true }) }));
    }
    this.qtyWarehouse.set(this.warehouses().find(w => w.isDefault)?.id ?? this.warehouses()[0]?.id ?? '');
    this.qtyCounter.set(this.counters().find(c => c.isDefault)?.id ?? this.counters()[0]?.id ?? '');
    this.qtyMode.set(mode);
  }

  protected submitQty(): void {
    const d = this.detail(), mode = this.qtyMode();
    if (!d || !mode) return;
    const lines = this.qtyRows.getRawValue().filter(r => Number(r.quantity) > 0).map(r => ({ poLineId: r.poLineId, quantity: Number(r.quantity) }));
    if (lines.length === 0) { this.formError.set('Enter a quantity for at least one line.'); return; }
    if (mode === 'return' && !this.qtyNote().trim()) { this.formError.set('A reason is required.'); return; }
    const common = { warehouseId: this.needsWarehouse() ? this.qtyWarehouse() : null, counterId: this.needsCounter() ? this.qtyCounter() : null };
    this.busy.set(true); this.formError.set('');
    const req = mode === 'receive'
      ? this.api.post<PurchaseOrder>(`purchases/orders/${d.id}/receive`, { ...common, notes: this.qtyNote() || null, lines })
      : this.api.post(`purchases/returns`, { purchaseOrderId: d.id, reason: this.qtyNote(), ...common, lines });
    req.subscribe({
      next: () => { this.busy.set(false); this.qtyMode.set(null); this.toast.success(mode === 'receive' ? 'Goods received into stock' : 'Return recorded'); this.refreshDetail(d.id); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  // ---- invoice / payment ----
  protected openInvoice(d: PurchaseOrder): void {
    this.formError.set('');
    this.invoiceForm.reset({ invoiceNo: '', invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '' });
    this.invoiceFor.set(d);
  }

  protected saveInvoice(): void {
    const d = this.invoiceFor();
    if (!d) return;
    if (this.invoiceForm.invalid) { this.invoiceForm.markAllAsTouched(); return; }
    const v = this.invoiceForm.getRawValue();
    this.busy.set(true); this.formError.set('');
    this.api.post<PurchaseInvoice>(`purchases/orders/${d.id}/invoice`, { invoiceNo: v.invoiceNo, invoiceDate: v.invoiceDate, dueDate: v.dueDate || null }).subscribe({
      next: () => { this.busy.set(false); this.invoiceFor.set(null); this.toast.success('Invoice recorded'); this.refreshDetail(d.id); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected openPay(i: PurchaseInvoice): void {
    this.formError.set('');
    this.payForm.reset({ paymentMethodId: this.methods()[0]?.id ?? '', amount: i.dueAmount, reference: '' });
    this.payFor.set(i);
  }

  protected savePayment(): void {
    const i = this.payFor();
    if (!i) return;
    if (this.payForm.invalid) { this.payForm.markAllAsTouched(); return; }
    const v = this.payForm.getRawValue();
    this.busy.set(true); this.formError.set('');
    this.api.post(`purchases/invoices/${i.id}/payments`, { paymentMethodId: v.paymentMethodId, amount: Number(v.amount), reference: v.reference || null }).subscribe({
      next: () => { this.busy.set(false); this.payFor.set(null); this.toast.success('Payment recorded'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }
}
