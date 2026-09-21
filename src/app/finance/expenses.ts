import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { ToastService } from '../core/toast.service';
import { ConfigCrudComponent, CrudSection } from '../shared/config-crud';
import { ConfirmService, DrawerComponent, EmptyStateComponent, ErrorStateComponent, ModalComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

interface ExpensePayment { id: string; methodName: string; amount: number; paidAt: string; reference: string | null }
interface Expense {
  id: string; expenseNo: string; categoryId: string; categoryName: string; expenseDate: string; payee: string | null; description: string | null;
  amount: number; paidAmount: number; dueAmount: number; status: string; approvalNote: string | null; createdBy: string | null; payments: ExpensePayment[];
}
interface Category { id: string; name: string; requiresApproval: boolean; isActive: boolean }
interface Method { id: string; name: string; code: string }
interface Summary { pendingApproval: number; approvedUnpaid: number; paidThisMonth: number; pendingCount: number }
interface Page<T> { items: T[]; totalPages: number; totalCount: number }

const STATUS_STYLE: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700', Approved: 'bg-sky-50 text-sky-700', PartiallyPaid: 'bg-indigo-50 text-indigo-700',
  Paid: 'bg-emerald-50 text-emerald-700', Rejected: 'bg-rose-50 text-rose-700', Cancelled: 'bg-gray-100 text-gray-600',
};
const STATUSES = ['Pending', 'Approved', 'PartiallyPaid', 'Paid', 'Rejected', 'Cancelled'];
const today = () => new Date().toLocaleDateString('en-CA');

