/**
 * Unit tests for the financial core. These are pure functions with no
 * DOM or storage dependencies — the reliability of every money figure
 * in the app rests on them.
 */
import { describe, expect, it } from 'vitest';
import type { BackupData, Budget, Category, SavingsGoal, Transaction } from '../src/model/types';
import { parseAmount, formatMoney, formatSigned, sumMinor, amountErrorMessage } from '../src/core/money';
import {
  addDays, addMonths, eachDate, friendlyDate, inRange, isValidISODate,
  monthEnd, monthStart, parseISODate, toISODate, todayISO, weekEnd, weekStart,
} from '../src/core/dates';
import {
  budgetUsage, budgetWarningText, budgetWindow, needsWarning,
} from '../src/core/budgets';
import { buildInsights } from '../src/core/insights';
import { dueOccurrences, nextDate, occurrencesBetween } from '../src/core/recurring';
import {
  dashboardStats, filterTxns, flowsByDay, lastNDaysExpense, statOverview,
  summarize, totalsByCategory,
} from '../src/core/finance';
import {
  fromBackupJSON, toBackupJSON, transactionsFromCSV, transactionsToCSV,
} from '../src/core/export';

// ---------------------------------------------------------------- helpers

let seq = 0;
function txn(partial: Partial<Transaction> & { date: string; amount: number; type: 'expense' | 'income' }): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    categoryId: 'cat-food',
    createdAt: seq,
    updatedAt: seq,
    ...partial,
  };
}

function cat(id: string, name: string, kind: 'expense' | 'income' = 'expense'): Category {
  return { id, name, icon: 'other', kind, isDefault: true, createdAt: 1 };
}

const catName = (id: string) =>
  ({ 'cat-food': 'Food', 'cat-transport': 'Transport', 'cat-pocket': 'Pocket Money' }[id] ?? 'Unknown');

// ---------------------------------------------------------------- money

describe('parseAmount', () => {
  it('parses plain and decorated amounts', () => {
    expect(parseAmount('250')).toEqual({ ok: true, minor: 25000 });
    expect(parseAmount('₨ 1,250.50')).toEqual({ ok: true, minor: 125050 });
    expect(parseAmount('99.9')).toEqual({ ok: true, minor: 9990 });
    expect(parseAmount('  42 ')).toEqual({ ok: true, minor: 4200 });
  });
  it('rejects empty input', () => {
    expect(parseAmount('').error).toBe('empty');
    expect(parseAmount('   ').error).toBe('empty');
  });
  it('rejects garbage and negatives', () => {
    expect(parseAmount('abc').error).toBe('invalid');
    expect(parseAmount('-50').error).toBe('non-positive');
  });
  it('rejects zero and too many decimals', () => {
    expect(parseAmount('0').error).toBe('non-positive');
    expect(parseAmount('1.234').error).toBe('too-many-decimals');
  });
  it('rejects absurdly large amounts', () => {
    expect(parseAmount('99999999999999').error).toBe('too-large');
  });
  it('has a message for every error', () => {
    for (const e of ['empty', 'invalid', 'non-positive', 'too-many-decimals', 'too-large'] as const) {
      expect(amountErrorMessage({ ok: false, minor: 0, error: e }).length).toBeGreaterThan(0);
    }
  });
});

describe('formatMoney', () => {
  it('formats whole and fractional amounts', () => {
    expect(formatMoney(125000)).toBe('₨1,250');
    expect(formatMoney(125050)).toBe('₨1,250.50');
    expect(formatMoney(0)).toBe('₨0');
    expect(formatMoney(-25000)).toBe('-₨250');
  });
  it('formats signed values', () => {
    expect(formatSigned(50000)).toBe('+₨500');
    expect(formatSigned(-25000)).toBe('-₨250');
    expect(formatSigned(0)).toBe('₨0');
  });
  it('sums safely', () => {
    expect(sumMinor([100, 200, -50])).toBe(250);
  });
});

// ---------------------------------------------------------------- dates

