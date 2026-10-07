import type { Category, Settings } from './types';

/** ISO currency code -> display metadata. Extensible: add rows to support new currencies. */
export interface CurrencyMeta {
  code: string;
  symbol: string;
  name: string;
  /** Minor units per major unit (100 = paisa/cents, 1 = no subdivision). */
  minorUnits: number;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', minorUnits: 100 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', minorUnits: 100 },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', minorUnits: 100 },
  { code: 'USD', symbol: '$', name: 'US Dollar', minorUnits: 100 },
  { code: 'EUR', symbol: '€', name: 'Euro', minorUnits: 100 },
  { code: 'GBP', symbol: '£', name: 'British Pound', minorUnits: 100 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', minorUnits: 100 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', minorUnits: 100 },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', minorUnits: 100 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', minorUnits: 100 },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', minorUnits: 100 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', minorUnits: 1 },
];

export function currencyMeta(code: string): CurrencyMeta {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export const DEFAULT_CURRENCY = 'PKR';

export interface CategorySeed {
  id: string;
  name: string;
  icon: string;
  kind: 'expense' | 'income' | 'both';
}

export const DEFAULT_EXPENSE_CATEGORIES: CategorySeed[] = [
  { id: 'cat-food', name: 'Food', icon: 'food', kind: 'expense' },
  { id: 'cat-transport', name: 'Transport', icon: 'transport', kind: 'expense' },
  { id: 'cat-education', name: 'Education', icon: 'education', kind: 'expense' },
  { id: 'cat-mobile', name: 'Mobile/Internet', icon: 'mobile', kind: 'expense' },
  { id: 'cat-shopping', name: 'Shopping', icon: 'shopping', kind: 'expense' },
  { id: 'cat-entertainment', name: 'Entertainment', icon: 'entertainment', kind: 'expense' },
  { id: 'cat-bills', name: 'Bills', icon: 'bills', kind: 'expense' },
  { id: 'cat-health', name: 'Health', icon: 'health', kind: 'expense' },
  { id: 'cat-other', name: 'Other', icon: 'other', kind: 'expense' },
];

export const DEFAULT_INCOME_CATEGORIES: CategorySeed[] = [
  { id: 'cat-pocket', name: 'Pocket Money', icon: 'wallet', kind: 'income' },
  { id: 'cat-scholarship', name: 'Scholarship', icon: 'scholarship', kind: 'income' },
  { id: 'cat-parttime', name: 'Part-time Work', icon: 'briefcase', kind: 'income' },
  { id: 'cat-gift', name: 'Gift', icon: 'gift', kind: 'income' },
  { id: 'cat-income-other', name: 'Other Income', icon: 'income', kind: 'income' },
];

/** Colors assigned to categories in charts (stable by index). */
export const CATEGORY_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

export function seedCategories(now: number): Category[] {
  const all = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
  return all.map((s, i) => ({
    ...s,
    isDefault: true,
    createdAt: now + i,
  }));
}

export function defaultSettings(): Settings {
  return {
    name: '',
    currency: DEFAULT_CURRENCY,
    theme: 'system',
    notificationsEnabled: false,
    onboardingDone: false,
  };
}

/** Default payment methods offered in the add-expense form. */
export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Mobile Wallet', 'Other'];
