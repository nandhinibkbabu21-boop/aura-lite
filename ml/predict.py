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
def rank_products(customer, products):
    """
    customer : dict with gender, size, skinTone, preferredColor, occasion
    products : list of dicts (your real catalogue from the app)
    returns  : same products sorted by predicted 'like' probability, each with
               a `_mlScore` (0-100). Falls back to [] if model missing.
    """
    model = _load_reco()
    if model is None or not products:
        return []

    rows = []
    for p in products:
        color = ""
        if p.get("colors"):
            color = (p["colors"][0].get("name") or "") if isinstance(p["colors"][0], dict) else str(p["colors"][0])
        color = (color or p.get("color") or "").lower()
        rows.append({
            "cust_gender":     customer.get("gender", "Unknown"),
            "cust_size":       customer.get("size", "Unknown"),
            "cust_skin_tone":  customer.get("skinTone", "Unknown"),
            "cust_pref_color": (customer.get("preferredColor") or "unknown").lower(),
            "cust_occasion":   customer.get("occasion", "Unknown"),
            "prod_category":   p.get("category", "Unknown"),
            "prod_subcategory": p.get("subcategory", "Unknown"),
            "prod_material":   p.get("material", "Unknown"),
            "prod_color":      color or "unknown",
            "prod_price":      float(p.get("price", 0) or 0),
        })
    X = pd.DataFrame(rows)
    proba = model.predict_proba(X)[:, 1]      # probability of "liked"
    order = np.argsort(-proba)
    ranked = []
    for idx in order:
        prod = dict(products[idx])
        prod["_mlScore"] = round(float(proba[idx]) * 100, 1)
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
