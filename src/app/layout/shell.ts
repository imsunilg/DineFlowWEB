import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { SignalrService } from '../core/services/signalr.service';
import { NotificationBellComponent } from './notification-bell';

interface NavItem { label: string; icon: string; link: string; permission?: string; feature?: string }
interface NavGroup { title: string; items: NavItem[] }

/** Only routes that exist are listed; later phases append their entries here. */
const NAV: NavGroup[] = [
  { title: '', items: [{ label: 'Dashboard', icon: 'space_dashboard', link: '/dashboard', permission: 'Dashboard.View' }] },
  { title: 'Operations', items: [
    { label: 'POS', icon: 'point_of_sale', link: '/pos', permission: 'Order.Create', feature: 'restaurantManagement' },
    { label: 'Tables', icon: 'table_restaurant', link: '/tables', permission: 'Table.View', feature: 'restaurantManagement' },
    { label: 'Orders', icon: 'receipt_long', link: '/orders', permission: 'Order.View' },
    { label: 'Kitchen', icon: 'soup_kitchen', link: '/kitchen', permission: 'Kitchen.View' },
    { label: 'Reservations', icon: 'event_available', link: '/reservations', permission: 'Reservation.View', feature: 'reservation' },
  ] },
  { title: 'Bar', items: [
    { label: 'Bar POS', icon: 'local_bar', link: '/bar/pos', permission: 'Order.Create', feature: 'barManagement' },
    { label: 'Bar stock', icon: 'inventory_2', link: '/bar/stock', permission: 'Bar.View', feature: 'barManagement' },
    { label: 'Brands', icon: 'liquor', link: '/bar/brands', permission: 'Bar.View', feature: 'barManagement' },
    { label: 'Drinks', icon: 'wine_bar', link: '/bar/drinks', permission: 'Bar.View', feature: 'barManagement' },
  ] },
  { title: 'Restaurant', items: [
    { label: 'Menu', icon: 'restaurant_menu', link: '/menu', permission: 'Menu.View', feature: 'restaurantManagement' },
    { label: 'Categories', icon: 'category', link: '/menu/categories', permission: 'Menu.View', feature: 'restaurantManagement' },
  ] },
  { title: 'Inventory', items: [
    { label: 'Stock', icon: 'inventory', link: '/inventory/stock', permission: 'Inventory.View', feature: 'inventory' },
    { label: 'Purchases', icon: 'local_shipping', link: '/inventory/purchases', permission: 'Purchase.View', feature: 'inventory' },
    { label: 'Suppliers', icon: 'storefront', link: '/inventory/suppliers', permission: 'Purchase.View', feature: 'inventory' },
    { label: 'Adjustments', icon: 'tune', link: '/inventory/adjustments', permission: 'Inventory.View', feature: 'inventory' },
    { label: 'Items & setup', icon: 'category', link: '/inventory/items', permission: 'Inventory.View', feature: 'inventory' },
    { label: 'Recipes', icon: 'menu_book', link: '/inventory/recipes', permission: 'Inventory.View', feature: 'inventory' },
  ] },
  { title: 'CRM', items: [
    { label: 'Customers', icon: 'groups', link: '/customers', permission: 'Customer.View' },
    { label: 'Loyalty', icon: 'loyalty', link: '/loyalty', permission: 'Loyalty.View', feature: 'loyalty' },
    { label: 'Offers', icon: 'sell', link: '/offers', permission: 'Loyalty.View', feature: 'loyalty' },
  ] },
  { title: 'Finance', items: [
    { label: 'Expenses', icon: 'payments', link: '/finance/expenses', permission: 'Expense.View' },
    { label: 'Expense categories', icon: 'label', link: '/finance/expense-categories', permission: 'Expense.View' },
    { label: 'Taxes & payments', icon: 'receipt', link: '/finance/settings', permission: 'Payment.View' },
  ] },
  { title: 'Staff', items: [
    { label: 'Employees', icon: 'badge', link: '/staff/employees', permission: 'Staff.View', feature: 'staff' },
    { label: 'Attendance', icon: 'schedule', link: '/staff/attendance', permission: 'Staff.View', feature: 'staff' },
    { label: 'Leave', icon: 'beach_access', link: '/staff/leave', permission: 'Staff.View', feature: 'staff' },
    { label: 'Departments & shifts', icon: 'account_tree', link: '/staff/setup', permission: 'Staff.View', feature: 'staff' },
  ] },
  { title: 'Insights', items: [{ label: 'Reports', icon: 'assessment', link: '/reports', permission: 'Reports.View' }] },
  { title: 'Administration', items: [
    { label: 'Users', icon: 'manage_accounts', link: '/admin/users', permission: 'User.View' },
    { label: 'Roles & permissions', icon: 'admin_panel_settings', link: '/admin/roles', permission: 'Role.View' },
    { label: 'Business settings', icon: 'settings', link: '/admin/settings', permission: 'Tenant.View' },
  ] },
];

