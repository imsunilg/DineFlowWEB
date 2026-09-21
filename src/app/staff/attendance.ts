import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { ToastService } from '../core/toast.service';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../shared/ui';

interface Row { employeeId: string; employeeCode: string; employeeName: string; department: string | null; shift: string | null; workDate: string; status: string | null; checkInAt: string | null; checkOutAt: string | null; notes: string | null }

const STATUSES = ['Present', 'Late', 'HalfDay', 'Absent', 'Leave'];
const STYLE: Record<string, string> = { Present: 'bg-emerald-50 text-emerald-700', Late: 'bg-amber-50 text-amber-700', HalfDay: 'bg-sky-50 text-sky-700', Absent: 'bg-rose-50 text-rose-700', Leave: 'bg-indigo-50 text-indigo-700' };
const isoToday = () => new Date().toLocaleDateString('en-CA');

@Component({
  selector: 'app-attendance',
  imports: [DatePipe, SkeletonComponent, ErrorStateComponent, EmptyStateComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Attendance</h1><p class="text-sm text-gray-500">Clock staff in and out, or correct a day</p></div>
        <div><label class="label" for="a-date">Date</label><input id="a-date" type="date" class="input" [value]="date()" [max]="today" (change)="setDate($any($event.target).value)" /></div>
      </div>

      @if (summary(); as s) {
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-6">
          @for (k of s; track k.label) { <div class="card p-3"><p class="text-xs uppercase tracking-wide text-gray-500">{{ k.label }}</p><p class="text-xl font-bold text-gray-900">{{ k.value }}</p></div> }
        </div>
      }

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (rows().length === 0) { <app-empty-state icon="badge" title="No active employees" hint="Add employees first." /> }
        @else {
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Employee</th><th class="px-5 py-3">Shift</th><th class="px-5 py-3">In</th><th class="px-5 py-3">Out</th><th class="px-5 py-3">Status</th><th class="px-5 py-3"></th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              @for (r of rows(); track r.employeeId) {
                <tr class="hover:bg-gray-50/60">
                  <td class="px-5 py-3"><p class="font-semibold text-gray-900">{{ r.employeeName }}</p><p class="text-xs text-gray-500">{{ r.employeeCode }}{{ r.department ? ' · ' + r.department : '' }}</p></td>
                  <td class="px-5 py-3 text-gray-600">{{ r.shift || '—' }}</td>
                  <td class="px-5 py-3 text-gray-600">{{ r.checkInAt ? (r.checkInAt | date: 'shortTime') : '—' }}</td>
                  <td class="px-5 py-3 text-gray-600">{{ r.checkOutAt ? (r.checkOutAt | date: 'shortTime') : '—' }}</td>
                  <td class="px-5 py-3">
                    @if (canManage()) {
                      <select class="input w-32 py-1" [attr.aria-label]="'Status for ' + r.employeeName" [value]="r.status ?? ''" (change)="mark(r, $any($event.target).value)">
                        <option value="" disabled>Not marked</option>@for (st of statuses; track st) { <option [value]="st" [selected]="r.status === st">{{ st }}</option> }
                      </select>
                    } @else { <span class="badge" [class]="style(r.status)">{{ r.status ?? 'Not marked' }}</span> }
                  </td>
                  <td class="px-5 py-3 text-right">
                    @if (canManage() && isToday()) {
                      @if (!r.checkInAt) { <button type="button" class="btn-ghost" [disabled]="busy()" (click)="clock(r, 'check-in')">Check in</button> }
                      @else if (!r.checkOutAt) { <button type="button" class="btn-ghost" [disabled]="busy()" (click)="clock(r, 'check-out')">Check out</button> }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>`,
})
export class AttendanceComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly statuses = STATUSES;
  protected readonly today = isoToday();
  protected readonly date = signal(isoToday());
  protected readonly rows = signal<Row[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly canManage = computed(() => this.auth.hasPermission('Staff.Manage'));
  protected readonly isToday = computed(() => this.date() === this.today);
  protected readonly summary = computed(() => {
    const r = this.rows();
    return r.length ? [...STATUSES.map(s => ({ label: s === 'HalfDay' ? 'Half day' : s, value: r.filter(x => x.status === s).length })), { label: "Not marked", value: r.filter(x => !x.status).length }] : null;
  });

  ngOnInit(): void { this.load(); }

  protected style(s: string | null): string { return (s && STYLE[s]) || 'bg-gray-100 text-gray-600'; }
  protected setDate(v: string): void { if (v) { this.date.set(v); this.load(); } }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.api.get<Row[]>('staff/attendance', { date: this.date() }).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private replace(updated: Row): void { this.rows.update(rs => rs.map(r => r.employeeId === updated.employeeId ? updated : r)); }

  protected clock(r: Row, action: 'check-in' | 'check-out'): void {
    this.busy.set(true);
    this.api.post<Row>(`staff/attendance/${action}`, { employeeId: r.employeeId }).subscribe({
      next: u => { this.busy.set(false); this.replace(u); this.toast.success(action === 'check-in' ? 'Checked in' : 'Checked out'); },
      error: e => { this.busy.set(false); this.toast.error(errorMessage(e)); this.load(); },
    });
  }

  protected mark(r: Row, status: string): void {
    this.api.put<Row>('staff/attendance', { employeeId: r.employeeId, workDate: this.date(), status, notes: r.notes }).subscribe({
      next: u => { this.replace(u); this.toast.success('Attendance saved'); },
      error: e => { this.toast.error(errorMessage(e)); this.load(); },
    });
  }
}
