import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { Menu, MenuCategory, SERVICE_AREAS } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ConfirmService, DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../shared/ui';

type Mode = 'menu' | 'category';

@Component({
  selector: 'app-menu-categories',
  imports: [ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Menus & categories</h1><p class="text-sm text-gray-500">Organise what you sell, and where it is served</p></div>
        @if (canManage()) {
          <div class="flex gap-2">
            <button type="button" class="btn-ghost" (click)="openMenu()"><span class="mi">add</span>Menu</button>
            <button type="button" class="btn-primary" [disabled]="menus().length === 0" (click)="openCategory()"><span class="mi">add</span>Category</button>
          </div>
        }
      </div>

      @if (loading()) { <app-skeleton [count]="4" /> }
      @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
      @else if (menus().length === 0) { <div class="card"><app-empty-state icon="restaurant_menu" title="No menus yet" hint="Create a menu such as Breakfast, Dinner or Bar, then add categories to it." /></div> }
      @else {
        @for (m of menus(); track m.id) {
          <section class="card p-5">
            <div class="mb-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold text-gray-900">{{ m.name }}</h2>
                @if (!m.isActive) { <span class="badge bg-gray-100 text-gray-600">Inactive</span> }
              </div>
              @if (canManage()) {
                <div>
                  <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit menu" (click)="openMenu(m)"><span class="mi">edit</span></button>
                  <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Deactivate menu" (click)="deactivateMenu(m)"><span class="mi">block</span></button>
                </div>
              }
            </div>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              @for (c of categoriesOf(m.id); track c.id) {
                <div class="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3" [class.opacity-60]="!c.isActive">
                  <div><p class="text-sm font-semibold text-gray-900">{{ c.name }}</p>
                    <span class="badge mt-1" [class]="c.serviceArea === 'Bar' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'">{{ c.serviceArea }}</span></div>
                  @if (canManage()) { <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit category" (click)="openCategory(c)"><span class="mi">edit</span></button> }
                </div>
              } @empty { <p class="text-sm text-gray-500">No categories in this menu.</p> }
            </div>
          </section>
        }
      }
    </div>

    <app-drawer [open]="drawer() !== null" [title]="title()" (closed)="drawer.set(null)">
      <form id="mcForm" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
        <div><label class="label" for="mname">Name</label><input id="mname" class="input" formControlName="name" />
          @if (form.controls.name.touched && form.controls.name.invalid) { <p class="field-error">Name is required.</p> }</div>
        @if (drawer() === 'category') {
          <div><label class="label" for="mmenu">Menu</label><select id="mmenu" class="input" formControlName="menuId">@for (m of menus(); track m.id) { <option [value]="m.id">{{ m.name }}</option> }</select></div>
          <div><label class="label" for="marea">Served at</label><select id="marea" class="input" formControlName="serviceArea">@for (a of areas; track a) { <option [value]="a">{{ a }}</option> }</select></div>
        } @else {
          <div><label class="label" for="mdesc">Description</label><input id="mdesc" class="input" formControlName="description" /></div>
        }
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="msort">Sort order</label><input id="msort" class="input" type="number" formControlName="sortOrder" /></div>
          <label class="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" formControlName="isActive" /> Active</label>
        </div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      <div drawer-actions>
        <button type="button" class="btn-ghost" (click)="drawer.set(null)">Cancel</button>
        <button type="submit" form="mcForm" class="btn-primary" [disabled]="busy()">Save</button>
      </div>
    </app-drawer>`,
})
export class MenuCategoriesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);

  protected readonly areas = SERVICE_AREAS;
  protected readonly menus = signal<Menu[]>([]);
  protected readonly categories = signal<MenuCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly drawer = signal<Mode | null>(null);
  private readonly editingId = signal<string | null>(null);
  protected readonly canManage = computed(() => this.auth.hasPermission('Menu.Manage'));
  protected readonly title = computed(() => `${this.editingId() ? 'Edit' : 'New'} ${this.drawer() === 'category' ? 'category' : 'menu'}`);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    menuId: [''],
    serviceArea: ['Restaurant'],
    description: [''],
    sortOrder: [0],
    isActive: [true],
  });

  ngOnInit(): void { this.load(); }

  protected categoriesOf(menuId: string): MenuCategory[] { return this.categories().filter(c => c.menuId === menuId); }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ menus: this.api.get<Menu[]>('menu/menus'), cats: this.api.get<MenuCategory[]>('menu/categories') }).subscribe({
      next: r => { this.menus.set(r.menus); this.categories.set(r.cats); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected openMenu(m?: Menu): void {
    this.formError.set('');
    this.editingId.set(m?.id ?? null);
    this.form.reset({ name: m?.name ?? '', menuId: '', serviceArea: 'Restaurant', description: m?.description ?? '', sortOrder: m?.sortOrder ?? this.menus().length + 1, isActive: m?.isActive ?? true });
    this.drawer.set('menu');
  }

  protected openCategory(c?: MenuCategory): void {
    this.formError.set('');
    this.editingId.set(c?.id ?? null);
    this.form.reset({ name: c?.name ?? '', menuId: c?.menuId ?? this.menus()[0]?.id ?? '', serviceArea: c?.serviceArea ?? 'Restaurant', description: '', sortOrder: c?.sortOrder ?? 0, isActive: c?.isActive ?? true });
    this.drawer.set('category');
  }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const id = this.editingId();
    const isCat = this.drawer() === 'category';
    const path = isCat ? 'menu/categories' : 'menu/menus';
    const body = isCat
      ? { menuId: v.menuId, name: v.name, serviceArea: v.serviceArea, sortOrder: v.sortOrder, isActive: v.isActive }
      : { name: v.name, description: v.description || null, sortOrder: v.sortOrder, isActive: v.isActive };
    this.busy.set(true);
    (id ? this.api.put(`${path}/${id}`, body) : this.api.post(path, body)).subscribe({
      next: () => { this.busy.set(false); this.drawer.set(null); this.toast.success('Saved'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected async deactivateMenu(m: Menu): Promise<void> {
    if (!(await this.confirm.ask({ title: `Deactivate ${m.name}?`, message: 'The menu is hidden from ordering. Items are kept.', confirmText: 'Deactivate', danger: true }))) return;
    this.api.delete(`menu/menus/${m.id}`).subscribe({ next: () => { this.toast.success('Menu deactivated'); this.load(); }, error: e => this.toast.error(errorMessage(e)) });
  }
}
