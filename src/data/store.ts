/**
 * Application store: repositories over IndexedDB + settings in localStorage.
 * Emits change events so views refresh after any mutation.
 */
import { defaultSettings, seedCategories } from '../model/defaults';
import type {
  Budget,
  Category,
  RecurringExpense,
  SavingsGoal,
  Settings,
  Transaction,
} from '../model/types';
import { clearAll, idb } from './idb';

const SETTINGS_KEY = 'set.settings.v1';

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

// ---------------------------------------------------------------- settings

let settingsCache: Settings | null = null;

export function getSettings(): Settings {
  if (settingsCache) return settingsCache;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      settingsCache = { ...defaultSettings(), ...parsed };
      return settingsCache;
    }
  } catch {
    // Corrupted settings: fall through to defaults.
  }
  settingsCache = defaultSettings();
  return settingsCache;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  settingsCache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache));
  } catch {
    // Storage full / private mode — keep in-memory copy.
  }
  emit();
  return settingsCache;
}

// ---------------------------------------------------------------- entities

function newId(): string {
  return crypto.randomUUID();
}

export { newId };

async function list<T>(store: 'transactions' | 'categories' | 'budgets' | 'goals' | 'recurring'): Promise<T[]> {
  try {
    return await idb.getAll<T>(store);
  } catch {
    return [];
  }
}

export const store = {
  ready: idb.getAll('transactions').then(() => undefined),

  // -- transactions
  async listTransactions(): Promise<Transaction[]> {
    const all = await list<Transaction>('transactions');
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  },
  async saveTransaction(t: Transaction): Promise<void> {
    await idb.put('transactions', t);
    emit();
  },
  async saveTransactions(ts: Transaction[]): Promise<void> {
    await idb.putMany('transactions', ts);
    emit();
  },
  async deleteTransaction(id: string): Promise<void> {
    await idb.delete('transactions', id);
    emit();
  },

  // -- categories
  async listCategories(): Promise<Category[]> {
    const all = await list<Category>('categories');
    return all.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  },
  async saveCategory(c: Category): Promise<void> {
    await idb.put('categories', c);
    emit();
  },
  async deleteCategory(id: string): Promise<void> {
    await idb.delete('categories', id);
    emit();
  },
  /** Seed default categories on first run. Returns true when seeding happened. */
  async ensureSeeded(): Promise<boolean> {
    const existing = await idb.getAll<Category>('categories');
    if (existing.length > 0) return false;
    await idb.putMany('categories', seedCategories(Date.now()));
    emit();
    return true;
  },

  // -- budgets
  async listBudgets(): Promise<Budget[]> {
    const all = await list<Budget>('budgets');
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },
  async saveBudget(b: Budget): Promise<void> {
    await idb.put('budgets', b);
    emit();
  },
  async deleteBudget(id: string): Promise<void> {
    await idb.delete('budgets', id);
    emit();
  },

  // -- goals
  async listGoals(): Promise<SavingsGoal[]> {
    const all = await list<SavingsGoal>('goals');
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },
  async saveGoal(g: SavingsGoal): Promise<void> {
    await idb.put('goals', g);
    emit();
  },
  async deleteGoal(id: string): Promise<void> {
    await idb.delete('goals', id);
    emit();
  },

  // -- recurring
  async listRecurring(): Promise<RecurringExpense[]> {
    const all = await list<RecurringExpense>('recurring');
    return all.sort((a, b) => a.nextOccurrence.localeCompare(b.nextOccurrence));
  },
  async saveRecurring(r: RecurringExpense): Promise<void> {
    await idb.put('recurring', r);
    emit();
  },
  async deleteRecurring(id: string): Promise<void> {
    await idb.delete('recurring', id);
    emit();
  },

  /** Replace the entire dataset (used by JSON import). */
  async replaceAll(data: {
    transactions: Transaction[];
    categories: Category[];
    budgets: Budget[];
    goals: SavingsGoal[];
    recurring: RecurringExpense[];
  }): Promise<void> {
    await clearAll();
    await idb.putMany('transactions', data.transactions);
    await idb.putMany('categories', data.categories);
    await idb.putMany('budgets', data.budgets);
    await idb.putMany('goals', data.goals);
    await idb.putMany('recurring', data.recurring);
    emit();
  },

  /** Delete everything (used by "Reset data"). */
  async resetAll(): Promise<void> {
    await clearAll();
    emit();
  },
};
