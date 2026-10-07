/**
 * Transaction history screen: searchable, filterable chronological list
 * with date grouping. Filter state lives in module-level variables so it
 * survives full view re-renders; renderList() redraws only the list
 * container so input focus is preserved.
 */
import { clear, el, emptyState, moneyEl, categoryAvatar, segmented, selectInput, textInput } from '../ui/components';
import { icon } from '../ui/icons';
import { getSettings, store } from '../data/store';
import { formatSigned } from '../core/money';
import { friendlyDate, isValidISODate } from '../core/dates';
import { summarize } from '../core/finance';
import { openAddSheet, openEditSheet } from './add';
import type { Category, Transaction } from '../model/types';

// ------------------------------------------------------------------ filter state (module-level; survives re-render)

let q = '';
let typeFilter: 'all' | 'expense' | 'income' = 'all';
let catFilter = '';
let fromDate = '';
let toDate = '';

const ROW_CAP = 500;

// ------------------------------------------------------------------ view

export async function renderTransactions(root: HTMLElement): Promise<void> {
  clear(root);

  const [txns, categories] = await Promise.all([
    store.listTransactions(),
    store.listCategories(),
  ]);
  const catMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

  const list = el('div', { class: 'txn-list' });
  root.append(
    el('div', { class: 'page-head' },
      el('h1', { class: 'page-title', text: 'Transactions' }),
    ),
    buildSummaryCard(txns),
    buildToolbar(categories, list),
    list,
  );
  renderList(list, txns, catMap);
}

// ------------------------------------------------------------------ summary

function buildSummaryCard(txns: Transaction[]): HTMLElement {
  const s = summarize(txns);
  const row = el('div', { class: 'row-between card summary-card' });
  row.append(
    el('span', { class: 'txn-count', text: `${s.count} transaction${s.count === 1 ? '' : 's'}` }),
    el('span', { class: 'net-wrap' },
      el('span', { class: 'net-label', text: 'Net' }),
      moneyEl(s.balance, s.balance >= 0 ? 'income' : 'expense'),
    ),
  );
  return row;
}

// ------------------------------------------------------------------ toolbar

