# Pocket Budget

A simple, private personal budgeting website for tracking daily expenses, monthly income and budgets.
It's plain HTML/CSS/JavaScript — no build step, no server, no account — so it runs free on any static host.

## Features

- **Daily expense & income records** — amount, category, date, payment method and note. Quick-add with the ＋ button (or press `N`). Notes autocomplete from earlier records.
- **Monthly budget** — an overall limit plus optional per-category limits, with "copy last budget" and a planned-savings preview against the month's income.
- **Balance per month** — income, spending and net for every month; the balance can carry over from month to month starting from an opening balance you set.
- **Dashboard** — income / spent / balance / budget-left tiles, budget progress with pace warning and "safe to spend per day", daily spending chart vs. the daily budget, spending by category with limits, a 6-month income-vs-expense trend, recent records and biggest expenses.
- **Records page** — grouped by day with daily totals; search and filter by type or category; export the month to CSV.
- **Recurring records** — rent, bills, subscriptions or salary are added automatically every month on their day (pause/resume anytime).
- **Custom categories** — rename, change icons, add or remove categories.
- **Backup & restore** — download your data as JSON and restore it on another device; export everything to CSV for spreadsheets.
- **Works on phone** — responsive layout with bottom navigation, dark mode, and installable as an app (PWA) that works offline.

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
js/app.js             Views: dashboard, records, budget, recurring, settings
sw.js                 Service worker for offline use
manifest.webmanifest  PWA manifest
```
