import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { ConfigCrudComponent, CrudLookup, CrudSection } from '../shared/config-crud';

const ITEM_SECTIONS: CrudSection[] = [
  { key: 'items', label: 'Items', singular: 'item', path: 'inventory/items', paged: true,
    cols: [{ key: 'name', label: 'Item' }, { key: 'code', label: 'Code' }, { key: 'categoryName', label: 'Category' }, { key: 'unitCode', label: 'Unit' }, { key: 'reorderLevel', label: 'Reorder at' }, { key: 'costPrice', label: 'Last cost' }],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true }, { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'categoryId', label: 'Category', type: 'select', options: 'categories', optional: true }, { key: 'unitId', label: 'Unit of measure', type: 'select', required: true, options: 'units' },
      { key: 'minStock', label: 'Minimum stock', type: 'number', step: '0.001' }, { key: 'maxStock', label: 'Maximum stock (0 = no limit)', type: 'number', step: '0.001' },
      { key: 'reorderLevel', label: 'Reorder level (raises a low-stock alert)', type: 'number', step: '0.001' }, { key: 'costPrice', label: 'Cost price per unit', type: 'number', step: '0.01' },
      { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'categories', label: 'Categories', singular: 'category', path: 'inventory/categories', cols: [{ key: 'name', label: 'Category' }],
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'units', label: 'Units', singular: 'unit', path: 'inventory/units', cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }],
    fields: [{ key: 'code', label: 'Code (e.g. KG)', type: 'text', required: true }, { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'warehouses', label: 'Warehouses', singular: 'warehouse', path: 'inventory/warehouses', cols: [{ key: 'name', label: 'Warehouse' }, { key: 'code', label: 'Code' }, { key: 'isDefault', label: 'Default' }],
    fields: [{ key: 'code', label: 'Code', type: 'text', required: true }, { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'isDefault', label: 'Default warehouse (receives purchases, feeds recipes)', type: 'checkbox' }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

const LOOKUPS: Record<string, CrudLookup> = {
  categories: { path: 'inventory/categories', label: r => r['name'] },
  units: { path: 'inventory/units', label: r => `${r['name']} (${r['code']})` },
};

@Component({
  selector: 'app-inventory-setup',
  imports: [ConfigCrudComponent],
  template: `<app-config-crud title="Inventory items" subtitle="Ingredients and supplies, their units and reorder levels" [sections]="sections" [lookups]="lookups" [canManage]="canManage()" />`,
})
export class InventorySetupComponent {
  private readonly auth = inject(AuthService);
  protected readonly sections = ITEM_SECTIONS;
  protected readonly lookups = LOOKUPS;
  protected readonly canManage = computed(() => this.auth.hasPermission('Inventory.Create'));
}

const SUPPLIER_SECTIONS: CrudSection[] = [
  { key: 'suppliers', label: 'Suppliers', singular: 'supplier', path: 'purchases/suppliers', paged: true,
    cols: [{ key: 'name', label: 'Supplier' }, { key: 'code', label: 'Code' }, { key: 'contactName', label: 'Contact' }, { key: 'phone', label: 'Phone' }, { key: 'paymentTermsDays', label: 'Terms (days)' }],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true }, { key: 'name', label: 'Business name', type: 'text', required: true },
      { key: 'contactName', label: 'Contact person', type: 'text' }, { key: 'phone', label: 'Phone', type: 'text' }, { key: 'email', label: 'Email', type: 'email' },
      { key: 'address', label: 'Address', type: 'text' }, { key: 'taxNumber', label: 'Tax number', type: 'text' },
      { key: 'paymentTermsDays', label: 'Payment terms (days until due)', type: 'number' }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

@Component({
  selector: 'app-suppliers',
  imports: [ConfigCrudComponent],
  template: `<app-config-crud title="Suppliers" subtitle="Who you buy from and on what terms" [sections]="sections" [canManage]="canManage()" />`,
})
export class SuppliersComponent {
  private readonly auth = inject(AuthService);
  protected readonly sections = SUPPLIER_SECTIONS;
  protected readonly canManage = computed(() => this.auth.hasPermission('Purchase.Manage'));
}
