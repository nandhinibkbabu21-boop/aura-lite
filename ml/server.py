"""
Flask API server — the bridge between your JavaScript app and the ML models.

Your GitHub Pages site is STATIC (it cannot run Python), so the trained models
live here in a tiny Python service. The browser app calls these endpoints and
shows the results inside the EXISTING UI. If this server is offline, the app
simply falls back to its current rule-based logic — nothing breaks.

Endpoints:
  GET  /health            -> is the server + models alive?
  GET  /metrics           -> latest evaluation metrics for both models
  POST /api/recommend     -> body {customer:{...}, products:[...]} -> ranked products
  POST /api/forecast      -> body {recentDailyRevenue:[...]} -> future sales
  POST /api/retrain       -> header X-Admin-Secret -> retrain now (manual trigger)
  POST /api/notify-records-> body {count:N} -> auto-retrain when threshold crossed
"""
import os, json
from flask import Flask, request, jsonify
from flask_cors import CORS

import config as C
import pipeline
import predict

app = Flask(__name__)
CORS(app)                      # allow the browser app to call us

ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "change-me")

# Make sure models exist on boot (train once if missing — never every request)
if not pipeline.models_exist():
    pipeline.run(force=True)
predict.reload_models()


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "models_ready": pipeline.models_exist(),
        "state": pipeline._load_state(),
    })


@app.get("/metrics")
def metrics():
    return jsonify(pipeline._current_metrics())


@app.post("/api/recommend")
def api_recommend():
    body = request.get_json(force=True) or {}
    customer = body.get("customer") or {}
    products = body.get("products") or []
    ranked = predict.rank_products(customer, products)
    return jsonify({"ok": True, "count": len(ranked), "products": ranked})


@app.post("/api/forecast")
def api_forecast():
    body = request.get_json(force=True) or {}
    recent = body.get("recentDailyRevenue")
    days = int(body.get("daysAhead", 365))
    result = predict.forecast_sales(days_ahead=days, recent_daily_revenue=recent)
    if result is None:
        return jsonify({"ok": False, "error": "model not ready"}), 503
    return jsonify({"ok": True, "forecast": result})


@app.post("/api/retrain")
def api_retrain():
    if request.headers.get("X-Admin-Secret") != ADMIN_SECRET:
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    result = pipeline.run(force=True)
    predict.reload_models()
    return jsonify({"ok": True, "retrained": True,
                    "recommender": result.get("recommender", {}),
                    "forecaster": result.get("forecaster", {})})


@app.post("/api/notify-records")
def api_notify_records():
    """App calls this when new customers/orders are saved. Auto-retrains once
    RETRAIN_THRESHOLD new records have accumulated."""
    body = request.get_json(force=True) or {}
    n = int(body.get("count", 1))
    triggered = pipeline.add_new_records(n)
    if triggered:
        predict.reload_models()
    return jsonify({"ok": True, "retrained": triggered,
                    "state": pipeline._load_state()})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
