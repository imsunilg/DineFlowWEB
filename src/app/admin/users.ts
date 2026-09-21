import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { Paged } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent } from '../shared/ui';

interface User { id: string; email: string; fullName: string; phone: string | null; isActive: boolean; roles: string[]; lastLoginAt: string | null }
interface Role { id: string; name: string; description: string | null; isSystem: boolean; permissions: string[] }

@Component({
  selector: 'app-users',
  imports: [DatePipe, ReactiveFormsModule, DrawerComponent, EmptyStateComponent, ErrorStateComponent, PagerComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Users</h1><p class="text-sm text-gray-500">Staff who can sign in, and what they are allowed to do</p></div>
        @if (canCreate()) { <button type="button" class="btn-primary" (click)="open()"><span class="mi">person_add</span>New user</button> }
      </div>
      <div class="card p-4"><div class="relative"><span class="mi absolute left-3 top-2.5 text-gray-400">search</span><input class="input pl-10" placeholder="Search by name or email" aria-label="Search users" (input)="onSearch($any($event.target).value)" /></div></div>

      <div class="card overflow-hidden">
        @if (loading()) { <div class="p-6"><app-skeleton /></div> }
        @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
        @else if (rows().length === 0) { <app-empty-state icon="group" title="No users found" /> }
        @else {
          <div class="overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th class="px-5 py-3">Name</th><th class="px-5 py-3">Email</th><th class="px-5 py-3">Roles</th><th class="px-5 py-3">Last sign-in</th><th class="px-5 py-3">Status</th><th class="px-5 py-3"></th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              @for (u of rows(); track u.id) {
                <tr class="hover:bg-gray-50/60" [class.opacity-60]="!u.isActive">
                  <td class="px-5 py-3 font-semibold text-gray-900">{{ u.fullName }}</td>
                  <td class="px-5 py-3 text-gray-600">{{ u.email }}</td>
                  <td class="px-5 py-3"><div class="flex flex-wrap gap-1">@for (r of u.roles; track r) { <span class="badge bg-gray-100 text-gray-700">{{ r }}</span> }</div></td>
                  <td class="px-5 py-3 text-gray-600">{{ u.lastLoginAt ? (u.lastLoginAt | date: 'medium') : 'Never' }}</td>
                  <td class="px-5 py-3"><span class="badge" [class]="u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'">{{ u.isActive ? 'Active' : 'Inactive' }}</span></td>
                  <td class="px-5 py-3 text-right">@if (canUpdate()) { <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Edit user" (click)="open(u)"><span class="mi">edit</span></button> }</td>
                </tr>
              }
            </tbody>
          </table></div>
          <div class="px-5 pb-4"><app-pager [page]="page()" [totalPages]="totalPages()" [total]="total()" (changed)="goTo($event)" /></div>
        }
      </div>
    </div>

    <app-drawer [open]="drawer()" [title]="editing() ? 'Edit user' : 'New user'" (closed)="drawer.set(false)">
      @if (drawer()) {
        <form id="userForm" class="space-y-4" [formGroup]="form" (ngSubmit)="save()">
          <div><label class="label" for="u-name">Full name</label><input id="u-name" class="input" formControlName="fullName" />@if (form.controls['fullName'].touched && form.controls['fullName'].invalid) { <p class="field-error">Name is required.</p> }</div>
          <div><label class="label" for="u-email">Email</label><input id="u-email" type="email" class="input" formControlName="email" />@if (form.controls['email'].touched && form.controls['email'].invalid) { <p class="field-error">Enter a valid email.</p> }</div>
          <div><label class="label" for="u-phone">Phone</label><input id="u-phone" class="input" formControlName="phone" /></div>
          @if (!editing()) {
            <div><label class="label" for="u-pass">Initial password</label><input id="u-pass" type="password" autocomplete="new-password" class="input" formControlName="password" />
              <p class="mt-1 text-xs text-gray-500">At least 8 characters with upper and lower case, a digit and a symbol.</p>@if (form.controls['password'].touched && form.controls['password'].invalid) { <p class="field-error">Password is required.</p> }</div>
          }
          <fieldset><legend class="label">Roles</legend>
            <div class="space-y-1.5">@for (r of roles(); track r.id) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="picked().includes(r.name)" (change)="toggle(r.name)" />{{ r.name }}<span class="text-xs text-gray-400">{{ r.description }}</span></label> }</div></fieldset>
          @if (editing()) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="isActive" />Active (can sign in)</label> }
          @if (formError()) { <p class="field-error">{{ formError() }}</p> }
        </form>
      }
      <div drawer-actions><button type="button" class="btn-ghost" (click)="drawer.set(false)">Cancel</button><button type="submit" form="userForm" class="btn-primary" [disabled]="busy()">Save</button></div>
    </app-drawer>`,
})
export class UsersComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly canCreate = computed(() => this.auth.hasPermission('User.Create'));
  protected readonly canUpdate = computed(() => this.auth.hasPermission('User.Update'));
  protected readonly rows = signal<User[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly drawer = signal(false);
  protected readonly editing = signal<User | null>(null);
  protected readonly picked = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected form = this.newForm();
  private search = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    if (this.auth.hasPermission('Role.View')) this.api.get<Role[]>('roles').subscribe(r => this.roles.set(r));
    this.load();
  }

  protected onSearch(v: string): void { clearTimeout(this.timer); this.timer = setTimeout(() => { this.search = v; this.page.set(1); this.load(); }, 300); }
  protected goTo(p: number): void { this.page.set(p); this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.api.get<Paged<User>>('users', { page: this.page(), pageSize: 15, search: this.search }).subscribe({
      next: r => { this.rows.set(r.items); this.totalPages.set(r.totalPages); this.total.set(r.totalCount); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  private newForm(u?: User): FormGroup {
    return new FormGroup({
      fullName: new FormControl(u?.fullName ?? '', { nonNullable: true, validators: [Validators.required] }),
      email: new FormControl({ value: u?.email ?? '', disabled: !!u }, { nonNullable: true, validators: [Validators.required, Validators.email] }),
      phone: new FormControl(u?.phone ?? '', { nonNullable: true }),
      password: new FormControl('', { nonNullable: true, validators: u ? [] : [Validators.required] }),
      isActive: new FormControl(u?.isActive ?? true, { nonNullable: true }),
    });
  }

  protected open(u?: User): void {
    this.formError.set(''); this.editing.set(u ?? null); this.picked.set(u ? [...u.roles] : []);
    this.form = this.newForm(u); this.drawer.set(true);
  }

  protected toggle(name: string): void { this.picked.update(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name]); }

  protected save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.picked().length === 0) { this.formError.set('Choose at least one role.'); return; }
    const v = this.form.getRawValue(), u = this.editing();
    this.busy.set(true); this.formError.set('');
    const req = u
      ? this.api.put(`users/${u.id}`, { fullName: v.fullName, phone: v.phone || null, isActive: v.isActive, roles: this.picked() })
      : this.api.post('users', { email: v.email, fullName: v.fullName, phone: v.phone || null, password: v.password, roles: this.picked() });
    req.subscribe({
      next: () => { this.busy.set(false); this.drawer.set(false); this.toast.success('User saved'); this.load(); },
      error: e => { this.busy.set(false); this.formError.set(errorMessage(e)); },
    });
  }
}

