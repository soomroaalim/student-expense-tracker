/**
 * Statistics screen: period selector (week/month/year), stat cards,
 * spending-by-category donut, spending-over-time bars, top categories.
 */
import {
  monthEnd, monthLabel, monthStart, parseISODate, todayISO, weekEnd, weekStart,
} from '../core/dates';
import { filterTxns, flowsByDay, statOverview, totalsByCategory } from '../core/finance';
import { accountingSummary } from '../core/accounting';
import { isHistoryTxn } from '../model/types';
import { formatMoney } from '../core/money';
import { getSettings, store } from '../data/store';
import { CATEGORY_COLORS } from '../model/defaults';
import { barChart, categoryBars, donutChart, legend } from '../ui/charts';
import { clear, el, emptyState, fitAmounts, segmented } from '../ui/components';
import { icon } from '../ui/icons';

type Period = 'week' | 'month' | 'year';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function renderStatistics(root: HTMLElement): Promise<void> {
  const [txns, categories] = await Promise.all([
    store.listTransactions(),
    store.listCategories(),
  ]);
  render('month');

  function render(period: Period): void {
    clear(root);
    const currency = getSettings().currency;
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const catName = (id: string) => catMap.get(id)?.name ?? 'Unknown category';
    const today = todayISO();

    let from: string;
    let to: string;
    let label: string;
    if (period === 'week') {
      from = weekStart(today);
      to = weekEnd(today);
      label = 'This week';
    } else if (period === 'month') {
      from = monthStart(today);
      to = monthEnd(today);
      label = monthLabel(today);
    } else {
      const y = today.slice(0, 4);
      from = `${y}-01-01`;
      to = `${y}-12-31`;
      label = y;
    }

    root.appendChild(el('div', { style: 'margin-bottom:14px' },
      segmented<Period>(
        [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }],
        period,
        (v) => render(v),
      ),
    ));

    const inPeriod = filterTxns(txns, { from, to });
    if (inPeriod.length === 0) {
      root.appendChild(emptyState({
        icon: 'chart',
        title: 'No data for this period',
        subtitle: 'Try another period or add transactions.',
      }));
      return;
    }

    const ov = statOverview(txns.filter(isHistoryTxn), from, to);
    const acct = accountingSummary(filterTxns(txns, { from, to }));

    // 1. Stat cards — income is ONLY actual income; gifts/borrowed separated.
    const qstat = (l: string, v: string) =>
      el('div', { class: 'qstat' }, el('div', { class: 'l', text: l }), el('div', { class: 'v fit-amt', text: v }));
    root.appendChild(
      el('div', { class: 'quick-stats', style: 'grid-template-columns:repeat(2,1fr)' },
        qstat('Spent', formatMoney(ov.totalExpense, currency)),
        qstat('Income', formatMoney(ov.totalIncome, currency)),
        qstat('Gifts', formatMoney(acct.gifts, currency)),
        qstat('Borrowed', formatMoney(acct.borrowed, currency)),
        qstat('Debt repaid', formatMoney(acct.debtRepaid, currency)),
        qstat('Transactions', String(ov.txnCount)),
        qstat('Avg / day', formatMoney(ov.avgDailyExpense, currency)),
      ),
    );
    fitAmounts(root);

    const catTotals = totalsByCategory(inPeriod, 'expense');

    // 2. Spending by category donut.
    if (ov.totalExpense > 0 && catTotals.length > 0) {
      const segments = catTotals.map((ct, i) => ({
        label: catName(ct.categoryId),
        value: ct.total,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }));
      root.appendChild(
        el('section', { class: 'card' },
          el('h3', { class: 'card-title', text: 'Spending by category' }),
          el('div', { style: 'text-align:center', html: donutChart(segments, 170, formatMoney(ov.totalExpense, currency), label) }),
          el('div', { html: legend(segments.map((s) => ({ label: s.label, color: s.color, value: formatMoney(s.value, currency) }))) }),
        ),
      );
    }

    // 3. Spending over time.
    const fmt = (v: number) => formatMoney(v, currency);
    if (period === 'year') {
      const flows = flowsByDay(inPeriod, from, to);
      const monthly = new Array<number>(12).fill(0);
      for (const f of flows) {
        const m = Number(f.date.slice(5, 7)) - 1;
        if (m >= 0 && m < 12) monthly[m] += f.expense;
      }
      root.appendChild(
        el('section', { class: 'card' },
          el('h3', { class: 'card-title', text: 'Spending over time' }),
          el('div', { html: barChart(monthly.map((v, i) => ({ label: MONTH_NAMES[i], value: v })), { format: fmt }) }),
        ),
      );
    } else {
      const flows = flowsByDay(inPeriod, from, to);
      const bars = flows.map((f) => ({
        label: period === 'week'
          ? (parseISODate(f.date)?.toLocaleDateString('en', { weekday: 'short' }) ?? f.date)
          : String(Number(f.date.slice(8))),
        value: f.expense,
        highlight: f.date === today,
      }));
      root.appendChild(
        el('section', { class: 'card' },
          el('h3', { class: 'card-title', text: 'Spending over time' }),
          el('div', { html: barChart(bars, { format: fmt }) }),
        ),
      );
    }

    // 4. Top categories.
    if (catTotals.length > 0) {
      const rows = catTotals.slice(0, 6).map((ct, i) => ({
        label: catName(ct.categoryId),
        value: ct.total,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
        formatted: formatMoney(ct.total, currency),
      }));
      root.appendChild(
        el('section', { class: 'card' },
          el('h3', { class: 'card-title', text: 'Top categories' }),
          el('div', { html: categoryBars(rows) }),
        ),
      );

      // 5. Top category callout.
      const top = catTotals[0];
      const topName = catName(top.categoryId);
      const sharePct = ov.totalExpense > 0 ? Math.round((top.total / ov.totalExpense) * 100) : 0;
      root.appendChild(
        el('div', { class: 'insight insight-tip' },
          el('span', { html: icon('target') }),
          el('p', { text: `${topName} is your top category — ${formatMoney(top.total, currency)} (${sharePct}% of spending).` }),
        ),
      );
    }
  }
}
