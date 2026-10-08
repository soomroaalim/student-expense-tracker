/**
 * Fast transaction entry: bottom-sheet style modal used by the FAB,
 * dashboard quick actions, and the transactions screen (edit).
 */
import { amountErrorMessage, formatMoney, parseAmount } from '../core/money';
import { accountingSummary, expenseShortfall, validateRepayment } from '../core/accounting';
import { isValidISODate, todayISO } from '../core/dates';
import { PAYMENT_METHODS } from '../model/defaults';
import type { Category, Transaction, TxnType } from '../model/types';
import { getSettings, newId, store } from '../data/store';
import {
  categoryAvatar, clear, confirmDialog, el, field, openModal, selectInput, textInput, toast,
} from '../ui/components';
import { currentRoute, navigate } from '../ui/nav';

export function openAddSheet(defaultType: TxnType = 'expense'): void {
  openSheet({ mode: 'add', type: defaultType });
}

/**
 * Extremely fast expense entry: amount -> category -> save.
 * Date defaults to today; note/payment method stay optional via "More options".
 * `presetMinor` optionally pre-fills the amount (e.g. from the calculator).
 */
export function openQuickAdd(presetMinor?: number): void {
  const body = el('div', { class: 'add-sheet' });
  const currency = getSettings().currency;
  let selectedCatId = '';

  const amountInput = textInput({
    class: 'input amount-input',
    placeholder: '0',
    inputmode: 'decimal',
    autocomplete: 'off',
    'aria-label': 'Amount',
    value: presetMinor && presetMinor > 0 ? String(presetMinor / 100) : '',
  });
  const catGrid = el('div', { class: 'cat-grid' });
  const err = el('span', { class: 'field-error' });

  body.append(
    field('Amount', amountInput),
    field('Category', catGrid),
    err,
    el('button', {
      class: 'btn btn-ghost btn-block', text: 'More options (note, date, payment method)',
      onclick: () => { handle.close(); openAddSheet('expense'); },
    }),
  );

  async function save(): Promise<void> {
    err.textContent = '';
    const parsed = parseAmount(amountInput.value, currency);
    if (!parsed.ok) { err.textContent = amountErrorMessage(parsed); amountInput.focus(); return; }
    if (!selectedCatId) { err.textContent = 'Please choose a category.'; return; }
    const now = Date.now();
    const cash = accountingSummary(await store.listTransactions()).availableCash;
    const short = expenseShortfall(cash, parsed.minor);
    if (short) {
      openShortfallModal(short, currency, async (borrowMinor, lender) => {
        await saveExpenseWithBorrow({
          expenseMinor: parsed.minor, borrowMinor, lender,
          categoryId: selectedCatId, date: todayISO(),
          currency, now, isEdit: false,
        });
        handle.close();
      });
      return;
    }
    await store.saveTransaction({
      id: newId(), type: 'expense', amount: parsed.minor,
      categoryId: selectedCatId, date: todayISO(),
      createdAt: now, updatedAt: now,
    });
    toast(`Expense added — ${formatMoney(parsed.minor, currency)}`, 'success');
    handle.close();
  }

  const handle = openModal({
    title: 'Quick add expense',
    body,
    dismissible: true,
    actions: [{ label: 'Save', kind: 'primary', onClick: save }],
  });
  amountInput.focus({ preventScroll: true });
  amountInput.onkeydown = (e) => { if (e.key === 'Enter') void save(); };

  void fillCats();
  async function fillCats(): Promise<void> {
    const categories = await store.listCategories();
    const visible = categories.filter((c) => c.kind === 'expense' || c.kind === 'both').slice(0, 8);
    if (!visible.some((c) => c.id === selectedCatId)) selectedCatId = visible[0]?.id ?? '';
    for (const c of visible) {
      const btn = el('button', {
        type: 'button',
        class: `cat-pick${c.id === selectedCatId ? ' active' : ''}`,
        onclick: () => {
          selectedCatId = c.id;
          catGrid.querySelectorAll('.cat-pick').forEach((n) => n.classList.remove('active'));
          btn.classList.add('active');
        },
      }, categoryAvatar(c, 'sm'), el('span', { class: 'lbl', text: c.name }));
      catGrid.appendChild(btn);
    }
  }
}

