import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { Branch, DiningTable, FloorLayout, TABLE_STATUSES, TableStatus, TableType } from '../core/models';
import { SignalrService } from '../core/services/signalr.service';
import { ToastService } from '../core/toast.service';
import { ConfirmService, DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../shared/ui';

const STATUS_STYLE: Record<TableStatus, { card: string; dot: string }> = {
  Available: { card: 'border-emerald-200 bg-emerald-50 hover:border-emerald-400', dot: 'bg-emerald-500' },
  Reserved: { card: 'border-amber-200 bg-amber-50 hover:border-amber-400', dot: 'bg-amber-500' },
  Occupied: { card: 'border-rose-200 bg-rose-50 hover:border-rose-400', dot: 'bg-rose-500' },
  Cleaning: { card: 'border-sky-200 bg-sky-50 hover:border-sky-400', dot: 'bg-sky-500' },
  Blocked: { card: 'border-gray-200 bg-gray-100 hover:border-gray-400', dot: 'bg-gray-500' },
};

@Component({
  selector: 'app-tables',
  imports: [ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Tables</h1><p class="text-sm text-gray-500">Live floor plan and availability</p></div>
        @if (canManage()) {
          <div class="flex gap-2">
            <button type="button" class="btn-ghost" (click)="openFloor()"><span class="mi">add</span>Floor</button>
            <button type="button" class="btn-primary" (click)="openTable()"><span class="mi">add</span>Table</button>
          </div>
        }
      </div>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="badge cursor-pointer ring-1 ring-gray-200" [class]="filter() === null ? 'bg-ink text-white' : 'bg-white text-gray-700'" (click)="filter.set(null)">All</button>
        @for (s of statuses; track s) {
          <button type="button" class="badge cursor-pointer gap-1.5 ring-1 ring-gray-200" [class]="filter() === s ? 'bg-ink text-white' : 'bg-white text-gray-700'" (click)="filter.set(s)">
            <span class="h-2 w-2 rounded-full" [class]="style[s].dot"></span>{{ s }} · {{ count(s) }}
          </button>
        }
      </div>

      @if (loading()) { <app-skeleton [count]="4" /> }
      @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
      @else if (layout().length === 0) { <div class="card"><app-empty-state icon="table_restaurant" title="No floors yet" hint="Add a floor, then add tables to it." /></div> }
      @else {
        @for (floor of layout(); track floor.id) {
          <section class="card p-5">
            <h2 class="mb-4 text-base font-semibold text-gray-900">{{ floor.name }}</h2>
            @if (visible(floor).length === 0) { <p class="py-6 text-center text-sm text-gray-500">No tables match this filter.</p> }
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              @for (t of visible(floor); track t.id) {
                <button type="button" class="rounded-2xl border-2 p-4 text-left transition" [class]="style[t.status].card" (click)="select(t)" [attr.aria-label]="'Table ' + t.code + ', ' + t.status">
                  <div class="flex items-center justify-between"><span class="text-lg font-bold text-gray-900">{{ t.code }}</span><span class="h-2.5 w-2.5 rounded-full" [class]="style[t.status].dot"></span></div>
                  <p class="mt-1 flex items-center gap-1 text-xs text-gray-600"><span class="mi text-base!">person</span>{{ t.capacity }} seats</p>
                  <p class="mt-2 text-xs font-semibold text-gray-700">{{ t.status }}</p>
                </button>
              }
            </div>
          </section>
        }
      }
    </div>

    <app-drawer [open]="selected() !== null" [title]="'Table ' + (selected()?.code ?? '')" (closed)="selected.set(null)">
      @if (selected(); as t) {
        <div class="space-y-5">
          <div><span class="label">Current status</span><span class="badge bg-gray-100 text-gray-800">{{ t.status }}</span></div>
          @if (canChangeStatus()) {
            <div>
              <span class="label">Change status</span>
              <div class="flex flex-wrap gap-2">
                @for (s of statuses; track s) {
                  <button type="button" class="btn-ghost" [disabled]="s === t.status || busy()" (click)="setStatus(t, s)">{{ s }}</button>
                }
              </div>
            </div>
          }
          @if (canManage()) {
            <div class="flex gap-2 border-t border-gray-100 pt-4">
              <button type="button" class="btn-ghost" (click)="openTable(t)"><span class="mi">edit</span>Edit table</button>
              <button type="button" class="btn-danger" (click)="deactivate(t)"><span class="mi">block</span>Deactivate</button>
            </div>
          }
        </div>
      }
    </app-drawer>

    <app-drawer [open]="tableDrawer()" [title]="editingId() ? 'Edit table' : 'Add table'" (closed)="tableDrawer.set(false)">
      <form id="tableForm" class="space-y-4" [formGroup]="tableForm" (ngSubmit)="saveTable()">
        <div><label class="label" for="floorId">Floor</label>
          <select id="floorId" class="input" formControlName="floorId">@for (f of layout(); track f.id) { <option [value]="f.id">{{ f.name }}</option> }</select></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="code">Table code</label><input id="code" class="input" formControlName="code" />
            @if (tableForm.controls.code.touched && tableForm.controls.code.invalid) { <p class="field-error">Code is required.</p> }</div>
          <div><label class="label" for="capacity">Seats</label><input id="capacity" class="input" type="number" min="1" formControlName="capacity" /></div>
        </div>
        <div><label class="label" for="typeId">Table type</label>
          <select id="typeId" class="input" formControlName="tableTypeId"><option [ngValue]="null">None</option>@for (t of types(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }</select></div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      <div drawer-actions>
        <button type="button" class="btn-ghost" (click)="tableDrawer.set(false)">Cancel</button>
        <button type="submit" form="tableForm" class="btn-primary" [disabled]="busy()">Save</button>
      </div>
    </app-drawer>

    <app-drawer [open]="floorDrawer()" title="Add floor" (closed)="floorDrawer.set(false)">
      <form id="floorForm" class="space-y-4" [formGroup]="floorForm" (ngSubmit)="saveFloor()">
        <div><label class="label" for="floorName">Floor name</label><input id="floorName" class="input" formControlName="name" />
          @if (floorForm.controls.name.touched && floorForm.controls.name.invalid) { <p class="field-error">Name is required.</p> }</div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      <div drawer-actions>
        <button type="button" class="btn-ghost" (click)="floorDrawer.set(false)">Cancel</button>
        <button type="submit" form="floorForm" class="btn-primary" [disabled]="busy()">Save</button>
      </div>
    </app-drawer>`,
})
export class TablesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);
  private readonly signalr = inject(SignalrService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statuses = TABLE_STATUSES;
  protected readonly style = STATUS_STYLE;

  protected readonly layout = signal<FloorLayout[]>([]);
  protected readonly types = signal<TableType[]>([]);
  private branches: Branch[] = [];
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly filter = signal<TableStatus | null>(null);
  protected readonly selected = signal<DiningTable | null>(null);
  protected readonly tableDrawer = signal(false);
  protected readonly floorDrawer = signal(false);
  protected readonly editingId = signal<string | null>(null);

  protected readonly canManage = computed(() => this.auth.hasPermission('Table.Manage'));
  protected readonly canChangeStatus = computed(() => this.auth.hasPermission('Order.Update'));
  private readonly all = computed(() => this.layout().flatMap(f => f.tables));

  protected readonly tableForm = this.fb.group({
    floorId: this.fb.nonNullable.control('', Validators.required),
    code: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(30)]),
    capacity: this.fb.nonNullable.control(4, [Validators.required, Validators.min(1), Validators.max(100)]),
    tableTypeId: this.fb.control<string | null>(null),
  });
  protected readonly floorForm = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.maxLength(100)]] });

  ngOnInit(): void {
    this.load();
    // No refetch: patch only the table the event names, per entity, not a full-screen reload.
    const off = this.signalr.on<{ tableId: string; status: TableStatus }>('TableStatusChanged', e => this.patchStatus(e.data.tableId, e.data.status));
    this.destroyRef.onDestroy(off);
  }

  protected count(s: TableStatus): number { return this.all().filter(t => t.status === s).length; }
  protected visible(f: FloorLayout): DiningTable[] { const s = this.filter(); return s ? f.tables.filter(t => t.status === s) : f.tables; }
  protected select(t: DiningTable): void { this.selected.set(t); }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<FloorLayout[]>('tables/layout').subscribe({
      next: l => { this.layout.set(l); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
    this.api.get<TableType[]>('table-types').subscribe({ next: t => this.types.set(t.filter(x => x.isActive)), error: () => undefined });
    this.api.get<Branch[]>('branches').subscribe({ next: b => (this.branches = b.filter(x => x.isActive)), error: () => undefined });
  }

  protected setStatus(t: DiningTable, status: TableStatus): void {
    this.busy.set(true);
    this.api.patch<DiningTable>(`tables/${t.id}/status`, { status }).subscribe({
      next: updated => { this.replace(updated); this.selected.set(updated); this.busy.set(false); this.toast.success(`Table ${updated.code} is now ${updated.status}`); },
      error: e => { this.busy.set(false); this.toast.error(errorMessage(e)); if (e.status === 409) this.load(); },
    });
  }

  protected openTable(t?: DiningTable): void {
    this.selected.set(null);
    this.formError.set('');
    this.editingId.set(t?.id ?? null);
    this.tableForm.reset({ floorId: t?.floorId ?? this.layout()[0]?.id ?? '', code: t?.code ?? '', capacity: t?.capacity ?? 4, tableTypeId: t?.tableTypeId ?? null });
    this.tableDrawer.set(true);
  }

  protected saveTable(): void {
    if (this.tableForm.invalid) { this.tableForm.markAllAsTouched(); return; }
    const v = this.tableForm.getRawValue();
    const existing = this.all().find(x => x.id === this.editingId());
    const body = { ...v, posX: existing?.posX ?? 0, posY: existing?.posY ?? 0, isActive: true };
    const id = this.editingId();
    this.busy.set(true);
    (id ? this.api.put<DiningTable>(`tables/${id}`, body) : this.api.post<DiningTable>('tables', body)).subscribe({
      next: () => { this.busy.set(false); this.tableDrawer.set(false); this.toast.success('Table saved'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected openFloor(): void { this.formError.set(''); this.floorForm.reset({ name: '' }); this.floorDrawer.set(true); }

  protected saveFloor(): void {
    if (this.floorForm.invalid) { this.floorForm.markAllAsTouched(); return; }
    const branch = this.branches[0];
    if (!branch) { this.formError.set('Create a branch first.'); return; }
    this.busy.set(true);
    this.api.post('floors', { branchId: branch.id, name: this.floorForm.getRawValue().name, sortOrder: this.layout().length + 1, isActive: true }).subscribe({
      next: () => { this.busy.set(false); this.floorDrawer.set(false); this.toast.success('Floor added'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected async deactivate(t: DiningTable): Promise<void> {
    if (!(await this.confirm.ask({ title: `Deactivate table ${t.code}?`, message: 'The table will no longer appear on the floor plan.', confirmText: 'Deactivate', danger: true }))) return;
    this.api.delete(`tables/${t.id}`).subscribe({
      next: () => { this.selected.set(null); this.toast.success('Table deactivated'); this.load(); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  private replace(updated: DiningTable): void {
    this.layout.update(l => l.map(f => ({ ...f, tables: f.tables.map(t => (t.id === updated.id ? updated : t)) })));
  }

  private patchStatus(tableId: string, status: TableStatus): void {
    this.layout.update(l => l.map(f => ({ ...f, tables: f.tables.map(t => (t.id === tableId ? { ...t, status } : t)) })));
    if (this.selected()?.id === tableId) this.selected.update(t => (t ? { ...t, status } : t));
  }
}
