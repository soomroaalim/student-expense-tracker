/**
 * Budgets view: list budgets with current usage, plus create/edit/delete
 * forms in modals. All calculations use budgetUsage() (no AI).
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
  progressBar,
  toast,
} from '../ui/components';
import { icon } from '../ui/icons';
import { store, getSettings, newId } from '../data/store';
import { formatMoney, parseAmount, amountErrorMessage } from '../core/money';
import { budgetUsage, budgetWarningText } from '../core/budgets';
import type { Budget, BudgetPeriod, Category } from '../model/types';
import { currencyMeta } from '../model/defaults';

type Usage = ReturnType<typeof budgetUsage>;

const EXPENSE_KINDS = new Set(['expense', 'both']);

function catNameOf(catMap: Map<string, Category>, id: string | undefined): string {
  return id ? (catMap.get(id)?.name ?? 'Unknown category') : 'Unknown category';
}

function majorStr(minor: number, currency: string): string {
  const meta = currencyMeta(currency);
  const v = minor / meta.minorUnits;
  return String(Number(v.toFixed(2)));
}

export async function renderBudgets(root: HTMLElement): Promise<void> {
  clear(root);
  const currency = getSettings().currency;
  const [budgets, txns, categories] = await Promise.all([
    store.listBudgets(),
    store.listTransactions(),
    store.listCategories(),
  ]);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  root.appendChild(
    el('div', { class: 'view-head' }, el('h1', { class: 'view-title', text: 'Budgets' })),
  );

  const openForm = (existing?: Budget): void =>
    budgetForm(existing, categories, catMap, currency);

  const listWrap = el('div', { class: 'stack' });
  const usages: Usage[] = budgets.map((b) => budgetUsage(b, txns));
  usages.sort((a, b) => b.pct - a.pct);

  if (usages.length === 0) {
    listWrap.appendChild(
      emptyState({
        icon: 'target',
        title: 'No budgets yet',
        subtitle: 'Set a monthly spending target to stay on track.',
        actionLabel: 'Create budget',
        onAction: () => openForm(),
      }),
    );
  } else {
    for (const usage of usages) {
      listWrap.appendChild(
        budgetCard(usage, catMap, currency, () => openForm(usage.budget)),
      );
    }
  }
  root.appendChild(listWrap);
  root.appendChild(
    el('button', {
      class: 'btn btn-primary btn-block',
      text: 'Add budget',
      onclick: () => openForm(),
    }),
  );
}

function budgetCard(
  usage: Usage,
  catMap: Map<string, Category>,
  currency: string,
  onEdit: () => void,
): HTMLElement {
  const { budget, spent, remaining, pct, level } = usage;
  const card = el('div', { class: 'card' });

  const label = budget.categoryId
    ? catNameOf(catMap, budget.categoryId)
    : budget.name;
  const periodText = budget.period === 'weekly' ? 'Weekly' : 'Monthly';

  const head = el('div', { class: 'row-between' });
  const titleWrap = el('div', { class: 'budget-title' });
  titleWrap.appendChild(el('span', { class: 'card-title', text: budget.name }));
  if (budget.categoryId) {
    titleWrap.appendChild(
      el('div', { class: 'text-muted text-sm', text: label }),
    );
  }
  head.append(
    titleWrap,
    el('span', { class: 'badge badge-info', text: periodText }),
  );
  card.appendChild(head);
  card.appendChild(progressBar(pct));

  const amounts = el('div', { class: 'row-between' });
  amounts.append(
    el('span', {
      class: 'text-sm',
      text: `${formatMoney(spent, currency)} of ${formatMoney(budget.amount, currency)}`,
    }),
    el('span', {
      class: `text-sm ${remaining < 0 ? 'text-danger' : 'text-muted'}`,
      text:
        remaining >= 0
          ? `${formatMoney(remaining, currency)} left`
          : `over by ${formatMoney(-remaining, currency)}`,
    }),
  );
  card.appendChild(amounts);

  if (level === 'watch' || level === 'danger' || level === 'over') {
    const badgeCls = level === 'watch' ? 'badge-warn' : 'badge-danger';
    const badgeText =
      level === 'watch'
        ? `${Math.round(pct * 100)}% used`
        : level === 'danger'
          ? 'Budget used up'
          : 'Over budget';
    const warnRow = el('div', { class: 'row-between warn-row' });
    warnRow.append(
      el('span', { class: `badge ${badgeCls}`, text: badgeText }),
      el('span', { class: 'text-sm text-muted', text: budgetWarningText(usage, label) }),
    );
    card.appendChild(warnRow);
  }

  const actions = el('div', { class: 'card-actions' });
  actions.append(
    el('button', {
      class: 'icon-btn',
      'aria-label': `Edit budget ${budget.name}`,
      html: icon('pencil'),
      onclick: onEdit,
    }),
    el('button', {
      class: 'icon-btn danger',
      'aria-label': `Delete budget ${budget.name}`,
      html: icon('trash'),
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Delete budget?',
          message: `"${budget.name}" will be removed. Past spending is kept.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (ok) {
          await store.deleteBudget(budget.id);
          toast('Budget deleted', 'success');
        }
      },
    }),
  );
  card.appendChild(actions);
  return card;
}

function budgetForm(
  existing: Budget | undefined,
  categories: Category[],
  catMap: Map<string, Category>,
  currency: string,
): void {
  const nameInput = textInput({
    placeholder: 'e.g. Monthly spending',
    value: existing?.name ?? '',
  }) as HTMLInputElement;
  const amountInput = textInput({
    placeholder: '0.00',
    inputmode: 'decimal',
    value: existing ? majorStr(existing.amount, currency) : '',
  }) as HTMLInputElement;

  let period: BudgetPeriod = existing?.period ?? 'monthly';
  const periodSeg = segmented<BudgetPeriod>(
    [
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' },
    ],
    period,
    (v) => {
      period = v;
    },
  );

  const expenseCats = categories.filter((c) => EXPENSE_KINDS.has(c.kind));
  const catSelect = selectInput(
    [
      { value: '', label: 'Overall spending' },
      ...expenseCats.map((c) => ({ value: c.id, label: c.name })),
    ],
    existing?.categoryId ?? '',
  );

  const body = el('div', { class: 'form-stack' });
  body.append(
    field('Name', nameInput),
    field('Amount', amountInput),
    field('Period', periodSeg),
    field('Category (optional)', catSelect),
  );

  const handle = openModal({
    title: existing ? 'Edit budget' : 'New budget',
    body,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: () => handle.close() },
      {
        label: 'Save',
        kind: 'primary',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) {
            toast('Please enter a budget name.', 'error');
            return;
          }
          const parsed = parseAmount(amountInput.value, currency);
          if (!parsed.ok) {
            toast(amountErrorMessage(parsed), 'error');
            return;
          }
          const categoryId = catSelect.value || undefined;
          if (categoryId && !catMap.has(categoryId)) {
            toast('Selected category no longer exists.', 'error');
            return;
          }
          const data = { name, amount: parsed.minor, period, categoryId };
          if (existing) {
            await store.saveBudget({ ...existing, ...data });
            toast('Budget updated', 'success');
          } else {
            await store.saveBudget({ id: newId(), createdAt: Date.now(), ...data });
            toast('Budget created', 'success');
          }
          handle.close();
        },
      },
    ],
  });
}
