import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { BrandingService } from './branding.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? true : inject(Router).createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/dashboard']) : true;
};

/** Route data: { permission?: string; feature?: string } */
export const accessGuard: CanActivateFn = route => {
  const auth = inject(AuthService);
  const branding = inject(BrandingService);
  const router = inject(Router);
  const permission = route.data['permission'] as string | undefined;
  const feature = route.data['feature'] as string | undefined;
  if (permission && !auth.hasPermission(permission)) return router.createUrlTree(['/forbidden']);
  if (!branding.isEnabled(feature)) return router.createUrlTree(['/forbidden']);
  return true;
};
