import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { ToastService } from '../core/toast.service';
import { ConfirmService, EmptyStateComponent, ErrorStateComponent, ModalComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

interface Leave { id: string; employeeId: string; employeeName: string; leaveType: string; fromDate: string; toDate: string; days: number; reason: string | null; status: string; decisionNote: string | null }
interface Employee { id: string; fullName: string; employeeCode: string; isActive: boolean }
interface Page<T> { items: T[]; totalPages: number; totalCount: number }

const STYLE: Record<string, string> = { Pending: 'bg-amber-50 text-amber-700', Approved: 'bg-emerald-50 text-emerald-700', Rejected: 'bg-rose-50 text-rose-700', Cancelled: 'bg-gray-100 text-gray-600' };
const TYPES = ['Casual', 'Sick', 'Paid', 'Unpaid'];
const iso = () => new Date().toLocaleDateString('en-CA');

@Component({
  selector: 'app-leave',
  imports: [ReactiveFormsModule, ModalComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Leave</h1><p class="text-sm text-gray-500">Requests, approvals and time off</p></div>
        @if (canManage()) { <button type="button" class="btn-primary" (click)="openForm()"><span class="mi">add</span>New request</button> }
      </div>

      <div class="card flex items-end gap-3 p-4">
        <div><label class="label" for="l-status">Status</label>
          <select id="l-status" class="input" (change)="setStatus($any($event.target).value)"><option value="">All</option>@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }</select></div>
      </div>

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (rows().length === 0) { <app-empty-state icon="beach_access" title="No leave requests" /> }
        @else {
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Employee</th><th class="px-5 py-3">Type</th><th class="px-5 py-3">From</th><th class="px-5 py-3">To</th><th class="px-5 py-3">Days</th><th class="px-5 py-3">Status</th><th class="px-5 py-3"></th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              @for (l of rows(); track l.id) {
                <tr class="hover:bg-gray-50/60">
                  <td class="px-5 py-3"><p class="font-semibold text-gray-900">{{ l.employeeName }}</p>@if (l.reason) { <p class="text-xs text-gray-500">{{ l.reason }}</p> }</td>
                  <td class="px-5 py-3 text-gray-600">{{ l.leaveType }}</td><td class="px-5 py-3 text-gray-600">{{ l.fromDate }}</td><td class="px-5 py-3 text-gray-600">{{ l.toDate }}</td><td class="px-5 py-3 text-gray-600">{{ l.days }}</td>
                  <td class="px-5 py-3"><span class="badge" [class]="style(l.status)">{{ l.status }}</span></td>
                  <td class="px-5 py-3 text-right whitespace-nowrap">
                    @if (canManage() && l.status === 'Pending') {
                      <button type="button" class="btn-ghost" [disabled]="busy()" (click)="decide(l, true)">Approve</button>
                      <button type="button" class="btn-ghost text-rose-600" [disabled]="busy()" (click)="reject(l)">Reject</button>
                    }
                    @if (canManage() && (l.status === 'Pending' || l.status === 'Approved')) { <button type="button" class="btn-ghost" [disabled]="busy()" (click)="cancel(l)">Cancel</button> }
                  </td>
                </tr>
              }
            </tbody>
          </table></div>
          <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div>
        }
      </div>
    </div>

    <app-modal [open]="formOpen()" title="New leave request" (closed)="formOpen.set(false)">
      @if (formOpen()) {
        <form class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
          <div><label class="label" for="lf-emp">Employee</label><select id="lf-emp" class="input" formControlName="employeeId">@for (e of employees(); track e.id) { <option [value]="e.id">{{ e.fullName }} ({{ e.employeeCode }})</option> }</select></div>
          <div><label class="label" for="lf-type">Type</label><select id="lf-type" class="input" formControlName="leaveType">@for (t of types; track t) { <option [value]="t">{{ t }}</option> }</select></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label" for="lf-from">From</label><input id="lf-from" type="date" class="input" formControlName="fromDate" /></div>
            <div><label class="label" for="lf-to">To</label><input id="lf-to" type="date" class="input" formControlName="toDate" /></div>
          </div>
          <div><label class="label" for="lf-reason">Reason</label><input id="lf-reason" class="input" formControlName="reason" /></div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="formOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" [disabled]="busy()">Submit</button></div>
        </form>
      }
    </app-modal>

    <app-modal [open]="!!rejecting()" title="Reject leave request" (closed)="rejecting.set(null)">
      <div class="space-y-4">
        <div><label class="label" for="rj-note">Reason</label><input id="rj-note" class="input" [value]="note()" (input)="note.set($any($event.target).value)" /></div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="rejecting.set(null)">Cancel</button><button type="button" class="btn-danger" [disabled]="busy()" (click)="confirmReject()">Reject</button></div>
      </div>
    </app-modal>`,
})
export class LeaveComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly statuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
  protected readonly types = TYPES;
  protected readonly canManage = computed(() => this.auth.hasPermission('Staff.Manage'));
  protected readonly rows = signal<Leave[]>([]);
  protected readonly employees = signal<Employee[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly formOpen = signal(false);
  protected readonly formError = signal('');
  protected readonly rejecting = signal<Leave | null>(null);
  protected readonly note = signal('');
  protected form = this.newForm();
  private status = '';

  ngOnInit(): void {
    this.load();
    if (this.canManage()) this.api.get<Page<Employee>>('staff/employees', { pageSize: 200, isActive: true }).subscribe(r => this.employees.set(r.items));
  }

  protected style(s: string): string { return STYLE[s] ?? 'bg-gray-100 text-gray-600'; }
  protected setStatus(v: string): void { this.status = v; this.page.set(1); this.load(); }
  protected goTo(p: number): void { this.page.set(p); this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.api.get<Page<Leave>>('staff/leave', { status: this.status, page: this.page(), pageSize: 15 }).subscribe({
      next: r => { this.rows.set(r.items); this.totalPages.set(r.totalPages); this.total.set(r.totalCount); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private newForm(): FormGroup {
    return new FormGroup({
      employeeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      leaveType: new FormControl('Casual', { nonNullable: true }),
      fromDate: new FormControl(iso(), { nonNullable: true, validators: [Validators.required] }),
      toDate: new FormControl(iso(), { nonNullable: true, validators: [Validators.required] }),
      reason: new FormControl('', { nonNullable: true }),
    });
  }

  protected openForm(): void { this.formError.set(''); this.form = this.newForm(); this.form.controls['employeeId'].setValue(this.employees()[0]?.id ?? ''); this.formOpen.set(true); }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.busy.set(true); this.formError.set('');
    this.api.post('staff/leave', { ...v, reason: v.reason || null }).subscribe({
      next: () => { this.busy.set(false); this.formOpen.set(false); this.toast.success('Leave requested'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected decide(l: Leave, approve: boolean, note?: string): void {
    this.busy.set(true);
    this.api.post(`staff/leave/${l.id}/decision`, { approve, note: note ?? null }).subscribe({
      next: () => { this.busy.set(false); this.rejecting.set(null); this.toast.success(approve ? 'Leave approved' : 'Leave rejected'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); this.toast.error(errorMessage(e)); this.load(); },
    });
  }

  protected reject(l: Leave): void { this.note.set(''); this.formError.set(''); this.rejecting.set(l); }
  protected confirmReject(): void {
    const l = this.rejecting();
    if (!l) return;
    if (!this.note().trim()) { this.formError.set('Enter a reason to reject.'); return; }
    this.decide(l, false, this.note().trim());
  }

  protected async cancel(l: Leave): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Cancel leave', message: `Cancel ${l.employeeName}'s ${l.leaveType.toLowerCase()} leave (${l.fromDate} to ${l.toDate})?`, confirmText: 'Cancel leave', danger: true }))) return;
    this.busy.set(true);
    this.api.post(`staff/leave/${l.id}/cancel`).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Leave cancelled'); this.load(); },
      error: e => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
