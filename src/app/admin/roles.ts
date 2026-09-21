import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/http.interceptors';
import { ToastService } from '../core/toast.service';
import { EmptyStateComponent, ErrorStateComponent, ModalComponent, SkeletonComponent } from '../shared/ui';

interface Role { id: string; name: string; description: string | null; isSystem: boolean; permissions: string[] }
interface Permission { id: string; code: string; module: string; description: string | null }

@Component({
  selector: 'app-roles',
  imports: [ReactiveFormsModule, ModalComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold text-gray-900">Roles & permissions</h1><p class="text-sm text-gray-500">Decide exactly what each role can see and do</p></div>
        @if (canManage()) { <button type="button" class="btn-primary" (click)="creating.set(true)"><span class="mi">add</span>New role</button> }
      </div>

      @if (loading()) { <app-skeleton /> }
      @else if (error()) { <app-error-state [message]="error()" (retry)="load()" /> }
      @else {
        <div class="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <nav class="card space-y-1 p-2" aria-label="Roles">
            @for (r of roles(); track r.id) {
              <button type="button" class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium" [class]="selected()?.id === r.id ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-gray-50'" (click)="select(r)">
                <span>{{ r.name }}</span>@if (r.isSystem) { <span class="text-xs text-gray-400">system</span> }
              </button>
            }
          </nav>

          <section class="card p-5">
            @if (selected(); as r) {
              <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div><h2 class="text-lg font-bold text-gray-900">{{ r.name }}</h2><p class="text-sm text-gray-500">{{ r.description }} · {{ granted().size }} permission(s)</p></div>
                @if (canManage()) { <button type="button" class="btn-primary" [disabled]="busy() || !dirty()" (click)="save()">Save changes</button> }
              </div>
              @if (saveError()) { <p class="field-error mb-3">{{ saveError() }}</p> }
              <div class="grid gap-4 md:grid-cols-2">
                @for (g of modules(); track g.module) {
                  <fieldset class="rounded-xl border border-gray-100 p-3">
                    <legend class="flex items-center gap-2 px-1 text-sm font-semibold text-gray-800">{{ g.module }}
                      @if (canManage()) { <button type="button" class="text-xs font-medium text-brand hover:underline" (click)="setModule(g.module, !allOn(g.module))">{{ allOn(g.module) ? 'Clear' : 'All' }}</button> }</legend>
                    <div class="space-y-1">@for (p of g.items; track p.id) { <label class="flex items-center gap-2 text-sm text-gray-700" [title]="p.description ?? ''"><input type="checkbox" [disabled]="!canManage()" [checked]="granted().has(p.code)" (change)="toggle(p.code)" />{{ p.code }}</label> }</div>
                  </fieldset>
                }
              </div>
            } @else { <app-empty-state icon="admin_panel_settings" title="Select a role" /> }
          </section>
        </div>
      }
    </div>

    <app-modal [open]="creating()" title="New role" (closed)="creating.set(false)">
      @if (creating()) {
        <form class="space-y-4" [formGroup]="form" (ngSubmit)="create()">
          <div><label class="label" for="r-name">Name</label><input id="r-name" class="input" formControlName="name" />@if (form.controls['name'].touched && form.controls['name'].invalid) { <p class="field-error">Name is required.</p> }</div>
          <div><label class="label" for="r-desc">Description</label><input id="r-desc" class="input" formControlName="description" /></div>
          @if (createError()) { <p class="field-error">{{ createError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="creating.set(false)">Cancel</button><button type="submit" class="btn-primary" [disabled]="busy()">Create</button></div>
        </form>
      }
    </app-modal>`,
})
export class RolesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly canManage = computed(() => this.auth.hasPermission('Role.Manage'));
  protected readonly roles = signal<Role[]>([]);
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly selected = signal<Role | null>(null);
  protected readonly granted = signal<Set<string>>(new Set());
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly saveError = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal('');
  protected readonly form = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required] }), description: new FormControl('', { nonNullable: true }) });
  protected readonly modules = computed(() => {
    const map = new Map<string, Permission[]>();
    for (const p of this.permissions()) map.set(p.module, [...(map.get(p.module) ?? []), p]);
    return [...map.entries()].map(([module, items]) => ({ module, items }));
  });
  protected readonly dirty = computed(() => {
    const r = this.selected(), g = this.granted();
    return !!r && (r.permissions.length !== g.size || r.permissions.some(p => !g.has(p)));
  });

  ngOnInit(): void { this.load(); }

  protected load(selectId?: string): void {
    this.loading.set(true); this.error.set('');
    this.api.get<Permission[]>('permissions').subscribe({
      next: perms => this.api.get<Role[]>('roles').subscribe({
        next: roles => {
          this.permissions.set(perms); this.roles.set(roles);
          const keep = roles.find(r => r.id === (selectId ?? this.selected()?.id)) ?? roles[0];
          if (keep) this.select(keep);
          this.loading.set(false);
        },
        error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
      }),
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  protected select(r: Role): void { this.selected.set(r); this.granted.set(new Set(r.permissions)); this.saveError.set(''); }
  protected toggle(code: string): void { this.granted.update(s => { const n = new Set(s); if (!n.delete(code)) n.add(code); return n; }); }
  protected allOn(module: string): boolean { return (this.modules().find(m => m.module === module)?.items ?? []).every(p => this.granted().has(p.code)); }
  protected setModule(module: string, on: boolean): void {
    this.granted.update(s => { const n = new Set(s); for (const p of this.modules().find(m => m.module === module)?.items ?? []) on ? n.add(p.code) : n.delete(p.code); return n; });
  }

  protected save(): void {
    const r = this.selected();
    if (!r) return;
    this.busy.set(true); this.saveError.set('');
    this.api.put(`roles/${r.id}/permissions`, { permissions: [...this.granted()] }).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Permissions saved'); this.load(r.id); },
      error: e => { this.busy.set(false); this.saveError.set(errorMessage(e)); },
    });
  }

  protected create(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.busy.set(true); this.createError.set('');
    this.api.post<Role>('roles', { name: v.name, description: v.description || null, permissions: [] }).subscribe({
      next: r => { this.busy.set(false); this.creating.set(false); this.form.reset(); this.toast.success('Role created'); this.load(r.id); },
      error: e => { this.busy.set(false); this.createError.set(errorMessage(e)); },
    });
  }
}
