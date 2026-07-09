/**
 * ml-client.js — thin bridge from the boutique app to the Python ML server.
 *
 * DESIGN PRINCIPLE: 100% additive and DORMANT until you set `mlUrl` in
 * backend-config.js. When mlUrl is empty (default), every function below is a
 * no-op, so your existing UI and rule-based logic run exactly as before.
 * When you deploy the ML server and set mlUrl, it:
 *   1. Re-orders the "Recommended for You" cards by the ML model's score.
 *   2. Adds an "AI Sales Forecast" panel to the Analytics page.
 *   3. Adds an "AI Stock Prediction" panel to the admin dashboard.
 * All calls have short timeouts and swallow errors — if the ML server is slow
 * or down, the app silently keeps its current behaviour. Nothing ever breaks.
 */
(function () {
  var ML_URL = (typeof backendConfig !== 'undefined' && backendConfig.mlUrl)
    ? String(backendConfig.mlUrl).replace(/\/$/, '') : '';

  function ready() { return !!ML_URL; }

  // app.js declares `DB` as a top-level const, which lives in the shared
  // classic-script global scope but is NOT a property of window. Resolve it
  // safely here so both `DB` and `window.DB` styles work.
  function _db() {
    try { if (typeof DB !== 'undefined' && DB) return DB; } catch (e) {}
    return (typeof window !== 'undefined' && window.DB) ? window.DB : null;
  }

  function _fetch(path, body, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms || 5000);
    return fetch(ML_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal
    }).then(function (r) { clearTimeout(t); return r.ok ? r.json() : null; })
      .catch(function () { clearTimeout(t); return null; });
  }

  /* ── 1. RECOMMENDATION: reorder existing cards by ML score ── */
  function enhanceRecommendations() {
    if (!ready()) return;
    try {
      var grids = document.querySelectorAll('[data-ml-reco="1"]');
      if (!grids.length) return;
      var db = _db();
      if (!db) return;
      var session = (db.getSession && db.getSession()) || {};
      var cust = (db.getCustomers ? db.getCustomers() : [])
        .find(function (c) { return c.id === session.id; }) || session;
      var products = (db.getProducts ? db.getProducts() : [])
        .filter(function (p) { return +p.quantity > 0; });
      if (!cust || !products.length) return;

      _fetch('/api/recommend', { customer: cust, products: products }, 5000)
        .then(function (res) {
          if (!res || !res.ok || !res.products) return;
          var order = {};
          res.products.forEach(function (p, i) { order[p.id] = i; });
          grids.forEach(function (grid) {
            var cards = Array.prototype.slice.call(
              grid.querySelectorAll('[data-prod-card]'));
            cards.sort(function (a, b) {
              var ia = order[a.getAttribute('data-prod-card')];
              var ib = order[b.getAttribute('data-prod-card')];
              if (ia == null) ia = 9999; if (ib == null) ib = 9999;
              return ia - ib;
            });
            cards.forEach(function (c) { grid.appendChild(c); }); // reorder in place
          });
        });
    } catch (e) { /* silent — keep rule-based order */ }
  }

  /* ── 2. FORECAST: add an "AI Sales Forecast" panel to Analytics ── */
  function enhanceForecast() {
    if (!ready()) return;
    try {
      var canvas = document.getElementById('chart-revenue');
      if (!canvas) return;                     // only on analytics page
      if (document.getElementById('ml-forecast-card')) return; // already added

      // gather the shop's recent daily revenue to anchor the scale
      var recent = [];
      try {
        var db = _db();
        var orders = (db && db.getOrders ? db.getOrders() : []);
        var byDay = {};
        orders.forEach(function (o) {
          var d = new Date(o.date).toISOString().slice(0, 10);
          byDay[d] = (byDay[d] || 0) + (+o.total || 0);
        });
        recent = Object.keys(byDay).sort().slice(-30).map(function (k) { return byDay[k]; });
      } catch (e) {}

      _fetch('/api/forecast', { recentDailyRevenue: recent, daysAhead: 365 }, 6000)
        .then(function (res) {
          if (!res || !res.ok || !res.forecast) return;
          var f = res.forecast;
          var inr = function (n) { return '₹' + Number(Math.round(n)).toLocaleString('en-IN'); };
          var card = document.createElement('div');
          card.id = 'ml-forecast-card';
          card.className = 'card';
          card.style.cssText = 'margin-bottom:24px;border-left:4px solid var(--gold-light);';
          card.innerHTML =
            '<h4 style="font-family:var(--font-serif);margin-bottom:4px;">🔮 AI Sales Forecast</h4>' +
            '<div style="font-size:0.75rem;color:var(--text-light);margin-bottom:16px;">Predicted by ' +
            (f.algorithm || 'ML model') + '</div>' +
            '<div class="grid-4">' +
            _stat('Tomorrow', inr(f.next_day)) +
            _stat('Next 7 Days', inr(f.next_7_days)) +
            _stat('Next 30 Days', inr(f.next_30_days)) +
            _stat('Next 1 Year', inr(f.next_365_days)) +
            '</div>';
          // insert directly ABOVE the revenue chart's card (additive, no UI edits)
          var host = canvas.closest('.card') || canvas.parentNode;
          host.parentNode.insertBefore(card, host);
        });
    } catch (e) { /* silent */ }
  }

  function _stat(label, val) {
    return '<div class="stat-card"><div class="stat-value" style="color:var(--gold-dark)">' +
      val + '</div><div class="stat-label">' + label + '</div></div>';
  }

  /* ── 3. STOCK PREDICTION: add a panel to the admin dashboard ── */
  function enhanceStock() {
    if (!ready()) return;
    try {
      var anchor = document.querySelector('[data-ml-stock="1"]');
      if (!anchor) return;                          // only where the marker exists
      if (document.getElementById('ml-stock-card')) return; // already added

      var db = _db();
      if (!db) return;
      var products = (db.getProducts ? db.getProducts() : []);
      if (!products.length) return;

      // estimate each product's recent weekly units sold from real orders
      var soldByProduct = {};
      try {
        var orders = (db.getOrders ? db.getOrders() : []);
        var cutoff = Date.now() - 28 * 24 * 60 * 60 * 1000; // last 4 weeks
        orders.forEach(function (o) {
          if (new Date(o.date).getTime() < cutoff) return;
          (o.items || o.products || []).forEach(function (it) {
            var pid = it.id || it.productId;
            if (!pid) return;
            soldByProduct[pid] = (soldByProduct[pid] || 0) + (+it.qty || +it.quantity || 1);
          });
        });
      } catch (e) {}

      var payload = products.map(function (p) {
        var sold4 = soldByProduct[p.id] || 0;
        return {
          id: p.id, name: p.name, category: p.category,
          subcategory: p.subcategory, price: +p.price || 0,
          quantity: +p.quantity || 0,
          recentUnitsSold: Math.round(sold4 / 4),
          avgSales4wk: Math.round(sold4 / 4)
        };
      });

      _fetch('/api/stock', { products: payload }, 6000)
        .then(function (res) {
          if (!res || !res.ok || !res.items) return;
          var need = res.items.filter(function (i) { return i.reorder_qty > 0; }).slice(0, 8);
          var rowsHtml = (need.length ? need : res.items.slice(0, 6)).map(function (i) {
            var color = i.urgency === 'critical' ? 'var(--danger,#c0392b)'
              : i.urgency === 'reorder' ? 'var(--gold-dark)' : 'var(--text-light)';
            return '<div style="display:flex;justify-content:space-between;align-items:center;' +
              'padding:8px 0;border-bottom:1px solid var(--border-light);font-size:0.85rem;">' +
              '<div style="flex:1;"><strong>' + (i.name || '—') + '</strong>' +
              '<div style="font-size:0.72rem;color:var(--text-light);">in stock: ' + i.current_stock +
              ' · predicted demand/wk: ' + i.predicted_demand + '</div></div>' +
              '<div style="text-align:right;color:' + color + ';font-weight:700;">' +
              (i.reorder_qty > 0 ? 'reorder ' + i.reorder_qty : 'ok') + '</div></div>';
          }).join('');

          var card = document.createElement('div');
          card.id = 'ml-stock-card';
          card.className = 'card';
          card.style.cssText = 'margin-bottom:24px;border-left:4px solid var(--gold-light);';
          card.innerHTML =
            '<h4 style="font-family:var(--font-serif);margin-bottom:4px;">📦 AI Stock Prediction</h4>' +
            '<div style="font-size:0.75rem;color:var(--text-light);margin-bottom:14px;">' +
            'Next-week demand &amp; suggested reorders</div>' + rowsHtml;
          anchor.parentNode.insertBefore(card, anchor);
        });
    } catch (e) { /* silent — dashboard unchanged */ }
  }

  /* ── 3. Tell the server new real records arrived (auto-retrain trigger) ── */
  function notifyRecords(count) {
    if (!ready()) return;
    _fetch('/api/notify-records', { count: count || 1 }, 3000);
  }

  window.AuraML = {
    ready: ready,
    enhanceRecommendations: enhanceRecommendations,
    enhanceForecast: enhanceForecast,
    enhanceStock: enhanceStock,
    notifyRecords: notifyRecords
  };
})();