export function openEditSheet(txn: Transaction): void {
  openSheet({ mode: 'edit', txn });
}

interface SheetOpts {
  mode: 'add' | 'edit';
  type?: TxnType;
  txn?: Transaction;
}

/** Types the user can pick when adding/editing money movement. Opening balance stays in onboarding/settings. */
const MONEY_IN: TxnType[] = ['income', 'gift_received', 'borrowed'];
const MONEY_OUT: TxnType[] = ['expense', 'debt_repayment'];

function typeDisplayName(t: TxnType): string {
  switch (t) {
    case 'income': return 'Income';
    case 'gift_received': return 'Gift';
    case 'borrowed': return 'Borrowed Money';
    case 'expense': return 'Expense';
    case 'debt_repayment': return 'Debt Repayment';
    case 'opening_balance': return 'Opening Balance';
  }
}

function addLabelFor(t: TxnType): string {
  switch (t) {
    case 'expense': return 'Add expense';
    case 'income': return 'Add income';
    case 'gift_received': return 'Add gift';
    case 'borrowed': return 'Record borrowed money';
    case 'debt_repayment': return 'Record repayment';
    case 'opening_balance': return 'Add opening balance';
  }
}

function openSheet(opts: SheetOpts): void {
  const isEdit = opts.mode === 'edit';
  const txn = opts.txn;
  let type: TxnType = txn?.type ?? opts.type ?? 'expense';
  let selectedCatId = txn?.categoryId ?? '';

  const body = el('div', { class: 'add-sheet' });

  /** Category kinds visible for the current type. */
  function visibleCategories(categories: Category[]): Category[] {
    if (type === 'income') return categories.filter((c) => c.kind === 'income' || c.kind === 'both');
    if (type === 'expense') return categories.filter((c) => c.kind === 'expense' || c.kind === 'both');
    return categories; // gift, borrowed, repayment, opening: all
  }

  /** Grouped type picker: MONEY RECEIVED vs MONEY OUT. */
  function typePicker(onChange: () => void): HTMLElement {
    const wrap = el('div', { class: 'type-groups' });
    const group = (label: string, types: TxnType[]) => {
      const g = el('div', { class: 'type-group' }, el('div', { class: 'type-group-label', text: label }));
      const row = el('div', { class: 'type-group-row' });
      for (const t of types) {
        const btn = el('button', {
          type: 'button',
          class: `type-pick${t === type ? ' active' : ''}`,
          'aria-pressed': String(t === type),
        }, el('span', { text: typeDisplayName(t) }));
        btn.addEventListener('click', () => {
          type = t; selectedCatId = '';
          onChange();
        });
        row.appendChild(btn);
      }
      g.appendChild(row);
      return g;
    };
    wrap.append(group('Money received', MONEY_IN), group('Money out', MONEY_OUT));
    return wrap;
  }

  async function renderBody(): Promise<void> {
    clear(body);
    const categories = await store.listCategories();
    const visible = visibleCategories(categories);
    if (!visible.some((c) => c.id === selectedCatId)) {
      selectedCatId = txn?.categoryId && visible.some((c) => c.id === txn.categoryId)
        ? txn.categoryId
        : (visible[0]?.id ?? '');
    }

    body.appendChild(typePicker(() => void renderBody()));

    const amountInput = textInput({
      class: 'input amount-input',
      placeholder: '0',
      inputmode: 'decimal',
      autocomplete: 'off',
      value: txn ? String(txn.amount / 100) : '',
      'aria-label': 'Amount',
    });

    const catGrid = el('div', { class: 'cat-grid' });
    for (const c of visible) {
      const btn = el('button', {
        type: 'button',
        class: `cat-pick${c.id === selectedCatId ? ' active' : ''}`,
        onclick: () => {
          selectedCatId = c.id;
          catGrid.querySelectorAll('.cat-pick').forEach((n) => n.classList.remove('active'));
          btn.classList.add('active');
        },
      }, categoryAvatar(c, 'sm'), el('span', { class: 'lbl', text: c.name }));
      catGrid.appendChild(btn);
    }

    const dateInput = textInput({ type: 'date', value: txn?.date ?? todayISO() });
    const noteInput = textInput({ placeholder: 'Optional note', maxlength: '120', value: txn?.note ?? '' });
    const pmSelect = selectInput(
      [{ value: '', label: 'Not specified' }, ...PAYMENT_METHODS.map((p) => ({ value: p, label: p }))],
      txn?.paymentMethod ?? '',
    );
    // "From" field for gifts and borrowed money (who gave / lent it).
    const fromInput = textInput({
      placeholder: type === 'gift_received' ? 'Who gave it? (optional)' : 'Who lent it? (optional)',
      maxlength: '60',
      value: txn?.lender ?? '',
    });

    const err = el('span', { class: 'field-error' });

    body.append(
      field('Amount', amountInput),
      field('Category', catGrid),
    );
    if (type === 'gift_received' || type === 'borrowed') {
      body.appendChild(field(type === 'gift_received' ? 'From (optional)' : 'Borrowed from (optional)', fromInput));
    }
    body.append(field('Date', dateInput), field('Note', noteInput));
    if (type === 'expense') body.appendChild(field('Payment method', pmSelect));
    body.appendChild(err);

    amountInput.focus({ preventScroll: true });

    async function save(): Promise<void> {
      err.textContent = '';
      const currency = getSettings().currency;
      const parsed = parseAmount(amountInput.value, currency);
      if (!parsed.ok) { err.textContent = amountErrorMessage(parsed); amountInput.focus(); return; }
      if (!selectedCatId) { err.textContent = 'Please choose a category.'; return; }
      if (!isValidISODate(dateInput.value)) { err.textContent = 'Please choose a valid date.'; return; }
      const now = Date.now();
      const lender = (type === 'gift_received' || type === 'borrowed')
        ? (fromInput.value.trim() || undefined)
        : undefined;

      // Insufficient-funds guard for expenses: never silently overspend.
      if (type === 'expense') {
        const allTxns = await store.listTransactions();
        let cash = accountingSummary(allTxns).availableCash;
        if (isEdit && txn && txn.type === 'expense') cash += txn.amount; // old amount returns to cash
        const short = expenseShortfall(cash, parsed.minor);
        if (short) {
          openShortfallModal(short, currency, async (borrowMinor, borrowLender) => {
            await saveExpenseWithBorrow({
              expenseMinor: parsed.minor, borrowMinor, lender: borrowLender,
              categoryId: selectedCatId, date: dateInput.value,
              note: noteInput.value.trim() || undefined,
              paymentMethod: pmSelect.value || undefined,
              currency, now, isEdit, oldTxn: txn,
            });
            handle.close();
            navigate(currentRoute());
          });
          return;
        }
      }

      // Debt repayment guard: must not exceed debt or available cash.
      if (type === 'debt_repayment') {
        const allTxns = await store.listTransactions();
        const acct = accountingSummary(allTxns);
        let debt = acct.outstandingDebt;
        let cash = acct.availableCash;
        if (isEdit && txn) {
          if (txn.type === 'debt_repayment') { debt += txn.amount; cash += txn.amount; }
          else if (txn.type === 'borrowed') { debt -= txn.amount; }
          else if (txn.type === 'expense') { cash += txn.amount; }
          else { cash -= txn.amount; } // cash-in types: old amount leaves cash
        }
        const check = validateRepayment(parsed.minor, debt, cash);
        if (!check.ok) { err.textContent = check.reason ?? 'Invalid repayment.'; return; }
      }

      const addedLabel: Record<TxnType, string> = {
        expense: 'Expense added',
        income: 'Income added',
        gift_received: 'Gift added',
        borrowed: 'Borrowed money recorded',
        debt_repayment: 'Debt repayment recorded',
        opening_balance: 'Opening balance added',
      };

      try {
        if (isEdit && txn) {
          await store.saveTransaction({
            ...txn,
            type,
            amount: parsed.minor,
            categoryId: selectedCatId,
            date: dateInput.value,
            note: noteInput.value.trim() || undefined,
            lender,
            paymentMethod: type === 'expense' ? (pmSelect.value || undefined) : undefined,
            updatedAt: now,
          });
          toast('Transaction updated.', 'success');
        } else {
          const t: Transaction = {
            id: newId(),
            type,
            amount: parsed.minor,
            categoryId: selectedCatId,
            date: dateInput.value,
            note: noteInput.value.trim() || undefined,
            lender,
            paymentMethod: type === 'expense' ? (pmSelect.value || undefined) : undefined,
            createdAt: now,
            updatedAt: now,
          };
          await store.saveTransaction(t);
          toast(`${addedLabel[type]} — ${formatMoney(parsed.minor, currency)}`, 'success');
        }
        handle.close();
        navigate(currentRoute());
      } catch {
        err.textContent = 'Could not save. Please try again.';
      }
    }

    const actions: Array<{ label: string; kind?: 'primary' | 'danger' | 'ghost'; onClick: () => void | Promise<void> }> = [
      { label: isEdit ? 'Save changes' : addLabelFor(type), kind: 'primary', onClick: save },
    ];
    if (isEdit && txn) {
      actions.unshift({
        label: 'Delete', kind: 'danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Delete transaction?',
            message: 'This will permanently remove the transaction. This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true,
          });
          if (ok) {
            await store.deleteTransaction(txn.id);
            toast('Transaction deleted.', 'success');
            handle.close();
            navigate(currentRoute());
          }
        },
      });
    }
    footer.replaceChildren();
    for (const a of actions) {
      footer.appendChild(el('button', {
        class: `btn btn-${a.kind ?? 'ghost'}`,
        text: a.label,
        onclick: () => void a.onClick(),
      }));
    }
    amountInput.onkeydown = (e) => {
      if (e.key === 'Enter') void save();
    };
  }

  const footer = el('div', { class: 'modal-actions' });
  const title = isEdit ? `Edit ${typeDisplayName(txn!.type).toLowerCase()}` : addLabelFor(type);

  const handle = openModal({ title, body, dismissible: true });
  // Our footer is rebuilt whenever the type changes (label updates).
  handle.root.querySelector('.modal')!.append(footer);
  void renderBody();

  void categoriesHint();
  async function categoriesHint(): Promise<void> {
    const cats: Category[] = await store.listCategories();
    if (cats.length === 0) toast('No categories found. Add some in Settings.', 'error');
  }
}

