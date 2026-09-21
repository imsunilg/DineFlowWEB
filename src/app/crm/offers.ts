import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { ConfigCrudComponent, CrudSection } from '../shared/config-crud';

const SECTIONS: CrudSection[] = [
  { key: 'offers', label: 'Offers', singular: 'offer', path: 'loyalty/offers',
    cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Offer' }, { key: 'discountValue', label: 'Value' }, { key: 'minBillAmount', label: 'Min bill' }, { key: 'validTo', label: 'Valid until' }, { key: 'usedCount', label: 'Used' }, { key: 'isCurrentlyValid', label: 'Live now' }],
    fields: [
      { key: 'code', label: 'Coupon code', type: 'text', required: true, hint: 'Guests or staff type this at the POS. Letters, digits, - and _ only.' }, { key: 'name', label: 'Offer name', type: 'text', required: true }, { key: 'description', label: 'Description', type: 'text' },
      { key: 'discountType', label: 'Discount type', type: 'select', required: true, choices: [{ value: 'Percent', label: 'Percent of bill' }, { value: 'Amount', label: 'Fixed amount' }] },
      { key: 'discountValue', label: 'Discount value', type: 'number', step: '0.01', required: true }, { key: 'minBillAmount', label: 'Minimum bill', type: 'number', step: '0.01' },
      { key: 'maxDiscount', label: 'Maximum discount (optional)', type: 'number', step: '0.01', nullIfZero: true, hint: 'Leave 0 for no cap.' },
      { key: 'serviceArea', label: 'Applies to', type: 'select', optional: true, choices: [{ value: 'Restaurant', label: 'Restaurant items only' }, { value: 'Bar', label: 'Bar items only' }] },
      { key: 'validFrom', label: 'Valid from', type: 'date' }, { key: 'validTo', label: 'Valid until', type: 'date' },
      { key: 'usageLimit', label: 'Total usage limit (optional)', type: 'number', nullIfZero: true, hint: 'Leave 0 for unlimited.' }, { key: 'perCustomerLimit', label: 'Uses per customer (optional)', type: 'number', nullIfZero: true, hint: 'Leave 0 for unlimited.' },
      { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

@Component({
  selector: 'app-offers',
  imports: [ConfigCrudComponent],
  template: `<app-config-crud title="Offers & coupons" subtitle="Discount codes applied at the POS, with limits and validity" [sections]="sections" [canManage]="canManage()" />`,
})
export class OffersComponent {
  private readonly auth = inject(AuthService);
  protected readonly sections = SECTIONS;
  protected readonly canManage = computed(() => this.auth.hasPermission('Offer.Manage'));
}
