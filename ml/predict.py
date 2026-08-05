"""
Prediction helpers used by the live API server.

These load the SAVED models (no retraining at request time) and turn them into
the two things your app actually needs:
  * rank_products()  -> ordered product recommendations for one customer
  * forecast_sales() -> future daily/weekly/monthly/yearly revenue
"""
import os, datetime as dt
import numpy as np
import pandas as pd
import joblib
import config as C

_reco_model = None
_sales_bundle = None
_stock_bundle = None


def _load_reco():
    global _reco_model
    if _reco_model is None and os.path.exists(C.RECO_MODEL):
        _reco_model = joblib.load(C.RECO_MODEL)
    return _reco_model


def _load_sales():
    global _sales_bundle
    if _sales_bundle is None and os.path.exists(C.SALES_MODEL):
        _sales_bundle = joblib.load(C.SALES_MODEL)
    return _sales_bundle


def _load_stock():
    global _stock_bundle
    if _stock_bundle is None and os.path.exists(C.STOCK_MODEL):
        _stock_bundle = joblib.load(C.STOCK_MODEL)
    return _stock_bundle


def reload_models():
    """Force models to be re-read from disk (called after a retrain)."""
    global _reco_model, _sales_bundle, _stock_bundle
    _reco_model = None
    _sales_bundle = None
    _stock_bundle = None
    _load_reco()
    _load_sales()
    _load_stock()


# ── RECOMMENDATION ───────────────────────────────────────────────
# Profile fields that make a customer profile "complete enough" for the
# personalised model. If none are present we treat the shopper as a pure
# cold-start (new / anonymous / empty profile) and fall back to popularity.
_PROFILE_FIELDS = ("gender", "size", "skinTone", "preferredColor", "occasion")


def _prod_color(p):
    color = ""
    if p.get("colors"):
        first = p["colors"][0]
        color = (first.get("name") or "") if isinstance(first, dict) else str(first)
    return (color or p.get("color") or "").lower() or "unknown"


def _profile_filled(customer):
    """How many of the key profile fields the customer actually provided."""
    n = 0
    for k in _PROFILE_FIELDS:
        v = customer.get(k)
        if v and str(v).strip() and str(v).strip().lower() not in ("unknown", "any"):
            n += 1
    return n


def _popularity_score(p):
    """Best-effort popularity signal from whatever the catalogue carries."""
    for k in ("soldCount", "recentUnitsSold", "popularity", "salesCount", "timesSold"):
        v = p.get(k)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return None


def _popularity_fallback(products):
    """
    Cold-start fallback for new shoppers / incomplete profiles: rank by
    popularity (trending / best-selling) when available, otherwise by
    in-stock-first then price. Marked with `_fallback` so callers can tell
    these apart. `_mlScore` is still populated (0-100) so the existing UI,
    which only reads `_mlScore`, keeps working unchanged.
    """
    scored = []
    have_pop = any(_popularity_score(p) is not None for p in products)
    pops = [(_popularity_score(p) or 0.0) for p in products]
    pmax = max(pops) if pops else 0.0
    for p, pop in zip(products, pops):
        if have_pop and pmax > 0:
            score = 55.0 + 40.0 * (pop / pmax)        # trending → higher
        else:
            in_stock = int(p.get("quantity", 0) or 0) > 0
            price = float(p.get("price", 0) or 0)
            score = (60.0 if in_stock else 40.0) - min(price, 5000) / 5000 * 10.0
        scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    ranked = []
    for score, p in scored:
        prod = dict(p)
        prod["_mlScore"] = round(float(score), 1)
        prod["_fallback"] = True
        ranked.append(prod)
    return ranked


