import { Injectable, effect, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { AppConfigService } from '../app-config.service';
import { AuthService } from '../auth.service';

export interface RealtimeEnvelope<T = unknown> {
  eventId: string; eventType: string; tenantId: string; entityType: string; entityId: string; version: number; timestamp: string; data: T;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * One managed SignalR connection for the whole authenticated session: connects on login, disconnects on logout,
 * and reconnects automatically. SignalR rejoins the server-side tenant/permission groups by itself, since the
 * hub's OnConnectedAsync re-derives them from the JWT every time a connection — including a reconnect — starts.
 *
 * The hub URL is derived from the same runtime config as the REST API (public/config.json's apiBaseUrl), so there
 * is exactly one place to change the API host for LAN development (see this repository's README).
 */
@Injectable({ providedIn: 'root' })
export class SignalrService {
  private readonly auth = inject(AuthService);
  private readonly config = inject(AppConfigService);
  private connection: signalR.HubConnection | null = null;
  private readonly handlers = new Map<string, Set<(e: RealtimeEnvelope) => void>>();
  private readonly reconnectHandlers = new Set<() => void>();
  /** Bounded ring of recently-applied event ids, so a duplicate delivery (retry, reconnect race) is a no-op. */
  private readonly seenEventIds: string[] = [];
  private readonly seenEventIdSet = new Set<string>();
  private static readonly SEEN_LIMIT = 500;

  readonly state = signal<ConnectionState>('disconnected');

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) this.connect();
      else this.disconnect();
    });
  }

  /** Subscribe to one event type (see the API's RealtimeEvents constants for the full list). */
  on<T = unknown>(eventType: string, handler: (e: RealtimeEnvelope<T>) => void): () => void {
    let set = this.handlers.get(eventType);
    if (!set) { set = new Set(); this.handlers.set(eventType, set); }
    set.add(handler as (e: RealtimeEnvelope) => void);
    return () => set!.delete(handler as (e: RealtimeEnvelope) => void);
  }

  /** Fires after every reconnect (not the first connect). Screens use this to re-sync via REST: events raised
   * while disconnected are not replayed, so the only authoritative recovery is re-fetching current state. */
  onReconnected(handler: () => void): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  private alreadyApplied(eventId: string): boolean {
    if (this.seenEventIdSet.has(eventId)) return true;
    this.seenEventIdSet.add(eventId);
    this.seenEventIds.push(eventId);
    if (this.seenEventIds.length > SignalrService.SEEN_LIMIT) this.seenEventIdSet.delete(this.seenEventIds.shift()!);
    return false;
  }

  private hubUrl(): string {
    // apiBaseUrl is ".../api/v1" (relative or absolute); the hub is a sibling path, not under /api/v1.
    return this.config.apiBaseUrl.replace(/\/api\/v1\/?$/, '') + '/hubs/realtime';
  }

  private connect(): void {
    if (this.connection) return; // one connection per session; a token refresh does not need a new socket
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl(), { accessTokenFactory: () => this.auth.accessToken() ?? '' })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connection.on('RealtimeEvent', (envelope: RealtimeEnvelope) => {
      if (this.alreadyApplied(envelope.eventId)) return;
      this.handlers.get(envelope.eventType)?.forEach(h => h(envelope));
    });
    connection.onreconnecting(() => this.state.set('reconnecting'));
    connection.onreconnected(() => { this.state.set('connected'); this.reconnectHandlers.forEach(h => h()); });
    connection.onclose(() => { this.state.set('disconnected'); if (this.connection === connection) this.connection = null; });

    this.connection = connection;
    this.state.set('connecting');
    connection.start()
      .then(() => this.state.set('connected'))
      .catch(() => { this.state.set('disconnected'); if (this.connection === connection) this.connection = null; });
  }

  private disconnect(): void {
    const c = this.connection;
    this.connection = null;
    this.state.set('disconnected');
    c?.stop();
  }
}
