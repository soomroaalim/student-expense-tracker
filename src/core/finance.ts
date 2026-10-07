/**
 * Central financial calculations. All functions are pure:
 * they take plain data and return plain results, which makes
 * them easy to unit-test and keeps UI code thin.
 */
import type { DatedFlow, Transaction, TxnType } from '../model/types';
import {
  addDays, cmpDate, eachDate, inRange, monthEnd, monthStart, todayISO,
  weekEnd, weekStart,
} from './dates';
import { sumMinor } from './money';

export interface Summary {
  income: number;
  expense: number;
  balance: number;
  count: number;
}

/** Filter transactions to a date range (inclusive) and optional type/category. */
export function filterTxns(
  txns: Transaction[],
  opts: { from?: string; to?: string; type?: TxnType; categoryId?: string } = {},
): Transaction[] {
  return txns.filter((t) => {
    if (opts.type && t.type !== opts.type) return false;
    if (opts.categoryId && t.categoryId !== opts.categoryId) return false;
    if (opts.from && cmpDate(t.date, opts.from) < 0) return false;
    if (opts.to && cmpDate(t.date, opts.to) > 0) return false;
    return true;
  });
}

/** Sum income/expense over a (possibly filtered) set of transactions. */
export function summarize(txns: Transaction[]): Summary {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  income = sumMinor([income]);
  expense = sumMinor([expense]);
  return { income, expense, balance: income - expense, count: txns.length };
}

export interface DashboardStats {
  balance: number;
  totalIncome: number;
  totalExpense: number;
  today: Summary;
  week: Summary;
  month: Summary;
}

/** Everything the home dashboard needs, computed from all transactions. */
export function dashboardStats(txns: Transaction[], now = new Date()): DashboardStats {
  const today = todayISO(now);
  const total = summarize(txns);
  return {
    balance: total.balance,
    totalIncome: total.income,
    totalExpense: total.expense,
    today: summarize(filterTxns(txns, { from: today, to: today })),
    week: summarize(filterTxns(txns, { from: weekStart(today), to: weekEnd(today) })),
    month: summarize(filterTxns(txns, { from: monthStart(today), to: monthEnd(today) })),
  };
}

export interface CategoryTotal {
  categoryId: string;
  total: number;
  count: number;
  /** Share of the given total, 0..1. */
  share: number;
}

/** Totals per category for a transaction set, sorted by total desc. */
export function totalsByCategory(
  txns: Transaction[],
  type: TxnType,
  categoryIds?: string[],
): CategoryTotal[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    if (t.type !== type) continue;
    const e = map.get(t.categoryId) ?? { total: 0, count: 0 };
    e.total += t.amount;
    e.count += 1;
    map.set(t.categoryId, e);
  }
  const grand = sumMinor([...map.values()].map((e) => e.total));
  const out: CategoryTotal[] = [];
  for (const [categoryId, e] of map) {
    out.push({ categoryId, total: e.total, count: e.count, share: grand > 0 ? e.total / grand : 0 });
  }
  // Include zero-total categories when an explicit id list is given (for charts).
  if (categoryIds) {
    for (const id of categoryIds) {
      if (!map.has(id)) out.push({ categoryId: id, total: 0, count: 0, share: 0 });
    }
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

/** Per-day income/expense flows over [from, to]. */
export function flowsByDay(txns: Transaction[], from: string, to: string): DatedFlow[] {
  const map = new Map<string, { income: number; expense: number }>();
  for (const d of eachDate(from, to)) map.set(d, { income: 0, expense: 0 });
  for (const t of txns) {
    if (!inRange(t.date, from, to)) continue;
    const e = map.get(t.date);
    if (!e) continue;
    if (t.type === 'income') e.income += t.amount;
    else e.expense += t.amount;
  }
  return [...map.entries()].map(([date, v]) => ({ date, income: v.income, expense: v.expense }));
}

/** Last N days of daily expense totals (for the dashboard chart). */
export function lastNDaysExpense(txns: Transaction[], n: number, now = new Date()): DatedFlow[] {
  const to = todayISO(now);
  const from = addDays(to, -(n - 1));
  return flowsByDay(txns, from, to);
}

export interface StatOverview {
  totalExpense: number;
  totalIncome: number;
  txnCount: number;
  avgDailyExpense: number;
  topCategoryId: string | null;
  topCategoryTotal: number;
  days: number;
}

/** High-level stats for a period — powers the statistics screen. */
export function statOverview(txns: Transaction[], from: string, to: string): StatOverview {
  const inPeriod = filterTxns(txns, { from, to });
  const s = summarize(inPeriod);
  const catTotals = totalsByCategory(inPeriod, 'expense');
  const days = Math.max(1, eachDate(from, to).length);
  return {
    totalExpense: s.expense,
    totalIncome: s.income,
    txnCount: inPeriod.length,
    avgDailyExpense: Math.round(s.expense / days),
    topCategoryId: catTotals[0]?.categoryId ?? null,
    topCategoryTotal: catTotals[0]?.total ?? 0,
    days,
  };
}
