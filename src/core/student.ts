/**
 * Student-focused money intelligence — all deterministic and rule-based,
 * no AI. Every function is pure and built on the centralized accounting
 * layer (src/core/accounting.ts), so the numbers always agree with the
 * rest of the app.
 *
 * Product idea: "Know what you can spend today — and make your money
 * last until your next allowance."
 */
import type { AccountingSummary } from './accounting';
import { totalsByCategory } from './finance';
import { addDays, cmpDate, parseISODate, todayISO, weekEnd, weekStart } from './dates';
import type { Category, RecurringExpense, SavingsGoal, Transaction } from '../model/types';
import { isHistoryTxn } from '../model/types';

/** Whole days from `from` (inclusive) to `to` (exclusive of time). */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ------------------------------------------------------------ safe to spend

export interface SafeSpendInput {
  availableCash: number;
  /** Upcoming necessary expenses (e.g. recurring bills before allowance). */
  upcomingEssentials: number;
  /** User's minimum emergency buffer. */
  emergencyBuffer: number;
  nextAllowanceDate?: string;
  today?: string;
}

export interface SafeSpend {
  /** Amount the student can safely spend today. */
  perDay: number;
  /** Days until the next allowance, or null when none is set. */
  daysLeft: number | null;
  /** Money held back (essentials + buffer). */
  reserved: number;
  availableCash: number;
}

/**
 * Transparent rule:
 *   free = Available Cash − Upcoming essentials − Emergency buffer (floored at 0)
 *   safe/day = free ÷ days until next allowance (or all of `free` today when no date)
 */
export function safeToSpend(input: SafeSpendInput): SafeSpend {
  const today = input.today ?? todayISO();
  const reserved = Math.max(0, Math.round(input.upcomingEssentials) + Math.round(input.emergencyBuffer));
  const free = Math.max(0, input.availableCash - reserved);
  if (!input.nextAllowanceDate) {
    return { perDay: free, daysLeft: null, reserved, availableCash: input.availableCash };
  }
  const daysLeft = Math.max(1, daysBetween(today, input.nextAllowanceDate));
  return { perDay: Math.floor(free / daysLeft), daysLeft, reserved, availableCash: input.availableCash };
}

/** Sum of enabled recurring expenses due on or before `untilISO`. */
export function upcomingEssentials(recurring: RecurringExpense[], untilISO: string): number {
  let total = 0;
  for (const r of recurring) {
    if (!r.enabled) continue;
    if (cmpDate(r.nextOccurrence, untilISO) <= 0) total += r.amount;
  }
  return total;
}

// ------------------------------------------------------------------ status

export type MoneyStatusLevel = 'on-track' | 'watch' | 'slow-down';

export interface MoneyStatus {
  level: MoneyStatusLevel;
  title: string;
  text: string;
}

/**
 * Rule-based status from actual spending pace vs the safe daily amount.
 * Friendly, never judgmental.
 */
export function moneyStatus(avgDailySpend: number, safePerDay: number): MoneyStatus {
  if (safePerDay <= 0) {
    return avgDailySpend <= 0
      ? { level: 'on-track', title: 'On track', text: 'No spending pressure right now.' }
      : { level: 'watch', title: 'Watch your spending', text: 'Money is tight — small purchases only for now.' };
  }
  const ratio = avgDailySpend / safePerDay;
  if (ratio <= 1) {
    return { level: 'on-track', title: 'On track', text: "You're on track until your next allowance." };
  }
  if (ratio <= 1.25) {
    return { level: 'watch', title: 'Watch your spending', text: 'Your daily spending is running a little higher than your safe amount.' };
  }
  return { level: 'slow-down', title: 'Slow down', text: 'At your current pace, your money may run out before your next allowance.' };
}

