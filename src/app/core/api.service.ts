import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AppConfigService } from './app-config.service';
import { ApiResponse } from './models';

type Query = Record<string, string | number | boolean | null | undefined>;

/** Thin wrapper that prefixes the base URL and unwraps the { success, data } envelope. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<ApiResponse<T>>(this.url(path), { params: this.params(query) }).pipe(map(r => r.data));
  }
  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<ApiResponse<T>>(this.url(path), body).pipe(map(r => r.data));
  }
  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<ApiResponse<T>>(this.url(path), body).pipe(map(r => r.data));
  }
  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<ApiResponse<T>>(this.url(path), body).pipe(map(r => r.data));
  }
  delete(path: string): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(this.url(path)).pipe(map(() => undefined));
  }

  url(path: string): string { return `${this.config.apiBaseUrl}/${path.replace(/^\//, '')}`; }

  private params(query?: Query): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
    return p;
  }
}
