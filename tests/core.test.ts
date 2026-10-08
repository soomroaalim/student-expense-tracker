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
function txn(partial: Partial<Transaction> & { date: string; amount: number; type: import('../src/model/types').TxnType }): Transaction {
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
    expect(d.income).toBe(1000000);
    expect(d.expense).toBe(85000);
    expect(d.availableCash).toBe(915000);
    // Net movement excludes nothing here (all are income/expense).
    expect(d.todayNet).toBe(-25000);
    expect(d.weekNet).toBe(-75000); // Mon 10-05 .. Sun 10-11
    expect(d.monthNet).toBe(925000); // October: +1000000 -75000
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

// ---------------------------------------------------------------- transaction view filters

import { allowanceInfo, filterTransactions } from '../src/core/finance';

describe('transaction view filters (All/Expense/Income)', () => {
  const food = cat('cat-food', 'Food');
  const salary = cat('cat-salary', 'Salary', 'income');
  const catMap = new Map([[food.id, food], [salary.id, salary]]);
  const categoryName = (id: string) => catMap.get(id)?.name ?? 'Unknown category';
  const txns: Transaction[] = [
    txn({ date: '2026-10-01', amount: 50000, type: 'expense', categoryId: 'cat-food', note: 'Lunch' }),
    txn({ date: '2026-10-03', amount: 150000, type: 'income', categoryId: 'cat-salary', note: 'Allowance' }),
    txn({ date: '2026-10-05', amount: 20000, type: 'expense', categoryId: 'cat-food', note: 'Snacks' }),
  ];
  const base = { q: '', type: 'all' as const, categoryId: '', from: '', to: '' };

  it('All shows both income and expense', () => {
    expect(filterTransactions(txns, categoryName, base)).toHaveLength(3);
  });
  it('Expense shows only expenses', () => {
    const out = filterTransactions(txns, categoryName, { ...base, type: 'expense' });
    expect(out).toHaveLength(2);
    expect(out.every((t) => t.type === 'expense')).toBe(true);
  });
  it('Income shows only income', () => {
    const out = filterTransactions(txns, categoryName, { ...base, type: 'income' });
    expect(out).toHaveLength(1);
    expect(out[0].note).toBe('Allowance');
  });
  it('combines type + category + date range', () => {
    const out = filterTransactions(txns, categoryName, {
      ...base, type: 'expense', categoryId: 'cat-food', from: '2026-10-01', to: '2026-10-02',
    });
    expect(out).toHaveLength(1);
    expect(out[0].note).toBe('Lunch');
  });
  it('search matches notes and category names', () => {
    expect(filterTransactions(txns, categoryName, { ...base, q: 'lunch' })).toHaveLength(1);
    expect(filterTransactions(txns, categoryName, { ...base, q: 'salary' })).toHaveLength(1);
    expect(filterTransactions(txns, categoryName, { ...base, q: 'zzz' })).toHaveLength(0);
  });
  it('empty filters return everything', () => {
    expect(filterTransactions(txns, categoryName, base)).toHaveLength(3);
  });
});

describe('balance math (integer minor units, no floats)', () => {
  it('income 1500 - expense 500 = balance 1000', () => {
    const txns = [
      txn({ date: '2026-10-01', amount: 150000, type: 'income' }),
      txn({ date: '2026-10-02', amount: 50000, type: 'expense' }),
    ];
    const s = summarize(txns);
    expect(s.income).toBe(150000);
    expect(s.expense).toBe(50000);
    expect(s.balance).toBe(100000);
    expect(formatMoney(s.balance, 'PKR')).toBe('₨1,000');
  });
  it('keeps minor-unit precision without float drift', () => {
    const txns = [
      txn({ date: '2026-10-01', amount: 199, type: 'income' }),
      txn({ date: '2026-10-02', amount: 100, type: 'expense' }),
    ];
    expect(summarize(txns).balance).toBe(99);
  });
});

describe('allowance / safe daily spending', () => {
  it('spreads balance over days until allowance', () => {
    // ₨4,600 over 12 days = ₨383/day (integer division).
    const info = allowanceInfo(460000, '2026-10-20', '2026-10-08');
    expect(info?.daysLeft).toBe(12);
    expect(info?.dailyAmount).toBe(38333);
  });
  it('returns null without a usable date or balance', () => {
    expect(allowanceInfo(460000, undefined, '2026-10-08')).toBeNull();
    expect(allowanceInfo(460000, '2026-10-01', '2026-10-08')).toBeNull(); // past
    expect(allowanceInfo(0, '2026-10-20', '2026-10-08')).toBeNull();
    expect(allowanceInfo(-100, '2026-10-20', '2026-10-08')).toBeNull();
  });
});

// ---------------------------------------------------------------- accounting (centralized money model)

import { accountingSummary, expenseShortfall, netOf, validateRepayment } from '../src/core/accounting';
import { isHistoryTxn } from '../src/model/types';

describe('accounting (Available Cash / Debt / Net Position)', () => {
  const txns: Transaction[] = [
    txn({ date: '2026-10-01', amount: 200000, type: 'opening_balance', note: 'Starting' }),
    txn({ date: '2026-10-02', amount: 150000, type: 'income', note: 'Allowance' }),
    txn({ date: '2026-10-03', amount: 50000, type: 'expense', note: 'Food' }),
    txn({ date: '2026-10-04', amount: 100000, type: 'borrowed', note: 'From friend' }),
    txn({ date: '2026-10-05', amount: 30000, type: 'debt_repayment', note: 'Repaid' }),
  ];
  it('computes available cash, debt, net position', () => {
    const a = accountingSummary(txns);
    expect(a.openingBalance).toBe(200000);
    expect(a.income).toBe(150000);
    expect(a.expense).toBe(50000);
    expect(a.borrowed).toBe(100000);
    expect(a.debtRepaid).toBe(30000);
    // 200000 + 150000 + 100000 − 50000 − 30000 = 370000
    expect(a.availableCash).toBe(370000);
    // 100000 − 30000 = 70000
    expect(a.outstandingDebt).toBe(70000);
    // 370000 − 70000 = 300000
    expect(a.netPosition).toBe(300000);
  });
  it('borrowed is not income; repayment is not expense', () => {
    const a = accountingSummary(txns);
    expect(a.income).toBe(150000); // borrowed 100000 excluded
    expect(a.expense).toBe(50000);  // repaid 30000 excluded
  });
  it('netOf signs all five types correctly', () => {
    expect(netOf(txns)).toBe(370000);
  });
  it('handles the PRD example: 6500 income, 10080 expense, 3580 borrowed', () => {
    const ex: Transaction[] = [
      txn({ date: '2026-10-01', amount: 650000, type: 'income' }),
      txn({ date: '2026-10-02', amount: 1008000, type: 'expense' }),
      txn({ date: '2026-10-02', amount: 358000, type: 'borrowed' }),
    ];
    const a = accountingSummary(ex);
    expect(a.availableCash).toBe(0);
    expect(a.outstandingDebt).toBe(358000);
    expect(a.netPosition).toBe(-358000);
  });
});

describe('expense shortfall guard', () => {
  it('returns null when affordable', () => {
    expect(expenseShortfall(50000, 50000)).toBeNull();
    expect(expenseShortfall(50000, 10000)).toBeNull();
  });
  it('reports the needed amount', () => {
    expect(expenseShortfall(50000, 100000)).toEqual({ availableCash: 50000, expenseAmount: 100000, needed: 50000 });
  });
});

describe('repayment validation', () => {
  it('accepts a valid repayment', () => {
    expect(validateRepayment(100000, 358000, 200000)).toEqual({ ok: true });
  });
  it('rejects zero/negative', () => {
    expect(validateRepayment(0, 358000, 200000).ok).toBe(false);
    expect(validateRepayment(-5, 358000, 200000).ok).toBe(false);
  });
  it('rejects more than outstanding debt', () => {
    const r = validateRepayment(400000, 358000, 500000);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exceed/i);
  });
  it('rejects when cash is insufficient', () => {
    const r = validateRepayment(100000, 358000, 50000);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cash/i);
  });
  it('rejects when there is no debt', () => {
    expect(validateRepayment(100000, 0, 500000).ok).toBe(false);
  });
});

