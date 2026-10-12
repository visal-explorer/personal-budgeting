/* Small dependency-free SVG charts with hover tooltips. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var tip;

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(evt, html) {
    var t = tooltip();
    t.innerHTML = html;
    t.style.display = 'block';
    var x = evt.clientX, y = evt.clientY;
    var w = t.offsetWidth, h = t.offsetHeight;
    var left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
    var top = y - h - 14;
    if (top < 8) top = y + 18;
    t.style.left = left + 'px';
    t.style.top = top + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  // Rect whose top corners are rounded (4px) and bottom sits flat on the baseline.
  function barPath(x, y, w, h) {
    if (h <= 0) return '';
    var r = Math.min(4, w / 2, h);
    return 'M' + x + ',' + (y + h) +
      'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      'V' + (y + h) + 'Z';
  }

  // Round axis: a 1/2/5 step and as many ticks (3-5) as needed to cover v.
  function niceScale(v) {
    if (v <= 0) return { max: 1, ticks: 4 };
    var raw = v / 4;
    var exp = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / exp;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
    var ticks = Math.max(1, Math.ceil(v / step));
    return { max: step * ticks, ticks: ticks };
  }

  function compact(v) {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  }

  function drawAxes(svg, opts) {
    var ticks = opts.ticks;
    for (var i = 0; i <= ticks; i++) {
      var val = opts.max * i / ticks;
      var y = opts.top + opts.plotH - (val / opts.max) * opts.plotH;
      el('line', {
        x1: opts.left, x2: opts.width - opts.right, y1: y, y2: y,
        class: i === 0 ? 'axis-base' : 'grid'
      }, svg);
      var t = el('text', { x: opts.left - 6, y: y + 4, class: 'axis-label', 'text-anchor': 'end' }, svg);
      t.textContent = compact(val);
    }
  }

  /* Single-series bars: one bar per label. Optional dashed reference line (e.g. daily budget). */
  function barChart(container, cfg) {
    container.innerHTML = '';
    var width = Math.max(container.clientWidth, 280), height = cfg.height || 200;
    var m = { top: 12, right: 8, bottom: 24, left: 40 };
    var plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    var maxVal = Math.max.apply(null, cfg.values.concat([cfg.refLine || 0]));
    var scale = niceScale(maxVal), max = scale.max;

    var svg = el('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height, role: 'img', 'aria-label': cfg.ariaLabel || '' }, container);
    drawAxes(svg, { max: max, ticks: scale.ticks, top: m.top, plotH: plotH, left: m.left, right: m.right, width: width });

    var n = cfg.values.length;
    var slot = plotW / n;
    var gap = Math.max(2, slot * 0.25);
    var bw = Math.max(1, slot - gap);
    var labelEvery = Math.ceil(n / Math.floor(plotW / 28));

    cfg.values.forEach(function (v, i) {
      var x = m.left + i * slot + gap / 2;
      var h = (v / max) * plotH;
      if (v > 0) el('path', { d: barPath(x, m.top + plotH - h, bw, h), class: 'bar ' + (cfg.barClass ? cfg.barClass(v, i) : '') }, svg);
      if (i % labelEvery === 0) {
        var t = el('text', { x: x + bw / 2, y: height - 6, class: 'axis-label', 'text-anchor': 'middle' }, svg);
        t.textContent = cfg.labels[i];
      }
      // Hit target spans the whole slot, taller than the bar.
      var hit = el('rect', { x: m.left + i * slot, y: m.top, width: slot, height: plotH, class: 'hit' }, svg);
      hit.addEventListener('mousemove', function (e) { showTip(e, cfg.tooltip(i, v)); });
      hit.addEventListener('mouseleave', hideTip);
      hit.addEventListener('click', function (e) {
        if (cfg.onClick) { hideTip(); cfg.onClick(i); } else showTip(e, cfg.tooltip(i, v));
      });
    });

    if (cfg.refLine) {
      var ry = m.top + plotH - (cfg.refLine / max) * plotH;
      el('line', { x1: m.left, x2: width - m.right, y1: ry, y2: ry, class: 'ref-line' }, svg);
      var rt = el('text', { x: width - m.right, y: ry - 4, class: 'ref-label', 'text-anchor': 'end' }, svg);
      rt.textContent = cfg.refLabel || '';
    }
  }

  /* Grouped bars: two series per label (e.g. income vs expense). */
  function groupedBarChart(container, cfg) {
    container.innerHTML = '';
    var width = Math.max(container.clientWidth, 280), height = cfg.height || 220;
    var m = { top: 12, right: 8, bottom: 24, left: 40 };
    var plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    var all = [];
    cfg.series.forEach(function (s) { all = all.concat(s.values); });
    var scale = niceScale(Math.max.apply(null, all)), max = scale.max;

    var svg = el('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height, role: 'img', 'aria-label': cfg.ariaLabel || '' }, container);
    drawAxes(svg, { max: max, ticks: scale.ticks, top: m.top, plotH: plotH, left: m.left, right: m.right, width: width });

    var n = cfg.labels.length, k = cfg.series.length;
    var slot = plotW / n;
    var groupW = Math.min(slot * 0.7, 64);
    var bw = (groupW - 2 * (k - 1)) / k; // 2px gap between adjacent bars

    cfg.labels.forEach(function (label, i) {
      var gx = m.left + i * slot + (slot - groupW) / 2;
      cfg.series.forEach(function (s, j) {
        var v = s.values[i];
        var h = (v / max) * plotH;
        if (v > 0) el('path', { d: barPath(gx + j * (bw + 2), m.top + plotH - h, bw, h), class: 'bar ' + s.className }, svg);
      });
      var t = el('text', { x: m.left + i * slot + slot / 2, y: height - 6, class: 'axis-label', 'text-anchor': 'middle' }, svg);
      t.textContent = label;
      var hit = el('rect', { x: m.left + i * slot, y: m.top, width: slot, height: plotH, class: 'hit' }, svg);
      hit.addEventListener('mousemove', function (e) { showTip(e, cfg.tooltip(i)); });
      hit.addEventListener('mouseleave', hideTip);
      hit.addEventListener('click', function (e) {
        if (cfg.onClick) { hideTip(); cfg.onClick(i); } else showTip(e, cfg.tooltip(i));
      });
    });
  }

  document.addEventListener('scroll', hideTip, true);

  window.Charts = { barChart: barChart, groupedBarChart: groupedBarChart, hideTip: hideTip };
})();
