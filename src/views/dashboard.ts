/**
 * Home dashboard: balance hero, quick actions, spending summaries,
 * spending chart, rule-based insights, budget/goal previews, recent transactions.
 */
import { budgetUsage } from '../core/budgets';
import { addDays, friendlyDate, todayISO } from '../core/dates';
import { dashboardStats, lastNDaysExpense } from '../core/finance';
import { buildInsights } from '../core/insights';
import {
  AFFORD_DISCLAIMER, BRAND_LINE, avgDailySpend, canAfford, cashComposition,
  daysBetween, goalWeeklyNeeded, milestones, moneyStatus, noSpendStreak,
  safeToSpend, upcomingEssentials, weeklySummary,
} from '../core/student';
import { amountErrorMessage, formatMoney, parseAmount } from '../core/money';
import { getSettings, store } from '../data/store';
import type { Budget, Category, SavingsGoal, Transaction } from '../model/types';
import { isHistoryTxn, txnSignedAmount, txnTypeLabel } from '../model/types';
import { barChart } from '../ui/charts';
import { categoryAvatar, clear, el, emptyState, field, fitAmounts, progressBar, textInput } from '../ui/components';
import { icon } from '../ui/icons';
import { navigate } from '../ui/nav';
import { openAddSheet, openEditSheet, openQuickAdd } from './add';

