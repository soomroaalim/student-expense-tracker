// @vitest-environment jsdom
/**
 * Integration tests: boot the real app in jsdom with a fake IndexedDB and
 * drive the actual UI (onboarding, add/edit/delete, budgets, goals,
 * recurring, theme, export) asserting DOM outcomes.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  document.body.innerHTML = '<div id="app"></div>';
  // jsdom lacks matchMedia; the app only needs `matches` + onchange.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: false, media: q, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    }),
  });
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = () => 'blob:mock';
    window.URL.revokeObjectURL = () => {};
  }
  if (!window.HTMLElement.prototype.scrollTo) {
    window.HTMLElement.prototype.scrollTo = () => {};
  }
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  const main = await import('../src/main');
  void main;
  await tick(400);
}

function text(sel: string): string {
  return document.querySelector(sel)?.textContent ?? '';
}

async function click(sel: string) {
  const el = document.querySelector(sel) as HTMLElement;
  if (!el) throw new Error(`missing element: ${sel}`);
  el.click();
  await tick();
}

async function type(sel: string, value: string) {
  const input = document.querySelector(sel) as HTMLInputElement;
  if (!input) throw new Error(`missing input: ${sel}`);
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await tick(30);
}

async function go(route: string) {
  window.location.hash = `#/${route}`;
  await tick(250);
}

/** Complete onboarding with the given values. */
async function onboard(name: string, allowance: string, budget: string) {
  await click('.onboard .btn-primary'); // Get started
  await type('.onboard-card input', name);
  await click('.onboard-nav .btn-primary'); // -> allowance
  if (allowance) await type('.onboard-card input', allowance);
  const nav = [...document.querySelectorAll('.onboard-nav .btn')];
  await (nav[nav.length - 1] as HTMLElement).click(); // Continue
  await tick();
  await click('.onboard-nav .btn-primary'); // currency -> budget
  if (budget) await type('.onboard-card input', budget);
  const nav2 = [...document.querySelectorAll('.onboard-nav .btn')];
  await (nav2[nav2.length - 1] as HTMLElement).click(); // Continue
  await tick();
  const nav3 = [...document.querySelectorAll('.onboard-nav .btn')] as HTMLElement[];
  const skipBtn = nav3.find((b) => b.textContent?.trim() === 'Skip');
  if (!skipBtn) throw new Error('skip button not found on goal step');
  await skipBtn.click(); // Skip goal
  await tick(400);
}

async function pickCategory(label: string) {
  const picks = [...document.querySelectorAll('.cat-pick')] as HTMLElement[];
  for (const p of picks) {
    if (p.querySelector('.lbl')?.textContent?.trim() === label) {
      p.click();
      await tick(50);
      return;
    }
  }
  throw new Error(`category not found: ${label}`);
}

async function saveModal() {
  const btns = [...document.querySelectorAll('.modal-actions .btn-primary')] as HTMLElement[];
  btns[btns.length - 1].click();
  await tick(300);
}