// ------------------------------------------------------------------ insufficient funds flow

interface BorrowResult {
  expenseMinor: number;
  borrowMinor: number;
  lender?: string;
  categoryId: string;
  date: string;
  note?: string;
  paymentMethod?: string;
  currency: string;
  now: number;
  isEdit: boolean;
  oldTxn?: Transaction;
}

/**
 * "Not enough money" modal. Cancel rejects the expense; "Yes, I borrowed
 * money" opens the borrow-amount step.
 */
function openShortfallModal(
  short: { availableCash: number; expenseAmount: number; needed: number },
  currency: string,
  onBorrow: (borrowMinor: number, lender: string | undefined) => void | Promise<void>,
): void {
  const body = el('div', {},
    el('p', { class: 'lede', text: `You have ${formatMoney(short.availableCash, currency)} available, but this expense is ${formatMoney(short.expenseAmount, currency)}.` }),
    el('p', { class: 'lede', text: `You need ${formatMoney(short.needed, currency)} more.` }),
    el('p', { text: 'Did you borrow money for this expense?' }),
  );
  const handle = openModal({
    title: 'Not enough money',
    body,
    actions: [
      {
        label: 'Cancel', kind: 'ghost',
        onClick: () => {
          handle.close();
          toast("Expense not added. You don't have enough available money.", 'info');
        },
      },
      {
        label: 'Yes, I borrowed money', kind: 'primary',
        onClick: () => { handle.close(); openBorrowModal(short, currency, onBorrow); },
      },
    ],
  });
}

