/** Date helpers. All calendar dates are local 'YYYY-MM-DD' strings. */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(now = new Date()): string {
  return toISODate(now);
}

/** Parse 'YYYY-MM-DD' strictly; returns null when invalid (incl. 2026-02-30). */
export function parseISODate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function isValidISODate(s: string): boolean {
  return parseISODate(s) !== null;
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  if (!d) throw new Error(`Invalid date: ${iso}`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISODate(iso);
  if (!d) throw new Error(`Invalid date: ${iso}`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** Monday of the week containing `iso` (ISO week, Monday-first). */
export function weekStart(iso: string): string {
  const d = parseISODate(iso);
  if (!d) throw new Error(`Invalid date: ${iso}`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

export function monthStart(iso: string): string {
  const d = parseISODate(iso);
  if (!d) throw new Error(`Invalid date: ${iso}`);
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const d = parseISODate(iso);
  if (!d) throw new Error(`Invalid date: ${iso}`);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Full month label, e.g. "October 2026". */
export function monthLabel(iso: string, locale = 'en'): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/** Short friendly label for a date relative to today. */
export function friendlyDate(iso: string, now = new Date()): string {
  const t = todayISO(now);
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  if (iso === addDays(t, 1)) return 'Tomorrow';
  const d = parseISODate(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** Compare two ISO dates: -1, 0, 1. */
export function cmpDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function inRange(iso: string, from: string, to: string): boolean {
  return cmpDate(iso, from) >= 0 && cmpDate(iso, to) <= 0;
}

/** Generate every date string in [from, to] inclusive (cap to avoid runaway loops). */
export function eachDate(from: string, to: string, cap = 400): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cmpDate(cur, to) <= 0 && guard < cap) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}
