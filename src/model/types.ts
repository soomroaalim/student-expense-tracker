/**
 * Core data model for the Student Expense Tracker.
 *
 * Money is always stored as an integer number of *minor units*
 * (e.g. paisa for PKR, cents for USD) so financial calculations
 * never suffer from floating-point rounding errors.
 *
 * Dates are stored as local ISO calendar strings 'YYYY-MM-DD'.
 */

/**
 * Transaction type.
 *
 * - opening_balance: money the student already had before using the app.
 * - income: money actually earned/received as normal income (salary,
 *   freelancing, allowance classified as income). NOT gifts, NOT borrowed.
 * - gift_received: gift money. Increases cash, never counts as income.
 * - borrowed: money borrowed from someone. Increases cash, creates debt,
 *   never counts as income.
 * - expense: money spent.
 * - debt_repayment: money returned to a lender. NOT a normal expense.
 */
export type TxnType = 'expense' | 'income' | 'opening_balance' | 'gift_received' | 'borrowed' | 'debt_repayment';

export interface Transaction {
  id: string;
  type: TxnType;
  /** Positive integer in minor currency units (e.g. paisa). */
  amount: number;
  categoryId: string;
  /** Local date 'YYYY-MM-DD'. */
  date: string;
  note?: string;
  paymentMethod?: string;
  /** For borrowed: who lent the money (lender/source name). */
  lender?: string;
  /** Links a borrowed transaction to the expense it funded (or vice versa). */
  linkedExpenseId?: string;
  /** Epoch ms when created. */
  createdAt: number;
  /** Epoch ms when last updated. */
  updatedAt: number;
}

/** Human-readable label for a transaction type. */
export function txnTypeLabel(t: TxnType): string {
  switch (t) {
    case 'opening_balance': return 'Opening Balance';
    case 'income': return 'Income';
    case 'gift_received': return 'Gift';
    case 'expense': return 'Expense';
    case 'borrowed': return 'Borrowed';
    case 'debt_repayment': return 'Debt Repayment';
  }
}

/** +1 for cash-increasing types, -1 for cash-decreasing types. */
export function txnSign(t: TxnType): 1 | -1 {
  return t === 'expense' || t === 'debt_repayment' ? -1 : 1;
}

/**
 * Opening balance is account setup, not a money movement.
 * It counts toward Available Cash but must never appear in
 * transaction history, counts, or type filters.
 */
export function isHistoryTxn(t: Transaction): boolean {
  return t.type !== 'opening_balance';
}

/** Signed amount in minor units (+ for cash in, − for cash out). */
export function txnSignedAmount(type: TxnType, amount: number): number {
  return txnSign(type) * amount;
}

export type CategoryKind = 'expense' | 'income' | 'both';

export interface Category {
  id: string;
  name: string;
  /** Key into the icon registry (see ui/icons.ts). */
  icon: string;
  kind: CategoryKind;
  isDefault: boolean;
  /**
   * True for must-pay categories (food, transport, education…).
   * Essentials never break a no-spend streak and are never framed negatively.
   */
  essential?: boolean;
  createdAt: number;
}

export type BudgetPeriod = 'weekly' | 'monthly';

export interface Budget {
  id: string;
  name: string;
  /** Positive integer in minor units. */
  amount: number;
  period: BudgetPeriod;
  /** When undefined, the budget applies to total spending. */
  categoryId?: string;
  createdAt: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  /** Positive integer in minor units. */
  targetAmount: number;
  /** Integer in minor units, >= 0. */
  currentAmount: number;
  /** Optional target date 'YYYY-MM-DD'. */
  targetDate?: string;
  createdAt: number;
}

export type Recurrence = 'daily' | 'weekly' | 'monthly';

export interface RecurringExpense {
  id: string;
  /** Positive integer in minor units. */
  amount: number;
  categoryId: string;
  frequency: Recurrence;
  /** Local date 'YYYY-MM-DD' of the next (or first) occurrence. */
  nextOccurrence: string;
  note?: string;
  paymentMethod?: string;
  enabled: boolean;
  /** 'YYYY-MM-DD' of the most recently generated occurrence, if any. */
  lastGenerated?: string;
  createdAt: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  name: string;
  /** ISO currency code, e.g. 'PKR'. */
  currency: string;
  theme: ThemeMode;
  notificationsEnabled: boolean;
  /** Quick overall monthly budget in minor units (optional). */
  monthlyBudget?: number;
  /** Next allowance date as ISO date (YYYY-MM-DD), optional. */
  nextAllowanceDate?: string;
  /** Expected next allowance amount in minor units (planning only — never added to cash). */
  nextAllowanceAmount?: number;
  /** Minimum emergency buffer in minor units (held back from safe-to-spend). */
  emergencyBuffer?: number;
  onboardingDone: boolean;
}

/** Full backup file format (JSON export/import). */
export interface BackupData {
  version: 1;
  exportedAt: number;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: SavingsGoal[];
  recurring: RecurringExpense[];
  settings: Settings;
}

/** A single dated money flow, used for charts and summaries. */
export interface DatedFlow {
  date: string;
  income: number;
  expense: number;
}
