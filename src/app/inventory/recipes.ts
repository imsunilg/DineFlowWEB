import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { InvItem, Paged, Recipe } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../shared/ui';

type LineRow = FormGroup<{ variantId: FormControl<string>; itemId: FormControl<string>; quantity: FormControl<number> }>;

/** Recipes link a menu item (per size) to the ingredients it uses; every sale then deducts stock automatically. */
@Component({
  selector: 'app-recipes',
  imports: [ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div><h1 class="text-2xl font-bold text-gray-900">Recipes</h1><p class="text-sm text-gray-500">What each dish uses from inventory, so stock follows your sales</p></div>
      <div class="card p-4"><div class="relative"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
        <input class="input pl-10" placeholder="Search dishes" aria-label="Search dishes" (input)="query.set($any($event.target).value)" /></div></div>
      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (visible().length === 0) { <app-empty-state icon="menu_book" title="No dishes found" /> }
        @else {
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Dish</th><th class="px-5 py-3">Category</th><th class="px-5 py-3">Ingredients</th><th class="px-5 py-3"></th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              @for (r of visible(); track r.menuItemId) {
                <tr class="hover:bg-gray-50/60">
                  <td class="px-5 py-3"><p class="font-semibold text-gray-900">{{ r.name }}</p><p class="text-xs text-gray-500">{{ r.code }}</p></td>
                  <td class="px-5 py-3 text-gray-600">{{ r.categoryName }}</td>
                  <td class="px-5 py-3">@for (l of r.lines; track $index) { <p class="text-gray-700"><span class="font-semibold">{{ l.quantity }} {{ l.unitCode }}</span> {{ l.itemName }}@if (l.variantName) { <span class="text-gray-400"> · {{ l.variantName }}</span> }</p> } @empty { <span class="badge bg-amber-50 text-amber-700">No recipe</span> }</td>
                  <td class="px-5 py-3 text-right">@if (canEdit()) { <button type="button" class="text-sm font-semibold text-brand hover:underline" (click)="open(r)">Edit recipe</button> }</td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    <app-drawer [open]="editing() !== null" [title]="'Recipe · ' + (editing()?.name ?? '')" (closed)="editing.set(null)">
      <div class="space-y-3">
        <p class="text-sm text-gray-500">List what one serve uses. Give a size its own lines to override the standard recipe for that size.</p>
        @for (row of rows.controls; track $index) {
          <div class="grid grid-cols-12 items-center gap-2" [formGroup]="row">
            <select class="input col-span-3" aria-label="Size" formControlName="variantId"><option value="">Standard</option>@for (v of editing()?.variants ?? []; track v.id) { <option [value]="v.id">{{ v.name }}</option> }</select>
            <select class="input col-span-5" aria-label="Ingredient" formControlName="itemId">@for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }} ({{ i.unitCode }})</option> }</select>
            <input class="input col-span-3" type="number" min="0" step="0.001" aria-label="Quantity" formControlName="quantity" />
            <button type="button" class="col-span-1 rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Remove ingredient" (click)="rows.removeAt($index)"><span class="mi">close</span></button>
          </div>
        }
        <button type="button" class="text-sm font-semibold text-brand" (click)="addRow()">+ Add ingredient</button>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </div>
      <div drawer-actions><button type="button" class="btn-ghost" (click)="editing.set(null)">Cancel</button><button type="button" class="btn-primary" [disabled]="busy()" (click)="save()">Save recipe</button></div>
    </app-drawer>`,
})
export class RecipesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly recipes = signal<Recipe[]>([]);
  protected readonly items = signal<InvItem[]>([]);
  protected readonly query = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly editing = signal<Recipe | null>(null);
  protected readonly rows = new FormArray<LineRow>([]);
  protected readonly canEdit = computed(() => this.auth.hasPermission('Inventory.Create'));
  protected readonly visible = computed(() => { const q = this.query().trim().toLowerCase(); return this.recipes().filter(r => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)); });

  ngOnInit(): void { this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    forkJoin({ recipes: this.api.get<Recipe[]>('inventory/recipes'), items: this.api.get<Paged<InvItem>>('inventory/items', { pageSize: 200 }) }).subscribe({
      next: r => { this.recipes.set(r.recipes); this.items.set(r.items.items.filter(i => i.isActive)); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private row(variantId = '', itemId = '', quantity = 0): LineRow {
    return new FormGroup({
      variantId: new FormControl(variantId, { nonNullable: true }), itemId: new FormControl(itemId || (this.items()[0]?.id ?? ''), { nonNullable: true, validators: Validators.required }),
      quantity: new FormControl(quantity, { nonNullable: true, validators: [Validators.required, Validators.min(0.0001)] }),
    });
  }

  protected addRow(): void { this.rows.push(this.row()); }

  protected open(r: Recipe): void {
    this.formError.set('');
    this.rows.clear();
    for (const l of r.lines) this.rows.push(this.row(l.variantId ?? '', l.itemId, l.quantity));
    this.editing.set(r);
  }

  protected save(): void {
    const r = this.editing(); if (!r) return;
    if (this.rows.invalid) { this.rows.markAllAsTouched(); this.formError.set('Every ingredient needs a quantity above zero.'); return; }
    const lines = this.rows.getRawValue().map(x => ({ variantId: x.variantId || null, itemId: x.itemId, quantity: Number(x.quantity) }));
    this.busy.set(true); this.formError.set('');
    this.api.put(`inventory/recipes/${r.menuItemId}`, { lines }).subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success('Recipe saved'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }
}
