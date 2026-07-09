# Where Machine Learning Is Working (Visible Guide)

This app uses **3 ML models** served by a Python/Flask backend deployed on Render
(`https://aura-lite-ml.onrender.com`). The frontend calls the models live and now
shows **visible ML indicators** so you can point to exactly where ML runs.

> The UI design, colors, layout and existing features are unchanged. Every ML
> element is *added on top* by `ml-client.js` and only appears when the ML server
> is connected (`backendConfig.mlUrl` is set). If the server is off, the app
> silently falls back to its rule-based behaviour — nothing breaks.

---

## 1. Files

### Modified
| File | What changed |
|------|--------------|
| `backend-config.js` | `mlUrl` points to the deployed Render backend. |
| `ml-client.js` | Added the **visible** ML indicators (AI recommendation label + confidence badges, forecast/stock model labels & explanations, global "AI Engine Active" pill). All additive. |
| `index.html` | Cache-bust version bump so browsers load the new `ml-client.js`. |

### New
| File | Purpose |
|------|---------|
| `ML_FEATURES.md` | This document / demo guide. |

> No page templates in `app.js` were redesigned. The ML markers already present
> (`data-ml-reco`, `data-ml-stock`, `#chart-revenue`) are the only hooks used.

---

## 2. The three ML features (where to see them)

### A. Product Recommendation — Customer shop page
- **Visible:** a **"🤖 AI Recommended For You"** label with the line *"Recommended
  based on your preferences, previous interactions, and product features."*, plus
  an **`AI xx%` confidence badge** on the top-right of each recommended card. The
  cards are also re-ordered by the model's score.
- **Model call:** `POST /api/recommend`, from `enhanceRecommendations()` in
  `ml-client.js`, triggered on the customer route.
- **Input sent:** the logged-in `customer` object and the in-stock `products`
  list (id, name, category, subcategory, price, quantity).
- **Output returned:** products sorted best-first, each with `_mlScore` (0–100
  confidence). Algorithm: **Random Forest Classifier**.
- **Frontend display:** cards are reordered to the model's ranking; `_mlScore`
  becomes the `AI xx%` badge; the label + explanation are inserted above the grid.

### B. Sales Forecasting — Admin ▸ Analytics
- **Visible:** a **"🔮 AI Sales Forecast"** card above the Revenue Trend chart
  showing **Tomorrow / Next 7 Days / Next 30 Days / Next 1 Year**, the line
  **"Model Used: Random Forest Regression"**, and a short training explanation.
- **Model call:** `POST /api/forecast`, from `enhanceForecast()`.
- **Input sent:** the shop's recent daily revenue (last ~30 days aggregated from
  real orders) and `daysAhead: 365`.
- **Training data / features:** historical daily sales; features are
  day-of-week, day-of-month, month, day-of-year, is_weekend, is_festival, and a
  trend index. Model: **Random Forest Regression** (with Linear Regression kept
  as a baseline; the better R² wins).
- **Frontend display:** the returned `next_day / next_7_days / next_30_days /
  next_365_days` values are formatted as ₹ and shown in the existing stat-card style.

### C. Stock Prediction — Admin ▸ Overview (Inventory)
- **Visible:** a **"📦 AI Stock Prediction"** card above *Shop & Bill Details*
  listing each product with **current stock, predicted weekly demand, recommended
  reorder quantity**, and a **status pill: Normal / Low Stock / Critical**.
- **Model call:** `POST /api/stock`, from `enhanceStock()`.
- **Input sent:** each product (category, subcategory, price, current quantity)
  plus recent units sold / 4-week average estimated from real orders.
- **How it works:** the model predicts **next-week demand** per product;
  **reorder quantity = predicted demand − current stock**; status is derived from
  how far stock is below demand. Model: **Random Forest Regression**.
- **Frontend display:** one row per product with the numbers and a coloured status pill.

### D. "AI Engine Active" indicator
- A small pill (bottom-left, green pulsing dot) shown on every page while the ML
  server is connected. It only signals that ML services are live — it is not a page.

---

## 3. Backend verification (all return HTTP 200)

```bash
BASE=https://aura-lite-ml.onrender.com

curl -X POST $BASE/api/recommend -H 'Content-Type: application/json' \
  -d '{"customer":{"id":"c1","gender":"Female","age":30},
       "products":[{"id":"p1","name":"Silk Saree","category":"Women","subcategory":"Saree","price":5000,"quantity":3}]}'
# -> {"ok":true,"products":[{"id":"p1",...,"_mlScore":69.0}]}

curl -X POST $BASE/api/forecast -H 'Content-Type: application/json' \
  -d '{"recentDailyRevenue":[12000,15000,9000,20000],"daysAhead":365}'
# -> {"ok":true,"forecast":{"algorithm":"RandomForestRegressor","next_day":...,"next_7_days":...,"next_30_days":...,"next_365_days":...}}

curl -X POST $BASE/api/stock -H 'Content-Type: application/json' \
  -d '{"products":[{"id":"p1","name":"Silk Saree","category":"Women","subcategory":"Saree","price":5000,"quantity":2,"recentUnitsSold":6,"avgSales4wk":6}]}'
# -> {"ok":true,"items":[{"id":"p1","current_stock":2,"predicted_demand":5.4,"reorder_qty":3,"urgency":"reorder"}]}
```

Frontend integration is confirmed in the browser Network tab: `POST /api/recommend`,
`/api/forecast`, `/api/stock` each return **200** from the Render URL.

---

## 4. How to demonstrate ML to your guide

1. **Show the engine is live:** open the site — the **"AI Engine Active"** pill
   (green dot) proves the frontend is connected to the ML backend.
2. **Recommendation:** open the customer shop page. Point to **"AI Recommended
   For You"** and the **`AI 81%` / `AI 63%`** confidence badges on the cards —
   these numbers come from the Random Forest Classifier, not hard-coded.
3. **Forecast:** log in as Admin ▸ **Analytics**. Show the **AI Sales Forecast**
   card (Tomorrow / 7 / 30 / 365 days) and the **"Model Used: Random Forest
   Regression"** line.
4. **Stock:** Admin ▸ **Overview**. Show the **AI Stock Prediction** card with
   demand, reorder quantities and **Critical / Low Stock** status pills.
5. **Prove it's live (optional):** open browser DevTools ▸ Network, reload, and
   show the three `POST` calls to `aura-lite-ml.onrender.com` returning **200**.

## 5. Simple demo flow (presentation script)

> "The app is connected to a machine-learning backend — you can see the *AI Engine
> Active* badge. On the shop page, products are ranked by a Random Forest
> classifier; each card shows the model's confidence, like *AI 81%*. In the admin
> Analytics page, a Random Forest regression model forecasts sales for tomorrow,
> the next week, month and year. In the inventory overview, a second regression
> model predicts next-week demand for every product and recommends reorder
> quantities with a stock status. Every one of these calls the live Python ML
> server — here are the 200 responses in the Network tab."

> Note: Render's free tier sleeps after ~15 min idle, so the **first** request may
> take 30–60s to warm up. Open the site a minute before presenting.