def rank_products(customer, products, purchase_history=None):
    """
    customer         : dict with gender, size, skinTone, preferredColor, occasion
    products         : list of dicts (your real catalogue from the app)
    purchase_history : optional list of the customer's past purchases (dicts with
                       category / subcategory / color), used for a behavioural
                       boost when history is available.

    Cold-start strategy:
      * NEW / anonymous customer (no profile fields)  -> popularity/trending fallback.
      * INCOMPLETE profile (some fields missing)      -> personalised model with
        the missing attributes filled as "Unknown" (the model was trained with the
        same handle_unknown encoder), plus popularity used as a tie-breaker.
      * EXISTING customer with history                -> personalised model score
        plus a behavioural boost for categories/colours they have bought before.

    returns : products sorted by score, each with `_mlScore` (0-100). Response
              shape is unchanged, so the frontend needs no modification.
    """
    if not products:
        return []
    bundle = _load_reco()
    if bundle is None:
        return []

    filled = _profile_filled(customer or {})
    # Pure cold-start: nothing to personalise on → trending / best-sellers.
    if filled == 0:
        return _popularity_fallback(products)

    # New bundle format {"pipeline", "price_bins", ...}; tolerate the legacy
    # bare-Pipeline format for backward compatibility.
    if isinstance(bundle, dict) and "pipeline" in bundle:
        model = bundle["pipeline"]
        price_bins = bundle.get("price_bins")
        engineered = True
    else:
        model = bundle
        price_bins = None
        engineered = False

    pref_color = (customer.get("preferredColor") or "unknown").lower()
    skin_tone = customer.get("skinTone", "Unknown")
    gender = customer.get("gender", "Unknown")
    skin_family = [c.lower() for c in C.SKIN_TONE_COLORS.get(skin_tone, [])]

    rows = []
    for p in products:
        color = _prod_color(p)
        price = float(p.get("price", 0) or 0)
        cat = p.get("category", "Unknown")
        row = {
            "cust_gender":     gender,
            "cust_size":       customer.get("size", "Unknown"),
            "cust_skin_tone":  skin_tone,
            "cust_pref_color": pref_color,
            "cust_occasion":   customer.get("occasion", "Unknown"),
            "prod_category":   cat,
            "prod_subcategory": p.get("subcategory", "Unknown"),
            "prod_material":   p.get("material", "Unknown"),
            "prod_color":      color,
            "prod_price":      price,
        }
        if engineered:
            row["color_match"] = int(color == pref_color)
            row["skin_compat"] = int(color in skin_family)
            row["gender_cat_match"] = int((gender == "Female" and cat == "Women") or
                                          (gender == "Male" and cat == "Men"))
            row["price_band"] = int(np.digitize(price, price_bins)) if price_bins else 0
        rows.append(row)

    X = pd.DataFrame(rows)
    proba = model.predict_proba(X)[:, 1]          # probability of "liked"
    scores = proba * 100.0

    # Behavioural boost from purchase history (existing customers): nudge up
    # products in categories / colours the customer has bought before.
    if purchase_history:
        hist_cats = {str(h.get("category", "")).lower() for h in purchase_history if isinstance(h, dict)}
        hist_colors = {str(h.get("color", "")).lower() for h in purchase_history if isinstance(h, dict)}
        for i, p in enumerate(products):
            bonus = 0.0
            if p.get("category", "").lower() in hist_cats:
                bonus += 4.0
            if _prod_color(p) in hist_colors:
                bonus += 2.0
            scores[i] = min(100.0, scores[i] + bonus)

    # Incomplete profile: use popularity as a gentle tie-breaker so the ranking
    # is still sensible when the model has little to distinguish products on.
    if filled < len(_PROFILE_FIELDS):
        pops = [(_popularity_score(p) or 0.0) for p in products]
        pmax = max(pops) if pops else 0.0
        if pmax > 0:
            for i, pop in enumerate(pops):
                scores[i] = min(100.0, scores[i] + 3.0 * (pop / pmax))

    order = np.argsort(-scores)
    ranked = []
    for idx in order:
        prod = dict(products[idx])
        prod["_mlScore"] = round(float(scores[idx]), 1)
        ranked.append(prod)
    return ranked


# ── FORECASTING ──────────────────────────────────────────────────
def _features_for_date(d, day_index):
    return {
        "day_of_week":  d.weekday(),
        "day_of_month": d.day,
        "month":        d.month,
        "day_of_year":  d.timetuple().tm_yday,
        "is_weekend":   int(d.weekday() >= 5),
        "is_festival":  int((d.month, d.day) in C.FESTIVAL_DATES),
        "day_index":    day_index,
    }


def _week_features(d, week_index):
    span = pd.date_range(d, d + dt.timedelta(days=6))
    return {
        "week_index":       week_index,
        "month":            d.month,
        "week_of_year":     d.isocalendar()[1],
        "is_festival_week": int(any((x.month, x.day) in C.FESTIVAL_DATES for x in span)),
    }


