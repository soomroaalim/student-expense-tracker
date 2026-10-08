/**
 * Lightweight SVG charts — no dependencies, fully offline.
 * All functions return SVG markup strings ready to inject.
 */

export interface ChartSegment {
  label: string;
  value: number;
  color: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Donut chart with a center label. */
export function donutChart(segments: ChartSegment[], size = 170, centerLabel = '', centerSub = ''): string {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 70;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  if (total <= 0) {
    return `<svg viewBox="0 0 ${size} ${size}" class="chart donut" role="img" aria-label="No data">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="22"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" class="chart-empty">No data</text>
    </svg>`;
  }

  let offset = 0;
  const arcs = segments.map((s) => {
    const frac = s.value / total;
    const len = frac * C;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="22"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"><title>${esc(s.label)}</title></circle>`;
    offset += len;
    return el;
  }).join('');

  // Center label must fit inside the donut hole (inner diameter ~118 units):
  // shrink the font for long amounts instead of letting them spill over.
  const labelFs = centerLabel
    ? Math.max(9, Math.min(19, Math.floor(104 / (centerLabel.length * 0.58))))
    : 19;

  return `<svg viewBox="0 0 ${size} ${size}" class="chart donut" role="img" aria-label="${esc(centerLabel)}">
    ${arcs}
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" class="donut-value" style="font-size:${labelFs}px">${esc(centerLabel)}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-sub">${esc(centerSub)}</text>
  </svg>`;
}

export interface BarDatum {
  label: string;
  value: number;
  highlight?: boolean;
}

/** Vertical bar chart (e.g. daily spending). */
export function barChart(data: BarDatum[], opts: { height?: number; color?: string; format?: (v: number) => string } = {}): string {
  const h = opts.height ?? 150;
  // Keep the viewBox close to real phone widths (~24px per bar) so the SVG
  // scales 1:1 and never forces horizontal scrolling.
  const w = Math.max(280, Math.min(560, data.length * 24));
  const max = Math.max(...data.map((d) => d.value), 1);
  const padB = 26;
  const padT = 14;
  const innerH = h - padB - padT;
  const slot = w / Math.max(1, data.length);
  const bw = Math.min(18, slot * 0.55);

  const bars = data.map((d, i) => {
    const bh = Math.max(2, (d.value / max) * innerH);
    const x = slot * i + (slot - bw) / 2;
    const y = padT + innerH - bh;
    const color = d.highlight ? 'var(--primary)' : (opts.color ?? 'var(--primary-soft)');
    const title = opts.format ? opts.format(d.value) : String(d.value);
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="5" fill="${color}">
        <title>${esc(d.label)}: ${esc(title)}</title>
      </rect>
      <text x="${(slot * i + slot / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle" class="chart-tick">${esc(d.label)}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart bars" role="img" style="width:100%;height:auto">${bars}</svg>`;
}

/** Area sparkline (e.g. spending over time). */
export function sparkline(values: number[], opts: { width?: number; height?: number; stroke?: string } = {}): string {
  const w = opts.width ?? 320;
  const h = opts.height ?? 90;
  const pad = 6;
  if (values.length < 2) {
    return `<svg viewBox="0 0 ${w} ${h}" class="chart spark"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" class="chart-empty">Not enough data</text></svg>`;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(w - pad).toFixed(1)},${(h - pad).toFixed(1)} L${pad.toFixed(1)},${(h - pad).toFixed(1)} Z`;
  const stroke = opts.stroke ?? 'var(--primary)';
  return `<svg viewBox="0 0 ${w} ${h}" class="chart spark" role="img" preserveAspectRatio="none">
    <path d="${area}" fill="${stroke}" opacity="0.12"/>
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

/** Horizontal labeled bars (e.g. spending by category). */
export function categoryBars(rows: Array<{ label: string; value: number; color: string; formatted: string }>): string {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const items = rows.map((r) => {
    const pct = Math.max(2, (r.value / max) * 100);
    return `<div class="hbar-row">
      <div class="hbar-top"><span class="hbar-label">${esc(r.label)}</span><span class="hbar-val">${esc(r.formatted)}</span></div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${pct.toFixed(1)}%;background:${r.color}"></div></div>
    </div>`;
  }).join('');
  return `<div class="hbar-list">${items}</div>`;
}

/** Legend list for a donut chart. */
export function legend(items: Array<{ label: string; color: string; value: string }>): string {
  return `<ul class="legend">` + items.map((i) =>
    `<li><span class="legend-dot" style="background:${i.color}"></span><span class="legend-label">${esc(i.label)}</span><span class="legend-val">${esc(i.value)}</span></li>`,
  ).join('') + `</ul>`;
}
