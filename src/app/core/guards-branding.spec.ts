import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { BrandingService } from './branding.service';
import { accessGuard, authGuard, guestGuard } from './guards';
import { Branding } from './models';

const brand = (over: Partial<Branding> = {}): Branding => ({
  tenantCode: 'ACME', applicationName: 'Acme', displayName: 'Acme Bar & Grill', logoUrl: null, faviconUrl: null, primaryColor: '#0055aa', secondaryColor: '#111827',
  accentColor: '#f59e0b', currency: 'EUR', currencySymbol: '€', timeZone: 'UTC', dateFormat: 'dd/MM/yyyy', timeFormat: 'HH:mm', receiptHeader: null, receiptFooter: null,
  features: { barManagement: true, inventory: false }, platformName: 'Platform', ...over,
});

describe('route guards', () => {
  let auth: AuthService;
  let branding: BrandingService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    branding = TestBed.inject(BrandingService);
    branding.branding.set(brand());
  });

  const run = (guard: typeof accessGuard, data: Record<string, unknown> = {}) =>
    TestBed.runInInjectionContext(() => guard({ data } as unknown as ActivatedRouteSnapshot, {} as never));
  const signIn = (permissions: string[]) =>
    localStorage.setItem('auth.session', JSON.stringify({ accessToken: 'a', refreshToken: 'r', user: { id: 'u', email: 'e', fullName: 'n', tenantId: 't', tenantCode: 'ACME', roles: [], permissions } }));
  const reload = () => { TestBed.resetTestingModule(); TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }); branding = TestBed.inject(BrandingService); branding.branding.set(brand()); };
  const path = (t: unknown) => TestBed.inject(Router).serializeUrl(t as UrlTree);

  it('sends anonymous users to the login page and signed-in users away from it', () => {
    expect(path(run(authGuard))).toBe('/login');
    expect(run(guestGuard)).toBe(true);
    signIn([]); reload();
    expect(run(authGuard)).toBe(true);
    expect(path(run(guestGuard))).toBe('/dashboard');
  });

  it('blocks a route when the permission is missing', () => {
    signIn(['Order.View']); reload();
    expect(run(accessGuard, { permission: 'Order.View' })).toBe(true);
    expect(path(run(accessGuard, { permission: 'Expense.Approve' }))).toBe('/forbidden');
  });

  it('blocks a route when the tenant has switched the module off', () => {
    signIn(['Bar.View', 'Inventory.View']); reload();
    expect(run(accessGuard, { permission: 'Bar.View', feature: 'barManagement' })).toBe(true);
    expect(path(run(accessGuard, { permission: 'Inventory.View', feature: 'inventory' }))).toBe('/forbidden');
  });
});

describe('branding', () => {
  let branding: BrandingService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    branding = TestBed.inject(BrandingService);
  });

  it('formats money with the tenant currency symbol, never a hard-coded one', () => {
    branding.branding.set(brand({ currencySymbol: '₹' }));
    expect(branding.money(1234.5)).toBe('₹1,234.50');
    branding.branding.set(brand({ currencySymbol: '$' }));
    expect(branding.money(9)).toBe('$9.00');
  });

  it('puts the minus sign before the symbol', () => {
    branding.branding.set(brand({ currencySymbol: '₹' }));
    expect(branding.money(-0.4)).toBe('-₹0.40');
  });

  it('treats a feature as enabled unless the tenant explicitly turned it off', () => {
    branding.branding.set(brand());
    expect(branding.isEnabled(undefined)).toBe(true);
    expect(branding.isEnabled('barManagement')).toBe(true);
    expect(branding.isEnabled('inventory')).toBe(false);
    expect(branding.isEnabled('someFutureModule')).toBe(true);
  });

  it('exposes the tenant identity to the UI', () => {
    branding.branding.set(brand());
    expect(branding.displayName()).toBe('Acme Bar & Grill');
    expect(branding.currencySymbol()).toBe('€');
  });
});
