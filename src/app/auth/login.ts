import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AppConfigService, DemoUser } from '../core/app-config.service';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';
import { loginBackground } from '../core/config/login-theme-assets';
import { errorMessage } from '../core/http.interceptors';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <div
      class="relative grid min-h-screen place-items-center overflow-hidden bg-cover bg-center bg-no-repeat p-4"
      [style.background-image]="'url(' + backgroundUrl() + ')'"
    >
      <div class="pointer-events-none absolute inset-0 login-overlay"></div>

      <button
        type="button"
        class="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
        [attr.aria-label]="theme.mode() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        (click)="theme.toggle()"
      >
        <span class="mi">{{ theme.mode() === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
      </button>

      <form class="login-card relative z-10 w-full max-w-md space-y-5 p-8" [formGroup]="form" (ngSubmit)="submit()">
        <div class="flex flex-col items-center gap-2 text-center">
          <img [src]="branding.branding()?.logoUrl || '/app_icon.jpg'" alt="" class="h-28 w-28 rounded-2xl object-contain" />
          <div>
            <h1 class="text-xl font-bold text-gray-900">{{ branding.name() }}</h1>
            <p class="text-sm text-gray-500">Sign in to continue</p>
          </div>
        </div>

        @if (error()) { <div class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{{ error() }}</div> }

        <div>
          <label class="label" for="email">Email or Login ID</label>
          <input id="email" class="input" type="text" autocomplete="username" formControlName="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) { <p class="field-error">Enter your email or login ID.</p> }
        </div>
        <div>
          <label class="label" for="password">Password</label>
          <input id="password" class="input" type="password" autocomplete="current-password" formControlName="password" />
          @if (form.controls.password.touched && form.controls.password.invalid) { <p class="field-error">Password is required.</p> }
        </div>
        <button class="btn-primary w-full" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>

        @if (demoUsers().length) {
          <div class="space-y-3 border-t border-gray-200 pt-4">
            <p class="text-center text-xs font-semibold uppercase tracking-wide text-gray-400">Demo Login</p>
            <div class="grid gap-2">
              @for (user of demoUsers(); track user.loginId) {
                <button type="button" class="btn-ghost w-full" [disabled]="busy()" (click)="loginAsDemo(user)">{{ user.label }}</button>
              }
            </div>
            <p class="text-center text-xs text-gray-400">Development / Demo Environment</p>
          </div>
        }
      </form>
    </div>`,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly appConfig = inject(AppConfigService);
  protected readonly branding = inject(BrandingService);
  protected readonly theme = inject(ThemeService);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.nonNullable.group({
    email: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected readonly demoUsers = signal<DemoUser[]>(this.appConfig.demoLoginEnabled ? this.appConfig.demoUsers : []);

  protected readonly backgroundUrl = computed(() =>
    loginBackground(this.theme.mode(), this.branding.branding()?.tenantCode ?? this.appConfig.defaultTenantCode),
  );

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

  /** Fills the normal sign-in form and submits through the same /auth/login call; never bypasses authentication. */
  protected loginAsDemo(user: DemoUser): void {
    this.form.setValue({ email: user.loginId, password: user.password });
    this.submit();
  }
}
