import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { Customer, Paged, Reservation, ReservationStatus, TableAvailability } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, ModalComponent, SkeletonComponent } from '../shared/ui';

const STATUS_STYLE: Record<string, string> = {
  Requested: 'bg-gray-100 text-gray-700', Confirmed: 'bg-sky-100 text-sky-700', Arrived: 'bg-amber-100 text-amber-700', Seated: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-gray-800 text-white', Cancelled: 'bg-red-100 text-red-700', NoShow: 'bg-rose-100 text-rose-700',
};
const ACTION: Record<string, { label: string; style: string }> = {
  Confirmed: { label: 'Confirm', style: 'btn-primary' }, Arrived: { label: 'Guest arrived', style: 'btn-primary' }, Seated: { label: 'Seat guests', style: 'btn-primary' },
  Completed: { label: 'Complete', style: 'btn-ghost' }, NoShow: { label: 'No-show', style: 'btn-ghost' }, Cancelled: { label: 'Cancel', style: 'btn-ghost text-red-600' },
};
const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Reservation book: a day at a time, with table availability, double-booking protection and the guest lifecycle. */
@Component({
  selector: 'app-reservations',
  imports: [ReactiveFormsModule, DatePipe, DrawerComponent, ModalComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-5xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Reservations</h1><p class="text-sm text-gray-500">Bookings, arrivals and seating for the day</p></div>
        @if (canManage()) { <button type="button" class="btn-primary" (click)="openForm()"><span class="mi">add</span>New reservation</button> }
      </div>

      <div class="card flex flex-wrap items-center gap-3 p-4">
        <div class="flex items-center gap-1">
          <button type="button" class="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Previous day" (click)="shift(-1)"><span class="mi">chevron_left</span></button>
          <input type="date" class="input w-auto" aria-label="Date" [value]="date()" (change)="setDate($any($event.target).value)" />
          <button type="button" class="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Next day" (click)="shift(1)"><span class="mi">chevron_right</span></button>
          <button type="button" class="btn-ghost ml-1" (click)="setDate(today())">Today</button>
        </div>
        <div class="relative min-w-48 flex-1"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
          <input class="input pl-10" placeholder="Search guest, phone or number" aria-label="Search reservations" (input)="search$.next($any($event.target).value)" /></div>
        <select class="input w-auto" aria-label="Filter by status" (change)="setStatus($any($event.target).value)">
          <option value="">All statuses</option>@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="card p-4"><p class="text-2xl font-bold">{{ active().length }}</p><p class="text-xs text-gray-500">Active bookings</p></div>
        <div class="card p-4"><p class="text-2xl font-bold">{{ guests() }}</p><p class="text-xs text-gray-500">Guests expected</p></div>
        <div class="card p-4"><p class="text-2xl font-bold">{{ countOf('Arrived') + countOf('Seated') }}</p><p class="text-xs text-gray-500">Arrived / seated</p></div>
        <div class="card p-4"><p class="text-2xl font-bold">{{ countOf('NoShow') + countOf('Cancelled') }}</p><p class="text-xs text-gray-500">No-shows & cancelled</p></div>
      </div>

      @if (loading()) { <app-skeleton [count]="4" /> }
      @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
      @else if (items().length === 0) { <div class="card"><app-empty-state icon="event_available" title="No reservations for this day" hint="Create one, or pick another date." /></div> }
      @else {
        <div class="space-y-3">
          @for (r of items(); track r.id) {
            <article class="card flex flex-wrap items-start gap-4 p-4" [class.opacity-60]="r.status === 'Cancelled' || r.status === 'NoShow'">
              <div class="w-20 shrink-0 text-center"><p class="text-xl font-bold text-gray-900">{{ r.reservedAt | date: 'shortTime' }}</p><p class="text-xs text-gray-500">{{ r.durationMinutes }} min</p></div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2"><p class="font-semibold text-gray-900">{{ r.guestName }}</p><span class="badge" [class]="style[r.status]">{{ r.status === 'NoShow' ? 'No-show' : r.status }}</span></div>
                <p class="text-sm text-gray-600"><span class="mi align-middle text-base!">group</span> {{ r.guestCount }} · <span class="mi align-middle text-base!">table_restaurant</span> {{ r.tableCode ? 'Table ' + r.tableCode : 'No table yet' }}@if (r.phone) { · {{ r.phone }} }</p>
                @if (r.specialRequest) { <p class="mt-1 text-sm italic text-amber-700">“{{ r.specialRequest }}”</p> }
                @if (r.cancelReason) { <p class="mt-1 text-xs text-red-600">Cancelled: {{ r.cancelReason }}</p> }
                <p class="mt-1 text-[11px] text-gray-400">{{ r.reservationNo }}</p>
              </div>
              @if (canManage()) {
                <div class="flex flex-wrap items-center justify-end gap-2">
                  @for (t of r.allowedTransitions; track t) { <button type="button" [class]="action[t].style" [disabled]="busy()" (click)="go(r, t)">{{ action[t].label }}</button> }
                  @if (r.status === 'Requested' || r.status === 'Confirmed') { <button type="button" class="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Edit reservation" (click)="openForm(r)"><span class="mi">edit</span></button> }
                </div>
              }
            </article>
          }
        </div>
      }
    </div>

    <app-drawer [open]="formOpen()" [title]="editingId() ? 'Edit reservation' : 'New reservation'" (closed)="formOpen.set(false)">
      @if (formOpen()) {
        <form id="rsvForm" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
          <div><label class="label" for="rg">Guest name</label><input id="rg" class="input" formControlName="guestName" />@if (form.controls.guestName.touched && form.controls.guestName.invalid) { <p class="field-error">Guest name is required.</p> }</div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="label" for="rp">Phone</label><input id="rp" class="input" formControlName="phone" /></div>
            <div><label class="label" for="rc">Customer profile</label><select id="rc" class="input" formControlName="customerId"><option value="">Walk-in / none</option>@for (c of customers(); track c.id) { <option [value]="c.id">{{ c.fullName }}</option> }</select></div>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div class="col-span-2"><label class="label" for="rt">Date & time</label><input id="rt" type="datetime-local" class="input" formControlName="reservedAt" (change)="refreshAvailability()" /></div>
            <div><label class="label" for="rn">Guests</label><input id="rn" type="number" min="1" max="200" class="input" formControlName="guestCount" (change)="refreshAvailability()" /></div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="label" for="rd">Duration (minutes)</label><input id="rd" type="number" min="15" step="15" class="input" formControlName="durationMinutes" (change)="refreshAvailability()" /></div>
            <div><label class="label" for="rtb">Table</label>
              <select id="rtb" class="input" formControlName="tableId"><option value="">Assign later</option>
                @for (t of availability(); track t.tableId) { <option [value]="t.tableId" [disabled]="!t.available">{{ t.code }} · {{ t.capacity }} seats{{ t.available ? '' : ' — ' + t.reason }}</option> }</select></div>
          </div>
          <div><label class="label" for="rs">Special request</label><input id="rs" class="input" maxlength="500" formControlName="specialRequest" placeholder="Occasion, allergies, seating…" /></div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </form>
      }
      <div drawer-actions><button type="button" class="btn-ghost" (click)="formOpen.set(false)">Cancel</button><button type="submit" form="rsvForm" class="btn-primary" [disabled]="busy()">Save reservation</button></div>
    </app-drawer>

    <app-modal [open]="cancelFor() !== null" title="Cancel reservation" (closed)="cancelFor.set(null)">
      <label class="label" for="cr">Reason (required)</label>
      <input id="cr" class="input" maxlength="300" [value]="cancelReason()" (input)="cancelReason.set($any($event.target).value)" placeholder="e.g. guest called to cancel" />
      @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      <div modal-actions><button type="button" class="btn-ghost" (click)="cancelFor.set(null)">Keep</button><button type="button" class="btn-danger" [disabled]="busy()" (click)="confirmCancel()">Cancel reservation</button></div>
    </app-modal>

    <app-modal [open]="tablePick() !== null" title="Choose a table to seat the guests" (closed)="tablePick.set(null)">
      <div class="grid grid-cols-2 gap-2">
        @for (t of availability(); track t.tableId) {
          <button type="button" class="rounded-xl border p-3 text-left text-sm disabled:opacity-40" [class]="t.available ? 'border-gray-200 hover:border-brand' : 'border-gray-100'" [disabled]="!t.available" (click)="seatAt(t.tableId)">
            <span class="font-semibold">{{ t.code }}</span><span class="block text-xs text-gray-500">{{ t.floorName }} · {{ t.capacity }} seats{{ t.available ? '' : ' · ' + t.reason }}</span></button>
        }
      </div>
      @if (formError()) { <p class="field-error mt-3">{{ formError() }}</p> }
    </app-modal>`,
})
export class ReservationsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly style = STATUS_STYLE;
  protected readonly action = ACTION;
  protected readonly statuses: ReservationStatus[] = ['Requested', 'Confirmed', 'Arrived', 'Seated', 'Completed', 'Cancelled', 'NoShow'];
  protected readonly date = signal(dayKey(new Date()));
  protected readonly items = signal<Reservation[]>([]);
  protected readonly customers = signal<Customer[]>([]);
  protected readonly availability = signal<TableAvailability[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly cancelFor = signal<Reservation | null>(null);
  protected readonly cancelReason = signal('');
  protected readonly tablePick = signal<Reservation | null>(null);
  protected readonly search$ = new Subject<string>();
  protected readonly canManage = computed(() => this.auth.hasPermission('Reservation.Manage'));
  protected readonly active = computed(() => this.items().filter(r => !['Cancelled', 'NoShow', 'Completed'].includes(r.status)));
  protected readonly guests = computed(() => this.active().reduce((s, r) => s + r.guestCount, 0));
  private status = ''; private search = '';

  protected readonly form = this.fb.nonNullable.group({
    guestName: ['', [Validators.required, Validators.maxLength(200)]], phone: [''], customerId: [''], reservedAt: [''], guestCount: [2, [Validators.required, Validators.min(1)]],
    durationMinutes: [90, [Validators.required, Validators.min(15)]], tableId: [''], specialRequest: [''],
  });

  constructor() { this.search$.pipe(debounceTime(300)).subscribe(s => { this.search = s; this.load(); }); }

  ngOnInit(): void {
    this.load();
    if (this.auth.hasPermission('Customer.View')) this.api.get<Paged<Customer>>('customers', { pageSize: 100 }).subscribe(r => this.customers.set(r.items));
  }

  protected today(): string { return dayKey(new Date()); }
  protected setDate(v: string): void { if (v) { this.date.set(v); this.load(); } }
  protected shift(days: number): void { const d = new Date(this.date() + 'T12:00:00'); d.setDate(d.getDate() + days); this.setDate(dayKey(d)); }
  protected setStatus(s: string): void { this.status = s; this.load(); }
  protected countOf(s: string): number { return this.items().filter(r => r.status === s).length; }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    // the API day boundaries are UTC; widen by a day either side and filter to the viewer's local date
    const d = new Date(this.date() + 'T00:00:00');
    const from = new Date(d.getTime() - 86400000), to = new Date(d.getTime() + 86400000);
    this.api.get<Paged<Reservation>>('reservations', { from: dayKey(from), to: dayKey(to), status: this.status, search: this.search, pageSize: 200 }).subscribe({
      next: r => { this.items.set(r.items.filter(x => dayKey(new Date(x.reservedAt)) === this.date())); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  // ---- create / edit ----
  protected openForm(r?: Reservation): void {
    this.formError.set(''); this.editingId.set(r?.id ?? null);
    const when = r ? new Date(r.reservedAt) : (() => { const n = new Date(this.date() + 'T19:00:00'); return n; })();
    this.form.reset({ guestName: r?.guestName ?? '', phone: r?.phone ?? '', customerId: r?.customerId ?? '', reservedAt: localInput(when), guestCount: r?.guestCount ?? 2, durationMinutes: r?.durationMinutes ?? 90, tableId: r?.tableId ?? '', specialRequest: r?.specialRequest ?? '' });
    this.formOpen.set(true);
    this.refreshAvailability();
  }

  protected refreshAvailability(): void {
    const v = this.form.getRawValue();
    if (!v.reservedAt) return;
    this.api.get<TableAvailability[]>('reservations/availability', { at: new Date(v.reservedAt).toISOString(), guests: Number(v.guestCount) || 1, durationMinutes: Number(v.durationMinutes) || 90, excludeReservationId: this.editingId() }).subscribe(a => this.availability.set(a));
  }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = { customerId: v.customerId || null, guestName: v.guestName, phone: v.phone || null, guestCount: Number(v.guestCount), reservedAt: new Date(v.reservedAt).toISOString(), durationMinutes: Number(v.durationMinutes), tableId: v.tableId || null, specialRequest: v.specialRequest || null };
    const id = this.editingId();
    this.busy.set(true); this.formError.set('');
    (id ? this.api.put<Reservation>(`reservations/${id}`, body) : this.api.post<Reservation>('reservations', body)).subscribe({
      next: r => { this.busy.set(false); this.formOpen.set(false); this.toast.success('Reservation saved'); this.date.set(dayKey(new Date(r.reservedAt))); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  // ---- lifecycle ----
  protected go(r: Reservation, status: ReservationStatus): void {
    if (status === 'Cancelled') { this.cancelReason.set(''); this.formError.set(''); this.cancelFor.set(r); return; }
    if ((status === 'Arrived' || status === 'Seated') && !r.tableId) { this.formError.set(''); this.openTablePick(r); return; }
    this.change(r, { status });
  }

  private openTablePick(r: Reservation): void {
    this.api.get<TableAvailability[]>('reservations/availability', { at: r.reservedAt, guests: r.guestCount, durationMinutes: r.durationMinutes, excludeReservationId: r.id }).subscribe(a => { this.availability.set(a); this.tablePick.set(r); });
  }

  protected seatAt(tableId: string): void {
    const r = this.tablePick();
    if (r) this.change(r, { status: r.status === 'Confirmed' ? 'Arrived' : 'Seated', tableId });
  }

  protected confirmCancel(): void {
    const r = this.cancelFor();
    if (!r) return;
    if (!this.cancelReason().trim()) { this.formError.set('A reason is required.'); return; }
    this.change(r, { status: 'Cancelled', reason: this.cancelReason() });
  }

  private change(r: Reservation, body: { status: ReservationStatus; reason?: string; tableId?: string }): void {
    this.busy.set(true); this.formError.set('');
    this.api.post<Reservation>(`reservations/${r.id}/status`, body).subscribe({
      next: () => { this.busy.set(false); this.cancelFor.set(null); this.tablePick.set(null); this.toast.success('Reservation updated'); this.load(); },
      error: e => { this.busy.set(false); const m = errorMessage(e); this.formError.set(m); if (!this.cancelFor() && !this.tablePick()) this.toast.error(m); },
    });
  }
}
