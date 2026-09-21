import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { AppConfigService } from './core/app-config.service';
import { BrandingService } from './core/branding.service';
import { authInterceptor, errorInterceptor } from './core/http.interceptors';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Runtime config first, then tenant branding, before anything renders.
    provideAppInitializer(async () => {
      const config = inject(AppConfigService);
      const branding = inject(BrandingService);
      await config.load();
      await branding.load();
    }),
  ],
};
