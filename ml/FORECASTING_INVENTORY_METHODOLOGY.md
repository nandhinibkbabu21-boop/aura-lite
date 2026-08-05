# Forecasting & Inventory — Revised Methodology (IEEE review response)

This note documents the changes made to the Sales Forecasting and Stock
Prediction modules in response to reviewer comments. The UI, pages, layout, and
user experience were **not** modified; only the ML training, inference, and API
logic changed.

## 1. Chronological (time-based) train–test split

The forecasting model previously used a random 80:20 split, which risks
**temporal leakage** for time-series data. It now uses a strictly
**chronological split**: the model is trained on the earliest 80% of the
timeline and evaluated on the most recent 20%, so no future information is seen
during training. Implementation: `train_forecaster.py` sorts records by date and
cuts at `int(0.8 * n)`. The stock model operates on cross-sectional
product–week records (each row independent), so a standard split remains
appropriate there.

## 2. Multi-horizon forecasting — separate models

Instead of a single daily model aggregated by summation, **separate Random
Forest regressors are trained per horizon** on the correspondingly aggregated
series:

- **Daily** — features: day-of-week, day-of-month, month, day-of-year, weekend,
  festival, trend index; target: daily revenue.
- **Weekly** — features: week index, month, week-of-year, festival-week; target:
  weekly revenue.
- **Monthly** — features: month index, month, festival-month; target: monthly
  revenue.
- **Yearly** — *derived* by summing the monthly model over 12 months. A
  dedicated yearly model is **not trainable** because a two-year dataset yields
  only two yearly observations; this is documented as a limitation.

Each model is trained with a chronological split. At inference, future feature
rows are generated for the next 30 days / 12 weeks / 12 months, and predictions
are anchored to the shop's recent real daily-revenue average (a single scale
factor is applied to all horizons to keep them mutually consistent).

## 3. Per-horizon evaluation metrics (chronological test set)

Reported in `models/forecaster_metrics.json` (`horizons` key):

| Horizon | R² | MAE | RMSE | MAPE | Test size |
|---|---|---|---|---|---|
| Daily | 0.643 | 714.33 | 1180.82 | 8.84% | 146 days |
| Weekly | 0.073 | 4854.30 | 7806.68 | 13.82% | 21 weeks |
| Monthly | 0.121 | 53580.46 | 66779.48 | 63.09% | 5 months |
| Yearly | derived from monthly (no independent test) | | | | |

**Honest interpretation.** The chronological split lowers the daily R² relative
to the earlier (leakage-prone) random split, which is the expected and correct
consequence of removing leakage; the daily MAPE nevertheless remains low
(8.84%). The weekly and monthly R² are limited by (i) the small number of
aggregated periods available in a two-year window (≈104 weeks, 24 months) and
(ii) the Random Forest's inability to extrapolate the monotonic trend index
beyond the training range. The daily model is therefore the most reliable basis,
and future work (gradient-boosted or trend-aware models, and more historical
data) is required for robust coarse-horizon forecasting.

## 4. Inventory decision logic

The naive rule (reorder = predicted demand − stock) is replaced by a standard
inventory-control policy driven by the demand forecast. With lead time *L*
(weeks), predicted weekly demand *d*, demand standard deviation *σ_d* (estimated
from the stock model's test RMSE), and service-level factor *z*:

- Lead-Time Demand: `LTD = d · L`
- Safety Stock: `SS = z · σ_d · √L`
- Reorder Point: `ROP = LTD + SS`
- Reorder Quantity (order-up-to): `Q = max(0, ROP − on-hand)`
- Service Level: `z` from the target cycle service level (default 95% → z = 1.645)

Urgency: `Critical` if on-hand ≤ SS; `Low` if on-hand ≤ ROP; `Watch` if on-hand
≤ 1.5·ROP; else `Normal`. Implemented in `predict.py :: predict_stock()`.

## 5. API changes

- `POST /api/forecast` — response unchanged in shape (`next_day`, `next_7_days`,
  `next_30_days`, `next_365_days`, `daily[]`, `weekly[]`, `monthly[]`,
  `algorithm`); values now come from the separate horizon models.
- `POST /api/stock` — now accepts optional `leadTime` (weeks, default 1) and
  `serviceLevel` (default 0.95). Each item additionally returns `safety_stock`,
  `reorder_point`, `lead_time`, and `service_level` alongside the existing
  `predicted_demand`, `current_stock`, `reorder_qty`, and `urgency`. Existing
  keys are preserved, so the frontend requires no changes.

## 6. Affected files

`train_forecaster.py`, `train_stock.py`, `predict.py`, `server.py`,
`models/forecaster.pkl`, `models/forecaster_metrics.json`,
`models/stock_predictor.pkl`, `models/stock_predictor_metrics.json`.
