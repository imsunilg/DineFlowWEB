import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { BarCounter, BarProduct, BottleSize, LiquorBrand, LiquorCategory } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../shared/ui';

type Key = 'products' | 'brands' | 'categories' | 'sizes' | 'counters';
type FieldType = 'text' | 'number' | 'checkbox' | 'select';
interface Field { key: string; label: string; type: FieldType; required?: boolean; options?: 'brands' | 'sizes' | 'categories'; step?: string }
interface Section { key: Key; label: string; singular: string; path: string; cols: { key: string; label: string }[]; fields: Field[] }

const SECTIONS: Section[] = [
  { key: 'products', label: 'Products', singular: 'product', path: 'bar/products', cols: [{ key: 'displayName', label: 'Product' }, { key: 'categoryName', label: 'Category' }, { key: 'sku', label: 'SKU' }, { key: 'reorderLevelBottles', label: 'Reorder at (bottles)' }],
    fields: [{ key: 'brandId', label: 'Brand', type: 'select', required: true, options: 'brands' }, { key: 'bottleSizeId', label: 'Bottle size', type: 'select', required: true, options: 'sizes' }, { key: 'sku', label: 'SKU', type: 'text' }, { key: 'reorderLevelBottles', label: 'Reorder level (bottles)', type: 'number', step: '0.5' }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'brands', label: 'Brands', singular: 'brand', path: 'bar/brands', cols: [{ key: 'name', label: 'Brand' }, { key: 'categoryName', label: 'Category' }],
    fields: [{ key: 'categoryId', label: 'Category', type: 'select', required: true, options: 'categories' }, { key: 'name', label: 'Brand name', type: 'text', required: true }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'categories', label: 'Categories', singular: 'category', path: 'bar/categories', cols: [{ key: 'name', label: 'Category' }, { key: 'sortOrder', label: 'Order' }],
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'sortOrder', label: 'Sort order', type: 'number' }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'sizes', label: 'Bottle sizes', singular: 'bottle size', path: 'bar/bottle-sizes', cols: [{ key: 'label', label: 'Label' }, { key: 'volumeMl', label: 'Volume (ml)' }],
    fields: [{ key: 'label', label: 'Label (e.g. 750 ML)', type: 'text', required: true }, { key: 'volumeMl', label: 'Volume (ml)', type: 'number', required: true }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'counters', label: 'Counters', singular: 'counter', path: 'bar/counters', cols: [{ key: 'name', label: 'Counter' }, { key: 'code', label: 'Code' }, { key: 'isDefault', label: 'Default' }],
    fields: [{ key: 'code', label: 'Code', type: 'text', required: true }, { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'isDefault', label: 'Default counter (stock is deducted here)', type: 'checkbox' }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

type Row = Record<string, unknown> & { id: string; isActive?: boolean };

/** Brands, products, categories, sizes and counters share one configuration-driven editor. */
@Component({
  selector: 'app-bar-catalog',
  imports: [ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Brands & products</h1><p class="text-sm text-gray-500">The bottles your bar stocks and sells</p></div>
        @if (canManage()) { <button type="button" class="btn-primary" (click)="open()"><span class="mi">add</span>New {{ section().singular }}</button> }
      </div>

      <div class="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        @for (s of sections; track s.key) {
          <button type="button" role="tab" [attr.aria-selected]="key() === s.key" class="rounded-lg px-4 py-2 text-sm font-semibold transition" [class]="key() === s.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'" (click)="setKey(s.key)">{{ s.label }}</button>
        }
      </div>

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="reload()" /> }
        @else if (rows().length === 0) { <app-empty-state icon="liquor" [title]="'No ' + section().label.toLowerCase() + ' yet'" hint="Create the first one to get started." /> }
        @else {
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>@for (c of section().cols; track c.key) { <th class="px-5 py-3">{{ c.label }}</th> } <th class="px-5 py-3">Status</th><th class="px-5 py-3"></th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              @for (r of rows(); track r['id']) {
                <tr class="hover:bg-gray-50/60" [class.opacity-60]="r['isActive'] === false">
                  @for (c of section().cols; track c.key) { <td class="px-5 py-3" [class]="$first ? 'font-semibold text-gray-900' : 'text-gray-600'">{{ show(r[c.key]) }}</td> }
                  <td class="px-5 py-3"><span class="badge" [class]="r['isActive'] === false ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700'">{{ r['isActive'] === false ? 'Inactive' : 'Active' }}</span></td>
                  <td class="px-5 py-3 text-right">@if (canManage()) { <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit" (click)="open(r)"><span class="mi">edit</span></button> }</td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    <app-drawer [open]="drawer()" [title]="(editingId() ? 'Edit ' : 'New ') + section().singular" (closed)="drawer.set(false)">
      @if (drawer()) {
      <form id="catForm" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
        @for (f of section().fields; track f.key) {
          @switch (f.type) {
            @case ('checkbox') { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [formControlName]="f.key" />{{ f.label }}</label> }
            @case ('select') {
              <div><label class="label" [attr.for]="'f-' + f.key">{{ f.label }}</label>
                <select [id]="'f-' + f.key" class="input" [formControlName]="f.key">@for (o of options(f); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
            }
            @default {
              <div><label class="label" [attr.for]="'f-' + f.key">{{ f.label }}</label>
                <input [id]="'f-' + f.key" class="input" [type]="f.type" [attr.step]="f.step ?? null" [formControlName]="f.key" />
                @if (form.controls[f.key].touched && form.controls[f.key].invalid) { <p class="field-error">{{ f.label }} is required.</p> }</div>
            }
          }
        }
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      }
      <div drawer-actions><button type="button" class="btn-ghost" (click)="drawer.set(false)">Cancel</button><button type="submit" form="catForm" class="btn-primary" [disabled]="busy()">Save</button></div>
    </app-drawer>`,
})
export class BarCatalogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly sections = SECTIONS;
  protected readonly key = signal<Key>('products');
  protected readonly section = computed(() => SECTIONS.find(s => s.key === this.key())!);
  protected readonly rows = signal<Row[]>([]);
  protected readonly brands = signal<LiquorBrand[]>([]);
  protected readonly sizes = signal<BottleSize[]>([]);
  protected readonly categories = signal<LiquorCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly drawer = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly canManage = computed(() => this.auth.hasPermission('Bar.Manage'));
  protected form = new FormGroup<Record<string, FormControl>>({});

  ngOnInit(): void { this.reload(); }

  protected setKey(k: Key): void { this.key.set(k); this.reload(); }

  protected reload(): void {
    this.loading.set(true); this.error.set('');
    forkJoin({
      rows: this.api.get<Row[]>(this.section().path),
      brands: this.api.get<LiquorBrand[]>('bar/brands'), sizes: this.api.get<BottleSize[]>('bar/bottle-sizes'), categories: this.api.get<LiquorCategory[]>('bar/categories'),
    }).subscribe({
      next: r => { this.rows.set(r.rows); this.brands.set(r.brands); this.sizes.set(r.sizes); this.categories.set(r.categories); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected show(v: unknown): string { return v === null || v === undefined || v === '' ? '—' : v === true ? 'Yes' : v === false ? 'No' : String(v); }

  protected options(f: Field): { value: string; label: string }[] {
    switch (f.options) {
      case 'brands': return this.brands().filter(b => b.isActive).map(b => ({ value: b.id, label: `${b.name} (${b.categoryName})` }));
      case 'sizes': return this.sizes().filter(s => s.isActive).map(s => ({ value: s.id, label: s.label }));
      case 'categories': return this.categories().filter(c => c.isActive).map(c => ({ value: c.id, label: c.name }));
      default: return [];
    }
  }

  protected open(row?: Row): void {
    this.formError.set('');
    this.editingId.set(row?.id ?? null);
    const controls: Record<string, FormControl> = {};
    for (const f of this.section().fields) {
      const initial = row?.[f.key] ?? (f.type === 'checkbox' ? f.key === 'isActive' : f.type === 'number' ? 0 : f.type === 'select' ? (this.options(f)[0]?.value ?? '') : '');
      controls[f.key] = new FormControl(initial, { nonNullable: true, validators: f.required ? [Validators.required] : [] });
    }
    this.form = new FormGroup(controls);
    this.drawer.set(true);
  }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const body = { ...this.form.getRawValue() } as Record<string, unknown>;
    for (const f of this.section().fields) if (f.type === 'number') body[f.key] = Number(body[f.key]);
    const id = this.editingId(), path = this.section().path;
    this.busy.set(true); this.formError.set('');
    (id ? this.api.put(`${path}/${id}`, body) : this.api.post(path, body)).subscribe({
      next: () => { this.busy.set(false); this.drawer.set(false); this.toast.success('Saved'); this.reload(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }
}

export type { BarCounter, BarProduct };