@Component({
  selector: 'app-expenses',
  imports: [ReactiveFormsModule, DrawerComponent, ModalComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Expenses</h1><p class="text-sm text-gray-500">Record, approve and pay operating costs</p></div>
        @if (canManage()) { <button type="button" class="btn-primary" (click)="openForm()"><span class="mi">add</span>New expense</button> }
      </div>

      @if (summary(); as s) {
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="card p-4"><p class="text-xs uppercase tracking-wide text-gray-500">Awaiting approval</p><p class="mt-1 text-xl font-bold text-gray-900">{{ brand.money(s.pendingApproval) }}</p><p class="text-xs text-gray-500">{{ s.pendingCount }} expense(s)</p></div>
          <div class="card p-4"><p class="text-xs uppercase tracking-wide text-gray-500">Approved, unpaid</p><p class="mt-1 text-xl font-bold text-gray-900">{{ brand.money(s.approvedUnpaid) }}</p></div>
          <div class="card p-4"><p class="text-xs uppercase tracking-wide text-gray-500">Paid this month</p><p class="mt-1 text-xl font-bold text-gray-900">{{ brand.money(s.paidThisMonth) }}</p></div>
        </div>
      }

      <div class="card flex flex-wrap items-end gap-3 p-4">
        <div><label class="label" for="ex-status">Status</label>
          <select id="ex-status" class="input" (change)="setFilter('status', $any($event.target).value)"><option value="">All</option>@for (st of statuses; track st) { <option [value]="st">{{ st }}</option> }</select></div>
        <div><label class="label" for="ex-cat">Category</label>
          <select id="ex-cat" class="input" (change)="setFilter('categoryId', $any($event.target).value)"><option value="">All</option>@for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
        <div><label class="label" for="ex-from">From</label><input id="ex-from" type="date" class="input" (change)="setFilter('from', $any($event.target).value)" /></div>
        <div><label class="label" for="ex-to">To</label><input id="ex-to" type="date" class="input" (change)="setFilter('to', $any($event.target).value)" /></div>
      </div>

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (rows().length === 0) { <app-empty-state icon="payments" title="No expenses found" hint="Adjust the filters or record a new expense." /> }
        @else {
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Expense</th><th class="px-5 py-3">Date</th><th class="px-5 py-3">Category</th><th class="px-5 py-3">Payee</th><th class="px-5 py-3 text-right">Amount</th><th class="px-5 py-3 text-right">Due</th><th class="px-5 py-3">Status</th><th class="px-5 py-3"></th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              @for (e of rows(); track e.id) {
                <tr class="hover:bg-gray-50/60">
                  <td class="px-5 py-3 font-semibold text-gray-900">{{ e.expenseNo }}</td>
                  <td class="px-5 py-3 text-gray-600">{{ e.expenseDate }}</td>
                  <td class="px-5 py-3 text-gray-600">{{ e.categoryName }}</td>
                  <td class="px-5 py-3 text-gray-600">{{ e.payee || '—' }}</td>
                  <td class="px-5 py-3 text-right font-semibold">{{ brand.money(e.amount) }}</td>
                  <td class="px-5 py-3 text-right text-gray-600">{{ brand.money(e.dueAmount) }}</td>
                  <td class="px-5 py-3"><span class="badge" [class]="style(e.status)">{{ e.status }}</span></td>
                  <td class="px-5 py-3 text-right"><button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Open expense" (click)="view(e)"><span class="mi">chevron_right</span></button></td>
                </tr>
              }
            </tbody>
          </table></div>
          <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div>
        }
      </div>
    </div>

    <app-drawer [open]="drawer()" [title]="editingId() ? 'Edit expense' : 'New expense'" (closed)="drawer.set(false)">
      @if (drawer()) {
        <form id="expenseForm" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
          <div><label class="label" for="e-cat">Category</label>
            <select id="e-cat" class="input" formControlName="categoryId">@for (c of activeCategories(); track c.id) { <option [value]="c.id">{{ c.name }}{{ c.requiresApproval ? '' : ' (no approval)' }}</option> }</select></div>
          <div><label class="label" for="e-date">Date</label><input id="e-date" type="date" class="input" formControlName="expenseDate" /></div>
          <div><label class="label" for="e-amt">Amount</label><input id="e-amt" type="number" min="0.01" step="0.01" class="input" formControlName="amount" />
            @if (form.controls['amount'].touched && form.controls['amount'].invalid) { <p class="field-error">Enter an amount above zero.</p> }</div>
          <div><label class="label" for="e-payee">Payee</label><input id="e-payee" class="input" formControlName="payee" /></div>
          <div><label class="label" for="e-desc">Description</label><input id="e-desc" class="input" formControlName="description" /></div>
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </form>
      }
      <div drawer-actions><button type="button" class="btn-ghost" (click)="drawer.set(false)">Cancel</button><button type="submit" form="expenseForm" class="btn-primary" [disabled]="busy()">Save</button></div>
    </app-drawer>

    <app-modal [open]="!!current()" [title]="current()?.expenseNo ?? ''" (closed)="current.set(null)">
      @if (current(); as e) {
        <div class="space-y-4 text-sm">
          <div class="flex items-center justify-between"><span class="badge" [class]="style(e.status)">{{ e.status }}</span><span class="text-lg font-bold">{{ brand.money(e.amount) }}</span></div>
          <dl class="grid grid-cols-2 gap-2 text-gray-600">
            <dt>Category</dt><dd class="text-right text-gray-900">{{ e.categoryName }}</dd>
            <dt>Date</dt><dd class="text-right text-gray-900">{{ e.expenseDate }}</dd>
            <dt>Payee</dt><dd class="text-right text-gray-900">{{ e.payee || '—' }}</dd>
            <dt>Paid</dt><dd class="text-right text-gray-900">{{ brand.money(e.paidAmount) }}</dd>
            <dt>Due</dt><dd class="text-right text-gray-900">{{ brand.money(e.dueAmount) }}</dd>
          </dl>
          @if (e.description) { <p class="rounded-lg bg-gray-50 p-3 text-gray-700">{{ e.description }}</p> }
          @if (e.approvalNote) { <p class="rounded-lg bg-gray-50 p-3 text-gray-700"><span class="font-semibold">Approval note:</span> {{ e.approvalNote }}</p> }
          @if (e.payments.length) {
            <div><p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Payments</p>
              <ul class="divide-y divide-gray-100 rounded-lg border border-gray-100">@for (p of e.payments; track p.id) { <li class="flex justify-between px-3 py-2"><span>{{ p.methodName }}{{ p.reference ? ' · ' + p.reference : '' }}</span><span class="font-semibold">{{ brand.money(p.amount) }}</span></li> }</ul></div>
          }

          @if (e.status === 'Pending' && canApprove()) {
            <div class="space-y-2 border-t border-gray-100 pt-4">
              <label class="label" for="dec-note">Note (required to reject)</label><input id="dec-note" class="input" [value]="note()" (input)="note.set($any($event.target).value)" />
              <div class="flex gap-2"><button type="button" class="btn-primary" [disabled]="busy()" (click)="decide(e, true)">Approve</button><button type="button" class="btn-danger" [disabled]="busy()" (click)="decide(e, false)">Reject</button></div>
            </div>
          }
          @if ((e.status === 'Approved' || e.status === 'PartiallyPaid') && canManage()) {
            <form class="space-y-2 border-t border-gray-100 pt-4" [formGroup]="payForm" (ngSubmit)="pay(e)">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Record payment</p>
              <div class="grid grid-cols-2 gap-2">
                <div><label class="label" for="p-m">Method</label><select id="p-m" class="input" formControlName="paymentMethodId">@for (m of methods(); track m.id) { <option [value]="m.id">{{ m.name }}</option> }</select></div>
                <div><label class="label" for="p-a">Amount</label><input id="p-a" type="number" min="0.01" step="0.01" class="input" formControlName="amount" /></div>
              </div>
              <div><label class="label" for="p-r">Reference</label><input id="p-r" class="input" formControlName="reference" /></div>
              <button type="submit" class="btn-primary" [disabled]="busy() || payForm.invalid">Pay</button>
            </form>
          }
          @if ((e.status === 'Pending' || e.status === 'Approved') && canManage() && e.payments.length === 0) {
            <div class="border-t border-gray-100 pt-4 flex gap-2">
              @if (e.status === 'Pending') { <button type="button" class="btn-ghost" (click)="openForm(e)">Edit</button> }
              <button type="button" class="btn-ghost text-rose-600" (click)="cancel(e)">Cancel expense</button>
            </div>
          }
          @if (modalError()) { <p class="field-error">{{ modalError() }}</p> }
        </div>
      }
    </app-modal>`,
})
export class ExpensesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly brand = inject(BrandingService);

  protected readonly statuses = STATUSES;
  protected readonly canManage = computed(() => this.auth.hasPermission('Expense.Manage'));
  protected readonly canApprove = computed(() => this.auth.hasPermission('Expense.Approve'));
  protected readonly rows = signal<Expense[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly activeCategories = computed(() => this.categories().filter(c => c.isActive));
  protected readonly methods = signal<Method[]>([]);
  protected readonly summary = signal<Summary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly drawer = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly current = signal<Expense | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly modalError = signal('');
  protected readonly note = signal('');
  protected form = this.newForm();
  protected payForm = this.newPayForm(0);
  private filters: Record<string, string> = {};

  ngOnInit(): void {
    forkJoin({ cats: this.api.get<Category[]>('expenses/categories'), methods: this.api.get<Method[]>('payments/methods') }).subscribe({
      next: r => { this.categories.set(r.cats); this.methods.set(r.methods); },
      error: e => this.error.set(errorMessage(e)),
    });
    this.load();
  }

  protected style(status: string): string { return STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-600'; }
  protected setFilter(k: string, v: string): void { this.filters[k] = v; this.page.set(1); this.load(); }
  protected goTo(p: number): void { this.page.set(p); this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    forkJoin({ list: this.api.get<Page<Expense>>('expenses', { ...this.filters, page: this.page(), pageSize: 15 }), summary: this.api.get<Summary>('expenses/summary') }).subscribe({
      next: r => { this.rows.set(r.list.items); this.totalPages.set(r.list.totalPages); this.total.set(r.list.totalCount); this.summary.set(r.summary); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private newForm(e?: Expense): FormGroup {
    return new FormGroup({
      categoryId: new FormControl(e?.categoryId ?? '', { nonNullable: true, validators: [Validators.required] }),
      expenseDate: new FormControl(e?.expenseDate ?? today(), { nonNullable: true, validators: [Validators.required] }),
      amount: new FormControl(e?.amount ?? 0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
      payee: new FormControl(e?.payee ?? '', { nonNullable: true }),
      description: new FormControl(e?.description ?? '', { nonNullable: true }),
    });
  }
  private newPayForm(due: number): FormGroup {
    return new FormGroup({
      paymentMethodId: new FormControl(this.methods()[0]?.id ?? '', { nonNullable: true, validators: [Validators.required] }),
      amount: new FormControl(due, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
      reference: new FormControl('', { nonNullable: true }),
    });
  }

  protected openForm(e?: Expense): void {
    this.formError.set(''); this.editingId.set(e?.id ?? null);
    this.form = this.newForm(e);
    if (!e) this.form.controls['categoryId'].setValue(this.activeCategories()[0]?.id ?? '');
    this.current.set(null); this.drawer.set(true);
  }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = { ...v, amount: Number(v.amount), payee: v.payee || null, description: v.description || null };
    const id = this.editingId();
    this.busy.set(true); this.formError.set('');
    (id ? this.api.put(`expenses/${id}`, body) : this.api.post('expenses', body)).subscribe({
      next: () => { this.busy.set(false); this.drawer.set(false); this.toast.success('Expense saved'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected view(e: Expense): void {
    this.modalError.set(''); this.note.set('');
    this.payForm = this.newPayForm(e.dueAmount);
    this.current.set(e);
  }

  private act(req: import('rxjs').Observable<Expense>, message: string): void {
    this.busy.set(true); this.modalError.set('');
    req.subscribe({
      next: e => { this.busy.set(false); this.toast.success(message); this.load(); this.view(e); },
      error: err => { this.busy.set(false); this.modalError.set(errorMessage(err)); },
    });
  }

  protected decide(e: Expense, approve: boolean): void {
    if (!approve && !this.note().trim()) { this.modalError.set('Enter a reason to reject.'); return; }
    this.act(this.api.post<Expense>(`expenses/${e.id}/decision`, { approve, note: this.note().trim() || null }), approve ? 'Expense approved' : 'Expense rejected');
  }

  protected pay(e: Expense): void {
    if (this.payForm.invalid) return;
    const v = this.payForm.getRawValue();
    this.act(this.api.post<Expense>(`expenses/${e.id}/payments`, { ...v, amount: Number(v.amount), reference: v.reference || null }), 'Payment recorded');
  }

  protected async cancel(e: Expense): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Cancel expense', message: `Cancel ${e.expenseNo}? This cannot be undone.`, confirmText: 'Cancel expense', danger: true }))) return;
    this.act(this.api.post<Expense>(`expenses/${e.id}/cancel`), 'Expense cancelled');
  }
}

const CATEGORY_SECTIONS: CrudSection[] = [
  { key: 'categories', label: 'Expense categories', singular: 'category', path: 'expenses/categories',
    cols: [{ key: 'name', label: 'Category' }, { key: 'requiresApproval', label: 'Needs approval' }],
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'requiresApproval', label: 'Requires approval before payment', type: 'checkbox' }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

@Component({
  selector: 'app-expense-categories',
  imports: [ConfigCrudComponent],
  template: `<app-config-crud title="Expense categories" subtitle="Group expenses and choose which need approval" [sections]="sections" [canManage]="canManage()" />`,
})
export class ExpenseCategoriesComponent {
  private readonly auth = inject(AuthService);
  protected readonly sections = CATEGORY_SECTIONS;
  protected readonly canManage = computed(() => this.auth.hasPermission('Expense.Manage'));
}
