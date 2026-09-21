import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { ToastService } from '../core/toast.service';
import { ConfigCrudComponent, CrudSection } from '../shared/config-crud';

const SECTIONS: CrudSection[] = [
  { key: 'taxes', label: 'Taxes', singular: 'tax', path: 'finance/taxes',
    cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'ratePercent', label: 'Rate %' }, { key: 'groupName', label: 'Group' }, { key: 'serviceArea', label: 'Applies to' }, { key: 'validFrom', label: 'From' }, { key: 'validTo', label: 'Until' }],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true }, { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'ratePercent', label: 'Rate (%)', type: 'number', step: '0.01', required: true },
      { key: 'groupName', label: 'Tax group', type: 'text', hint: 'Optional, e.g. GST, to group component taxes on reports.' },
      { key: 'serviceArea', label: 'Applies to', type: 'select', optional: true, choices: [{ value: 'Restaurant', label: 'Restaurant only' }, { value: 'Bar', label: 'Bar only' }] },
      { key: 'validFrom', label: 'Effective from', type: 'date' }, { key: 'validTo', label: 'Effective until', type: 'date' },
      { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'methods', label: 'Payment methods', singular: 'payment method', path: 'finance/payment-methods',
    cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'sortOrder', label: 'Order' }],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true }, { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'sortOrder', label: 'Display order', type: 'number' }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

@Component({
  selector: 'app-finance-settings',
  imports: [ReactiveFormsModule, ConfigCrudComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <section class="card p-5">
        <h2 class="text-lg font-bold text-gray-900">Billing rules</h2>
        <p class="mb-4 text-sm text-gray-500">Applied to every new bill. Existing bills keep the amounts they were generated with.</p>
        <form class="grid grid-cols-1 items-end gap-4 sm:grid-cols-4" [formGroup]="form" (ngSubmit)="save()">
          <div><label class="label" for="b-sc">Service charge (%)</label><input id="b-sc" type="number" step="0.01" min="0" max="100" class="input" formControlName="serviceChargePercent" /></div>
          <div><label class="label" for="b-ro">Round-off step</label><input id="b-ro" type="number" step="0.01" min="0" class="input" formControlName="roundOffStep" /></div>
          <div><label class="label" for="b-md">Max discount (%)</label><input id="b-md" type="number" step="0.01" min="0" max="100" class="input" formControlName="maxDiscountPercent" /></div>
          @if (canManage()) { <button type="submit" class="btn-primary" [disabled]="busy() || form.invalid">Save</button> }
        </form>
        @if (error()) { <p class="field-error mt-2">{{ error() }}</p> }
      </section>
    </div>
    <div class="mt-6"><app-config-crud title="Taxes & payment methods" subtitle="Configured per tenant — nothing is hard-coded" [sections]="sections" [canManage]="canManage()" /></div>`,
})
export class FinanceSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly sections = SECTIONS;
  protected readonly canManage = computed(() => this.auth.hasPermission('Settings.Manage'));
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = new FormGroup({
    serviceChargePercent: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(100)] }),
    roundOffStep: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    maxDiscountPercent: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(100)] }),
  });

  ngOnInit(): void {
    this.api.get<ReturnType<typeof this.form.getRawValue>>('finance/billing-settings').subscribe({
      next: s => this.form.patchValue(s), error: e => this.error.set(errorMessage(e)),
    });
    if (!this.canManage()) this.form.disable();
  }

  protected save(): void {
    const v = this.form.getRawValue();
    this.busy.set(true); this.error.set('');
    this.api.put('finance/billing-settings', { serviceChargePercent: Number(v.serviceChargePercent), roundOffStep: Number(v.roundOffStep), maxDiscountPercent: Number(v.maxDiscountPercent) }).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Billing rules saved'); },
      error: e => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }
}
