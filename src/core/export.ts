/**
 * Data export/import: CSV (transactions) and JSON (full backup).
 * All parsing is defensive — invalid rows are skipped and reported,
 * never allowed to corrupt the store.
 */
import { currencyMeta } from '../model/defaults';
import type { BackupData, Category, Transaction, TxnType } from '../model/types';
import { isValidISODate } from './dates';
import { MAX_MINOR, parseAmount } from './money';

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Export transactions to CSV: Date, Type, Category, Amount, Note. */
export function transactionsToCSV(
  txns: Transaction[],
  categoryName: (id: string) => string,
  currencyCode = 'PKR',
): string {
  const meta = currencyMeta(currencyCode);
  const lines = ['Date,Type,Category,Amount,Note,PaymentMethod'];
  const sorted = [...txns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  for (const t of sorted) {
    const amount = (t.amount / meta.minorUnits).toFixed(meta.minorUnits === 1 ? 0 : 2);
    lines.push([
      t.date,
      t.type,
      csvEscape(categoryName(t.categoryId)),
      amount,
      csvEscape(t.note ?? ''),
      csvEscape(t.paymentMethod ?? ''),
    ].join(','));
  }
  return lines.join('\n');
}

/** Parse one CSV line honoring quotes. Returns null on malformed lines. */
function parseCSVLine(line: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (inQuotes) return null;
  out.push(cur);
  return out;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Import transactions from CSV text. Matches categories by name
 * (falling back to an "Other"/"Other Income" category). Amounts are
 * validated with the same strict parser as manual entry.
 */
export function transactionsFromCSV(
  text: string,
  categories: Category[],
  currencyCode = 'PKR',
  now = Date.now(),
): { transactions: Transaction[]; result: ImportResult } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const transactions: Transaction[] = [];
  const errors: string[] = [];
  let skipped = 0;
  if (lines.length === 0) return { transactions, result: { imported: 0, skipped: 0, errors: ['File is empty.'] } };

  const header = (parseCSVLine(lines[0]) ?? []).map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('date') && header.includes('amount');
  const rows = hasHeader ? lines.slice(1) : lines;

  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const fallbackExpense = categories.find((c) => c.kind === 'expense' && c.name.toLowerCase() === 'other')
    ?? categories.find((c) => c.kind !== 'income');
  const fallbackIncome = categories.find((c) => c.kind === 'income' && c.name.toLowerCase().includes('other'))
    ?? categories.find((c) => c.kind !== 'expense');

  rows.forEach((line, idx) => {
    const cols = parseCSVLine(line);
    const rowNo = idx + (hasHeader ? 2 : 1);
    if (!cols || cols.length < 4) { skipped++; errors.push(`Row ${rowNo}: not enough columns.`); return; }
    const [dateRaw, typeRaw, catRaw, amountRaw, noteRaw = '', pmRaw = ''] = cols.map((c) => c.trim());
    const type = typeRaw.toLowerCase() as TxnType;
    if (type !== 'expense' && type !== 'income') { skipped++; errors.push(`Row ${rowNo}: type must be expense or income.`); return; }
    if (!isValidISODate(dateRaw)) { skipped++; errors.push(`Row ${rowNo}: invalid date "${dateRaw}".`); return; }
    const parsed = parseAmount(amountRaw, currencyCode);
    if (!parsed.ok) { skipped++; errors.push(`Row ${rowNo}: invalid amount "${amountRaw}".`); return; }
    const cat = byName.get(catRaw.toLowerCase())
      ?? (type === 'income' ? fallbackIncome : fallbackExpense);
    if (!cat) { skipped++; errors.push(`Row ${rowNo}: no matching category and no fallback available.`); return; }
    transactions.push({
      id: newId(),
      type,
      amount: parsed.minor,
      categoryId: cat.id,
      date: dateRaw,
      note: noteRaw || undefined,
      paymentMethod: pmRaw || undefined,
      createdAt: now + idx,
      updatedAt: now + idx,
    });
  });

  return { transactions, result: { imported: transactions.length, skipped, errors: errors.slice(0, 20) } };
}

/** Serialize a full JSON backup. */
export function toBackupJSON(data: BackupData): string {
  return JSON.stringify({ ...data, version: 1, exportedAt: Date.now() }, null, 2);
}

function isTxnLike(t: unknown): t is Transaction {
  const o = t as Record<string, unknown>;
  return !!o && typeof o.id === 'string'
    && (o.type === 'expense' || o.type === 'income')
    && Number.isSafeInteger(o.amount) && (o.amount as number) > 0 && (o.amount as number) <= MAX_MINOR
    && typeof o.categoryId === 'string' && typeof o.date === 'string' && isValidISODate(o.date as string);
}

/** Validate and sanitize a JSON backup. Returns null when the file is unusable. */
export function fromBackupJSON(text: string): BackupData | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object') return null;
  const txns = Array.isArray(o.transactions) ? (o.transactions as unknown[]).filter(isTxnLike) : [];
  const pick = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    version: 1,
    exportedAt: typeof o.exportedAt === 'number' ? o.exportedAt : Date.now(),
    transactions: txns,
    categories: pick<Category>(o.categories).filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string'),
    budgets: pick(o.budgets),
    goals: pick(o.goals),
    recurring: pick(o.recurring),
    settings: (o.settings && typeof o.settings === 'object' ? o.settings : {}) as BackupData['settings'],
  };
}

/** Trigger a file download in the browser. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
