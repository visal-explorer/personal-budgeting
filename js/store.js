/* Data layer: everything is stored in the browser's localStorage.
 * No server, no account — the site can be hosted on any static host.
 *
 * Money: every record keeps its own currency and the exchange rate used when it
 * was entered (`rate` = units of that currency per 1 unit of the base currency).
 * All totals, budgets and balances are computed in the base currency (USD). */
(function () {
  'use strict';

  var STORAGE_KEY = 'pb-data-v1';
  var BASE = 'USD';

  var DEFAULT_CATEGORIES = [
    { id: 'food', name: 'Food & Dining', type: 'expense', icon: '🍜' },
    { id: 'groceries', name: 'Groceries', type: 'expense', icon: '🛒' },
    { id: 'transport', name: 'Transport', type: 'expense', icon: '🚌' },
    { id: 'housing', name: 'Rent & Housing', type: 'expense', icon: '🏠' },
    { id: 'utilities', name: 'Bills & Utilities', type: 'expense', icon: '💡' },
    { id: 'shopping', name: 'Shopping', type: 'expense', icon: '🛍️' },
    { id: 'health', name: 'Health', type: 'expense', icon: '💊' },
    { id: 'entertainment', name: 'Entertainment', type: 'expense', icon: '🎬' },
    { id: 'education', name: 'Education', type: 'expense', icon: '📚' },
    { id: 'family', name: 'Family & Gifts', type: 'expense', icon: '🎁' },
    { id: 'other', name: 'Other', type: 'expense', icon: '📦' },
    { id: 'salary', name: 'Salary', type: 'income', icon: '💼' },
    { id: 'side', name: 'Side income', type: 'income', icon: '🧾' },
    { id: 'gift-in', name: 'Gifts received', type: 'income', icon: '🎉' },
    { id: 'other-in', name: 'Other income', type: 'income', icon: '💰' }
  ];

  var DEFAULT_METHODS = [
    { id: 'cash', name: 'Cash', icon: '💵' },
    { id: 'card', name: 'Card', icon: '💳' },
    { id: 'bank', name: 'Bank transfer', icon: '🏦' },
    { id: 'ewallet', name: 'E-wallet', icon: '📱' }
  ];

  // Approximate rates (units per 1 USD). Editable in Settings, or update online.
  var DEFAULT_CURRENCIES = [
    { code: 'USD', rate: 1 },
    { code: 'KHR', rate: 4100 },
    { code: 'EUR', rate: 0.92 },
    { code: 'THB', rate: 34 },
    { code: 'VND', rate: 25400 }
  ];

  var DEFAULT_LABELS = {
    income: 'Income',
    expense: 'Expense',
    available: 'Available to spend',
    netWorth: 'Net worth',
    budgetLeft: 'Budget left',
    method: 'Paid with',
    statementTitle: 'Account Statement'
  };

  var DEFAULT_DASHBOARD = {
    budget: true, daily: true, categories: true, trend: true,
    currencies: true, recent: true, biggest: true
  };

  function defaultData() {
    return {
      version: 2,
      settings: {
        appName: 'Pocket Budget',
        ownerName: '',
        theme: 'auto',
        baseCurrency: BASE,
        startingBalance: 0,
        warnAt: 85,
        defaultType: 'expense',
        defaultCurrency: BASE,
        defaultMethod: '',
        labels: Object.assign({}, DEFAULT_LABELS),
        dashboard: Object.assign({}, DEFAULT_DASHBOARD),
        ratesUpdatedAt: null
      },
      categories: clone(DEFAULT_CATEGORIES),
      paymentMethods: clone(DEFAULT_METHODS),
      currencies: clone(DEFAULT_CURRENCIES),
      transactions: [],
      // budgets['2026-10'] = { total: 1500, categories: { food: 300 } } — in base currency
      budgets: {},
      recurring: []
    };
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // ---------- date helpers (always local time, never UTC) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return isoDate(new Date()); }
  function monthOf(dateStr) { return dateStr.slice(0, 7); }
  function currentMonth() { return monthOf(todayISO()); }
  function addMonths(month, delta) {
    var y = +month.slice(0, 4), m = +month.slice(5, 7) - 1 + delta;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }
  function daysInMonth(month) {
    return new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
  }
  function monthLabel(month, short) {
    var d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1, 1);
    return d.toLocaleDateString(undefined, { month: short ? 'short' : 'long', year: 'numeric' });
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
  }

  // ---------- persistence ----------
  var data;
  var listeners = [];

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      data = raw ? normalize(JSON.parse(raw)) : defaultData();
    } catch (e) {
      console.error('Could not read saved data', e);
      data = defaultData();
    }
    applyRecurring();
    return data;
  }

  function normalize(d) {
    var base = defaultData();
    if (!d || typeof d !== 'object') return base;
    var oldSettings = d.settings || {};
    var out = {
      version: 2,
      settings: Object.assign(base.settings, oldSettings),
      categories: Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories,
      paymentMethods: Array.isArray(d.paymentMethods) ? d.paymentMethods : base.paymentMethods,
      currencies: Array.isArray(d.currencies) && d.currencies.length ? d.currencies : base.currencies,
      transactions: Array.isArray(d.transactions) ? d.transactions.filter(validTx) : [],
      budgets: d.budgets && typeof d.budgets === 'object' ? d.budgets : {},
      recurring: Array.isArray(d.recurring) ? d.recurring : []
    };
    var s = out.settings;
    s.baseCurrency = BASE;
    s.labels = Object.assign({}, DEFAULT_LABELS, oldSettings.labels || {});
    s.dashboard = Object.assign({}, DEFAULT_DASHBOARD, oldSettings.dashboard || {});

    // ---- migrate v1 data ----
    if ((d.version || 1) < 2) {
      var legacyCur = oldSettings.currency || BASE;
      if (oldSettings.openingBalance != null) s.startingBalance = Number(oldSettings.openingBalance) || 0;
      if (!currencyByCode(out.currencies, legacyCur)) out.currencies.push({ code: legacyCur, rate: 1 });
      var legacyRate = currencyByCode(out.currencies, legacyCur).rate;
      if (legacyCur !== BASE) s.startingBalance = s.startingBalance / legacyRate;
      s.defaultCurrency = legacyCur;
      delete s.currency; delete s.openingBalance; delete s.carryOver;
      // Payment methods used to be stored as names.
      var byName = {};
      out.paymentMethods.forEach(function (m) { byName[m.name.toLowerCase()] = m.id; });
      function methodId(name) {
        if (!name) return '';
        var key = name.toLowerCase();
        if (!byName[key]) {
          var m = { id: slug(name), name: name, icon: '💠' };
          out.paymentMethods.push(m);
          byName[key] = m.id;
        }
        return byName[key];
      }
      out.transactions.forEach(function (t) {
        t.currency = legacyCur; t.rate = legacyRate; t.method = methodId(t.method);
      });
      out.recurring.forEach(function (r) {
        r.currency = legacyCur; r.method = methodId(r.method);
      });
      Object.keys(out.budgets).forEach(function (m) {
        var b = out.budgets[m];
        if (legacyCur === BASE) return;
        if (b.total != null) b.total = b.total / legacyRate;
        Object.keys(b.categories || {}).forEach(function (k) { b.categories[k] = b.categories[k] / legacyRate; });
      });
    }
    if (!currencyByCode(out.currencies, BASE)) out.currencies.unshift({ code: BASE, rate: 1 });
    out.transactions.forEach(function (t) {
      if (!t.currency) t.currency = BASE;
      if (!(t.rate > 0)) t.rate = rateOf(t.currency, out.currencies);
    });
    return out;
  }

  function validTx(t) {
    return t && (t.type === 'expense' || t.type === 'income') &&
      typeof t.amount === 'number' && isFinite(t.amount) &&
      /^\d{4}-\d{2}-\d{2}$/.test(t.date || '');
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      alert('Could not save — browser storage may be full or disabled.');
    }
    listeners.forEach(function (fn) { fn(); });
  }

  function onChange(fn) { listeners.push(fn); }

  // ---------- currencies ----------
  function currencyByCode(list, code) {
    return list.find(function (c) { return c.code === code; });
  }
  function rateOf(code, list) {
    if (code === BASE) return 1;
    var c = currencyByCode(list || data.currencies, code);
    return c && c.rate > 0 ? c.rate : 1;
  }
  // Value of a record in the base currency.
  function toBase(t) { return t.amount / (t.rate || 1); }
  function setCurrencies(list) { data.currencies = list; save(); }

  // ---------- transactions ----------
  function upsertTransaction(tx) {
    if (tx.id) {
      var i = data.transactions.findIndex(function (t) { return t.id === tx.id; });
      if (i >= 0) { data.transactions[i] = Object.assign({}, data.transactions[i], tx); save(); return; }
    }
    tx.id = uid();
    tx.createdAt = Date.now();
    data.transactions.push(tx);
    save();
  }

  function deleteTransaction(id) {
    data.transactions = data.transactions.filter(function (t) { return t.id !== id; });
    save();
  }

  function byDateDesc(a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0);
  }

  function transactionsForMonth(month) {
    return data.transactions.filter(function (t) { return monthOf(t.date) === month; }).sort(byDateDesc);
  }

  // ---------- customizable lists (categories, payment methods) ----------
  function category(id) {
    return data.categories.find(function (c) { return c.id === id; }) ||
      { id: id, name: 'Uncategorized', icon: '❔', type: 'expense' };
  }
  function categoriesOfType(type) {
    return data.categories.filter(function (c) { return c.type === type; });
  }
  function method(id) {
    return data.paymentMethods.find(function (m) { return m.id === id; }) || null;
  }
  function addItem(listName, item) {
    item.id = uid();
    data[listName].push(item);
    save();
    return item;
  }
  function updateItem(listName, id, patch) {
    var it = data[listName].find(function (x) { return x.id === id; });
    if (it) { Object.assign(it, patch); save(); }
  }
  function moveItem(listName, id, dir) {
    var list = data[listName];
    var i = list.findIndex(function (x) { return x.id === id; });
    var item = list[i];
    // Move past neighbours of a different type so categories stay in their own group.
    var j = i + dir;
    while (j >= 0 && j < list.length && item.type && list[j].type !== item.type) j += dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(i, 1);
    list.splice(j, 0, item);
    save();
  }
  function usageCount(field, id) {
    return data.transactions.filter(function (t) { return t[field] === id; }).length +
      data.recurring.filter(function (r) { return r[field] === id; }).length;
  }
  // Remove an item; records using it are moved to `replacementId` ('' = none).
  function removeItem(listName, field, id, replacementId) {
    data.transactions.forEach(function (t) { if (t[field] === id) t[field] = replacementId; });
    data.recurring.forEach(function (r) { if (r[field] === id) r[field] = replacementId; });
    data[listName] = data[listName].filter(function (x) { return x.id !== id; });
    if (listName === 'categories') {
      Object.keys(data.budgets).forEach(function (m) {
        if (data.budgets[m].categories) delete data.budgets[m].categories[id];
      });
    }
    if (data.settings.defaultMethod === id) data.settings.defaultMethod = '';
    save();
  }

  // ---------- budgets (base currency) ----------
  function budgetFor(month) {
    return data.budgets[month] || { total: null, categories: {} };
  }
  function setBudget(month, budget) {
    if (budget) data.budgets[month] = budget; else delete data.budgets[month];
    save();
  }
  function latestBudgetBefore(month) {
    var months = Object.keys(data.budgets).filter(function (m) { return m < month; }).sort();
    return months.length ? data.budgets[months[months.length - 1]] : null;
  }

  // ---------- summaries (base currency) ----------
  function signed(t) { return t.type === 'income' ? toBase(t) : -toBase(t); }

  // Net worth at the start of a date (exclusive): starting balance + every earlier record.
  function netWorthBefore(date) {
    var bal = Number(data.settings.startingBalance) || 0;
    data.transactions.forEach(function (t) { if (t.date < date) bal += signed(t); });
    return bal;
  }

  function monthSummary(month) {
    var txs = transactionsForMonth(month);
    var income = 0, expense = 0;
    var byCategory = {}, byCurrency = {};
    var daily = new Array(daysInMonth(month)).fill(0);
    txs.forEach(function (t) {
      var v = toBase(t);
      var cur = byCurrency[t.currency] = byCurrency[t.currency] || { in: 0, out: 0, inBase: 0, outBase: 0, count: 0 };
      cur.count++;
      if (t.type === 'income') {
        income += v; cur.in += t.amount; cur.inBase += v;
      } else {
        expense += v; cur.out += t.amount; cur.outBase += v;
        byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + v;
        daily[+t.date.slice(8, 10) - 1] += v;
      }
    });
    var opening = netWorthBefore(month + '-01');
    return {
      month: month,
      transactions: txs,
      income: income,
      expense: expense,
      available: income - expense,
      openingNetWorth: opening,
      netWorth: opening + income - expense,
      budget: budgetFor(month),
      byCategory: byCategory,
      byCurrency: byCurrency,
      daily: daily
    };
  }

  // Bank-statement style rows between two dates (inclusive), oldest first, with running balance.
  function statement(from, to) {
    var opening = netWorthBefore(from);
    var rows = data.transactions
      .filter(function (t) { return t.date >= from && t.date <= to; })
      .sort(function (a, b) { return -byDateDesc(a, b); });
    var bal = opening, moneyIn = 0, moneyOut = 0;
    var out = rows.map(function (t) {
      var v = toBase(t);
      if (t.type === 'income') { moneyIn += v; bal += v; } else { moneyOut += v; bal -= v; }
      return { tx: t, base: v, balance: bal };
    });
    return { from: from, to: to, opening: opening, moneyIn: moneyIn, moneyOut: moneyOut, closing: bal, rows: out };
  }

  function firstRecordDate() {
    return data.transactions.reduce(function (min, t) { return !min || t.date < min ? t.date : min; }, null);
  }

  // ---------- recurring ----------
  // Each rule creates one record per month on its day, from startMonth up to
  // today. `applied` remembers months already created so deleting a generated
  // record doesn't make it reappear.
  function applyRecurring() {
    var now = currentMonth();
    var today = todayISO();
    var changed = false;
    data.recurring.forEach(function (r) {
      if (!r.active) return;
      r.applied = r.applied || [];
      var m = r.startMonth || now;
      var guard = 0;
      while (m <= now && guard++ < 240) {
        var day = Math.min(r.day || 1, daysInMonth(m));
        var date = m + '-' + pad(day);
        if (date <= today && r.applied.indexOf(m) === -1) {
          var cur = r.currency || BASE;
          data.transactions.push({
            id: uid(), createdAt: Date.now(), type: r.type, amount: r.amount,
            currency: cur, rate: rateOf(cur),
            categoryId: r.categoryId, date: date, note: r.note || '',
            method: r.method || '', recurringId: r.id
          });
          r.applied.push(m);
          changed = true;
        }
        m = addMonths(m, 1);
      }
    });
    if (changed) save();
  }
  function upsertRecurring(rule) {
    if (rule.id) {
      var i = data.recurring.findIndex(function (r) { return r.id === rule.id; });
      if (i >= 0) data.recurring[i] = Object.assign({}, data.recurring[i], rule);
    } else {
      rule.id = uid();
      rule.applied = [];
      data.recurring.push(rule);
    }
    save();
    applyRecurring();
  }
  function deleteRecurring(id) {
    data.recurring = data.recurring.filter(function (r) { return r.id !== id; });
    save();
  }

  // ---------- import / export ----------
  function exportJSON() { return JSON.stringify(data, null, 2); }
  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.transactions)) throw new Error('Not a valid backup file.');
    data = normalize(parsed);
    save();
  }
  function resetAll() {
    data = defaultData();
    save();
  }

  window.Store = {
    load: load, save: save, onChange: onChange,
    get data() { return data; },
    BASE: BASE, DEFAULT_LABELS: DEFAULT_LABELS,
    todayISO: todayISO, isoDate: isoDate, currentMonth: currentMonth, monthOf: monthOf,
    addMonths: addMonths, daysInMonth: daysInMonth, monthLabel: monthLabel,
    upsertTransaction: upsertTransaction, deleteTransaction: deleteTransaction,
    transactionsForMonth: transactionsForMonth,
    category: category, categoriesOfType: categoriesOfType, method: method,
    addItem: addItem, updateItem: updateItem, moveItem: moveItem, removeItem: removeItem, usageCount: usageCount,
    rateOf: rateOf, toBase: toBase, setCurrencies: setCurrencies,
    budgetFor: budgetFor, setBudget: setBudget, latestBudgetBefore: latestBudgetBefore,
    monthSummary: monthSummary, netWorthBefore: netWorthBefore, statement: statement, firstRecordDate: firstRecordDate,
    upsertRecurring: upsertRecurring, deleteRecurring: deleteRecurring,
    exportJSON: exportJSON, importJSON: importJSON, resetAll: resetAll
  };
})();
