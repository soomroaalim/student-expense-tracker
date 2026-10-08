/**
 * DEV-ONLY responsive-audit seed. Bundled only when `import.meta.env.DEV`
 * is true (vite replaces it with `false` in production and tree-shakes this
 * away). Visit `?seed=big` on the dev server to load huge amounts and long
 * names, then screenshot at phone widths to audit horizontal overflow.
 */
import { store, saveSettings } from '../data/store';
import { seedCategories } from '../model/defaults';
import { todayISO, addDays } from '../core/dates';
import type { Transaction } from '../model/types';

let done = false;

export async function seedBigIfRequested(): Promise<void> {
  if (done || !location.search.includes('seed=big')) return;
  done = true;
  const now = Date.now();
  const today = todayISO();

  const cats = seedCategories(now);
  // Add a very long category name to stress wrapping.
  cats.push({
    id: 'cat-long', name: 'Extremely Long Category Name For Wrapping Tests', icon: 'other',
    kind: 'expense', isDefault: false, createdAt: now + 999,
  });
  for (const c of cats) await store.saveCategory(c);

  const t = (id: string, type: Transaction['type'], amount: number, extra: Partial<Transaction> = {}): Transaction => ({
    id, type, amount, categoryId: 'cat-food', date: today, createdAt: now, updatedAt: now, ...extra,
  });
  const txns: Transaction[] = [
    t('s-open', 'opening_balance', 999999900), // Rs9,999,999
    t('s-inc', 'income', 999999900, { categoryId: 'cat-pocket' }),
    t('s-gift', 'gift_received', 99999900, { categoryId: 'cat-gift', note: 'Gift from a very generous relative with a long note attached' }),
    t('s-bor', 'borrowed', 99999900, { lender: 'Ali' }),
    t('s-exp1', 'expense', 999999900, { categoryId: 'cat-long', note: 'A very long transaction description that should wrap gracefully instead of pushing the page wider than the viewport' }),
    t('s-exp2', 'expense', 999900, { categoryId: 'cat-transport' }),
    t('s-exp3', 'expense', 99900, { categoryId: 'cat-education', date: addDays(today, -1) }),
    t('s-repay', 'debt_repayment', 999900),
  ];
  await store.saveTransactions(txns);

  await store.saveGoal({
    id: 's-goal', name: 'New Phone With An Extremely Long Goal Name', targetAmount: 999999900,
    currentAmount: 99999900, targetDate: addDays(today, 60), createdAt: now,
  });
  await store.saveBudget({
    id: 's-budget', name: 'Monthly', amount: 999999900, period: 'monthly',
    categoryId: 'cat-food', createdAt: now,
  });
  await store.saveRecurring({
    id: 's-rec', amount: 99999900, categoryId: 'cat-hostel', frequency: 'monthly',
    nextOccurrence: addDays(today, 5), enabled: true, createdAt: now,
  });

  saveSettings({
    name: 'Audit User With A Long Name',
    onboardingDone: true,
    currency: 'PKR',
    nextAllowanceDate: addDays(today, 10),
    nextAllowanceAmount: 999999900,
    emergencyBuffer: 9999900,
  });
}
