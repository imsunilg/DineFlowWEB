import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { CustomerPayment, CustomerProfile, LoyaltyAccount, LoyaltyTxn, Paged } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DrawerComponent } from '../shared/ui';

type Tab = 'overview' | 'preferences' | 'notes' | 'addresses' | 'history' | 'loyalty';
const CATEGORIES = ['Food', 'Drink', 'Seating', 'Dietary', 'Allergy', 'Other'];

/** Customer 360 drawer: statistics, loyalty, preferences, notes, addresses and history in one place. */
@Component({
  selector: 'app-customer-profile',
  imports: [DatePipe, DecimalPipe, DrawerComponent],
  template: `
    <app-drawer [open]="customerId() !== null" [title]="profile()?.customer?.fullName ?? 'Customer'" (closed)="closed.emit()">
      @if (profile(); as p) {
        <div class="-mt-2 mb-4 flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
          @for (t of tabs; track t.key) {
            <button type="button" role="tab" [attr.aria-selected]="tab() === t.key" class="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition" [class]="tab() === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'" (click)="setTab(t.key)">{{ t.label }}</button>
          }
        </div>

        @switch (tab()) {
          @case ('overview') {
            <div class="space-y-5">
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-2xl bg-brand/5 p-4"><p class="text-2xl font-bold text-gray-900">{{ branding.money(p.stats.totalSpend) }}</p><p class="text-xs text-gray-500">Total spend</p></div>
                <div class="rounded-2xl bg-gray-50 p-4"><p class="text-2xl font-bold text-gray-900">{{ p.stats.totalOrders }}</p><p class="text-xs text-gray-500">Orders · {{ p.stats.totalVisits }} visits</p></div>
                <div class="rounded-2xl bg-gray-50 p-4"><p class="text-2xl font-bold text-gray-900">{{ branding.money(p.stats.averageOrderValue) }}</p><p class="text-xs text-gray-500">Average order</p></div>
                <div class="rounded-2xl bg-gray-50 p-4"><p class="text-base font-bold text-gray-900">{{ p.stats.lastVisit ? (p.stats.lastVisit | date: 'mediumDate') : 'No visits yet' }}</p><p class="text-xs text-gray-500">Last visit</p></div>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div><p class="label">Favourite dishes</p>@for (f of p.stats.favoriteItems; track f.name) { <p class="text-sm text-gray-700">{{ f.name }} <span class="text-gray-400">×{{ f.quantity }}</span></p> } @empty { <p class="text-sm text-gray-400">—</p> }</div>
                <div><p class="label">Favourite drinks</p>@for (f of p.stats.favoriteDrinks; track f.name) { <p class="text-sm text-gray-700">{{ f.name }} <span class="text-gray-400">×{{ f.quantity }}</span></p> } @empty { <p class="text-sm text-gray-400">—</p> }</div>
              </div>
              <dl class="grid grid-cols-2 gap-3 text-sm">
                <div><dt class="label">Phone</dt><dd class="text-gray-700">{{ p.customer.phone || '—' }}</dd></div><div><dt class="label">Email</dt><dd class="text-gray-700">{{ p.customer.email || '—' }}</dd></div>
                <div><dt class="label">Birthday</dt><dd class="text-gray-700">{{ p.customer.birthday || '—' }}</dd></div><div><dt class="label">Anniversary</dt><dd class="text-gray-700">{{ p.customer.anniversary || '—' }}</dd></div>
              </dl>
            </div>
          }
          @case ('loyalty') {
            <div class="space-y-5">
              @if (p.loyalty; as l) {
                <div class="rounded-2xl bg-ink p-5 text-white">
                  <div class="flex items-end justify-between"><div><p class="text-xs uppercase tracking-wider text-white/60">{{ l.tierName || 'Member' }}</p><p class="text-4xl font-bold">{{ l.pointsBalance | number }}</p><p class="text-xs text-white/60">points · {{ l.lifetimePoints | number }} lifetime</p></div>
                    <div class="text-right"><p class="text-xs text-white/60">Referral code</p><p class="font-mono text-lg font-bold">{{ l.referralCode }}</p></div></div>
                </div>
                @if (canManageLoyalty()) {
                  <div class="rounded-xl border border-gray-200 p-4"><p class="label">Adjust points</p>
                    <div class="grid grid-cols-5 gap-2"><input class="input col-span-2" type="number" placeholder="+50 or -20" aria-label="Points" [value]="adjustPoints()" (input)="adjustPoints.set(+$any($event.target).value)" />
                      <input class="input col-span-3" placeholder="Reason" aria-label="Reason" maxlength="300" [value]="adjustReason()" (input)="adjustReason.set($any($event.target).value)" /></div>
                    <button type="button" class="btn-primary mt-2" [disabled]="busy() || !adjustPoints() || !adjustReason().trim()" (click)="adjust()">Apply adjustment</button></div>
                }
                <div><p class="label">Points history</p>
                  @for (t of txns(); track t.id) { <div class="flex items-center justify-between border-b border-gray-50 py-2 text-sm"><div><p class="font-semibold text-gray-800">{{ t.type }}</p><p class="text-xs text-gray-500">{{ t.notes }} · {{ t.createdAt | date: 'short' }}</p></div>
                    <p class="font-semibold" [class]="t.points < 0 ? 'text-red-600' : 'text-emerald-600'">{{ t.points > 0 ? '+' : '' }}{{ t.points }}</p></div> } @empty { <p class="text-sm text-gray-400">No activity yet.</p> }</div>
              } @else {
                <div class="rounded-2xl border border-dashed border-gray-300 p-6 text-center"><p class="text-sm text-gray-600">Not a loyalty member yet. Members are added automatically on their first paid bill.</p>
                  @if (canManageLoyalty()) { <button type="button" class="btn-primary mt-3" [disabled]="busy()" (click)="enroll()">Enrol now</button> }</div>
              }
            </div>
          }
          @case ('preferences') {
            <div class="space-y-4">
              <div class="flex flex-wrap gap-2">@for (x of p.preferences; track x.id) { <span class="badge gap-1.5 bg-gray-100 px-3 py-1.5 text-gray-700"><b>{{ x.category }}:</b> {{ x.value }}@if (canUpdate()) { <button type="button" class="text-gray-400 hover:text-red-600" [attr.aria-label]="'Remove ' + x.value" (click)="removePref(x.id)"><span class="mi text-sm!">close</span></button> }</span> } @empty { <p class="text-sm text-gray-400">No preferences recorded.</p> }</div>
              @if (canUpdate()) {
                <div class="grid grid-cols-5 gap-2"><select class="input col-span-2" aria-label="Category" [value]="prefCategory()" (change)="prefCategory.set($any($event.target).value)">@for (c of categories; track c) { <option [value]="c">{{ c }}</option> }</select>
                  <input class="input col-span-3" placeholder="e.g. Prefers a window table" aria-label="Preference" maxlength="200" [value]="prefValue()" (input)="prefValue.set($any($event.target).value)" (keydown.enter)="addPref()" /></div>
                <button type="button" class="btn-primary" [disabled]="busy() || !prefValue().trim()" (click)="addPref()">Add preference</button>
              }
            </div>
          }
          @case ('notes') {
            <div class="space-y-4">
              @for (n of p.notes; track n.id) { <div class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p>{{ n.note }}</p><p class="mt-1 flex items-center justify-between text-xs text-amber-700">{{ n.createdAt | date: 'medium' }}@if (canUpdate()) { <button type="button" class="hover:underline" (click)="removeNote(n.id)">Remove</button> }</p></div> } @empty { <p class="text-sm text-gray-400">No notes yet.</p> }
              @if (canUpdate()) { <textarea class="input" rows="3" maxlength="1000" placeholder="Add a private note for staff" aria-label="Note" [value]="noteText()" (input)="noteText.set($any($event.target).value)"></textarea>
                <button type="button" class="btn-primary" [disabled]="busy() || !noteText().trim()" (click)="addNote()">Save note</button> }
            </div>
          }
          @case ('addresses') {
            <div class="space-y-3">
              @for (a of p.addresses; track a.id) { <div class="rounded-xl border border-gray-200 p-3 text-sm"><p class="flex items-center gap-2 font-semibold text-gray-900">{{ a.label }}@if (a.isDefault) { <span class="badge bg-brand/10 text-brand">Default</span> }</p><p class="text-gray-600">{{ a.line1 }}@if (a.line2) { , {{ a.line2 }} }@if (a.city) { , {{ a.city }} } {{ a.postalCode }}</p>
                @if (canUpdate()) { <button type="button" class="mt-1 text-xs text-red-600 hover:underline" (click)="removeAddress(a.id)">Remove</button> }</div> } @empty { <p class="text-sm text-gray-400">No saved addresses.</p> }
              @if (canUpdate()) {
                <div class="grid grid-cols-2 gap-2"><input class="input" placeholder="Label (Home, Office)" aria-label="Label" [value]="addr().label" (input)="setAddr('label', $any($event.target).value)" /><input class="input" placeholder="City" aria-label="City" [value]="addr().city" (input)="setAddr('city', $any($event.target).value)" />
                  <input class="input col-span-2" placeholder="Address line" aria-label="Address line" [value]="addr().line1" (input)="setAddr('line1', $any($event.target).value)" /></div>
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="addr().isDefault" (change)="setAddr('isDefault', $any($event.target).checked)" /> Default address</label>
                <button type="button" class="btn-primary" [disabled]="busy() || !addr().line1.trim() || !addr().label.trim()" (click)="addAddress()">Add address</button>
              }
            </div>
          }
          @case ('history') {
            <div class="space-y-5">
              <div><p class="label">Recent orders</p>@for (o of p.recentOrders; track o.id) { <div class="flex items-center justify-between border-b border-gray-50 py-2 text-sm"><div><p class="font-semibold text-gray-800">{{ o.orderNo }}</p><p class="text-xs text-gray-500">{{ o.createdAt | date: 'medium' }} · {{ o.status }}</p></div><p class="font-semibold">{{ branding.money(o.grandTotal) }}</p></div> } @empty { <p class="text-sm text-gray-400">No orders yet.</p> }</div>
              <div><p class="label">Payments</p>@for (x of payments(); track x.billId) { <div class="flex items-center justify-between border-b border-gray-50 py-2 text-sm"><div><p class="font-semibold text-gray-800">{{ x.billNo }}</p><p class="text-xs text-gray-500">{{ x.paidAt | date: 'medium' }} · {{ x.methods }}</p></div><p class="font-semibold">{{ branding.money(x.amount) }}</p></div> } @empty { <p class="text-sm text-gray-400">No payments yet.</p> }</div>
            </div>
          }
        }
        @if (error()) { <p class="field-error mt-3">{{ error() }}</p> }
      } @else { <div class="space-y-3"><div class="h-10 animate-pulse rounded-xl bg-gray-100"></div><div class="h-32 animate-pulse rounded-xl bg-gray-100"></div></div> }
    </app-drawer>`,
})
export class CustomerProfileComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branding = inject(BrandingService);

  readonly customerId = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly categories = CATEGORIES;
  protected readonly tabs: { key: Tab; label: string }[] = [{ key: 'overview', label: 'Overview' }, { key: 'loyalty', label: 'Loyalty' }, { key: 'preferences', label: 'Tastes' }, { key: 'notes', label: 'Notes' }, { key: 'addresses', label: 'Addresses' }, { key: 'history', label: 'History' }];
  protected readonly tab = signal<Tab>('overview');
  protected readonly profile = signal<CustomerProfile | null>(null);
  protected readonly txns = signal<LoyaltyTxn[]>([]);
  protected readonly payments = signal<CustomerPayment[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly adjustPoints = signal(0);
  protected readonly adjustReason = signal('');
  protected readonly prefCategory = signal('Food');
  protected readonly prefValue = signal('');
  protected readonly noteText = signal('');
  protected readonly addr = signal({ label: 'Home', line1: '', city: '', isDefault: false });
  protected readonly canUpdate = computed(() => this.auth.hasPermission('Customer.Update'));
  protected readonly canManageLoyalty = computed(() => this.auth.hasPermission('Loyalty.Manage'));

  constructor() {
    effect(() => {
      const id = this.customerId();
      untracked(() => { this.profile.set(null); this.tab.set('overview'); this.error.set(''); if (id) this.reload(); });
    });
  }

  protected setTab(t: Tab): void {
    this.tab.set(t);
    const id = this.customerId();
    if (!id) return;
    if (t === 'loyalty') this.api.get<Paged<LoyaltyTxn>>(`loyalty/customers/${id}/transactions`, { pageSize: 20 }).subscribe(r => this.txns.set(r.items));
    if (t === 'history') this.api.get<Paged<CustomerPayment>>(`customers/${id}/payments`, { pageSize: 10 }).subscribe(r => this.payments.set(r.items));
  }

  private reload(): void {
    const id = this.customerId();
    if (!id) return;
    this.api.get<CustomerProfile>(`customers/${id}/profile`).subscribe({ next: p => this.profile.set(p), error: e => this.error.set(errorMessage(e)) });
  }

  private run(req: import('rxjs').Observable<unknown>, ok: string, after?: () => void): void {
    this.busy.set(true); this.error.set('');
    req.subscribe({ next: () => { this.busy.set(false); this.toast.success(ok); this.reload(); after?.(); }, error: e => { this.busy.set(false); this.error.set(errorMessage(e)); } });
  }

  protected adjust(): void { const id = this.customerId()!; this.run(this.api.post(`loyalty/customers/${id}/adjust`, { points: this.adjustPoints(), reason: this.adjustReason() }), 'Points adjusted', () => { this.adjustPoints.set(0); this.adjustReason.set(''); this.setTab('loyalty'); }); }
  protected enroll(): void { this.run(this.api.post<LoyaltyAccount>(`loyalty/customers/${this.customerId()}/enroll`, {}), 'Customer enrolled'); }
  protected addPref(): void { this.run(this.api.post(`customers/${this.customerId()}/preferences`, { category: this.prefCategory(), value: this.prefValue() }), 'Saved', () => this.prefValue.set('')); }
  protected removePref(id: string): void { this.run(this.api.delete(`customers/${this.customerId()}/preferences/${id}`), 'Removed'); }
  protected addNote(): void { this.run(this.api.post(`customers/${this.customerId()}/notes`, { note: this.noteText() }), 'Note added', () => this.noteText.set('')); }
  protected removeNote(id: string): void { this.run(this.api.delete(`customers/${this.customerId()}/notes/${id}`), 'Removed'); }
  protected setAddr(k: string, v: unknown): void { this.addr.update(a => ({ ...a, [k]: v })); }
  protected addAddress(): void { const a = this.addr(); this.run(this.api.post(`customers/${this.customerId()}/addresses`, { label: a.label, line1: a.line1, city: a.city || null, line2: null, postalCode: null, isDefault: a.isDefault }), 'Address added', () => this.addr.set({ label: 'Home', line1: '', city: '', isDefault: false })); }
  protected removeAddress(id: string): void { this.run(this.api.delete(`customers/${this.customerId()}/addresses/${id}`), 'Removed'); }
}
