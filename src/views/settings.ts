/**
 * Settings view: profile, currency, appearance, notifications,
 * data export/import, danger zone, and about.
 */
import { isValidISODate, todayISO } from '../core/dates';
import {
  downloadFile, fromBackupJSON, toBackupJSON, transactionsFromCSV, transactionsToCSV,
} from '../core/export';
import { amountErrorMessage, formatMoney, parseAmount } from '../core/money';
import { CURRENCIES } from '../model/defaults';
import type { BackupData, ThemeMode } from '../model/types';
import { getSettings, newId, saveSettings, store } from '../data/store';
import { requestPermission, notificationsSupported } from '../services/notify';
import { navigate, refreshTheme, type Route } from '../ui/nav';
import { icon } from '../ui/icons';
import {
  clear, confirmDialog, el, field, segmented, selectInput, textInput, toast,
} from '../ui/components';

function sectionCard(title: string, ...children: Array<HTMLElement | false | null | undefined>): HTMLElement {
  return el('div', { class: 'card' }, el('h3', { class: 'card-title', text: title }), ...children);
}

function navRow(iconName: string, label: string, route: Route): HTMLElement {
  return el('button', { class: 'set-row', onclick: () => navigate(route) },
    el('span', { class: 'lead', html: icon(iconName) }),
    el('span', { class: 'lbl', text: label }),
    el('span', { html: icon('chevron-right') }),
  );
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  clear(root);
  const view = el('div', { class: 'view' });
  root.appendChild(view);

  const settings = getSettings();

  // ------------------------------------------------------------- 1. Profile
  const nameInput = textInput({
    value: settings.name,
    placeholder: 'Your name or nickname',
    maxlength: '40',
    autocomplete: 'off',
  });
  view.appendChild(sectionCard('Profile',
    field('Name', nameInput),
    el('button', {
      class: 'btn btn-primary', text: 'Save',
      onclick: () => {
        saveSettings({ name: nameInput.value.trim() });
        toast('Profile updated.', 'success');
      },
    }),
  ));

  // ------------------------------------------------------------- 2. Currency
  const currencySelect = selectInput(
    CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.name} (${c.code})` })),
    settings.currency,
    {
      onchange: (e: Event) => {
        const code = (e.target as HTMLSelectElement).value;
        saveSettings({ currency: code });
        toast('Amounts are not converted — only the display symbol changes.', 'success');
      },
    },
  );
  view.appendChild(sectionCard('Currency', field('Currency', currencySelect)));

  // ------------------------------------------------------------- 2b. Allowance (optional)
  const allowanceInput = textInput({
    type: 'date',
    value: settings.nextAllowanceDate ?? '',
    'aria-label': 'Next allowance date',
  });
  const allowanceAmtInput = textInput({
    placeholder: 'e.g. 5000',
    inputmode: 'decimal',
    value: settings.nextAllowanceAmount ? String(settings.nextAllowanceAmount / 100) : '',
    'aria-label': 'Expected allowance amount',
  });
  const bufferInput = textInput({
    placeholder: 'e.g. 1000',
    inputmode: 'decimal',
    value: settings.emergencyBuffer ? String(settings.emergencyBuffer / 100) : '',
    'aria-label': 'Emergency buffer',
  });
  view.appendChild(sectionCard('Allowance & safety buffer',
    field('Next allowance date (optional)', allowanceInput),
    field('Expected allowance amount (optional)', allowanceAmtInput),
    el('p', { class: 'txn-sub wrap', text: 'Expected money is only for planning — it never increases your available cash until you actually receive it.' }),
    field('Emergency buffer (optional)', bufferInput),
    el('p', { class: 'txn-sub wrap', text: 'Money always held back from your safe-to-spend amount, for surprises.' }),
    el('button', {
      class: 'btn btn-primary', text: 'Save',
      onclick: () => {
        const v = allowanceInput.value;
        if (v !== '' && !isValidISODate(v)) {
          toast('Please choose a valid date.', 'error');
          return;
        }
        const amtRaw = allowanceAmtInput.value.trim();
        let amt: number | undefined;
        if (amtRaw) {
          const p = parseAmount(amtRaw, settings.currency);
          if (!p.ok) { toast(amountErrorMessage(p), 'error'); return; }
          amt = p.minor;
        }
        const bufRaw = bufferInput.value.trim();
        let buf: number | undefined;
        if (bufRaw) {
          const p = parseAmount(bufRaw, settings.currency);
          if (!p.ok) { toast(amountErrorMessage(p), 'error'); return; }
          buf = p.minor;
        }
        saveSettings({
          nextAllowanceDate: v === '' ? undefined : v,
          nextAllowanceAmount: amt,
          emergencyBuffer: buf,
        });
        toast('Allowance settings saved.', 'success');
      },
    }),
  ));

  // ------------------------------------------------------------- 2c. Starting balance
  const openingTxns = (await store.listTransactions()).filter((t) => t.type === 'opening_balance');
  const openingTotal = openingTxns.reduce((s, t) => s + t.amount, 0);
  const openingInput = textInput({
    placeholder: 'e.g. 2000',
    inputmode: 'decimal',
    value: openingTotal > 0 ? String(openingTotal / 100) : '',
    'aria-label': 'Starting balance',
  });
  view.appendChild(sectionCard('Starting balance',
    el('p', { class: 'txn-sub', text: `Current: ${formatMoney(openingTotal, settings.currency)}` }),
    field('Cash you had before using the app (not income)', openingInput),
    el('button', {
      class: 'btn btn-primary', text: 'Save',
      onclick: async () => {
        const raw = openingInput.value.trim();
        if (!raw) {
          // Clear: remove all opening balance transactions.
          for (const t of openingTxns) await store.deleteTransaction(t.id);
          toast('Starting balance cleared.', 'success');
          return;
        }
        const p = parseAmount(raw, settings.currency);
        if (!p.ok) { toast(amountErrorMessage(p), 'error'); return; }
        for (const t of openingTxns) await store.deleteTransaction(t.id);
        const categories = await store.listCategories();
        const fallback = categories.find((c) => c.kind !== 'income') ?? categories[0];
        const now = Date.now();
        await store.saveTransaction({
          id: newId(),
          type: 'opening_balance',
          amount: p.minor,
          categoryId: fallback?.id ?? 'cat-other',
          date: todayISO(),
          note: 'Starting balance',
          createdAt: now,
          updatedAt: now,
        });
        toast('Starting balance saved.', 'success');
      },
    }),
  ));

  // ------------------------------------------------------------- 3. Appearance
  view.appendChild(sectionCard('Appearance',
    segmented<ThemeMode>(
      [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'System' },
      ],
      settings.theme,
      (v) => {
        saveSettings({ theme: v });
        refreshTheme();
      },
    ),
  ));

  // ------------------------------------------------------------- 4. Notifications
  const notifSwitch = el('input', {
    type: 'checkbox',
    checked: settings.notificationsEnabled,
    'aria-label': 'Enable notifications',
    onchange: async (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.checked) {
        if (!notificationsSupported()) {
          toast('Notifications are not supported on this device.', 'error');
          input.checked = false;
          return;
        }
        const granted = await requestPermission();
        saveSettings({ notificationsEnabled: granted });
        if (granted) {
          toast('Notifications enabled.', 'success');
        } else {
          toast('Permission denied — notifications stay off.', 'error');
          input.checked = false;
        }
      } else {
        saveSettings({ notificationsEnabled: false });
      }
    },
  });
  view.appendChild(sectionCard('Notifications',
    el('div', { class: 'set-row' },
      el('span', { class: 'lead', html: icon('bell') }),
      el('span', { class: 'lbl', text: 'Enable notifications' }),
      el('label', { class: 'switch' }, notifSwitch, el('span', { class: 'track' })),
    ),
    el('p', {
      text: 'Budget alerts, goal reminders, recurring expense notices.',
      style: 'margin:4px 0 0;color:var(--text-soft);font-size:13px;',
    }),
  ));

  // ------------------------------------------------------------- 5. Manage
  view.appendChild(sectionCard('Manage',
    navRow('target', 'Budgets', 'budgets'),
    navRow('other', 'Categories', 'categories'),
  ));

  // ------------------------------------------------------------- 6. Data
  const dataBtn = (iconName: string, label: string, onClick: () => void): HTMLElement =>
    el('button', {
      class: 'btn btn-outline btn-block',
      style: 'margin-bottom:10px;',
      html: `${icon(iconName)}<span>${label}</span>`,
      onclick: onClick,
    });

  const csvInput = el('input', { type: 'file', accept: '.csv', style: 'display:none;' }) as HTMLInputElement;
  csvInput.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const categories = await store.listCategories();
      const { transactions, result } = transactionsFromCSV(text, categories, getSettings().currency);
      await store.saveTransactions(transactions);
      toast(`${result.imported} imported, ${result.skipped} skipped.`, result.imported > 0 ? 'success' : 'info');
    } catch {
      toast('Could not read that file.', 'error');
    } finally {
      csvInput.value = '';
    }
  };

  const jsonInput = el('input', { type: 'file', accept: '.json', style: 'display:none;' }) as HTMLInputElement;
  jsonInput.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = fromBackupJSON(text);
      if (!data) {
        toast('That file is not a valid backup.', 'error');
        return;
      }
      const ok = await confirmDialog({
        title: 'Restore backup?',
        message: 'This will REPLACE all current data with the backup.',
        confirmLabel: 'Restore',
        danger: true,
      });
      if (!ok) return;
      await store.replaceAll(data);
      saveSettings(data.settings);
      refreshTheme();
      toast('Backup restored.', 'success');
    } catch {
      toast('Could not read that file.', 'error');
    } finally {
      jsonInput.value = '';
    }
  };

  view.appendChild(
    sectionCard('Data',
      dataBtn('download', 'Export CSV', async () => {
        const txns = await store.listTransactions();
        const categories = await store.listCategories();
        const catName = new Map(categories.map((c) => [c.id, c.name]));
        const csv = transactionsToCSV(txns, (id) => catName.get(id) ?? 'Unknown category', getSettings().currency);
        downloadFile(`expenses-${todayISO()}.csv`, csv, 'text/csv');
        toast('CSV exported.', 'success');
      }),
      dataBtn('download', 'Export JSON backup', async () => {
        const [transactions, categories, budgets, goals, recurring] = await Promise.all([
          store.listTransactions(),
          store.listCategories(),
          store.listBudgets(),
          store.listGoals(),
          store.listRecurring(),
        ]);
        const data: BackupData = {
          version: 1,
          exportedAt: Date.now(),
          transactions,
          categories,
          budgets,
          goals,
          recurring,
          settings: getSettings(),
        };
        downloadFile(`backup-${todayISO()}.json`, toBackupJSON(data), 'application/json');
        toast('Backup exported.', 'success');
      }),
      dataBtn('upload', 'Import CSV', () => csvInput.click()),
      dataBtn('upload', 'Restore JSON backup', () => jsonInput.click()),
      csvInput,
      jsonInput,
    ),
  );

  // ------------------------------------------------------------- 7. Danger zone
  view.appendChild(sectionCard('Danger zone',
    el('button', {
      class: 'set-row danger',
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Reset everything?',
          message: 'All transactions, budgets, goals and recurring rules will be permanently deleted.',
          confirmLabel: 'Reset all',
          danger: true,
        });
        if (!ok) return;
        await store.resetAll();
        await store.ensureSeeded();
        toast('All data has been reset.', 'success');
      },
    },
      el('span', { class: 'lead', html: icon('trash') }),
      el('span', { class: 'lbl', text: 'Reset all data' }),
      el('span', { html: icon('chevron-right') }),
    ),
  ));

  // ------------------------------------------------------------- 8. About
  view.appendChild(sectionCard('About',
    el('h3', { text: 'Student Expense Tracker', style: 'margin:0 0 4px;font-size:16px;' }),
    el('p', { text: 'Version 1.5.0', style: 'margin:0 0 8px;color:var(--text-soft);font-size:13px;' }),
    el('p', {
      text: 'Offline-first student expense tracker. Built with plain logic — no AI, no accounts, no tracking.',
      style: 'margin:0;color:var(--text-soft);font-size:13.5px;line-height:1.5;',
    }),
  ));
}
