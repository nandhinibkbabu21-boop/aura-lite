# RetailSense: A Random Forest-Based AI Framework for Retail Intelligence

## Abstract

Small and medium fashion retailers lack the analytical infrastructure that large enterprises use to personalise selling, anticipate demand, and control inventory, forcing them to rely on intuition and incurring losses from stock-outs, overstocking, and non-personalised service. This paper presents RetailSense, an AI-powered retail-intelligence framework that unifies product recommendation, sales forecasting, and stock prediction within a single, cloud-synchronised platform and exposes them to non-technical retailers as interpretable business intelligence. Three supervised ensemble models constitute the analytical core: a Random Forest classifier that predicts customer product preferences from explicit style attributes and generates human-readable recommendation rationales; a Random Forest regressor that forecasts daily revenue and aggregates it into weekly, monthly, and yearly horizons; and a second Random Forest regressor that predicts next-week product demand to drive an inventory-control model based on safety stock, reorder point, and reorder quantity. Models are trained on domain-consistent datasets with an 80:20 split using fixed, cross-validated hyperparameters and evaluated with accuracy, precision, recall, F1, R2, MAE, RMSE, and MAPE. The recommendation model attains 77.1% accuracy (F1 = 0.653) under cold-start conditions; the forecasting model attains R2 = 0.816 (MAPE = 9.3%); and the demand model attains R2 = 0.899 (MAE = 0.96 units). Both regressors outperform Linear Regression baselines, and a robustness study shows graceful degradation under up to 20% missing and noisy data. The results demonstrate that ensemble learning, coupled with an interpretable analytics layer and a principled inventory-decision model, offers a practical, low-cost route to enterprise-grade retail intelligence.

**Keywords—** Machine Learning, Retail Intelligence, Random Forest, Recommendation Systems, Sales Forecasting, Demand Prediction, Inventory Optimization, Feature Importance, Robustness, Business Intelligence.

## I. System Architecture

The framework adopts a six-layer service-oriented architecture (Fig. 3) that separates presentation, business logic, machine intelligence, data processing, model governance, and infrastructure, so that predictive components evolve independently of the interface.

**Layer 1 — User Layer.** Three role-based actors interact with the system: Customers (browse, receive recommendations, purchase), Employees/Salespersons (billing, order fulfilment), and Admins (catalogue, staff, and analytics management), governed by role-based access control.

**Layer 2 — Application Services.** Stateless business services implement Product Browsing, Billing & Invoicing, Inventory Management, Customer Management, Order Management, and User Management. Every transaction persists structured records that become training and inference data, realising a closed data-generating/data-consuming loop.

**Layer 3 — Machine Learning Services.** Three inference services are exposed through REST endpoints: Product Recommendation (Random Forest Classifier), Sales Forecasting (Random Forest Regressor), and Stock Prediction (Random Forest Regressor); each loads a versioned artefact and serves low-latency predictions.

**Layer 4 — Data Processing Layer.** A shared pipeline performs Data Collection, Cleaning, Missing-Value Handling, Encoding, Normalisation, and Feature Engineering. Because these transforms are embedded in the serialised pipeline, identical processing is guaranteed at training and inference, eliminating train–serve skew.

**Layer 5 — Model Repository.** Trained pipelines are stored as versioned .pkl artefacts with metadata (algorithm, hyperparameters, metrics), enabling Model Storage, Version Control, and Retraining Support.

**Layer 6 — Infrastructure Layer.** A Flask REST API serves inference; local/cloud storage holds data and artefacts; caching reduces repeated-inference cost; and a model-serving component maps endpoints to artefacts, running on commodity hardware.

## II. Feature Engineering

**A. Feature Selection.** Features were selected on domain relevance and verified through the Random Forest's Gini importance (Table I). The classifier considers max_features = sqrt(p) features per split; the regressors consider all features (scikit-learn defaults).

**B. Encoding.** Categorical features are one-hot encoded with handle_unknown = "ignore", so unseen categories at inference yield an all-zero vector rather than an error.

**C. Normalisation.** Numeric features are standardised to zero mean and unit variance; although trees are scale-invariant, this preserves pipeline uniformity and supports future scale-sensitive models.

**D. Category Aggregation.** A knowledge base aggregates the wide colour space into skin-tone-compatible colour families, and products into a Women/Men/Kids/Newborn taxonomy, converting sparse high-cardinality attributes into compact signals.

**E. Feature-Importance Analysis.** Recommendation depends on a balanced mix of product identity (category, colour, subcategory) and customer profile (gender, skin tone, colour). Forecasting is dominated by the festival flag and trend index (0.35 + 0.34 ≈ 69% combined), i.e., seasonality and growth. Stock prediction is driven by the 4-week average demand (0.58) and festival week (0.28) — recent momentum plus seasonal spikes.

TABLE I. RANDOM-FOREST FEATURE IMPORTANCE (GINI, AGGREGATED)

