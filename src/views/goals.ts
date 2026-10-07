/**
 * Savings goals view: list goals with progress, add money, create/edit/delete
 * via modals. Plain arithmetic only — no AI.
 */
import {
  clear,
  el,
  field,
  textInput,
  openModal,
  confirmDialog,
  emptyState,
  progressBar,
  toast,
} from '../ui/components';
import { icon } from '../ui/icons';
import { store, getSettings, newId } from '../data/store';
import { formatMoney, parseAmount, amountErrorMessage } from '../core/money';
import { friendlyDate, isValidISODate } from '../core/dates';
import type { SavingsGoal } from '../model/types';
import { currencyMeta } from '../model/defaults';

function majorStr(minor: number, currency: string): string {
  const meta = currencyMeta(currency);
  const v = minor / meta.minorUnits;
  return String(Number(v.toFixed(2)));
}

export async function renderGoals(root: HTMLElement): Promise<void> {
  clear(root);
  const currency = getSettings().currency;
  const goals = await store.listGoals();

  root.appendChild(
    el('div', { class: 'view-head' }, el('h1', { class: 'view-title', text: 'Savings goals' })),
  );

  const openForm = (existing?: SavingsGoal): void => goalForm(existing, currency);

  const listWrap = el('div', { class: 'stack' });
  if (goals.length === 0) {
    listWrap.appendChild(
      emptyState({
        icon: 'coins',
        title: 'No savings goals',
        subtitle: 'Saving for something? Track your progress here.',
        actionLabel: 'Create goal',
        onAction: () => openForm(),
      }),
    );
  } else {
    for (const goal of goals) {
      listWrap.appendChild(goalCard(goal, currency, () => openForm(goal)));
    }
  }
  root.appendChild(listWrap);
  root.appendChild(
    el('button', {
      class: 'btn btn-primary btn-block',
      text: 'New goal',
      onclick: () => openForm(),
    }),
  );
}

function goalCard(goal: SavingsGoal, currency: string, onEdit: () => void): HTMLElement {
  const card = el('div', { class: 'card' });
  const pct = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
  const complete = pct >= 1;

  const head = el('div', { class: 'row-between' });
  head.append(
    el('span', { class: 'card-title', text: goal.name }),
    goal.targetDate ? el('span', { class: 'text-sm text-muted', text: friendlyDate(goal.targetDate) }) : '',
  );
  card.appendChild(head);

  card.appendChild(progressBar(pct));

  const amounts = el('div', { class: 'row-between' });
  amounts.append(
    el('span', {
      class: 'text-sm',
      text: `${formatMoney(goal.currentAmount, currency)} of ${formatMoney(goal.targetAmount, currency)}`,
    }),
    el('span', { class: 'text-sm text-muted', text: `${Math.round(Math.min(pct, 9.99) * 100)}%` }),
  );
  card.appendChild(amounts);

  if (complete) {
    const badgeRow = el('div', { class: 'row-between' });
    badgeRow.append(el('span', { class: 'badge badge-ok', text: 'Completed!' }));
    card.appendChild(badgeRow);
  }

  const actions = el('div', { class: 'card-actions' });
  actions.append(
    el('button', {
      class: 'btn btn-sm btn-primary',
      text: 'Add money',
      onclick: () => addMoneyForm(goal, currency),
    }),
    el('button', {
      class: 'icon-btn',
      'aria-label': `Edit goal ${goal.name}`,
      html: icon('pencil'),
      onclick: onEdit,
    }),
    el('button', {
      class: 'icon-btn danger',
      'aria-label': `Delete goal ${goal.name}`,
      html: icon('trash'),
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Delete goal?',
          message: `"${goal.name}" will be removed.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (ok) {
          await store.deleteGoal(goal.id);
          toast('Goal deleted', 'success');
        }
      },
    }),
  );
  card.appendChild(actions);
  return card;
}

function addMoneyForm(goal: SavingsGoal, currency: string): void {
  const amountInput = textInput({ placeholder: '0.00', inputmode: 'decimal' }) as HTMLInputElement;
  const body = el('div', { class: 'form-stack' });
  body.append(field('Amount', amountInput));

  const handle = openModal({
    title: `Add money — ${goal.name}`,
    body,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: () => handle.close() },
      {
        label: 'Add',
        kind: 'primary',
        onClick: async () => {
          const parsed = parseAmount(amountInput.value, currency);
          if (!parsed.ok) {
            toast(amountErrorMessage(parsed), 'error');
            return;
          }
          const currentAmount = Math.max(0, goal.currentAmount + parsed.minor);
          await store.saveGoal({ ...goal, currentAmount });
          toast('Saved to goal', 'success');
          handle.close();
        },
      },
    ],
  });
}

function goalForm(existing: SavingsGoal | undefined, currency: string): void {
  const nameInput = textInput({
    placeholder: 'e.g. New headphones',
    value: existing?.name ?? '',
  }) as HTMLInputElement;
  const targetInput = textInput({
    placeholder: '0.00',
    inputmode: 'decimal',
    value: existing ? majorStr(existing.targetAmount, currency) : '',
  }) as HTMLInputElement;
  const dateInput = textInput({
    type: 'date',
    value: existing?.targetDate ?? '',
  }) as HTMLInputElement;

  const body = el('div', { class: 'form-stack' });
  body.append(
    field('Goal name', nameInput),
    field('Target amount', targetInput),
    field('Target date (optional)', dateInput),
  );

  const handle = openModal({
    title: existing ? 'Edit goal' : 'New goal',
    body,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: () => handle.close() },
      {
        label: 'Save',
        kind: 'primary',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) {
            toast('Please enter a goal name.', 'error');
            return;
          }
          const parsed = parseAmount(targetInput.value, currency);
          if (!parsed.ok) {
            toast(amountErrorMessage(parsed), 'error');
            return;
          }
          const targetDate = dateInput.value.trim();
          if (targetDate && !isValidISODate(targetDate)) {
            toast('Please enter a valid target date.', 'error');
            return;
          }
          const data = {
            name,
            targetAmount: parsed.minor,
            targetDate: targetDate || undefined,
          };
          if (existing) {
            await store.saveGoal({
              ...existing,
              ...data,
              currentAmount: Math.max(0, existing.currentAmount),
            });
            toast('Goal updated', 'success');
          } else {
            await store.saveGoal({
              id: newId(),
              ...data,
              currentAmount: 0,
              createdAt: Date.now(),
            });
            toast('Goal created', 'success');
          }
          handle.close();
        },
      },
    ],
  });
}
