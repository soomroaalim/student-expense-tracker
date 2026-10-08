/**
 * Responsive/UI regression tests for the video-driven fixes:
 * - amounts are never clipped with "..." (shrink-to-fit, never overflow-x:hidden)
 * - donut center labels shrink to fit the hole
 * - fitAmounts is safe to call anywhere (no layout engine in jsdom)
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fitAmounts } from '../src/core/../ui/components';
import { donutChart } from '../src/ui/charts';

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');

describe('no forbidden overflow shortcuts', () => {
  it('never hides page overflow with overflow-x:hidden on html/body', () => {
    // The durable rule: fix the layout, don't mask it.
    const bodyRule = css.match(/(?:^|\n)\s*(?:html|body)[^{]*\{[^}]*\}/g) ?? [];
    for (const rule of bodyRule) {
      expect(rule).not.toMatch(/overflow-x\s*:\s*hidden/);
    }
  });

  it('provides the wrap variant for amount-bearing sentences', () => {
    expect(css).toContain('.txn-sub.wrap');
  });

  it('provides shrink-to-fit amounts', () => {
    expect(css).toMatch(/\.fit-amt\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('hero stats use a real grid (not a dead inline style on flex)', () => {
    expect(css).toMatch(/\.hero-stats\s*\{[^}]*display:\s*grid/);
  });

  it('segmented filters wrap instead of scrolling horizontally', () => {
    const seg = css.match(/\.segmented\s*\{[^}]*\}/)?.[0] ?? '';
    expect(seg).toContain('flex-wrap: wrap');
    expect(seg).not.toContain('overflow-x: auto');
  });

  it('bar charts scale to fit (no min-width forcing scroll)', () => {
    expect(css).not.toMatch(/\.chart-scroll/);
  });
});

describe('donutChart center label', () => {
  it('shrinks long amounts to fit inside the hole', () => {
    const long = donutChart([{ label: 'Food', value: 999999900, color: '#4f46e5' }], 170, 'Rs9,999,999', 'Oct');
    const m = long.match(/font-size:(\d+)px/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(19);
    const short = donutChart([{ label: 'Food', value: 100, color: '#4f46e5' }], 170, 'Rs100', 'Oct');
    expect(short).toContain('font-size:19px');
  });
});

describe('fitAmounts', () => {
  it('is safe without a layout engine and leaves short amounts alone', () => {
    document.body.innerHTML = '<div class="fit-amt" style="font-size:20px">Rs100</div>';
    expect(() => fitAmounts(document.body)).not.toThrow();
    const el = document.querySelector('.fit-amt') as HTMLElement;
    expect(el.style.fontSize).toBe('');
  });
});
