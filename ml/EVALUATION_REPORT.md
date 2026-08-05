# Consolidated ML Evaluation Report (IEEE review response)

This report is auto-generated from the trained-model metric files (`generate_eval_report.py`). All values are actual computed results.

## 1. Datasets

| Module | Dataset | Rows | Trees (n_estimators) | Max depth |
|---|---|---|---|---|
| Product Recommendation | recommendation_dataset.csv | 10,000 | 300 | 20 |
| Sales Forecasting (daily) | sales_dataset.csv | 730 | 300 | 12 |
| Stock Prediction | stock_dataset.csv | 8,320 | 300 | 14 |

**Total records across the three datasets: 19,050.** The forecaster also trains separate weekly and monthly models on the aggregated series (≈104 weeks, 24 months) derived from the 730 daily rows.

## 2. Final Random Forest hyperparameters

| Hyperparameter | Recommendation | Sales Forecasting | Stock Prediction |
|---|---|---|---|
| n_estimators | 300 | 300 | 300 |
| max_depth | 20 | 12 | 14 |
| min_samples_split | 2 | 2 | 2 |
| min_samples_leaf | 2 | 2 | 2 |
| max_features | sqrt | 1.0 | 1.0 |
| bootstrap | True | True | True |
| criterion | gini | squared_error | squared_error |
| random_state | 42 | 42 | 42 |
| class_weight | balanced | — | — |

Recommendation uses `RandomForestClassifier`; forecasting and stock use `RandomForestRegressor`. `max_features=1.0` for the regressors means every feature is considered at each split (the regressor default), which beat `sqrt`/`log2` on the hold-out set.

## 3. Updated evaluation metrics

### 3.1 Product Recommendation (classification)

| Accuracy | Precision | Recall | F1-Score |
|---|---|---|---|
| 0.822 | 0.7052 | 0.8174 | 0.7572 |

Confusion matrix (rows = actual [not-liked, liked]): `[[1089, 232], [124, 555]]`.

### 3.2 Sales Forecasting (regression, per horizon)

| Horizon | R² | MAE | RMSE | MAPE (%) | Test size |
|---|---|---|---|---|---|
| Daily | 0.6426 | 714.33 | 1180.82 | 8.84 | 146 |
| Weekly | 0.0733 | 4854.3 | 7806.68 | 13.82 | 21 |
| Monthly | 0.1206 | 53580.46 | 66779.48 | 63.09 | 5 |
| Yearly | derived from monthly (12-month sum) | | | | |

### 3.3 Stock Prediction (regression)

| Selected model | R² | MAE | RMSE | MAPE (%) |
|---|---|---|---|---|
| RandomForestRegressor | 0.8986 | 0.96 | 1.44 | 14.04 |

Baseline comparison — RandomForest R²=0.8986 vs LinearRegression R²=0.7912; the Random Forest was selected.

## 4. Robustness testing — before vs after

Each model is evaluated on the clean hold-out set (baseline) and on the same set after four data-quality perturbations. See `figures/robustness_comparison.png`.

### 4.1 Recommendation — F1 / Accuracy under perturbation

| Scenario | Accuracy | Precision | Recall | F1-Score |
|---|---|---|---|---|
| baseline | 0.822 | 0.7052 | 0.8174 | 0.7572 |
| missing | 0.799 | 0.69 | 0.7408 | 0.7145 |
| noise | 0.8155 | 0.6997 | 0.7997 | 0.7464 |
| outliers | 0.7835 | 0.6401 | 0.8277 | 0.7219 |
| imbalance | 0.8263 | 0.3444 | 0.8267 | 0.4863 |

### 4.2 Sales Forecasting (daily) — R²/MAE/RMSE/MAPE under perturbation

| Scenario | R² | MAE | RMSE | MAPE (%) |
|---|---|---|---|---|
| baseline | 0.6426 | 714.33 | 1180.82 | 8.84 |
| missing | 0.4115 | 930.89 | 1515.12 | 11.27 |
| noise | 0.5814 | 807.72 | 1277.81 | 10.06 |
| outliers | 0.4507 | 851.49 | 1463.75 | 11.07 |
| imbalance | 0.4284 | 1133.46 | 2112.97 | 9.32 |

### 4.2 Stock Prediction — R²/MAE/RMSE/MAPE under perturbation

| Scenario | R² | MAE | RMSE | MAPE (%) |
|---|---|---|---|---|
| baseline | 0.8986 | 0.96 | 1.44 | 14.04 |
| missing | 0.7294 | 1.43 | 2.35 | 20.84 |
| noise | 0.831 | 1.3 | 1.85 | 20.62 |
| outliers | 0.5734 | 1.56 | 2.95 | 25.87 |
| imbalance | 0.6586 | 1.85 | 2.46 | 12.69 |

**Interpretation.** All three models degrade gracefully rather than collapsing. The recommender keeps high recall even on a 90:10 imbalanced test (class_weight='balanced'); its precision falls there, as expected when negatives dominate. Outliers hurt the regressors most, which is why the inventory logic uses robust demand-variability estimates. The daily forecaster and stock model retain usable MAPE (≈9–26%) under every scenario.

## 5. Hyperparameter optimization summary

`RandomizedSearchCV` (reproducible, seed=42) explored n_estimators, max_depth, min_samples_split, min_samples_leaf, max_features and bootstrap. TimeSeriesSplit was used for the forecaster to avoid temporal leakage.

| Model | Scoring | Best CV score | Best params found | Decision |
|---|---|---|---|---|
| recommender | f1 (4-fold CV) | 0.7474 | n_estimators=100, min_samples_split=2, min_samples_leaf=3, max_features=sqrt, max_depth=20, bootstrap=True | Production config retained (search optimum ≈ production) |
| forecaster_daily | r2 (TimeSeriesSplit x4) | 0.4531 | n_estimators=200, min_samples_split=5, min_samples_leaf=1, max_features=log2, max_depth=12, bootstrap=False | Production retained (better on chronological hold-out) |
| stock | r2 (4-fold CV) | 0.8974 | n_estimators=200, min_samples_split=5, min_samples_leaf=1, max_features=log2, max_depth=12, bootstrap=False | Production retained (better on hold-out R²) |

The search did not beat the production hyperparameters on held-out data, so the existing configurations were retained and are now documented explicitly in the training scripts (no fabricated improvement).

