/**
 * Centralized accounting layer — the single source of truth for all
 * money math in the app.
 *
 * Model:
 *   Available Cash   = Opening Balance + Income + Gifts + Borrowed
 *                      − Expenses − Debt Repayments
 *   Outstanding Debt = Total Borrowed − Total Debt Repaid
 *   Net Position     = Available Cash − Outstanding Debt
 *
 * Rules:
 * - Borrowed money is NOT income. Gift money is NOT income.
 * - Debt repayment is NOT a normal expense.
 * - All amounts are integer minor units; no floating point.
 */
import type { Transaction } from '../model/types';
import { isHistoryTxn, txnSign } from '../model/types';

export interface AccountingSummary {
  openingBalance: number;
  /** Actual earned income only — never gifts, never borrowed. */
  income: number;
  gifts: number;
  expense: number;
  borrowed: number;
  debtRepaid: number;
  /** Cash the student can actually spend right now. */
  availableCash: number;
  /** Total Borrowed − Total Debt Repaid (>= 0). */
  outstandingDebt: number;
  /** Available Cash − Outstanding Debt. */
  netPosition: number;
  count: number;
}

/** Compute the full accounting summary over a transaction set. Pure. */
export function accountingSummary(txns: Transaction[]): AccountingSummary {
  let openingBalance = 0;
  let income = 0;
  let gifts = 0;
  let expense = 0;
  let borrowed = 0;
  let debtRepaid = 0;
  for (const t of txns) {
    switch (t.type) {
      case 'opening_balance': openingBalance += t.amount; break;
      case 'income': income += t.amount; break;
      case 'gift_received': gifts += t.amount; break;
      case 'expense': expense += t.amount; break;
      case 'borrowed': borrowed += t.amount; break;
      case 'debt_repayment': debtRepaid += t.amount; break;
    }
  }
  const availableCash = openingBalance + income + gifts + borrowed - expense - debtRepaid;
  const outstandingDebt = Math.max(0, borrowed - debtRepaid);
  return {
    openingBalance,
    income,
    gifts,
    expense,
    borrowed,
    debtRepaid,
    availableCash,
    outstandingDebt,
    netPosition: availableCash - outstandingDebt,
    count: txns.length,
  };
}

/** Net signed total of a (possibly filtered) transaction set. */
export function netOf(txns: Transaction[]): number {
  let total = 0;
  for (const t of txns) total += txnSign(t.type) * t.amount;
  return total;
}

/**
 * Net money movement over a set of transactions, excluding the opening
 * balance (account setup is not period activity). Used for Today / This
 * week / This month cards. Pure.
 */
export function periodNet(txns: Transaction[]): number {
  return netOf(txns.filter(isHistoryTxn));
}

/** Shortfall info when an expense exceeds available cash. Pure. */
export interface Shortfall {
  availableCash: number;
  expenseAmount: number;
  /** Positive amount still needed. */
  needed: number;
}

export function expenseShortfall(availableCash: number, expenseAmount: number): Shortfall | null {
  if (expenseAmount <= availableCash) return null;
  return { availableCash, expenseAmount, needed: expenseAmount - availableCash };
}

export interface RepaymentCheck {
  ok: boolean;
  reason?: string;
}

/** Validate a debt repayment against outstanding debt and available cash. Pure. */
export function validateRepayment(
  amountMinor: number,
  outstandingDebt: number,
  availableCash: number,
): RepaymentCheck {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { ok: false, reason: 'Enter an amount greater than zero.' };
  }
  if (outstandingDebt <= 0) {
    return { ok: false, reason: 'You have no outstanding debt to repay.' };
  }
  if (amountMinor > outstandingDebt) {
    return { ok: false, reason: 'Repayment cannot exceed your outstanding debt.' };
  }
  if (amountMinor > availableCash) {
    return { ok: false, reason: 'You do not have enough available cash for this repayment.' };
  }
  return { ok: true };
}
