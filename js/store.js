/* Data layer: everything is stored in the browser's localStorage.
 * No server, no account — the site can be hosted on any static host. */
(function () {
  'use strict';

  var STORAGE_KEY = 'pb-data-v1';

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

  var PAYMENT_METHODS = ['Cash', 'Card', 'Bank transfer', 'E-wallet', 'Other'];

  function defaultData() {
    return {
      version: 1,
      settings: {
        currency: 'USD',
        theme: 'auto',
        carryOver: true,
        openingBalance: 0
      },
      categories: DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); }),
      transactions: [],
      // budgets['2026-10'] = { total: 1500, categories: { food: 300 } }
      budgets: {},
      recurring: []
    };
  }

  // ---------- date helpers (always local time, never UTC) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
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
    return {
      version: 1,
      settings: Object.assign(base.settings, d.settings || {}),
      categories: Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories,
      transactions: Array.isArray(d.transactions) ? d.transactions.filter(validTx) : [],
      budgets: d.budgets && typeof d.budgets === 'object' ? d.budgets : {},
      recurring: Array.isArray(d.recurring) ? d.recurring : []
    };
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

  function transactionsForMonth(month) {
    return data.transactions
      .filter(function (t) { return monthOf(t.date) === month; })
      .sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  // ---------- categories ----------
  function category(id) {
    return data.categories.find(function (c) { return c.id === id; }) ||
      { id: id, name: 'Uncategorized', icon: '❔', type: 'expense' };
  }
  function categoriesOfType(type) {
    return data.categories.filter(function (c) { return c.type === type; });
  }
  function addCategory(name, type, icon) {
    var c = { id: uid(), name: name, type: type, icon: icon || (type === 'income' ? '💰' : '📦') };
    data.categories.push(c);
    save();
    return c;
  }
  function updateCategory(id, patch) {
    var c = data.categories.find(function (x) { return x.id === id; });
    if (c) { Object.assign(c, patch); save(); }
  }
  function deleteCategory(id) {
    var used = data.transactions.some(function (t) { return t.categoryId === id; });
    if (used) return false;
    data.categories = data.categories.filter(function (c) { return c.id !== id; });
    Object.keys(data.budgets).forEach(function (m) {
      if (data.budgets[m].categories) delete data.budgets[m].categories[id];
    });
    save();
    return true;
  }

  // ---------- budgets ----------
  function budgetFor(month) {
    return data.budgets[month] || { total: null, categories: {} };
  }
  function setBudget(month, budget) {
    data.budgets[month] = budget;
    save();
  }
  function latestBudgetBefore(month) {
    var months = Object.keys(data.budgets).filter(function (m) { return m < month; }).sort();
    return months.length ? data.budgets[months[months.length - 1]] : null;
  }

  // ---------- summaries ----------
  function sumBy(list, type) {
    return list.reduce(function (s, t) { return t.type === type ? s + t.amount : s; }, 0);
  }

  // Balance carried into `month` = opening balance + net of every earlier month.
  function openingBalance(month) {
    if (!data.settings.carryOver) return 0;
    var bal = Number(data.settings.openingBalance) || 0;
    data.transactions.forEach(function (t) {
      if (monthOf(t.date) < month) bal += t.type === 'income' ? t.amount : -t.amount;
    });
    return bal;
  }

  function monthSummary(month) {
    var txs = transactionsForMonth(month);
    var income = sumBy(txs, 'income');
    var expense = sumBy(txs, 'expense');
    var opening = openingBalance(month);
    var budget = budgetFor(month);
    var byCategory = {};
    txs.forEach(function (t) {
      if (t.type !== 'expense') return;
      byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount;
    });
    var days = daysInMonth(month);
    var daily = new Array(days).fill(0);
    txs.forEach(function (t) {
      if (t.type === 'expense') daily[+t.date.slice(8, 10) - 1] += t.amount;
    });
    return {
      month: month,
      transactions: txs,
      income: income,
      expense: expense,
      net: income - expense,
      opening: opening,
      closing: opening + income - expense,
      budget: budget,
      byCategory: byCategory,
      daily: daily
    };
  }

  // ---------- recurring ----------
  // Each rule creates one transaction per month on its day, from startMonth up
  // to the current month. `applied` remembers which months were already created
  // so deleting a generated transaction doesn't make it reappear.
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
          data.transactions.push({
            id: uid(), createdAt: Date.now(), type: r.type, amount: r.amount,
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
  function exportCSV(list) {
    var rows = [['Date', 'Type', 'Category', 'Amount', 'Payment method', 'Note']];
    (list || data.transactions).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .forEach(function (t) {
        rows.push([t.date, t.type, category(t.categoryId).name, t.amount.toFixed(2), t.method || '', t.note || '']);
      });
    return rows.map(function (r) {
      return r.map(function (v) {
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
  }
  function resetAll() {
    data = defaultData();
    save();
  }

  window.Store = {
    load: load, save: save, onChange: onChange,
    get data() { return data; },
    PAYMENT_METHODS: PAYMENT_METHODS,
    todayISO: todayISO, currentMonth: currentMonth, monthOf: monthOf,
    addMonths: addMonths, daysInMonth: daysInMonth, monthLabel: monthLabel,
    upsertTransaction: upsertTransaction, deleteTransaction: deleteTransaction,
    transactionsForMonth: transactionsForMonth,
    category: category, categoriesOfType: categoriesOfType,
    addCategory: addCategory, updateCategory: updateCategory, deleteCategory: deleteCategory,
    budgetFor: budgetFor, setBudget: setBudget, latestBudgetBefore: latestBudgetBefore,
    monthSummary: monthSummary, openingBalance: openingBalance,
    upsertRecurring: upsertRecurring, deleteRecurring: deleteRecurring,
    exportJSON: exportJSON, importJSON: importJSON, exportCSV: exportCSV, resetAll: resetAll
  };
})();
