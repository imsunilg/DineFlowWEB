import { Routes } from '@angular/router';
import { accessGuard, authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./auth/login').then(m => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then(m => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', canActivate: [accessGuard], data: { permission: 'Dashboard.View' }, loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent) },
      { path: 'tables', canActivate: [accessGuard], data: { permission: 'Table.View', feature: 'restaurantManagement' }, loadComponent: () => import('./restaurant/tables').then(m => m.TablesComponent) },
      { path: 'menu', canActivate: [accessGuard], data: { permission: 'Menu.View', feature: 'restaurantManagement' }, loadComponent: () => import('./menu/menu-items').then(m => m.MenuItemsComponent) },
      { path: 'menu/categories', canActivate: [accessGuard], data: { permission: 'Menu.View', feature: 'restaurantManagement' }, loadComponent: () => import('./menu/menu-categories').then(m => m.MenuCategoriesComponent) },
      { path: 'customers', canActivate: [accessGuard], data: { permission: 'Customer.View' }, loadComponent: () => import('./crm/customers').then(m => m.CustomersComponent) },
      { path: 'forbidden', loadComponent: () => import('./layout/forbidden').then(m => m.ForbiddenComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
