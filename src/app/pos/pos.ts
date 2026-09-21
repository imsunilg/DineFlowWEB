import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { Bill, Customer, FloorLayout, MenuItem, MenuTree, ORDER_TYPES, Order, OrderLine, OrderType, Paged } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ConfirmService, ModalComponent, SkeletonComponent } from '../shared/ui';
import { PaymentModalComponent } from './payment-modal';

const TABLE_DOT: Record<string, string> = { Available: 'bg-emerald-500', Reserved: 'bg-amber-500', Occupied: 'bg-rose-500', Cleaning: 'bg-sky-500', Blocked: 'bg-gray-400' };

/**
 * Point of sale. Flow: pick table -> tap items -> adjust qty / note -> Send.
 * The server owns every price and total; this screen only sends ids, quantities and notes.
 */
@Component({
  selector: 'app-pos',
  imports: [ModalComponent, PaymentModalComponent, SkeletonComponent],
  template: `
    <div class="mx-auto grid max-w-[1500px] gap-4 lg:h-[calc(100vh-7rem)] lg:grid-cols-[minmax(0,1fr)_400px]">
      <!-- LEFT: table + menu -->
      <section class="flex min-h-0 flex-col gap-3">
        <div class="card flex flex-wrap items-center gap-2 p-3">
          @for (t of orderTypes; track t.value) {
            <button type="button" class="btn" [class]="orderType() === t.value ? 'bg-ink text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'" [disabled]="lockedType()" (click)="setType(t.value)">
              <span class="mi">{{ t.icon }}</span>{{ t.label }}
            </button>
          }
          @if (orderType() === 'DineIn' && selectedTable(); as st) {
            <span class="ml-auto flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand">
              <span class="mi">table_restaurant</span>Table {{ st.code }} · {{ st.capacity }} seats
              @if (!order()) { <button type="button" class="ml-1 text-xs underline" (click)="clearTable()">change</button> }
            </span>
          }
        </div>

        @if (orderType() === 'DineIn' && !tableId()) {
          <div class="card min-h-0 flex-1 overflow-y-auto p-5">
            <h2 class="mb-1 text-base font-semibold text-gray-900">Select a table</h2>
            <p class="mb-4 text-sm text-gray-500">Occupied tables open their running order.</p>
            @if (loading()) { <app-skeleton [count]="3" /> }
            @for (f of layout(); track f.id) {
              <h3 class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{{ f.name }}</h3>
              <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                @for (t of f.tables; track t.id) {
                  <button type="button" class="rounded-2xl border-2 border-gray-100 bg-white p-3 text-left transition hover:border-brand disabled:opacity-40" [disabled]="t.status === 'Blocked'" (click)="pickTable(t.id)" [attr.aria-label]="'Table ' + t.code + ' ' + t.status">
                    <div class="flex items-center justify-between"><span class="text-lg font-bold">{{ t.code }}</span><span class="h-2.5 w-2.5 rounded-full" [class]="dot[t.status]"></span></div>
                    <p class="text-xs text-gray-500">{{ t.capacity }} seats · {{ t.status }}</p>
                  </button>
                }
              </div>
            }
          </div>
        } @else {
          <div class="card flex flex-wrap items-center gap-2 p-3">
            <div class="relative min-w-48 flex-1">
              <span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
              <input class="input pl-10" placeholder="Search items" aria-label="Search items" [value]="search()" (input)="search.set($any($event.target).value)" />
            </div>
            @for (a of areaOptions(); track a) {
              <button type="button" class="badge cursor-pointer px-3 py-1.5 ring-1 ring-gray-200" [class]="area() === a ? 'bg-ink text-white' : 'bg-white text-gray-700'" (click)="area.set(a)">{{ a === '' ? 'All' : a }}</button>
            }
          </div>
          <div class="flex gap-2 overflow-x-auto pb-1">
            <button type="button" class="badge shrink-0 cursor-pointer px-3 py-1.5" [class]="categoryId() === '' ? 'bg-brand text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'" (click)="categoryId.set('')">All items</button>
            @for (c of categories(); track c.id) {
              <button type="button" class="badge shrink-0 cursor-pointer px-3 py-1.5" [class]="categoryId() === c.id ? 'bg-brand text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'" (click)="categoryId.set(c.id)">{{ c.name }}</button>
            }
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto">
            @if (loading()) { <app-skeleton [count]="4" /> }
            @else if (items().length === 0) { <p class="py-16 text-center text-sm text-gray-500">No items match.</p> }
            <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              @for (i of items(); track i.id) {
                <button type="button" class="card group flex flex-col gap-1 p-4 text-left transition hover:shadow-md active:scale-[0.98]" [disabled]="busy()" (click)="tapItem(i)">
                  <span class="flex items-center gap-2"><span class="h-3 w-3 rounded-sm border-2" [class]="i.isVeg ? 'border-emerald-600' : 'border-rose-600'"></span><span class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{{ i.categoryName }}</span></span>
                  <span class="line-clamp-2 text-sm font-semibold text-gray-900">{{ i.name }}</span>
                  <span class="mt-auto flex items-center justify-between pt-2">
                    <span class="text-base font-bold text-brand">{{ branding.money(i.basePrice) }}</span>
                    @if (i.variants.length || i.addons.length) { <span class="text-[11px] text-gray-400">options</span> }
                  </span>
                </button>
              }
            </div>
          </div>
        }
      </section>

      <!-- RIGHT: cart -->
      <aside class="card flex min-h-[28rem] min-w-0 flex-col overflow-hidden">
        <header class="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <p class="text-sm font-semibold text-gray-900">{{ order() ? order()!.orderNo : 'New order' }}</p>
            <p class="text-xs text-gray-500">{{ headline() }}</p>
          </div>
          <button type="button" class="btn-ghost px-3 py-1.5" (click)="openCustomer()"><span class="mi">person</span>{{ order()?.customerName ?? customerName() ?? 'Guest' }}</button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          @if (lines().length === 0) {
            <div class="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-gray-400"><span class="mi text-5xl!">shopping_basket</span><p class="text-sm">Tap items to add them to the order</p></div>
          }
          @for (l of lines(); track l.id) {
            <div class="border-b border-gray-50 px-2 py-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-gray-900">{{ l.itemName }}@if (l.variantName) { <span class="font-normal text-gray-500"> · {{ l.variantName }}</span> }</p>
                  @if (l.addons.length) { <p class="text-xs text-gray-500">+ {{ addonText(l) }}</p> }
                  @if (l.notes) { <p class="text-xs italic text-amber-700">“{{ l.notes }}”</p> }
                </div>
                <p class="shrink-0 text-sm font-semibold">{{ branding.money(l.lineSubtotal) }}</p>
              </div>
              <div class="mt-2 flex items-center justify-between">
                @if (l.status === 'Draft') {
                  <div class="flex items-center gap-1">
                    <button type="button" class="grid h-8 w-8 place-items-center rounded-lg bg-gray-100 text-lg hover:bg-gray-200 disabled:opacity-40" aria-label="Decrease" [disabled]="busy()" (click)="changeQty(l, -1)">−</button>
                    <span class="w-8 text-center text-sm font-bold">{{ l.quantity }}</span>
                    <button type="button" class="grid h-8 w-8 place-items-center rounded-lg bg-gray-100 text-lg hover:bg-gray-200 disabled:opacity-40" aria-label="Increase" [disabled]="busy()" (click)="changeQty(l, 1)">+</button>
                    <button type="button" class="ml-1 grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-amber-50 hover:text-amber-700" aria-label="Add note" (click)="openNote(l)"><span class="mi text-lg!">edit_note</span></button>
                  </div>
                  <button type="button" class="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove" (click)="removeLine(l)"><span class="mi text-lg!">delete</span></button>
                } @else {
                  <div class="flex items-center gap-2"><span class="text-sm text-gray-600">×{{ l.quantity }}</span><span class="badge" [class]="statusClass(l.status)">{{ l.status }}</span><span class="text-[11px] text-gray-400">{{ l.station }}</span></div>
                  @if (canCancel() && l.status !== 'Served') { <button type="button" class="text-xs font-semibold text-red-600 hover:underline" (click)="askCancelLine(l)">Cancel</button> }
                }
              </div>
            </div>
          }
        </div>

        @if (order(); as o) {
          <div class="space-y-1 border-t border-gray-100 bg-gray-50/60 px-5 py-3 text-sm">
            <div class="flex justify-between text-gray-600"><span>Subtotal</span><span>{{ branding.money(o.subtotal) }}</span></div>
            @if (o.discountAmount > 0) { <div class="flex justify-between text-emerald-700"><span>Discount</span><span>-{{ branding.money(o.discountAmount) }}</span></div> }
            @if (o.taxAmount > 0) { <div class="flex justify-between text-gray-600"><span>Tax</span><span>{{ branding.money(o.taxAmount) }}</span></div> }
            @if (o.serviceChargeAmount > 0) { <div class="flex justify-between text-gray-600"><span>Service charge</span><span>{{ branding.money(o.serviceChargeAmount) }}</span></div> }
            @if (o.roundOff !== 0) { <div class="flex justify-between text-gray-600"><span>Round off</span><span>{{ branding.money(o.roundOff) }}</span></div> }
            <div class="flex justify-between pt-1 text-lg font-bold text-gray-900"><span>Total</span><span>{{ branding.money(o.grandTotal) }}</span></div>
          </div>
        }

        <footer class="grid grid-cols-2 gap-2 border-t border-gray-100 p-3">
          <button type="button" class="btn-primary col-span-2 py-3 text-base" [disabled]="busy() || draftCount() === 0" (click)="send()"><span class="mi">send</span>Send to kitchen{{ draftCount() ? ' (' + draftCount() + ')' : '' }}</button>
          @if (canBill()) { <button type="button" class="btn-ghost" [disabled]="busy() || !canGenerate()" (click)="billAndPay()"><span class="mi">payments</span>Bill & pay</button> }
          @if (canDiscount()) { <button type="button" class="btn-ghost" [disabled]="busy() || !order()" (click)="openDiscount()"><span class="mi">percent</span>Discount</button> }
          @if (order()?.status === 'Ready') { <button type="button" class="btn-ghost col-span-2" [disabled]="busy()" (click)="serve()"><span class="mi">room_service</span>Mark served</button> }
          @if (canCancelOrder() && order()) { <button type="button" class="col-span-2 text-xs font-semibold text-red-600 hover:underline" (click)="askCancelOrder()">Cancel order</button> }
        </footer>
      </aside>
    </div>

    <!-- item options -->
    <app-modal [open]="chooser() !== null" [title]="chooser()?.name ?? ''" (closed)="chooser.set(null)">
      @if (chooser(); as c) {
        <div class="space-y-4">
          @if (c.variants.length) {
            <fieldset><legend class="label">Choose one</legend>
              <label class="mb-1 flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm" [class]="pickVariant() === '' ? 'border-brand bg-brand/5' : 'border-gray-200'">
                <span class="flex items-center gap-2"><input type="radio" name="variant" [checked]="pickVariant() === ''" (change)="pickVariant.set('')" />Regular</span><span class="font-semibold">{{ branding.money(c.basePrice) }}</span></label>
              @for (v of c.variants; track v.id) {
                <label class="mb-1 flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm" [class]="pickVariant() === v.id ? 'border-brand bg-brand/5' : 'border-gray-200'">
                  <span class="flex items-center gap-2"><input type="radio" name="variant" [checked]="pickVariant() === v.id" (change)="pickVariant.set(v.id!)" />{{ v.name }}</span><span class="font-semibold">{{ branding.money(v.price) }}</span></label>
              }
            </fieldset>
          }
          @if (c.addons.length) {
            <fieldset><legend class="label">Add-ons</legend>
              @for (a of c.addons; track a.id) {
                <label class="mb-1 flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <span class="flex items-center gap-2"><input type="checkbox" [checked]="pickAddons().includes(a.id!)" (change)="toggleAddon(a.id!)" />{{ a.name }}</span><span class="font-semibold">+{{ branding.money(a.price) }}</span></label>
              }
            </fieldset>
          }
          <div><label class="label" for="optnote">Special instructions</label><input id="optnote" class="input" maxlength="300" placeholder="e.g. less spicy" [value]="pickNote()" (input)="pickNote.set($any($event.target).value)" /></div>
          <div class="flex items-center justify-between"><span class="label mb-0">Quantity</span>
            <div class="flex items-center gap-2"><button type="button" class="grid h-9 w-9 place-items-center rounded-lg bg-gray-100 text-lg" aria-label="Decrease" (click)="pickQty.set(Math.max(1, pickQty() - 1))">−</button><span class="w-8 text-center font-bold">{{ pickQty() }}</span><button type="button" class="grid h-9 w-9 place-items-center rounded-lg bg-gray-100 text-lg" aria-label="Increase" (click)="pickQty.set(Math.min(99, pickQty() + 1))">+</button></div></div>
        </div>
      }
      <div modal-actions><button type="button" class="btn-ghost" (click)="chooser.set(null)">Cancel</button><button type="button" class="btn-primary" [disabled]="busy()" (click)="confirmChooser()">Add to order</button></div>
    </app-modal>

    <!-- note on a draft line -->
    <app-modal [open]="noteLine() !== null" title="Special instructions" (closed)="noteLine.set(null)">
      <input class="input" maxlength="300" aria-label="Special instructions" placeholder="e.g. no onions, extra hot" [value]="noteText()" (input)="noteText.set($any($event.target).value)" (keydown.enter)="saveNote()" />
      <div modal-actions><button type="button" class="btn-ghost" (click)="noteLine.set(null)">Cancel</button><button type="button" class="btn-primary" (click)="saveNote()">Save note</button></div>
    </app-modal>

    <!-- customer -->
    <app-modal [open]="customerOpen()" title="Select customer" (closed)="customerOpen.set(false)">
      <input class="input mb-3" placeholder="Search by name or phone" aria-label="Search customers" (input)="searchCustomers($any($event.target).value)" />
      <button type="button" class="mb-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50" (click)="pickCustomer(null)">Guest (no customer)</button>
      @for (c of customers(); track c.id) {
        <button type="button" class="mb-1 flex w-full items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50" (click)="pickCustomer(c)"><span class="font-semibold">{{ c.fullName }}</span><span class="text-gray-500">{{ c.phone }}</span></button>
      }
    </app-modal>

    <!-- discount -->
    <app-modal [open]="discountOpen()" title="Apply discount" (closed)="discountOpen.set(false)">
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="dtype">Type</label><select id="dtype" class="input" [value]="discType()" (change)="discType.set($any($event.target).value)"><option value="Percent">Percent</option><option value="Amount">Amount</option></select></div>
          <div><label class="label" for="dval">Value</label><input id="dval" class="input" type="number" min="0" step="0.01" [value]="discValue()" (input)="discValue.set(+$any($event.target).value)" /></div>
        </div>
        <div><label class="label" for="dreason">Reason</label><input id="dreason" class="input" maxlength="200" [value]="discReason()" (input)="discReason.set($any($event.target).value)" /></div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </div>
      <div modal-actions>
        @if ((order()?.discountAmount ?? 0) > 0) { <button type="button" class="btn-ghost mr-auto" (click)="clearDiscount()">Remove discount</button> }
        <button type="button" class="btn-ghost" (click)="discountOpen.set(false)">Cancel</button><button type="button" class="btn-primary" (click)="applyDiscount()">Apply</button>
      </div>
    </app-modal>

    <!-- cancel with reason -->
    <app-modal [open]="cancelTarget() !== null" [title]="cancelTarget()?.kind === 'order' ? 'Cancel this order?' : 'Cancel this item?'" (closed)="cancelTarget.set(null)">
      <label class="label" for="creason">Reason (required)</label>
      <input id="creason" class="input" maxlength="300" [value]="cancelReason()" (input)="cancelReason.set($any($event.target).value)" />
      @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      <div modal-actions><button type="button" class="btn-ghost" (click)="cancelTarget.set(null)">Keep</button><button type="button" class="btn-danger" (click)="confirmCancel()">Cancel {{ cancelTarget()?.kind === 'order' ? 'order' : 'item' }}</button></div>
    </app-modal>

    <app-payment-modal [bill]="bill()" (finished)="onPaid($event)" (closed)="closePayment()" />`,
})
export class PosComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  protected readonly branding = inject(BrandingService);
  protected readonly Math = Math;

  protected readonly orderTypes = ORDER_TYPES;
  protected readonly dot = TABLE_DOT;

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly layout = signal<FloorLayout[]>([]);
  protected readonly tree = signal<MenuTree[]>([]);
  protected readonly order = signal<Order | null>(null);
  protected readonly orderType = signal<OrderType>('DineIn');
  protected readonly tableId = signal<string | null>(null);
  protected readonly customer = signal<Customer | null>(null);
  protected readonly search = signal('');
  protected readonly area = signal((inject(ActivatedRoute).snapshot.data['area'] as string | undefined) ?? '');
  protected readonly categoryId = signal('');

  protected readonly chooser = signal<MenuItem | null>(null);
  protected readonly pickVariant = signal('');
  protected readonly pickAddons = signal<string[]>([]);
  protected readonly pickNote = signal('');
  protected readonly pickQty = signal(1);
  protected readonly noteLine = signal<OrderLine | null>(null);
  protected readonly noteText = signal('');
  protected readonly customerOpen = signal(false);
  protected readonly customers = signal<Customer[]>([]);
  protected readonly discountOpen = signal(false);
  protected readonly discType = signal('Percent');
  protected readonly discValue = signal(0);
  protected readonly discReason = signal('');
  protected readonly cancelTarget = signal<{ kind: 'order' } | { kind: 'line'; line: OrderLine } | null>(null);
  protected readonly cancelReason = signal('');
  protected readonly bill = signal<Bill | null>(null);

  protected readonly can = (p: string) => this.auth.hasPermission(p);
  protected readonly canBill = computed(() => this.can('Payment.Create'));
  protected readonly canDiscount = computed(() => this.can('Order.Discount'));
  protected readonly canCancel = computed(() => this.can('Order.Cancel'));
  protected readonly canCancelOrder = computed(() => this.can('Order.Cancel'));

  protected readonly selectedTable = computed(() => this.layout().flatMap(f => f.tables).find(t => t.id === this.tableId()) ?? null);
  protected readonly lines = computed(() => (this.order()?.lines ?? []).filter(l => l.status !== 'Cancelled'));
  protected readonly draftCount = computed(() => this.lines().filter(l => l.status === 'Draft').length);
  protected readonly canGenerate = computed(() => this.lines().length > 0 && this.draftCount() === 0);
  protected readonly lockedType = computed(() => this.order() !== null);
  protected readonly customerName = computed(() => this.customer()?.fullName ?? null);
  protected readonly headline = computed(() => {
    const o = this.order();
    const where = this.orderType() === 'DineIn' ? (this.selectedTable() ? `Table ${this.selectedTable()!.code}` : 'No table') : this.orderTypes.find(t => t.value === this.orderType())!.label;
    return o ? `${where} · ${o.status}` : where;
  });

  protected readonly allItems = computed(() => this.tree().flatMap(m => m.categories.flatMap(c => c.items.map(i => ({ ...i, categoryName: c.name, serviceArea: c.serviceArea })))));
  protected readonly areaOptions = computed(() => ['', ...new Set(this.tree().flatMap(m => m.categories.map(c => c.serviceArea)))]);
  protected readonly categories = computed(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const m of this.tree()) for (const c of m.categories) if (!this.area() || c.serviceArea === this.area()) seen.set(c.id, { id: c.id, name: c.name });
    return [...seen.values()];
  });
  protected readonly items = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.allItems().filter(i => (!this.area() || i.serviceArea === this.area()) && (!this.categoryId() || i.categoryId === this.categoryId())
      && (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)));
  });

  ngOnInit(): void {
    this.api.get<MenuTree[]>('menu', { onlyAvailable: true }).subscribe({ next: t => { this.tree.set(t); this.loading.set(false); }, error: e => { this.loading.set(false); this.toast.error(errorMessage(e)); } });
    this.loadLayout(() => { const t = this.route.snapshot.queryParamMap.get('table'); if (t) this.pickTable(t); });
  }

  private loadLayout(then?: () => void): void {
    this.api.get<FloorLayout[]>('tables/layout').subscribe({ next: l => { this.layout.set(l); then?.(); }, error: e => this.toast.error(errorMessage(e)) });
  }

  protected setType(t: OrderType): void { this.orderType.set(t); if (t !== 'DineIn') { this.tableId.set(null); } }
  protected clearTable(): void { this.tableId.set(null); this.order.set(null); }

  protected pickTable(id: string): void {
    this.tableId.set(id);
    this.order.set(null);
    this.api.get<Order | null>(`orders/by-table/${id}`).subscribe({
      next: o => { if (o) { this.order.set(o); this.orderType.set(o.orderType); } },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  // ---- adding items ----
  protected tapItem(i: MenuItem): void {
    if (this.orderType() === 'DineIn' && !this.tableId()) { this.toast.error('Select a table first.'); return; }
    const activeVariants = i.variants.filter(v => v.isActive), activeAddons = i.addons.filter(a => a.isActive);
    if (activeVariants.length || activeAddons.length) {
      this.pickVariant.set(''); this.pickAddons.set([]); this.pickNote.set(''); this.pickQty.set(1);
      this.chooser.set({ ...i, variants: activeVariants, addons: activeAddons });
      return;
    }
    void this.addToOrder({ menuItemId: i.id, variantId: null, addonIds: [], quantity: 1, notes: null });
  }

  protected toggleAddon(id: string): void { this.pickAddons.update(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id])); }

  protected confirmChooser(): void {
    const c = this.chooser();
    if (!c) return;
    void this.addToOrder({ menuItemId: c.id, variantId: this.pickVariant() || null, addonIds: this.pickAddons(), quantity: this.pickQty(), notes: this.pickNote().trim() || null });
    this.chooser.set(null);
  }

  private async addToOrder(body: { menuItemId: string; variantId: string | null; addonIds: string[]; quantity: number; notes: string | null }): Promise<void> {
    await this.run(async () => {
      let o = this.order();
      if (!o) {
        try {
          o = await firstValueFrom(this.api.post<Order>('orders', { orderType: this.orderType(), tableId: this.tableId(), customerId: this.customer()?.id ?? null }));
        } catch (e) {
          const err = e as { error?: { errors?: { code: string }[] } };
          if (err.error?.errors?.[0]?.code !== 'TABLE_HAS_OPEN_ORDER') throw e;
          o = await firstValueFrom(this.api.get<Order | null>(`orders/by-table/${this.tableId()}`));   // another waiter opened it first: join it
          if (!o) throw e;
        }
      }
      this.order.set(await firstValueFrom(this.api.post<Order>(`orders/${o.id}/items`, body)));
    });
  }

  protected changeQty(l: OrderLine, delta: number): void {
    const q = l.quantity + delta;
    if (q < 1) { this.removeLine(l); return; }
    if (q > 99) return;
    void this.run(async () => this.order.set(await firstValueFrom(this.api.put<Order>(`orders/${this.order()!.id}/items/${l.id}`, { quantity: q, notes: l.notes }))));
  }

  protected removeLine(l: OrderLine): void {
    void this.run(async () => this.order.set(await firstValueFrom(this.api.post<Order>(`orders/${this.order()!.id}/items/${l.id}/cancel`, { reason: null }))));
  }

  protected openNote(l: OrderLine): void { this.noteText.set(l.notes ?? ''); this.noteLine.set(l); }
  protected saveNote(): void {
    const l = this.noteLine();
    if (!l) return;
    this.noteLine.set(null);
    void this.run(async () => this.order.set(await firstValueFrom(this.api.put<Order>(`orders/${this.order()!.id}/items/${l.id}`, { quantity: l.quantity, notes: this.noteText().trim() || null }))));
  }

  protected addonText(l: OrderLine): string { return l.addons.map(a => a.name).join(', '); }
  protected statusClass(s: string): string {
    return ({ New: 'bg-sky-100 text-sky-700', Accepted: 'bg-indigo-100 text-indigo-700', Preparing: 'bg-amber-100 text-amber-700', Ready: 'bg-emerald-100 text-emerald-700', Served: 'bg-gray-100 text-gray-600' } as Record<string, string>)[s] ?? 'bg-gray-100 text-gray-600';
  }

  // ---- workflow ----
  protected send(): void {
    void this.run(async () => {
      this.order.set(await firstValueFrom(this.api.post<Order>(`orders/${this.order()!.id}/send`, {})));
      this.toast.success('Sent to the kitchen and bar');
      this.loadLayout();
    });
  }

  protected serve(): void { void this.run(async () => this.order.set(await firstValueFrom(this.api.post<Order>(`orders/${this.order()!.id}/serve`, {})))); }

  protected billAndPay(): void {
    void this.run(async () => this.bill.set(await firstValueFrom(this.api.post<Bill>(`billing/orders/${this.order()!.id}/generate`, {}))));
  }

  protected onPaid(b: Bill): void { this.bill.set(b); }

  protected closePayment(): void {
    const b = this.bill();
    this.bill.set(null);
    if (b?.status === 'Paid') { this.order.set(null); this.customer.set(null); this.tableId.set(null); this.loadLayout(); }
    else if (this.order()) this.refreshOrder();
  }

  private refreshOrder(): void { const o = this.order(); if (o) this.api.get<Order>(`orders/${o.id}`).subscribe(x => this.order.set(x)); }

  // ---- customer / discount / cancel ----
  protected openCustomer(): void { this.customerOpen.set(true); this.searchCustomers(''); }
  protected searchCustomers(q: string): void { this.api.get<Paged<Customer>>('customers', { pageSize: 12, search: q }).subscribe(r => this.customers.set(r.items)); }
  protected pickCustomer(c: Customer | null): void {
    this.customerOpen.set(false);
    this.customer.set(c);
    const o = this.order();
    if (o) void this.run(async () => this.order.set(await firstValueFrom(this.api.put<Order>(`orders/${o.id}/customer`, { customerId: c?.id ?? null }))));
  }

  protected openDiscount(): void {
    const o = this.order();
    this.formError.set(''); this.discType.set(o?.discountType ?? 'Percent'); this.discValue.set(o?.discountValue ?? 0); this.discReason.set(o?.discountReason ?? '');
    this.discountOpen.set(true);
  }

  protected applyDiscount(): void {
    const o = this.order();
    if (!o) return;
    this.busy.set(true); this.formError.set('');
    this.api.post<Order>(`orders/${o.id}/discount`, { type: this.discType(), value: this.discValue(), reason: this.discReason() }).subscribe({
      next: u => { this.busy.set(false); this.order.set(u); this.discountOpen.set(false); this.toast.success('Discount updated'); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected clearDiscount(): void { this.discValue.set(0); this.discReason.set(''); this.applyDiscount(); }

  protected askCancelLine(line: OrderLine): void { this.cancelReason.set(''); this.formError.set(''); this.cancelTarget.set({ kind: 'line', line }); }
  protected askCancelOrder(): void { this.cancelReason.set(''); this.formError.set(''); this.cancelTarget.set({ kind: 'order' }); }

  protected confirmCancel(): void {
    const target = this.cancelTarget(), o = this.order();
    if (!target || !o) return;
    if (!this.cancelReason().trim()) { this.formError.set('A reason is required.'); return; }
    this.busy.set(true);
    const req = target.kind === 'order'
      ? this.api.post<Order>(`orders/${o.id}/cancel`, { reason: this.cancelReason() })
      : this.api.post<Order>(`orders/${o.id}/items/${target.line.id}/cancel`, { reason: this.cancelReason() });
    req.subscribe({
      next: u => {
        this.busy.set(false); this.cancelTarget.set(null);
        if (target.kind === 'order') { this.order.set(null); this.tableId.set(null); this.toast.success('Order cancelled'); this.loadLayout(); } else this.order.set(u);
      },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try { await action(); }
    catch (e) { this.toast.error(errorMessage(e)); this.refreshOrder(); }
    finally { this.busy.set(false); }
  }
}
