import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { interval } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AppNotification, Paged } from '../core/models';
import { SignalrService } from '../core/services/signalr.service';

const ICONS: Record<string, string> = { LowStock: 'inventory_2', OrderReady: 'room_service', PaymentReceived: 'payments', NewReservation: 'event_available', NewCustomer: 'person_add' };
const ROUTES: Record<string, string> = { Order: '/orders', InventoryItem: '/inventory/stock', BarProduct: '/bar/stock', Bill: '/orders', Reservation: '/reservations' };
/** These are exactly the notification "type" values NotificationService.NotifyAsync uses on the API, and are also
 * pushed live as SignalR events of the same name, so the bell updates immediately instead of waiting for the poll. */
const REALTIME_TYPES = Object.keys(ICONS);

/** In-app notifications: unread badge polled every 30 s, dropdown with the latest items. */
@Component({
  selector: 'app-notification-bell',
  imports: [DatePipe],
  template: `
    <div class="relative">
      <button type="button" class="relative rounded-xl p-2 text-gray-600 hover:bg-gray-100" aria-label="Notifications" [attr.aria-expanded]="open()" (click)="toggle()">
        <span class="mi">notifications</span>
        @if (unread() > 0) { <span class="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">{{ unread() > 99 ? '99+' : unread() }}</span> }
      </button>
      @if (open()) {
        <div class="absolute right-0 z-50 mt-2 w-96 max-w-[90vw] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5" role="dialog" aria-label="Notifications">
          <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p class="text-sm font-semibold text-gray-900">Notifications</p>
            <button type="button" class="text-xs font-semibold text-brand hover:underline disabled:opacity-40" [disabled]="unread() === 0" (click)="readAll()">Mark all read</button>
          </div>
          <div class="max-h-96 overflow-y-auto">
            @for (n of items(); track n.id) {
              <button type="button" class="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50" [class.bg-brand/5]="!n.isRead" (click)="go(n)">
                <span class="mi mt-0.5 text-gray-400">{{ icons[n.type] ?? 'notifications' }}</span>
                <span class="min-w-0 flex-1"><span class="block text-sm" [class]="n.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'">{{ n.title }}</span>
                  <span class="block truncate text-xs text-gray-500">{{ n.message }}</span><span class="block text-[11px] text-gray-400">{{ n.createdAt | date: 'short' }}</span></span>
                @if (!n.isRead) { <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"></span> }
              </button>
            } @empty { <p class="px-4 py-10 text-center text-sm text-gray-500">You're all caught up.</p> }
          </div>
        </div>
      }
    </div>`,
})
export class NotificationBellComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly signalr = inject(SignalrService);

  protected readonly icons = ICONS;
  protected readonly open = signal(false);
  protected readonly unread = signal(0);
  protected readonly items = signal<AppNotification[]>([]);

  ngOnInit(): void {
    this.refreshCount();
    // The 30s poll is only a safety net (e.g. resync after a missed reconnect); real updates arrive over SignalR.
    interval(30000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.refreshCount(); if (this.open()) this.loadItems(); });
    for (const type of REALTIME_TYPES) {
      const off = this.signalr.on(type, () => { this.refreshCount(); if (this.open()) this.loadItems(); });
      this.destroyRef.onDestroy(off);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event): void { if (this.open() && !this.host.nativeElement.contains(e.target)) this.open.set(false); }

  protected toggle(): void { this.open.update(o => !o); if (this.open()) this.loadItems(); }

  private refreshCount(): void { this.api.get<{ count: number }>('notifications/unread-count').subscribe({ next: r => this.unread.set(r.count), error: () => undefined }); }
  private loadItems(): void { this.api.get<Paged<AppNotification>>('notifications', { pageSize: 10 }).subscribe({ next: r => this.items.set(r.items), error: () => undefined }); }

  protected go(n: AppNotification): void {
    this.open.set(false);
    if (!n.isRead) this.api.post(`notifications/${n.id}/read`, {}).subscribe(() => this.refreshCount());
    const target = n.entity ? ROUTES[n.entity] : null;
    if (target) this.router.navigateByUrl(target);
  }

  protected readAll(): void { this.api.post('notifications/read-all', {}).subscribe(() => { this.unread.set(0); this.loadItems(); }); }
}
