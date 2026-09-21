import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { Customer, Paged } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ConfirmService, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent } from '../shared/ui';
import { CustomerProfileComponent } from './customer-profile';

@Component({
  selector: 'app-customers',
  imports: [ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent, CustomerProfileComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Customers</h1><p class="text-sm text-gray-500">Guests, contact details and special dates</p></div>
        @if (canCreate()) { <button type="button" class="btn-primary" (click)="open()"><span class="mi">person_add</span>New customer</button> }
      </div>

      <div class="card p-4">
        <div class="relative"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span>
          <input class="input pl-10" placeholder="Search by name, phone or email" aria-label="Search customers" (input)="search$.next($any($event.target).value)" /></div>
      </div>

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (customers().length === 0) { <app-empty-state icon="groups" title="No customers found" hint="Customers you add will appear here." /> }
        @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Name</th><th class="px-5 py-3">Phone</th><th class="px-5 py-3">Email</th><th class="px-5 py-3">Birthday</th><th class="px-5 py-3"></th></tr></thead>
              <tbody class="divide-y divide-gray-100">
                @for (c of customers(); track c.id) {
                  <tr class="hover:bg-gray-50/60">
                    <td class="px-5 py-3"><div class="flex items-center gap-3"><span class="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">{{ c.fullName.charAt(0).toUpperCase() }}</span><button type="button" class="text-left font-semibold text-gray-900 hover:text-brand hover:underline" (click)="profileId.set(c.id)">{{ c.fullName }}</button></div></td>
                    <td class="px-5 py-3 text-gray-600">{{ c.phone || '—' }}</td>
                    <td class="px-5 py-3 text-gray-600">{{ c.email || '—' }}</td>
                    <td class="px-5 py-3 text-gray-600">{{ c.birthday || '—' }}</td>
                    <td class="px-5 py-3 text-right">
                      @if (canUpdate()) {
                        <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit" (click)="open(c)"><span class="mi">edit</span></button>
                        <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Delete" (click)="remove(c)"><span class="mi">delete</span></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div>
        }
      </div>
    </div>

    <app-customer-profile [customerId]="profileId()" (closed)="profileId.set(null)" />

    <app-drawer [open]="drawer()" [title]="editingId() ? 'Edit customer' : 'New customer'" (closed)="drawer.set(false)">
      <form id="custForm" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
        <div><label class="label" for="cname">Full name</label><input id="cname" class="input" formControlName="fullName" />
          @if (form.controls.fullName.touched && form.controls.fullName.invalid) { <p class="field-error">Name is required.</p> }</div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="cphone">Phone</label><input id="cphone" class="input" formControlName="phone" /></div>
          <div><label class="label" for="cemail">Email</label><input id="cemail" class="input" type="email" formControlName="email" />
            @if (form.controls.email.invalid) { <p class="field-error">Enter a valid email.</p> }</div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="cbday">Birthday</label><input id="cbday" class="input" type="date" formControlName="birthday" /></div>
          <div><label class="label" for="cann">Anniversary</label><input id="cann" class="input" type="date" formControlName="anniversary" /></div>
        </div>
        @if (!editingId()) { <div><label class="label" for="cref">Referral code (optional)</label><input id="cref" class="input" maxlength="20" formControlName="referralCode" placeholder="Code from a member who referred them" /></div> }
        <div><label class="label" for="cnotes">Notes</label><textarea id="cnotes" rows="3" class="input" formControlName="notes"></textarea></div>
        @if (formError()) { <p class="field-error">{{ formError() }}</p> }
      </form>
      <div drawer-actions>
        <button type="button" class="btn-ghost" (click)="drawer.set(false)">Cancel</button>
        <button type="submit" form="custForm" class="btn-primary" [disabled]="busy()">Save customer</button>
      </div>
    </app-drawer>`,
})
export class CustomersComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);

  protected readonly search$ = new Subject<string>();
  protected readonly customers = signal<Customer[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly drawer = signal(false);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly profileId = signal<string | null>(null);
  protected readonly canCreate = computed(() => this.auth.hasPermission('Customer.Create'));
  protected readonly canUpdate = computed(() => this.auth.hasPermission('Customer.Update'));
  private search = '';

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    phone: [''],
    email: ['', Validators.email],
    birthday: [''],
    anniversary: [''],
    notes: [''],
    referralCode: [''],
  });

  constructor() { this.search$.pipe(debounceTime(300)).subscribe(s => { this.search = s; this.page.set(1); this.load(); }); }

  ngOnInit(): void { this.load(); }

  protected goTo(p: number): void { this.page.set(p); this.load(); }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<Paged<Customer>>('customers', { page: this.page(), pageSize: 15, search: this.search }).subscribe({
      next: r => { this.customers.set(r.items); this.totalPages.set(r.totalPages); this.total.set(r.totalCount); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected open(c?: Customer): void {
    this.formError.set('');
    this.editingId.set(c?.id ?? null);
    this.form.reset({ fullName: c?.fullName ?? '', phone: c?.phone ?? '', email: c?.email ?? '', birthday: c?.birthday ?? '', anniversary: c?.anniversary ?? '', notes: c?.notes ?? '', referralCode: '' });
    this.drawer.set(true);
  }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = { fullName: v.fullName, phone: v.phone || null, email: v.email || null, birthday: v.birthday || null, anniversary: v.anniversary || null, notes: v.notes || null, isActive: true, referralCode: v.referralCode || null };
    const id = this.editingId();
    this.busy.set(true);
    (id ? this.api.put<Customer>(`customers/${id}`, body) : this.api.post<Customer>('customers', body)).subscribe({
      next: () => { this.busy.set(false); this.drawer.set(false); this.toast.success('Customer saved'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }

  protected async remove(c: Customer): Promise<void> {
    if (!(await this.confirm.ask({ title: `Delete ${c.fullName}?`, message: 'The customer is removed from your list.', confirmText: 'Delete', danger: true }))) return;
    this.api.delete(`customers/${c.id}`).subscribe({ next: () => { this.toast.success('Customer deleted'); this.load(); }, error: e => this.toast.error(errorMessage(e)) });
  }
}
