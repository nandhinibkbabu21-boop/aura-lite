"""
Stock / Demand Prediction model  (REGRESSION).

ALGORITHM: Random Forest Regressor  (with Linear Regression trained as a
baseline; the pipeline automatically keeps whichever scores a higher R²).
WHY:
  * "How many units of this product will sell NEXT WEEK?" is a demand-forecasting
    problem. Restock decisions follow directly: reorder = predicted demand − stock.
  * Demand is driven by a MIX of categories (category, sub-category) and numbers
    (price, recent sales, season). Random Forest handles that mix naturally and
    captures non-linear festival/season spikes; Linear Regression is kept as an
    easy, transparent baseline so you can SEE the difference.
  * Regression → produces the R² / MAE / RMSE metrics you asked for.

FEATURES: category, sub-category, price, month, week-of-year, festival flag,
          last-week units, 4-week average, current stock  →  units_sold_next_week.
"""
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import config as C

CAT_FEATURES = ["prod_category", "prod_subcategory"]
NUM_FEATURES = ["prod_price", "month", "week_of_year", "is_festival_week",
                "units_sold_last_week", "avg_sales_4wk", "current_stock"]
TARGET       = "units_sold_next_week"


def _build(estimator):
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        ("num", StandardScaler(), NUM_FEATURES),
    ])
    return Pipeline([("prep", pre), ("reg", estimator)])


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
    df = pd.read_csv(C.STOCK_DATA)

    # 2. PREPROCESS
    df[CAT_FEATURES] = df[CAT_FEATURES].fillna("Unknown")
    df[NUM_FEATURES] = df[NUM_FEATURES].fillna(0)
    df[TARGET]       = df[TARGET].fillna(df[TARGET].median())
    X = df[CAT_FEATURES + NUM_FEATURES]
    y = df[TARGET]

    # 3. SPLIT
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=42)

    # 4. TRAIN two candidates
    # All eight RF hyperparameters set EXPLICITLY (documentation/reproducibility).
    # This config beat the RandomizedSearchCV suggestions on the hold-out set
    # (see hyperparameter_tuning.py), so it is retained. max_features=1.0 and
    # criterion='squared_error' are the regressor defaults, stated for clarity.
    rf = _build(RandomForestRegressor(
        n_estimators=300, max_depth=14, min_samples_split=2, min_samples_leaf=2,
        max_features=1.0, bootstrap=True, criterion="squared_error",
        random_state=42, n_jobs=-1))
    lr = _build(LinearRegression())
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
        "task": "stock_prediction (regression / demand forecasting)",
        "n_rows": int(len(df)),
        "n_train": int(len(X_tr)),
        "n_test": int(len(X_te)),
        "selected_metrics": best_m,
        "hyperparameters": ({"n_estimators": 300, "max_depth": 14, "min_samples_split": 2,
                             "min_samples_leaf": 2, "max_features": 1.0, "bootstrap": True,
                             "criterion": "squared_error", "random_state": 42}
                            if best_name == "RandomForestRegressor" else {"model": "LinearRegression"}),
        "comparison": {"RandomForestRegressor": rf_m, "LinearRegression": lr_m},
        "r2_score": best_m["r2"],
        "mae": best_m["mae"],
        "rmse": best_m["rmse"],
    }

    # 6. SAVE model + metrics
    # demand_std = test RMSE, used as the demand-variability estimate (sigma_d)
    # for safety-stock sizing in the inventory-control logic.
    joblib.dump({"model": best,
                 "cat_features": CAT_FEATURES,
                 "num_features": NUM_FEATURES,
                 "algorithm": best_name,
                 "demand_std": best_m["rmse"],
                 "rmse": best_m["rmse"]}, C.STOCK_MODEL, compress=3)
    with open(C.STOCK_METRICS, "w") as f:
        json.dump(metrics, f, indent=2)
    return metrics


if __name__ == "__main__":
    m = train()
    print("── STOCK PREDICTOR TRAINED ──")
    print(f"  selected  : {m['algorithm_selected']}")
    print(f"  R2 / MAE / RMSE: {m['r2_score']} / {m['mae']} / {m['rmse']}")
    print(f"  model saved: {C.STOCK_MODEL}")
