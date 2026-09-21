import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';

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
  ] },
  { title: 'Restaurant', items: [
    { label: 'Menu', icon: 'restaurant_menu', link: '/menu', permission: 'Menu.View', feature: 'restaurantManagement' },
    { label: 'Categories', icon: 'category', link: '/menu/categories', permission: 'Menu.View', feature: 'restaurantManagement' },
  ] },
  { title: 'CRM', items: [{ label: 'Customers', icon: 'groups', link: '/customers', permission: 'Customer.View' }] },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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
  protected readonly menuOpen = signal(false);

  protected readonly initial = computed(() => (this.branding.name() || '?').charAt(0).toUpperCase());
  protected readonly groups = computed(() =>
    NAV.map(g => ({ ...g, items: g.items.filter(i => (!i.permission || this.auth.hasPermission(i.permission)) && this.branding.isEnabled(i.feature)) }))
       .filter(g => g.items.length > 0));
}
