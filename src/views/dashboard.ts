/**
 * Home dashboard: balance hero, quick actions, spending summaries,
 * spending chart, rule-based insights, budget/goal previews, recent transactions.
 */
import { budgetUsage } from '../core/budgets';
import { friendlyDate, todayISO } from '../core/dates';
import { dashboardStats, lastNDaysExpense } from '../core/finance';
import { buildInsights } from '../core/insights';
import { formatMoney, formatSigned } from '../core/money';
import { getSettings, store } from '../data/store';
import type { Budget, Category, SavingsGoal, Transaction } from '../model/types';
import { barChart } from '../ui/charts';
import { categoryAvatar, clear, el, emptyState, progressBar } from '../ui/components';
import { icon } from '../ui/icons';
import { navigate } from '../ui/nav';
import { openAddSheet, openEditSheet } from './add';

export async function renderDashboard(root: HTMLElement): Promise<void> {
  const [txns, categories, budgets, goals] = await Promise.all([
    store.listTransactions(),
    store.listCategories(),
    store.listBudgets(),
    store.listGoals(),
  ]);
  clear(root);

  const currency = getSettings().currency;
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const catName = (id: string) => catMap.get(id)?.name ?? 'Unknown category';
  const stats = dashboardStats(txns);
  const isEmpty = txns.length === 0;

  // 1. Hero card.
  root.appendChild(
    el('section', { class: 'hero' },
      el('p', { class: 'hero-label', text: 'Total balance' }),
      el('div', { class: 'hero-balance', text: formatMoney(stats.balance, currency) }),
      el('div', { class: 'hero-stats' },
        el('div', { class: 'hero-stat' },
          el('span', { class: 'l' }, el('span', { html: icon('arrow-up') }), ' Income'),
          el('span', { class: 'v', text: formatMoney(stats.totalIncome, currency) }),
        ),
        el('div', { class: 'hero-stat' },
          el('span', { class: 'l' }, el('span', { html: icon('arrow-down') }), ' Expenses'),
          el('span', { class: 'v', text: formatMoney(stats.totalExpense, currency) }),
        ),
      ),
    ),
  );

  // 2. Quick actions.
  root.appendChild(
    el('div', { style: 'display:flex;gap:10px;margin-bottom:14px' },
      el('button', { class: 'btn btn-primary btn-block', onclick: () => openAddSheet('expense') },
        el('span', { html: icon('plus') }), 'Add expense'),
      el('button', { class: 'btn btn-ghost btn-block', onclick: () => openAddSheet('income') },
        el('span', { html: icon('arrow-up') }), 'Add income'),
    ),
  );

  // 3. Quick stats: today / this week / this month.
  const qstat = (label: string, value: string) =>
    el('div', { class: 'qstat' }, el('div', { class: 'l', text: label }), el('div', { class: 'v', text: value }));
  root.appendChild(
    el('div', { class: 'quick-stats' },
      qstat('Today', formatMoney(stats.today.expense, currency)),
      qstat('This week', formatMoney(stats.week.expense, currency)),
      qstat('This month', formatMoney(stats.month.expense, currency)),
    ),
  );

  if (isEmpty) {
    // Empty library: replace chart + recent sections (and hide insights).
    root.appendChild(emptyState({
      icon: 'wallet',
      title: 'No transactions yet',
      subtitle: 'Add your first expense to see your money at a glance.',
      actionLabel: 'Add expense',
      onAction: () => openAddSheet('expense'),
    }));
  } else {
    // 4. Spending chart card: last 14 days (skip when all zeros).
    const days = lastNDaysExpense(txns, 14);
    const bars = days.map((d) => ({
      label: d.date.slice(8),
      value: d.expense,
      highlight: d.date === todayISO(),
    }));
    if (bars.some((b) => b.value > 0)) {
      root.appendChild(
        el('section', { class: 'card' },
          el('h3', { class: 'card-title', text: 'Last 14 days' }),
          el('div', { html: barChart(bars, { format: (v) => formatMoney(v, currency) }) }),
        ),
      );
    }

    // 5. Insights card (rule-based, no AI).
    const insights = buildInsights({ txns, budgets, goals, categoryName: catName });
    if (insights.length > 0) {
      const card = el('section', { class: 'card' }, el('h3', { class: 'card-title', text: 'Insights' }));
      for (const ins of insights) {
        card.appendChild(
          el('div', { class: `insight insight-${ins.level}`, style: 'margin-bottom:8px' },
            el('span', { html: icon(ins.icon) }),
            el('p', { text: ins.text }),
          ),
        );
      }
      root.appendChild(card);
    }
  }

  // 6. Budgets preview (top 3 by % used).
  root.appendChild(sectionHead('Budgets', () => navigate('budgets')));
  if (budgets.length === 0) {
    root.appendChild(el('p', { class: 'txn-sub', text: 'No budgets yet. Tap "See all" to create one.' }));
  } else {
    const usages = budgets.map((b) => budgetUsage(b, txns)).sort((a, b) => b.pct - a.pct).slice(0, 3);
    for (const u of usages) {
      root.appendChild(budgetRow(u.budget, u, catName, currency));
    }
  }

  // 7. Goals preview.
  root.appendChild(sectionHead('Goals', () => navigate('goals')));
  if (goals.length === 0) {
    root.appendChild(el('p', { class: 'txn-sub', text: 'No savings goals yet. Tap "See all" to create one.' }));
  } else {
    for (const g of goals.slice(0, 3)) {
      root.appendChild(goalRow(g, currency));
    }
  }

  // 8. Recent transactions (up to 5). Skipped for an empty library.
  if (!isEmpty) {
    root.appendChild(sectionHead('Recent', () => navigate('transactions')));
    for (const t of txns.slice(0, 5)) {
      root.appendChild(txnRow(t, catName, currency, catMap));
    }
  }
}

