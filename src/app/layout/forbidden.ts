import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <span class="mi text-5xl! text-gray-300">lock</span>
      <h1 class="text-xl font-bold text-gray-900">You don't have access to this page</h1>
      <p class="text-sm text-gray-500">Ask an administrator to grant the required permission, or this module may be switched off for your business.</p>
      <a routerLink="/" class="btn-primary mt-2">Back to home</a>
    </div>`,
})
export class ForbiddenComponent {}
