/**
 * Budget calculations. A budget applies to the *current* calendar period:
 * weekly budgets cover the current ISO week (Mon-Sun), monthly budgets cover
 * the current calendar month. All pure functions.
 */
import type { Budget, Transaction } from '../model/types';
import { monthEnd, monthStart, todayISO, weekEnd, weekStart } from './dates';
import { filterTxns, summarize } from './finance';

export interface BudgetUsage {
  budget: Budget;
  spent: number;
  remaining: number;
  /** 0..1+ (can exceed 1 when over budget). */
  pct: number;
  from: string;
  to: string;
  over: boolean;
  /** Warning level derived from percentage used. */
  level: 'ok' | 'watch' | 'danger' | 'over';
}

/** Warning thresholds: >=80% watch, >=100% danger, >100% over. */
export const WARN_PCT = 0.8;

export function budgetWindow(budget: Budget, now = new Date()): { from: string; to: string } {
  const t = todayISO(now);
  if (budget.period === 'weekly') return { from: weekStart(t), to: weekEnd(t) };
  return { from: monthStart(t), to: monthEnd(t) };
}

export function budgetUsage(
  budget: Budget,
  txns: Transaction[],
  now = new Date(),
): BudgetUsage {
  const { from, to } = budgetWindow(budget, now);
  const spent = summarize(
    filterTxns(txns, {
      from,
      to,
      type: 'expense',
      ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
    }),
  ).expense;
  const pct = budget.amount > 0 ? spent / budget.amount : 0;
  const remaining = budget.amount - spent;
  const level: BudgetUsage['level'] =
    pct > 1 ? 'over' : pct >= 1 ? 'danger' : pct >= WARN_PCT ? 'watch' : 'ok';
  return { budget, spent, remaining, pct, from, to, over: pct > 1, level };
}

/** True when the budget is at/over the warning threshold (80%). */
export function needsWarning(usage: BudgetUsage): boolean {
  return usage.level !== 'ok';
}

/** Human message for a budget warning, e.g. "You've used 80% of your Food budget." */
export function budgetWarningText(usage: BudgetUsage, label: string): string {
  const pct = Math.round(Math.min(usage.pct, 9.99) * 100);
  if (usage.over) return `You've gone over your ${label} budget.`;
  if (usage.level === 'danger') return `You've used up your ${label} budget.`;
  return `You've used ${pct}% of your ${label} budget.`;
}
