import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { BarProduct, Drink } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../shared/ui';

type PourRow = FormGroup<{ variantId: FormControl<string>; label: FormControl<string>; productId: FormControl<string>; ml: FormControl<number> }>;

/** Links each bar menu item (and size) to the liquor it consumes, so every sale deducts stock automatically. */
@Component({
  selector: 'app-bar-drinks',
  imports: [ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div><h1 class="text-2xl font-bold text-gray-900">Drinks</h1><p class="text-sm text-gray-500">Bar menu items and the liquor each serve consumes</p></div>
      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (drinks().length === 0) { <app-empty-state icon="local_bar" title="No bar items" hint="Create menu items in a category served at the Bar." /> }
        @else {
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Drink</th><th class="px-5 py-3">Category</th><th class="px-5 py-3 text-right">Price</th><th class="px-5 py-3">Stock consumption</th><th class="px-5 py-3"></th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              @for (d of drinks(); track d.id) {
                <tr class="hover:bg-gray-50/60">
                  <td class="px-5 py-3"><p class="font-semibold text-gray-900">{{ d.name }}</p><p class="text-xs text-gray-500">{{ d.code }}</p></td>
                  <td class="px-5 py-3 text-gray-600">{{ d.categoryName }}</td>
                  <td class="px-5 py-3 text-right font-semibold">{{ branding.money(d.basePrice) }}</td>
                  <td class="px-5 py-3">
                    @for (p of d.pours; track $index) { <p class="text-gray-700"><span class="font-semibold">{{ p.mlPerUnit }} ml</span> of {{ p.productName }}@if (p.variantName) { <span class="text-gray-400"> · {{ p.variantName }}</span> }</p> }
                    @empty { <span class="badge bg-amber-50 text-amber-700">Not tracked</span> }
                  </td>
                  <td class="px-5 py-3 text-right">@if (canManage()) { <button type="button" class="text-sm font-semibold text-brand hover:underline" (click)="open(d)">Set consumption</button> }</td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    <app-drawer [open]="editing() !== null" [title]="'Stock consumption · ' + (editing()?.name ?? '')" (closed)="editing.set(null)">
      <div class="space-y-4">
        <p class="text-sm text-gray-500">Choose which bottle each serve is poured from and how much. Leave a row on “Not tracked” to skip stock deduction.</p>
        @for (row of rows.controls; track $index) {
          <div class="rounded-xl border border-gray-200 p-3" [formGroup]="row">
            <p class="mb-2 text-sm font-semibold text-gray-900">{{ row.controls.label.value }}</p>
            <div class="grid grid-cols-3 gap-2">
              <select class="input col-span-2" aria-label="Bottle" formControlName="productId"><option value="">Not tracked</option>@for (p of products(); track p.id) { <option [value]="p.id">{{ p.displayName }}</option> }</select>
              <div class="flex items-center gap-1"><input class="input" type="number" min="1" aria-label="Millilitres per serve" formControlName="ml" /><span class="text-xs text-gray-500">ml</span></div>
            </div>
          </div>
        }
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </div>
      <div drawer-actions><button type="button" class="btn-ghost" (click)="editing.set(null)">Cancel</button><button type="button" class="btn-primary" [disabled]="busy()" (click)="save()">Save</button></div>
    </app-drawer>`,
})
export class BarDrinksComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branding = inject(BrandingService);

  protected readonly drinks = signal<Drink[]>([]);
  protected readonly products = signal<BarProduct[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly editing = signal<Drink | null>(null);
  protected readonly rows = new FormArray<PourRow>([]);
  protected readonly canManage = computed(() => this.auth.hasPermission('Bar.Manage'));

  ngOnInit(): void { this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    forkJoin({ drinks: this.api.get<Drink[]>('bar/drinks'), products: this.api.get<BarProduct[]>('bar/products') }).subscribe({
      next: r => { this.drinks.set(r.drinks); this.products.set(r.products.filter(p => p.isActive)); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected open(d: Drink): void {
    this.formError.set('');
    this.rows.clear();
    const make = (variantId: string | null, label: string) => {
      const pour = d.pours.find(p => (p.variantId ?? null) === variantId);
      this.rows.push(new FormGroup({
        variantId: new FormControl(variantId ?? '', { nonNullable: true }), label: new FormControl(label, { nonNullable: true }),
        productId: new FormControl(pour?.productId ?? '', { nonNullable: true }), ml: new FormControl(pour?.mlPerUnit ?? 30, { nonNullable: true }),
      }));
    };
    make(null, d.variants.length ? 'Standard serve' : 'Each serve');
    for (const v of d.variants) make(v.id, v.name);
    this.editing.set(d);
  }

  protected save(): void {
    const d = this.editing(); if (!d) return;
    const pours = this.rows.getRawValue().filter(r => r.productId).map(r => ({ variantId: r.variantId || null, productId: r.productId, mlPerUnit: Number(r.ml) }));
    this.busy.set(true); this.formError.set('');
    this.api.put(`bar/drinks/${d.id}/pours`, { pours }).subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success('Consumption saved'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }
}
