"""
Robustness testing for all three Random Forest models (IEEE review response).

Each production model is evaluated on a clean held-out test set (BASELINE) and
then on the SAME test set after four realistic data-quality perturbations, so we
measure how much performance degrades under imperfect real-world input:

  * missing    — 15% of feature cells removed, then imputed the way inference
                 does (categoricals -> "Unknown", numerics -> training median).
  * noise      — Gaussian noise (sigma = 25% of each numeric column's std) added
                 to numeric features + 10% of categorical cells randomly flipped.
  * outliers   — 5% of numeric cells replaced with extreme values (x8).
  * imbalance  — classifier: test set resampled to a 90:10 class ratio;
                 regressors: evaluated on the high-value tail (rare-demand /
                 peak-revenue cases), which is the regression analogue of a
                 minority class.

All randomness is seeded (reproducible). Results -> models/robustness_report.json
and a comparison figure -> ../paper/revised/figures/robustness_comparison.png.
Nothing here is fabricated; every number is computed from the saved models.
"""
import json, math, warnings
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                             f1_score, r2_score, mean_absolute_error,
                             mean_squared_error)
import config as C
import train_recommender as TR
import train_stock as TS

warnings.filterwarnings("ignore")
RNG = np.random.RandomState(42)
SEED = 42


# ── metric helpers ───────────────────────────────────────────────
def clf_metrics(y, p):
    return {
        "accuracy":  round(float(accuracy_score(y, p)), 4),
        "precision": round(float(precision_score(y, p, zero_division=0)), 4),
        "recall":    round(float(recall_score(y, p, zero_division=0)), 4),
        "f1_score":  round(float(f1_score(y, p, zero_division=0)), 4),
    }


def reg_metrics(y, p):
    y = np.asarray(y, float); p = np.asarray(p, float)
    m = y != 0
    mape = float(np.mean(np.abs((y[m] - p[m]) / y[m])) * 100) if m.any() else None
    return {
        "r2":   round(float(r2_score(y, p)), 4),
        "mae":  round(float(mean_absolute_error(y, p)), 2),
        "rmse": round(float(np.sqrt(mean_squared_error(y, p))), 2),
        "mape": round(mape, 2) if mape is not None else None,
    }


# ── perturbations (operate on a copy of the test feature frame) ───
def add_missing(X, cat, num, medians, frac=0.15, rs=None):
    rs = rs or RNG
    X = X.copy()
    for col in cat + num:
        mask = rs.rand(len(X)) < frac
        if col in cat:
            X.loc[mask, col] = "Unknown"
        else:
            X.loc[mask, col] = medians[col]   # impute as inference would
    return X


def add_noise(X, cat, num, stds, cats_values, frac_cat=0.10, sigma=0.25, rs=None):
    rs = rs or RNG
    X = X.copy()
    for col in num:
        X[col] = X[col].astype(float) + rs.normal(0, sigma * (stds[col] or 1.0), len(X))
    for col in cat:
        mask = rs.rand(len(X)) < frac_cat
        vals = cats_values[col]
        X.loc[mask, col] = rs.choice(vals, mask.sum())
    return X


def add_outliers(X, num, frac=0.05, factor=8.0, rs=None):
    rs = rs or RNG
    X = X.copy()
    for col in num:
        mask = rs.rand(len(X)) < frac
        X.loc[mask, col] = X[col].astype(float).abs().max() * factor
    return X


def imbalance_classification(X, y, ratio=(0.9, 0.1), rs=None):
    rs = rs or RNG
    idx0 = np.where(y.values == 0)[0]
    idx1 = np.where(y.values == 1)[0]
    n = min(len(idx0), len(idx1))
    n0 = int(n * ratio[0] / max(ratio)); n1 = int(n * ratio[1] / max(ratio))
    n0 = max(1, min(n0, len(idx0))); n1 = max(1, min(n1, len(idx1)))
    sel = np.concatenate([rs.choice(idx0, n0, replace=False),
                          rs.choice(idx1, n1, replace=False)])
    rs.shuffle(sel)
    return X.iloc[sel], y.iloc[sel]


# ── per-model harness ────────────────────────────────────────────
def run_recommender():
    raw = pd.read_csv(C.RECO_DATA)
    df, _ = TR.engineer(raw)
    X = df[TR.CAT_FEATURES + TR.ENG_FEATURES]
    y = df[TR.TARGET].astype(int)
    _, Xte, _, yte = train_test_split(X, y, test_size=0.2, random_state=SEED, stratify=y)
    bundle = joblib.load(C.RECO_MODEL)
    model = bundle["pipeline"] if isinstance(bundle, dict) else bundle
    cat, num = TR.CAT_FEATURES, TR.ENG_FEATURES
    medians = {c: float(X[c].median()) for c in num}
    stds = {c: float(X[c].std()) for c in num}
    cats_values = {c: sorted(X[c].dropna().unique().tolist()) for c in cat}

    res = {"baseline": clf_metrics(yte, model.predict(Xte))}
    res["missing"]  = clf_metrics(yte, model.predict(add_missing(Xte, cat, num, medians, rs=np.random.RandomState(1))))
    res["noise"]    = clf_metrics(yte, model.predict(add_noise(Xte, cat, num, stds, cats_values, rs=np.random.RandomState(2))))
    res["outliers"] = clf_metrics(yte, model.predict(add_outliers(Xte, num, rs=np.random.RandomState(3))))
    Xi, yi = imbalance_classification(Xte, yte, rs=np.random.RandomState(4))
    res["imbalance"] = clf_metrics(yi, model.predict(Xi))
    return {"metric_type": "classification", "primary": "f1_score", "scenarios": res}