// ------------------------------------------------- gift money (never income)

describe('gift money accounting', () => {
  it('mandatory case: opening 5000 + income 10000 + gift 2000 + borrowed 3000 - expense 4000', () => {
    const txns: Transaction[] = [
      txn({ date: '2026-10-01', amount: 500000, type: 'opening_balance' }),
      txn({ date: '2026-10-02', amount: 1000000, type: 'income' }),
      txn({ date: '2026-10-03', amount: 200000, type: 'gift_received' }),
      txn({ date: '2026-10-04', amount: 300000, type: 'borrowed' }),
      txn({ date: '2026-10-05', amount: 400000, type: 'expense' }),
    ];
    const a = accountingSummary(txns);
    expect(a.availableCash).toBe(1600000);
    expect(a.income).toBe(1000000); // NOT 1200000 / 1500000 / 1800000
    expect(a.gifts).toBe(200000);
    expect(a.borrowed).toBe(300000);
    expect(a.outstandingDebt).toBe(300000);
    expect(a.expense).toBe(400000);
  });
  it('opening balance only', () => {
    const a = accountingSummary([txn({ date: '2026-10-01', amount: 500000, type: 'opening_balance' })]);
    expect(a.availableCash).toBe(500000);
    expect(a.income).toBe(0);
  });
  it('opening + income', () => {
    const a = accountingSummary([
      txn({ date: '2026-10-01', amount: 500000, type: 'opening_balance' }),
      txn({ date: '2026-10-02', amount: 1000000, type: 'income' }),
    ]);
    expect(a.availableCash).toBe(1500000);
    expect(a.income).toBe(1000000);
  });
  it('opening + gift (gift is not income)', () => {
    const a = accountingSummary([
      txn({ date: '2026-10-01', amount: 500000, type: 'opening_balance' }),
      txn({ date: '2026-10-02', amount: 200000, type: 'gift_received' }),
    ]);
    expect(a.availableCash).toBe(700000);
    expect(a.income).toBe(0);
    expect(a.gifts).toBe(200000);
  });
  it('opening + borrowed', () => {
    const a = accountingSummary([
      txn({ date: '2026-10-01', amount: 500000, type: 'opening_balance' }),
      txn({ date: '2026-10-02', amount: 300000, type: 'borrowed' }),
    ]);
    expect(a.availableCash).toBe(800000);
    expect(a.income).toBe(0);
    expect(a.outstandingDebt).toBe(300000);
  });
  it('income + gift + borrowed combined', () => {
    const a = accountingSummary([
      txn({ date: '2026-10-01', amount: 1000000, type: 'income' }),
      txn({ date: '2026-10-02', amount: 200000, type: 'gift_received' }),
      txn({ date: '2026-10-03', amount: 300000, type: 'borrowed' }),
    ]);
    expect(a.availableCash).toBe(1500000);
    expect(a.income).toBe(1000000);
    expect(a.gifts).toBe(200000);
    expect(a.borrowed).toBe(300000);
  });
  it('expense deduction', () => {
    const a = accountingSummary([
      txn({ date: '2026-10-01', amount: 1000000, type: 'income' }),
      txn({ date: '2026-10-02', amount: 400000, type: 'expense' }),
    ]);
    expect(a.availableCash).toBe(600000);
  });
  it('debt repayment reduces cash and debt, not income/expense', () => {
    const a = accountingSummary([
      txn({ date: '2026-10-01', amount: 300000, type: 'borrowed' }),
      txn({ date: '2026-10-02', amount: 500000, type: 'income' }),
      txn({ date: '2026-10-03', amount: 100000, type: 'debt_repayment' }),
    ]);
    expect(a.availableCash).toBe(700000); // 300k+500k-100k
    expect(a.outstandingDebt).toBe(200000);
    expect(a.income).toBe(500000);
    expect(a.expense).toBe(0);
  });
  it('editing a transaction type recalculates (income -> gift)', () => {
    const t = txn({ date: '2026-10-01', amount: 200000, type: 'income' });
    const before = accountingSummary([t]);
    expect(before.income).toBe(200000);
    expect(before.gifts).toBe(0);
    const after = accountingSummary([{ ...t, type: 'gift_received' }]);
    expect(after.income).toBe(0);
    expect(after.gifts).toBe(200000);
    expect(after.availableCash).toBe(before.availableCash);
  });
  it('editing borrowed -> gift removes debt', () => {
    const t = txn({ date: '2026-10-01', amount: 300000, type: 'borrowed' });
    const after = accountingSummary([{ ...t, type: 'gift_received' }]);
    expect(after.outstandingDebt).toBe(0);
    expect(after.gifts).toBe(300000);
    expect(after.availableCash).toBe(300000);
  });
  it('deleting a transaction recalculates', () => {
    const gift = txn({ date: '2026-10-01', amount: 200000, type: 'gift_received' });
    const income = txn({ date: '2026-10-02', amount: 1000000, type: 'income' });
    expect(accountingSummary([gift, income]).availableCash).toBe(1200000);
    expect(accountingSummary([income]).availableCash).toBe(1000000);
    expect(accountingSummary([income]).gifts).toBe(0);
  });
});

