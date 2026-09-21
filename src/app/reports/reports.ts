import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { ToastService } from '../core/toast.service';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../shared/ui';

interface ReportInfo { key: string; title: string; category: string; description: string; needsRange: boolean }
interface Column { key: string; label: string; type: string }
interface ReportResult { key: string; title: string; from: string | null; to: string | null; generatedAt: string; columns: Column[]; rows: Record<string, unknown>[]; totals: Record<string, unknown> | null }

const iso = (d: Date) => d.toLocaleDateString('en-CA');

@Component({
  selector: 'app-reports',
  imports: [EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-7xl space-y-6">
      <div><h1 class="text-2xl font-bold text-gray-900">Reports</h1><p class="text-sm text-gray-500">Sales, tax, payments, inventory and more — export any report</p></div>

      <div class="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav class="card max-h-[70vh] space-y-4 overflow-y-auto p-3" aria-label="Report list">
          @for (g of groups(); track g.category) {
            <div><p class="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{{ g.category }}</p>
              @for (r of g.items; track r.key) {
                <button type="button" class="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition" [class]="selected()?.key === r.key ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-gray-50'" (click)="select(r)">{{ r.title }}</button>
              }
            </div>
          }
        </nav>

        <section class="space-y-4">
          @if (selected(); as s) {
            <div class="card flex flex-wrap items-end gap-3 p-4">
              <div class="min-w-48 flex-1"><h2 class="text-base font-semibold text-gray-900">{{ s.title }}</h2><p class="text-xs text-gray-500">{{ s.description }}</p></div>
              @if (s.needsRange) {
                <div><label class="label" for="r-from">From</label><input id="r-from" type="date" class="input" [value]="from()" (change)="from.set($any($event.target).value)" /></div>
                <div><label class="label" for="r-to">To</label><input id="r-to" type="date" class="input" [value]="to()" (change)="to.set($any($event.target).value)" /></div>
              }
              <button type="button" class="btn-primary" [disabled]="loading()" (click)="run()"><span class="mi">play_arrow</span>Run</button>
              @if (canExport() && result()) {
                <div class="flex gap-1" role="group" aria-label="Export">
                  <button type="button" class="btn-ghost" [disabled]="exporting()" (click)="download('csv')">CSV</button>
                  <button type="button" class="btn-ghost" [disabled]="exporting()" (click)="download('xlsx')">Excel</button>
                  <button type="button" class="btn-ghost" [disabled]="exporting()" (click)="download('pdf')">PDF</button>
                </div>
              }
            </div>

            <div class="card overflow-hidden">
              @if (loading()) { <div class="p-6"><app-skeleton /></div> }
              @else if (error()) { <app-error-state [message]="error()" (retry)="run()" /> }
              @else if (result(); as r) {
                @if (r.rows.length === 0) { <app-empty-state icon="query_stats" title="No data for this period" hint="Try a wider date range." /> }
                @else {
                  <div class="overflow-x-auto"><table class="w-full text-left text-sm">
                    <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>@for (c of r.columns; track c.key) { <th class="whitespace-nowrap px-4 py-3" [class.text-right]="numeric(c)">{{ c.label }}</th> }</tr></thead>
                    <tbody class="divide-y divide-gray-100">
                      @for (row of r.rows; track $index) { <tr class="hover:bg-gray-50/60">@for (c of r.columns; track c.key) { <td class="whitespace-nowrap px-4 py-2.5 text-gray-700" [class.text-right]="numeric(c)">{{ fmt(row[c.key], c) }}</td> }</tr> }
                    </tbody>
                    @if (r.totals) { <tfoot class="border-t-2 border-gray-200 bg-gray-50 font-semibold"><tr>@for (c of r.columns; track c.key) { <td class="whitespace-nowrap px-4 py-3" [class.text-right]="numeric(c)">{{ fmt(r.totals[c.key], c) }}</td> }</tr></tfoot> }
                  </table></div>
                  <p class="px-4 py-2 text-xs text-gray-500">{{ r.rows.length }} row(s) · generated {{ generated() }}</p>
                }
              } @else { <app-empty-state icon="summarize" title="Choose a date range and run the report" /> }
            </div>
          } @else { <div class="card"><app-empty-state icon="assessment" title="Pick a report" hint="Select one from the list to get started." /></div> }
        </section>
      </div>
    </div>`,
})
export class ReportsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly brand = inject(BrandingService);

  protected readonly catalog = signal<ReportInfo[]>([]);
  protected readonly selected = signal<ReportInfo | null>(null);
  protected readonly result = signal<ReportResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal('');
  protected readonly from = signal(iso(new Date(Date.now() - 29 * 86400000)));
  protected readonly to = signal(iso(new Date()));
  protected readonly canExport = computed(() => this.auth.hasPermission('Reports.Export'));
  protected readonly groups = computed(() => {
    const map = new Map<string, ReportInfo[]>();
    for (const r of this.catalog()) map.set(r.category, [...(map.get(r.category) ?? []), r]);
    return [...map.entries()].map(([category, items]) => ({ category, items }));
  });
  protected readonly generated = computed(() => { const r = this.result(); return r ? new Date(r.generatedAt).toLocaleString() : ''; });

  ngOnInit(): void {
    this.api.get<ReportInfo[]>('reports').subscribe({ next: c => { this.catalog.set(c); if (c[0]) this.select(c[0]); }, error: e => this.toast.error(errorMessage(e)) });
  }

  protected select(r: ReportInfo): void { this.selected.set(r); this.result.set(null); this.error.set(''); this.run(); }

  private query(): Record<string, string> { return this.selected()?.needsRange ? { from: this.from(), to: this.to() } : {}; }

  protected run(): void {
    const s = this.selected();
    if (!s) return;
    this.loading.set(true); this.error.set('');
    this.api.get<ReportResult>(`reports/${s.key}`, this.query()).subscribe({
      next: r => { this.result.set(r); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected download(format: 'csv' | 'xlsx' | 'pdf'): void {
    const s = this.selected();
    if (!s) return;
    this.exporting.set(true);
    let params = new HttpParams().set('format', format);
    for (const [k, v] of Object.entries(this.query())) params = params.set(k, v);
    this.http.get(this.api.url(`reports/${s.key}`), { params, responseType: 'blob' }).subscribe({
      next: blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${s.key}-${this.from()}-${this.to()}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.exporting.set(false);
      },
      error: e => { this.exporting.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  protected numeric(c: Column): boolean { return ['int', 'number', 'money', 'percent'].includes(c.type); }

  protected fmt(v: unknown, c: Column): string {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v !== 'number') return String(v);
    if (c.type === 'money') return this.brand.money(v);
    if (c.type === 'percent') return `${v.toFixed(1)}%`;
    if (c.type === 'int') return String(Math.round(v));
    return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
}
