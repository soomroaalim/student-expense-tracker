/**
 * App shell: header, view container, bottom navigation.
 * Views register here; the shell re-renders on route or data changes.
 */
import { getSettings, subscribe } from './data/store';
import { currentRoute, navigate, refreshTheme, type Route } from './ui/nav';
import { clear, el } from './ui/components';
import { icon } from './ui/icons';
import { openAddSheet } from './views/add';

import { renderDashboard } from './views/dashboard';
import { renderTransactions } from './views/transactions';
import { renderStatistics } from './views/statistics';
import { renderProfile } from './views/profile';
import { renderBudgets } from './views/budgets';
import { renderGoals } from './views/goals';
import { renderRecurring } from './views/recurring';
import { renderSettings } from './views/settings';
import { renderCategories } from './views/categories';

type ViewFn = (root: HTMLElement) => void | Promise<void>;

const VIEWS: Record<Route, { title: string; sub: string; render: ViewFn }> = {
  home: { title: 'Home', sub: '', render: renderDashboard },
  transactions: { title: 'Transactions', sub: 'Your money history', render: renderTransactions },
  stats: { title: 'Statistics', sub: 'Understand your spending', render: renderStatistics },
  profile: { title: 'Profile', sub: 'You & your money', render: renderProfile },
  budgets: { title: 'Budgets', sub: 'Keep spending on track', render: renderBudgets },
  goals: { title: 'Savings Goals', sub: 'Save for what matters', render: renderGoals },
  recurring: { title: 'Recurring', sub: 'Automatic expenses', render: renderRecurring },
  settings: { title: 'Settings', sub: 'Make it yours', render: renderSettings },
  categories: { title: 'Categories', sub: 'Organize your spending', render: renderCategories },
};

const NAV_ITEMS: Array<{ route: Route; label: string; icon: string }> = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'transactions', label: 'History', icon: 'receipt' },
  { route: 'stats', label: 'Stats', icon: 'chart' },
  { route: 'profile', label: 'Profile', icon: 'user' },
];

let root: HTMLElement;
let viewContainer: HTMLElement;
let headerEl: HTMLElement;
let navEl: HTMLElement;
let booted = false;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function renderHeader(route: Route): void {
  clear(headerEl);
  const name = getSettings().name;
  const title = route === 'home' && name ? `${greeting()}, ${name}` : VIEWS[route].title;
  const sub = route === 'home' && name ? 'Here’s your money at a glance' : VIEWS[route].sub;
  headerEl.append(
    el('div', {}, el('h1', { text: title }), el('p', { class: 'sub', text: sub })),
  );
}

function renderNav(route: Route): void {
  clear(navEl);
  // Home, History | ADD | Stats, Profile
  const left = NAV_ITEMS.slice(0, 2);
  const right = NAV_ITEMS.slice(2);
  for (const item of left) navEl.appendChild(navButton(item, route));
  const addWrap = el('div', { class: 'nav-add' });
  addWrap.appendChild(el('button', {
    class: 'fab',
    'aria-label': 'Add transaction',
    html: icon('plus'),
    onclick: () => openAddSheet('expense'),
  }));
  navEl.appendChild(addWrap);
  for (const item of right) navEl.appendChild(navButton(item, route));
}

function navButton(item: { route: Route; label: string; icon: string }, route: Route): HTMLElement {
  return el('button', {
    class: `nav-item${item.route === route ? ' active' : ''}`,
    'aria-label': item.label,
    onclick: () => navigate(item.route),
  }, el('span', { html: icon(item.icon) }), el('span', { text: item.label }));
}

async function render(): Promise<void> {
  const route = currentRoute();
  renderHeader(route);
  renderNav(route);
  clear(viewContainer);
  viewContainer.appendChild(el('div', { class: 'view' }));
  const viewRoot = viewContainer.firstElementChild as HTMLElement;
  try {
    await VIEWS[route].render(viewRoot);
  } catch (err) {
    console.error(err);
    viewRoot.appendChild(
      el('div', { class: 'card' },
        el('h3', { class: 'card-title', text: 'Something went wrong' }),
        el('p', { text: 'Please try again. Your data is safe.' }),
      ),
    );
  }
  window.scrollTo({ top: 0 });
}

/** Start the main app shell (called after onboarding). */
export function bootApp(): void {
  refreshTheme();

  if (booted) {
    void render();
    return;
  }
  booted = true;

  root = document.getElementById('app')!;
  clear(root);
  headerEl = el('header', { class: 'app-header' });
  viewContainer = el('main', { id: 'view-root' });
  navEl = el('nav', { class: 'bottom-nav', 'aria-label': 'Main navigation' });
  root.append(headerEl, viewContainer, navEl);

  window.addEventListener('hashchange', () => void render());
  subscribe(() => void render());
  void render();
}