describe('transaction filters with all types', () => {
  const all: Transaction[] = [
    txn({ date: '2026-10-01', amount: 1000000, type: 'income' }),
    txn({ date: '2026-10-02', amount: 200000, type: 'gift_received' }),
    txn({ date: '2026-10-03', amount: 300000, type: 'borrowed' }),
    txn({ date: '2026-10-04', amount: 400000, type: 'expense' }),
    txn({ date: '2026-10-05', amount: 100000, type: 'debt_repayment' }),
    txn({ date: '2026-10-06', amount: 500000, type: 'opening_balance' }),
  ];
  const f = (type: 'all' | 'expense' | 'income' | 'gift_received' | 'borrowed' | 'debt_repayment' | 'opening_balance', from = '', to = '') =>
    filterTransactions(all, () => '', { q: '', type, categoryId: '', from, to });
  it('All includes every money movement but NOT the opening balance', () => {
    const r = f('all');
    expect(r.length).toBe(5);
    expect(r.every((t) => t.type !== 'opening_balance')).toBe(true);
  });
  it('opening balance is excluded from history, counts and filters', () => {
    expect(isHistoryTxn(txn({ date: '2026-10-01', amount: 1, type: 'opening_balance' }))).toBe(false);
    expect(isHistoryTxn(txn({ date: '2026-10-01', amount: 1, type: 'income' }))).toBe(true);
    // still counts toward available cash
    const a = accountingSummary([
      txn({ date: '2026-10-01', amount: 500000, type: 'opening_balance' }),
      txn({ date: '2026-10-02', amount: 5000000, type: 'income' }),
    ]);
    expect(a.availableCash).toBe(5500000);
    expect(a.income).toBe(5000000);
  });
  it('Expense = only expenses', () => {
    const r = f('expense');
    expect(r.length).toBe(1);
    expect(r[0].type).toBe('expense');
  });
  it('Income = only actual income (no gifts, no borrowed)', () => {
    const r = f('income');
    expect(r.length).toBe(1);
    expect(r[0].type).toBe('income');
  });
  it('Gift filter = only gifts', () => {
    const r = f('gift_received');
    expect(r.length).toBe(1);
    expect(r[0].type).toBe('gift_received');
  });
  it('combined filters (type + date range)', () => {
    expect(f('all', '2026-10-02', '2026-10-04').length).toBe(3);
  });
});