/** Average expense per day over the last `days` days (history txns only). */
export function avgDailySpend(txns: Transaction[], days: number, today = todayISO()): number {
  const from = addDays(today, -(days - 1));
  let total = 0;
  for (const t of txns) {
    if (!isHistoryTxn(t) || t.type !== 'expense') continue;
    if (cmpDate(t.date, from) >= 0 && cmpDate(t.date, today) <= 0) total += t.amount;
  }
  return total / days;
}

// ------------------------------------------------------------ no-spend days

/** Default essential category ids (also used as fallback for old data). */
const ESSENTIAL_CATEGORY_IDS = new Set([
  'cat-food', 'cat-transport', 'cat-education', 'cat-mobile',
  'cat-hostel', 'cat-bills', 'cat-health',
]);

export function isEssentialCategory(c: Pick<Category, 'id' | 'essential'>): boolean {
  return c.essential ?? ESSENTIAL_CATEGORY_IDS.has(c.id);
}

function isDiscretionaryExpense(t: Transaction, essentialIds: Set<string>): boolean {
  return t.type === 'expense' && !essentialIds.has(t.categoryId);
}

/**
 * Consecutive days ending today with no discretionary expenses.
 * Essentials (food, transport, education…) never break the streak and are
 * never framed negatively.
 */