export async function renderDashboard(root: HTMLElement): Promise<void> {
  const [txns, categories, budgets, goals, recurring] = await Promise.all([
    store.listTransactions(),
    store.listCategories(),
    store.listBudgets(),
    store.listGoals(),
    store.listRecurring(),
  ]);
  clear(root);

  const currency = getSettings().currency;
  const settings = getSettings();
  const today = todayISO();
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const catName = (id: string) => catMap.get(id)?.name ?? 'Unknown category';
  const stats = dashboardStats(txns);
  // History views exclude the opening balance (account setup, not a transaction).
  const histTxns = txns.filter(isHistoryTxn);
  const isEmpty = histTxns.length === 0;

  // ---- student intelligence (all rule-based, same accounting source of truth)
  const untilISO = settings.nextAllowanceDate ?? addDays(today, 30);
  const essentials = upcomingEssentials(recurring, untilISO);
  const buffer = settings.emergencyBuffer ?? 0;
  const safe = safeToSpend({
    availableCash: stats.availableCash,
    upcomingEssentials: essentials,
    emergencyBuffer: buffer,
    nextAllowanceDate: settings.nextAllowanceDate,
    today,
  });
  const status = moneyStatus(avgDailySpend(txns, 7, today), safe.perDay);
  const streak = noSpendStreak(txns, categories, today);
  const comp = cashComposition(stats);
  const fmt = (n: number) => formatMoney(n, currency);

  // 1. Hero card — Available Cash is the primary number, with money status.
  const cashCls = stats.availableCash < 0 ? 'hero-negative' : '';
  const heroStat = (label: string, value: number, ic: string) =>
    el('div', { class: 'hero-stat' },
      el('span', { class: 'l' }, el('span', { html: icon(ic) }), ` ${label}`),
      el('span', { class: 'v fit-amt', text: formatMoney(value, currency) }),
    );
  root.appendChild(
    el('section', { class: 'hero' },
      el('p', { class: 'hero-label', text: 'Available cash' }),
      el('div', { class: `hero-balance fit-amt ${cashCls}`, text: formatMoney(stats.availableCash, currency) }),
      el('p', { class: `status-chip status-${status.level}` },
        el('span', { class: 'status-dot' }), ` ${status.title}`),
      stats.availableCash < 0
        ? el('p', { class: 'hero-warn', text: 'You have spent more than your available money. New expenses will ask about borrowing.' })
        : null,
      el('div', { class: 'hero-stats', style: 'grid-template-columns:repeat(3,1fr)' },
        heroStat('Income', stats.income, 'arrow-up'),
        heroStat('Gifts', stats.gifts, 'gift'),
        heroStat('Borrowed', stats.borrowed, 'coins'),
        heroStat('Expenses', stats.expense, 'arrow-down'),
        heroStat('Repaid', stats.debtRepaid, 'check'),
        heroStat('Debt owed', stats.outstandingDebt, 'alert'),
      ),
    ),
  );

  // 2. Safe to spend today — the app's core differentiator.
  {
    const card = el('section', { class: 'card safe-card' },
      el('p', { class: 'brand-line', text: BRAND_LINE }),
      el('div', { class: 'row-between wrap' },
        el('div', {},
          el('h3', { class: 'card-title', text: 'Safe to spend today' }),
          el('p', { class: 'txn-sub', text: status.text }),
        ),
        el('div', { class: 'safe-amt fit-amt', text: fmt(safe.perDay) }),
      ),
    );
    // Allowance runway.
    if (settings.nextAllowanceDate) {
      const daysLeft = daysBetween(today, settings.nextAllowanceDate);
      const expected = settings.nextAllowanceAmount ? ` · expected ${fmt(settings.nextAllowanceAmount)}` : '';
      card.appendChild(el('p', { class: 'txn-sub wrap', text: `Next allowance in ${daysLeft} day${daysLeft === 1 ? '' : 's'}${expected} — ${fmt(stats.availableCash)} available until then.` }));
    } else {
      card.appendChild(el('button', {
        class: 'link-btn', text: 'Set your allowance date in Settings →',
        onclick: () => navigate('settings'),
      }));
    }
    // Money map: what the available cash is made of.
    const total = Math.max(1, comp.earned + comp.gifts + comp.borrowed);
    const seg = (frac: number, cls: string) =>
      el('span', { class: `map-seg ${cls}`, style: `width:${Math.max(0, Math.round(frac * 100))}%` });
    card.appendChild(el('div', { class: 'money-map', 'aria-label': 'What your available cash is made of' },
      seg(comp.earned / total, 'seg-earned'),
      seg(comp.gifts / total, 'seg-gifts'),
      seg(comp.borrowed / total, 'seg-borrowed'),
    ));
    card.appendChild(el('p', { class: 'txn-sub wrap', text:
      `Earned ${fmt(comp.earned)} · Gifts ${fmt(comp.gifts)} · Borrowed ${fmt(comp.borrowed)}` }));
    if (comp.borrowed > 0) {
      card.appendChild(el('p', { class: 'borrow-note', text:
        `You have ${fmt(stats.availableCash)} available, including ${fmt(comp.borrowed)} borrowed (${fmt(comp.owed)} owed).` }));
    }
    card.appendChild(el('p', { class: 'formula-note', text:
      `Available cash − upcoming bills − safety buffer${safe.daysLeft ? `, ÷ ${safe.daysLeft} days` : ''}.` }));
    root.appendChild(card);
  }

  // 3. Quick actions.
  root.appendChild(
    el('div', { style: 'display:flex;gap:10px;margin-bottom:14px' },
      el('button', { class: 'btn btn-primary btn-block', onclick: () => openQuickAdd() },
        el('span', { html: icon('plus') }), 'Quick add'),
      el('button', { class: 'btn btn-ghost btn-block', onclick: () => openAddSheet('income') },
        el('span', { html: icon('arrow-up') }), 'Add income'),
    ),
  );

  // 2c. Debt summary (only when there is debt activity).
  if (stats.borrowed > 0 || stats.debtRepaid > 0) {
    root.appendChild(
      el('button', {
        class: 'card debt-card', type: 'button',
        onclick: () => navigate('debt'),
        'aria-label': 'View debt details',
      },
        el('div', { class: 'row-between wrap' },
          el('div', {},
            el('h3', { class: 'card-title', text: 'Debt' }),
            el('p', { class: 'txn-sub', text: `${formatMoney(stats.borrowed, currency)} borrowed · ${formatMoney(stats.debtRepaid, currency)} repaid` }),
          ),
          el('div', { class: 'debt-amt fit-amt', text: formatMoney(stats.outstandingDebt, currency) }),
        ),
        el('p', { class: 'txn-sub', text: 'Tap to manage →' }),
      ),
    );
  }

  // 4. Weekly student summary ("Where did my money go?").
  {
    const w = weeklySummary(txns, catName, categories, new Date());
    const card = el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: 'This week' }),
      el('div', { class: 'quick-stats', style: 'grid-template-columns:repeat(3,1fr);margin-bottom:8px' },
        el('div', { class: 'qstat' }, el('div', { class: 'l', text: 'Spent' }), el('div', { class: 'v fit-amt', text: fmt(w.spent) })),
        el('div', { class: 'qstat' }, el('div', { class: 'l', text: 'Received' }), el('div', { class: 'v fit-amt', text: fmt(w.received) })),
        el('div', { class: 'qstat' }, el('div', { class: 'l', text: 'Saved' }), el('div', { class: 'v fit-amt', text: fmt(w.saved) })),
      ),
    );
    if (w.topCategories.length > 0) {
      for (const c of w.topCategories) {
        card.appendChild(el('div', { class: 'row-between', style: 'padding:5px 0' },
          el('span', { class: 'txn-name', style: 'font-size:14px', text: c.name }),
          el('span', { class: 'txn-amt expense', style: 'font-size:14px', text: fmt(c.amount) }),
        ));
      }
      card.appendChild(el('p', { class: 'txn-sub', text: `${w.biggestCategory} is your biggest spending category this week.` }));
    }
    if (w.spentLastWeek > 0) {
      const diff = w.spentLastWeek - w.spent;
      if (diff !== 0) {
        card.appendChild(el('p', { class: 'txn-sub', text:
          diff > 0 ? `You spent ${fmt(diff)} less than last week.` : `You spent ${fmt(-diff)} more than last week.` }));
      }
    }
    card.appendChild(el('p', { class: 'txn-sub wrap', text:
      `Today net ${fmt(stats.todayNet)} · Week net ${fmt(stats.weekNet)} · Month net ${fmt(stats.monthNet)}` }));
    if (streak > 0) {
      card.appendChild(el('p', { class: 'streak-line', text: `No-spend streak: ${streak} day${streak === 1 ? '' : 's'}` }));
    }
    root.appendChild(card);
  }

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
    const insights = buildInsights({
      txns: histTxns, budgets, goals, categoryName: catName,
      balance: stats.availableCash, currency, nextAllowanceDate: settings.nextAllowanceDate,
      outstandingDebt: stats.outstandingDebt,
    });
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

  // 8. "Can I afford this?" — plain calculation from the student's own data.
  {
    const card = el('section', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Can I afford this?' }),
    );
    const priceInput = textInput({ placeholder: 'Price, e.g. 3000', inputmode: 'decimal', 'aria-label': 'Price' });
    const result = el('p', { class: 'txn-sub' });
    card.append(
      field('What do you want to buy? (price)', priceInput),
      el('button', {
        class: 'btn btn-ghost btn-block', text: 'Check',
        onclick: () => {
          const p = parseAmount(priceInput.value.trim(), currency);
          if (!p.ok) { result.textContent = amountErrorMessage(p); return; }
          const r = canAfford(p.minor, safe.perDay, stats.availableCash, safe.reserved, safe.daysLeft, fmt);
          result.textContent = r.text;
          result.className = r.verdict === 'affordable' ? 'afford-ok' : r.verdict === 'tight' ? 'afford-tight' : 'afford-wait';
        },
      }),
      result,
      el('p', { class: 'formula-note', text: AFFORD_DISCLAIMER }),
    );
    root.appendChild(card);
  }

  // 9. Personal records — small milestones for consistent tracking.
  {
    const ms = milestones(txns, goals, stats);
    const achieved = ms.filter((m) => m.achieved);
    if (achieved.length > 0) {
      const card = el('section', { class: 'card' },
        el('h3', { class: 'card-title', text: 'Personal records' }),
        el('div', { class: 'milestone-row' }),
      );
      const row = card.querySelector('.milestone-row')!;
      for (const m of achieved) {
        row.appendChild(el('span', { class: 'milestone-chip' },
          el('span', { html: icon('check') }), ` ${m.title}`));
      }
      root.appendChild(card);
    }
  }

  // Shrink-to-fit large amounts so they never clip or overflow.
  fitAmounts(root);

  // 10. Recent transactions (up to 5). Skipped for an empty library.
  if (!isEmpty) {
    root.appendChild(sectionHead('Recent', () => navigate('transactions')));
    for (const t of histTxns.slice(0, 5)) {
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
  const weekly = goalWeeklyNeeded(g);
  const sub = weekly
    ? `${formatMoney(g.currentAmount, currency)} of ${formatMoney(g.targetAmount, currency)} · ${pctText} · save ${formatMoney(weekly, currency)}/week`
    : `${formatMoney(g.currentAmount, currency)} of ${formatMoney(g.targetAmount, currency)} · ${pctText}`;
  return el('div', { class: 'card', style: 'margin-bottom:10px' },
    el('div', { class: 'row-between', style: 'margin-bottom:8px' },
      el('span', { class: 'txn-name', text: g.name }),
    ),
    progressBar(pct),
    el('p', { class: 'txn-sub wrap', style: 'margin-top:6px', text: sub }),
  );
}

function txnRow(
  t: Transaction,
  catName: (id: string) => string,
  currency: string,
  catMap: Map<string, Category>,
): HTMLElement {
  const bits = [txnTypeLabel(t.type), t.note?.trim(), t.paymentMethod, friendlyDate(t.date)].filter(Boolean) as string[];
  const signed = txnSignedAmount(t.type, t.amount);
  const title = t.type === 'borrowed' && t.lender ? `Borrowed from ${t.lender}` : catName(t.categoryId);
  return el('div', { class: 'txn-row', style: 'cursor:pointer', onclick: () => openEditSheet(t) },
    categoryAvatar(catMap.get(t.categoryId)),
    el('div', { class: 'txn-main' },
      el('div', { class: 'txn-name', text: title }),
      el('div', { class: 'txn-sub', text: bits.join(' · ') }),
    ),
    el('div', {},
      el('div', { class: `txn-amt ${signed >= 0 ? 'income' : 'expense'}`, text: formatMoney(signed, currency) }),
      el('div', { class: 'txn-date', text: friendlyDate(t.date) }),
    ),
  );
}
