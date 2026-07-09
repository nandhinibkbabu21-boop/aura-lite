"""
Sales Forecasting model  (REGRESSION / time-series).

ALGORITHM: Random Forest Regressor  (with Linear Regression trained as a
baseline; the pipeline automatically keeps whichever scores a higher R²).
WHY:
  * Daily sales are driven by seasonality (weekends, festivals) and a growth
    trend. Random Forest captures those non-linear spikes far better than a
    straight line, while still being beginner-friendly and needing no tuning.
  * Linear Regression is trained alongside as an easy, transparent baseline so
    you can SEE the difference — the better model (by R²) is the one saved.
  * These are regression models, which is exactly what produces the
    R² / MAE / RMSE metrics you asked for.

FEATURES: day_of_week, day_of_month, month, day_of_year, is_weekend,
          is_festival, day_index (trend)   ->   predict daily revenue.
"""
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import config as C

FEATURES = ["day_of_week", "day_of_month", "month", "day_of_year",
            "is_weekend", "is_festival", "day_index"]
TARGET   = "revenue"


def _evaluate(model, X_te, y_te):
    pred = model.predict(X_te)
    rmse = float(np.sqrt(mean_squared_error(y_te, pred)))
    return {
        "r2":   round(float(r2_score(y_te, pred)), 4),
        "mae":  round(float(mean_absolute_error(y_te, pred)), 2),
        "rmse": round(rmse, 2),
    }


def train():
    # 1. LOAD
    df = pd.read_csv(C.SALES_DATA)

    # 2. PREPROCESS (fill any gaps, select features)
    df[FEATURES] = df[FEATURES].fillna(0)
    df[TARGET]   = df[TARGET].fillna(df[TARGET].median())
    X, y = df[FEATURES], df[TARGET]

    # 3. SPLIT
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=42)

    # 4. TRAIN two candidates
    rf = RandomForestRegressor(n_estimators=300, max_depth=12,
                               min_samples_leaf=2, random_state=42, n_jobs=-1)
    lr = LinearRegression()
    rf.fit(X_tr, y_tr)
    lr.fit(X_tr, y_tr)

    # 5. EVALUATE + pick the better one by R²
    rf_m, lr_m = _evaluate(rf, X_te, y_te), _evaluate(lr, X_te, y_te)
    if rf_m["r2"] >= lr_m["r2"]:
        best, best_name, best_m = rf, "RandomForestRegressor", rf_m
    else:
        best, best_name, best_m = lr, "LinearRegression", lr_m

    metrics = {
        "algorithm_selected": best_name,
        "task": "sales_forecasting (regression)",
        "n_rows": int(len(df)),
        "n_train": int(len(X_tr)),
        "n_test": int(len(X_te)),
        "selected_metrics": best_m,
        "comparison": {"RandomForestRegressor": rf_m, "LinearRegression": lr_m},
        "r2_score": best_m["r2"],
        "mae": best_m["mae"],
        "rmse": best_m["rmse"],
    }

    # 6. SAVE
    joblib.dump({"model": best, "features": FEATURES, "algorithm": best_name},
                C.SALES_MODEL, compress=3)
    with open(C.SALES_METRICS, "w") as f:
        json.dump(metrics, f, indent=2)
    return metrics


if __name__ == "__main__":
    m = train()
    print("── FORECASTER TRAINED ──")
    print(f"  selected  : {m['algorithm_selected']}")
    print(f"  R2 / MAE / RMSE: {m['r2_score']} / {m['mae']} / {m['rmse']}")
    print(f"  model saved: {C.SALES_MODEL}")
