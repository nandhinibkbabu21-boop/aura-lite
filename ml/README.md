# Zara Aura — Machine Learning Module

This folder adds two ML features to the boutique app **without changing the
existing UI**:

1. **Product Recommendation** — ranks products for each customer (classification)
2. **Sales Forecasting** — predicts future daily/weekly/monthly/yearly revenue (regression)

The web app (GitHub Pages) is static and cannot run Python, so the trained
models live in a tiny Flask server here. The browser calls it and shows results
inside the **existing** screens. If this server is off, the app silently falls
back to its current rule-based logic — nothing breaks.

---

## 📁 Files — what each one does

| File | Purpose |
|------|---------|
| `config.py` | All settings in one place: paths, dataset sizes, retrain threshold, domain vocabulary (colours, skin tones, festivals). |
| `generate_data.py` | Builds a large **realistic synthetic dataset** matching your real fields (gender, skin tone, colour, category, price, order dates). Folds in real data if exported. |
| `train_recommender.py` | Trains the **Random Forest Classifier** for recommendations. Preprocess → split → train → evaluate (Accuracy/Precision/Recall/F1/Confusion Matrix) → save. |
| `train_forecaster.py` | Trains a **Random Forest Regressor** (with Linear Regression baseline) for sales. Evaluates R²/MAE/RMSE, keeps the better model. |
| `predict.py` | Loads the saved models and turns them into live predictions (ranked products, future sales). |
| `pipeline.py` | **One command runs everything**: generate → preprocess → train → evaluate → save. Also handles auto-retrain threshold. |
| `server.py` | Flask API the web app calls: `/api/recommend`, `/api/forecast`, `/api/retrain`, `/api/notify-records`, `/health`, `/metrics`. |
| `requirements.txt` | Python dependencies. |
| `Procfile`, `render.yaml` | Deployment config for Render.com (free). |
| `data/` | Generated CSV datasets (created on first run). |
| `models/` | Saved `.pkl` models + `*_metrics.json` (created on first run). |

**In the web project (outside this folder):**

| File | Change |
|------|--------|
| `ml-client.js` | NEW. Bridge that calls this server and enhances the UI. Dormant until `mlUrl` is set. |
| `backend-config.js` | Added one field: `mlUrl`. |
| `index.html` | Added one line: loads `ml-client.js`. |
| `app.js` | Added a 4-line hook in `postRender()` + two `data-ml-reco` markers. Purely additive. |

---

## ▶️ How to run locally

```bash
cd ml
python3 -m venv venv
venv/bin/pip install -r requirements.txt

# Train everything (generates data, trains, evaluates, saves models):
venv/bin/python pipeline.py --force

# Start the API server:
venv/bin/python server.py       # http://localhost:5001
```

Then in `backend-config.js` set `mlUrl: 'http://localhost:5001'` and open the app.

---

## 🔄 Retraining

- **Automatic:** every `RETRAIN_THRESHOLD` (default **100**) new records. The app
  calls `/api/notify-records` when customers/orders are saved; when the count
  crosses the threshold the server retrains and reloads the models.
- **Manual (admin):** `POST /api/retrain` with header `X-Admin-Secret: <secret>`.

Models are saved to `models/*.pkl`, so restarting the server **never retrains** —
it just loads the saved models.

---

## 🚀 Deploy (free)

1. Push this repo to GitHub.
2. On **render.com** → New → **Blueprint** → select the repo (it reads `render.yaml`).
3. Set `ADMIN_SECRET` to a private value → Deploy.
4. Copy the live URL (e.g. `https://aura-lite-ml.onrender.com`) into
   `backend-config.js` → `mlUrl`, commit, push. Done — the app now uses ML.
