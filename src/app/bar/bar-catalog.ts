import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { ConfigCrudComponent, CrudLookup, CrudSection } from '../shared/config-crud';

const SECTIONS: CrudSection[] = [
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

const LOOKUPS: Record<string, CrudLookup> = {
  brands: { path: 'bar/brands', label: r => `${r['name']} (${r['categoryName']})` },
  sizes: { path: 'bar/bottle-sizes', label: r => r['label'] },
  categories: { path: 'bar/categories', label: r => r['name'] },
};

@Component({
  selector: 'app-bar-catalog',
  imports: [ConfigCrudComponent],
  template: `<app-config-crud title="Brands & products" subtitle="The bottles your bar stocks and sells" [sections]="sections" [lookups]="lookups" [canManage]="canManage()" />`,
})
export class BarCatalogComponent {
  private readonly auth = inject(AuthService);
  protected readonly sections = SECTIONS;
  protected readonly lookups = LOOKUPS;
  protected readonly canManage = computed(() => this.auth.hasPermission('Bar.Manage'));
}
