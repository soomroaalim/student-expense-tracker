/**
 * Recurring expenses view: list rules with enable toggles, create/edit/delete
 * forms in modals. Actual generation is idempotent (see core/recurring.ts);
 * this view only manages the rules.
 */
import {
  clear,
  el,
  field,
  textInput,
  selectInput,
  segmented,
  openModal,
  confirmDialog,
  emptyState,
  categoryAvatar,
  moneyEl,
  toast,
} from '../ui/components';
import { icon } from '../ui/icons';
import { store, getSettings, newId } from '../data/store';
import { parseAmount, amountErrorMessage } from '../core/money';
import { frequencyLabel } from '../core/recurring';
import { todayISO, friendlyDate, isValidISODate } from '../core/dates';
import type { Category, Recurrence, RecurringExpense } from '../model/types';
import { PAYMENT_METHODS, currencyMeta } from '../model/defaults';
import { navigate } from '../ui/nav';

const EXPENSE_KINDS = new Set(['expense', 'both']);

function catNameOf(catMap: Map<string, Category>, id: string): string {
  return catMap.get(id)?.name ?? 'Unknown category';
}

export async function renderRecurring(root: HTMLElement): Promise<void> {
  clear(root);
  const currency = getSettings().currency;
  const [rules, categories] = await Promise.all([
    store.listRecurring(),
    store.listCategories(),
  ]);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  root.appendChild(
    el('div', { class: 'view-head' },
      el('h1', { class: 'view-title', text: 'Recurring expenses' })),
  );

  const infoCard = el('div', { class: 'card info-card' });
  infoCard.append(
    el('div', { class: 'info-icon', html: icon('info') }),
    el('p', {
      class: 'text-sm',
      text: 'Recurring expenses are added automatically each time you open the app. No duplicates — ever.',
    }),
  );
  root.appendChild(infoCard);

  const openForm = (existing?: RecurringExpense): void =>
    recurringForm(existing, categories, catMap, currency);

  const listWrap = el('div', { class: 'stack' });
  if (rules.length === 0) {
    listWrap.appendChild(
      emptyState({
        icon: 'repeat',
        title: 'No recurring expenses',
        subtitle: 'Add your monthly mobile package, subscriptions, or transport pass.',
        actionLabel: 'Add recurring expense',
        onAction: () => openForm(),
      }),
    );
  } else {
    for (const rule of rules) {
      listWrap.appendChild(ruleCard(rule, catMap, () => openForm(rule)));
    }
  }
  root.appendChild(listWrap);
  root.appendChild(
    el('button', {
      class: 'btn btn-primary btn-block',
      text: 'Add recurring expense',
      onclick: () => openForm(),
    }),
  );
}

function ruleCard(
  rule: RecurringExpense,
  catMap: Map<string, Category>,
  onEdit: () => void,
): HTMLElement {
  const card = el('div', { class: 'card' });
  const cat = catMap.get(rule.categoryId);

  const toggle = el('label', { class: 'switch' });
  const checkbox = el('input', {
    type: 'checkbox',
    checked: rule.enabled,
    'aria-label': `Enable ${rule.note || catNameOf(catMap, rule.categoryId)}`,
    onchange: async () => {
      const enabled = (checkbox as HTMLInputElement).checked;
      await store.saveRecurring({ ...rule, enabled });
      toast(enabled ? 'Recurring expense enabled' : 'Recurring expense paused', 'success');
    },
  });
  toggle.append(checkbox, el('span', { class: 'track' }));

  const top = el('div', { class: 'row-between' });
  const identity = el('div', { class: 'avatar-row' });
  identity.append(
    categoryAvatar(cat),
    el('div', {},
      el('div', {
        class: 'card-title',
        text: rule.note?.trim() ? rule.note : catNameOf(catMap, rule.categoryId),
      }),
      el('div', { class: 'text-sm text-muted', text: catNameOf(catMap, rule.categoryId) }),
    ),
  );
  top.append(identity, toggle);
  card.appendChild(top);

  const mid = el('div', { class: 'row-between' });
  mid.append(
    moneyEl(rule.amount),
    el('span', { class: 'badge badge-info', text: frequencyLabel(rule.frequency) }),
  );
  card.appendChild(mid);

  const bottom = el('div', { class: 'row-between' });
  bottom.append(
    el('span', { class: 'text-sm text-muted', text: `Next: ${friendlyDate(rule.nextOccurrence)}` }),
    el('div', { class: 'card-actions inline' },
      el('button', {
        class: 'icon-btn',
        'aria-label': 'Edit recurring expense',
        html: icon('pencil'),
        onclick: onEdit,
      }),
      el('button', {
        class: 'icon-btn danger',
        'aria-label': 'Delete recurring expense',
        html: icon('trash'),
        onclick: async () => {
          const label = rule.note?.trim() || catNameOf(catMap, rule.categoryId);
          const ok = await confirmDialog({
            title: 'Delete recurring expense?',
            message: `"${label}" will no longer be generated automatically. Past transactions are kept.`,
            confirmLabel: 'Delete',
            danger: true,
          });
          if (ok) {
            await store.deleteRecurring(rule.id);
            toast('Recurring expense deleted', 'success');
            navigate('recurring');
          }
        },
      }),
    ),
  );
  card.appendChild(bottom);
  return card;
}

