/**
 * Money handling. All amounts are integers in minor units (paisa/cents).
 * Parsing/validation is strict: never trust raw user input.
 */
import { currencyMeta } from '../model/defaults';

/** Hard cap: 10 billion major units in minor units (prevents absurd values). */
export const MAX_MINOR = 10_000_000_000 * 100;

export interface ParseResult {
  ok: boolean;
  /** Minor units; valid only when ok === true. */
  minor: number;
  /** Machine-readable reason when ok === false. */
  error?: 'empty' | 'invalid' | 'non-positive' | 'too-many-decimals' | 'too-large';
}

const AMOUNT_RE = /^[0-9]+(\.[0-9]{1,2})?$/;

/**
 * Parse a user-entered amount string into minor units.
 * Accepts currency symbols, commas, and spaces (e.g. "₨ 1,250.50").
 */
export function parseAmount(raw: string, currencyCode = 'PKR'): ParseResult {
  const meta = currencyMeta(currencyCode);
  let s = (raw ?? '').trim();
  if (!s) return { ok: false, minor: 0, error: 'empty' };
  if (s.startsWith('-')) return { ok: false, minor: 0, error: 'non-positive' };
  // Strip symbols, letters, commas, spaces — keep digits and dots.
  s = s.replace(/[^0-9.]/g, '');
  if (!s || !AMOUNT_RE.test(s)) {
    // Distinguish "1.234" (too many decimals) from garbage.
    if (/^[0-9]+\.[0-9]{3,}$/.test(s)) return { ok: false, minor: 0, error: 'too-many-decimals' };
    return { ok: false, minor: 0, error: 'invalid' };
  }
  const [whole, frac = ''] = s.split('.');
  const paddedFrac = (frac + '00').slice(0, meta.minorUnits === 1 ? 0 : 2);
  // BigInt keeps the magnitude check exact even for absurd inputs.
  const minorBig = BigInt(whole) * BigInt(meta.minorUnits) + BigInt(paddedFrac || '0');
  if (minorBig <= 0n) return { ok: false, minor: 0, error: 'non-positive' };
  if (minorBig > BigInt(MAX_MINOR)) return { ok: false, minor: 0, error: 'too-large' };
  const minor = Number(minorBig);
  if (!Number.isSafeInteger(minor)) return { ok: false, minor: 0, error: 'invalid' };
  return { ok: true, minor };
}

export function amountErrorMessage(r: ParseResult): string {
  switch (r.error) {
    case 'empty': return 'Please enter an amount.';
    case 'invalid': return 'That doesn’t look like a valid amount.';
    case 'non-positive': return 'Amount must be greater than zero.';
    case 'too-many-decimals': return 'Please use at most 2 decimal places.';
    case 'too-large': return 'That amount is unrealistically large.';
    default: return 'Invalid amount.';
  }
}

/**
 * Format minor units for display, e.g. 125000 -> "₨1,250".
 * Shows decimals only when the value isn't whole.
 */
export function formatMoney(minor: number, currencyCode = 'PKR'): string {
  const meta = currencyMeta(currencyCode);
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const major = Math.floor(abs / meta.minorUnits);
  const rest = abs % meta.minorUnits;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let out = meta.symbol + grouped;
  if (rest !== 0) {
    const digits = meta.minorUnits === 100 ? 2 : 0;
    out += '.' + rest.toString().padStart(digits, '0');
  }
  return negative ? '-' + out : out;
}

/** Format with explicit sign, e.g. "+₨500" / "-₨250". */
export function formatSigned(minor: number, currencyCode = 'PKR'): string {
  if (minor === 0) return formatMoney(0, currencyCode);
  const sign = minor > 0 ? '+' : '-';
  return sign + formatMoney(Math.abs(minor), currencyCode);
}

/** Safe integer addition for a list of minor-unit amounts. */
export function sumMinor(values: number[]): number {
  let total = 0;
  for (const v of values) {
    total += Math.trunc(v);
    if (!Number.isSafeInteger(total)) throw new Error('Amount overflow');
  }
  return total;
}
