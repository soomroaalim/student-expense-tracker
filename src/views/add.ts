/**
 * Fast transaction entry: bottom-sheet style modal used by the FAB,
 * dashboard quick actions, and the transactions screen (edit).
 */
import { amountErrorMessage, parseAmount } from '../core/money';
import { isValidISODate, todayISO } from '../core/dates';
import { PAYMENT_METHODS } from '../model/defaults';
import type { Category, Transaction, TxnType } from '../model/types';
import { getSettings, newId, store } from '../data/store';
import {
  categoryAvatar, clear, confirmDialog, el, field, openModal, segmented, selectInput, textInput, toast,
} from '../ui/components';

export function openAddSheet(defaultType: TxnType = 'expense'): void {
  openSheet({ mode: 'add', type: defaultType });
}

export function openEditSheet(txn: Transaction): void {
  openSheet({ mode: 'edit', txn });
}

interface SheetOpts {
  mode: 'add' | 'edit';
  type?: TxnType;
  txn?: Transaction;
}

function openSheet(opts: SheetOpts): void {
  const isEdit = opts.mode === 'edit';
  const txn = opts.txn;
  let type: TxnType = txn?.type ?? opts.type ?? 'expense';
  let selectedCatId = txn?.categoryId ?? '';

  const body = el('div', { class: 'add-sheet' });

  async function renderBody(): Promise<void> {
    clear(body);
    const categories = await store.listCategories();
    const visible = categories.filter((c) => c.kind === type || c.kind === 'both');
    if (!visible.some((c) => c.id === selectedCatId)) {
      selectedCatId = txn?.categoryId && visible.some((c) => c.id === txn.categoryId)
        ? txn.categoryId
        : (visible[0]?.id ?? '');
    }

    if (!isEdit) {
      body.appendChild(segmented<TxnType>(
        [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }],
        type,
        (v) => { type = v; selectedCatId = ''; void renderBody(); },
      ));
    }

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

    const err = el('span', { class: 'field-error' });

    body.append(
      field('Amount', amountInput),
      field('Category', catGrid),
      field('Date', dateInput),
      field('Note', noteInput),
    );
    if (type === 'expense') body.appendChild(field('Payment method', pmSelect));
    body.appendChild(err);

    amountInput.focus({ preventScroll: true });

    async function save(): Promise<void> {
      err.textContent = '';
      const parsed = parseAmount(amountInput.value, getSettings().currency);
      if (!parsed.ok) { err.textContent = amountErrorMessage(parsed); amountInput.focus(); return; }
      if (!selectedCatId) { err.textContent = 'Please choose a category.'; return; }
      if (!isValidISODate(dateInput.value)) { err.textContent = 'Please choose a valid date.'; return; }
      const now = Date.now();
      try {
        if (isEdit && txn) {
          await store.saveTransaction({
            ...txn,
            type,
            amount: parsed.minor,
            categoryId: selectedCatId,
            date: dateInput.value,
            note: noteInput.value.trim() || undefined,
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
            paymentMethod: type === 'expense' ? (pmSelect.value || undefined) : undefined,
            createdAt: now,
            updatedAt: now,
          };
          await store.saveTransaction(t);
          toast(type === 'expense' ? 'Expense added.' : 'Income added.', 'success');
        }
        handle.close();
      } catch {
        err.textContent = 'Could not save. Please try again.';
      }
    }

    const actions: Array<{ label: string; kind?: 'primary' | 'danger' | 'ghost'; onClick: () => void | Promise<void> }> = [
      { label: isEdit ? 'Save changes' : (type === 'expense' ? 'Add expense' : 'Add income'), kind: 'primary', onClick: save },
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
  const title = isEdit
    ? (txn!.type === 'expense' ? 'Edit expense' : 'Edit income')
    : (type === 'expense' ? 'Add expense' : 'Add income');

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
