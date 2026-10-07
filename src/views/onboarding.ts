/**
 * Short onboarding: name → allowance → currency → monthly budget → savings goal.
 * Optional steps can be skipped. Creates the initial income transaction,
 * budget, and goal so the dashboard is useful immediately.
 */
import { amountErrorMessage, parseAmount } from '../core/money';
import { todayISO } from '../core/dates';
import { CURRENCIES, DEFAULT_CURRENCY } from '../model/defaults';
import type { Budget, SavingsGoal, Transaction } from '../model/types';
import { getSettings, newId, saveSettings, store } from '../data/store';
import { clear, el, field, selectInput, textInput, toast } from '../ui/components';
import { icon } from '../ui/icons';

interface Draft {
  name: string;
  allowanceMinor?: number;
  currency: string;
  budgetMinor?: number;
  goalName?: string;
  goalTargetMinor?: number;
}

const TOTAL_STEPS = 5;

export function renderOnboarding(root: HTMLElement, onDone: () => void | Promise<void>): void {
  clear(root);
  const draft: Draft = { name: '', currency: getSettings().currency || DEFAULT_CURRENCY };
  let step = 0;

  const wrap = el('div', { class: 'onboard' });
  root.appendChild(wrap);

  function render(): void {
    clear(wrap);
    if (step === 0) {
      wrap.append(
        el('div', { class: 'onboard-hero' },
          el('div', { class: 'onboard-logo', html: icon('wallet') }),
          el('h1', { text: 'Track every rupee' }),
          el('p', { class: 'lede', text: 'A simple expense tracker made for students. No account, no internet needed — your data stays on your device.' }),
        ),
        el('div', { class: 'onboard-nav' },
          el('button', { class: 'btn btn-primary btn-block', text: 'Get started', onclick: () => { step = 1; render(); } }),
        ),
      );
      return;
    }

    const card = el('div', { class: 'onboard-card' });
    const dots = el('div', { class: 'onboard-steps' });
    for (let i = 1; i <= TOTAL_STEPS; i++) dots.appendChild(el('span', { class: i <= step ? 'done' : '' }));
    card.appendChild(dots);

    const nav = el('div', { class: 'onboard-nav' });
    const backBtn = el('button', { class: 'btn btn-outline', text: 'Back', onclick: () => { step--; render(); } });
    nav.appendChild(backBtn);

    const finishStep = async (): Promise<void> => {
      if (step < TOTAL_STEPS) { step++; render(); return; }
      await complete();
    };

    if (step === 1) {
      card.append(
        el('h2', { text: 'What should we call you?' }),
        el('p', { class: 'lede', text: 'Just a nickname is fine.' }),
        field('Your name', textInput({ placeholder: 'e.g. Haroon', value: draft.name, maxlength: '30', autocomplete: 'nickname' })),
      );
      const input = card.querySelector('input')!;
      nav.append(el('button', {
        class: 'btn btn-primary', text: 'Continue',
        onclick: () => { draft.name = input.value.trim(); step++; render(); },
      }));
    } else if (step === 2) {
      card.append(
        el('h2', { text: 'Monthly allowance' }),
        el('p', { class: 'lede', text: 'How much pocket money do you get per month? We’ll add it as income.' }),
        field('Amount (optional)', textInput({ placeholder: 'e.g. 10000', inputmode: 'decimal', value: draft.allowanceMinor ? String(draft.allowanceMinor / 100) : '' })),
      );
      const input = card.querySelector('input')!;
      const err = el('span', { class: 'field-error' });
      card.appendChild(err);
      const skip = el('button', { class: 'btn btn-ghost', text: 'Skip', onclick: () => { draft.allowanceMinor = undefined; step++; render(); } });
      nav.append(skip, el('button', {
        class: 'btn btn-primary', text: 'Continue',
        onclick: () => {
          const raw = input.value.trim();
          if (!raw) { draft.allowanceMinor = undefined; step++; render(); return; }
          const p = parseAmount(raw, draft.currency);
          if (!p.ok) { err.textContent = amountErrorMessage(p); return; }
          draft.allowanceMinor = p.minor;
          step++; render();
        },
      }));
    } else if (step === 3) {
      card.append(
        el('h2', { text: 'Preferred currency' }),
        el('p', { class: 'lede', text: 'You can change this later in Settings.' }),
        field('Currency', selectInput(
          CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.name} (${c.code})` })),
          draft.currency,
        )),
      );
      const sel = card.querySelector('select')!;
      nav.append(el('button', {
        class: 'btn btn-primary', text: 'Continue',
        onclick: () => { draft.currency = sel.value; step++; render(); },
      }));
    } else if (step === 4) {
      card.append(
        el('h2', { text: 'Set a monthly budget' }),
        el('p', { class: 'lede', text: 'A spending target helps your money last the month. Optional.' }),
        field('Monthly budget (optional)', textInput({ placeholder: 'e.g. 8000', inputmode: 'decimal' })),
      );
      const input = card.querySelector('input')!;
      const err = el('span', { class: 'field-error' });
      card.appendChild(err);
      nav.append(
        el('button', { class: 'btn btn-ghost', text: 'Skip', onclick: () => { draft.budgetMinor = undefined; step++; render(); } }),
        el('button', {
          class: 'btn btn-primary', text: 'Continue',
          onclick: () => {
            const raw = input.value.trim();
            if (!raw) { draft.budgetMinor = undefined; step++; render(); return; }
            const p = parseAmount(raw, draft.currency);
            if (!p.ok) { err.textContent = amountErrorMessage(p); return; }
            draft.budgetMinor = p.minor;
            step++; render();
          },
        }),
      );
    } else {
      card.append(
        el('h2', { text: 'Any savings goal?' }),
        el('p', { class: 'lede', text: 'Saving for something? We’ll track your progress. Optional.' }),
        field('Goal name (optional)', textInput({ placeholder: 'e.g. New headphones', maxlength: '40' })),
        field('Target amount (optional)', textInput({ placeholder: 'e.g. 8000', inputmode: 'decimal' })),
      );
      const [nameInput, amtInput] = Array.from(card.querySelectorAll('input'));
      const err = el('span', { class: 'field-error' });
      card.appendChild(err);
      nav.append(
        el('button', { class: 'btn btn-ghost', text: 'Skip', onclick: () => void finishStep() }),
        el('button', {
          class: 'btn btn-primary', text: 'Finish',
          onclick: () => {
            draft.goalName = nameInput.value.trim() || undefined;
            const raw = amtInput.value.trim();
            if (raw) {
              const p = parseAmount(raw, draft.currency);
              if (!p.ok) { err.textContent = amountErrorMessage(p); return; }
              draft.goalTargetMinor = p.minor;
            }
            if (draft.goalName && !draft.goalTargetMinor) { err.textContent = 'Add a target amount for your goal, or skip.'; return; }
            void finishStep();
          },
        }),
      );
    }

    card.appendChild(nav);
    wrap.append(card);
    const firstInput = card.querySelector('input');
    if (firstInput instanceof HTMLInputElement) firstInput.focus({ preventScroll: true });
  }

  async function complete(): Promise<void> {
    try {
      const now = Date.now();
      const settings = getSettings();
      saveSettings({
        name: draft.name,
        currency: draft.currency,
        monthlyBudget: draft.budgetMinor,
        onboardingDone: true,
        theme: settings.theme,
      });

      if (draft.allowanceMinor) {
        const txn: Transaction = {
          id: newId(),
          type: 'income',
          amount: draft.allowanceMinor,
          categoryId: 'cat-pocket',
          date: todayISO(),
          note: 'Monthly allowance',
          createdAt: now,
          updatedAt: now,
        };
        await store.saveTransaction(txn);
      }
      if (draft.budgetMinor) {
        const b: Budget = {
          id: newId(),
          name: 'Monthly budget',
          amount: draft.budgetMinor,
          period: 'monthly',
          createdAt: now,
        };
        await store.saveBudget(b);
      }
      if (draft.goalName && draft.goalTargetMinor) {
        const g: SavingsGoal = {
          id: newId(),
          name: draft.goalName,
          targetAmount: draft.goalTargetMinor,
          currentAmount: 0,
          createdAt: now,
        };
        await store.saveGoal(g);
      }
      toast('Welcome! Your tracker is ready.', 'success');
    } catch (err) {
      console.error(err);
      toast('Could not save your setup, but you can continue.', 'error');
    }
    await onDone();
  }

  render();
}
