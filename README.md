# Student Expense Tracker

A modern, offline-first expense tracker designed for students. No accounts, no AI APIs, no tracking — your financial data never leaves your device.

![PWA](https://img.shields.io/badge/PWA-offline--first-e11d48) ![License](https://img.shields.io/badge/license-MIT-green) ![Version](https://img.shields.io/badge/version-1.5.0-e11d48)

**v1.5** — new red visual identity, Light/Dark/System themes, brand-new logo, and a dedicated Tools tab.

## Features

- **Dashboard** — available cash, income, expenses, safe-to-spend today, allowance runway, 14-day chart, rule-based insights
- **Fast expense & income entry** — amount, category, date, note, payment method with strict validation
- **Transaction history** — search, filter by type/category/date range, edit, delete (with confirmation)
- **Borrowing & debt** — borrow money, track outstanding debt, repay; borrowed money is never counted as income
- **Budgets** — overall or per-category, weekly or monthly, with 80%-used warnings
- **Statistics** — spending by category (donut), spending over time (bars), top category, averages
- **Savings goals** — visual progress, add money toward a goal
- **Recurring expenses** — daily/weekly/monthly rules auto-generated on app open (idempotent, no duplicates)
- **Tools** — calculator, money calculators (discount, split bill, savings, tip), and offline mini games
- **Light / Dark / System theme** — persisted locally, applied before first paint (no flash)
- **Student-friendly insights** — plain conditional rules, never AI
- **Local notifications** — budget alerts, goal reminders, recurring notices (opt-in)
- **Onboarding** — name, allowance, currency, budget, optional savings goal
- **Settings** — profile, currency (PKR default), appearance, notifications, categories, export/import, reset
- **Data export/import** — CSV (`Date,Type,Category,Amount,Note,PaymentMethod`) and full JSON backup/restore

## Accounting model

- **Available Cash** = Opening Balance + Income + Gifts + Borrowed − Expenses − Debt Repayments
- **Outstanding Debt** = Total Borrowed − Total Debt Repaid
- Borrowed money is **not** income. Gift money is **not** income. The opening balance is **not** a normal transaction. Expected allowance never increases Available Cash until actually received.

## Tech

- **Vite + TypeScript** (no UI framework — tiny bundle, fast on low-end devices)
- **IndexedDB** for transactions/budgets/goals/recurring (local-first, works offline)
- **Service worker** via `vite-plugin-pwa` — the whole app works without internet
- **Custom SVG charts** — zero chart dependencies
- **Money stored as integer minor units** (paisa) — no floating-point rounding errors
- **Vitest** — 183 unit + integration tests

## Privacy

- No account required. No analytics. No network requests for core features.
- No AI services are used or contacted — all calculations, budgets, charts, and insights are plain application logic.

## Android

- Capacitor-packaged release APK built from this source (see [Releases](../../releases))
- `student-expense-tracker-v1.5.0.apk` — signed release build
- Upgrading preserves all local data (transactions, budgets, goals, settings)

## Web app

The PWA is deployed to GitHub Pages from the `main` branch via `.github/workflows/deploy.yml` (build → test → deploy).

## Development

```bash
npm install
npm run dev      # local dev server
npm run test     # tests (vitest)
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
  views/             # dashboard, transactions, statistics, budgets, goals,
                     # recurring, profile, settings, categories, tools, onboarding
  services/          # local notifications, recurring runner, Android back button
tests/               # vitest unit + integration tests
```

## Currency

PKR (₨) is the default. Amounts are stored in minor units; adding a currency is one row in `CURRENCIES` (`src/model/defaults.ts`).