export function noSpendStreak(
  txns: Transaction[],
  categories: Category[],
  today = todayISO(),
): number {
  const essentialIds = new Set(categories.filter(isEssentialCategory).map((c) => c.id));
  const discretionaryDays = new Set<string>();
  for (const t of txns) {
    if (isDiscretionaryExpense(t, essentialIds) && cmpDate(t.date, today) <= 0) {
      discretionaryDays.add(t.date);
    }
  }
  let streak = 0;
  let day = today;
  for (let i = 0; i < 365; i++) {
    if (discretionaryDays.has(day)) break;
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/** Number of no-discretionary-spend days within [from, to]. */
export function noSpendDaysInRange(
  txns: Transaction[],
  categories: Category[],
  from: string,
  to: string,
): number {
  const essentialIds = new Set(categories.filter(isEssentialCategory).map((c) => c.id));
  const bad = new Set<string>();
  for (const t of txns) {
    if (isDiscretionaryExpense(t, essentialIds) && cmpDate(t.date, from) >= 0 && cmpDate(t.date, to) <= 0) {
      bad.add(t.date);
    }
  }
  let count = 0;
  let day = from;
  for (let i = 0; i < 400 && cmpDate(day, to) <= 0; i++) {
    if (!bad.has(day)) count++;
    day = addDays(day, 1);
  }
  return count;
}

// ---------------------------------------------------------- weekly summary

export interface WeeklySummary {
  from: string;
  to: string;
  spent: number;
  /** Income + gifts + borrowed received this week. */
  received: number;
  saved: number;
  biggestCategory: string | null;
  biggestCategoryAmount: number;
  spentLastWeek: number;
  noSpendDays: number;
  topCategories: Array<{ name: string; amount: number }>;
}

export function weeklySummary(
  txns: Transaction[],
  categoryName: (id: string) => string,
  categories: Category[],
  now = new Date(),
): WeeklySummary {
  const today = todayISO(now);
  const from = weekStart(today);
  const to = weekEnd(today);
  const lastFrom = weekStart(addDays(from, -7));
  const lastTo = weekEnd(addDays(from, -7));
  const hist = txns.filter(isHistoryTxn);
  const inWeek = hist.filter((t) => cmpDate(t.date, from) >= 0 && cmpDate(t.date, to) <= 0);
  let spent = 0;
  let received = 0;
  for (const t of inWeek) {
    if (t.type === 'expense') spent += t.amount;
    else if (t.type === 'income' || t.type === 'gift_received' || t.type === 'borrowed') received += t.amount;
  }
  let spentLastWeek = 0;
  for (const t of hist) {
    if (t.type === 'expense' && cmpDate(t.date, lastFrom) >= 0 && cmpDate(t.date, lastTo) <= 0) {
      spentLastWeek += t.amount;
    }
  }
  const byCat = totalsByCategory(inWeek, 'expense')
    .map((c) => ({ name: categoryName(c.categoryId), amount: c.total }))
    .sort((a, b) => b.amount - a.amount);
  return {
    from,
    to,
    spent,
    received,
    saved: received - spent,
    biggestCategory: byCat[0]?.name ?? null,
    biggestCategoryAmount: byCat[0]?.amount ?? 0,
    spentLastWeek,
    noSpendDays: noSpendDaysInRange(txns, categories, from, today < to ? today : to),
    topCategories: byCat.slice(0, 5),
  };
}

// ---------------------------------------------------------- can I afford it

export type AffordVerdict = 'affordable' | 'tight' | 'wait';

export interface AffordResult {
  verdict: AffordVerdict;
  text: string;
}

/**
 * Compares a planned purchase against the student's own numbers.
 * Plain calculation — not financial advice.
 */
export function canAfford(
  priceMinor: number,
  safePerDay: number,
  availableCash: number,
  reserved: number,
  daysLeft: number | null,
  format: (minor: number) => string,
): AffordResult {
  if (priceMinor <= safePerDay) {
    return { verdict: 'affordable', text: 'Looks affordable — it fits inside your safe daily amount.' };
  }
  const leftAfter = availableCash - reserved - priceMinor;
  if (leftAfter >= 0) {
    const horizon = daysLeft ? ` for the next ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : '';
    return {
      verdict: 'tight',
      text: `Better wait — this would leave you with ${format(leftAfter)}${horizon}.`,
    };
  }
  return { verdict: 'wait', text: 'Better wait — this costs more than you can safely spend right now.' };
}

// --------------------------------------------------------------- milestones

export interface Milestone {
  id: string;
  title: string;
  achieved: boolean;
}

/** Small, useful milestones — rewarding consistency, never childish. */
export function milestones(
  txns: Transaction[],
  goals: SavingsGoal[],
  acct: AccountingSummary,
): Milestone[] {
  const hist = txns.filter(isHistoryTxn);
  const expenseCount = hist.filter((t) => t.type === 'expense').length;
  const distinctDays = new Set(hist.map((t) => t.date)).size;
  const goalDone = goals.some((g) => g.currentAmount >= g.targetAmount && g.targetAmount > 0);
  return [
    { id: 'save-1k', title: 'First Rs1,000 kept', achieved: acct.availableCash >= 100000 },
    { id: 'track-7', title: '7 days tracked', achieved: distinctDays >= 7 },
    { id: 'goal-done', title: 'First savings goal completed', achieved: goalDone },
    { id: 'exp-10', title: '10 expenses recorded', achieved: expenseCount >= 10 },
  ];
}

// ------------------------------------------------------- goal weekly needed

/** "Save RsX/week to reach your goal" — null when no target date. */
export function goalWeeklyNeeded(goal: SavingsGoal, today = todayISO()): number | null {
  if (!goal.targetDate) return null;
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return null;
  const days = Math.max(1, daysBetween(today, goal.targetDate));
  const weeks = Math.max(1, Math.ceil(days / 7));
  return Math.ceil(remaining / weeks);
}

// -------------------------------------------------------------- money map

export interface CashComposition {
  /** Opening balance + income: money earned / already had. */
  earned: number;
  gifts: number;
  borrowed: number;
  /** Debt owed, shown separately. */
  owed: number;
}

/** Simple visual breakdown of what the available cash is made of. */
export function cashComposition(acct: AccountingSummary): CashComposition {
  return {
    earned: acct.openingBalance + acct.income,
    gifts: acct.gifts,
    borrowed: acct.borrowed,
    owed: acct.outstandingDebt,
  };
}

// ------------------------------------------------------------ brand phrases

export const BRAND_LINE = 'Know what you can spend today.';
export const AFFORD_DISCLAIMER = 'Just math from your own data — not financial advice.';
