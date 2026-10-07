/**
 * Recurring expense runner. On every app start (and after editing rules),
 * generate the transactions that came due. Idempotent: state advances from
 * `lastGenerated`, so multiple opens never create duplicates.
 */
import { dueOccurrences } from '../core/recurring';
import { todayISO } from '../core/dates';
import { newId, store } from '../data/store';
import type { Transaction } from '../model/types';
import { notifyRecurring } from './notify';

export interface RunResult {
  generated: number;
}

/** Generate all due recurring transactions as of today. */
export async function runRecurring(now = new Date()): Promise<RunResult> {
  const today = todayISO(now);
  const rules = await store.listRecurring();
  let generated = 0;
  const newTxns: Transaction[] = [];

  for (const rule of rules) {
    const { dates, lastGenerated, nextOccurrence } = dueOccurrences(rule, today);
    if (dates.length === 0) continue;
    const base = Date.now();
    dates.forEach((date, i) => {
      newTxns.push({
        id: newId(),
        type: 'expense',
        amount: rule.amount,
        categoryId: rule.categoryId,
        date,
        note: rule.note ? `${rule.note} (recurring)` : 'Recurring',
        paymentMethod: rule.paymentMethod,
        createdAt: base + i,
        updatedAt: base + i,
      });
    });
    generated += dates.length;
    // eslint-disable-next-line no-await-in-loop
    await store.saveRecurring({ ...rule, lastGenerated, nextOccurrence });
  }

  if (newTxns.length > 0) {
    await store.saveTransactions(newTxns);
    notifyRecurring(newTxns.length);
  }
  return { generated };
}
