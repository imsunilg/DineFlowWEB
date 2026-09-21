import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <div class="grid min-h-screen place-items-center bg-linear-to-br from-ink via-ink to-brand/70 p-4">
      <form class="card w-full max-w-md space-y-5 p-8" [formGroup]="form" (ngSubmit)="submit()">
        <div class="flex items-center gap-3">
          @if (branding.branding()?.logoUrl; as logo) { <img [src]="logo" alt="" class="h-11 w-11 rounded-xl object-contain" /> }
          @else { <div class="grid h-11 w-11 place-items-center rounded-xl bg-brand text-lg font-bold text-white">{{ (branding.name() || '?').charAt(0) }}</div> }
          <div>
            <h1 class="text-xl font-bold text-gray-900">{{ branding.name() }}</h1>
            <p class="text-sm text-gray-500">Sign in to continue</p>
          </div>
        </div>

        @if (error()) { <div class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{{ error() }}</div> }

        <div>
          <label class="label" for="email">Email</label>
          <input id="email" class="input" type="email" autocomplete="username" formControlName="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) { <p class="field-error">Enter a valid email address.</p> }
        </div>
        <div>
          <label class="label" for="password">Password</label>
          <input id="password" class="input" type="password" autocomplete="current-password" formControlName="password" />
          @if (form.controls.password.touched && form.controls.password.invalid) { <p class="field-error">Password is required.</p> }
        </div>
        <button class="btn-primary w-full" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </form>
    </div>`,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly branding = inject(BrandingService);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: async () => {
        await this.branding.load(); // token now identifies the tenant; reload its branding
        this.router.navigate(['/dashboard']);
      },
      error: err => { this.busy.set(false); this.error.set(errorMessage(err)); },
    });
  }
}
