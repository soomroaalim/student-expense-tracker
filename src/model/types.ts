/**
 * Core data model for the Student Expense Tracker.
 *
 * Money is always stored as an integer number of *minor units*
 * (e.g. paisa for PKR, cents for USD) so financial calculations
 * never suffer from floating-point rounding errors.
 *
 * Dates are stored as local ISO calendar strings 'YYYY-MM-DD'.
 */

/** Transaction type: money going out or money coming in. */
export type TxnType = 'expense' | 'income';

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
  /** Epoch ms when created. */
  createdAt: number;
  /** Epoch ms when last updated. */
  updatedAt: number;
}

export type CategoryKind = 'expense' | 'income' | 'both';

export interface Category {
  id: string;
  name: string;
  /** Key into the icon registry (see ui/icons.ts). */
  icon: string;
  kind: CategoryKind;
  isDefault: boolean;
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