describe('safe daily spending uses available cash, not inflated income', () => {
  it('bases allowance on available cash', () => {
    // income 10000 + gift 2000 + borrowed 3000 - expense 4000 = cash 11000
    const info = allowanceInfo(1100000, '2026-10-15', '2026-10-08');
    expect(info).not.toBeNull();
    expect(info!.daysLeft).toBe(7); // 8th -> 15th
    expect(info!.dailyAmount).toBe(Math.floor(1100000 / 7));
  });
});

// ------------------------------------------- required scenario: borrowed in cash, correct periods

describe('required scenario: opening 5000 + income 50000 + borrowed 5000 - expense 60000', () => {
  const txns: Transaction[] = [
    txn({ date: '2026-10-08', amount: 500000, type: 'opening_balance' }),
    txn({ date: '2026-10-08', amount: 5000000, type: 'income' }),
    txn({ date: '2026-10-08', amount: 500000, type: 'borrowed' }),
    txn({ date: '2026-10-08', amount: 6000000, type: 'expense' }),
  ];
  const now = new Date(2026, 9, 8, 12);
  it('computes the final accounting model', () => {
    const a = accountingSummary(txns);
    expect(a.availableCash).toBe(0); // 5000+50000+5000-60000
    expect(a.income).toBe(5000000);
    expect(a.gifts).toBe(0);
    expect(a.borrowed).toBe(500000);
    expect(a.outstandingDebt).toBe(500000);
    expect(a.expense).toBe(6000000);
  });
  it('counts 3 normal transactions (opening balance excluded)', () => {
    expect(txns.filter(isHistoryTxn)).toHaveLength(3);
    const shown = filterTransactions(txns, () => '', { q: '', type: 'all', categoryId: '', from: '', to: '' });
    expect(shown).toHaveLength(3);
  });
  it("today's net activity is -5000, not 70000", () => {
    const d = dashboardStats(txns, now);
    expect(d.todayNet).toBe(-500000); // +50000 +5000 -60000
    expect(d.weekNet).toBe(-500000);
    expect(d.monthNet).toBe(-500000);
  });
  it('repayment decreases cash and debt', () => {
    const repaid: Transaction[] = [
      ...txns,
      txn({ date: '2026-10-09', amount: 200000, type: 'debt_repayment' }),
    ];
    const a = accountingSummary(repaid);
    expect(a.availableCash).toBe(-200000); // 0 - 2000
    expect(a.outstandingDebt).toBe(300000); // 5000 - 2000
    expect(a.income).toBe(5000000); // unchanged
  });
});

