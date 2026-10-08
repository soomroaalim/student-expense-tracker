/**
 * Debt management: totals (borrowed / repaid / remaining), repayment flow,
 * and a history of borrowed + repayment transactions. Not in the bottom
 * nav — reached from the dashboard debt card.
 */
import { accountingSummary, validateRepayment } from '../core/accounting';
import { friendlyDate, todayISO } from '../core/dates';
import { formatMoney, parseAmount, amountErrorMessage } from '../core/money';
import { getSettings, newId, store } from '../data/store';
import type { Category, Transaction } from '../model/types';
import { txnTypeLabel } from '../model/types';
import {
  categoryAvatar, clear, el, emptyState, field, fitAmounts, openModal, textInput, toast,
} from '../ui/components';
import { icon } from '../ui/icons';
import { navigate } from '../ui/nav';

export async function renderDebt(root: HTMLElement): Promise<void> {
  clear(root);
  const [txns, categories] = await Promise.all([
    store.listTransactions(),
    store.listCategories(),
  ]);
  const currency = getSettings().currency;
  const catMap = new Map<string, Category>(categories.map((c) => [c.id, c]));
  const acct = accountingSummary(txns);

  root.appendChild(
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('chevron-left'), onclick: () => navigate('home') }),
      el('h1', { class: 'page-title', text: 'Debt' }),
    ),
  );

  const stat = (label: string, value: number, cls = '') =>
    el('div', { class: 'qstat' },
      el('div', { class: 'l', text: label }),
      el('div', { class: `v fit-amt ${cls}`, text: formatMoney(value, currency) }));

  root.appendChild(
    el('div', { class: 'card' },
      el('div', { class: 'quick-stats', style: 'grid-template-columns:repeat(3,1fr)' },
        stat('Borrowed', acct.borrowed),
        stat('Repaid', acct.debtRepaid),
        stat('Remaining', acct.outstandingDebt, acct.outstandingDebt > 0 ? 'text-danger' : ''),
      ),
    ),
  );

  root.appendChild(
    el('button', {
      class: 'btn btn-primary btn-block', text: 'Repay debt',
      disabled: acct.outstandingDebt <= 0,
      onclick: () => openRepayModal(acct.outstandingDebt, acct.availableCash, currency),
    }),
  );
  fitAmounts(root);
  if (acct.outstandingDebt <= 0) {
    root.appendChild(el('p', { class: 'txn-sub', text: 'No outstanding debt. Nice!' }));
  }

  const debtTxns = txns.filter((t) => t.type === 'borrowed' || t.type === 'debt_repayment');
  root.appendChild(el('h3', { class: 'section-head', text: 'History' }));
  if (debtTxns.length === 0) {
    root.appendChild(emptyState({
      icon: 'coins',
      title: 'No debt activity',
      subtitle: 'Borrowed money and repayments will show up here.',
    }));
    return;
  }
  const list = el('div', { class: 'txn-list' });
  for (const t of debtTxns) {
    list.appendChild(debtRow(t, catMap, currency));
  }
  root.appendChild(list);
}

function debtRow(t: Transaction, catMap: Map<string, Category>, currency: string): HTMLElement {
  const cat = catMap.get(t.categoryId);
  const isBorrow = t.type === 'borrowed';
  const title = isBorrow
    ? (t.lender ? `Borrowed from ${t.lender}` : 'Borrowed')
    : (t.note?.trim() || 'Debt repayment');
  const sub = [txnTypeLabel(t.type), friendlyDate(t.date)].join(' • ');
  const signed = isBorrow ? t.amount : -t.amount;
  return el('div', { class: 'txn-row' },
    categoryAvatar(cat),
    el('div', { class: 'txn-main' },
      el('div', { class: 'txn-name', text: title }),
      el('div', { class: 'txn-sub', text: sub }),
    ),
    el('div', { class: 'txn-amt ' + (isBorrow ? 'income' : 'expense'), text: formatMoney(signed, currency) }),
  );
}

function openRepayModal(outstandingDebt: number, availableCash: number, currency: string): void {
  const body = el('div', {});
  const amountInput = textInput({
    placeholder: '0', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Repayment amount',
  });
  const err = el('span', { class: 'field-error' });
  body.append(
    el('p', { class: 'lede', text: `Outstanding debt: ${formatMoney(outstandingDebt, currency)}. Available cash: ${formatMoney(availableCash, currency)}.` }),
    field('Amount to repay', amountInput),
    err,
  );
  const handle = openModal({
    title: 'Repay debt',
    body,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: () => handle.close() },
      {
        label: 'Repay', kind: 'primary',
        onClick: async () => {
          err.textContent = '';
          const parsed = parseAmount(amountInput.value, currency);
          if (!parsed.ok) { err.textContent = amountErrorMessage(parsed); return; }
          const check = validateRepayment(parsed.minor, outstandingDebt, availableCash);
          if (!check.ok) { err.textContent = check.reason ?? 'Invalid repayment.'; return; }
          const now = Date.now();
          const categories = await store.listCategories();
          const fallback = categories.find((c) => c.kind !== 'income') ?? categories[0];
          await store.saveTransaction({
            id: newId(),
            type: 'debt_repayment',
            amount: parsed.minor,
            categoryId: fallback?.id ?? 'cat-other',
            date: todayISO(),
            note: 'Debt repayment',
            createdAt: now,
            updatedAt: now,
          });
          toast(`Debt repaid — ${formatMoney(parsed.minor, currency)}`, 'success');
          handle.close();
          navigate('debt');
        },
      },
    ],
  });
}
