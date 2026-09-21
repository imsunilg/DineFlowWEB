import { Component, computed, input } from '@angular/core';

export interface ChartPoint { label: string; value: number }

const PALETTE = ['var(--color-brand, #4f46e5)', 'var(--color-accent, #f59e0b)', '#10b981', '#0ea5e9', '#ec4899', '#8b5cf6', '#64748b'];

function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return (v / 1e7).toFixed(1) + 'Cr';
  if (a >= 1e5) return (v / 1e5).toFixed(1) + 'L';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(Math.round(v));
}

/** Column chart with an accessible text summary; scales to its container. */
@Component({
  selector: 'app-bar-chart',
  template: `
    <svg viewBox="0 0 600 220" class="w-full" role="img" [attr.aria-label]="label()">
      @for (t of ticks(); track t.y) {
        <line [attr.x1]="40" [attr.x2]="590" [attr.y1]="t.y" [attr.y2]="t.y" stroke="#e5e7eb" stroke-dasharray="3 3" />
        <text x="34" [attr.y]="t.y + 4" text-anchor="end" font-size="10" fill="#6b7280">{{ t.text }}</text>
      }
      @for (b of bars(); track b.i) {
        <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="3" fill="var(--color-brand, #4f46e5)"><title>{{ b.label }}: {{ b.value }}</title></rect>
        @if (b.showLabel) { <text [attr.x]="b.x + b.w / 2" y="212" text-anchor="middle" font-size="10" fill="#6b7280">{{ b.label }}</text> }
      }
    </svg>`,
})
export class BarChartComponent {
  readonly data = input<ChartPoint[]>([]);
  readonly label = input('Bar chart');

  protected readonly max = computed(() => Math.max(1, ...this.data().map(d => d.value)));
  protected readonly ticks = computed(() => [0, 0.5, 1].map(f => ({ y: 190 - f * 170, text: compact(this.max() * f) })));
  protected readonly bars = computed(() => {
    const d = this.data(), slot = 550 / Math.max(d.length, 1), w = Math.min(slot * 0.6, 36);
    const every = Math.ceil(d.length / 10);
    return d.map((p, i) => {
      const h = (p.value / this.max()) * 170;
      return { i, x: 40 + i * slot + (slot - w) / 2, y: 190 - h, w, h: Math.max(h, p.value > 0 ? 1 : 0), label: p.label, value: p.value, showLabel: i % every === 0 };
    });
  });
}

@Component({
  selector: 'app-donut-chart',
  template: `
    <div class="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 120 120" class="h-32 w-32 shrink-0" role="img" [attr.aria-label]="label()">
        <circle cx="60" cy="60" r="44" fill="none" stroke="#f3f4f6" stroke-width="18" />
        @for (s of slices(); track s.label) {
          <circle cx="60" cy="60" r="44" fill="none" stroke-width="18" [attr.stroke]="s.color" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.offset" transform="rotate(-90 60 60)"><title>{{ s.label }}: {{ s.pct }}%</title></circle>
        }
      </svg>
      <ul class="min-w-0 flex-1 space-y-1.5 text-sm">
        @for (s of slices(); track s.label) {
          <li class="flex items-center gap-2"><span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background]="s.color"></span><span class="truncate text-gray-600">{{ s.label }}</span><span class="ml-auto font-semibold text-gray-900">{{ s.pct }}%</span></li>
        } @empty { <li class="text-gray-500">No data yet</li> }
      </ul>
    </div>`,
})
export class DonutChartComponent {
  readonly data = input<ChartPoint[]>([]);
  readonly label = input('Share chart');

  protected readonly slices = computed(() => {
    const items = this.data().filter(d => d.value > 0), total = items.reduce((s, d) => s + d.value, 0);
    if (!total) return [];
    const c = 2 * Math.PI * 44;
    let acc = 0;
    return items.map((d, i) => {
      const len = (d.value / total) * c, s = { label: d.label, pct: Math.round((d.value / total) * 100), color: PALETTE[i % PALETTE.length], dash: `${len} ${c - len}`, offset: -acc };
      acc += len;
      return s;
    });
  });
}
