/**
 * Profile view: who you are, a money snapshot, and shortcuts
 * to budgets, goals, recurring expenses, categories, and settings.
 */
import { dashboardStats } from '../core/finance';
import { currencyMeta } from '../model/defaults';
import { getSettings, store } from '../data/store';
import { clear, el, moneyEl } from '../ui/components';
import { icon } from '../ui/icons';
import { navigate, type Route } from '../ui/nav';

export async function renderProfile(root: HTMLElement): Promise<void> {
  clear(root);
  const view = el('div', { class: 'view' });
  root.appendChild(view);

  const settings = getSettings();
  const txns = await store.listTransactions();
  const goals = await store.listGoals();
  const stats = dashboardStats(txns);

  const meta = currencyMeta(settings.currency);
  const name = settings.name.trim() || 'Student';
  const initial = name.charAt(0).toUpperCase();

  // ---------------------------------------------------------- profile card
  const avatar = el('div', { class: 'cat-avatar avatar-lg' });
  avatar.style.setProperty('--cat-color', 'var(--primary)');
  const initialEl = el('span', { text: initial });
  initialEl.style.fontSize = '24px';
  initialEl.style.fontWeight = '800';
  avatar.appendChild(initialEl);

  view.appendChild(el('div', { class: 'card' },
    el('div', { style: 'display:flex;align-items:center;gap:14px;' },
      avatar,
      el('div', {},
        el('h2', { text: name, style: 'margin:0 0 4px;font-size:19px;' }),
        el('p', {
          text: `${meta.code} • ${txns.length} transaction${txns.length === 1 ? '' : 's'}`,
          style: 'margin:0;color:var(--text-soft);font-size:13px;',
        }),
      ),
    ),
  ));

  // ---------------------------------------------------------- money overview
  const balanceWrap = el('div', { style: 'font-size:30px;font-weight:800;letter-spacing:-0.02em;margin:2px 0 12px;' });
  balanceWrap.appendChild(moneyEl(stats.balance));

  const row = (label: string, minor: number, cls: string): HTMLElement =>
    el('div', { class: 'row-between', style: 'padding:7px 0;' },
      el('span', { text: label, style: 'color:var(--text-soft);font-size:14px;' }),
      el('span', { class: cls, style: 'font-weight:700;font-size:15px;' }, moneyEl(minor)),
    );

  const saved = goals.reduce((sum, g) => sum + g.currentAmount, 0);

  view.appendChild(el('div', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Overview' }),
    el('p', { text: 'Balance', style: 'margin:0;color:var(--text-soft);font-size:12.5px;' }),
    balanceWrap,
    row('Total income', stats.totalIncome, ''),
    row('Total expenses', stats.totalExpense, ''),
    row('Saved toward goals', saved, ''),
  ));

  // ---------------------------------------------------------- menu card
  const menu: Array<{ ic: string; label: string; route: Route }> = [
    { ic: 'target', label: 'Budgets', route: 'budgets' },
    { ic: 'coins', label: 'Savings Goals', route: 'goals' },
    { ic: 'repeat', label: 'Recurring Expenses', route: 'recurring' },
    { ic: 'other', label: 'Categories', route: 'categories' },
    { ic: 'settings', label: 'Settings', route: 'settings' },
  ];
  const menuCard = el('div', { class: 'card' });
  for (const m of menu) {
    menuCard.appendChild(el('button', { class: 'set-row', onclick: () => navigate(m.route) },
      el('span', { class: 'lead', html: icon(m.ic) }),
      el('span', { class: 'lbl', text: m.label }),
      el('span', { html: icon('chevron-right') }),
    ));
  }
  view.appendChild(menuCard);

  // ---------------------------------------------------------- privacy note
  const shield = el('span', {
    style: 'width:38px;height:38px;border-radius:12px;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;',
  });
  shield.innerHTML = icon('shield');
  const shieldSvg = shield.querySelector('svg');
  if (shieldSvg) {
    shieldSvg.style.width = '19px';
    shieldSvg.style.height = '19px';
  }

  view.appendChild(el('div', { class: 'card' },
    el('div', { style: 'display:flex;gap:12px;align-items:flex-start;' },
      shield,
      el('p', {
        text: 'Private by design — your data never leaves this device. No account, no tracking.',
        style: 'margin:2px 0 0;color:var(--text-soft);font-size:13.5px;line-height:1.5;',
      }),
    ),
  ));
}