def _month_features(d, month_index):
    span = pd.date_range(d, d + dt.timedelta(days=30))
    return {
        "month_index":       month_index,
        "month":             d.month,
        "is_festival_month": int(any((x.month, x.day) in C.FESTIVAL_DATES for x in span)),
    }


def forecast_sales(days_ahead=365, recent_daily_revenue=None):
    """
    Multi-horizon forecast using SEPARATE chronologically-trained Random Forest
    models for the daily, weekly and monthly horizons; the yearly figure is
    derived from the monthly model (a dedicated yearly model is not trainable on
    a two-year history). `recent_daily_revenue` optionally anchors the forecast
    to the shop's real revenue scale while preserving the learned seasonal shape.
    """
    bundle = _load_sales()
    if bundle is None:
        return None

    # Backward compatibility: fall back to legacy single-model bundle.
    if "daily" not in bundle:
        model, feats = bundle["model"], bundle["features"]
        start = dt.date.today(); base = C.SALES_HISTORY_DAYS
        preds = np.clip(model.predict(pd.DataFrame(
            [_features_for_date(start + dt.timedelta(days=i), base + i) for i in range(days_ahead)])[feats]), 0, None)
        if recent_daily_revenue:
            ra = float(np.mean([r for r in recent_daily_revenue if r is not None])); pa = float(np.mean(preds)) or 1.0
            if ra > 0: preds = preds * (ra / pa)
        daily = [{"date": (start + dt.timedelta(days=i)).isoformat(), "revenue": round(float(preds[i]), 2)} for i in range(days_ahead)]
        return {"algorithm": bundle.get("algorithm", "RandomForestRegressor"),
                "next_day": round(float(preds[0]), 2), "next_7_days": round(float(np.sum(preds[:7])), 2),
                "next_30_days": round(float(np.sum(preds[:30])), 2), "next_365_days": round(float(np.sum(preds[:365])), 2),
                "daily": daily[:30],
                "weekly": [round(float(np.sum(preds[i:i+7])), 2) for i in range(0, 84, 7)],
                "monthly": [round(float(np.sum(preds[i:i+30])), 2) for i in range(0, 360, 30)]}

    start = dt.date.today()
    d_model, d_feats = bundle["daily"]["model"], bundle["daily"]["features"]
    w_model, w_feats = bundle["weekly"]["model"], bundle["weekly"]["features"]
    m_model, m_feats = bundle["monthly"]["model"], bundle["monthly"]["features"]
    d_base = C.SALES_HISTORY_DAYS
    w_base = bundle["weekly"].get("last_index", 0) + 1
    m_base = bundle["monthly"].get("last_index", 0) + 1

    # DAILY (next 30 days, for chart + anchoring scale)
    d_rows = [_features_for_date(start + dt.timedelta(days=i), d_base + i) for i in range(30)]
    d_pred = np.clip(d_model.predict(pd.DataFrame(d_rows)[d_feats]), 0, None)

    # Anchor to the shop's real recent daily average; the same factor is applied
    # to every horizon so predictions stay mutually consistent and on-scale.
    scale = 1.0
    if recent_daily_revenue:
        real_avg = float(np.mean([r for r in recent_daily_revenue if r is not None]))
        pred_avg = float(np.mean(d_pred)) or 1.0
        if real_avg > 0:
            scale = real_avg / pred_avg
    d_pred = d_pred * scale

    # WEEKLY (next 12 weeks)
    w_rows = [_week_features(start + dt.timedelta(weeks=w), w_base + w) for w in range(12)]
    w_pred = np.clip(w_model.predict(pd.DataFrame(w_rows)[w_feats]), 0, None) * scale

    # MONTHLY (next 12 months)
    m_rows = [_month_features(start + dt.timedelta(days=30 * mth), m_base + mth) for mth in range(12)]
    m_pred = np.clip(m_model.predict(pd.DataFrame(m_rows)[m_feats]), 0, None) * scale

    daily = [{"date": (start + dt.timedelta(days=i)).isoformat(),
              "revenue": round(float(d_pred[i]), 2)} for i in range(30)]

    return {
        "algorithm": "RandomForestRegressor (chronological, multi-horizon)",
        "next_day":      round(float(d_pred[0]), 2),
        "next_7_days":   round(float(w_pred[0]), 2),                 # weekly model
        "next_30_days":  round(float(m_pred[0]), 2),                 # monthly model
        "next_365_days": round(float(np.sum(m_pred[:12])), 2),       # derived from monthly
        "daily":   daily,
        "weekly":  [round(float(v), 2) for v in w_pred[:12]],
        "monthly": [round(float(v), 2) for v in m_pred[:12]],
    }


