import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { BrandingService } from '../core/branding.service';
import { errorMessage } from '../core/http.interceptors';
import { Bill, PaymentMethod, Receipt } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ModalComponent } from '../shared/ui';

type PayRow = FormGroup<{ methodId: FormControl<string>; amount: FormControl<number>; reference: FormControl<string> }>;
const cents = (n: number) => Math.round(n * 100);

/** Settles a bill, including split payments across methods. Totals come from the server; this only collects tender lines. */
@Component({
  selector: 'app-payment-modal',
  imports: [ReactiveFormsModule, ModalComponent, DatePipe, DecimalPipe],
  template: `
    <app-modal [open]="bill() !== null" [title]="paid() ? 'Payment complete' : 'Collect payment'" width="max-w-2xl" (closed)="close()">
      @if (bill(); as b) {
        <div class="space-y-5">
          <div class="rounded-2xl bg-ink p-5 text-white">
            <div class="flex items-end justify-between">
              <div><p class="text-xs uppercase tracking-wider text-white/60">{{ b.billNo }} · {{ b.orderNo }}</p><p class="mt-1 text-3xl font-bold">{{ branding.money(b.grandTotal) }}</p></div>
              <div class="text-right text-sm text-white/70"><p>Paid {{ branding.money(b.paidAmount) }}</p><p class="font-semibold text-white">Due {{ branding.money(b.dueAmount) }}</p></div>
            </div>
            <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-white/80 sm:grid-cols-4">
              <div><dt class="text-white/50">Subtotal</dt><dd>{{ branding.money(b.subtotal) }}</dd></div>
              @if (b.discountAmount > 0) { <div><dt class="text-white/50">Discount</dt><dd>-{{ branding.money(b.discountAmount) }}</dd></div> }
              <div><dt class="text-white/50">Tax</dt><dd>{{ branding.money(b.taxAmount) }}</dd></div>
              @if (b.serviceChargeAmount > 0) { <div><dt class="text-white/50">Service</dt><dd>{{ branding.money(b.serviceChargeAmount) }}</dd></div> }
            </dl>
          </div>

          @if (!paid()) {
            <div class="space-y-2">
              <p class="label">Payments</p>
              @for (row of rows.controls; track $index) {
                <div class="grid grid-cols-12 items-center gap-2" [formGroup]="row">
                  <select class="input col-span-4" aria-label="Payment method" formControlName="methodId">
                    @for (m of methods(); track m.id) { <option [value]="m.id">{{ m.name }}</option> }
                  </select>
                  <input class="input col-span-3" type="number" min="0" step="0.01" aria-label="Amount" formControlName="amount" />
                  <input class="input col-span-4" placeholder="Reference (optional)" aria-label="Reference" formControlName="reference" />
                  <div class="col-span-1 flex justify-end">
                    @if (rows.length > 1) { <button type="button" class="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Remove payment" (click)="rows.removeAt($index)"><span class="mi">close</span></button> }
                  </div>
                  <div class="col-span-12 -mt-1 text-right"><button type="button" class="text-xs font-semibold text-brand" (click)="fill(row)">Fill remaining</button></div>
                </div>
              }
              <button type="button" class="text-sm font-semibold text-brand" (click)="addRow()">+ Split payment</button>
            </div>

            <div class="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold" [class]="remainingCents() === 0 ? 'bg-emerald-50 text-emerald-700' : remainingCents() < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'">
              <span>{{ remainingCents() === 0 ? 'Fully covered' : remainingCents() < 0 ? 'Over by' : 'Still to collect' }}</span>
              <span>{{ branding.money(abs(remainingCents()) / 100) }}</span>
            </div>
            @if (error()) { <p class="field-error">{{ error() }}</p> }
          } @else {
            <div class="flex flex-col items-center gap-2 py-4 text-center">
              <span class="mi grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-3xl! text-emerald-600">check_circle</span>
              <p class="text-lg font-semibold text-gray-900">Bill settled</p>
              <ul class="text-sm text-gray-600">@for (p of b.payments; track p.id) { <li>{{ p.methodName }} · {{ branding.money(p.amount) }}@if (p.reference) { · {{ p.reference }} }</li> }</ul>
            </div>
          }
        </div>
      }
      <div modal-actions>
        @if (paid()) {
          <button type="button" class="btn-ghost" (click)="showReceipt()"><span class="mi">receipt_long</span>Receipt</button>
          <button type="button" class="btn-primary" (click)="done()">Done</button>
        } @else {
          <button type="button" class="btn-ghost" (click)="close()">Cancel</button>
          <button type="button" class="btn-primary" [disabled]="busy() || remainingCents() < 0 || totalCents() === 0" (click)="submit()">{{ busy() ? 'Processing…' : remainingCents() === 0 ? 'Confirm payment' : 'Record partial payment' }}</button>
        }
      </div>
    </app-modal>

    <app-modal [open]="receipt() !== null" title="Receipt" width="max-w-sm" (closed)="receipt.set(null)">
      @if (receipt(); as r) {
        <div class="print-area mx-auto w-full max-w-[80mm] font-mono text-xs leading-relaxed text-gray-900">
          <div class="text-center">
            <p class="text-sm font-bold">{{ r.displayName }}</p>
            @if (r.legalName) { <p>{{ r.legalName }}</p> }
            @if (r.address) { <p>{{ r.address }}</p> }
            @if (r.phone) { <p>Tel: {{ r.phone }}</p> }
            @if (r.taxNumber) { <p>Tax no: {{ r.taxNumber }}</p> }
            @if (r.header && r.header !== r.displayName) { <p class="mt-1">{{ r.header }}</p> }
          </div>
          <hr class="my-2 border-dashed border-gray-400" />
          <p>Bill: {{ r.bill.billNo }}</p><p>Order: {{ r.bill.orderNo }}@if (r.bill.tableCode) { · Table {{ r.bill.tableCode }} }</p>
          <p>{{ (r.bill.paidAt ?? r.bill.createdAt) | date: 'medium' }}</p>
          <hr class="my-2 border-dashed border-gray-400" />
          @for (l of r.bill.lines; track l.id) {
            <div class="flex justify-between gap-2"><span>{{ l.quantity }} x {{ l.itemName }}@if (l.variantName) { ({{ l.variantName }}) }</span><span>{{ l.lineSubtotal | number: '1.2-2' }}</span></div>
          }
          <hr class="my-2 border-dashed border-gray-400" />
          <div class="flex justify-between"><span>Subtotal</span><span>{{ r.bill.subtotal | number: '1.2-2' }}</span></div>
          @if (r.bill.discountAmount > 0) { <div class="flex justify-between"><span>Discount</span><span>-{{ r.bill.discountAmount | number: '1.2-2' }}</span></div> }
          @for (t of r.bill.taxBreakdown; track t.code) { <div class="flex justify-between"><span>{{ t.name }} {{ t.ratePercent }}%</span><span>{{ t.amount | number: '1.2-2' }}</span></div> }
          @if (r.bill.serviceChargeAmount > 0) { <div class="flex justify-between"><span>Service charge</span><span>{{ r.bill.serviceChargeAmount | number: '1.2-2' }}</span></div> }
          @if (r.bill.roundOff !== 0) { <div class="flex justify-between"><span>Round off</span><span>{{ r.bill.roundOff | number: '1.2-2' }}</span></div> }
          <div class="mt-1 flex justify-between text-sm font-bold"><span>TOTAL</span><span>{{ r.currencySymbol }}{{ r.bill.grandTotal | number: '1.2-2' }}</span></div>
          <hr class="my-2 border-dashed border-gray-400" />
          @for (p of r.bill.payments; track p.id) { <div class="flex justify-between"><span>{{ p.methodName }}</span><span>{{ p.amount | number: '1.2-2' }}</span></div> }
          @if (r.footer) { <p class="mt-3 text-center">{{ r.footer }}</p> }
        </div>
      }
      <div modal-actions>
        <button type="button" class="btn-ghost" (click)="receipt.set(null)">Close</button>
        <button type="button" class="btn-primary" (click)="print()"><span class="mi">print</span>Print</button>
      </div>
    </app-modal>`,
})
export class PaymentModalComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly branding = inject(BrandingService);

  readonly bill = input<Bill | null>(null);
  readonly finished = output<Bill>();
  readonly closed = output<void>();

  protected readonly methods = signal<PaymentMethod[]>([]);
  protected readonly rows = new FormArray<PayRow>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly paid = signal(false);
  protected readonly receipt = signal<Receipt | null>(null);
  private readonly version = signal(0);
  private settled: Bill | null = null;
  private lastBillId: string | null = null;

  protected readonly totalCents = computed(() => { this.version(); return this.rows.controls.reduce((s, r) => s + cents(r.controls.amount.value || 0), 0); });
  protected readonly remainingCents = computed(() => cents(this.bill()?.dueAmount ?? 0) - this.totalCents());

  constructor() {
    effect(() => {
      const b = this.bill();
      if (!b) { this.lastBillId = null; return; }
      untracked(() => {
        const isNewBill = b.id !== this.lastBillId;
        this.lastBillId = b.id;
        // The parent pushes the updated bill back in after we pay it; only a *new* bill resets the modal state.
        if (isNewBill) { this.paid.set(b.status === 'Paid'); this.settled = null; }
        this.error.set('');
        if (b.status === 'Paid') return;
        const load = this.methods().length ? Promise.resolve() : new Promise<void>(res => this.api.get<PaymentMethod[]>('payments/methods').subscribe({ next: m => { this.methods.set(m); res(); }, error: () => res() }));
        load.then(() => { this.rows.clear(); this.addRow(b.dueAmount); });   // after a partial payment, re-seed with the remaining due
      });
    });
  }

  protected abs(n: number): number { return Math.abs(n); }

  protected addRow(amount = 0): void {
    const first = this.methods()[0]?.id ?? '';
    const row: PayRow = new FormGroup({
      methodId: new FormControl(first, { nonNullable: true, validators: Validators.required }),
      amount: new FormControl(amount, { nonNullable: true }),
      reference: new FormControl('', { nonNullable: true }),
    });
    row.valueChanges.subscribe(() => this.version.update(v => v + 1));
    this.rows.push(row);
    this.version.update(v => v + 1);
  }

  protected fill(row: PayRow): void {
    const others = this.totalCents() - cents(row.controls.amount.value || 0);
    row.controls.amount.setValue(Math.max(0, cents(this.bill()?.dueAmount ?? 0) - others) / 100);
  }

  protected submit(): void {
    const b = this.bill();
    if (!b) return;
    const payments = this.rows.controls.map(r => r.getRawValue()).filter(r => r.amount > 0)
      .map(r => ({ paymentMethodId: r.methodId, amount: Math.round(r.amount * 100) / 100, reference: r.reference || null }));
    this.busy.set(true); this.error.set('');
    this.api.post<Bill>(`payments/bills/${b.id}`, { payments }).subscribe({
      next: updated => {
        this.busy.set(false);
        if (updated.status === 'Paid') { this.settled = updated; this.paid.set(true); this.toast.success('Payment complete'); this.finished.emit(updated); }
        else { this.toast.success('Partial payment recorded'); this.finished.emit(updated); }
      },
      error: e => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }

  protected showReceipt(): void {
    const b = this.settled ?? this.bill();
    if (!b) return;
    this.api.get<Receipt>(`billing/${b.id}/receipt`).subscribe({ next: r => this.receipt.set(r), error: e => this.toast.error(errorMessage(e)) });
  }

  protected print(): void { window.print(); }
  protected done(): void { this.closed.emit(); }
  protected close(): void { this.closed.emit(); }
}