describe('dates', () => {
  it('round-trips ISO dates', () => {
    expect(toISODate(new Date(2026, 9, 7))).toBe('2026-10-07');
    expect(parseISODate('2026-10-07')?.getDate()).toBe(7);
  });
  it('rejects impossible dates', () => {
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('not-a-date')).toBe(false);
    expect(isValidISODate('2026-10-07')).toBe(true);
  });
  it('adds days and months with clamping', () => {
    expect(addDays('2026-10-07', 3)).toBe('2026-10-10');
    expect(addDays('2026-10-07', -7)).toBe('2026-09-30');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); // clamped
    expect(addMonths('2026-10-07', 1)).toBe('2026-11-07');
  });
  it('computes week and month windows (Monday-first weeks)', () => {
    // 2026-10-07 is a Wednesday
    expect(weekStart('2026-10-07')).toBe('2026-10-05');
    expect(weekEnd('2026-10-07')).toBe('2026-10-11');
    expect(monthStart('2026-10-07')).toBe('2026-10-01');
    expect(monthEnd('2026-10-07')).toBe('2026-10-31');
    expect(monthEnd('2026-02-15')).toBe('2026-02-28');
  });
  it('labels friendly dates', () => {
    const now = new Date(2026, 9, 7);
    expect(friendlyDate('2026-10-07', now)).toBe('Today');
    expect(friendlyDate('2026-10-06', now)).toBe('Yesterday');
    expect(friendlyDate('2026-10-08', now)).toBe('Tomorrow');
    expect(friendlyDate('2026-09-01', now)).toContain('Sep');
  });
  it('ranges and enumerates dates', () => {
    expect(inRange('2026-10-07', '2026-10-01', '2026-10-31')).toBe(true);
    expect(inRange('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false);
    expect(eachDate('2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(todayISO(new Date(2026, 9, 7))).toBe('2026-10-07');
  });
});

// ---------------------------------------------------------------- finance

const sample: Transaction[] = [
  txn({ type: 'income', amount: 1000000, date: '2026-10-01', categoryId: 'cat-pocket' }),
  txn({ type: 'expense', amount: 25000, date: '2026-10-07', categoryId: 'cat-food' }),
  txn({ type: 'expense', amount: 50000, date: '2026-10-06', categoryId: 'cat-transport' }),
  txn({ type: 'expense', amount: 10000, date: '2026-09-20', categoryId: 'cat-food' }),
];

describe('finance', () => {
  it('summarizes income/expense/balance', () => {
    const s = summarize(sample);
    expect(s.income).toBe(1000000);
    expect(s.expense).toBe(85000);
    expect(s.balance).toBe(915000);
    expect(s.count).toBe(4);
  });
  it('filters by type, category, and range', () => {
    expect(filterTxns(sample, { type: 'expense' })).toHaveLength(3);
    expect(filterTxns(sample, { categoryId: 'cat-food' })).toHaveLength(2);
    expect(filterTxns(sample, { from: '2026-10-01', to: '2026-10-31' })).toHaveLength(3);
  });
  it('builds dashboard stats', () => {
    const now = new Date(2026, 9, 7, 12);
    const d = dashboardStats(sample, now);
    expect(d.totalIncome).toBe(1000000);
    expect(d.totalExpense).toBe(85000);
    expect(d.balance).toBe(915000);
    expect(d.today.expense).toBe(25000);
    expect(d.week.expense).toBe(75000); // Mon 10-05 .. Sun 10-11
    expect(d.month.expense).toBe(75000);
  });
  it('totals by category sorted with shares', () => {
    const totals = totalsByCategory(sample, 'expense');
    expect(totals[0].categoryId).toBe('cat-transport');
    expect(totals[0].total).toBe(50000);
    expect(totals[1].share).toBeCloseTo(35000 / 85000);
  });
  it('builds daily flows and last-N-days', () => {
    const flows = flowsByDay(sample, '2026-10-05', '2026-10-07');
    expect(flows).toHaveLength(3);
    expect(flows[2]).toEqual({ date: '2026-10-07', income: 0, expense: 25000 });
    const last = lastNDaysExpense(sample, 7, new Date(2026, 9, 7, 12));
    expect(last).toHaveLength(7);
    expect(last[6].expense).toBe(25000);
  });
  it('computes stat overview', () => {
    const o = statOverview(sample, '2026-10-01', '2026-10-31');
    expect(o.totalExpense).toBe(75000);
    expect(o.txnCount).toBe(3);
    expect(o.topCategoryId).toBe('cat-transport');
    expect(o.avgDailyExpense).toBe(Math.round(75000 / 31));
  });
});

// ---------------------------------------------------------------- budgets

function budget(partial: Partial<Budget> = {}): Budget {
  return { id: 'b1', name: 'Monthly budget', amount: 100000, period: 'monthly', createdAt: 1, ...partial };
}

describe('budgets', () => {
  const now = new Date(2026, 9, 7, 12);
  it('uses calendar windows', () => {
    expect(budgetWindow(budget({ period: 'monthly' }), now)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(budgetWindow(budget({ period: 'weekly' }), now)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });
  it('computes usage levels', () => {
    const txns = [txn({ type: 'expense', amount: 85000, date: '2026-10-07' })];
    const u = budgetUsage(budget(), txns, now);
    expect(u.spent).toBe(85000);
    expect(u.remaining).toBe(15000);
    expect(u.pct).toBeCloseTo(0.85);
    expect(u.level).toBe('watch');
    expect(needsWarning(u)).toBe(true);
  });
  it('flags danger and over', () => {
    const mk = (amt: number) => budgetUsage(budget(), [txn({ type: 'expense', amount: amt, date: '2026-10-07' })], now);
    expect(mk(50000).level).toBe('ok');
    expect(mk(100000).level).toBe('danger');
    const over = mk(120000);
    expect(over.level).toBe('over');
    expect(over.over).toBe(true);
  });
  it('scopes category budgets to their category', () => {
    const b = budget({ categoryId: 'cat-food' });
    const u = budgetUsage(b, sample, now);
    expect(u.spent).toBe(25000); // only food in October
  });
  it('writes friendly warning text', () => {
    const u = budgetUsage(budget({ name: 'Food', categoryId: 'cat-food' }), [txn({ type: 'expense', amount: 80000, date: '2026-10-07' })], now);
    expect(budgetWarningText(u, 'Food')).toBe("You've used 80% of your Food budget.");
  });
});

// ---------------------------------------------------------------- insights

describe('insights (rule-based, no AI)', () => {
  const now = new Date(2026, 9, 7, 12);
  it('flags a dominant spending category', () => {
    const txns = [
      txn({ type: 'expense', amount: 80000, date: '2026-10-05', categoryId: 'cat-food' }),
      txn({ type: 'expense', amount: 10000, date: '2026-10-06', categoryId: 'cat-transport' }),
    ];
    const out = buildInsights({ txns, budgets: [], goals: [], categoryName: catName, now });
    expect(out.some((i) => i.text.includes('Food is your biggest spending category'))).toBe(true);
  });
  it('warns when close to a budget', () => {
    const txns = [txn({ type: 'expense', amount: 85000, date: '2026-10-05' })];
    const out = buildInsights({ txns, budgets: [budget()], goals: [], categoryName: catName, now });
    expect(out.some((i) => i.text.includes('85% of your Monthly budget'))).toBe(true);
  });
  it('praises reduced weekly spending', () => {
    const txns = [
      txn({ type: 'expense', amount: 50000, date: '2026-09-29', categoryId: 'cat-food' }), // last week
      txn({ type: 'expense', amount: 10000, date: '2026-10-06', categoryId: 'cat-food' }), // this week
    ];
    const out = buildInsights({ txns, budgets: [], goals: [], categoryName: catName, now });
    expect(out.some((i) => i.text.includes('spent less this week'))).toBe(true);
  });
  it('cheers near-complete savings goals', () => {
    const goals: SavingsGoal[] = [{ id: 'g1', name: 'Headphones', targetAmount: 800000, currentAmount: 700000, createdAt: 1 }];
    const out = buildInsights({ txns: sample, budgets: [], goals, categoryName: catName, now });
    expect(out.some((i) => i.text.includes('Headphones'))).toBe(true);
  });
});

// ---------------------------------------------------------------- recurring

describe('recurring', () => {
  it('advances dates per frequency', () => {
    expect(nextDate('2026-10-07', 'daily')).toBe('2026-10-08');
    expect(nextDate('2026-10-07', 'weekly')).toBe('2026-10-14');
    expect(nextDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('lists occurrences in a range', () => {
    expect(occurrencesBetween('2026-10-01', '2026-10-03', 'daily')).toHaveLength(3);
    expect(occurrencesBetween('2026-10-01', '2026-10-31', 'weekly')).toHaveLength(5);
  });
  const rule = (over: Partial<import('../src/model/types').RecurringExpense> = {}) => ({
    id: 'r1', amount: 10000, categoryId: 'cat-mobile', frequency: 'monthly' as const,
    nextOccurrence: '2026-10-01', enabled: true, createdAt: 1, ...over,
  });
  it('generates due occurrences idempotently', () => {
    const first = dueOccurrences(rule(), '2026-10-07');
    expect(first.dates).toEqual(['2026-10-01']);
    expect(first.nextOccurrence).toBe('2026-11-01');
    // Second run with persisted state generates nothing new.
    const second = dueOccurrences(rule({ lastGenerated: first.lastGenerated, nextOccurrence: first.nextOccurrence }), '2026-10-07');
    expect(second.dates).toEqual([]);
  });
  it('skips disabled rules and caps backfill', () => {
    expect(dueOccurrences(rule({ enabled: false }), '2026-10-07').dates).toEqual([]);
    const old = dueOccurrences(rule({ frequency: 'daily', nextOccurrence: '2025-01-01' }), '2026-10-07');
    expect(old.dates.length).toBeLessThanOrEqual(60);
    expect(old.dates[old.dates.length - 1]).toBe('2026-10-07');
  });
});

// ---------------------------------------------------------------- export

describe('export/import', () => {
  const cats = [cat('cat-food', 'Food'), cat('cat-pocket', 'Pocket Money', 'income')];
  const txns = [
    txn({ type: 'expense', amount: 25000, date: '2026-10-07', categoryId: 'cat-food', note: 'Lunch, with "friends"' }),
    txn({ type: 'income', amount: 1000000, date: '2026-10-01', categoryId: 'cat-pocket' }),
  ];
  it('writes the documented CSV shape', () => {
    const csv = transactionsToCSV(txns, catName);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Type,Category,Amount,Note,PaymentMethod');
    expect(lines[1]).toContain('2026-10-01,income,Pocket Money,10000.00');
    expect(lines[2]).toContain('"Lunch, with ""friends"""'); // quoting works
  });
  it('round-trips CSV and skips bad rows', () => {
    const csv = transactionsToCSV(txns, catName) + '\n2026-13-99,expense,Food,10,\n2026-10-08,expense,Food,abc,';
    const { transactions, result } = transactionsFromCSV(csv, cats);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(2);
    expect(transactions[0].amount).toBe(1000000);
  });
  it('validates JSON backups', () => {
    const good = toBackupJSON({
      version: 1, exportedAt: 1, transactions: txns, categories: cats,
      budgets: [], goals: [], recurring: [],
      settings: { name: 'A', currency: 'PKR', theme: 'light', notificationsEnabled: false, onboardingDone: true },
    } as BackupData);
    const parsed = fromBackupJSON(good);
    expect(parsed?.transactions).toHaveLength(2);
    expect(fromBackupJSON('not json')).toBeNull();
    // Invalid transactions are dropped, rest of backup survives.
    const mixed = JSON.parse(good) as BackupData;
    (mixed.transactions as unknown[]).push({ id: 'bad', type: 'expense', amount: -5, categoryId: 'x', date: '2026-10-07' });
    expect(fromBackupJSON(JSON.stringify(mixed))?.transactions).toHaveLength(2);
  });
});