/** "Record borrowed money" step — amount defaults to the shortfall. */
function openBorrowModal(
  short: { availableCash: number; expenseAmount: number; needed: number },
  currency: string,
  onBorrow: (borrowMinor: number, lender: string | undefined) => void | Promise<void>,
): void {
  const meta = { minorUnits: 100 };
  const amountInput = textInput({
    placeholder: '0', inputmode: 'decimal', autocomplete: 'off',
    value: String(short.needed / meta.minorUnits),
    'aria-label': 'Amount borrowed',
  });
  const lenderInput = textInput({ placeholder: 'e.g. Friend, Family (optional)', maxlength: '60', 'aria-label': 'Lender' });
  const err = el('span', { class: 'field-error' });
  const body = el('div', {},
    el('p', { class: 'lede', text: `You need ${formatMoney(short.needed, currency)} more for this expense.` }),
    field('Amount borrowed', amountInput),
    field('Borrowed from (optional)', lenderInput),
    err,
  );
  const handle = openModal({
    title: 'Record borrowed money',
    body,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: () => handle.close() },
      {
        label: 'Continue', kind: 'primary',
        onClick: async () => {
          err.textContent = '';
          const parsed = parseAmount(amountInput.value, currency);
          if (!parsed.ok) { err.textContent = amountErrorMessage(parsed); return; }
          if (parsed.minor < short.needed) {
            err.textContent = `Borrow at least ${formatMoney(short.needed, currency)} to cover this expense.`;
            return;
          }
          const lender = lenderInput.value.trim() || undefined;
          handle.close();
          await onBorrow(parsed.minor, lender);
        },
      },
    ],
  });
  amountInput.focus({ preventScroll: true });
}

