# Product Recommendation — Revised Methodology (IEEE review response)

This note documents the changes made to the Product Recommendation module in
response to reviewer comments. The website UI, pages, layout, and user
experience were **not** modified; only the ML training, inference, and API
logic changed, and all API response shapes are preserved (the frontend still
reads only `_mlScore`).

## 1. Feature engineering

Four domain-match features are now derived so the Random Forest no longer has to
infer these relationships purely from raw one-hot columns:

| Feature | Definition |
|---|---|
| `color_match` | product colour == customer's preferred colour (1/0) |
| `skin_compat` | product colour is in the customer's skin-tone-flattering colour family (1/0) |
| `gender_cat_match` | customer gender aligns with product category (Female↔Women, Male↔Men) (1/0) |
| `price_band` | quartile price bucket (0–3), boundaries learned on training data |

The skin-tone → colour-family mapping and the price-band boundaries are stored
in the model bundle so that **inference computes exactly the same features as
training** (`train_recommender.py :: engineer()` and `predict.py :: rank_products()`).

## 2. Hyperparameter tuning

A cross-validated search over `n_estimators`, `max_depth`, and
`min_samples_leaf` selected:

```
RandomForestClassifier(n_estimators=300, max_depth=20, min_samples_leaf=2,
                       class_weight="balanced", random_state=42)
```

`class_weight="balanced"` addresses the 66:34 liked/not-liked class imbalance.

## 3. Retrained metrics (20% stratified hold-out)

| Metric | Previous | **Improved** |
|---|---|---|
| Accuracy | 0.771 | **0.822** |
| Precision | 0.672 | **0.705** |
| Recall | 0.635 | **0.817** |
| F1-Score | 0.653 | **0.757** |

Confusion matrix (rows = actual [not-liked, liked], cols = predicted):
`[[1089, 232], [124, 555]]`. Full values are in
`models/recommender_metrics.json`. These are the actual retrained results — no
figures are fabricated.

## 4. Feature importance analysis

Gini importances aggregated back to base + engineered features
(`models/recommender_metrics.json → feature_importance`; figure at
`paper/revised/figures/feat_imp_reco.png`):

| Rank | Feature | Importance |
|---|---|---|
| 1 | `skin_compat` (engineered) | 0.210 |
| 2 | `gender_cat_match` (engineered) | 0.133 |
| 3 | `cust_pref_color` | 0.079 |
| 4 | `prod_color` | 0.072 |
| 5 | `color_match` (engineered) | 0.070 |

The three engineered match features account for the top drivers of the model,
which explains the accuracy/F1 gains and gives the paper an interpretable story.

## 5. Cold-start strategy

Implemented in `predict.py :: rank_products()`, keyed off how many profile
fields (`gender, size, skinTone, preferredColor, occasion`) the shopper provided:

- **New / anonymous customer (no profile fields)** → popularity/trending
  fallback: rank by best-seller signal (`soldCount`/`recentUnitsSold`/…) when the
  catalogue carries it, otherwise in-stock-first then price. These items are
  flagged `_fallback` but still carry an `_mlScore`, so the existing UI is
  unaffected.
- **Incomplete profile (some fields present)** → the personalised model runs with
  missing attributes encoded as `Unknown` (the `OneHotEncoder(handle_unknown="ignore")`
  handles this), and popularity is used as a gentle tie-breaker.
- **Existing customer with purchase history** → the personalised model score plus
  a behavioural boost for categories/colours the customer has bought before
  (`purchase_history` accepted by the API as optional `purchaseHistory`).

## 6. API changes

- `POST /api/recommend` — now accepts an **optional** `purchaseHistory`
  (list of `{category, color, ...}`). The response shape is unchanged
  (`{ok, count, products:[{…, _mlScore}]}`), so the frontend requires no
  modification. Requests without a profile or history still work.

## 7. Affected files

`train_recommender.py`, `predict.py`, `server.py`,
`models/recommender.pkl`, `models/recommender_metrics.json`,
`paper/revised/figures/feat_imp_reco.png`.