// ------------------------------------------------------- android back button

import { decideBackAction } from '../src/services/backButton';

describe('android back button', () => {
  it('closes an open modal first', () => {
    expect(decideBackAction(true, 'settings', true)).toBe('close-modal');
    expect(decideBackAction(true, 'home', false)).toBe('close-modal');
  });
  it('navigates back inside the app from secondary screens', () => {
    expect(decideBackAction(false, 'settings', true)).toBe('go-back');
    expect(decideBackAction(false, 'transactions', true)).toBe('go-back');
    expect(decideBackAction(false, 'debt', true)).toBe('go-back');
  });
  it('exits only at home / with no in-app history', () => {
    expect(decideBackAction(false, 'home', false)).toBe('exit');
    expect(decideBackAction(false, 'home', true)).toBe('exit');
    expect(decideBackAction(false, 'transactions', false)).toBe('exit');
  });
  it('never blindly exits when there is somewhere to go', () => {
    // modal open on a secondary screen with history: modal wins, never exit
    expect(decideBackAction(true, 'budgets', true)).not.toBe('exit');
    expect(decideBackAction(false, 'budgets', true)).not.toBe('exit');
  });
});

// ------------------------------------------------------- student intelligence

import {
  canAfford, cashComposition, daysBetween, goalWeeklyNeeded,
  milestones, moneyStatus, noSpendStreak, safeToSpend, upcomingEssentials,
} from '../src/core/student';

describe('safe to spend today', () => {
  it('matches the PRD example: 10000 cash, 5000 in 10 days, 2000 essentials -> 800', () => {
    const s = safeToSpend({
      availableCash: 1000000, upcomingEssentials: 200000, emergencyBuffer: 0,
      nextAllowanceDate: '2026-10-18', today: '2026-10-08',
    });
    expect(s.daysLeft).toBe(10);
    expect(s.perDay).toBe(80000);
    expect(s.reserved).toBe(200000);
  });
  it('subtracts the emergency buffer', () => {
    const s = safeToSpend({
      availableCash: 1000000, upcomingEssentials: 200000, emergencyBuffer: 100000,
      nextAllowanceDate: '2026-10-18', today: '2026-10-08',
    });
    expect(s.perDay).toBe(70000); // (10000-2000-1000)/10
  });
  it('floors at zero when reserved exceeds cash', () => {
    const s = safeToSpend({
      availableCash: 100000, upcomingEssentials: 500000, emergencyBuffer: 0,
      nextAllowanceDate: '2026-10-18', today: '2026-10-08',
    });
    expect(s.perDay).toBe(0);
  });
  it('without an allowance date, all free money is safe today', () => {
    const s = safeToSpend({ availableCash: 1000000, upcomingEssentials: 200000, emergencyBuffer: 0 });
    expect(s.daysLeft).toBeNull();
    expect(s.perDay).toBe(800000);
  });
});

describe('money status', () => {
  it('on track when pace is within the safe amount', () => {
    const s = moneyStatus(50000, 80000);
    expect(s.level).toBe('on-track');
    expect(s.text).toMatch(/track/i);
  });
  it('watch when slightly over', () => {
    expect(moneyStatus(90000, 80000).level).toBe('watch');
  });
  it('slow down when well over pace', () => {
    const s = moneyStatus(200000, 80000);
    expect(s.level).toBe('slow-down');
    expect(s.text).toMatch(/run out/i);
  });
});

describe('upcoming essentials', () => {
  it('sums enabled recurring due before the allowance date', () => {
    const rec = [
      { id: 'a', amount: 50000, categoryId: 'c', frequency: 'monthly', nextOccurrence: '2026-10-10', enabled: true, createdAt: 1 },
      { id: 'b', amount: 30000, categoryId: 'c', frequency: 'monthly', nextOccurrence: '2026-10-20', enabled: true, createdAt: 2 },
      { id: 'c', amount: 99999, categoryId: 'c', frequency: 'monthly', nextOccurrence: '2026-10-09', enabled: false, createdAt: 3 },
    ] as never;
    expect(upcomingEssentials(rec, '2026-10-18')).toBe(50000);
  });
});