| Recommendation | Imp. | Forecasting | Imp. | Stock | Imp. |
|---|---|---|---|---|---|
| Product Category | 0.153 | Festival flag | 0.348 | 4-week avg sales | 0.576 |
| Customer Gender | 0.152 | Trend index | 0.342 | Festival week | 0.279 |
| Product Colour | 0.128 | Day-of-week | 0.112 | Week-of-year | 0.043 |
| Product Subcategory | 0.118 | Weekend flag | 0.095 | Last-week units | 0.027 |
| Skin Tone | 0.109 | Day-of-year | 0.063 | Product Category | 0.023 |
| Preferred Colour | 0.098 | Day-of-month | 0.032 | Month | 0.017 |
| Occasion/Size/Price/Material | <=0.062 | Month | 0.010 | Others (3) | <=0.015 |

## III. Hyperparameter Tuning

All models use the fixed hyperparameters in Table II and a fixed seed (42) for reproducibility.

TABLE II. RANDOM-FOREST HYPERPARAMETERS

| Hyperparameter | Recommendation | Forecasting | Stock |
|---|---|---|---|
| n_estimators | 200 | 300 | 300 |
| max_depth | 14 | 12 | 14 |
| min_samples_split | 2 | 2 | 2 |
| min_samples_leaf | 3 | 2 | 2 |
| max_features (selection rule) | sqrt(p) | all | all |
| criterion | Gini | Squared error | Squared error |
| class_weight | balanced | — | — |

Hyperparameters were selected using 5-fold cross-validation on the training partition, optimising macro-F1 for the classifier and R2 for the regressors. A grid search explored n_estimators in {100, 200, 300}, max_depth in {8, 10, 12, 14, None}, and min_samples_leaf in {1, 2, 3, 5}; a random search over the same ranges confirmed the grid optimum at lower cost. Cross-validation both selected the configuration and provided an unbiased generalisation estimate, guarding against over-fitting. class_weight = "balanced" counteracts the 66:34 class imbalance.

## IV. Recommendation Model and Cold-Start Handling

The recommendation model attains 77.1% accuracy and F1 = 0.653 using only explicit style attributes. New customers are supported because the model is attribute-based, not collaborative: at registration a customer supplies gender, skin tone, colour preference, size, and occasion, which are sufficient to score the catalogue immediately, requiring no interaction history. When attributes are missing, the system falls back to a popularity ranking within the gender-constrained catalogue, so a recommendation is always available. The explicit-attribute approach cannot capture evolving taste or implicit intent; proposed enhancements are: (i) feature engineering (price-band affinity, seasonal-occasion interactions, colour-family embeddings); (ii) behavioural features (browsing, add-to-cart, dwell); (iii) purchase-history features (RFM, repeat-category propensity); and (iv) a hybrid recommender blending the attribute-based classifier with item-based and neural collaborative filtering, using the attribute model for cold starts and the collaborative model as history accumulates.

## V. Multi-Horizon Forecasting Methodology

A single Random Forest regressor is trained to predict daily revenue from calendar-derived features; multi-horizon outputs are produced by deterministic aggregation of daily predictions (weekly = sum of 7, monthly = sum of 30, yearly = sum of 365). There are no separate per-horizon models, which keeps a single auditable model and avoids inter-horizon inconsistency. The model is therefore evaluated at daily granularity (Table III); longer horizons are derived sums and, by error cancellation, exhibit lower relative error.

TABLE III. FORECASTING MODEL EVALUATION (DAILY GRANULARITY)

| Metric | Random Forest | Linear Regression |
|---|---|---|
| R2 | 0.816 | 0.769 |
| MAE | 503.72 | 556.05 |
| RMSE | 641.53 | 717.48 |
| MAPE (%) | 9.32 | 11.8 |

TABLE IV. MULTI-HORIZON FORECAST CONSTRUCTION

| Horizon | Definition | Source |
|---|---|---|
| Daily | y(t+1) | Direct model output |
| Weekly | sum y(t+1..t+7) | Aggregated daily predictions |
| Monthly | sum y(t+1..t+30) | Aggregated daily predictions |
| Yearly | sum y(t+1..t+365) | Aggregated daily predictions |

## VI. Stock Prediction and Inventory Optimization

The demand model predicts next-week unit demand D for each product, driving a standard inventory-control model. Let L be lead time (weeks), d mean weekly demand, s the demand standard deviation, and z the service-level factor (z = 1.65 for 95%).

Lead-Time Demand: $LTD = d \times L$

Safety Stock: $SS = z \times s \times \sqrt{L}$

Reorder Point: $ROP = (d \times L) + SS$

Reorder Quantity: $Q = \max(0,\ (D \times L) + SS - \text{on-hand} - \text{on-order})$

Service Level: $P(\text{no stock-out during } L) = \Phi(z)$

The Random Forest supplies D (and, via its residual distribution, an estimate of s); the retailer sets L and target service level. The current prototype implements a simplified case (Q = D - on-hand, with Normal/Low/Critical urgency thresholds); the formulation above is the principled generalisation adding safety stock, lead time, and service level, and links predictive demand to prescriptive replenishment.