function recurringForm(
  existing: RecurringExpense | undefined,
  categories: Category[],
  catMap: Map<string, Category>,
  currency: string,
): void {
  const amountInput = textInput({
    placeholder: '0.00',
    inputmode: 'decimal',
    value: existing ? majorStr(existing.amount, currency) : '',
  }) as HTMLInputElement;

  const expenseCats = categories.filter((c) => EXPENSE_KINDS.has(c.kind));
  const catSelect = selectInput(
    expenseCats.map((c) => ({ value: c.id, label: c.name })),
    existing?.categoryId ?? expenseCats[0]?.id ?? '',
  );

  let frequency: Recurrence = existing?.frequency ?? 'monthly';
  const freqSeg = segmented<Recurrence>(
    [
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' },
    ],
    frequency,
    (v) => {
      frequency = v;
    },
  );

  const dateInput = textInput({
    type: 'date',
    value: existing?.nextOccurrence ?? todayISO(),
  }) as HTMLInputElement;
  const noteInput = textInput({
    placeholder: 'e.g. Monthly mobile package',
    value: existing?.note ?? '',
  }) as HTMLInputElement;
  const methodSelect = selectInput(
    [{ value: '', label: 'None' }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: m }))],
    existing?.paymentMethod ?? '',
  );

  const enabledToggle = el('label', { class: 'switch' });
  const enabledInput = el('input', { type: 'checkbox', checked: existing?.enabled ?? true }) as HTMLInputElement;
  enabledToggle.append(enabledInput, el('span', { class: 'track' }));
  const enabledRow = el('div', { class: 'row-between' });
  enabledRow.append(el('span', { text: 'Enabled' }), enabledToggle);

  const body = el('div', { class: 'form-stack' });
  body.append(
    field('Amount', amountInput),
    field('Category', catSelect),
    field('Frequency', freqSeg),
    field('Start date', dateInput),
    field('Note (optional)', noteInput),
    field('Payment method (optional)', methodSelect),
    enabledRow,
  );

  const handle = openModal({
    title: existing ? 'Edit recurring expense' : 'Add recurring expense',
    body,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: () => handle.close() },
      {
        label: 'Save',
        kind: 'primary',
        onClick: async () => {
          const parsed = parseAmount(amountInput.value, currency);
          if (!parsed.ok) {
            toast(amountErrorMessage(parsed), 'error');
            return;
          }
          const categoryId = catSelect.value;
          if (!categoryId || !catMap.has(categoryId)) {
            toast('Please choose a valid category.', 'error');
            return;
          }
          const startDate = dateInput.value.trim();
          if (!startDate || !isValidISODate(startDate)) {
            toast('Please enter a valid start date.', 'error');
            return;
          }
          const note = noteInput.value.trim() || undefined;
          const paymentMethod = methodSelect.value || undefined;
          const enabled = enabledInput.checked;

          if (existing) {
            await store.saveRecurring({
              ...existing,
              amount: parsed.minor,
              categoryId,
              frequency,
              nextOccurrence: startDate,
              note,
              paymentMethod,
              enabled,
            });
            toast('Recurring expense updated', 'success');
          } else {
            await store.saveRecurring({
              id: newId(),
              amount: parsed.minor,
              categoryId,
              frequency,
              nextOccurrence: startDate,
              note,
              paymentMethod,
              enabled,
              createdAt: Date.now(),
            });
            toast('Recurring expense added', 'success');
          }
          handle.close();
          navigate('recurring');
        },
      },
    ],
  });
}

function majorStr(minor: number, currency: string): string {
  const meta = currencyMeta(currency);
  const v = minor / meta.minorUnits;
  return String(Number(v.toFixed(2)));
}
