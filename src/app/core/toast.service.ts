import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly snack = inject(MatSnackBar);

  success(message: string): void { this.snack.open(message, 'OK', { duration: 3000, panelClass: 'toast-success' }); }
  error(message: string): void { this.snack.open(message, 'Dismiss', { duration: 6000, panelClass: 'toast-error' }); }
}