describe('no-spend streak', () => {
  const food = { id: 'cat-food', name: 'Food', icon: 'food', kind: 'expense', isDefault: true, essential: true, createdAt: 1 };
  const fun = { id: 'cat-fun', name: 'Fun', icon: 'other', kind: 'expense', isDefault: true, createdAt: 2 };
  it('counts days without discretionary spend; essentials never break it', () => {
    const txns: Transaction[] = [
      txn({ date: '2026-10-08', amount: 50000, type: 'expense', categoryId: 'cat-food' }),
      txn({ date: '2026-10-07', amount: 50000, type: 'expense', categoryId: 'cat-food' }),
      txn({ date: '2026-10-05', amount: 20000, type: 'expense', categoryId: 'cat-fun' }),
    ];
    expect(noSpendStreak(txns, [food, fun] as never, '2026-10-08')).toBe(3);
  });
  it('a discretionary expense today resets the streak', () => {
    const txns: Transaction[] = [
      txn({ date: '2026-10-08', amount: 20000, type: 'expense', categoryId: 'cat-fun' }),
    ];
    expect(noSpendStreak(txns, [food, fun] as never, '2026-10-08')).toBe(0);
  });
});

describe('can I afford this', () => {
  const fmt = (n: number) => `Rs${n / 100}`;
  it('affordable within the safe daily amount', () => {
    const r = canAfford(50000, 80000, 1000000, 200000, 10, fmt);
    expect(r.verdict).toBe('affordable');
    expect(r.text).toMatch(/affordable/i);
  });
  it('tight when it eats into the runway', () => {
    const r = canAfford(300000, 80000, 1000000, 200000, 10, fmt);
    expect(r.verdict).toBe('tight');
    expect(r.text).toMatch(/leave you with/);
  });
  it('wait when it exceeds free money', () => {
    const r = canAfford(900000, 80000, 1000000, 200000, 10, fmt);
    expect(r.verdict).toBe('wait');
  });
});

describe('milestones', () => {
  it('detects the useful milestones', () => {
    const txns: Transaction[] = [];
    for (let i = 0; i < 10; i++) {
      txns.push(txn({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, amount: 10000, type: 'expense' }));
    }
    const acct = accountingSummary([
      ...txns,
      txn({ date: '2026-10-01', amount: 200000, type: 'income' }),
    ]);
    const ms = milestones(txns, [], acct);
    const byId = new Map(ms.map((m) => [m.id, m.achieved]));
    expect(byId.get('exp-10')).toBe(true);
    expect(byId.get('track-7')).toBe(true);
    expect(byId.get('save-1k')).toBe(true); // 2000 - 1000 = 1000 cash
    expect(byId.get('goal-done')).toBe(false);
  });
});

describe('goal weekly needed', () => {
  it('computes save-per-week from the target date', () => {
    const g = { id: 'g', name: 'Phone', targetAmount: 1000000, currentAmount: 400000, targetDate: '2026-11-07', createdAt: 1 };
    // 30 days -> 5 weeks -> 600000/5 = 120000
    expect(goalWeeklyNeeded(g as never, '2026-10-08')).toBe(120000);
  });
  it('returns null without a target date', () => {
    expect(goalWeeklyNeeded({ id: 'g', name: 'X', targetAmount: 1, currentAmount: 0, createdAt: 1 } as never)).toBeNull();
  });
});

describe('cash composition (money map)', () => {
  it('splits earned / gifts / borrowed / owed', () => {
    const a = accountingSummary([
      txn({ date: '2026-10-01', amount: 500000, type: 'opening_balance' }),
      txn({ date: '2026-10-02', amount: 1000000, type: 'income' }),
      txn({ date: '2026-10-03', amount: 200000, type: 'gift_received' }),
      txn({ date: '2026-10-04', amount: 300000, type: 'borrowed' }),
    ]);
    const c = cashComposition(a);
    expect(c.earned).toBe(1500000);
    expect(c.gifts).toBe(200000);
    expect(c.borrowed).toBe(300000);
    expect(c.owed).toBe(300000);
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-10-08', '2026-10-18')).toBe(10);
    expect(daysBetween('2026-10-08', '2026-10-08')).toBe(0);
  });
});
