"""
Product Recommendation — IMPROVED (IEEE review response).

Improvements over the previous version:
  * FEATURE ENGINEERING: explicit domain-match features are derived so the model
    no longer has to infer them from raw one-hot columns:
      - color_match       : product colour == customer's preferred colour
      - skin_compat       : product colour is in the skin-tone-compatible family
      - gender_cat_match  : customer gender aligns with product category
      - price_band        : quartile price bucket
  * HYPERPARAMETER TUNING: configuration selected via cross-validated search
    (n_estimators=300, max_depth=20, min_samples_leaf=2, class_weight=balanced).
  * FEATURE IMPORTANCE analysis is computed and saved for the research paper.

ALGORITHM: Random Forest Classifier.
"""
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                             f1_score, confusion_matrix, classification_report)
import config as C

CAT_FEATURES = ["cust_gender", "cust_size", "cust_skin_tone", "cust_pref_color",
                "cust_occasion", "prod_category", "prod_subcategory",
                "prod_material", "prod_color"]
ENG_FEATURES = ["prod_price", "color_match", "skin_compat", "gender_cat_match", "price_band"]
TARGET = "liked"


def engineer(df, price_bins=None):
    """Add the engineered match features. Returns (df, price_bins)."""
    df = df.copy()
    df[CAT_FEATURES] = df[CAT_FEATURES].fillna("Unknown")
    df["prod_price"] = df["prod_price"].fillna(df["prod_price"].median())
    df["color_match"] = (df["prod_color"].str.lower() == df["cust_pref_color"].str.lower()).astype(int)
    skin = {k: [c.lower() for c in v] for k, v in C.SKIN_TONE_COLORS.items()}
    df["skin_compat"] = [int(str(pc).lower() in skin.get(st, []))
                         for pc, st in zip(df["prod_color"], df["cust_skin_tone"])]
    df["gender_cat_match"] = (((df["cust_gender"] == "Female") & (df["prod_category"] == "Women")) |
                              ((df["cust_gender"] == "Male") & (df["prod_category"] == "Men"))).astype(int)
    if price_bins is None:
        qs = df["prod_price"].quantile([0.25, 0.5, 0.75]).values
        price_bins = [float(x) for x in qs]
    df["price_band"] = np.digitize(df["prod_price"], price_bins)
    return df, price_bins


def train():
    raw = pd.read_csv(C.RECO_DATA)
    df, price_bins = engineer(raw)
    X = df[CAT_FEATURES + ENG_FEATURES]
    y = df[TARGET].astype(int)

    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        ("num", StandardScaler(), ENG_FEATURES),
    ])
    model = Pipeline([
        ("prep", pre),
        # All eight Random Forest hyperparameters are set EXPLICITLY (not left to
        # defaults) for full documentation/reproducibility. This configuration was
        # confirmed near-optimal by RandomizedSearchCV (see hyperparameter_tuning.py).
        ("clf", RandomForestClassifier(
            n_estimators=300, max_depth=20, min_samples_split=2,
            min_samples_leaf=2, max_features="sqrt", bootstrap=True,
            criterion="gini", class_weight="balanced", random_state=42, n_jobs=-1)),
    ])
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    model.fit(X_tr, y_tr)
    pred = model.predict(X_te)

    # feature importance aggregated to base + engineered features
    clf = model.named_steps["clf"]
    names = model.named_steps["prep"].get_feature_names_out()
    agg = {}
    for n, v in zip(names, clf.feature_importances_):
        base = n.split("__", 1)[1]
        for c in CAT_FEATURES:
            if base.startswith(c + "_") or base == c:
                base = c
        agg[base] = agg.get(base, 0.0) + float(v)
    importance = {k: round(v, 4) for k, v in sorted(agg.items(), key=lambda x: -x[1])}

    metrics = {
        "algorithm": "RandomForestClassifier",
        "task": "product_recommendation (classification, feature-engineered + tuned)",
        "n_rows": int(len(df)), "n_train": int(len(X_tr)), "n_test": int(len(X_te)),
        "hyperparameters": {"n_estimators": 300, "max_depth": 20, "min_samples_split": 2,
                            "min_samples_leaf": 2, "max_features": "sqrt", "bootstrap": True,
                            "criterion": "gini", "class_weight": "balanced", "random_state": 42},
        "accuracy":  round(float(accuracy_score(y_te, pred)), 4),
        "precision": round(float(precision_score(y_te, pred, zero_division=0)), 4),
        "recall":    round(float(recall_score(y_te, pred, zero_division=0)), 4),
        "f1_score":  round(float(f1_score(y_te, pred, zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_te, pred).tolist(),
        "confusion_matrix_labels": {"rows": "actual [not-liked, liked]",
                                    "cols": "predicted [not-liked, liked]"},
        "feature_importance": importance,
        "engineered_features": ["color_match", "skin_compat", "gender_cat_match", "price_band"],
        "classification_report": classification_report(y_te, pred, zero_division=0, output_dict=True),
    }

    joblib.dump({"pipeline": model, "cat_features": CAT_FEATURES,
                 "eng_features": ENG_FEATURES, "price_bins": price_bins},
                C.RECO_MODEL, compress=3)
    with open(C.RECO_METRICS, "w") as f:
        json.dump(metrics, f, indent=2)
    return metrics


if __name__ == "__main__":
    m = train()
    print("── RECOMMENDER (feature-engineered + tuned) ──")
    for k in ("accuracy", "precision", "recall", "f1_score"):
        print(f"  {k:10s}: {m[k]}")
    print("  confusion :", m["confusion_matrix"])
    print("  importance:", m["feature_importance"])
