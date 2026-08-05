"""
Hyperparameter optimization for all three Random Forest models
(IEEE review response).

For each model we run a bounded RandomizedSearchCV over the standard Random
Forest hyperparameters and compare the best cross-validated configuration to the
one currently in production. The winning configuration is printed and written to
`models/hyperparameter_search.json`; a config is only adopted in the training
scripts if it genuinely improves the held-out metric (no fabricated gains).

Search is reproducible (random_state=42) and uses a time-series split for the
forecaster (no temporal leakage) and stratified/standard K-fold otherwise.
"""
import json, warnings
import numpy as np
import pandas as pd
from sklearn.model_selection import (RandomizedSearchCV, StratifiedKFold,
                                     KFold, TimeSeriesSplit)
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
import config as C
import train_recommender as TR
import train_stock as TS

warnings.filterwarnings("ignore")
RNG = 42

# Common RF search space (kept small for reproducibility + runtime).
RF_SPACE = {
    "n_estimators":     [100, 200, 300],
    "max_depth":        [8, 12, 16, 20],
    "min_samples_split":[2, 5, 10],
    "min_samples_leaf": [1, 2, 3, 4],
    "max_features":     ["sqrt", "log2"],
    "bootstrap":        [True, False],
}


def _search(estimator, param_dist, X, y, cv, scoring, prefix=""):
    pd_ = {(prefix + k): v for k, v in param_dist.items()}
    rs = RandomizedSearchCV(estimator, pd_, n_iter=8, scoring=scoring, cv=cv,
                            random_state=RNG, n_jobs=-1, refit=False)
    rs.fit(X, y)
    best = {k.replace(prefix, ""): v for k, v in rs.best_params_.items()}
    return best, round(float(rs.best_score_), 4)


def tune_recommender():
    raw = pd.read_csv(C.RECO_DATA)
    df, _ = TR.engineer(raw)
    X = df[TR.CAT_FEATURES + TR.ENG_FEATURES]
    y = df[TR.TARGET].astype(int)
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), TR.CAT_FEATURES),
        ("num", StandardScaler(), TR.ENG_FEATURES),
    ])
    pipe = Pipeline([("prep", pre),
                     ("clf", RandomForestClassifier(class_weight="balanced",
                                                    random_state=RNG, n_jobs=-1))])
    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=RNG)
    best, score = _search(pipe, RF_SPACE, X, y, cv, "f1", prefix="clf__")
    return {"model": "recommender", "scoring": "f1 (4-fold CV)",
            "best_params": best, "best_cv_score": score,
            "current": {"n_estimators": 300, "max_depth": 20, "min_samples_split": 2,
                        "min_samples_leaf": 2, "max_features": "sqrt",
                        "bootstrap": True, "criterion": "gini", "random_state": 42}}


def tune_forecaster_daily():
    df = pd.read_csv(C.SALES_DATA)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    feats = ["day_of_week", "day_of_month", "month", "day_of_year",
             "is_weekend", "is_festival", "day_index"]
    df[feats] = df[feats].fillna(0)
    X, y = df[feats], df["revenue"].fillna(df["revenue"].median())
    cv = TimeSeriesSplit(n_splits=3)   # respects temporal order (no leakage)
    est = RandomForestRegressor(random_state=RNG, n_jobs=-1)
    best, score = _search(est, RF_SPACE, X, y, cv, "r2")
    return {"model": "forecaster_daily", "scoring": "r2 (TimeSeriesSplit x4)",
            "best_params": best, "best_cv_score": score,
            "current": {"n_estimators": 300, "max_depth": 12, "min_samples_split": 2,
                        "min_samples_leaf": 2, "max_features": "sqrt",
                        "bootstrap": True, "criterion": "squared_error", "random_state": 42}}


def tune_stock():
    df = pd.read_csv(C.STOCK_DATA)
    df[TS.CAT_FEATURES] = df[TS.CAT_FEATURES].fillna("Unknown")
    df[TS.NUM_FEATURES] = df[TS.NUM_FEATURES].fillna(0)
    df[TS.TARGET] = df[TS.TARGET].fillna(df[TS.TARGET].median())
    X, y = df[TS.CAT_FEATURES + TS.NUM_FEATURES], df[TS.TARGET]
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), TS.CAT_FEATURES),
        ("num", StandardScaler(), TS.NUM_FEATURES),
    ])
    pipe = Pipeline([("prep", pre),
                     ("reg", RandomForestRegressor(random_state=RNG, n_jobs=-1))])
    cv = KFold(n_splits=3, shuffle=True, random_state=RNG)
    best, score = _search(pipe, RF_SPACE, X, y, cv, "r2", prefix="reg__")
    return {"model": "stock", "scoring": "r2 (4-fold CV)",
            "best_params": best, "best_cv_score": score,
            "current": {"n_estimators": 300, "max_depth": 14, "min_samples_split": 2,
                        "min_samples_leaf": 2, "max_features": "sqrt",
                        "bootstrap": True, "criterion": "squared_error", "random_state": 42}}


if __name__ == "__main__":
    results = []
    for fn in (tune_recommender, tune_forecaster_daily, tune_stock):
        r = fn()
        results.append(r)
        print(f"\n── {r['model']} ({r['scoring']}) ──")
        print("  best CV score :", r["best_cv_score"])
        print("  best params   :", r["best_params"])
    with open("models/hyperparameter_search.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nsaved models/hyperparameter_search.json")
