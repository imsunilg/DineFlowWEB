import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor, errorInterceptor, errorMessage } from './http.interceptors';
import { AuthResponse, UserProfile } from './models';

const user: UserProfile = { id: 'u1', email: 'a@b.c', fullName: 'Asha Rao', tenantId: 't1', tenantCode: 'ACME', roles: ['Waiter'], permissions: ['Order.View', 'Order.Create'] };
const tokens = (n: number): AuthResponse => ({ accessToken: `access-${n}`, accessTokenExpiresAt: '2099-01-01T00:00:00Z', refreshToken: `refresh-${n}`, user });
const envelope = <T>(data: T) => ({ success: true, message: 'OK', data, errors: [] });

describe('authentication', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => backend.verify());

  function signIn(): void {
    auth.login('a@b.c', 'secret').subscribe();
    backend.expectOne('/api/v1/auth/login').flush(envelope(tokens(1)));
  }

  it('signs in, keeps the session and exposes permissions', () => {
    signIn();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.hasPermission('Order.Create')).toBe(true);
    expect(auth.hasPermission('Expense.Approve')).toBe(false);
    expect(auth.hasAnyRole('Waiter', 'Manager')).toBe(true);
    expect(JSON.parse(localStorage.getItem('auth.session')!).accessToken).toBe('access-1');
  });

  it('never sends the tenant id and does not attach a token to sign-in', () => {
    auth.login('a@b.c', 'secret', ' ').subscribe();
    const req = backend.expectOne('/api/v1/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(Object.keys(req.request.body)).toEqual(['email', 'password', 'tenantCode']);
    req.flush(envelope(tokens(1)));
  });

  it('attaches the bearer token to API calls', () => {
    signIn();
    http.get('/api/v1/orders').subscribe();
    expect(backend.expectOne('/api/v1/orders').request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('refreshes once on a 401 and retries the original request', () => {
    signIn();
    let result: unknown;
    http.get('/api/v1/orders').subscribe(r => (result = r));

    backend.expectOne('/api/v1/orders').flush({}, { status: 401, statusText: 'Unauthorized' });
    const refresh = backend.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush(envelope(tokens(2)));

    const retry = backend.expectOne('/api/v1/orders');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush({ ok: true });
    expect(result).toEqual({ ok: true });
  });

  it('shares one refresh between concurrent 401s', () => {
    signIn();
    http.get('/api/v1/a').subscribe();
    http.get('/api/v1/b').subscribe();
    http.get('/api/v1/c').subscribe();
    for (const path of ['a', 'b', 'c']) backend.expectOne(`/api/v1/${path}`).flush({}, { status: 401, statusText: 'Unauthorized' });

    backend.expectOne('/api/v1/auth/refresh').flush(envelope(tokens(2)));   // exactly one refresh request
    for (const path of ['a', 'b', 'c']) backend.expectOne(`/api/v1/${path}`).flush({});
  });

  it('signs the user out when the refresh token is rejected', () => {
    signIn();
    let failed = false;
    http.get('/api/v1/orders').subscribe({ error: () => (failed = true) });
    backend.expectOne('/api/v1/orders').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/refresh').flush({ errors: [{ code: 'REFRESH_TOKEN_REUSED', message: 'no' }] }, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('auth.session')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('does not try to refresh a failed sign-in', () => {
    let status = 0;
    auth.login('a@b.c', 'bad').subscribe({ error: e => (status = e.status) });
    backend.expectOne('/api/v1/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    backend.expectNone('/api/v1/auth/refresh');
  });

  it('logout revokes the refresh token and clears local state', () => {
    signIn();
    auth.logout();
    expect(backend.expectOne('/api/v1/auth/logout').request.body).toEqual({ refreshToken: 'refresh-1' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('auth.session')).toBeNull();
  });

  it('restores a saved session after a page reload', () => {
    localStorage.setItem('auth.session', JSON.stringify({ accessToken: 'saved', refreshToken: 'r', user }));
    expect(TestBed.runInInjectionContext(() => new AuthService()).accessToken()).toBe('saved');
  });
});

describe('error messages', () => {
  it('prefers the server error list, then the message', () => {
    expect(errorMessage({ error: { errors: [{ message: 'Not enough stock.' }, { message: 'Try later.' }], message: 'x' } })).toBe('Not enough stock. Try later.');
    expect(errorMessage({ error: { message: 'Bad request.' } })).toBe('Bad request.');
    expect(errorMessage(null)).toBe('Something went wrong.');
  });
});
