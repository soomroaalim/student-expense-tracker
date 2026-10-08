/**
 * Central financial calculations. All functions are pure:
 * they take plain data and return plain results, which makes
 * them easy to unit-test and keeps UI code thin.
 */
import type { DatedFlow, Transaction, TxnType } from '../model/types';
import { isHistoryTxn } from '../model/types';
import {
  addDays, cmpDate, eachDate, inRange, monthEnd, monthStart, todayISO,
  weekEnd, weekStart,
} from './dates';
import { sumMinor } from './money';
import { accountingSummary, periodNet, type AccountingSummary } from './accounting';

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

export interface TxnViewFilters {
  q: string;
  type: 'all' | TxnType;
  categoryId: string;
  from: string;
  to: string;
}

/**
 * Full transaction-view filter: type + category + date range + text search
 * over note/payment method/category name. Pure — safe for tests.
 */
export function filterTransactions(
  txns: Transaction[],
  categoryName: (id: string) => string,
  f: TxnViewFilters,
): Transaction[] {
  const needle = f.q.trim().toLowerCase();
  const out = txns.filter((t) => {
    // Opening balance is account setup — never shown in history.
    if (!isHistoryTxn(t)) return false;
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.categoryId !== '' && t.categoryId !== f.categoryId) return false;
    if (f.from !== '' && cmpDate(t.date, f.from) < 0) return false;
    if (f.to !== '' && cmpDate(t.date, f.to) > 0) return false;
    if (needle) {
      const hay = [t.note ?? '', t.paymentMethod ?? '', categoryName(t.categoryId)].join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  out.sort((a, b) => cmpDate(b.date, a.date) || b.createdAt - a.createdAt);
  return out;
}

/** Sum income/expense over a (possibly filtered) set of transactions.
 * Only actual INCOME counts as income and only EXPENSE counts as expense;
 * gifts, borrowed, repayments, and opening balance are ignored here
 * (use accountingSummary for the full picture). */
export function summarize(txns: Transaction[]): Summary {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  income = sumMinor([income]);
  expense = sumMinor([expense]);
  return { income, expense, balance: income - expense, count: txns.length };
}

export interface DashboardStats extends AccountingSummary {
  /** Net money movement today (excludes opening balance). */
  todayNet: number;
  /** Net money movement this week (excludes opening balance). */
  weekNet: number;
  /** Net money movement this month (excludes opening balance). */
  monthNet: number;
}

/** Everything the home dashboard needs, computed from all transactions. */
export function dashboardStats(txns: Transaction[], now = new Date()): DashboardStats {
  const today = todayISO(now);
  const acct = accountingSummary(txns);
  return {
    ...acct,
    todayNet: periodNet(filterTxns(txns, { from: today, to: today })),
    weekNet: periodNet(filterTxns(txns, { from: weekStart(today), to: weekEnd(today) })),
    monthNet: periodNet(filterTxns(txns, { from: monthStart(today), to: monthEnd(today) })),
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

export interface AllowanceInfo {
  /** Whole days until the allowance date (>= 0). */
  daysLeft: number;
  /** Safe spending per day in minor units (integer division). */
  dailyAmount: number;
  /** The allowance date itself. */
  date: string;
}

/**
 * Student "safe daily spending": remaining balance spread over the days
 * until the next allowance. Pure integer math — no floating point.
 * Returns null when there is no usable allowance date or balance <= 0.
 */
export function allowanceInfo(
  balanceMinor: number,
  nextAllowanceDate: string | undefined,
  today: string,
): AllowanceInfo | null {
  if (!nextAllowanceDate || !isValidISODateSafe(nextAllowanceDate)) return null;
  if (balanceMinor <= 0) return null;
  const daysLeft = diffDays(today, nextAllowanceDate);
  if (daysLeft <= 0) return null;
  return {
    daysLeft,
    dailyAmount: Math.floor(balanceMinor / daysLeft),
    date: nextAllowanceDate,
  };
}

function isValidISODateSafe(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00'));
}

/** Whole-day difference: positive when `to` is after `from`. */
function diffDays(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}
