"""
Product Recommendation model  (CLASSIFICATION).

ALGORITHM: Random Forest Classifier
WHY:
  * Your recommendation signals are a MIX of categories (gender, skin tone,
    colour, material) and numbers (price). Random Forest handles mixed data
    naturally and captures interactions like "warm skin tone + red saree".
  * It is accurate, hard to overfit, needs almost no tuning — ideal for a
    first ML project — and scales far better than KNN as your catalogue grows.
  * Framing recommendation as "will this customer LIKE this product? (yes/no)"
    turns it into a classification problem, which is exactly what produces the
    Accuracy / Precision / Recall / F1 / Confusion-Matrix metrics you asked for.

PIPELINE: encode categoricals (OneHot) + scale price -> RandomForest, all wrapped
in a single scikit-learn Pipeline so preprocessing is saved together with the model.
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
NUM_FEATURES = ["prod_price"]
TARGET       = "liked"


def train():
    # 1. LOAD
    df = pd.read_csv(C.RECO_DATA)

    # 2. PREPROCESS  (missing values -> filled; features selected)
    df[CAT_FEATURES] = df[CAT_FEATURES].fillna("Unknown")
    df[NUM_FEATURES] = df[NUM_FEATURES].fillna(df[NUM_FEATURES].median())
    X = df[CAT_FEATURES + NUM_FEATURES]
    y = df[TARGET].astype(int)

    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        ("num", StandardScaler(), NUM_FEATURES),
    ])

    model = Pipeline([
        ("prep", pre),
        ("clf", RandomForestClassifier(
            n_estimators=200, max_depth=14, min_samples_leaf=3,
            class_weight="balanced", random_state=42, n_jobs=-1)),
    ])

    # 3. SPLIT  (80% train / 20% test, keep class balance)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y)

    # 4. TRAIN
    model.fit(X_tr, y_tr)

    # 5. EVALUATE
    pred = model.predict(X_te)
    metrics = {
        "algorithm":  "RandomForestClassifier",
        "task":       "product_recommendation (classification)",
        "n_rows":     int(len(df)),
        "n_train":    int(len(X_tr)),
        "n_test":     int(len(X_te)),
        "accuracy":   round(float(accuracy_score(y_te, pred)), 4),
        "precision":  round(float(precision_score(y_te, pred, zero_division=0)), 4),
        "recall":     round(float(recall_score(y_te, pred, zero_division=0)), 4),
        "f1_score":   round(float(f1_score(y_te, pred, zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_te, pred).tolist(),
        "confusion_matrix_labels": {"rows": "actual [not-liked, liked]",
                                    "cols": "predicted [not-liked, liked]"},
        "classification_report": classification_report(y_te, pred, zero_division=0,
                                                        output_dict=True),
    }

    # 6. SAVE model + metrics
    joblib.dump(model, C.RECO_MODEL, compress=3)
    with open(C.RECO_METRICS, "w") as f:
        json.dump(metrics, f, indent=2)
    return metrics


if __name__ == "__main__":
    m = train()
    print("── RECOMMENDER TRAINED ──")
    for k in ("accuracy", "precision", "recall", "f1_score"):
        print(f"  {k:10s}: {m[k]}")
    print(f"  confusion  : {m['confusion_matrix']}")
    print(f"  model saved: {C.RECO_MODEL}")