const LIVE_STATUS = {
  connected: { label: 'Live', class: 'text-emerald-700', dot: 'bg-emerald-500', title: 'Real-time updates are connected' },
  connecting: { label: 'Connecting…', class: 'text-amber-700', dot: 'bg-amber-500 animate-pulse', title: 'Connecting to real-time updates' },
  reconnecting: { label: 'Reconnecting…', class: 'text-amber-700', dot: 'bg-amber-500 animate-pulse', title: 'Real-time updates lost the connection; retrying' },
  disconnected: { label: 'Offline', class: 'text-gray-400', dot: 'bg-gray-300', title: 'Real-time updates are not connected' },
};

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NotificationBellComponent],
  template: `
    <div class="flex h-screen overflow-hidden">
      @if (menuOpen()) { <div class="fixed inset-0 z-30 bg-black/40 lg:hidden" (click)="menuOpen.set(false)"></div> }
      <aside class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink text-gray-300 transition-transform lg:static lg:translate-x-0"
             [class.-translate-x-full]="!menuOpen()">
        <div class="flex h-16 items-center gap-3 px-5">
          @if (branding.branding()?.logoUrl; as logo) {
            <img [src]="logo" alt="" class="h-9 w-9 rounded-lg object-contain" />
          } @else {
            <div class="grid h-9 w-9 place-items-center rounded-lg bg-brand text-base font-bold text-white">{{ initial() }}</div>
          }
          <span class="truncate text-base font-semibold text-white">{{ branding.name() }}</span>
        </div>
        <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          @for (group of groups(); track group.title) {
            <div>
              @if (group.title) { <p class="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ group.title }}</p> }
              @for (item of group.items; track item.link) {
                <a [routerLink]="item.link" routerLinkActive="bg-white/10 text-white" [routerLinkActiveOptions]="{ exact: true }"
                   class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5 hover:text-white" (click)="menuOpen.set(false)">
                  <span class="mi">{{ item.icon }}</span>{{ item.label }}
                </a>
              }
            </div>
          }
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
          <button type="button" class="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="Open menu" (click)="menuOpen.set(true)"><span class="mi">menu</span></button>
          <p class="hidden text-sm font-medium text-gray-500 lg:block">{{ branding.displayName() }}</p>
          <div class="flex items-center gap-3">
            <span class="hidden items-center gap-1.5 text-xs font-medium sm:flex" [class]="liveStatus().class" [title]="liveStatus().title">
              <span class="h-2 w-2 rounded-full" [class]="liveStatus().dot"></span>{{ liveStatus().label }}
            </span>
            <app-notification-bell />
            <div class="text-right leading-tight">
              <p class="text-sm font-semibold text-gray-900">{{ auth.user()?.fullName }}</p>
              <p class="text-xs text-gray-500">{{ auth.user()?.roles?.join(', ') }}</p>
            </div>
            <button type="button" class="btn-ghost" (click)="auth.logout()"><span class="mi">logout</span><span class="hidden sm:inline">Sign out</span></button>
          </div>
        </header>
        <main class="flex-1 overflow-y-auto p-4 lg:p-8"><router-outlet /></main>
      </div>
    </div>`,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly branding = inject(BrandingService);
  private readonly signalr = inject(SignalrService);
  protected readonly menuOpen = signal(false);

  protected readonly initial = computed(() => (this.branding.name() || '?').charAt(0).toUpperCase());
  protected readonly liveStatus = computed(() => LIVE_STATUS[this.signalr.state()]);
  protected readonly groups = computed(() =>
    NAV.map(g => ({ ...g, items: g.items.filter(i => (!i.permission || this.auth.hasPermission(i.permission)) && this.branding.isEnabled(i.feature)) }))
       .filter(g => g.items.length > 0));
}