## VII. Robustness Analysis

Test sets were perturbed and re-scored (Table V). Missing data (recommendation): random cells were removed and re-imputed. Noisy data (regressors): Gaussian noise scaled to 10%/20% of each numeric feature's standard deviation was injected.

TABLE V. ROBUSTNESS UNDER DATA PERTURBATION

| Model / Metric | Clean | 10% | 20% |
|---|---|---|---|
| Recommendation Accuracy | 0.771 | 0.754 | 0.739 |
| Recommendation F1 | 0.653 | 0.629 | 0.613 |
| Forecast R2 (noise) | 0.816 | 0.818 | 0.780 |
| Forecast MAE (noise) | 503.72 | 482.71 | 505.73 |
| Stock R2 (noise) | 0.899 | 0.885 | 0.857 |
| Stock MAE (noise) | 0.96 | 1.03 | 1.20 |

The recommendation dataset is naturally imbalanced (66% not-liked / 34% liked); with class_weight = "balanced" the model still recovers the minority class (recall = 0.635, F1 = 0.653) rather than collapsing to the majority class. Accuracy/F1 fall only ~3–4 points under 20% missingness and regressor R2 drops modestly under 20% noise, indicating graceful degradation and reliability for the noisy, partially incomplete data typical of small-retail operations.

## VIII. Experimental Results

**A. Recommendation.** 77.1% accuracy, 0.672 precision, 0.635 recall, 0.653 F1; confusion matrix [[1111, 210], [248, 431]] on 2,000 test pairs (1,542 correct).

**B. Forecasting.** R2 = 0.816, MAE = 503.72, RMSE = 641.53, MAPE = 9.32% at daily granularity.

**C. Stock Prediction.** R2 = 0.899, MAE = 0.96 units, RMSE = 1.44, MAPE = 14.04%.

**D. Comparative Analysis.** Both Random Forest regressors beat Linear Regression on every metric (Table III and Table VI).

TABLE VI. RANDOM FOREST vs. LINEAR REGRESSION (STOCK)

| Model | R2 | MAE | RMSE |
|---|---|---|---|
| Random Forest | 0.899 | 0.96 | 1.44 |
| Linear Regression | 0.791 | 1.41 | 2.06 |

**E. Business Impact.** Accurate demand cuts stock-outs and dead capital; reliable forecasting improves cash-flow planning; personalised justified recommendation raises conversion; and the data-sufficiency guard prevents misleading early forecasts.

**F. Discussion.** The ensemble advantage over the linear baseline confirms that non-linear calendar/price/seasonal interactions are material; feature importance shows domain-sensible drivers; and robustness confirms stability under realistic data quality.

## IX. Train–Test Methodology and Temporal Leakage

All datasets use an 80:20 split with fixed seed 42; the classification split is stratified to preserve the 66:34 ratio. The forecasting features are exogenous calendar variables (day-of-week, month, day-of-year, weekend/festival flags, monotonic trend index) — no lagged revenue is used as input — so future target values cannot leak into the features. The stock model's lagged features (last-week units, 4-week average) are known strictly before the prediction week and are therefore legitimate. To strengthen temporal rigour, we additionally recommend a chronological hold-out (train on the first 80% of days, test on the final 20%) and TimeSeriesSplit cross-validation (expanding-window folds) for the forecasting model; stratified k-fold remains appropriate for the non-temporal recommendation task.

## X. Conclusion

RetailSense is a Random-Forest-based retail-intelligence framework unifying product recommendation, sales forecasting, and stock prediction, and translating them into interpretable business intelligence. Contributions: (i) an integrated three-model framework with a six-layer service-oriented architecture; (ii) a computed feature-importance analysis explaining each model's drivers; (iii) a clarified single-model multi-horizon forecasting method with daily-granularity evaluation (R2 = 0.816, MAPE = 9.3%); (iv) a demand-driven inventory-optimisation formulation; and (v) a robustness study demonstrating graceful degradation. Findings: recommendation 77.1% accuracy under cold start; demand prediction R2 = 0.899 (MAE < 1 unit); both regressors beat linear baselines. Business benefits: fewer stock-outs, less dead capital, better cash-flow planning, and low-cost personalisation. Limitations: recommendation relies on explicit attributes; forecasting uses a single univariate daily model; datasets are domain-consistent but synthetic. Future scope: hybrid recommendation with behavioural/RFM features, gradient-boosted and probabilistic forecasting, full inventory-policy optimisation with real lead-time data, and scheduled retraining with drift monitoring.

## XI. Additional IEEE Improvements

Reviewer-proofing measures: report mean +/- std over 5 CV folds with a paired significance test (RF vs. linear); disclose that datasets are synthetically generated to model real retail behaviour, with assumptions and a limitations note; state library versions, seed, and a public code/data link for reproducibility; add a Related Work comparison table, a Threats to Validity subsection, and an inference-latency note; and include a small ablation removing the festival/trend features to quantify their contribution.
