# Pocket Budget

A simple, private personal budgeting website for tracking daily expenses, monthly income and budgets.
It's plain HTML/CSS/JavaScript — no build step, no server, no account — so it runs free on any static host.

## Features

- **Daily records** — expenses and income with amount, **currency**, category, date, payment method and note. Quick-add with the ＋ button (or press `N`).
- **Multi-currency** — every record has its own currency and exchange rate (e.g. USD and KHR). All totals, budgets and balances are converted to the **base currency, USD**. Rates are editable in Settings or can be updated online.
- **Clear money terms on the dashboard**
  - **Income** — money that came in this month.
  - **Available to spend** — this month's income − this month's spending.
  - **Net worth** — everything you own so far: starting balance + all income − all spending.
  - **Budget left** / **Safe to spend per day** — how much of your monthly budget remains.
- **Monthly budget** — overall limit plus optional per-category limits, copy last budget, planned-savings preview.
- **Dashboard** — budget progress with pace warning, daily spending chart, spending by category, 6-month trend, breakdown by currency, recent and biggest records. Click a day or category to jump to its records.
- **Records page** — grouped by day; search and filter by type, category, payment method, currency or day, with one-click **Clear filters**.
- **Bank-style statement** — pick a period (month, 3 months, year, all time, custom) and get opening balance, money in, money out, closing balance and a running balance per record. Export as **Excel (.xlsx)** with Statement / By category / By currency sheets, as **CSV**, or **Print / Save as PDF**.
- **Recurring records** — rent, bills, subscriptions or salary are added automatically every month (any currency).
- **Everything customizable** in Settings — app name, your name on statements, theme, categories and payment methods (add, rename, change icon, reorder, delete-and-move records), currencies and rates, wording/labels (rename "Income", "Expense", "Available to spend", "Net worth", "Paid with"…), which dashboard sections show, budget warning %, and defaults for new records.
- **Backup & restore** — download your data as JSON and restore it on another device.
- **Works on phone** — responsive layout with bottom navigation, dark mode, installable as an app (PWA) that works offline.

## Your data

All data is stored in your browser's `localStorage` on your device. Nothing is sent anywhere.
That means:
- Data doesn't sync between devices automatically — use **Settings → Download backup** / **Restore backup** to move it.
- Clearing your browser's site data deletes your records, so download a backup now and then.

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Free hosting

### GitHub Pages (included workflow)
1. Merge this code into the `main` branch.
2. In the repository go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` deploys via `.github/workflows/pages.yml`. The site appears at
   `https://<your-username>.github.io/<repo-name>/`.

> GitHub Pages on a free account requires the repository to be **public** (private-repo Pages needs a paid plan).
> Your records are never in the repo — they live only in your browser — so a public repo is fine.

### Netlify / Cloudflare Pages / Vercel
Connect the repository, leave the build command **empty**, and set the publish/output directory to `/` (the repo root).
Or drag-and-drop the folder onto <https://app.netlify.com/drop>.

## Project structure

```
index.html            App shell and add/edit dialog
css/styles.css        Styles (light + dark themes, responsive)
js/store.js           Data model, localStorage persistence, summaries, recurring, import/export
js/charts.js          Small SVG bar charts with tooltips (no libraries)
js/xlsx.js            Tiny .xlsx (Excel) writer used by the statement export
js/app.js             Views: dashboard, records, budget, statement, recurring, settings
sw.js                 Service worker for offline use
manifest.webmanifest  PWA manifest
```
