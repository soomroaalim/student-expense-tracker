/**
 * Money calculators — pure, integer minor-unit math.
 * These NEVER touch real transactions; results are planning-only.
 */

/** Discount: original price + percent off -> { saved, final }. */
export function discountCalc(originalMinor: number, pct: number): { saved: number; final: number } {
  const p = Math.min(100, Math.max(0, pct));
  const saved = Math.round((originalMinor * p) / 100);
  return { saved, final: originalMinor - saved };
}

/** Split bill: total / people -> per person (rounded to minor units). */
export function splitBill(totalMinor: number, people: number): { perPerson: number; remainder: number } {
  const n = Math.max(1, Math.floor(people));
  const perPerson = Math.round(totalMinor / n);
  return { perPerson, remainder: totalMinor - perPerson * n };
}

/** Savings: goal + already saved -> { remaining, pct }. */
export function savingsCalc(goalMinor: number, savedMinor: number): { remaining: number; pct: number } {
  const remaining = Math.max(0, goalMinor - savedMinor);
  const pct = goalMinor > 0 ? Math.min(100, Math.round((savedMinor / goalMinor) * 100)) : 0;
  return { remaining, pct };
}

/** Tip: bill + percent -> { tip, total }. */
export function tipCalc(billMinor: number, pct: number): { tip: number; total: number } {
  const p = Math.max(0, pct);
  const tip = Math.round((billMinor * p) / 100);
  return { tip, total: billMinor + tip };
}
