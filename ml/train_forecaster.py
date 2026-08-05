"""
Sales Forecasting — CHRONOLOGICAL, MULTI-HORIZON (revised per IEEE review).

Changes vs. the previous version:
  * Random 80:20 split replaced by a strictly CHRONOLOGICAL time-based split
    (train = earliest 80% of the timeline, test = most recent 20%) so that no
    future information leaks into the training set (temporal-leakage fix).
  * Instead of one daily model aggregated by summation, SEPARATE Random Forest
    regressors are trained for DAILY, WEEKLY and MONTHLY horizons on the
    correspondingly aggregated series. A dedicated YEARLY model is not trained
    because the dataset spans only two years (two yearly observations); the
    yearly forecast is therefore derived by summing the monthly model over a
    12-month horizon, and this is documented as a limitation.
  * Separate MAE / RMSE / R2 / MAPE are reported for every trained horizon.

ALGORITHM: Random Forest Regressor (per horizon).
"""
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import config as C

RF = dict(n_estimators=300, max_depth=12, min_samples_leaf=2,
          random_state=42, n_jobs=-1)


def _metrics(y, p):
    y = np.asarray(y, float); p = np.asarray(p, float)
    m = y != 0
    mape = float(np.mean(np.abs((y[m] - p[m]) / y[m])) * 100) if m.any() else None
    return {
        "r2":   round(float(r2_score(y, p)), 4),
        "mae":  round(float(mean_absolute_error(y, p)), 2),
        "rmse": round(float(np.sqrt(mean_squared_error(y, p))), 2),
        "mape": round(mape, 2) if mape is not None else None,
        "n_test": int(len(y)),
    }


def _chrono(n, frac=0.2):
    cut = int(round(n * (1 - frac)))
    return cut


def _festival_in_range(dates):
    return int(any((d.month, d.day) in C.FESTIVAL_DATES for d in dates))


def train():
    df = pd.read_csv(C.SALES_DATA)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    df["revenue"] = df["revenue"].fillna(df["revenue"].median())

    # ── DAILY MODEL ──────────────────────────────────────────────
    dfeats = ["day_of_week", "day_of_month", "month", "day_of_year",
              "is_weekend", "is_festival", "day_index"]
    df[dfeats] = df[dfeats].fillna(0)
    cut = _chrono(len(df))
    dX_tr, dX_te = df[dfeats].iloc[:cut], df[dfeats].iloc[cut:]
    dy_tr, dy_te = df["revenue"].iloc[:cut], df["revenue"].iloc[cut:]
    d_model = RandomForestRegressor(**RF).fit(dX_tr, dy_tr)
    d_metrics = _metrics(dy_te, d_model.predict(dX_te))
    daily_last_index = int(df["day_index"].max())

    # ── WEEKLY MODEL ─────────────────────────────────────────────
    df["week"] = df["date"].dt.to_period("W")
    wk = df.groupby("week").agg(
        revenue=("revenue", "sum"),
        month=("month", "first"),
    ).reset_index()
    wk["week_of_year"] = [p.start_time.isocalendar()[1] for p in wk["week"]]
    wk["is_festival_week"] = [
        _festival_in_range(pd.date_range(p.start_time, p.end_time))
        for p in wk["week"]]
    wk["week_index"] = range(len(wk))
    wfeats = ["week_index", "month", "week_of_year", "is_festival_week"]
    wcut = _chrono(len(wk))
    w_model = RandomForestRegressor(**RF).fit(wk[wfeats].iloc[:wcut], wk["revenue"].iloc[:wcut])
    w_metrics = _metrics(wk["revenue"].iloc[wcut:], w_model.predict(wk[wfeats].iloc[wcut:]))
    weekly_last_index = int(wk["week_index"].max())

    # ── MONTHLY MODEL ────────────────────────────────────────────
    df["ym"] = df["date"].dt.to_period("M")
    mo = df.groupby("ym").agg(
        revenue=("revenue", "sum"),
        month=("month", "first"),
        is_festival_month=("is_festival", "max"),
    ).reset_index()
    mo["month_index"] = range(len(mo))
    mfeats = ["month_index", "month", "is_festival_month"]
    mcut = _chrono(len(mo))
    m_model = RandomForestRegressor(**RF).fit(mo[mfeats].iloc[:mcut], mo["revenue"].iloc[:mcut])
    m_metrics = _metrics(mo["revenue"].iloc[mcut:], m_model.predict(mo[mfeats].iloc[mcut:]))
    monthly_last_index = int(mo["month_index"].max())

    bundle = {
        "algorithm": "RandomForestRegressor",
        "split": "chronological (train=earliest 80%, test=latest 20%)",
        "daily":   {"model": d_model, "features": dfeats, "last_index": daily_last_index},
        "weekly":  {"model": w_model, "features": wfeats, "last_index": weekly_last_index},
        "monthly": {"model": m_model, "features": mfeats, "last_index": monthly_last_index},
        "yearly":  {"derived_from": "monthly",
                    "note": "Two-year dataset provides only two yearly observations; "
                            "a dedicated yearly model is not trainable, so the yearly "
                            "forecast is the 12-month sum of the monthly model."},
        # legacy keys for backward compatibility
        "model": d_model, "features": dfeats,
    }
    metrics = {
        "task": "sales_forecasting (regression, chronological, multi-horizon)",
        "algorithm": "RandomForestRegressor",
        "split": "chronological 80:20 (no temporal leakage)",
        "horizons": {
            "daily":   d_metrics,
            "weekly":  w_metrics,
            "monthly": m_metrics,
            "yearly":  {"note": "derived from monthly model (insufficient data for a dedicated model)"},
        },
        # legacy top-level = daily
        "r2_score": d_metrics["r2"], "mae": d_metrics["mae"], "rmse": d_metrics["rmse"],
    }

    joblib.dump(bundle, C.SALES_MODEL, compress=3)
    with open(C.SALES_METRICS, "w") as f:
        json.dump(metrics, f, indent=2)
    return metrics


if __name__ == "__main__":
    m = train()
    print("── FORECASTER (chronological, multi-horizon) ──")
    for h, mm in m["horizons"].items():
        print(f"  {h:8s}: {mm}")
