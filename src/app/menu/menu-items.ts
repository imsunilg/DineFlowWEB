import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { MenuCategory, MenuItem, Paged, STATIONS } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ConfirmService, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

type PriceRow = FormGroup<{ name: FormControl<string>; price: FormControl<number> }>;

function priceRow(name = '', price = 0): PriceRow {
  return new FormGroup({
    name: new FormControl(name, { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    price: new FormControl(price, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
  });
}

@Component({
  selector: 'app-menu-items',
  imports: [ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Menu items</h1><p class="text-sm text-gray-500">Prices, variants, add-ons and availability</p></div>
        @if (canManage()) { <button type="button" class="btn-primary" (click)="open()"><span class="mi">add</span>New item</button> }
      </div>

      <div class="card flex flex-wrap items-center gap-3 p-4">
        <div class="relative min-w-56 flex-1">
          <span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
          <input class="input pl-10" placeholder="Search by name or code" aria-label="Search items" (input)="onSearch($any($event.target).value)" />
        </div>
        <select class="input w-auto" aria-label="Filter by category" (change)="onCategory($any($event.target).value)">
          <option value="">All categories</option>
          @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }} ({{ c.serviceArea }})</option> }
        </select>
      </div>

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (items().length === 0) { <app-empty-state icon="restaurant_menu" title="No menu items found" hint="Try a different search, or add your first item." /> }
        @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr><th class="px-5 py-3">Item</th><th class="px-5 py-3">Category</th><th class="px-5 py-3">Station</th><th class="px-5 py-3 text-right">Price</th><th class="px-5 py-3">Available</th><th class="px-5 py-3"></th></tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (i of items(); track i.id) {
                  <tr class="hover:bg-gray-50/60">
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-2">
                        <span class="h-3.5 w-3.5 rounded-sm border-2" [class]="i.isVeg ? 'border-emerald-600' : 'border-rose-600'" [attr.title]="i.isVeg ? 'Vegetarian' : 'Non-vegetarian'"></span>
                        <div><p class="font-semibold text-gray-900">{{ i.name }}</p><p class="text-xs text-gray-500">{{ i.code }}@if (i.variants.length) { · {{ i.variants.length }} variants }</p></div>
                      </div>
                    </td>
                    <td class="px-5 py-3"><span class="badge" [class]="i.serviceArea === 'Bar' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'">{{ i.categoryName }}</span></td>
                    <td class="px-5 py-3 text-gray-600">{{ i.station }}</td>
                    <td class="px-5 py-3 text-right font-semibold">{{ branding.money(i.basePrice) }}</td>
                    <td class="px-5 py-3">
                      <button type="button" role="switch" [attr.aria-checked]="i.isAvailable" [attr.aria-label]="'Availability of ' + i.name" [disabled]="!canManage()"
                              class="relative h-6 w-11 rounded-full transition disabled:opacity-50" [class]="i.isAvailable ? 'bg-brand' : 'bg-gray-300'" (click)="toggle(i)">
                        <span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" [class]="i.isAvailable ? 'left-5.5' : 'left-0.5'"></span>
                      </button>
                    </td>
                    <td class="px-5 py-3 text-right">
                      @if (canManage()) {
                        <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit" (click)="open(i)"><span class="mi">edit</span></button>
                        <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Delete" (click)="remove(i)"><span class="mi">delete</span></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div>
        }
      </div>
    </div>

    <app-drawer [open]="drawer()" [title]="editingId() ? 'Edit menu item' : 'New menu item'" (closed)="drawer.set(false)">
      <form id="itemForm" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
        <div class="grid grid-cols-3 gap-4">
          <div class="col-span-2"><label class="label" for="iname">Name</label><input id="iname" class="input" formControlName="name" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <p class="field-error">Name is required.</p> }</div>
          <div><label class="label" for="icode">Code</label><input id="icode" class="input" formControlName="code" />
            @if (form.controls.code.touched && form.controls.code.invalid) { <p class="field-error">Code is required.</p> }</div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="icat">Category</label>
            <select id="icat" class="input" formControlName="categoryId">@for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
          <div><label class="label" for="istation">Station</label>
            <select id="istation" class="input" formControlName="station">@for (s of stations; track s) { <option [value]="s">{{ s }}</option> }</select></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="iprice">Base price</label><input id="iprice" class="input" type="number" min="0" step="0.01" formControlName="basePrice" />
            @if (form.controls.basePrice.invalid) { <p class="field-error">Enter a price of 0 or more.</p> }</div>
          <div class="flex items-end gap-5 pb-2">
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="isVeg" /> Vegetarian</label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="isAvailable" /> Available</label>
          </div>
        </div>
        <div><label class="label" for="idesc">Description</label><textarea id="idesc" rows="2" class="input" formControlName="description"></textarea></div>

        <fieldset class="space-y-2">
          <div class="flex items-center justify-between"><legend class="label mb-0">Variants</legend><button type="button" class="text-sm font-semibold text-brand" (click)="addRow(form.controls.variants)">+ Add variant</button></div>
          @for (g of form.controls.variants.controls; track $index) {
            <div class="flex gap-2" [formGroup]="g">
              <input class="input" placeholder="e.g. Large" aria-label="Variant name" formControlName="name" />
              <input class="input w-32" type="number" min="0" step="0.01" aria-label="Variant price" formControlName="price" />
              <button type="button" class="rounded-lg p-2 text-gray-500 hover:bg-red-50" aria-label="Remove variant" (click)="form.controls.variants.removeAt($index)"><span class="mi">close</span></button>
            </div>
          }
        </fieldset>
        <fieldset class="space-y-2">
          <div class="flex items-center justify-between"><legend class="label mb-0">Add-ons</legend><button type="button" class="text-sm font-semibold text-brand" (click)="addRow(form.controls.addons)">+ Add add-on</button></div>
          @for (g of form.controls.addons.controls; track $index) {
            <div class="flex gap-2" [formGroup]="g">
              <input class="input" placeholder="e.g. Extra cheese" aria-label="Add-on name" formControlName="name" />
              <input class="input w-32" type="number" min="0" step="0.01" aria-label="Add-on price" formControlName="price" />
              <button type="button" class="rounded-lg p-2 text-gray-500 hover:bg-red-50" aria-label="Remove add-on" (click)="form.controls.addons.removeAt($index)"><span class="mi">close</span></button>
            </div>
          }
        </fieldset>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      <div drawer-actions>
        <button type="button" class="btn-ghost" (click)="drawer.set(false)">Cancel</button>
        <button type="submit" form="itemForm" class="btn-primary" [disabled]="busy()">Save item</button>
      </div>
    </app-drawer>`,
})
export class MenuItemsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);
  protected readonly branding = inject(BrandingService);

  protected readonly stations = STATIONS;
  protected readonly items = signal<MenuItem[]>([]);
  protected readonly categories = signal<MenuCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly drawer = signal(false);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly canManage = computed(() => this.auth.hasPermission('Menu.Manage'));

  private search = '';
  private categoryId = '';
  private readonly search$ = new Subject<string>();

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    code: ['', [Validators.required, Validators.maxLength(50)]],
    categoryId: ['', Validators.required],
    station: ['Kitchen', Validators.required],
    basePrice: [0, [Validators.required, Validators.min(0)]],
    isVeg: [false],
    isAvailable: [true],
    description: [''],
    variants: new FormArray<PriceRow>([]),
    addons: new FormArray<PriceRow>([]),
  });

  constructor() { this.search$.pipe(debounceTime(300)).subscribe(s => { this.search = s; this.page.set(1); this.load(); }); }

  ngOnInit(): void {
    this.api.get<MenuCategory[]>('menu/categories').subscribe(c => this.categories.set(c.filter(x => x.isActive)));
    this.load();
  }

  protected onSearch(v: string): void { this.search$.next(v); }
  protected onCategory(v: string): void { this.categoryId = v; this.page.set(1); this.load(); }
  protected goTo(p: number): void { this.page.set(p); this.load(); }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<Paged<MenuItem>>('menu/items', { page: this.page(), pageSize: 15, search: this.search, categoryId: this.categoryId }).subscribe({
      next: r => { this.items.set(r.items); this.totalPages.set(r.totalPages); this.total.set(r.totalCount); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected addRow(arr: FormArray<PriceRow>): void { arr.push(priceRow()); }

  protected open(item?: MenuItem): void {
    this.formError.set('');
    this.editingId.set(item?.id ?? null);
    this.form.reset({
      name: item?.name ?? '', code: item?.code ?? '', categoryId: item?.categoryId ?? this.categories()[0]?.id ?? '',
      station: item?.station ?? 'Kitchen', basePrice: item?.basePrice ?? 0, isVeg: item?.isVeg ?? false,
      isAvailable: item?.isAvailable ?? true, description: item?.description ?? '',
    });
    this.form.controls.variants.clear();
    for (const v of item?.variants ?? []) this.form.controls.variants.push(priceRow(v.name, v.price));
    for (const a of item?.addons ?? []) this.form.controls.addons.push(priceRow(a.name, a.price));
    this.drawer.set(true);
  }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = {
      categoryId: v.categoryId, code: v.code, name: v.name, description: v.description || null, basePrice: v.basePrice, station: v.station,
      isVeg: v.isVeg, isAvailable: v.isAvailable, imageUrl: null, isActive: true,
      variants: v.variants.map(x => ({ name: x.name, price: x.price, isActive: true })),
      addons: v.addons.map(x => ({ name: x.name, price: x.price, isActive: true })),
    };
    const id = this.editingId();
    this.busy.set(true);
    (id ? this.api.put<MenuItem>(`menu/items/${id}`, body) : this.api.post<MenuItem>('menu/items', body)).subscribe({
      next: () => { this.busy.set(false); this.drawer.set(false); this.toast.success('Menu item saved'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected toggle(i: MenuItem): void {
    const next = !i.isAvailable;
    this.items.update(l => l.map(x => (x.id === i.id ? { ...x, isAvailable: next } : x)));
    this.api.patch<MenuItem>(`menu/items/${i.id}/availability`, { isAvailable: next }).subscribe({
      error: e => { this.items.update(l => l.map(x => (x.id === i.id ? { ...x, isAvailable: !next } : x))); this.toast.error(errorMessage(e)); },
    });
  }

  protected async remove(i: MenuItem): Promise<void> {
    if (!(await this.confirm.ask({ title: `Delete ${i.name}?`, message: 'The item is removed from the menu. Past orders keep their history.', confirmText: 'Delete', danger: true }))) return;
    this.api.delete(`menu/items/${i.id}`).subscribe({
      next: () => { this.toast.success('Item deleted'); this.load(); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }
}