# ── STOCK / DEMAND PREDICTION ────────────────────────────────────
# Service-level -> z-factor (one-sided normal). Used for safety-stock sizing.
_Z_TABLE = {0.80: 0.84, 0.85: 1.04, 0.90: 1.28, 0.95: 1.645, 0.975: 1.96, 0.99: 2.33}


def _z_for(service_level):
    # nearest tabulated service level
    return _Z_TABLE[min(_Z_TABLE, key=lambda s: abs(s - service_level))]


def predict_stock(products, lead_time=1.0, service_level=0.95):
    """
    Predict next-week demand per product and derive a full inventory-control
    decision (safety stock, reorder point, reorder quantity) instead of a naive
    demand-minus-stock rule.

    products      : list of the app's product dicts (may carry recentUnitsSold /
                    avgSales4wk; otherwise estimated).
    lead_time     : replenishment lead time L, in weeks (default 1).
    service_level : target cycle service level (default 0.95 -> z = 1.645).

    returns : list of dicts with predicted_demand, current_stock, safety_stock,
              reorder_point, reorder_qty, lead_time, service_level, urgency.
    """
    bundle = _load_stock()
    if bundle is None or not products:
        return []
    model = bundle["model"]
    cat_f, num_f = bundle["cat_features"], bundle["num_features"]
    # Demand uncertainty sigma_d: use the model's test RMSE as a global estimate
    # of weekly-demand variability (falls back to a small floor).
    sigma_d = float(bundle.get("demand_std") or bundle.get("rmse") or 1.44)
    L = max(0.0, float(lead_time or 1.0))
    z = _z_for(float(service_level or 0.95))

    today = dt.date.today()
    month = today.month
    week_of_year = today.isocalendar()[1]
    is_fest = int(any((today + dt.timedelta(days=o)).month == month and
                      ((today + dt.timedelta(days=o)).month, (today + dt.timedelta(days=o)).day) in C.FESTIVAL_DATES
                      for o in range(7)))

    rows = []
    for p in products:
        stock = int(p.get("quantity", 0) or 0)
        last_week = p.get("recentUnitsSold")
        avg_4wk = p.get("avgSales4wk")
        if last_week is None:
            last_week = avg_4wk if avg_4wk is not None else 4.0
        if avg_4wk is None:
            avg_4wk = last_week
        rows.append({
            "prod_category":    p.get("category", "Unknown"),
            "prod_subcategory": p.get("subcategory", "Unknown"),
            "prod_price":       float(p.get("price", 0) or 0),
            "month":            month,
            "week_of_year":     week_of_year,
            "is_festival_week": is_fest,
            "units_sold_last_week": float(last_week),
            "avg_sales_4wk":    float(avg_4wk),
            "current_stock":    stock,
        })
    X = pd.DataFrame(rows)[cat_f + num_f]
    preds = np.clip(model.predict(X), 0, None)

    import math
    out = []
    for p, demand in zip(products, preds):
        stock = int(p.get("quantity", 0) or 0)
        demand = float(round(demand, 1))                 # forecast weekly demand d
        lead_time_demand = demand * L                    # LTD = d * L
        safety_stock = z * sigma_d * math.sqrt(L) if L > 0 else 0.0
        reorder_point = lead_time_demand + safety_stock  # ROP = LTD + SS
        # Order-up-to quantity: raise on-hand to cover lead-time demand + safety.
        reorder = int(max(0, round(reorder_point - stock)))
        if stock <= safety_stock:
            urgency = "critical"
        elif stock <= reorder_point:
            urgency = "reorder"
        elif stock <= reorder_point * 1.5:
            urgency = "watch"
        else:
            urgency = "ok"
        out.append({
            "id":               p.get("id"),
            "name":             p.get("name"),
            "predicted_demand": demand,
            "current_stock":    stock,
            "safety_stock":     round(float(safety_stock), 2),
            "reorder_point":    round(float(reorder_point), 2),
            "reorder_qty":      reorder,
            "lead_time":        L,
            "service_level":    float(service_level or 0.95),
            "urgency":          urgency,
        })
    out.sort(key=lambda r: -r["reorder_qty"])
    return out
