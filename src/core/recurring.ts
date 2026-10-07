/**
 * Recurring expense scheduling. Pure date math: given a recurrence rule,
 * compute the next occurrence date and the list of missed occurrences
 * that should be generated. Generation itself is idempotent because it
 * advances from `lastGenerated`, so opening the app many times never
 * creates duplicates.
 */
import type { Recurrence, RecurringExpense } from '../model/types';
import { addDays, addMonths, cmpDate, parseISODate } from './dates';

/** The date after `iso` for the given frequency. */
export function nextDate(iso: string, freq: Recurrence): string {
  if (!parseISODate(iso)) throw new Error(`Invalid date: ${iso}`);
  switch (freq) {
    case 'daily': return addDays(iso, 1);
    case 'weekly': return addDays(iso, 7);
    case 'monthly': return addMonths(iso, 1);
  }
}

/** The date before `iso` for the given frequency. */
export function prevDate(iso: string, freq: Recurrence): string {
  if (!parseISODate(iso)) throw new Error(`Invalid date: ${iso}`);
  switch (freq) {
    case 'daily': return addDays(iso, -1);
    case 'weekly': return addDays(iso, -7);
    case 'monthly': return addMonths(iso, -1);
  }
}

/**
 * List every occurrence date in [from, to] (inclusive) for the frequency.
 * Capped at 366 entries as a safety guard.
 */
export function occurrencesBetween(from: string, to: string, freq: Recurrence): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cmpDate(cur, to) <= 0 && guard < 366) {
    out.push(cur);
    cur = nextDate(cur, freq);
    guard++;
  }
  return out;
}

/**
 * Compute the occurrence dates that should be materialized as transactions
 * for a recurring rule as of `todayISO`. Returns an empty list when nothing
 * is due. Also returns the new `lastGenerated` / `nextOccurrence` state so
 * the caller can persist it atomically with the created transactions.
 *
 * Backfill is capped: at most 60 missed occurrences are generated in one
 * run, and anything older is skipped (the rule simply resumes from today).
 */
export function dueOccurrences(
  rule: RecurringExpense,
  today: string,
): { dates: string[]; lastGenerated?: string; nextOccurrence: string } {
  if (!rule.enabled) return { dates: [], lastGenerated: rule.lastGenerated, nextOccurrence: rule.nextOccurrence };
  if (!parseISODate(today)) throw new Error(`Invalid date: ${today}`);

  // Start from the day after the last generated occurrence, or the rule's start.
  const candidate = rule.lastGenerated ? nextDate(rule.lastGenerated, rule.frequency) : rule.nextOccurrence;
  // Cap backfill: never generate more than 60 occurrences in one run.
  // Older missed occurrences are skipped and the rule resumes from the cap window.
  let back = today;
  for (let i = 0; i < 59; i++) back = prevDate(back, rule.frequency);
  const start = cmpDate(candidate, back) > 0 ? candidate : back;
  if (cmpDate(start, today) > 0) {
    return { dates: [], lastGenerated: rule.lastGenerated, nextOccurrence: rule.nextOccurrence };
  }
  const dates = occurrencesBetween(start, today, rule.frequency);
  const last = dates[dates.length - 1];
  if (!last) return { dates: [], lastGenerated: rule.lastGenerated, nextOccurrence: rule.nextOccurrence };
  return {
    dates,
    lastGenerated: last,
    nextOccurrence: nextDate(last, rule.frequency),
  };
}

/** Friendly label for a frequency, e.g. "Monthly". */
export function frequencyLabel(freq: Recurrence): string {
  return freq === 'daily' ? 'Daily' : freq === 'weekly' ? 'Weekly' : 'Monthly';
}
