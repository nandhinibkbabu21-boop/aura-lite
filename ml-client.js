/**
 * ml-client.js — thin bridge from the boutique app to the Python ML server.
 *
 * DESIGN PRINCIPLE: 100% additive and DORMANT until you set `mlUrl` in
 * backend-config.js. When mlUrl is empty (default), every function below is a
 * no-op, so your existing UI and rule-based logic run exactly as before.
 * When you deploy the ML server and set mlUrl, it:
 *   1. Re-orders the "Recommended for You" cards by the ML model's score and
 *      adds a visible "AI Recommended For You" label + per-card confidence %.
 *   2. Adds an "AI Sales Forecast" panel to the Analytics page.
 *   3. Adds an "AI Stock Prediction" panel to the admin dashboard.
 *   4. Shows a small "AI Engine Active" indicator while the ML server is set.
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
      // Prefer the current session's optional recommendation inputs (set by the
      // app) over the saved profile, so ML ranking matches what the shopper
      // entered this visit. Falls back to the saved profile when not set.
      var cust = (typeof window !== 'undefined' && window.__auraRecoCustomer)
        ? window.__auraRecoCustomer
        : ((db.getCustomers ? db.getCustomers() : [])
            .find(function (c) { return c.id === session.id; }) || session);
      var products = (db.getProducts ? db.getProducts() : [])
        .filter(function (p) { return +p.quantity > 0; });
      if (!cust || !products.length) return;

      _fetch('/api/recommend', { customer: cust, products: products }, 5000)
        .then(function (res) {
          if (!res || !res.ok || !res.products) return;
          var order = {}, scores = {};
          res.products.forEach(function (p, i) {
            order[p.id] = i;
            if (p._mlScore != null) scores[p.id] = p._mlScore;
          });
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
            _addRecoNote(grid);             // visible "AI Recommended For You" label
            _addScoreBadges(grid, scores);  // per-card ML confidence badge
          });
        });
    } catch (e) { /* silent — keep rule-based order */ }
  }

  // Visible, non-intrusive "AI Recommended For You" label above a reco grid.
  function _addRecoNote(grid) {
    var prev = grid.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains('ml-reco-note')) return;
    var note = document.createElement('div');
    note.className = 'ml-reco-note';
    note.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' +
      'margin:0 4px 12px;font-size:0.72rem;color:var(--text-light);';
    note.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;' +
      'background:var(--cream);border:1px solid var(--gold-light);color:var(--gold-dark);' +
      'font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:0.66rem;">' +
      '🤖 AI Recommended For You</span>' +
      '<span>Recommended based on your preferences, previous interactions, and product features.</span>';
    grid.parentNode.insertBefore(note, grid);
  }

  // Small ML confidence badge on each recommended card.
  function _addScoreBadges(grid, scores) {
    Array.prototype.slice.call(grid.querySelectorAll('[data-prod-card]')).forEach(function (c) {
      var s = scores[c.getAttribute('data-prod-card')];
      if (s == null) return;
      var box = c.querySelector('.shop-card-img') || c;
      if (box.querySelector('.ml-score-badge')) return;
      if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
      var b = document.createElement('span');
      b.className = 'ml-score-badge';
      b.textContent = 'AI ' + Math.max(0, Math.min(100, Math.round(s))) + '%';
      b.title = 'ML recommendation confidence';
      b.style.cssText = 'position:absolute;right:8px;top:8px;z-index:3;' +
        'background:rgba(0,0,0,0.72);color:#fff;font-size:0.64rem;font-weight:700;' +
        'letter-spacing:0.03em;padding:3px 7px;border-radius:999px;pointer-events:none;';
      box.appendChild(b);
    });
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
            '<div style="font-size:0.72rem;color:var(--text-light);margin-bottom:16px;">' +
            'Model Used: <strong style="color:var(--gold-dark);">Random Forest Regression</strong> ' +
            '<span style="opacity:0.7;">(' + (f.algorithm || 'RandomForestRegressor') + ')</span></div>' +
            '<div class="grid-4">' +
            _stat('Tomorrow', inr(f.next_day)) +
            _stat('Next 7 Days', inr(f.next_7_days)) +
            _stat('Next 30 Days', inr(f.next_30_days)) +
            _stat('Next 1 Year', inr(f.next_365_days)) +
            '</div>' +
            '<div style="font-size:0.68rem;color:var(--text-light);margin-top:12px;line-height:1.5;">' +
            'Trained on your historical daily sales (seasonality, weekends, festivals &amp; trend). ' +
            'Live prediction from the ML server.</div>';
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
          var statusMap = { critical: 'Critical', reorder: 'Low Stock', watch: 'Watch', ok: 'Normal' };
          var rowsHtml = (need.length ? need : res.items.slice(0, 6)).map(function (i) {
            var color = i.urgency === 'critical' ? 'var(--danger,#c0392b)'
              : i.urgency === 'reorder' ? 'var(--gold-dark)'
              : i.urgency === 'watch' ? '#b8860b' : '#2e7d32';
            var status = statusMap[i.urgency] || 'Normal';
            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;' +
              'padding:8px 0;border-bottom:1px solid var(--border-light);font-size:0.85rem;">' +
              '<div style="flex:1;"><strong>' + (i.name || '—') + '</strong>' +
              '<div style="font-size:0.72rem;color:var(--text-light);">in stock: ' + i.current_stock +
              ' · predicted demand/wk: ' + i.predicted_demand +
              (i.reorder_qty > 0 ? ' · reorder: ' + i.reorder_qty : '') + '</div></div>' +
              '<span style="color:' + color + ';font-weight:700;font-size:0.7rem;white-space:nowrap;' +
              'border:1px solid ' + color + ';border-radius:999px;padding:2px 9px;">' + status + '</span></div>';
          }).join('');

          var card = document.createElement('div');
          card.id = 'ml-stock-card';
          card.className = 'card';
          card.style.cssText = 'margin-bottom:24px;border-left:4px solid var(--gold-light);';
          card.innerHTML =
            '<h4 style="font-family:var(--font-serif);margin-bottom:4px;">📦 AI Stock Prediction</h4>' +
            '<div style="font-size:0.72rem;color:var(--text-light);margin-bottom:14px;">' +
            'Model Used: <strong style="color:var(--gold-dark);">Random Forest Regression</strong> · ' +
            'Next-week demand &amp; suggested reorders</div>' + rowsHtml +
            '<div style="font-size:0.68rem;color:var(--text-light);margin-top:12px;line-height:1.5;">' +
            'Demand predicted from category, price, season &amp; recent sales. ' +
            'Reorder quantity = predicted demand − current stock.</div>';
          anchor.parentNode.insertBefore(card, anchor);
        });
    } catch (e) { /* silent — dashboard unchanged */ }
  }

  /* ── 4. Global "AI Engine Active" indicator (only when ML is connected) ── */
  function showEngineBadge() {
    if (!ready()) return;
    if (document.getElementById('ml-engine-badge')) return;
    if (!document.body) return;
    var b = document.createElement('div');
    b.id = 'ml-engine-badge';
    b.title = 'Machine Learning services connected';
    b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9998;' +
      'display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;' +
      'background:rgba(255,255,255,0.92);border:1px solid var(--gold-light,#e6d3a3);' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.08);font-size:0.68rem;font-weight:700;' +
      'letter-spacing:0.04em;text-transform:uppercase;color:var(--gold-dark,#a67c00);' +
      'font-family:var(--font-sans,inherit);backdrop-filter:blur(4px);';
    b.innerHTML =
      '<span style="width:8px;height:8px;border-radius:50%;background:#2e7d32;' +
      'box-shadow:0 0 0 0 rgba(46,125,50,0.6);animation:mlPulse 1.8s infinite;"></span>' +
      '<span>AI Engine Active</span>';
    if (!document.getElementById('ml-engine-style')) {
      var st = document.createElement('style');
      st.id = 'ml-engine-style';
      st.textContent = '@keyframes mlPulse{0%{box-shadow:0 0 0 0 rgba(46,125,50,0.5)}' +
        '70%{box-shadow:0 0 0 7px rgba(46,125,50,0)}100%{box-shadow:0 0 0 0 rgba(46,125,50,0)}}';
      document.head.appendChild(st);
    }
    document.body.appendChild(b);
  }

  /* ── Data getters for the dedicated AI pages (return raw model output) ── */
  // Returns the forecast object ({next_day, next_7_days, daily[], weekly[], monthly[], ...}) or null.
  function getForecast() {
    if (!ready()) return Promise.resolve(null);
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
    return _fetch('/api/forecast', { recentDailyRevenue: recent, daysAhead: 365 }, 20000)
      .then(function (res) { return (res && res.ok && res.forecast) ? res.forecast : null; });
  }

  // Returns the stock items array ([{id,name,current_stock,predicted_demand,reorder_qty,urgency}]) or null.
  function getStock() {
    if (!ready()) return Promise.resolve(null);
    var db = _db();
    if (!db) return Promise.resolve(null);
    var products = (db.getProducts ? db.getProducts() : []);
    if (!products.length) return Promise.resolve([]);
    var soldByProduct = {};
    try {
      var orders = (db.getOrders ? db.getOrders() : []);
      var cutoff = Date.now() - 28 * 24 * 60 * 60 * 1000;
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
    return _fetch('/api/stock', { products: payload }, 20000)
      .then(function (res) { return (res && res.ok && res.items) ? res.items : null; });
  }

  /* ── Tell the server new real records arrived (auto-retrain trigger) ── */
  function notifyRecords(count) {
    if (!ready()) return;
    _fetch('/api/notify-records', { count: count || 1 }, 3000);
  }

  // Show the connected-engine badge once the DOM is ready.
  if (ready()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showEngineBadge);
    } else {
      showEngineBadge();
    }
  }

  window.AuraML = {
    ready: ready,
    enhanceRecommendations: enhanceRecommendations,
    enhanceForecast: enhanceForecast,
    enhanceStock: enhanceStock,
    getForecast: getForecast,
    getStock: getStock,
    showEngineBadge: showEngineBadge,
    notifyRecords: notifyRecords
  };
})();
