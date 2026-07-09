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


def forecast_sales(days_ahead=365, recent_daily_revenue=None):
    """
    Predict future revenue for the next `days_ahead` days and aggregate to
    daily / weekly / monthly / yearly totals.

    recent_daily_revenue : optional list of the shop's recent REAL daily
                           revenues; used only to gently anchor the baseline so
                           predictions match the shop's actual scale.
    """
    bundle = _load_sales()
    if bundle is None:
        return None
    model, feats = bundle["model"], bundle["features"]

    start = dt.date.today()
    base_index = C.SALES_HISTORY_DAYS      # continue the trend after training window
    rows = [_features_for_date(start + dt.timedelta(days=i), base_index + i)
            for i in range(days_ahead)]
    X = pd.DataFrame(rows)[feats]
    preds = model.predict(X)
    preds = np.clip(preds, 0, None)

    # Optional real-data anchoring: scale predictions so their average matches
    # the shop's recent real average (keeps the seasonal SHAPE, fixes the scale).
    if recent_daily_revenue:
        real_avg = float(np.mean([r for r in recent_daily_revenue if r is not None]))
        pred_avg = float(np.mean(preds)) or 1.0
        if real_avg > 0:
            preds = preds * (real_avg / pred_avg)

    daily = [{"date": (start + dt.timedelta(days=i)).isoformat(),
              "revenue": round(float(preds[i]), 2)} for i in range(days_ahead)]

    def _sum(n):   # sum of next n days
        return round(float(np.sum(preds[:n])), 2)

    return {
        "algorithm": bundle["algorithm"],
        "next_day":     round(float(preds[0]), 2),
        "next_7_days":  _sum(7),
        "next_30_days": _sum(30),
        "next_365_days": _sum(365),
        "daily":   daily[:30],          # first 30 days for charting
        "weekly":  [round(float(np.sum(preds[i:i+7])), 2) for i in range(0, min(days_ahead, 84), 7)],
        "monthly": [round(float(np.sum(preds[i:i+30])), 2) for i in range(0, min(days_ahead, 360), 30)],
    }


# ── STOCK / DEMAND PREDICTION ────────────────────────────────────
def predict_stock(products):
    """
    products : list of the app's real product dicts. Each may optionally carry
               `recentUnitsSold` (units sold last week) — if absent it is
               estimated from the 4-week average or a category baseline.
    returns  : list of {id, name, predicted_demand, current_stock,
               reorder_qty, urgency} — how many units are likely to sell next
               week and how many to reorder. Falls back to [] if model missing.
    """
    bundle = _load_stock()
    if bundle is None or not products:
        return []
    model = bundle["model"]
    cat_f, num_f = bundle["cat_features"], bundle["num_features"]

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

    out = []
    for p, demand in zip(products, preds):
        stock = int(p.get("quantity", 0) or 0)
        demand = float(round(demand, 1))
        reorder = int(max(0, round(demand - stock)))
        if stock <= 0:
            urgency = "critical"
        elif stock < demand:
            urgency = "reorder"
        elif stock < demand * 2:
            urgency = "watch"
        else:
            urgency = "ok"
        out.append({
            "id":               p.get("id"),
            "name":             p.get("name"),
            "predicted_demand": demand,
            "current_stock":    stock,
            "reorder_qty":      reorder,
            "urgency":          urgency,
        })
    out.sort(key=lambda r: -r["reorder_qty"])
    return out