function sectionHead(title: string, onSeeAll: () => void): HTMLElement {
  return el('div', { class: 'section-head' },
    el('h3', { text: title }),
    el('button', { class: 'link-btn', text: 'See all', onclick: onSeeAll }),
  );
}

function budgetRow(b: Budget, u: ReturnType<typeof budgetUsage>, catName: (id: string) => string, currency: string): HTMLElement {
  const label = b.categoryId ? catName(b.categoryId) : b.name;
  const badgeCls = u.level === 'ok' ? 'badge-ok' : u.level === 'watch' ? 'badge-warn' : 'badge-danger';
  return el('div', { class: 'card', style: 'margin-bottom:10px' },
    el('div', { class: 'row-between', style: 'margin-bottom:8px' },
      el('span', { class: 'txn-name', text: label }),
      el('span', { class: `badge ${badgeCls}`, text: `${Math.round(Math.min(u.pct, 1) * 100)}%` }),
    ),
    progressBar(u.pct),
    el('p', { class: 'txn-sub', style: 'margin-top:6px', text: `${formatMoney(u.spent, currency)} of ${formatMoney(b.amount, currency)}` }),
  );
}

function goalRow(g: SavingsGoal, currency: string): HTMLElement {
  const pct = g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0;
  const pctText = `${Math.round(Math.min(pct, 1) * 100)}%`;
  return el('div', { class: 'card', style: 'margin-bottom:10px' },
    el('div', { class: 'row-between', style: 'margin-bottom:8px' },
      el('span', { class: 'txn-name', text: g.name }),
    ),
    progressBar(pct),
    el('p', { class: 'txn-sub', style: 'margin-top:6px', text: `${formatMoney(g.currentAmount, currency)} of ${formatMoney(g.targetAmount, currency)} · ${pctText}` }),
  );
}

function txnRow(
  t: Transaction,
  catName: (id: string) => string,
  currency: string,
  catMap: Map<string, Category>,
): HTMLElement {
  const bits = [t.note?.trim(), t.paymentMethod, friendlyDate(t.date)].filter(Boolean) as string[];
  const signed = t.type === 'expense' ? -t.amount : t.amount;
  return el('div', { class: 'txn-row', style: 'cursor:pointer', onclick: () => openEditSheet(t) },
    categoryAvatar(catMap.get(t.categoryId)),
    el('div', { class: 'txn-main' },
      el('div', { class: 'txn-name', text: catName(t.categoryId) }),
      el('div', { class: 'txn-sub', text: bits.join(' · ') }),
    ),
    el('div', {},
      el('div', { class: `txn-amt ${t.type}`, text: formatSigned(signed, currency) }),
      el('div', { class: 'txn-date', text: friendlyDate(t.date) }),
    ),
  );
}
