/* UI: hash-routed views rendered from Store data. */
(function () {
  'use strict';

  var S = window.Store;
  var C = window.Charts;
  var BASE = S.BASE;
  var state = {
    month: S.currentMonth(),
    view: 'dashboard',
    filters: emptyFilters(),
    statement: { preset: 'month', from: '', to: '' }
  };

  function emptyFilters() { return { q: '', type: 'all', categoryId: 'all', method: 'all', currency: 'all', day: '' }; }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Customizable wording (Settings → Labels).
  function L(key) { return S.data.settings.labels[key] || S.DEFAULT_LABELS[key] || key; }
  function typeLabel(type) { return L(type === 'income' ? 'income' : 'expense'); }

  var fmtCache = {};
  function money(v, cur, opts) {
    cur = cur || BASE;
    var signed = opts && opts.signed;
    var key = cur + (signed ? 's' : '');
    if (!fmtCache[key]) {
      try {
        fmtCache[key] = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, signDisplay: signed ? 'exceptZero' : 'auto' });
      } catch (e) {
        var nf = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: signed ? 'exceptZero' : 'auto' });
        fmtCache[key] = { format: function (x) { return nf.format(x) + ' ' + cur; } };
      }
    }
    return fmtCache[key].format(v);
  }
  function rateText(rate, cur) {
    return '1 ' + BASE + ' = ' + new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(rate) + ' ' + cur;
  }

  function dayLabel(dateStr) {
    var d = new Date(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
    var y = new Date(); y.setDate(y.getDate() - 1);
    var base = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    if (dateStr === S.todayISO()) return 'Today · ' + base;
    if (dateStr === S.isoDate(y)) return 'Yesterday · ' + base;
    return base;
  }
  function longDate(iso) {
    return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
      .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function download(name, content, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function methodName(id) { var m = S.method(id); return m ? m.name : ''; }

  // Budget status: label + icon so color never carries meaning alone.
  function status(spent, limit) {
    if (!limit) return null;
    var pct = spent / limit;
    var warn = (Number(S.data.settings.warnAt) || 85) / 100;
    if (pct > 1) return { cls: 'critical', icon: '⛔', label: 'Over budget', pct: pct };
    if (pct >= warn) return { cls: 'warning', icon: '⚠️', label: 'Near limit', pct: pct };
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

  function empty(msg) { return '<p class="empty">' + esc(msg) + '</p>'; }

  function options(list, selected, opts) {
    opts = opts || {};
    return (opts.none != null ? '<option value="">' + esc(opts.none) + '</option>' : '') +
      list.map(function (x) {
        var v = x.id != null ? x.id : x.code;
        var text = x.code && !x.id ? x.code : ((x.icon ? x.icon + ' ' : '') + x.name);
        return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(text) + '</option>';
      }).join('');
  }

  // ======================================================================
  // Dashboard
  // ======================================================================
  function renderDashboard(root) {
    var show = S.data.settings.dashboard;
    var sum = S.monthSummary(state.month);
    var budgetTotal = sum.budget.total || sumCategoryBudgets(sum.budget) || 0;
    var isCurrent = state.month === S.currentMonth();
    var isPast = state.month < S.currentMonth();
    var days = S.daysInMonth(state.month);
    var dayOfMonth = isCurrent ? new Date().getDate() : isPast ? days : 0;
    var daysLeft = isCurrent ? days - dayOfMonth + 1 : isPast ? 0 : days;
    var avgPerDay = dayOfMonth ? sum.expense / dayOfMonth : 0;
    var incomeCount = sum.transactions.filter(function (t) { return t.type === 'income'; }).length;

    var html = '<section class="tiles">';
    html += tile(L('income'), money(sum.income), 'Money in · ' + incomeCount + (incomeCount === 1 ? ' record' : ' records'), '', 'Money that came in this month');
    html += tile('Spent', money(sum.expense), isCurrent ? 'Today ' + money(sum.daily[dayOfMonth - 1]) + ' · avg ' + money(avgPerDay) + '/day' : 'Avg ' + money(avgPerDay) + '/day', '', 'Money that went out this month');
    html += tile(L('available'), money(sum.available),
      sum.available < 0 ? 'Overspent this month\'s ' + L('income').toLowerCase() : 'Left from this month\'s ' + L('income').toLowerCase(),
      sum.available < 0 ? 'neg' : '', L('income') + ' − spent, this month only');
    html += tile(L('netWorth'), money(sum.netWorth), money(sum.available, BASE, { signed: true }) + ' this month',
      sum.netWorth < 0 ? 'neg' : '', 'Everything you own so far: starting balance + all income − all spending');
    html += '</section>';

    if (show.budget) {
      if (budgetTotal) {
        var budgetLeft = budgetTotal - sum.expense;
        var safePerDay = daysLeft > 0 ? Math.max(0, budgetLeft) / daysLeft : 0;
        html += '<section class="card"><div class="card-head"><h2>Monthly budget</h2><span class="muted">' +
          money(sum.expense) + ' of ' + money(budgetTotal) + '</span></div>' +
          '<div class="budget-left"><div><div class="tile-label">' + esc(L('budgetLeft')) + '</div><div class="big-num ' + (budgetLeft < 0 ? 'neg' : '') + '">' + money(budgetLeft) + '</div></div>' +
          (daysLeft > 0 && budgetLeft > 0 ? '<div><div class="tile-label">Safe to spend</div><div class="big-num">' + money(safePerDay) + '<small>/day</small></div></div>' : '') +
          '</div>' + progressBar(sum.expense, budgetTotal);
        if (isCurrent) {
          var expectedPct = dayOfMonth / days;
          var actualPct = sum.expense / budgetTotal;
          html += '<p class="hint">' + (actualPct > expectedPct + 0.05
            ? 'You are spending faster than planned — ' + Math.round(expectedPct * 100) + '% of the month has passed.'
            : 'Spending is on pace — ' + Math.round(expectedPct * 100) + '% of the month has passed.') + '</p>';
        }
        html += '</section>';
      } else {
        html += '<a class="card cta" href="#budget"><strong>Set a budget for ' + esc(S.monthLabel(state.month)) + '</strong><span class="muted">Plan how much you want to spend and track it here →</span></a>';
      }
    }

    if (show.daily) {
      html += '<section class="card"><div class="card-head"><h2>Daily spending</h2><span class="muted">' +
        esc(S.monthLabel(state.month)) + ' · ' + BASE + '</span></div><div class="chart" id="dailyChart"></div>' +
        '<p class="legend"><span class="key key-expense"></span>Spent' +
        (budgetTotal ? ' <span class="key key-over"></span>Over daily budget <span class="key key-ref"></span>Daily budget (' + money(budgetTotal / days) + ')' : '') +
        '</p></section>';
    }

    var pair = [];
    if (show.categories) pair.push('<section class="card"><div class="card-head"><h2>Spending by category</h2></div>' + categoryBreakdown(sum) + '</section>');
    if (show.trend) pair.push('<section class="card"><div class="card-head"><h2>Last 6 months</h2><span class="muted">' + BASE + '</span></div><div class="chart" id="trendChart"></div>' +
      '<p class="legend"><span class="key key-income"></span>' + esc(L('income')) + ' <span class="key key-expense"></span>Spent</p></section>');
    var curCodes = Object.keys(sum.byCurrency);
    if (show.currencies && (curCodes.length > 1 || (curCodes.length === 1 && curCodes[0] !== BASE))) pair.push(currencyCard(sum));
    if (show.recent) pair.push('<section class="card"><div class="card-head"><h2>Recent records</h2><a href="#transactions" class="link">See all →</a></div>' +
      txList(sum.transactions.slice(0, 6), false) + '</section>');
    if (show.biggest) {
      var top = sum.transactions.filter(function (t) { return t.type === 'expense'; })
        .sort(function (a, b) { return S.toBase(b) - S.toBase(a); }).slice(0, 5);
      pair.push('<section class="card"><div class="card-head"><h2>Biggest expenses</h2></div>' + txList(top, false) + '</section>');
    }
    if (pair.length) html += '<div class="grid-2">' + pair.join('') + '</div>';

    root.innerHTML = html;

    if (show.daily) {
      C.barChart($('#dailyChart'), {
        values: sum.daily,
        labels: sum.daily.map(function (_, i) { return String(i + 1); }),
        refLine: budgetTotal ? budgetTotal / days : 0,
        ariaLabel: 'Daily spending for ' + S.monthLabel(state.month),
        barClass: function (v) { return budgetTotal && v > budgetTotal / days ? 'bar-over' : 'bar-expense'; },
        tooltip: function (i, v) {
          return '<strong>' + esc(dayLabel(state.month + '-' + String(i + 1).padStart(2, '0'))) + '</strong><br>Spent ' + money(v) + '<br><small>Click to see records</small>';
        },
        onClick: function (i) {
          state.filters = emptyFilters();
          state.filters.day = state.month + '-' + String(i + 1).padStart(2, '0');
          location.hash = '#transactions';
        }
      });
    }

    if (show.trend) {
      var months = [];
      for (var k = 5; k >= 0; k--) months.push(S.addMonths(state.month, -k));
      var sums = months.map(function (m) { return S.monthSummary(m); });
      C.groupedBarChart($('#trendChart'), {
        labels: months.map(function (m) { return S.monthLabel(m, true).split(' ')[0]; }),
        series: [
          { name: L('income'), className: 'bar-income', values: sums.map(function (s) { return s.income; }) },
          { name: 'Spent', className: 'bar-expense', values: sums.map(function (s) { return s.expense; }) }
        ],
        ariaLabel: 'Income and spending over the last six months',
        tooltip: function (i) {
          var s = sums[i];
          return '<strong>' + esc(S.monthLabel(months[i])) + '</strong><br>' + esc(L('income')) + ' ' + money(s.income) +
            '<br>Spent ' + money(s.expense) + '<br>' + esc(L('available')) + ' ' + money(s.available, BASE, { signed: true }) +
            '<br>' + esc(L('netWorth')) + ' ' + money(s.netWorth);
        },
        onClick: function (i) { setMonth(months[i]); }
      });
    }
  }

  function tile(label, value, sub, cls, title) {
    return '<div class="tile ' + (cls || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><div class="tile-label">' + esc(label) + '</div><div class="tile-value">' +
      esc(value) + '</div><div class="tile-sub">' + esc(sub || '') + '</div></div>';
  }

  function sumCategoryBudgets(b) {
    return Object.keys(b.categories || {}).reduce(function (s, k) { return s + (Number(b.categories[k]) || 0); }, 0);
  }

  function currencyCard(sum) {
    var rows = Object.keys(sum.byCurrency).sort().map(function (code) {
      var c = sum.byCurrency[code];
      return '<tr><th scope="row">' + esc(code) + '</th><td class="pos">' + (c.in ? '+' + money(c.in, code) : '—') + '</td><td>' +
        (c.out ? '−' + money(c.out, code) : '—') + '</td><td>' + money(c.in - c.out, code, { signed: true }) +
        (code !== BASE ? '<small class="muted">≈ ' + money(c.inBase - c.outBase, BASE, { signed: true }) + '</small>' : '') + '</td></tr>';
    }).join('');
    return '<section class="card"><div class="card-head"><h2>By currency</h2><span class="muted">this month</span></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Currency</th><th>In</th><th>Out</th><th>Net</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><p class="hint small">Totals elsewhere are converted to ' + BASE + ' using each record\'s exchange rate.</p></section>';
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
      return '<li><button class="cat-link" data-cat="' + esc(id) + '"><div class="cat-row"><span>' + esc(c.icon) + ' ' + esc(c.name) + '</span><span class="num">' + money(spent) +
        (limit ? ' <span class="muted">/ ' + money(limit) + '</span>' : '') + '</span></div>' +
        '<div class="hbar"><span class="' + (st ? 'fill-' + st.cls : '') + '" style="width:' + (max ? spent / max * 100 : 0).toFixed(1) + '%"></span>' +
        (limit ? '<i class="hbar-limit" style="left:' + (limit / max * 100).toFixed(1) + '%" title="Budget"></i>' : '') + '</div>' +
        '<div class="cat-meta muted">' + share + '% of spending' + (st ? ' · <span class="status ' + st.cls + '">' + st.icon + ' ' + st.label + '</span>' : '') + '</div></button></li>';
    }).join('') + '</ul>';
  }

  function amountHtml(t) {
    var sign = t.type === 'income' ? '+' : '−';
    var main = '<span class="tx-amt ' + (t.type === 'income' ? 'pos' : '') + '">' + sign + money(t.amount, t.currency);
    if (t.currency !== BASE) main += '<small>≈ ' + money(S.toBase(t)) + '</small>';
    return main + '</span>';
  }

  function txList(list, groupByDay) {
    if (!list.length) return empty('Nothing here yet. Tap ＋ to add a record.');
    var html = '<ul class="tx-list">';
    var lastDay = null;
    var dayTotals = {};
    if (groupByDay) {
      list.forEach(function (t) {
        dayTotals[t.date] = dayTotals[t.date] || { exp: 0, inc: 0 };
        dayTotals[t.date][t.type === 'expense' ? 'exp' : 'inc'] += S.toBase(t);
      });
    }
    list.forEach(function (t) {
      if (groupByDay && t.date !== lastDay) {
        lastDay = t.date;
        var dt = dayTotals[t.date];
        html += '<li class="tx-day"><span>' + esc(dayLabel(t.date)) + '</span><span>' +
          (dt.inc ? '<span class="pos">+' + money(dt.inc) + '</span> ' : '') +
          (dt.exp ? '−' + money(dt.exp) : '') + '</span></li>';
      }
      var c = S.category(t.categoryId);
      var m = methodName(t.method);
      html += '<li><button class="tx" data-id="' + esc(t.id) + '">' +
        '<span class="tx-icon" aria-hidden="true">' + esc(c.icon) + '</span>' +
        '<span class="tx-main"><span class="tx-cat">' + esc(c.name) + (t.recurringId ? ' <span class="badge" title="Recurring">🔁</span>' : '') + '</span>' +
        '<span class="tx-note">' + esc(t.note || (groupByDay ? '' : dayLabel(t.date))) + (m ? (t.note || !groupByDay ? ' · ' : '') + esc(m) : '') + '</span></span>' +
        amountHtml(t) + '</button></li>';
    });
    return html + '</ul>';
  }

  // ======================================================================
  // Records
  // ======================================================================
  function filtersActive(f) {
    return f.q || f.type !== 'all' || f.categoryId !== 'all' || f.method !== 'all' || f.currency !== 'all' || f.day;
  }

  function renderTransactions(root) {
    var f = state.filters;
    var usedCurrencies = {};
    S.data.transactions.forEach(function (t) { usedCurrencies[t.currency] = 1; });
    S.data.currencies.forEach(function (c) { usedCurrencies[c.code] = 1; });

    var catsForType = f.type === 'all' ? S.data.categories : S.categoriesOfType(f.type);
    root.innerHTML =
      '<section class="card">' +
      '<div class="filters">' +
      '<input type="search" id="fq" placeholder="Search notes, category, amount…" value="' + esc(f.q) + '" aria-label="Search">' +
      '<select id="ftype" aria-label="Type"><option value="all">All types</option>' +
      '<option value="expense"' + (f.type === 'expense' ? ' selected' : '') + '>' + esc(L('expense')) + '</option>' +
      '<option value="income"' + (f.type === 'income' ? ' selected' : '') + '>' + esc(L('income')) + '</option></select>' +
      '<select id="fcat" aria-label="Category"><option value="all">All categories</option>' + options(catsForType, f.categoryId) + '</select>' +
      '<select id="fmethod" aria-label="' + esc(L('method')) + '"><option value="all">Any ' + esc(L('method').toLowerCase()) + '</option>' + options(S.data.paymentMethods, f.method) + '</select>' +
      '<select id="fcur" aria-label="Currency"><option value="all">All currencies</option>' + Object.keys(usedCurrencies).sort().map(function (c) {
        return '<option' + (f.currency === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select>' +
      '</div>' +
      '<div class="filter-bar">' +
      (f.day ? '<span class="chip">📅 ' + esc(longDate(f.day)) + ' <button id="clearDay" aria-label="Remove date filter">✕</button></span>' : '') +
      '<button class="btn ghost sm" id="clearFilters"' + (filtersActive(f) ? '' : ' hidden') + '>✕ Clear filters</button>' +
      '<span class="spacer"></span><a class="btn ghost sm" href="#statement">🧾 Statement & export</a>' +
      '</div>' +
      '<div id="txWrap"></div>' +
      '</section>';

    function renderList() {
      var q = f.q.trim().toLowerCase();
      var list = S.transactionsForMonth(state.month).filter(function (t) {
        if (f.type !== 'all' && t.type !== f.type) return false;
        if (f.categoryId !== 'all' && t.categoryId !== f.categoryId) return false;
        if (f.method !== 'all' && t.method !== f.method) return false;
        if (f.currency !== 'all' && t.currency !== f.currency) return false;
        if (f.day && t.date !== f.day) return false;
        if (q) {
          var hay = ((t.note || '') + ' ' + S.category(t.categoryId).name + ' ' + methodName(t.method) + ' ' + t.date + ' ' + t.amount + ' ' + t.currency).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
      var inc = 0, exp = 0;
      list.forEach(function (t) { if (t.type === 'income') inc += S.toBase(t); else exp += S.toBase(t); });
      $('#txWrap').innerHTML =
        '<div class="summary-strip"><span>' + list.length + (list.length === 1 ? ' record' : ' records') + '</span>' +
        '<span class="pos">+' + money(inc) + '</span><span>−' + money(exp) + '</span>' +
        '<span>Net ' + money(inc - exp, BASE, { signed: true }) + '</span></div>' +
        (list.length ? txList(list, true) : empty(filtersActive(f) ? 'No records match these filters.' : 'No records this month yet. Tap ＋ to add one.'));
      $('#clearFilters').hidden = !filtersActive(f);
    }
    renderList();

    $('#fq').addEventListener('input', function (e) { f.q = e.target.value; renderList(); });
    $('#ftype').addEventListener('change', function (e) {
      f.type = e.target.value;
      if (f.categoryId !== 'all' && f.type !== 'all' && S.category(f.categoryId).type !== f.type) f.categoryId = 'all';
      renderTransactions(root);
    });
    $('#fcat').addEventListener('change', function (e) { f.categoryId = e.target.value; renderList(); });
    $('#fmethod').addEventListener('change', function (e) { f.method = e.target.value; renderList(); });
    $('#fcur').addEventListener('change', function (e) { f.currency = e.target.value; renderList(); });
    $('#clearFilters').addEventListener('click', function () { state.filters = emptyFilters(); renderTransactions(root); });
    var cd = $('#clearDay');
    if (cd) cd.addEventListener('click', function () { f.day = ''; renderTransactions(root); });
  }

  // ======================================================================
  // Statement (bank-statement style report + Excel / CSV / PDF export)
  // ======================================================================
  function statementRange() {
    var st = state.statement;
    var m = state.month;
    var today = S.todayISO();
    switch (st.preset) {
      case 'month': return { from: m + '-01', to: m + '-' + S.daysInMonth(m), label: S.monthLabel(m) };
      case '3m': return { from: S.addMonths(m, -2) + '-01', to: m + '-' + S.daysInMonth(m), label: S.monthLabel(S.addMonths(m, -2), true) + ' – ' + S.monthLabel(m, true) };
      case 'year': return { from: m.slice(0, 4) + '-01-01', to: m.slice(0, 4) + '-12-31', label: 'Year ' + m.slice(0, 4) };
      case 'all': return { from: S.firstRecordDate() || today, to: today > (lastRecordDate() || '') ? today : lastRecordDate(), label: 'All records' };
      default:
        var from = st.from || m + '-01', to = st.to || today;
        if (from > to) { var x = from; from = to; to = x; }
        return { from: from, to: to, label: longDate(from) + ' – ' + longDate(to) };
    }
  }
  function lastRecordDate() {
    return S.data.transactions.reduce(function (max, t) { return !max || t.date > max ? t.date : max; }, null);
  }

  function renderStatement(root) {
    var st = state.statement;
    var range = statementRange();
    var data = S.statement(range.from, range.to);
    var settings = S.data.settings;

    var presets = [['month', 'Selected month'], ['3m', 'Last 3 months'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom range']];
    root.innerHTML =
      '<section class="card no-print"><div class="filters">' +
      '<select id="stPreset" aria-label="Period">' + presets.map(function (p) {
        return '<option value="' + p[0] + '"' + (st.preset === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
      }).join('') + '</select>' +
      (st.preset === 'custom' ? '<input type="date" id="stFrom" value="' + esc(range.from) + '" aria-label="From"><input type="date" id="stTo" value="' + esc(range.to) + '" aria-label="To">' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn primary" id="stXlsx">⬇ Excel (.xlsx)</button>' +
      '<button class="btn ghost" id="stCsv">⬇ CSV</button>' +
      '<button class="btn ghost" id="stPrint">🖨 Print / PDF</button>' +
      '</div></section>' +

      '<article class="card statement">' +
      '<header class="st-head"><div><div class="st-brand"><img src="icon.svg" alt="" width="28" height="28"> ' + esc(settings.appName) + '</div>' +
      '<h1>' + esc(L('statementTitle')) + '</h1>' +
      (settings.ownerName ? '<div class="st-owner">' + esc(settings.ownerName) + '</div>' : '') + '</div>' +
      '<dl class="st-meta"><div><dt>Period</dt><dd>' + esc(longDate(range.from)) + ' – ' + esc(longDate(range.to)) + '</dd></div>' +
      '<div><dt>Currency</dt><dd>' + BASE + ' (base)</dd></div>' +
      '<div><dt>Generated</dt><dd>' + esc(longDate(S.todayISO())) + '</dd></div></dl></header>' +

      '<section class="st-summary">' +
      stBox('Opening balance', money(data.opening)) +
      stBox('Money in', '+' + money(data.moneyIn), 'pos') +
      stBox('Money out', '−' + money(data.moneyOut)) +
      stBox('Closing balance', money(data.closing), 'strong') +
      '</section>' +

      (data.rows.length ? '<div class="table-wrap"><table class="data-table st-table"><thead><tr>' +
        '<th>Date</th><th>Description</th><th>Category</th><th>' + esc(L('method')) + '</th><th class="r">Original</th><th class="r">Money out</th><th class="r">Money in</th><th class="r">Balance</th>' +
        '</tr></thead><tbody>' +
        '<tr class="st-open"><td>' + esc(range.from) + '</td><td colspan="6">Opening balance</td><td class="r">' + money(data.opening) + '</td></tr>' +
        data.rows.map(function (r) {
          var t = r.tx, c = S.category(t.categoryId);
          return '<tr><td>' + esc(t.date) + '</td><td>' + esc(t.note || c.name) + '</td><td>' + esc(c.icon + ' ' + c.name) + '</td><td>' + esc(methodName(t.method)) + '</td>' +
            '<td class="r muted">' + (t.currency !== BASE ? esc(money(t.amount, t.currency)) + '<small>' + esc(rateText(t.rate, t.currency)) + '</small>' : '') + '</td>' +
            '<td class="r">' + (t.type === 'expense' ? money(r.base) : '') + '</td>' +
            '<td class="r pos">' + (t.type === 'income' ? money(r.base) : '') + '</td>' +
            '<td class="r">' + money(r.balance) + '</td></tr>';
        }).join('') +
        '</tbody><tfoot><tr><td colspan="5">Totals · ' + data.rows.length + ' records</td><td class="r">' + money(data.moneyOut) + '</td><td class="r pos">' + money(data.moneyIn) + '</td><td class="r">' + money(data.closing) + '</td></tr></tfoot></table></div>'
        : empty('No records in this period.')) +
      '<p class="st-foot muted small">Balances are in ' + BASE + '. Records in other currencies are converted with the exchange rate saved on each record. Opening balance includes your starting balance and all earlier records.</p>' +
      '</article>';

    $('#stPreset').addEventListener('change', function (e) {
      st.preset = e.target.value;
      if (st.preset === 'custom') { st.from = range.from; st.to = range.to; }
      render();
    });
    var f = $('#stFrom'), t = $('#stTo');
    if (f) f.addEventListener('change', function () { st.from = f.value; render(); });
    if (t) t.addEventListener('change', function () { st.to = t.value; render(); });
    var fileBase = slugName(settings.appName) + '-statement-' + range.from + '_to_' + range.to;
    $('#stXlsx').addEventListener('click', function () { download(fileBase + '.xlsx', statementXlsx(range, data)); toast('Excel statement downloaded'); });
    $('#stCsv').addEventListener('click', function () { download(fileBase + '.csv', '﻿' + statementCsv(range, data), 'text/csv;charset=utf-8'); toast('CSV statement downloaded'); });
    $('#stPrint').addEventListener('click', function () { window.print(); });
  }

  function slugName(s) { return String(s || 'budget').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'budget'; }

  function stBox(label, value, cls) {
    return '<div class="st-box ' + (cls || '') + '"><div class="tile-label">' + esc(label) + '</div><div class="st-val">' + esc(value) + '</div></div>';
  }

  function statementXlsx(range, data) {
    var s = S.data.settings;
    var head = ['Date', 'Description', 'Category', 'Type', L('method'), 'Original amount', 'Currency', 'Rate (per 1 ' + BASE + ')', 'Money out (' + BASE + ')', 'Money in (' + BASE + ')', 'Balance (' + BASE + ')'];
    var rows = [];
    rows.push([{ v: s.appName + ' — ' + L('statementTitle'), s: 'title' }]);
    rows.push([{ v: s.ownerName ? 'Account holder: ' + s.ownerName : 'Personal account', s: 'subtitle' }]);
    rows.push([{ v: 'Period: ' + longDate(range.from) + ' – ' + longDate(range.to), s: 'subtitle' }]);
    rows.push([{ v: 'Generated: ' + longDate(S.todayISO()) + ' · Base currency: ' + BASE, s: 'subtitle' }]);
    rows.push(null);
    rows.push([{ v: 'Opening balance', s: 'label' }, { v: '', s: 'label' }, { v: data.opening, s: 'moneyBold' }]);
    rows.push([{ v: 'Total money in', s: 'label' }, { v: '', s: 'label' }, { v: data.moneyIn, s: 'moneyBold' }]);
    rows.push([{ v: 'Total money out', s: 'label' }, { v: '', s: 'label' }, { v: data.moneyOut, s: 'moneyBold' }]);
    rows.push([{ v: 'Closing balance', s: 'label' }, { v: '', s: 'label' }, { v: data.closing, s: 'moneyBold' }]);
    rows.push(null);
    var headerRow = rows.length;
    rows.push(head.map(function (h, i) { return { v: h, s: i >= 5 && i !== 6 ? 'headerRight' : 'header' }; }));
    rows.push([{ v: range.from, s: 'date' }, { v: 'Opening balance', s: 'bold' }, '', '', '', '', '', '', '', '', { v: data.opening, s: 'money' }]);
    data.rows.forEach(function (r) {
      var t = r.tx, c = S.category(t.categoryId);
      rows.push([
        { v: t.date, s: 'date' },
        { v: t.note || c.name },
        { v: c.name },
        { v: typeLabel(t.type), s: 'muted' },
        { v: methodName(t.method) || '' , s: 'muted' },
        { v: t.amount, s: 'money' },
        { v: t.currency, s: 'muted' },
        { v: t.rate, s: 'number' },
        t.type === 'expense' ? { v: r.base, s: 'moneyOut' } : { v: '', s: 'text' },
        t.type === 'income' ? { v: r.base, s: 'moneyIn' } : { v: '', s: 'text' },
        { v: r.balance, s: 'money' }
      ]);
    });
    rows.push([{ v: 'Totals', s: 'totalLabel' }, { v: data.rows.length + ' records', s: 'totalLabel' }, { v: '', s: 'totalLabel' }, { v: '', s: 'totalLabel' }, { v: '', s: 'totalLabel' },
      { v: '', s: 'totalLabel' }, { v: '', s: 'totalLabel' }, { v: '', s: 'totalLabel' },
      { v: data.moneyOut, s: 'totalMoney' }, { v: data.moneyIn, s: 'totalMoney' }, { v: data.closing, s: 'totalMoney' }]);

    // Sheet 2: totals per category.
    var cats = {};
    data.rows.forEach(function (r) {
      var k = r.tx.categoryId;
      cats[k] = cats[k] || { count: 0, total: 0, type: r.tx.type };
      cats[k].count++; cats[k].total += r.base;
    });
    var catRows = [[{ v: 'Summary by category', s: 'title' }], [{ v: 'Period: ' + longDate(range.from) + ' – ' + longDate(range.to) + ' · ' + BASE, s: 'subtitle' }], null,
      ['Category', 'Type', 'Records', 'Total (' + BASE + ')', 'Share of type'].map(function (h, i) { return { v: h, s: i >= 2 ? 'headerRight' : 'header' }; })];
    ['income', 'expense'].forEach(function (type) {
      var totalType = type === 'income' ? data.moneyIn : data.moneyOut;
      Object.keys(cats).filter(function (k) { return cats[k].type === type; })
        .sort(function (a, b) { return cats[b].total - cats[a].total; })
        .forEach(function (k) {
          var c = cats[k];
          catRows.push([S.category(k).name, { v: typeLabel(type), s: 'muted' }, { v: c.count, s: 'number' }, { v: c.total, s: 'money' },
            { v: totalType ? Math.round(c.total / totalType * 1000) / 10 + '%' : '', s: 'muted' }]);
        });
    });

    // Sheet 3: totals per original currency.
    var curs = {};
    data.rows.forEach(function (r) {
      var t = r.tx;
      curs[t.currency] = curs[t.currency] || { in: 0, out: 0, base: 0 };
      if (t.type === 'income') curs[t.currency].in += t.amount; else curs[t.currency].out += t.amount;
      curs[t.currency].base += t.type === 'income' ? r.base : -r.base;
    });
    var curRows = [[{ v: 'Summary by currency', s: 'title' }], null,
      ['Currency', 'Money in', 'Money out', 'Net', 'Net (' + BASE + ')'].map(function (h, i) { return { v: h, s: i ? 'headerRight' : 'header' }; })];
    Object.keys(curs).sort().forEach(function (code) {
      var c = curs[code];
      curRows.push([code, c.in, c.out, c.in - c.out, c.base]);
    });

    return XLSX.build([
      { name: 'Statement', cols: [12, 32, 20, 10, 15, 15, 10, 16, 16, 16, 16], rows: rows, freezeRow: headerRow + 1,
        heights: { 0: 28 }, merges: ['A1:K1', 'A2:K2', 'A3:K3', 'A4:K4', 'A6:B6', 'A7:B7', 'A8:B8', 'A9:B9'] },
      { name: 'By category', cols: [26, 12, 10, 16, 14], rows: catRows, freezeRow: 4, merges: ['A1:E1', 'A2:E2'] },
      { name: 'By currency', cols: [12, 16, 16, 16, 16], rows: curRows, freezeRow: 3, merges: ['A1:E1'] }
    ]);
  }

  function csvLine(cells) {
    return cells.map(function (v) {
      v = v == null ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',');
  }
  function num(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  function statementCsv(range, data) {
    var s = S.data.settings;
    var lines = [
      csvLine([s.appName + ' - ' + L('statementTitle')]),
      csvLine(['Account holder', s.ownerName || '']),
      csvLine(['Period', range.from + ' to ' + range.to]),
      csvLine(['Base currency', BASE]),
      csvLine(['Generated', S.todayISO()]),
      '',
      csvLine(['Opening balance', num(data.opening)]),
      csvLine(['Total money in', num(data.moneyIn)]),
      csvLine(['Total money out', num(data.moneyOut)]),
      csvLine(['Closing balance', num(data.closing)]),
      '',
      csvLine(['Date', 'Description', 'Category', 'Type', L('method'), 'Original amount', 'Currency', 'Rate (per 1 ' + BASE + ')', 'Money out (' + BASE + ')', 'Money in (' + BASE + ')', 'Balance (' + BASE + ')']),
      csvLine([range.from, 'Opening balance', '', '', '', '', '', '', '', '', num(data.opening)])
    ];
    data.rows.forEach(function (r) {
      var t = r.tx, c = S.category(t.categoryId);
      lines.push(csvLine([t.date, t.note || c.name, c.name, typeLabel(t.type), methodName(t.method), num(t.amount), t.currency, t.rate,
        t.type === 'expense' ? num(r.base) : '', t.type === 'income' ? num(r.base) : '', num(r.balance)]));
    });
    lines.push(csvLine(['', 'Totals (' + data.rows.length + ' records)', '', '', '', '', '', '', num(data.moneyOut), num(data.moneyIn), num(data.closing)]));
    return lines.join('\r\n');
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
      '<section class="card"><div class="card-head"><h2>Budget for ' + esc(S.monthLabel(state.month)) + '</h2><span class="muted">' + BASE + '</span></div>' +
      '<p class="hint">Set an overall spending limit and, optionally, limits per category (in ' + BASE + '). Leave a field empty for no limit.</p>' +
      '<form id="budgetForm">' +
      '<label class="field big">Total monthly budget (' + BASE + ')' +
      '<input type="number" name="total" min="0" step="0.01" inputmode="decimal" value="' + (b.total != null ? round2(b.total) : '') + '" placeholder="' + (catTotal ? 'Sum of categories: ' + round2(catTotal) : 'e.g. 1200') + '"></label>' +
      '<div class="budget-plan" id="plan"></div>' +
      '<h3>Per-category limits</h3>' +
      '<ul class="budget-cats">' + cats.map(function (c) {
        var spent = sum.byCategory[c.id] || 0;
        var v = b.categories && b.categories[c.id];
        return '<li><label><span>' + esc(c.icon + ' ' + c.name) + '<small class="muted">Spent ' + money(spent) + '</small></span>' +
          '<input type="number" min="0" step="0.01" inputmode="decimal" name="cat-' + esc(c.id) + '" value="' + (v != null && v !== '' ? round2(v) : '') + '" placeholder="No limit"></label>' +
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
      var parts = ['Category limits add up to <strong>' + money(cs) + '</strong>'];
      if (!isNaN(total) && cs > total) parts.push('<span class="status warning">⚠️ more than the total budget</span>');
      if (sum.income) {
        var save = sum.income - effective;
        parts.push(esc(L('income')) + ' this month <strong>' + money(sum.income) + '</strong> → planned savings <strong class="' + (save < 0 ? 'neg' : 'pos') + '">' + money(save, BASE, { signed: true }) + '</strong>');
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
      if (confirm('Clear the budget for ' + S.monthLabel(state.month) + '?')) S.setBudget(state.month, null);
    });
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  // ======================================================================
  // Recurring
  // ======================================================================
  function renderRecurring(root) {
    var rules = S.data.recurring;
    var st = S.data.settings;
    root.innerHTML =
      '<section class="card"><div class="card-head"><h2>Recurring records</h2></div>' +
      '<p class="hint">Fixed monthly items like rent, phone bills, subscriptions or salary. They are added automatically on their day each month.</p>' +
      (rules.length ? '<ul class="tx-list">' + rules.map(function (r) {
        var c = S.category(r.categoryId);
        var cur = r.currency || BASE;
        return '<li class="rule' + (r.active ? '' : ' inactive') + '"><span class="tx-icon">' + esc(c.icon) + '</span>' +
          '<span class="tx-main"><span class="tx-cat">' + esc(r.note || c.name) + '</span><span class="tx-note">' + esc(c.name) + ' · day ' + r.day + ' · from ' + esc(S.monthLabel(r.startMonth, true)) +
          (methodName(r.method) ? ' · ' + esc(methodName(r.method)) : '') + (r.active ? '' : ' · paused') + '</span></span>' +
          '<span class="tx-amt ' + (r.type === 'income' ? 'pos' : '') + '">' + (r.type === 'income' ? '+' : '−') + money(r.amount, cur) + '</span>' +
          '<span class="rule-actions"><button class="btn ghost sm" data-toggle="' + esc(r.id) + '">' + (r.active ? 'Pause' : 'Resume') + '</button>' +
          '<button class="btn ghost sm danger" data-del="' + esc(r.id) + '">Delete</button></span></li>';
      }).join('') + '</ul>' : empty('No recurring records yet.')) +
      '</section>' +
      '<section class="card"><div class="card-head"><h2>Add recurring</h2></div>' +
      '<form id="ruleForm" class="dialog-form flush">' +
      typeSeg(st.defaultType) +
      '<div class="row"><label class="field">Amount<input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required></label>' +
      '<label class="field narrow">Currency<select name="currency">' + options(S.data.currencies, st.defaultCurrency) + '</select></label></div>' +
      '<div class="row"><label class="field">Category<select name="categoryId" required></select></label>' +
      '<label class="field">' + esc(L('method')) + '<select name="method">' + options(S.data.paymentMethods, st.defaultMethod, { none: '—' }) + '</select></label></div>' +
      '<div class="row"><label class="field">Day of month<input name="day" type="number" min="1" max="31" value="1" required></label>' +
      '<label class="field">Starting<input name="startMonth" type="month" value="' + S.currentMonth() + '" required></label></div>' +
      '<label class="field">Name / note<input name="note" type="text" maxlength="80" placeholder="e.g. Rent"></label>' +
      '<div class="actions"><span class="spacer"></span><button class="btn primary" type="submit">Add recurring</button></div>' +
      '</form></section>';

    var form = $('#ruleForm');
    var fillCats = function () { form.categoryId.innerHTML = options(S.categoriesOfType(form.type.value)); };
    $$('input[name=type]', form).forEach(function (r) { r.addEventListener('change', fillCats); });
    fillCats();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      S.upsertRecurring({
        type: form.type.value,
        amount: round2(parseFloat(form.amount.value)),
        currency: form.currency.value,
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

  function typeSeg(selected) {
    return '<div class="seg" role="radiogroup" aria-label="Type">' + ['expense', 'income'].map(function (t) {
      return '<label><input type="radio" name="type" value="' + t + '"' + (t === (selected || 'expense') ? ' checked' : '') + '><span>' + esc(typeLabel(t)) + '</span></label>';
    }).join('') + '</div>';
  }

  // ======================================================================
  // Settings — everything customizable
  // ======================================================================
  var LABEL_FIELDS = [
    ['income', 'Money coming in'],
    ['expense', 'Money going out'],
    ['available', 'This month\'s income − spending (money you can still spend this month)'],
    ['netWorth', 'Everything you own so far (starting balance + all income − all spending)'],
    ['budgetLeft', 'Budget remaining this month'],
    ['method', 'How a record was paid / received'],
    ['statementTitle', 'Title on statements and exports']
  ];
  var DASH_FIELDS = [
    ['budget', 'Monthly budget'], ['daily', 'Daily spending chart'], ['categories', 'Spending by category'],
    ['trend', 'Last 6 months'], ['currencies', 'By currency'], ['recent', 'Recent records'], ['biggest', 'Biggest expenses']
  ];

  function renderSettings(root) {
    var st = S.data.settings;

    function listEditor(listName, items, field, kind) {
      return '<ul class="cat-edit">' + items.map(function (c, i) {
        var n = S.usageCount(field, c.id);
        return '<li><input class="icon-input" data-list="' + listName + '" data-field="icon" data-id="' + esc(c.id) + '" value="' + esc(c.icon || '') + '" aria-label="Icon" maxlength="4">' +
          '<input data-list="' + listName + '" data-field="name" data-id="' + esc(c.id) + '" value="' + esc(c.name) + '" aria-label="Name" maxlength="40">' +
          '<span class="use-count muted" title="Records using it">' + n + '</span>' +
          '<button type="button" class="btn ghost sm icon" data-move="' + listName + '" data-id="' + esc(c.id) + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="btn ghost sm icon" data-move="' + listName + '" data-id="' + esc(c.id) + '" data-dir="1" aria-label="Move down"' + (i === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="btn ghost sm icon danger" data-remove="' + listName + '" data-field="' + field + '" data-id="' + esc(c.id) + '" aria-label="Delete ' + esc(c.name) + '">✕</button></li>';
      }).join('') + '</ul>' +
        '<form class="add-item" data-list="' + listName + '" data-kind="' + (kind || '') + '"><input name="icon" class="icon-input" placeholder="🙂" maxlength="4" aria-label="Icon">' +
        '<input name="name" placeholder="Add new…" required maxlength="40" aria-label="New name"><button class="btn ghost sm">Add</button></form>';
    }

    var allCodes = [];
    try { allCodes = Intl.supportedValuesOf('currency'); } catch (e) { allCodes = []; }

    root.innerHTML =
      '<nav class="settings-nav">' + [['s-general', 'General'], ['s-money', 'Money & currencies'], ['s-cats', 'Categories'], ['s-methods', L('method')],
        ['s-labels', 'Labels'], ['s-dash', 'Dashboard'], ['s-data', 'Backup']].map(function (x) {
        return '<a href="#settings" data-jump="' + x[0] + '">' + esc(x[1]) + '</a>';
      }).join('') + '</nav>' +

      '<section class="card" id="s-general"><div class="card-head"><h2>General</h2></div>' +
      '<div class="row"><label class="field">App name<input data-setting="appName" value="' + esc(st.appName) + '" maxlength="40"></label>' +
      '<label class="field">Your name (shown on statements)<input data-setting="ownerName" value="' + esc(st.ownerName) + '" maxlength="60" placeholder="Optional"></label></div>' +
      '<div class="row"><label class="field">Theme<select data-setting="theme"><option value="auto">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>' +
      '<label class="field">Budget warning at (% used)<input type="number" min="1" max="100" data-setting="warnAt" data-num="1" value="' + esc(st.warnAt) + '"></label></div>' +
      '<h3>Defaults for new records</h3>' +
      '<div class="row"><label class="field">Type<select data-setting="defaultType"><option value="expense">' + esc(L('expense')) + '</option><option value="income">' + esc(L('income')) + '</option></select></label>' +
      '<label class="field">Currency<select data-setting="defaultCurrency">' + options(S.data.currencies, st.defaultCurrency) + '</select></label>' +
      '<label class="field">' + esc(L('method')) + '<select data-setting="defaultMethod">' + options(S.data.paymentMethods, st.defaultMethod, { none: 'Last used' }) + '</select></label></div>' +
      '</section>' +

      '<section class="card" id="s-money"><div class="card-head"><h2>Money & currencies</h2><span class="muted">Base: ' + BASE + '</span></div>' +
      '<label class="field">Starting balance in ' + BASE + ' — what you owned before your first record (counts toward ' + esc(L('netWorth')) + ')' +
      '<input type="number" step="0.01" inputmode="decimal" data-setting="startingBalance" data-num="1" value="' + round2(Number(st.startingBalance) || 0) + '"></label>' +
      '<h3>Currencies & exchange rates</h3>' +
      '<p class="hint">Each record keeps the rate it was saved with. Changing a rate here only affects new records. ' +
      (st.ratesUpdatedAt ? 'Rates last updated ' + esc(longDate(st.ratesUpdatedAt)) + '.' : 'Default rates are approximate.') + '</p>' +
      '<ul class="cur-edit">' + S.data.currencies.map(function (c) {
        return '<li><strong>' + esc(c.code) + '</strong>' + (c.code === BASE ? '<span class="muted">Base currency</span>' :
          '<label class="rate-in">1 ' + BASE + ' =<input type="number" step="any" min="0" data-rate="' + esc(c.code) + '" value="' + c.rate + '" aria-label="Rate for ' + esc(c.code) + '">' + esc(c.code) + '</label>' +
          '<button type="button" class="btn ghost sm icon danger" data-delcur="' + esc(c.code) + '" aria-label="Remove ' + esc(c.code) + '">✕</button>') + '</li>';
      }).join('') + '</ul>' +
      '<form class="add-item" id="addCur"><input name="code" placeholder="Code, e.g. JPY" maxlength="3" list="isoCodes" required aria-label="Currency code" style="text-transform:uppercase">' +
      '<input name="rate" type="number" step="any" min="0" placeholder="Units per 1 ' + BASE + '" aria-label="Rate"><button class="btn ghost sm">Add</button></form>' +
      '<datalist id="isoCodes">' + allCodes.map(function (c) { return '<option value="' + c + '">'; }).join('') + '</datalist>' +
      '<div class="actions"><button type="button" class="btn ghost" id="fetchRates">🌐 Update rates online</button></div>' +
      '</section>' +

      '<section class="card" id="s-cats"><div class="card-head"><h2>Categories</h2></div>' +
      '<h3>' + esc(L('expense')) + ' categories</h3>' + listEditor('categories', S.categoriesOfType('expense'), 'categoryId', 'expense') +
      '<h3>' + esc(L('income')) + ' categories</h3>' + listEditor('categories', S.categoriesOfType('income'), 'categoryId', 'income') +
      '</section>' +

      '<section class="card" id="s-methods"><div class="card-head"><h2>' + esc(L('method')) + ' options</h2></div>' +
      '<p class="hint">Accounts, cards, wallets or any way money moves.</p>' +
      listEditor('paymentMethods', S.data.paymentMethods, 'method') + '</section>' +

      '<section class="card" id="s-labels"><div class="card-head"><h2>Labels</h2><button type="button" class="btn ghost sm" id="resetLabels">Reset to defaults</button></div>' +
      '<p class="hint">Rename the words used across the app.</p>' +
      LABEL_FIELDS.map(function (f) {
        return '<label class="field">' + esc(f[1]) + '<input data-label="' + f[0] + '" value="' + esc(L(f[0])) + '" placeholder="' + esc(S.DEFAULT_LABELS[f[0]]) + '" maxlength="40"></label>';
      }).join('') + '</section>' +

      '<section class="card" id="s-dash"><div class="card-head"><h2>Dashboard sections</h2></div>' +
      '<div class="check-grid">' + DASH_FIELDS.map(function (f) {
        return '<label class="check"><input type="checkbox" data-dash="' + f[0] + '"' + (st.dashboard[f[0]] ? ' checked' : '') + '> ' + esc(f[1]) + '</label>';
      }).join('') + '</div></section>' +

      '<section class="card" id="s-data"><div class="card-head"><h2>Backup & data</h2></div>' +
      '<p class="hint">Your records are saved only in this browser on this device. Download a backup regularly, and use it to move your data to another device.</p>' +
      '<div class="actions wrap">' +
      '<button class="btn primary" id="backup">Download backup (.json)</button>' +
      '<label class="btn ghost file-btn">Restore backup<input type="file" accept=".json,application/json" id="restore" hidden></label>' +
      '<a class="btn ghost" href="#statement">Statement & Excel export</a>' +
      '<button class="btn ghost danger" id="reset">Delete all data</button>' +
      '</div>' +
      '<p class="muted small">' + S.data.transactions.length + ' records stored.</p></section>';

    $$('select[data-setting]', root).forEach(function (s) { s.value = st[s.dataset.setting] == null ? '' : st[s.dataset.setting]; });

    $$('[data-jump]', root).forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); document.getElementById(a.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    });

    $$('[data-setting]', root).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var key = inp.dataset.setting;
        var v = inp.value;
        if (inp.dataset.num) v = parseFloat(v) || 0;
        if (key === 'appName' && !String(v).trim()) v = 'Pocket Budget';
        st[key] = v;
        if (key === 'theme') applyTheme();
        S.save();
        toast('Saved');
      });
    });
    $$('[data-label]', root).forEach(function (inp) {
      inp.addEventListener('change', function () {
        st.labels[inp.dataset.label] = inp.value.trim() || S.DEFAULT_LABELS[inp.dataset.label];
        S.save();
        toast('Label updated');
      });
    });
    $('#resetLabels').addEventListener('click', function () {
      st.labels = Object.assign({}, S.DEFAULT_LABELS);
      S.save();
      toast('Labels reset');
    });
    $$('[data-dash]', root).forEach(function (inp) {
      inp.addEventListener('change', function () { st.dashboard[inp.dataset.dash] = inp.checked; S.save(); });
    });

    // Lists: categories & payment methods.
    $$('input[data-list]', root).forEach(function (inp) {
      inp.addEventListener('change', function () {
        if (!inp.value.trim()) return;
        var patch = {}; patch[inp.dataset.field] = inp.value.trim();
        S.updateItem(inp.dataset.list, inp.dataset.id, patch);
      });
    });
    $$('[data-move]', root).forEach(function (b) {
      b.addEventListener('click', function () { S.moveItem(b.dataset.move, b.dataset.id, +b.dataset.dir); });
    });
    $$('[data-remove]', root).forEach(function (b) {
      b.addEventListener('click', function () { removeListItem(b.dataset.remove, b.dataset.field, b.dataset.id); });
    });
    $$('form.add-item[data-list]', root).forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var item = { name: f.name.value.trim(), icon: f.icon.value.trim() || (f.dataset.kind === 'income' ? '💰' : f.dataset.kind ? '📦' : '💠') };
        if (f.dataset.kind) item.type = f.dataset.kind;
        S.addItem(f.dataset.list, item);
        toast('Added');
      });
    });

    // Currencies.
    $$('[data-rate]', root).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        if (!(v > 0)) { toast('Rate must be greater than 0'); return; }
        S.data.currencies.forEach(function (c) { if (c.code === inp.dataset.rate) c.rate = v; });
        S.save();
        toast('Rate updated');
      });
    });
    $$('[data-delcur]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.dataset.delcur;
        var used = S.data.transactions.some(function (t) { return t.currency === code; });
        if (used && !confirm(code + ' is used by existing records. They keep their own rate. Remove it from the list anyway?')) return;
        S.setCurrencies(S.data.currencies.filter(function (c) { return c.code !== code; }));
        if (st.defaultCurrency === code) { st.defaultCurrency = BASE; S.save(); }
      });
    });
    $('#addCur').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = this.code.value.trim().toUpperCase();
      var rate = parseFloat(this.rate.value);
      if (!/^[A-Z]{3}$/.test(code)) { toast('Use a 3-letter currency code'); return; }
      if (S.data.currencies.some(function (c) { return c.code === code; })) { toast(code + ' is already in the list'); return; }
      S.setCurrencies(S.data.currencies.concat([{ code: code, rate: rate > 0 ? rate : 1 }]));
      toast(code + ' added' + (rate > 0 ? '' : ' — set its rate'));
    });
    $('#fetchRates').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true; btn.textContent = 'Updating…';
      fetch('https://open.er-api.com/v6/latest/USD').then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.rates) throw new Error('No rates');
        var n = 0;
        S.data.currencies.forEach(function (c) { if (c.code !== BASE && j.rates[c.code]) { c.rate = j.rates[c.code]; n++; } });
        st.ratesUpdatedAt = S.todayISO();
        S.save();
        toast(n + ' rates updated');
      }).catch(function () {
        btn.disabled = false; btn.textContent = '🌐 Update rates online';
        toast('Could not fetch rates — check your connection');
      });
    });

    // Data.
    $('#backup').addEventListener('click', function () {
      download(slugName(st.appName) + '-backup-' + S.todayISO() + '.json', S.exportJSON(), 'application/json');
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

  // Deleting a category / payment method that records use asks where to move them.
  function removeListItem(listName, field, id) {
    var list = S.data[listName];
    var item = list.find(function (x) { return x.id === id; });
    var n = S.usageCount(field, id);
    if (!n) {
      if (confirm('Delete "' + item.name + '"?')) S.removeItem(listName, field, id, '');
      return;
    }
    var others = list.filter(function (x) { return x.id !== id && (!item.type || x.type === item.type); });
    if (listName === 'categories' && !others.length) { toast('Add another ' + typeLabel(item.type).toLowerCase() + ' category first'); return; }
    chooseDialog('Delete "' + item.name + '"',
      n + (n === 1 ? ' record uses' : ' records use') + ' it. Move ' + (n === 1 ? 'it' : 'them') + ' to:',
      options(others, others[0] && others[0].id, listName === 'paymentMethods' ? { none: '— None —' } : null)
    ).then(function (replacement) {
      if (replacement === null) return;
      S.removeItem(listName, field, id, replacement);
      toast('Deleted and moved ' + n + (n === 1 ? ' record' : ' records'));
    });
  }

  function chooseDialog(title, message, optionsHtml) {
    var dlg = $('#chooseDialog');
    $('#chooseTitle').textContent = title;
    $('#chooseMsg').textContent = message;
    $('#chooseSelect').innerHTML = optionsHtml;
    dlg.showModal();
    return new Promise(function (resolve) {
      dlg.onclose = function () { resolve(dlg.returnValue === 'ok' ? $('#chooseSelect').value : null); dlg.returnValue = ''; };
    });
  }

  // ======================================================================
  // Add / edit dialog
  // ======================================================================
  var dialog = $('#txDialog');
  var txForm = $('#txForm');

  function lastUsed(field) {
    var t = S.data.transactions.reduce(function (best, x) { return !best || (x.createdAt || 0) > (best.createdAt || 0) ? x : best; }, null);
    return t ? t[field] || '' : '';
  }

  function updateRateRow() {
    var cur = txForm.currency.value;
    var row = $('#rateRow');
    row.hidden = cur === BASE;
    $('#rateCur').textContent = cur;
    var amount = parseFloat(txForm.amount.value);
    var rate = parseFloat(txForm.rate.value);
    $('#ratePreview').textContent = amount > 0 && rate > 0 ? '≈ ' + money(amount / rate) : '';
  }

  function openTx(tx) {
    var st = S.data.settings;
    var editing = !!(tx && tx.id);
    tx = tx || {};
    var type = tx.type || st.defaultType || 'expense';
    txForm.dataset.id = editing ? tx.id : '';
    $('#txTitle').textContent = editing ? 'Edit record' : 'Add record';
    $('#txDelete').hidden = !editing;
    $('#txTypeSeg').innerHTML = typeSeg(type);
    $$('input[name=type]', txForm).forEach(function (r) {
      r.addEventListener('change', function () { txForm.categoryId.innerHTML = options(S.categoriesOfType(txForm.type.value)); });
    });
    txForm.categoryId.innerHTML = options(S.categoriesOfType(type), tx.categoryId);
    $('#methodLabel').textContent = L('method');
    var defMethod = editing ? tx.method : (st.defaultMethod || lastUsed('method'));
    txForm.method.innerHTML = options(S.data.paymentMethods, defMethod, { none: '—' });
    var cur = tx.currency || st.defaultCurrency || BASE;
    var curList = S.data.currencies.slice();
    if (!curList.some(function (c) { return c.code === cur; })) curList.push({ code: cur, rate: tx.rate || 1 });
    txForm.currency.innerHTML = options(curList, cur);
    txForm.rate.value = editing && tx.rate ? tx.rate : S.rateOf(cur);
    txForm.amount.value = tx.amount != null ? tx.amount : '';
    // Default date: today if viewing the current month, else the 1st of the viewed month.
    txForm.date.value = tx.date || (state.month === S.currentMonth() ? S.todayISO() : state.month + '-01');
    txForm.note.value = tx.note || '';
    var notes = {};
    S.data.transactions.slice(-200).forEach(function (t) { if (t.note) notes[t.note] = 1; });
    $('#noteSuggestions').innerHTML = Object.keys(notes).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    updateRateRow();
    dialog.showModal();
    setTimeout(function () { txForm.amount.focus(); }, 50);
  }

  txForm.currency.addEventListener('change', function () {
    txForm.rate.value = S.rateOf(txForm.currency.value);
    updateRateRow();
  });
  txForm.amount.addEventListener('input', updateRateRow);
  txForm.rate.addEventListener('input', updateRateRow);

  txForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var amount = round2(parseFloat(txForm.amount.value));
    if (!(amount > 0)) { txForm.amount.focus(); return; }
    var cur = txForm.currency.value;
    var rate = cur === BASE ? 1 : parseFloat(txForm.rate.value);
    if (!(rate > 0)) { txForm.rate.focus(); return; }
    var tx = {
      type: txForm.type.value,
      amount: amount,
      currency: cur,
      rate: rate,
      categoryId: txForm.categoryId.value,
      date: txForm.date.value,
      method: txForm.method.value,
      note: txForm.note.value.trim()
    };
    var editing = !!txForm.dataset.id;
    if (editing) tx.id = txForm.dataset.id;
    S.upsertTransaction(tx);
    dialog.close();
    toast(editing ? 'Record updated' : 'Record added');
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
  [dialog, $('#chooseDialog')].forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
  });

  // ======================================================================
  // Shell: routing, month nav, theme
  // ======================================================================
  var VIEWS = {
    dashboard: renderDashboard,
    transactions: renderTransactions,
    budget: renderBudget,
    statement: renderStatement,
    recurring: renderRecurring,
    settings: renderSettings
  };

  function render() {
    C.hideTip();
    var appName = S.data.settings.appName || 'Pocket Budget';
    $('#brandName').textContent = appName;
    document.title = appName;
    $('#monthLabel').textContent = S.monthLabel(state.month);
    $('#monthLabel').classList.toggle('not-current', state.month !== S.currentMonth());
    $$('.tabs a').forEach(function (a) {
      var on = a.dataset.view === state.view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var y = window.scrollY;
    VIEWS[state.view]($('#view'));
    window.scrollTo(0, y);
  }

  function setMonth(m) {
    state.month = m;
    if (state.filters.day && S.monthOf(state.filters.day) !== m) state.filters.day = '';
    render();
  }

  function route() {
    var v = (location.hash || '#dashboard').slice(1);
    var next = VIEWS[v] ? v : 'dashboard';
    var changed = next !== state.view;
    state.view = next;
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
    if (b) {
      var tx = S.data.transactions.find(function (t) { return t.id === b.dataset.id; });
      if (tx) openTx(tx);
      return;
    }
    var c = e.target.closest('.cat-link[data-cat]');
    if (c) {
      state.filters = emptyFilters();
      state.filters.type = 'expense';
      state.filters.categoryId = c.dataset.cat;
      location.hash = '#transactions';
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !dialog.open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openTx(); }
  });

  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (state.view === 'dashboard') render(); }, 150);
  });
  window.addEventListener('hashchange', route);

  S.load();
  applyTheme();
  S.onChange(function () { fmtCache = {}; render(); });
  route();

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
