import { TestBed } from '@angular/core/testing';
import { BarChartComponent, DonutChartComponent } from './charts';

describe('charts', () => {
  it('scales columns to the largest value and keeps zero days visible as labels', () => {
    const fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentRef.setInput('data', [{ label: '01', value: 0 }, { label: '02', value: 50 }, { label: '03', value: 100 }]);
    fixture.detectChanges();

    const rects = Array.from(fixture.nativeElement.querySelectorAll('rect')) as SVGRectElement[];
    expect(rects).toHaveLength(3);
    const heights = rects.map(r => Number(r.getAttribute('height')));
    expect(heights[0]).toBe(0);
    expect(heights[2]).toBeCloseTo(heights[1] * 2, 1);
    expect(fixture.nativeElement.textContent).toContain('03');
  });

  it('draws an accessible chart and survives empty data', () => {
    const fixture = TestBed.createComponent(BarChartComponent);
    fixture.componentRef.setInput('label', 'Sales, daily');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg').getAttribute('aria-label')).toBe('Sales, daily');
    expect(fixture.nativeElement.querySelectorAll('rect')).toHaveLength(0);
  });

  it('shows each share as a rounded percentage and hides zero slices', () => {
    const fixture = TestBed.createComponent(DonutChartComponent);
    fixture.componentRef.setInput('data', [{ label: 'Cash', value: 750 }, { label: 'UPI', value: 250 }, { label: 'Card', value: 0 }]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Cash');
    expect(text).toContain('75%');
    expect(text).toContain('25%');
    expect(text).not.toContain('Card');
  });

  it('says so when there is nothing to chart', () => {
    const fixture = TestBed.createComponent(DonutChartComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No data yet');
  });
});
