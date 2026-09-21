import { Component, Injectable, inject, input, output } from '@angular/core';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

/** Slide-over panel used for create/edit forms. */
@Component({
  selector: 'app-drawer',
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" (click)="closed.emit()"></div>
      <aside class="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl" role="dialog" aria-modal="true">
        <header class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 class="text-lg font-semibold text-gray-900">{{ title() }}</h2>
          <button type="button" class="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" (click)="closed.emit()"><span class="mi">close</span></button>
        </header>
        <div class="flex-1 overflow-y-auto px-6 py-5"><ng-content /></div>
        <footer class="flex justify-end gap-2 border-t border-gray-100 px-6 py-4"><ng-content select="[drawer-actions]" /></footer>
      </aside>
    }`,
})
export class DrawerComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();
}

/** Centered dialog used where a right-hand drawer is the wrong shape (item chooser, payment, receipt). */
@Component({
  selector: 'app-modal',
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" (click)="closed.emit()"></div>
      <div class="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
        <section class="pointer-events-auto flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-2xl" [class]="width()" role="dialog" aria-modal="true">
          <header class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 class="text-lg font-semibold text-gray-900">{{ title() }}</h2>
            <button type="button" class="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close" (click)="closed.emit()"><span class="mi">close</span></button>
          </header>
          <div class="flex-1 overflow-y-auto px-6 py-5"><ng-content /></div>
          <footer class="flex justify-end gap-2 border-t border-gray-100 px-6 py-4 empty:hidden"><ng-content select="[modal-actions]" /></footer>
        </section>
      </div>
    }`,
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly width = input('max-w-lg');
  readonly closed = output<void>();
}

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span class="mi text-5xl! text-gray-300">{{ icon() }}</span>
      <p class="text-base font-semibold text-gray-700">{{ title() }}</p>
      @if (hint()) { <p class="max-w-sm text-sm text-gray-500">{{ hint() }}</p> }
      <ng-content />
    </div>`,
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input('Nothing here yet');
  readonly hint = input('');
}

@Component({
  selector: 'app-skeleton',
  template: `<div class="space-y-3">@for (r of rows(); track $index) { <div class="h-10 animate-pulse rounded-xl bg-gray-100"></div> }</div>`,
})
export class SkeletonComponent {
  readonly count = input(5);
  rows() { return Array.from({ length: this.count() }); }
}

@Component({
  selector: 'app-error-state',
  template: `
    <div class="flex flex-col items-center gap-3 py-12 text-center">
      <span class="mi text-4xl! text-red-400">error_outline</span>
      <p class="text-sm text-gray-600">{{ message() }}</p>
      <button type="button" class="btn-ghost" (click)="retry.emit()">Try again</button>
    </div>`,
})
export class ErrorStateComponent {
  readonly message = input('Something went wrong while loading.');
  readonly retry = output<void>();
}

@Component({
  selector: 'app-pager',
  template: `
    @if (totalPages() > 1) {
      <div class="flex items-center justify-between px-1 pt-4 text-sm text-gray-600">
        <span>Page {{ page() }} of {{ totalPages() }} · {{ total() }} records</span>
        <div class="flex gap-2">
          <button type="button" class="btn-ghost" [disabled]="page() <= 1" (click)="changed.emit(page() - 1)">Previous</button>
          <button type="button" class="btn-ghost" [disabled]="page() >= totalPages()" (click)="changed.emit(page() + 1)">Next</button>
        </div>
      </div>
    }`,
})
export class PagerComponent {
  readonly page = input(1);
  readonly totalPages = input(1);
  readonly total = input(0);
  readonly changed = output<number>();
}

export interface ConfirmData { title: string; message: string; confirmText?: string; danger?: boolean }

@Component({
  imports: [MatDialogModule],
  template: `
    <div class="p-6">
      <h2 class="text-lg font-semibold text-gray-900">{{ data.title }}</h2>
      <p class="mt-2 text-sm text-gray-600">{{ data.message }}</p>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn-ghost" (click)="ref.close(false)">Cancel</button>
        <button type="button" [class]="data.danger ? 'btn-danger' : 'btn-primary'" (click)="ref.close(true)">{{ data.confirmText ?? 'Confirm' }}</button>
      </div>
    </div>`,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ConfirmDialogComponent, boolean>);
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);
  async ask(data: ConfirmData): Promise<boolean> {
    const ref = this.dialog.open<ConfirmDialogComponent, ConfirmData, boolean>(ConfirmDialogComponent, { data, width: '420px', autoFocus: false });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
