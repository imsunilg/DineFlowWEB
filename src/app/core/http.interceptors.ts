import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

const isAuthCall = (url: string) => /\/auth\/(login|refresh)$/.test(url);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const withToken = (token: string | null) =>
    token && !isAuthCall(req.url) ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken(auth.accessToken())).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthCall(req.url) || !auth.isAuthenticated()) return throwError(() => err);
      return auth.refresh().pipe(
        switchMap(token => next(withToken(token))),
        catchError(e => { auth.expire(); return throwError(() => e); }));
    }));
};

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // 4xx are handled by the calling screen (validation, conflicts); only surface infrastructure failures globally.
      if (err.status === 0) toast.error('Cannot reach the server. Check your connection.');
      else if (err.status >= 500) toast.error(errorMessage(err));
      else if (err.status === 403) toast.error('You do not have permission to do that.');
      return throwError(() => err);
    }));
};

export function errorMessage(err: unknown): string {
  const e = err as HttpErrorResponse;
  const body = e?.error;
  if (body?.errors?.length) return body.errors.map((x: { message: string }) => x.message).join(' ');
  return body?.message ?? e?.message ?? 'Something went wrong.';
}
