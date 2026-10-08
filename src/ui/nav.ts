/** Hash-based routing (works offline and from any static host). */
import { getSettings } from '../data/store';

export type Route =
  | 'home'
  | 'transactions'
  | 'stats'
  | 'profile'
  | 'budgets'
  | 'goals'
  | 'recurring'
  | 'settings'
  | 'categories'
  | 'debt'
  | 'tools'
  | 'calculator'
  | 'money-tools'
  | 'games'
  | 'game-quiz'
  | 'game-budget'
  | 'game-math'
  | 'game-saving';

const VALID: Route[] = ['home', 'transactions', 'stats', 'profile', 'budgets', 'goals', 'recurring', 'settings', 'categories', 'debt', 'tools', 'calculator', 'money-tools', 'games', 'game-quiz', 'game-budget', 'game-math', 'game-saving'];

export function currentRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (VALID as string[]).includes(h) ? (h as Route) : 'home';
}

export function navigate(route: Route): void {
  if (currentRoute() === route) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = `#/${route}`;
  }
}

/** Apply the user's theme choice to <html data-theme>. */
export function applyTheme(mode: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  if (mode === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'dark' : 'light';
  } else {
    root.dataset.theme = mode;
  }
}

export function watchSystemTheme(mode: 'light' | 'dark' | 'system'): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.onchange = () => {
    if (mode === 'system') applyTheme('system');
  };
}

/** Re-apply theme live from settings (used by the settings view). */
export function refreshTheme(): void {
  const s = getSettings();
  applyTheme(s.theme);
  watchSystemTheme(s.theme);
}
