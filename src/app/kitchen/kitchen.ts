import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { KitchenItem, KitchenTicket } from '../core/models';
import { ToastService } from '../core/toast.service';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../shared/ui';

interface Column { key: string; title: string; statuses: string[]; next: string | null; action: string; accent: string }

const COLUMNS: Column[] = [
  { key: 'new', title: 'New', statuses: ['New', 'Accepted'], next: 'Preparing', action: 'Start preparing', accent: 'border-sky-400' },
  { key: 'prep', title: 'Preparing', statuses: ['Preparing'], next: 'Ready', action: 'Mark ready', accent: 'border-amber-400' },
  { key: 'ready', title: 'Ready to serve', statuses: ['Ready'], next: 'Served', action: 'Served', accent: 'border-emerald-400' },
];

/** Kitchen / bar display. Orders reach a station automatically from the item's station; this screen polls for new tickets. */
@Component({
  selector: 'app-kitchen',
  imports: [EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-[1600px] space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Kitchen display</h1><p class="text-sm text-gray-500">Live tickets by station · refreshes every few seconds</p></div>
        <span class="flex items-center gap-2 text-xs text-gray-500"><span class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>Updated {{ updatedAt() }}</span>
      </div>

      <div class="flex flex-wrap gap-2" role="tablist" aria-label="Station">
        <button type="button" role="tab" [attr.aria-selected]="station() === ''" class="badge cursor-pointer px-4 py-2 ring-1 ring-gray-200" [class]="station() === '' ? 'bg-ink text-white' : 'bg-white text-gray-700'" (click)="setStation('')">All stations</button>
        @for (s of stations(); track s) {
          <button type="button" role="tab" [attr.aria-selected]="station() === s" class="badge cursor-pointer px-4 py-2 ring-1 ring-gray-200" [class]="station() === s ? 'bg-ink text-white' : 'bg-white text-gray-700'" (click)="setStation(s)">{{ s }}</button>
        }
      </div>

      @if (loading()) { <app-skeleton [count]="4" /> }
      @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
      @else if (tickets().length === 0) { <div class="card"><app-empty-state icon="soup_kitchen" title="No open tickets" hint="Orders sent from the POS appear here instantly." /></div> }
      @else {
        <div class="grid gap-4 lg:grid-cols-3">
          @for (col of columns; track col.key) {
            <section class="min-w-0">
              <h2 class="mb-2 flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-gray-500">{{ col.title }}<span class="badge bg-white ring-1 ring-gray-200">{{ cards(col).length }}</span></h2>
              <div class="space-y-3">
                @for (c of cards(col); track c.ticket.orderId) {
                  <article class="card border-l-4 p-4" [class]="col.accent" [class.ring-2]="late(c.ticket)" [class.ring-red-300]="late(c.ticket)">
                    <header class="flex items-start justify-between">
                      <div>
                        <p class="text-base font-bold text-gray-900">{{ c.ticket.tableCode ? 'Table ' + c.ticket.tableCode : c.ticket.orderType }}</p>
                        <p class="text-xs text-gray-500">{{ c.ticket.orderNo }}</p>
                      </div>
                      <span class="badge" [class]="late(c.ticket) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'"><span class="mi mr-1 text-sm!">schedule</span>{{ elapsed(c.ticket) }}</span>
                    </header>
                    <ul class="mt-3 space-y-2">
                      @for (i of c.items; track i.id) {
                        <li class="flex items-start justify-between gap-2 text-sm">
                          <div class="min-w-0">
                            <p class="font-semibold text-gray-900"><span class="mr-1 rounded bg-gray-900 px-1.5 py-0.5 text-xs text-white">{{ i.quantity }}×</span>{{ i.name }}@if (i.variantName) { <span class="font-normal text-gray-500"> ({{ i.variantName }})</span> }</p>
                            @if (i.addons.length) { <p class="text-xs text-gray-500">+ {{ i.addons.join(', ') }}</p> }
                            @if (i.notes) { <p class="text-xs font-semibold text-amber-700">⚠ {{ i.notes }}</p> }
                            @if (!station()) { <p class="text-[11px] uppercase tracking-wide text-gray-400">{{ i.station }}</p> }
                          </div>
                          @if (canUpdate() && col.next) { <button type="button" class="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/10" [disabled]="busy()" (click)="advanceItem(i, col.next)">{{ col.next === 'Served' ? 'Serve' : col.next }}</button> }
                        </li>
                      }
                    </ul>
                    @if (canUpdate() && col.next) {
                      <button type="button" class="btn-primary mt-4 w-full" [disabled]="busy()" (click)="advanceTicket(c, col)">{{ col.action }}</button>
                    }
                  </article>
                } @empty { <p class="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">Nothing here</p> }
              </div>
            </section>
          }
        </div>
      }
    </div>`,
})
export class KitchenComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly columns = COLUMNS;
  protected readonly stations = signal<string[]>([]);
  protected readonly station = signal('');
  protected readonly tickets = signal<KitchenTicket[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly updatedAt = signal('');
  protected readonly now = signal(Date.now());
  protected readonly canUpdate = computed(() => this.auth.hasPermission('Kitchen.Update'));

  ngOnInit(): void {
    this.api.get<string[]>('kitchen/stations').subscribe(s => this.stations.set(s));
    this.load();
    interval(6000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.now.set(Date.now()); if (!this.busy()) this.load(true); });
  }

  protected setStation(s: string): void { this.station.set(s); this.load(); }

  protected load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.api.get<KitchenTicket[]>('kitchen/tickets', { station: this.station() }).subscribe({
      next: t => { this.tickets.set(t); this.loading.set(false); this.error.set(''); this.updatedAt.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })); },
      error: e => { if (!silent) this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  /** Tickets that have at least one item in this column. */
  protected cards(col: Column): { ticket: KitchenTicket; items: KitchenItem[] }[] {
    return this.tickets()
      .map(t => ({ ticket: t, items: t.items.filter(i => col.statuses.includes(i.status)) }))
      .filter(c => c.items.length > 0);
  }

  protected elapsed(t: KitchenTicket): string {
    if (!t.sentAt) return '';
    const mins = Math.max(0, Math.floor((this.now() - new Date(t.sentAt).getTime()) / 60000));
    return mins < 1 ? 'just now' : `${mins} min`;
  }
  protected late(t: KitchenTicket): boolean { return !!t.sentAt && this.now() - new Date(t.sentAt).getTime() > 20 * 60000; }

  protected advanceItem(i: KitchenItem, status: string): void {
    this.mutate(this.api.patch<KitchenTicket | null>(`kitchen/items/${i.id}/status`, { status }));
  }

  protected advanceTicket(c: { ticket: KitchenTicket; items: KitchenItem[] }, col: Column): void {
    if (!col.next) return;
    const stations = [...new Set(c.items.map(i => i.station))];
    const target = col.next;
    this.busy.set(true);
    let remaining = stations.length;
    for (const s of stations) {
      this.api.patch(`kitchen/orders/${c.ticket.orderId}/status`, { station: s, status: target }).subscribe({
        error: e => this.toast.error(errorMessage(e)),
        complete: () => { if (--remaining === 0) { this.busy.set(false); this.load(true); } },
      });
    }
  }

  private mutate(req: import('rxjs').Observable<unknown>): void {
    this.busy.set(true);
    req.subscribe({ next: () => { this.busy.set(false); this.load(true); }, error: e => { this.busy.set(false); this.toast.error(errorMessage(e)); this.load(true); } });
  }
}
