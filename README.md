# Student Expense Tracker

A modern, offline-first expense tracker designed for students. No accounts, no AI APIs, no tracking — your financial data never leaves your device.

![PWA](https://img.shields.io/badge/PWA-offline--first-4f46e5) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Dashboard** — balance, income, expenses, today's / this week's / this month's spending, 14-day spending chart, and rule-based insights
- **Fast expense & income entry** — amount, category, date, note, payment method with strict validation
- **Transaction history** — search, filter by type/category/date range, edit, delete (with confirmation)
- **Budgets** — overall or per-category, weekly or monthly, with 80%-used warnings
- **Statistics** — spending by category (donut), spending over time (bars), top category, averages
- **Savings goals** — visual progress, add money toward a goal
- **Recurring expenses** — daily/weekly/monthly rules auto-generated on app open (idempotent, no duplicates)
- **Student-friendly insights** — plain conditional rules (e.g. "Food is your biggest spending category this month"), never AI
- **Local notifications** — budget alerts, goal reminders, recurring notices (opt-in)
- **Onboarding** — name, allowance, currency, budget, optional savings goal
- **Settings** — profile, currency (PKR default, extensible), light/dark/system theme, notifications, categories, export/import, reset
- **Data export/import** — CSV (`Date,Type,Category,Amount,Note,PaymentMethod`) and full JSON backup/restore

## Tech

- **Vite + TypeScript** (no UI framework — tiny 73 KB bundle, fast on low-end devices)
- **IndexedDB** for transactions/budgets/goals/recurring (local-first, works offline)
- **Service worker** via `vite-plugin-pwa` — the whole app works without internet
- **Custom SVG charts** — zero chart dependencies
- **Money stored as integer minor units** (paisa) — no floating-point rounding errors
- **Vitest** unit tests for all financial calculations

## Privacy

- No account required. No analytics. No network requests for core features.
- No AI services are used or contacted — all calculations, categorization, budgets, charts, and insights are plain application logic.

## Development

```bash
npm install
npm run dev      # local dev server
npm run test     # unit tests (vitest)
npm run build    # production build -> dist/
npm run preview  # serve the production build
```

## Project structure

```
src/
  main.ts            # entry: seed, onboarding, recurring runner, budget alerts
  app.ts             # shell: header, hash router, bottom nav
  model/             # types, default categories, currencies
  core/              # pure logic: money, dates, finance, budgets, insights, recurring, export
  data/              # IndexedDB wrapper + store (pub/sub)
  ui/                # icons, components (modal/toast/charts), nav, styles
  views/             # dashboard, transactions, add-sheet, statistics, budgets,
                     # goals, recurring, profile, settings, categories, onboarding
  services/          # local notifications, recurring runner
tests/               # vitest unit tests for the financial core
```

## Currency

PKR (₨) is the default. Amounts are stored in minor units; adding a currency is one row in `CURRENCIES` (`src/model/defaults.ts`).
