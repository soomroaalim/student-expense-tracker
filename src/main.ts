/**
 * App entry point: seed data, run onboarding or boot the main shell,
 * generate due recurring expenses, and surface rule-based budget alerts.
 */
import './styles.css';
import { bootApp } from './app';
import { budgetWarningText, budgetUsage } from './core/budgets';
import { getSettings } from './data/store';
import { store } from './data/store';
import { notifyBudgetWarning } from './services/notify';
import { runRecurring } from './services/recurringRunner';
import { applyTheme } from './ui/nav';
import { renderOnboarding } from './views/onboarding';

async function checkBudgetAlerts(): Promise<void> {
  try {
    const [txns, budgets, categories] = await Promise.all([
      store.listTransactions(),
      store.listBudgets(),
      store.listCategories(),
    ]);
    const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Budget';
    for (const b of budgets) {
      const usage = budgetUsage(b, txns);
      if (usage.level === 'watch' || usage.level === 'danger' || usage.over) {
        const label = b.categoryId ? nameOf(b.categoryId) : b.name;
        notifyBudgetWarning(budgetWarningText(usage, label));
      }
    }
  } catch (err) {
    console.error('Budget alert check failed', err);
  }
}

async function finishBoot(): Promise<void> {
  try {
    await runRecurring();
  } catch (err) {
    console.error('Recurring generation failed', err);
  }
  bootApp();
  void checkBudgetAlerts();
}

async function main(): Promise<void> {
  applyTheme(getSettings().theme);
  try {
    await store.ensureSeeded();
  } catch (err) {
    console.error('Seeding failed', err);
  }

  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');

  if (!getSettings().onboardingDone) {
    renderOnboarding(root, () => finishBoot());
  } else {
    await finishBoot();
  }
}

main().catch((err) => {
  console.error(err);
  document.getElementById('app')!.innerHTML =
    '<div style="padding:40px 24px;font-family:sans-serif"><h2>Could not start the app</h2>' +
    '<p>Please reload. If the problem persists, your browser storage may be unavailable.</p></div>';
});
