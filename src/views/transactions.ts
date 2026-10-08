/**
 * Transaction history screen: searchable, filterable chronological list
 * with date grouping. Filter state lives in module-level variables so it
 * survives full view re-renders; renderList() redraws only the list
 * container so input focus is preserved.
 */
import { clear, el, emptyState, moneyEl, categoryAvatar, segmented, selectInput, textInput } from '../ui/components';
import { icon } from '../ui/icons';
import { getSettings, store } from '../data/store';
import { formatMoney } from '../core/money';
import { friendlyDate, isValidISODate } from '../core/dates';
import { filterTransactions } from '../core/finance';
import { netOf } from '../core/accounting';
import { openAddSheet, openEditSheet } from './add';
import type { Category, Transaction, TxnType } from '../model/types';
import { txnSignedAmount, txnTypeLabel } from '../model/types';

// ------------------------------------------------------------------ filter state (module-level; survives re-render)

let q = '';
let typeFilter: 'all' | TxnType = 'all';
let catFilter = '';
let fromDate = '';
let toDate = '';

const ROW_CAP = 500;

// ------------------------------------------------------------------ view

export async function renderTransactions(root: HTMLElement): Promise<void> {
  clear(root);

  const categories = await store.listCategories();

  const summary = el('div');
  const list = el('div', { class: 'txn-list' });
  root.append(
    el('div', { class: 'page-head' },
      el('h1', { class: 'page-title', text: 'Transactions' }),
    ),
    summary,
    buildToolbar(categories, () => refresh(summary, list)),
    list,
  );
  await refresh(summary, list);
}

// ------------------------------------------------------------------ summary

function buildSummaryCard(filtered: Transaction[]): HTMLElement {
  const net = netOf(filtered);
  const count = filtered.length;
  const row = el('div', { class: 'row-between card summary-card' });
  row.append(
    el('span', { class: 'txn-count', text: `${count} transaction${count === 1 ? '' : 's'}` }),
    el('span', { class: 'net-wrap' },
      el('span', { class: 'net-label', text: 'Net' }),
      moneyEl(net, net >= 0 ? 'income' : 'expense'),
    ),
  );
  return row;
}

// ------------------------------------------------------------------ toolbar

function buildToolbar(categories: Category[], onFilterChange: () => void): HTMLElement {
  const toolbar = el('div', { class: 'card filter-card' });

  // Search
  const searchInput = textInput({ placeholder: 'Search notes, categories…', 'aria-label': 'Search transactions', value: q });
  searchInput.oninput = () => { q = searchInput.value; onFilterChange(); };
  const searchBar = el('div', { class: 'search-bar' },
    el('span', { class: 'search-ic', html: icon('search') }),
    searchInput,
  );
  toolbar.appendChild(searchBar);

  // Type segmented
  toolbar.appendChild(segmented<'all' | TxnType>(
    [
      { value: 'all', label: 'All' },
      { value: 'expense', label: 'Expense' },
      { value: 'income', label: 'Income' },
      { value: 'gift_received', label: 'Gift' },
      { value: 'borrowed', label: 'Borrowed' },
      { value: 'debt_repayment', label: 'Repaid' },
    ],
    typeFilter,
    (v) => { typeFilter = v; onFilterChange(); },
  ));

  // Category select
  const catSelect = selectInput(
    [{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
    catFilter,
    { 'aria-label': 'Filter by category' },
  );
  catSelect.onchange = () => { catFilter = catSelect.value; onFilterChange(); };
  toolbar.appendChild(catSelect);

  // Date range
  const fromInput = textInput({ type: 'date', value: fromDate, 'aria-label': 'From date' });
  const toInput = textInput({ type: 'date', value: toDate, 'aria-label': 'To date' });
  fromInput.onchange = () => {
    if (fromInput.value === '' || isValidISODate(fromInput.value)) {
      fromDate = fromInput.value;
      onFilterChange();
    } else {
      fromInput.value = fromDate;
    }
  };
  toInput.onchange = () => {
    if (toInput.value === '' || isValidISODate(toInput.value)) {
      toDate = toInput.value;
      onFilterChange();
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
      // Sync DOM inputs with reset state.
      searchInput.value = '';
      catSelect.value = '';
      fromInput.value = '';
      toInput.value = '';
      // Reset segmented active state to "All".
      const segBtns = toolbar.querySelectorAll('.seg-btn');
      segBtns.forEach((b, i) => {
        const isActive = i === 0;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      onFilterChange();
    },
  });
  toolbar.appendChild(el('div', { class: 'filter-clear' }, clearBtn));

  return toolbar;
}

/** Re-render summary + list with current filters. */
async function refresh(summary: HTMLElement, list: HTMLElement): Promise<void> {
  const [txns, categories] = await Promise.all([
    store.listTransactions(),
    store.listCategories(),
  ]);
  const catMap = new Map<string, Category>(categories.map((c) => [c.id, c]));
  const filtered = applyFilters(txns, catMap);
  clear(summary);
  summary.appendChild(buildSummaryCard(filtered));
  renderList(list, filtered, catMap);
}

// ------------------------------------------------------------------ list

function renderList(root: HTMLElement, filtered: Transaction[], catMap: Map<string, Category>): void {
  clear(root);

  if (filtered.length === 0) {
    const hasActiveFilters = q !== '' || typeFilter !== 'all' || catFilter !== '' || fromDate !== '' || toDate !== '';
    root.appendChild(emptyState(hasActiveFilters ? {
      icon: 'search',
      title: 'No matches',
      subtitle: 'Try adjusting your search or filters.',
    } : {
      icon: 'receipt',
      title: 'No transactions yet',
      subtitle: 'Every rupee you log shows up here.',
      actionLabel: 'Add your first transaction',
      onAction: () => openAddSheet('expense'),
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

/** Reset module filter state (used by tests and navigation). */
export function resetTxnFilters(): void {
  q = ''; typeFilter = 'all'; catFilter = ''; fromDate = ''; toDate = '';
}

function applyFilters(txns: Transaction[], catMap: Map<string, Category>): Transaction[] {
  const categoryName = (id: string) => catMap.get(id)?.name ?? 'Unknown category';
  return filterTransactions(txns, categoryName, { q, type: typeFilter, categoryId: catFilter, from: fromDate, to: toDate });
}

function txnRow(t: Transaction, catMap: Map<string, Category>, currency: string): HTMLElement {
  const cat = catMap.get(t.categoryId);
  const catName = cat?.name ?? 'Unknown category';
  const title = t.type === 'borrowed' && t.lender
    ? `Borrowed from ${t.lender}`
    : t.type === 'opening_balance'
      ? 'Starting balance'
      : catName;
  const sub = [txnTypeLabel(t.type), t.note, t.paymentMethod, friendlyDate(t.date)].filter((x): x is string => !!x).join(' • ');
  const signed = txnSignedAmount(t.type, t.amount);
  const amtCls = signed >= 0 ? 'income' : 'expense';
  const row = el('button', {
    class: 'txn-row',
    type: 'button',
    onclick: () => openEditSheet(t),
  },
    categoryAvatar(cat),
    el('div', { class: 'txn-main' },
      el('div', { class: 'txn-name', text: title }),
      el('div', { class: 'txn-sub', text: sub }),
    ),
    el('div', { class: 'txn-right' },
      el('div', {
        class: `txn-amt ${amtCls}`,
        text: formatMoney(signed, currency),
      }),
      el('div', { class: 'txn-date', text: friendlyDate(t.date) }),
    ),
  );
  return row;
}