def _reg_harness(model, Xte, yte, cat, num, X_full):
    medians = {c: float(X_full[c].median()) for c in num}
    stds = {c: float(X_full[c].std()) for c in num}
    cats_values = {c: sorted(X_full[c].dropna().unique().tolist()) for c in cat} if cat else {}
    res = {"baseline": reg_metrics(yte, model.predict(Xte))}
    res["missing"]  = reg_metrics(yte, model.predict(add_missing(Xte, cat, num, medians, rs=np.random.RandomState(11))))
    res["noise"]    = reg_metrics(yte, model.predict(add_noise(Xte, cat, num, stds, cats_values, rs=np.random.RandomState(12))))
    res["outliers"] = reg_metrics(yte, model.predict(add_outliers(Xte, num, rs=np.random.RandomState(13))))
    # regression analogue of imbalance: performance on the high-value tail
    thr = np.quantile(yte.values, 0.8)
    tail = yte.values >= thr
    if tail.sum() >= 5:
        res["imbalance"] = reg_metrics(yte[tail], model.predict(Xte[tail]))
    return res


def run_forecaster():
    df = pd.read_csv(C.SALES_DATA)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    feats = ["day_of_week", "day_of_month", "month", "day_of_year",
             "is_weekend", "is_festival", "day_index"]
    df[feats] = df[feats].fillna(0)
    y = df["revenue"].fillna(df["revenue"].median())
    cut = int(round(len(df) * 0.8))                     # chronological test = last 20%
    Xte, yte = df[feats].iloc[cut:], y.iloc[cut:]
    bundle = joblib.load(C.SALES_MODEL)
    model = bundle["daily"]["model"] if "daily" in bundle else bundle["model"]
    res = _reg_harness(model, Xte, yte, [], feats, df[feats])
    return {"metric_type": "regression", "primary": "r2", "scenarios": res}


def run_stock():
    df = pd.read_csv(C.STOCK_DATA)
    df[TS.CAT_FEATURES] = df[TS.CAT_FEATURES].fillna("Unknown")
    df[TS.NUM_FEATURES] = df[TS.NUM_FEATURES].fillna(0)
    df[TS.TARGET] = df[TS.TARGET].fillna(df[TS.TARGET].median())
    X = df[TS.CAT_FEATURES + TS.NUM_FEATURES]; y = df[TS.TARGET]
    _, Xte, _, yte = train_test_split(X, y, test_size=0.2, random_state=SEED)
    bundle = joblib.load(C.STOCK_MODEL)
    model = bundle["model"]
    res = _reg_harness(model, Xte, yte, TS.CAT_FEATURES, TS.NUM_FEATURES, X)
    return {"metric_type": "regression", "primary": "r2", "scenarios": res}


def make_figure(report):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    scen = ["baseline", "missing", "noise", "outliers", "imbalance"]
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.6))
    panels = [("recommender", "f1_score", "F1-Score"),
              ("forecaster", "r2", "R² Score"),
              ("stock", "r2", "R² Score")]
    titles = {"recommender": "Recommendation (Classifier)",
              "forecaster": "Sales Forecasting (Daily)",
              "stock": "Stock Prediction"}
    for ax, (key, metric, ylabel) in zip(axes, panels):
        s = report[key]["scenarios"]
        vals = [s.get(sc, {}).get(metric, 0) or 0 for sc in scen]
        colors = ["#C9A227"] + ["#8a8a8a"] * 4
        bars = ax.bar(scen, vals, color=colors, edgecolor="#5a4a10", linewidth=0.6)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v, f"{v:.2f}",
                    ha="center", va="bottom", fontsize=8)
        ax.set_title(titles[key]); ax.set_ylabel(ylabel)
        ax.set_ylim(min(0, min(vals)) - 0.05, max(vals) * 1.18 + 0.02)
        ax.tick_params(axis="x", rotation=25)
        for sp in ("top", "right"): ax.spines[sp].set_visible(False)
    fig.suptitle("Model Robustness Under Data-Quality Perturbations "
                 "(gold = clean baseline)", fontsize=12)
    plt.tight_layout(rect=[0, 0, 1, 0.95])
    out = "../paper/revised/figures/robustness_comparison.png"
    plt.savefig(out, dpi=200, facecolor="white")
    return out


if __name__ == "__main__":
    report = {
        "description": "Robustness of the deployed Random Forest models under "
                       "missing values, noise, outliers, and imbalance. Baseline "
                       "= clean held-out test set.",
        "seed": SEED,
        "recommender": run_recommender(),
        "forecaster":  run_forecaster(),
        "stock":       run_stock(),
    }
    fig = make_figure(report)
    report["figure"] = fig
    with open("models/robustness_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print("── ROBUSTNESS REPORT ──")
    for k in ("recommender", "forecaster", "stock"):
        prim = report[k]["primary"]
        print(f"\n{k} (primary = {prim}):")
        for sc, m in report[k]["scenarios"].items():
            print(f"  {sc:10s}: {m}")
    print(f"\nfigure -> {fig}")
    print("saved models/robustness_report.json")