function buildToolbar(categories: Category[], list: HTMLElement): HTMLElement {
  const toolbar = el('div', { class: 'card filter-card' });

  // Search
  const searchInput = textInput({ placeholder: 'Search notes, categories…', 'aria-label': 'Search transactions', value: q });
  searchInput.oninput = () => { q = searchInput.value; void refresh(list); };
  const searchBar = el('div', { class: 'search-bar' },
    el('span', { class: 'search-ic', html: icon('search') }),
    searchInput,
  );
  toolbar.appendChild(searchBar);

  // Type segmented
  toolbar.appendChild(segmented<'all' | 'expense' | 'income'>(
    [
      { value: 'all', label: 'All' },
      { value: 'expense', label: 'Expense' },
      { value: 'income', label: 'Income' },
    ],
    typeFilter,
    (v) => { typeFilter = v; void refresh(list); },
  ));

  // Category select
  const catSelect = selectInput(
    [{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
    catFilter,
    { 'aria-label': 'Filter by category' },
  );
  catSelect.onchange = () => { catFilter = catSelect.value; void refresh(list); };
  toolbar.appendChild(catSelect);

  // Date range
  const fromInput = textInput({ type: 'date', value: fromDate, 'aria-label': 'From date' });
  const toInput = textInput({ type: 'date', value: toDate, 'aria-label': 'To date' });
  fromInput.onchange = () => {
    if (fromInput.value === '' || isValidISODate(fromInput.value)) {
      fromDate = fromInput.value;
      void refresh(list);
    } else {
      fromInput.value = fromDate;
    }
  };
  toInput.onchange = () => {
    if (toInput.value === '' || isValidISODate(toInput.value)) {
      toDate = toInput.value;
      void refresh(list);
    } else {
      toInput.value = toDate;
    }
  };
  const dateRow = el('div', { class: 'date-row' },
    el('label', { class: 'field-inline' }, el('span', { text: 'From' }), fromInput),
    el('label', { class: 'field-inline' }, el('span', { text: 'To' }), toInput),
  );
  toolbar.appendChild(dateRow);

  // Clear
  const clearBtn = el('button', {
    class: 'btn link-btn',
    text: 'Clear filters',
    onclick: async () => {
      q = ''; typeFilter = 'all'; catFilter = ''; fromDate = ''; toDate = '';
      await refresh(list);
      // Sync DOM inputs with reset state.
      searchInput.value = '';
      catSelect.value = '';
      fromInput.value = '';
      toInput.value = '';
    },
  });
  toolbar.appendChild(el('div', { class: 'filter-clear' }, clearBtn));

  return toolbar;
}

/** Re-render only the list container with current filters. */
async function refresh(list: HTMLElement | null): Promise<void> {
  if (!list) return;
  const [txns, categories] = await Promise.all([
    store.listTransactions(),
    store.listCategories(),
  ]);
  const catMap = new Map<string, Category>(categories.map((c) => [c.id, c]));
  renderList(list, txns, catMap);
}

// ------------------------------------------------------------------ list

function renderList(root: HTMLElement, txns: Transaction[], catMap: Map<string, Category>): void {
  clear(root);

  if (txns.length === 0) {
    root.appendChild(emptyState({
      icon: 'receipt',
      title: 'No transactions yet',
      subtitle: 'Every rupee you log shows up here.',
      actionLabel: 'Add your first transaction',
      onAction: () => openAddSheet('expense'),
    }));
    return;
  }

  const filtered = applyFilters(txns, catMap);

  if (filtered.length === 0) {
    root.appendChild(emptyState({
      icon: 'search',
      title: 'No matches',
      subtitle: 'Try adjusting your search or filters.',
    }));
    return;
  }

  const currency = getSettings().currency;
  const shown = filtered.slice(0, ROW_CAP);
  let lastDate = '';
  for (const t of shown) {
    if (t.date !== lastDate) {
      lastDate = t.date;
      root.appendChild(el('div', { class: 'section-head', text: friendlyDate(t.date) }));
    }
    root.appendChild(txnRow(t, catMap, currency));
  }

  const remaining = filtered.length - shown.length;
  if (remaining > 0) {
    root.appendChild(el('p', {
      class: 'cap-note',
      text: `+${remaining} more — refine filters to see them`,
    }));
  }
}

function applyFilters(txns: Transaction[], catMap: Map<string, Category>): Transaction[] {
  const needle = q.trim().toLowerCase();
  const from = fromDate !== '' && isValidISODate(fromDate) ? fromDate : null;
  const to = toDate !== '' && isValidISODate(toDate) ? toDate : null;

  const out = txns.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (catFilter !== '' && t.categoryId !== catFilter) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (needle) {
      const catName = catMap.get(t.categoryId)?.name ?? 'Unknown category';
      const hay = [t.note ?? '', t.paymentMethod ?? '', catName].join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  // Newest first; store.listTransactions already sorts, but keep this pure-safe.
  out.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return out;
}

function txnRow(t: Transaction, catMap: Map<string, Category>, currency: string): HTMLElement {
  const cat = catMap.get(t.categoryId);
  const catName = cat?.name ?? 'Unknown category';
  const sub = [t.note, t.paymentMethod, friendlyDate(t.date)].filter((x): x is string => !!x).join(' • ');
  const row = el('button', {
    class: 'txn-row',
    type: 'button',
    onclick: () => openEditSheet(t),
  },
    categoryAvatar(cat),
    el('div', { class: 'txn-main' },
      el('div', { class: 'txn-name', text: catName }),
      el('div', { class: 'txn-sub', text: sub }),
    ),
    el('div', { class: 'txn-right' },
      el('div', {
        class: `txn-amt ${t.type === 'expense' ? 'expense' : 'income'}`,
        text: formatSigned(t.type === 'expense' ? -t.amount : t.amount, currency),
      }),
      el('div', { class: 'txn-date', text: friendlyDate(t.date) }),
    ),
  );
  return row;
}
