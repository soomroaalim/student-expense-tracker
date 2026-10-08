/**
 * Rule-based budgeting suggestions for students.
 *
 * IMPORTANT: these are plain conditional rules — no AI, no network calls.
 * Each rule inspects computed totals and returns a short friendly message.
 */
import type { Budget, SavingsGoal, Transaction } from '../model/types';
import { addDays, monthEnd, monthStart, todayISO, weekEnd, weekStart } from './dates';
import { allowanceInfo, filterTxns, summarize, totalsByCategory } from './finance';
import { budgetUsage } from './budgets';
import { formatMoney } from './money';

export type InsightLevel = 'tip' | 'warning' | 'praise';

export interface Insight {
  level: InsightLevel;
  icon: string;
  text: string;
}

export interface InsightInput {
  txns: Transaction[];
  budgets: Budget[];
  goals: SavingsGoal[];
  categoryName: (id: string) => string;
  now?: Date;
  /** Current balance in minor units (for allowance pacing). */
  balance?: number;
  /** Outstanding debt in minor units (for debt insight). */
  outstandingDebt?: number;
  /** ISO currency code for formatting. */
  currency?: string;
  /** Next allowance ISO date (optional). */
  nextAllowanceDate?: string;
}

/** Evaluate all rules and return the insights worth showing (newest context first). */
export function buildInsights(input: InsightInput): Insight[] {
  const { txns, budgets, categoryName } = input;
  const now = input.now ?? new Date();
  const today = todayISO(now);
  const insights: Insight[] = [];

  const monthTxns = filterTxns(txns, { from: monthStart(today), to: monthEnd(today) });
  const monthExpense = summarize(monthTxns).expense;

  // Rule 1: biggest spending category this month (> 40% of spending).
  if (monthExpense > 0) {
    const cats = totalsByCategory(monthTxns, 'expense');
    const top = cats[0];
    if (top && top.share > 0.4) {
      insights.push({
        level: 'tip',
        icon: 'chart',
        text: `${categoryName(top.categoryId)} is your biggest spending category this month (${Math.round(top.share * 100)}% of spending).`,
      });
    }
  }

  // Rule 2: close to / over any budget.
  for (const b of budgets) {
    const usage = budgetUsage(b, txns, now);
    if (usage.level === 'watch' || usage.level === 'danger') {
      const label = b.categoryId ? categoryName(b.categoryId) : b.name;
      insights.push({
        level: 'warning',
        icon: 'alert',
        text: usage.level === 'danger'
          ? `You've used up your ${label} budget.`
          : `You've used ${Math.round(usage.pct * 100)}% of your ${label} budget.`,
      });
    } else if (usage.level === 'over') {
      const label = b.categoryId ? categoryName(b.categoryId) : b.name;
      insights.push({ level: 'warning', icon: 'alert', text: `You've gone over your ${label} budget.` });
    }
  }

  // Rule 3: spending trend — this week vs last week.
  const thisWeek = summarize(filterTxns(txns, { from: weekStart(today), to: weekEnd(today) })).expense;
  const lastWeekStart = weekStart(addDays(today, -7));
  const lastWeek = summarize(filterTxns(txns, { from: lastWeekStart, to: weekEnd(lastWeekStart) })).expense;
  if (lastWeek > 0 && thisWeek < lastWeek * 0.8) {
    insights.push({
      level: 'praise',
      icon: 'trend-down',
      text: `You've spent less this week than last week. Nice going!`,
    });
  } else if (lastWeek > 0 && thisWeek > lastWeek * 1.5 && thisWeek > 0) {
    insights.push({
      level: 'tip',
      icon: 'trend-up',
      text: `Spending is up this week compared to last week.`,
    });
  }

  // Rule 4: savings goal progress — close to finishing (>= 75%).
  for (const g of input.goals) {
    if (g.targetAmount > 0 && g.currentAmount >= g.targetAmount * 0.75 && g.currentAmount < g.targetAmount) {
      insights.push({
        level: 'praise',
        icon: 'target',
        text: `You're almost there on "${g.name}" — ${Math.round((g.currentAmount / g.targetAmount) * 100)}% saved!`,
      });
    }
  }

  // Rule 5: no spending recorded today yet (gentle nudge, only if user has history).
  if (txns.length > 0) {
    const todayCount = filterTxns(txns, { from: today, to: today }).length;
    if (todayCount === 0 && new Date().getHours() >= 18) {
      insights.push({
        level: 'tip',
        icon: 'pencil',
        text: `No spending logged today yet. Add today's expenses to keep your budget on track.`,
      });
    }
  }

  // Rule 6: daily average vs remaining month budget (simple pacing check).
  const monthlyBudget = budgets.find((b) => !b.categoryId && b.period === 'monthly');
  if (monthlyBudget && monthlyBudget.amount > 0) {
    const usage = budgetUsage(monthlyBudget, txns, now);
    if (!usage.over && usage.remaining > 0) {
      insights.push({
        level: 'tip',
        icon: 'wallet',
        text: `You have ${formatShort(usage.remaining)} left in your monthly budget.`,
      });
    }
  }

  // Rule 7: allowance pacing — safe daily spending until next allowance.
  if (input.balance !== undefined && input.nextAllowanceDate) {
    const info = allowanceInfo(input.balance, input.nextAllowanceDate, today);
    if (info) {
      const cur = input.currency ?? 'PKR';
      insights.push({
        level: 'tip',
        icon: 'calendar',
        text: `${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'} until your allowance — about ${formatMoney(info.dailyAmount, cur)} per day is safe.`,
      });
    }
  }

  // Rule 8: spending up sharply vs last week (percentage).
  if (lastWeek > 0 && thisWeek > lastWeek) {
    const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    if (pct >= 25) {
      insights.push({
        level: 'tip',
        icon: 'trend-up',
        text: `You've spent ${pct}% more than last week.`,
      });
    }
  }

  // Rule 9: outstanding debt reminder.
  if (input.outstandingDebt !== undefined && input.outstandingDebt > 0) {
    const cur = input.currency ?? 'PKR';
    insights.push({
      level: 'warning',
      icon: 'alert',
      text: `You owe ${formatMoney(input.outstandingDebt, cur)}. Repay from the Debt section when you can.`,
    });
  }

  return insights.slice(0, 6);
}

/** Compact money text for insights without needing a currency import cycle. */
function formatShort(minor: number): string {
  const v = minor / 100;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
}
