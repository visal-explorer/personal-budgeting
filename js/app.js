/* UI: hash-routed views rendered from Store data. */
(function () {
  'use strict';

  var S = window.Store;
  var C = window.Charts;
  var state = {
    month: S.currentMonth(),
    view: 'dashboard',
    filters: { type: 'all', categoryId: 'all', q: '' }
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var fmtCache = {};
  function money(v, opts) {
    var cur = S.data.settings.currency || 'USD';
    var key = cur + (opts && opts.signed ? 's' : '');
    if (!fmtCache[key]) {
      try {
        fmtCache[key] = new Intl.NumberFormat(undefined, {
          style: 'currency', currency: cur, signDisplay: opts && opts.signed ? 'exceptZero' : 'auto'
        });
      } catch (e) {
        fmtCache[key] = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
    return fmtCache[key].format(v);
  }

  function dayLabel(dateStr) {
    var d = new Date(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
    var today = S.todayISO();
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yISO = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    var base = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    if (dateStr === today) return 'Today · ' + base;
    if (dateStr === yISO) return 'Yesterday · ' + base;
    return base;
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // Budget status: label + icon so color never carries meaning alone.
  function status(spent, limit) {
    if (!limit) return null;
    var pct = spent / limit;
    if (pct > 1) return { cls: 'critical', icon: '⛔', label: 'Over budget', pct: pct };
    if (pct >= 0.85) return { cls: 'warning', icon: '⚠️', label: 'Near limit', pct: pct };
    return { cls: 'good', icon: '✅', label: 'On track', pct: pct };
  }

  function progressBar(spent, limit) {
    var st = status(spent, limit);
    if (!st) return '';
    return '<div class="progress ' + st.cls + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      Math.round(st.pct * 100) + '"><span style="width:' + Math.min(100, st.pct * 100).toFixed(1) + '%"></span></div>' +
      '<div class="progress-meta"><span class="status ' + st.cls + '">' + st.icon + ' ' + st.label + '</span>' +
      '<span>' + Math.round(st.pct * 100) + '% used</span></div>';
  }

  // ======================================================================
  // Dashboard
  // ======================================================================
  function renderDashboard(root) {
    var sum = S.monthSummary(state.month);
    var budgetTotal = sum.budget.total || sumCategoryBudgets(sum.budget) || 0;
    var isCurrent = state.month === S.currentMonth();
    var isPast = state.month < S.currentMonth();
    var days = S.daysInMonth(state.month);
    var dayOfMonth = isCurrent ? new Date().getDate() : isPast ? days : 0;
    var daysLeft = isCurrent ? days - dayOfMonth + 1 : isPast ? 0 : days;
    var avgPerDay = dayOfMonth ? sum.expense / dayOfMonth : 0;
    var todaySpent = isCurrent ? sum.daily[dayOfMonth - 1] : null;

    var budgetLeft = budgetTotal - sum.expense;
    var safePerDay = daysLeft > 0 ? Math.max(0, budgetLeft) / daysLeft : 0;

    var html = '';
    html += '<section class="tiles">';
    var incomeCount = sum.transactions.filter(function (t) { return t.type === 'income'; }).length;
    html += tile('Income', money(sum.income), incomeCount + (incomeCount === 1 ? ' record' : ' records'));
    html += tile('Spent', money(sum.expense), isCurrent ? 'Today: ' + money(todaySpent) : 'Avg ' + money(avgPerDay) + '/day');
    html += tile('Balance', money(sum.closing),
      S.data.settings.carryOver ? 'Carried in ' + money(sum.opening) + ' · net ' + money(sum.net, { signed: true }) : 'Net this month',
      sum.closing < 0 ? 'neg' : '');
    if (budgetTotal) {
      html += tile('Budget left', money(budgetLeft),
        daysLeft > 0 && budgetLeft > 0 ? 'Safe to spend ' + money(safePerDay) + '/day' : 'of ' + money(budgetTotal),
        budgetLeft < 0 ? 'neg' : '');
    } else {
      html += '<a class="tile tile-cta" href="#budget"><div class="tile-label">Budget</div><div class="tile-value">Set a budget</div><div class="tile-sub">Plan your spending for ' + esc(S.monthLabel(state.month, true)) + ' →</div></a>';
    }
    html += '</section>';

    if (budgetTotal) {
      html += '<section class="card"><div class="card-head"><h2>Monthly budget</h2><span class="muted">' +
        money(sum.expense) + ' of ' + money(budgetTotal) + '</span></div>' + progressBar(sum.expense, budgetTotal);
      if (isCurrent) {
        var expectedPct = dayOfMonth / days;
        var actualPct = sum.expense / budgetTotal;
        var pace = actualPct > expectedPct + 0.05 ? 'You are spending faster than planned — ' + Math.round(expectedPct * 100) + '% of the month has passed.'
          : 'Spending is on pace — ' + Math.round(expectedPct * 100) + '% of the month has passed.';
        html += '<p class="hint">' + pace + '</p>';
      }
      html += '</section>';
    }

    html += '<section class="card"><div class="card-head"><h2>Daily spending</h2><span class="muted">' +
      esc(S.monthLabel(state.month)) + '</span></div><div class="chart" id="dailyChart"></div>' +
      (budgetTotal ? '<p class="legend"><span class="key key-expense"></span>Spent <span class="key key-over"></span>Over daily budget <span class="key key-ref"></span>Daily budget (' + money(budgetTotal / days) + ')</p>' : '') +
      '</section>';

    html += '<div class="grid-2">';
    html += '<section class="card"><div class="card-head"><h2>Spending by category</h2></div>' + categoryBreakdown(sum) + '</section>';
    html += '<section class="card"><div class="card-head"><h2>Last 6 months</h2></div><div class="chart" id="trendChart"></div>' +
      '<p class="legend"><span class="key key-income"></span>Income <span class="key key-expense"></span>Expenses</p></section>';
    html += '</div>';

    html += '<div class="grid-2">';
    html += '<section class="card"><div class="card-head"><h2>Recent records</h2><a href="#transactions" class="link">See all →</a></div>' +
      txList(sum.transactions.slice(0, 6), false) + '</section>';
    var top = sum.transactions.filter(function (t) { return t.type === 'expense'; })
      .sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5);
    html += '<section class="card"><div class="card-head"><h2>Biggest expenses</h2></div>' + txList(top, false) + '</section>';
    html += '</div>';

    root.innerHTML = html;

    var dayLabels = sum.daily.map(function (_, i) { return String(i + 1); });
    C.barChart($('#dailyChart'), {
      values: sum.daily,
      labels: dayLabels,
      refLine: budgetTotal ? budgetTotal / days : 0,
      ariaLabel: 'Daily spending for ' + S.monthLabel(state.month),
      barClass: function (v) { return budgetTotal && v > budgetTotal / days ? 'bar-over' : 'bar-expense'; },
      tooltip: function (i, v) {
        var date = state.month + '-' + String(i + 1).padStart(2, '0');
        return '<strong>' + esc(dayLabel(date)) + '</strong><br>Spent ' + money(v);
      },
      onClick: function (i) {
        state.filters.q = state.month + '-' + String(i + 1).padStart(2, '0');
        location.hash = '#transactions';
      }
    });

    var months = [];
    for (var k = 5; k >= 0; k--) months.push(S.addMonths(state.month, -k));
    var sums = months.map(function (m) { return S.monthSummary(m); });
    C.groupedBarChart($('#trendChart'), {
      labels: months.map(function (m) { return S.monthLabel(m, true).split(' ')[0]; }),
      series: [
        { name: 'Income', className: 'bar-income', values: sums.map(function (s) { return s.income; }) },
        { name: 'Expenses', className: 'bar-expense', values: sums.map(function (s) { return s.expense; }) }
      ],
      ariaLabel: 'Income and expenses over the last six months',
      tooltip: function (i) {
        var s = sums[i];
        return '<strong>' + esc(S.monthLabel(months[i])) + '</strong><br>Income ' + money(s.income) +
          '<br>Expenses ' + money(s.expense) + '<br>Net ' + money(s.net, { signed: true });
      },
      onClick: function (i) { setMonth(months[i]); }
    });
  }

  function tile(label, value, sub, cls) {
    return '<div class="tile ' + (cls || '') + '"><div class="tile-label">' + esc(label) + '</div><div class="tile-value">' +
      esc(value) + '</div><div class="tile-sub">' + esc(sub || '') + '</div></div>';
  }

  function sumCategoryBudgets(b) {
    return Object.keys(b.categories || {}).reduce(function (s, k) { return s + (Number(b.categories[k]) || 0); }, 0);
  }

  function categoryBreakdown(sum) {
    var catBudgets = sum.budget.categories || {};
    var ids = Object.keys(sum.byCategory);
    Object.keys(catBudgets).forEach(function (id) { if (catBudgets[id] && ids.indexOf(id) === -1) ids.push(id); });
    if (!ids.length) return empty('No expenses recorded this month.');
    ids.sort(function (a, b) { return (sum.byCategory[b] || 0) - (sum.byCategory[a] || 0); });
    var max = Math.max.apply(null, ids.map(function (id) { return Math.max(sum.byCategory[id] || 0, catBudgets[id] || 0); }));
    return '<ul class="cat-bars">' + ids.map(function (id) {
      var c = S.category(id);
      var spent = sum.byCategory[id] || 0;
      var limit = Number(catBudgets[id]) || 0;
      var st = status(spent, limit);
      var share = sum.expense ? Math.round(spent / sum.expense * 100) : 0;
      return '<li><div class="cat-row"><span>' + esc(c.icon) + ' ' + esc(c.name) + '</span><span class="num">' + money(spent) +
        (limit ? ' <span class="muted">/ ' + money(limit) + '</span>' : '') + '</span></div>' +
        '<div class="hbar"><span class="' + (st ? 'fill-' + st.cls : '') + '" style="width:' + (spent / max * 100).toFixed(1) + '%"></span>' +
        (limit ? '<i class="hbar-limit" style="left:' + (limit / max * 100).toFixed(1) + '%" title="Budget"></i>' : '') + '</div>' +
        '<div class="cat-meta muted">' + share + '% of spending' + (st ? ' · <span class="status ' + st.cls + '">' + st.icon + ' ' + st.label + '</span>' : '') + '</div></li>';
    }).join('') + '</ul>';
  }

  function empty(msg) { return '<p class="empty">' + esc(msg) + '</p>'; }

  function txList(list, groupByDay) {
    if (!list.length) return empty('Nothing here yet. Tap ＋ to add a record.');
    var html = '';
    var lastDay = null;
    var dayTotals = {};
    if (groupByDay) {
      list.forEach(function (t) {
        dayTotals[t.date] = dayTotals[t.date] || { exp: 0, inc: 0 };
        dayTotals[t.date][t.type === 'expense' ? 'exp' : 'inc'] += t.amount;
      });
    }
    html += '<ul class="tx-list">';
    list.forEach(function (t) {
      if (groupByDay && t.date !== lastDay) {
        lastDay = t.date;
        var dt = dayTotals[t.date];
        html += '<li class="tx-day"><span>' + esc(dayLabel(t.date)) + '</span><span>' +
          (dt.inc ? '<span class="pos">+' + money(dt.inc) + '</span> ' : '') +
          (dt.exp ? '−' + money(dt.exp) : '') + '</span></li>';
      }
      var c = S.category(t.categoryId);
      html += '<li><button class="tx" data-id="' + esc(t.id) + '">' +
        '<span class="tx-icon" aria-hidden="true">' + esc(c.icon) + '</span>' +
        '<span class="tx-main"><span class="tx-cat">' + esc(c.name) + (t.recurringId ? ' <span class="badge">🔁</span>' : '') + '</span>' +
        '<span class="tx-note">' + esc(t.note || (groupByDay ? '' : dayLabel(t.date))) + (t.method ? ' · ' + esc(t.method) : '') + '</span></span>' +
        '<span class="tx-amt ' + (t.type === 'income' ? 'pos' : '') + '">' + (t.type === 'income' ? '+' : '−') + money(t.amount) + '</span>' +
        '</button></li>';
    });
    return html + '</ul>';
  }

  // ======================================================================
  // Transactions
  // ======================================================================
  function renderTransactions(root) {
    var f = state.filters;
    var catOpts = '<option value="all">All categories</option>' + S.data.categories.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (f.categoryId === c.id ? ' selected' : '') + '>' + esc(c.icon + ' ' + c.name) + '</option>';
    }).join('');

    root.innerHTML =
      '<section class="card">' +
      '<div class="filters">' +
      '<input type="search" id="fq" placeholder="Search notes, category, date…" value="' + esc(f.q) + '" aria-label="Search">' +
      '<select id="ftype" aria-label="Type"><option value="all">All types</option><option value="expense"' + (f.type === 'expense' ? ' selected' : '') + '>Expenses</option><option value="income"' + (f.type === 'income' ? ' selected' : '') + '>Income</option></select>' +
      '<select id="fcat" aria-label="Category">' + catOpts + '</select>' +
      '<button class="btn ghost" id="exportMonth">Export CSV</button>' +
      '</div>' +
      '<div id="txWrap"></div>' +
      '</section>';

    var list = [];
    function renderList() {
      var q = f.q.trim().toLowerCase();
      list = S.transactionsForMonth(state.month).filter(function (t) {
        if (f.type !== 'all' && t.type !== f.type) return false;
        if (f.categoryId !== 'all' && t.categoryId !== f.categoryId) return false;
        if (q) {
          var hay = ((t.note || '') + ' ' + S.category(t.categoryId).name + ' ' + (t.method || '') + ' ' + t.date + ' ' + t.amount).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
      var inc = list.reduce(function (s, t) { return t.type === 'income' ? s + t.amount : s; }, 0);
      var exp = list.reduce(function (s, t) { return t.type === 'expense' ? s + t.amount : s; }, 0);
      $('#txWrap').innerHTML =
        '<div class="summary-strip"><span>' + list.length + (list.length === 1 ? ' record' : ' records') + '</span><span class="pos">+' + money(inc) + '</span><span>−' + money(exp) + '</span></div>' +
        txList(list, true);
    }
    renderList();

    $('#fq').addEventListener('input', function (e) { f.q = e.target.value; renderList(); });
    $('#ftype').addEventListener('change', function (e) { f.type = e.target.value; renderList(); });
    $('#fcat').addEventListener('change', function (e) { f.categoryId = e.target.value; renderList(); });
    $('#exportMonth').addEventListener('click', function () {
      download('records-' + state.month + '.csv', S.exportCSV(list), 'text/csv');
    });
  }

  // ======================================================================
  // Budget
  // ======================================================================
  function renderBudget(root) {
    var b = S.budgetFor(state.month);
    var sum = S.monthSummary(state.month);
    var cats = S.categoriesOfType('expense');
    var prev = S.latestBudgetBefore(state.month);
    var catTotal = sumCategoryBudgets(b);

    root.innerHTML =
      '<section class="card"><div class="card-head"><h2>Budget for ' + esc(S.monthLabel(state.month)) + '</h2></div>' +
      '<p class="hint">Set an overall spending limit and, optionally, limits per category. Leave a field empty for no limit.</p>' +
      '<form id="budgetForm">' +
      '<label class="field big">Total monthly budget' +
      '<input type="number" name="total" min="0" step="0.01" inputmode="decimal" value="' + (b.total != null ? b.total : '') + '" placeholder="' + (catTotal ? 'Sum of categories: ' + catTotal : 'e.g. 1200') + '"></label>' +
      '<div class="budget-plan" id="plan"></div>' +
      '<h3>Per-category limits</h3>' +
      '<ul class="budget-cats">' + cats.map(function (c) {
        var spent = sum.byCategory[c.id] || 0;
        var v = b.categories && b.categories[c.id];
        return '<li><label><span>' + esc(c.icon + ' ' + c.name) + '<small class="muted">Spent ' + money(spent) + '</small></span>' +
          '<input type="number" min="0" step="0.01" inputmode="decimal" name="cat-' + esc(c.id) + '" value="' + (v != null && v !== '' ? v : '') + '" placeholder="No limit"></label>' +
          (v ? progressBar(spent, v) : '') + '</li>';
      }).join('') + '</ul>' +
      '<div class="actions">' +
      (prev ? '<button type="button" class="btn ghost" id="copyPrev">Copy last budget</button>' : '') +
      '<button type="button" class="btn ghost" id="clearBudget">Clear</button>' +
      '<span class="spacer"></span><button type="submit" class="btn primary">Save budget</button></div>' +
      '</form></section>';

    var form = $('#budgetForm');
    function updatePlan() {
      var total = parseFloat(form.total.value);
      var cs = 0;
      cats.forEach(function (c) { cs += parseFloat(form['cat-' + c.id].value) || 0; });
      var effective = !isNaN(total) ? total : cs;
      var parts = [];
      parts.push('Category limits add up to <strong>' + money(cs) + '</strong>');
      if (!isNaN(total) && cs > total) parts.push('<span class="status warning">⚠️ more than the total budget</span>');
      if (sum.income) {
        var save = sum.income - effective;
        parts.push('Income this month <strong>' + money(sum.income) + '</strong> → planned savings <strong class="' + (save < 0 ? 'neg' : 'pos') + '">' + money(save, { signed: true }) + '</strong>');
      }
      $('#plan').innerHTML = parts.join('<br>');
    }
    form.addEventListener('input', updatePlan);
    updatePlan();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var total = form.total.value === '' ? null : Math.max(0, parseFloat(form.total.value));
      var catsB = {};
      cats.forEach(function (c) {
        var v = form['cat-' + c.id].value;
        if (v !== '') catsB[c.id] = Math.max(0, parseFloat(v));
      });
      S.setBudget(state.month, { total: total, categories: catsB });
      toast('Budget saved');
    });
    var cp = $('#copyPrev');
    if (cp) cp.addEventListener('click', function () {
      S.setBudget(state.month, JSON.parse(JSON.stringify(prev)));
      toast('Copied previous budget');
    });
    $('#clearBudget').addEventListener('click', function () {
      if (confirm('Clear the budget for ' + S.monthLabel(state.month) + '?')) {
        delete S.data.budgets[state.month];
        S.save();
      }
    });
  }

  // ======================================================================
  // Recurring
  // ======================================================================
  function renderRecurring(root) {
    var rules = S.data.recurring;
    root.innerHTML =
      '<section class="card"><div class="card-head"><h2>Recurring records</h2></div>' +
      '<p class="hint">Fixed monthly items like rent, phone bills, subscriptions or salary. They are added automatically on their day each month.</p>' +
      (rules.length ? '<ul class="tx-list">' + rules.map(function (r) {
        var c = S.category(r.categoryId);
        return '<li class="rule' + (r.active ? '' : ' inactive') + '"><span class="tx-icon">' + esc(c.icon) + '</span>' +
          '<span class="tx-main"><span class="tx-cat">' + esc(r.note || c.name) + '</span><span class="tx-note">' + esc(c.name) + ' · day ' + r.day + ' · from ' + esc(S.monthLabel(r.startMonth, true)) + (r.active ? '' : ' · paused') + '</span></span>' +
          '<span class="tx-amt ' + (r.type === 'income' ? 'pos' : '') + '">' + (r.type === 'income' ? '+' : '−') + money(r.amount) + '</span>' +
          '<span class="rule-actions"><button class="btn ghost sm" data-toggle="' + esc(r.id) + '">' + (r.active ? 'Pause' : 'Resume') + '</button>' +
          '<button class="btn ghost sm danger" data-del="' + esc(r.id) + '">Delete</button></span></li>';
      }).join('') + '</ul>' : empty('No recurring records yet.')) +
      '</section>' +
      '<section class="card"><div class="card-head"><h2>Add recurring</h2></div>' +
      '<form id="ruleForm" class="dialog-form">' +
      '<div class="seg" role="radiogroup" aria-label="Type"><label><input type="radio" name="type" value="expense" checked><span>Expense</span></label><label><input type="radio" name="type" value="income"><span>Income</span></label></div>' +
      '<div class="row"><label class="field">Amount<input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required></label>' +
      '<label class="field">Category<select name="categoryId" required></select></label></div>' +
      '<div class="row"><label class="field">Day of month<input name="day" type="number" min="1" max="31" value="1" required></label>' +
      '<label class="field">Starting<input name="startMonth" type="month" value="' + S.currentMonth() + '" required></label></div>' +
      '<div class="row"><label class="field">Name / note<input name="note" type="text" maxlength="80" placeholder="e.g. Rent"></label>' +
      '<label class="field">Paid with<select name="method"></select></label></div>' +
      '<div class="actions"><span class="spacer"></span><button class="btn primary" type="submit">Add recurring</button></div>' +
      '</form></section>';

    var form = $('#ruleForm');
    fillMethodSelect(form.method, '');
    var fillCats = function () { fillCategorySelect(form.categoryId, form.type.value); };
    $$('input[name=type]', form).forEach(function (r) { r.addEventListener('change', fillCats); });
    fillCats();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      S.upsertRecurring({
        type: form.type.value,
        amount: Math.round(parseFloat(form.amount.value) * 100) / 100,
        categoryId: form.categoryId.value,
        day: Math.min(31, Math.max(1, parseInt(form.day.value, 10) || 1)),
        startMonth: form.startMonth.value || S.currentMonth(),
        note: form.note.value.trim(),
        method: form.method.value,
        active: true
      });
      toast('Recurring record added');
    });
    $$('[data-toggle]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var r = rules.find(function (x) { return x.id === b.dataset.toggle; });
        S.upsertRecurring({ id: r.id, active: !r.active });
      });
    });
    $$('[data-del]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Delete this recurring rule? Records already added stay.')) S.deleteRecurring(b.dataset.del);
      });
    });
  }

  // ======================================================================
  // Settings
  // ======================================================================
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'KHR', 'THB', 'VND', 'SGD', 'MYR', 'IDR', 'PHP', 'JPY', 'KRW', 'CNY', 'INR', 'AUD', 'CAD', 'NZD', 'CHF', 'HKD', 'TWD'];

  function renderSettings(root) {
    var st = S.data.settings;
    var cur = CURRENCIES.indexOf(st.currency) === -1 ? CURRENCIES.concat([st.currency]) : CURRENCIES;

    function catSection(type) {
      return '<h3>' + (type === 'expense' ? 'Expense' : 'Income') + ' categories</h3><ul class="cat-edit">' +
        S.categoriesOfType(type).map(function (c) {
          return '<li><input class="icon-input" data-icon="' + esc(c.id) + '" value="' + esc(c.icon) + '" aria-label="Icon" maxlength="4">' +
            '<input data-name="' + esc(c.id) + '" value="' + esc(c.name) + '" aria-label="Name" maxlength="40">' +
            '<button class="btn ghost sm danger" data-delcat="' + esc(c.id) + '" aria-label="Delete ' + esc(c.name) + '">✕</button></li>';
        }).join('') +
        '</ul><form class="add-cat" data-type="' + type + '"><input name="icon" class="icon-input" placeholder="🙂" maxlength="4" aria-label="Icon">' +
        '<input name="name" placeholder="New category" required maxlength="40" aria-label="New category name"><button class="btn ghost sm">Add</button></form>';
    }

    root.innerHTML =
      '<section class="card"><div class="card-head"><h2>Preferences</h2></div>' +
      '<div class="row"><label class="field">Currency<select id="setCurrency">' + cur.map(function (c) {
        return '<option' + (c === st.currency ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="field">Theme<select id="setTheme"><option value="auto">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>' +
      '<label class="check"><input type="checkbox" id="setCarry"' + (st.carryOver ? ' checked' : '') + '> Carry balance over to the next month</label>' +
      '<label class="field">Starting balance (money you had before your first record)<input type="number" step="0.01" inputmode="decimal" id="setOpening" value="' + (Number(st.openingBalance) || 0) + '"></label>' +
      '</section>' +
      '<section class="card"><div class="card-head"><h2>Categories</h2></div>' + catSection('expense') + catSection('income') + '</section>' +
      '<section class="card"><div class="card-head"><h2>Backup & data</h2></div>' +
      '<p class="hint">Your records are saved only in this browser on this device. Download a backup regularly, and use it to move your data to another device.</p>' +
      '<div class="actions wrap">' +
      '<button class="btn primary" id="backup">Download backup (.json)</button>' +
      '<label class="btn ghost file-btn">Restore backup<input type="file" accept=".json,application/json" id="restore" hidden></label>' +
      '<button class="btn ghost" id="csvAll">Export all records (.csv)</button>' +
      '<button class="btn ghost danger" id="reset">Delete all data</button>' +
      '</div>' +
      '<p class="muted small">' + S.data.transactions.length + ' records stored.</p></section>';

    $('#setTheme').value = st.theme || 'auto';
    $('#setCurrency').addEventListener('change', function (e) { st.currency = e.target.value; fmtCache = {}; S.save(); toast('Currency updated'); });
    $('#setTheme').addEventListener('change', function (e) { st.theme = e.target.value; applyTheme(); S.save(); });
    $('#setCarry').addEventListener('change', function (e) { st.carryOver = e.target.checked; S.save(); });
    $('#setOpening').addEventListener('change', function (e) { st.openingBalance = parseFloat(e.target.value) || 0; S.save(); toast('Starting balance saved'); });

    $$('[data-name]', root).forEach(function (inp) {
      inp.addEventListener('change', function () { if (inp.value.trim()) S.updateCategory(inp.dataset.name, { name: inp.value.trim() }); });
    });
    $$('[data-icon]', root).forEach(function (inp) {
      inp.addEventListener('change', function () { if (inp.value.trim()) S.updateCategory(inp.dataset.icon, { icon: inp.value.trim() }); });
    });
    $$('[data-delcat]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        if (!S.deleteCategory(b.dataset.delcat)) toast('This category has records — rename it instead.');
      });
    });
    $$('.add-cat', root).forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        S.addCategory(f.name.value.trim(), f.dataset.type, f.icon.value.trim());
        toast('Category added');
      });
    });

    $('#backup').addEventListener('click', function () {
      download('pocket-budget-backup-' + S.todayISO() + '.json', S.exportJSON(), 'application/json');
    });
    $('#csvAll').addEventListener('click', function () {
      download('pocket-budget-records-' + S.todayISO() + '.csv', S.exportCSV(), 'text/csv');
    });
    $('#restore').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      if (!confirm('Restoring replaces all current data with the backup. Continue?')) return;
      file.text().then(function (text) {
        try { S.importJSON(text); fmtCache = {}; applyTheme(); toast('Backup restored'); }
        catch (err) { alert('Could not restore: ' + err.message); }
      });
    });
    $('#reset').addEventListener('click', function () {
      if (confirm('Delete ALL records, budgets and settings? This cannot be undone.') && confirm('Are you sure? Consider downloading a backup first.')) {
        S.resetAll(); fmtCache = {}; applyTheme(); toast('All data deleted');
      }
    });
  }

  // ======================================================================
  // Add / edit dialog
  // ======================================================================
  var dialog = $('#txDialog');
  var txForm = $('#txForm');

  function fillCategorySelect(select, type, selected) {
    select.innerHTML = S.categoriesOfType(type).map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.icon + ' ' + c.name) + '</option>';
    }).join('');
  }
  function fillMethodSelect(select, selected) {
    select.innerHTML = '<option value="">—</option>' + S.PAYMENT_METHODS.map(function (m) {
      return '<option' + (m === selected ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
  }

  function openTx(tx) {
    var editing = !!(tx && tx.id);
    tx = tx || {};
    var type = tx.type || 'expense';
    txForm.dataset.id = editing ? tx.id : '';
    $('#txTitle').textContent = editing ? 'Edit record' : 'Add record';
    $('#txDelete').hidden = !editing;
    $$('input[name=type]', txForm).forEach(function (r) { r.checked = r.value === type; });
    fillCategorySelect(txForm.categoryId, type, tx.categoryId);
    fillMethodSelect(txForm.method, tx.method || lastMethod());
    txForm.amount.value = tx.amount != null ? tx.amount : '';
    // Default date: today if viewing the current month, else the 1st of the viewed month.
    txForm.date.value = tx.date || (state.month === S.currentMonth() ? S.todayISO() : state.month + '-01');
    txForm.note.value = tx.note || '';
    var notes = {};
    S.data.transactions.slice(-200).forEach(function (t) { if (t.note) notes[t.note] = 1; });
    $('#noteSuggestions').innerHTML = Object.keys(notes).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    dialog.showModal();
    setTimeout(function () { txForm.amount.focus(); }, 50);
  }

  function lastMethod() {
    var t = S.data.transactions[S.data.transactions.length - 1];
    return t ? t.method || '' : '';
  }

  $$('input[name=type]', txForm).forEach(function (r) {
    r.addEventListener('change', function () { fillCategorySelect(txForm.categoryId, txForm.type.value); });
  });
  txForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var amount = Math.round(parseFloat(txForm.amount.value) * 100) / 100;
    if (!(amount > 0)) { txForm.amount.focus(); return; }
    var tx = {
      type: txForm.type.value,
      amount: amount,
      categoryId: txForm.categoryId.value,
      date: txForm.date.value,
      method: txForm.method.value,
      note: txForm.note.value.trim()
    };
    if (txForm.dataset.id) tx.id = txForm.dataset.id;
    S.upsertTransaction(tx);
    dialog.close();
    toast(txForm.dataset.id ? 'Record updated' : 'Record added');
    if (S.monthOf(tx.date) !== state.month) setMonth(S.monthOf(tx.date));
  });
  $('#txCancel').addEventListener('click', function () { dialog.close(); });
  $('#txDelete').addEventListener('click', function () {
    if (confirm('Delete this record?')) {
      S.deleteTransaction(txForm.dataset.id);
      dialog.close();
      toast('Record deleted');
    }
  });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  // ======================================================================
  // Shell: routing, month nav, theme
  // ======================================================================
  var VIEWS = {
    dashboard: renderDashboard,
    transactions: renderTransactions,
    budget: renderBudget,
    recurring: renderRecurring,
    settings: renderSettings
  };

  function render() {
    C.hideTip();
    $('#monthLabel').textContent = S.monthLabel(state.month);
    $('#monthLabel').classList.toggle('not-current', state.month !== S.currentMonth());
    $$('.tabs a').forEach(function (a) { a.classList.toggle('active', a.dataset.view === state.view); a.setAttribute('aria-current', a.dataset.view === state.view ? 'page' : 'false'); });
    var root = $('#view');
    var y = window.scrollY;
    VIEWS[state.view](root);
    window.scrollTo(0, y);
  }

  function setMonth(m) { state.month = m; render(); }

  function route() {
    var v = (location.hash || '#dashboard').slice(1);
    var changed = v !== state.view;
    state.view = VIEWS[v] ? v : 'dashboard';
    render();
    if (changed) window.scrollTo(0, 0);
  }

  function applyTheme() {
    var t = S.data.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  $('#prevMonth').addEventListener('click', function () { setMonth(S.addMonths(state.month, -1)); });
  $('#nextMonth').addEventListener('click', function () { setMonth(S.addMonths(state.month, 1)); });
  $('#monthLabel').addEventListener('click', function () { setMonth(S.currentMonth()); });
  $('#addBtn').addEventListener('click', function () { openTx(); });
  $('#view').addEventListener('click', function (e) {
    var b = e.target.closest('.tx[data-id]');
    if (!b) return;
    var tx = S.data.transactions.find(function (t) { return t.id === b.dataset.id; });
    if (tx) openTx(tx);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'n' && !dialog.open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openTx(); }
  });

  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (state.view === 'dashboard') render(); }, 150);
  });
  window.addEventListener('hashchange', route);

  S.load();
  applyTheme();
  S.onChange(render);
  route();

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
