"""
Central configuration for the Zara Aura ML pipeline.

Everything the pipeline needs (paths, dataset sizes, retrain threshold)
lives here so you can tune behaviour in ONE place without touching logic.
"""
import os

# ── Folder layout ────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(BASE_DIR, "data")     # generated datasets (CSV)
MODEL_DIR  = os.path.join(BASE_DIR, "models")   # saved .pkl models + metrics
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

# ── Dataset files ────────────────────────────────────────────────
RECO_DATA   = os.path.join(DATA_DIR, "recommendation_dataset.csv")
SALES_DATA  = os.path.join(DATA_DIR, "sales_dataset.csv")
STOCK_DATA  = os.path.join(DATA_DIR, "stock_dataset.csv")

# ── Saved model + metric files ───────────────────────────────────
RECO_MODEL      = os.path.join(MODEL_DIR, "recommender.pkl")
RECO_METRICS    = os.path.join(MODEL_DIR, "recommender_metrics.json")
SALES_MODEL     = os.path.join(MODEL_DIR, "forecaster.pkl")
SALES_METRICS   = os.path.join(MODEL_DIR, "forecaster_metrics.json")
STOCK_MODEL     = os.path.join(MODEL_DIR, "stock_predictor.pkl")
STOCK_METRICS   = os.path.join(MODEL_DIR, "stock_predictor_metrics.json")
STATE_FILE      = os.path.join(MODEL_DIR, "pipeline_state.json")

# ── Synthetic data sizes ─────────────────────────────────────────
N_SYNTHETIC_CUSTOMERS = 400     # fake shoppers for recommendation training
N_SYNTHETIC_PRODUCTS  = 120     # fake catalogue (your 21 real ones + synthetic)
SALES_HISTORY_DAYS    = 730     # 2 years of daily sales for forecasting

# ── Retraining policy ────────────────────────────────────────────
# Retrain automatically once this many NEW real records have arrived
RETRAIN_THRESHOLD = int(os.environ.get("RETRAIN_THRESHOLD", "100"))

# ── Domain vocabulary (mirrors the values used in your app.js) ────
CATEGORIES   = ["Men", "Women", "Kids", "Newborn"]
GENDERS      = ["Male", "Female"]
SKIN_TONES   = ["Fair", "Light", "Medium", "Warm", "Dark", "Deep"]
OCCASIONS    = ["Casual", "Wedding", "Party", "Festival", "Office", "Daily"]
MATERIALS    = ["Cotton", "Silk", "Linen", "Denim", "Wool", "Rayon", "Georgette"]
SIZES        = ["XS", "S", "M", "L", "XL", "XXL", "Free Size"]
COLORS       = ["white", "cream", "pink", "red", "blue", "green", "yellow",
                "black", "gold", "coral", "olive", "royal blue", "magenta",
                "peach", "lavender", "mustard", "teal", "burgundy", "navy"]
SUBCATEGORIES = {
    "Men":     ["Shirt", "T-Shirt", "Jeans", "Trousers", "Kurta", "Blazer"],
    "Women":   ["Saree", "Kurti", "Dress", "Top", "Lehenga", "Salwar"],
    "Kids":    ["Frock", "T-Shirt", "Shorts", "Ethnic"],
    "Newborn": ["Romper", "Onesie", "Set"],
}

# Skin-tone → flattering colour families (same idea as SKIN_TONE_COLORS in app.js)
SKIN_TONE_COLORS = {
    "Fair":   ["white", "cream", "pink", "lavender", "peach"],
    "Light":  ["white", "cream", "blue", "green", "pink", "coral", "peach"],
    "Medium": ["orange", "coral", "olive", "teal", "mustard", "burgundy"],
    "Warm":   ["gold", "orange", "red", "coral", "olive", "burgundy", "mustard"],
    "Dark":   ["red", "royal blue", "magenta", "yellow", "white", "coral"],
    "Deep":   ["magenta", "royal blue", "white", "gold", "yellow"],
}

# Relative weekly demand pull per category (used to synthesise stock demand)
CATEGORY_POPULARITY = {
    "Women":   1.35,
    "Men":     1.00,
    "Kids":    0.80,
    "Newborn": 0.55,
}

# Indian festival / peak-sale dates (month, day) that spike textile sales
FESTIVAL_DATES = [
    (1, 14), (1, 15),    # Pongal
    (3, 8),              # Holi / spring
    (4, 14),             # Tamil New Year
    (8, 15),             # Independence + Onam season
    (9, 7),              # Onam / Vinayagar
    (10, 12), (10, 24),  # Dussehra
    (11, 1), (11, 12),   # Diwali (peak)
    (12, 25), (12, 31),  # Christmas / New Year
]