describe('app integration', () => {
  beforeEach(async () => {
    // Wipe the fake IndexedDB using the previous test's store module,
    // then reset modules so the next boot starts completely fresh.
    try {
      const { store } = await import('../src/data/store');
      await store.resetAll();
    } catch { /* first run: nothing to clear */ }
    vi.resetModules();
    window.localStorage.clear();
    window.location.hash = '#/home';
    await boot();
  });

  it('onboards and shows the allowance as balance', async () => {
    await onboard('Tester', '10000', '8000');
    expect(text('.hero-balance')).toContain('10,000');
    expect(document.querySelectorAll('.nav-item').length).toBe(4);
    expect(document.querySelector('.fab')).not.toBeNull();
  });

  it('adds an expense and updates the dashboard', async () => {
    await onboard('Tester', '10000', '8000');
    await click('.fab');
    await tick(300);
    expect(document.querySelector('.modal')).not.toBeNull();
    await type('.amount-input', '250');
    await pickCategory('Food');
    await type('input[placeholder="Optional note"]', 'Lunch');
    await saveModal();
    expect(text('.hero-balance')).toContain('9,750');
    expect(document.body.textContent).toContain('Lunch');
  });

  it('rejects invalid amounts without saving', async () => {
    await onboard('Tester', '10000', '');
    await click('.fab');
    await tick(300);
    await type('.amount-input', 'abc');
    await pickCategory('Food');
    await saveModal();
    // Sheet still open with an error; balance unchanged.
    expect(document.querySelector('.modal')).not.toBeNull();
    expect(text('.add-sheet .field-error').length).toBeGreaterThan(3);
    await click('.modal-header .icon-btn'); // close
    expect(text('.hero-balance')).toContain('10,000');
  });

  it('rejects negative amounts', async () => {
    await onboard('Tester', '10000', '');
    await click('.fab');
    await tick(300);
    await type('.amount-input', '-50');
    await saveModal();
    expect(text('.add-sheet .field-error').length).toBeGreaterThan(3);
  });

  it('adds income via quick action', async () => {
    await onboard('Tester', '10000', '');
    const btns = [...document.querySelectorAll('.view .btn')] as HTMLElement[];
    btns[1].click(); // Add income
    await tick(300);
    await type('.amount-input', '500');
    await pickCategory('Gift');
    await saveModal();
    expect(text('.hero-balance')).toContain('10,500');
  });

  it('searches and edits transactions', async () => {
    await onboard('Tester', '10000', '');
    await click('.fab');
    await tick(300);
    await type('.amount-input', '250');
    await pickCategory('Food');
    await type('input[placeholder="Optional note"]', 'Lunch');
    await saveModal();

    await go('transactions');
    expect(document.querySelectorAll('.txn-row').length).toBe(2); // allowance + lunch
    await type('.search-bar input', 'Lunch');
    await tick(200);
    expect(document.querySelectorAll('.txn-row').length).toBe(1);
    // Edit the note.
    (document.querySelector('.txn-row') as HTMLElement).click();
    await tick(300);
    const note = document.querySelector('input[placeholder="Optional note"]') as HTMLInputElement;
    note.focus();
    note.value = '';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    await type('input[placeholder="Optional note"]', 'Lunch with Ali');
    await saveModal();
    await type('.search-bar input', '');
    (document.querySelector('.search-bar input') as HTMLInputElement).value = '';
    document.querySelector('.search-bar input')!.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(200);
    expect(document.body.textContent).toContain('Lunch with Ali');
  });

  it('deletes a transaction with confirmation', async () => {
    await onboard('Tester', '10000', '');
    await click('.fab');
    await tick(300);
    await type('.amount-input', '250');
    await pickCategory('Food');
    await saveModal();

    await go('transactions');
    const rows = [...document.querySelectorAll('.txn-row')] as HTMLElement[];
    rows[0].click(); // newest = the expense
    await tick(300);
    const del = [...document.querySelectorAll('.modal-actions .btn-danger')] as HTMLElement[];
    del[0].click(); // Delete -> confirm dialog
    await tick(300);
    expect(document.body.textContent).toContain('Delete transaction?');
    const confirmBtns = [...document.querySelectorAll('.modal-actions .btn-danger')] as HTMLElement[];
    confirmBtns[confirmBtns.length - 1].click(); // Confirm delete
    await tick(400);
    expect(text('.hero-balance') || document.body.textContent).toBeTruthy();
    await go('home');
    expect(text('.hero-balance')).toContain('10,000');
  });

  it('tracks budget usage from onboarding', async () => {
    await onboard('Tester', '10000', '8000');
    await click('.fab');
    await tick(300);
    await type('.amount-input', '2000');
    await pickCategory('Food');
    await saveModal();
    await go('budgets');
    const body = document.body.textContent ?? '';
    expect(body).toContain('Monthly budget');
    expect(body).toContain('2,000');
  });

  it('creates a savings goal and adds money', async () => {
    await onboard('Tester', '10000', '');
    await go('goals');
    await click('.view .btn-primary'); // New goal
    await tick(300);
    const inputs = [...document.querySelectorAll('.modal-body .input')] as HTMLInputElement[];
    await type('.modal-body .input', 'Headphones');
    inputs[1].focus();
    inputs[1].value = '8000';
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    await tick(30);
    await saveModal();
    expect(document.body.textContent).toContain('Headphones');
    // Add money.
    const addBtn = document.querySelector('.card-actions .btn-primary, .goal-card .btn-sm, .view .btn-sm') as HTMLElement;
    expect(addBtn).not.toBeNull();
    addBtn.click();
    await tick(300);
    await type('.modal-body .input', '3500');
    await saveModal();
    expect(document.body.textContent).toContain('44%');
  });

  it('generates recurring expenses exactly once', async () => {
    await onboard('Tester', '10000', '');
    const { runRecurring } = await import('../src/services/recurringRunner');
    const { store, newId } = await import('../src/data/store');
    const { todayISO } = await import('../src/core/dates');
    await store.saveRecurring({
      id: newId(), amount: 30000, categoryId: 'cat-transport', frequency: 'weekly',
      nextOccurrence: todayISO(), note: 'Bus pass', enabled: true, createdAt: Date.now(),
    });
    const r1 = await runRecurring();
    const r2 = await runRecurring();
    expect(r1.generated).toBe(1);
    expect(r2.generated).toBe(0); // idempotent: no duplicates
    const txns = await store.listTransactions();
    expect(txns.filter((t) => t.note?.includes('Bus pass')).length).toBe(1);
  });

  it('toggles dark theme from settings', async () => {
    await onboard('Tester', '10000', '');
    await go('settings');
    const segBtns = [...document.querySelectorAll('.seg-btn')] as HTMLElement[];
    const dark = segBtns.find((b) => b.textContent?.trim() === 'Dark')!;
    dark.click();
    await tick(200);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('exports CSV with the documented header', async () => {
    const { transactionsToCSV } = await import('../src/core/export');
    const { store } = await import('../src/data/store');
    await onboard('Tester', '10000', '');
    const txns = await store.listTransactions();
    const cats = await store.listCategories();
    const map = new Map(cats.map((c) => [c.id, c.name]));
    const csv = transactionsToCSV(txns, (id) => map.get(id) ?? '?', 'PKR');
    expect(csv.split('\n')[0]).toBe('Date,Type,Category,Amount,Note,PaymentMethod');
    expect(csv).toContain('10000.00');
  });

  it('resets all data from settings', async () => {
    await onboard('Tester', '10000', '8000');
    await go('settings');
    const danger = document.querySelector('.set-row.danger') as HTMLElement;
    danger.click();
    await tick(300);
    expect(document.body.textContent).toContain('Reset everything?');
    const confirmBtns = [...document.querySelectorAll('.modal-actions .btn-danger')] as HTMLElement[];
    confirmBtns[confirmBtns.length - 1].click();
    await tick(500);
    const { store } = await import('../src/data/store');
    expect((await store.listTransactions()).length).toBe(0);
    expect((await store.listBudgets()).length).toBe(0);
  });
});