/**
 * Persist the expense together with its funding borrow transaction.
 * The borrow is linked to the expense via linkedExpenseId.
 */
async function saveExpenseWithBorrow(r: BorrowResult): Promise<void> {
  const expenseId = r.isEdit && r.oldTxn ? r.oldTxn.id : newId();
  const expense: Transaction = {
    id: expenseId,
    type: 'expense',
    amount: r.expenseMinor,
    categoryId: r.categoryId,
    date: r.date,
    note: r.note,
    paymentMethod: r.paymentMethod,
    createdAt: r.isEdit && r.oldTxn ? r.oldTxn.createdAt : r.now,
    updatedAt: r.now,
  };
  const borrow: Transaction = {
    id: newId(),
    type: 'borrowed',
    amount: r.borrowMinor,
    categoryId: r.categoryId,
    date: r.date,
    note: r.lender ? `Borrowed from ${r.lender}` : 'Borrowed money',
    lender: r.lender,
    linkedExpenseId: expenseId,
    createdAt: r.now,
    updatedAt: r.now,
  };
  expense.linkedExpenseId = borrow.id;
  await store.saveTransaction(expense);
  await store.saveTransaction(borrow);
  toast(
    `Expense added — ${formatMoney(r.expenseMinor, r.currency)} (borrowed ${formatMoney(r.borrowMinor, r.currency)})`,
    'success',
  );
}
