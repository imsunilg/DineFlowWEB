import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/http.interceptors';
import { ToastService } from '../core/toast.service';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent } from './ui';

export type FieldType = 'text' | 'number' | 'checkbox' | 'select' | 'date' | 'email';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRow = Record<string, any> & { id: string };

export interface CrudField { key: string; label: string; type: FieldType; required?: boolean; step?: string; options?: string; optional?: boolean; hint?: string }
export interface CrudLookup { path: string; label: (row: AnyRow) => string; filter?: (row: AnyRow) => boolean; paged?: boolean }
export interface CrudSection {
  key: string; label: string; singular: string; path: string; paged?: boolean;
  cols: { key: string; label: string }[]; fields: CrudField[];
  /** set to false when the API has no DELETE or no active flag */
  hasActive?: boolean;
}

/**
 * Configuration-driven master-data editor: tabs of sections, a list per section and a drawer form.
 * Screens describe their sections declaratively instead of hand-writing list/drawer/validation code.
 */
@Component({
  selector: 'app-config-crud',
  imports: [ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">{{ title() }}</h1><p class="text-sm text-gray-500">{{ subtitle() }}</p></div>
        @if (canManage()) { <button type="button" class="btn-primary" (click)="open()"><span class="mi">add</span>New {{ section().singular }}</button> }
      </div>

      @if (sections().length > 1) {
        <div class="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
          @for (s of sections(); track s.key) {
            <button type="button" role="tab" [attr.aria-selected]="key() === s.key" class="rounded-lg px-4 py-2 text-sm font-semibold transition" [class]="key() === s.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'" (click)="setKey(s.key)">{{ s.label }}</button>
          }
        </div>
      }

      @if (section().paged) {
        <div class="card p-4"><div class="relative"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
          <input class="input pl-10" [placeholder]="'Search ' + section().label.toLowerCase()" aria-label="Search" (input)="onSearch($any($event.target).value)" /></div></div>
      }

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="reload()" /> }
        @else if (rows().length === 0) { <app-empty-state icon="inventory_2" [title]="'No ' + section().label.toLowerCase() + ' yet'" hint="Create the first one to get started." /> }
        @else {
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>@for (c of section().cols; track c.key) { <th class="px-5 py-3">{{ c.label }}</th> } @if (section().hasActive !== false) { <th class="px-5 py-3">Status</th> }<th class="px-5 py-3"></th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              @for (r of rows(); track r.id) {
                <tr class="hover:bg-gray-50/60" [class.opacity-60]="r['isActive'] === false">
                  @for (c of section().cols; track c.key) { <td class="px-5 py-3" [class]="$first ? 'font-semibold text-gray-900' : 'text-gray-600'">{{ show(r[c.key]) }}</td> }
                  @if (section().hasActive !== false) { <td class="px-5 py-3"><span class="badge" [class]="r['isActive'] === false ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700'">{{ r['isActive'] === false ? 'Inactive' : 'Active' }}</span></td> }
                  <td class="px-5 py-3 text-right">@if (canManage()) { <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit" (click)="open(r)"><span class="mi">edit</span></button> }</td>
                </tr>
              }
            </tbody>
          </table></div>
          @if (section().paged) { <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div> }
        }
      </div>
    </div>

    <app-drawer [open]="drawer()" [title]="(editingId() ? 'Edit ' : 'New ') + section().singular" (closed)="drawer.set(false)">
      @if (drawer()) {
        <form id="crudForm" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
          @for (f of section().fields; track f.key) {
            @switch (f.type) {
              @case ('checkbox') { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [formControlName]="f.key" />{{ f.label }}</label> }
              @case ('select') {
                <div><label class="label" [attr.for]="'f-' + f.key">{{ f.label }}</label>
                  <select [id]="'f-' + f.key" class="input" [formControlName]="f.key">@if (f.optional) { <option value="">None</option> }@for (o of options(f); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
              }
              @default {
                <div><label class="label" [attr.for]="'f-' + f.key">{{ f.label }}</label>
                  <input [id]="'f-' + f.key" class="input" [type]="f.type" [attr.step]="f.step ?? null" [formControlName]="f.key" />
                  @if (f.hint) { <p class="mt-1 text-xs text-gray-500">{{ f.hint }}</p> }
                  @if (form.controls[f.key].touched && form.controls[f.key].invalid) { <p class="field-error">{{ f.label }} is required.</p> }</div>
              }
            }
          }
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </form>
      }
      <div drawer-actions><button type="button" class="btn-ghost" (click)="drawer.set(false)">Cancel</button><button type="submit" form="crudForm" class="btn-primary" [disabled]="busy()">Save</button></div>
    </app-drawer>`,
})
export class ConfigCrudComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly sections = input.required<CrudSection[]>();
  readonly lookups = input<Record<string, CrudLookup>>({});
  readonly canManage = input(false);

  protected readonly key = signal('');
  protected readonly section = computed(() => this.sections().find(s => s.key === this.key()) ?? this.sections()[0]);
  protected readonly rows = signal<AnyRow[]>([]);
  protected readonly lookupData = signal<Record<string, AnyRow[]>>({});
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly drawer = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected form = new FormGroup<Record<string, FormControl>>({});
  private search = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => { const first = this.sections()[0]; if (first && !this.key()) untracked(() => this.key.set(first.key)); });
  }

  ngOnInit(): void { this.reload(); }

  protected setKey(k: string): void { this.key.set(k); this.page.set(1); this.search = ''; this.reload(); }
  protected goTo(p: number): void { this.page.set(p); this.reload(); }
  protected onSearch(v: string): void { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.search = v; this.page.set(1); this.reload(); }, 300); }

  protected reload(): void {
    const s = this.section();
    if (!s) return;
    this.loading.set(true); this.error.set('');
    const used = [...new Set(s.fields.map(f => f.options).filter((o): o is string => !!o && !!this.lookups()[o]))];
    const rowsReq = this.api.get<AnyRow[] | { items: AnyRow[]; totalPages: number; totalCount: number }>(s.path, s.paged ? { page: this.page(), pageSize: 15, search: this.search } : undefined);
    const lookupReqs = used.length ? forkJoin(Object.fromEntries(used.map(k => [k, this.api.get<AnyRow[] | { items: AnyRow[] }>(this.lookups()[k].path, this.lookups()[k].paged ? { pageSize: 200 } : undefined)]))) : of({});
    forkJoin({ rows: rowsReq, lookups: lookupReqs }).subscribe({
      next: r => {
        if (Array.isArray(r.rows)) this.rows.set(r.rows);
        else { this.rows.set(r.rows.items); this.totalPages.set(r.rows.totalPages); this.total.set(r.rows.totalCount); }
        const data: Record<string, AnyRow[]> = {};
        for (const [k, v] of Object.entries(r.lookups as Record<string, AnyRow[] | { items: AnyRow[] }>)) data[k] = Array.isArray(v) ? v : v.items;
        this.lookupData.set(data);
        this.loading.set(false);
      },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected show(v: unknown): string { return v === null || v === undefined || v === '' ? '—' : v === true ? 'Yes' : v === false ? 'No' : String(v); }

  protected options(f: CrudField): { value: string; label: string }[] {
    const lk = f.options ? this.lookups()[f.options] : undefined;
    if (!lk) return [];
    return (this.lookupData()[f.options!] ?? []).filter(lk.filter ?? (r => r['isActive'] !== false)).map(r => ({ value: r.id, label: lk.label(r) }));
  }

  protected open(row?: AnyRow): void {
    this.formError.set('');
    this.editingId.set(row?.id ?? null);
    const controls: Record<string, FormControl> = {};
    for (const f of this.section().fields) {
      const fallback = f.type === 'checkbox' ? f.key === 'isActive' : f.type === 'number' ? 0 : f.type === 'select' ? (f.optional ? '' : (this.options(f)[0]?.value ?? '')) : '';
      controls[f.key] = new FormControl(row?.[f.key] ?? fallback, { nonNullable: true, validators: f.required ? [Validators.required] : [] });
    }
    this.form = new FormGroup(controls);
    this.drawer.set(true);
  }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const body = { ...this.form.getRawValue() } as Record<string, unknown>;
    for (const f of this.section().fields) {
      if (f.type === 'number') body[f.key] = Number(body[f.key]);
      else if (f.type !== 'checkbox' && body[f.key] === '') body[f.key] = null;
    }
    const id = this.editingId(), path = this.section().path;
    this.busy.set(true); this.formError.set('');
    (id ? this.api.put(`${path}/${id}`, body) : this.api.post(path, body)).subscribe({
      next: () => { this.busy.set(false); this.drawer.set(false); this.toast.success('Saved'); this.reload(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }
}
