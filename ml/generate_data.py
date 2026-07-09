"""
Synthetic dataset generator.

WHY THIS EXISTS
---------------
You only have ~21 products and few customers today, which is far too little
to train a real ML model. This script fabricates a large, REALISTIC dataset
that mirrors the exact fields your app already stores (gender, skin tone,
preferred colour, size, category, material, price, order dates, revenue...).

It produces two CSV files:
  1. recommendation_dataset.csv  → one row per (customer, product) pair with a
                                    like/not-like label  (classification)
  2. sales_dataset.csv           → one row per day with revenue & orders
                                    (regression / time-series)

If the admin exports REAL data (data/real_products.json, real_customers.json,
real_orders.json), those real records are folded in so the models learn from
genuine data wherever it exists — otherwise everything is synthetic.
"""
import os, json, random, datetime as dt
import numpy as np
import pandas as pd
import config as C

random.seed(42)
np.random.seed(42)


# ── helpers to load any REAL exported data ───────────────────────
def _load_json(name):
    path = os.path.join(C.DATA_DIR, name)
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            return []
    return []


# ── 1. RECOMMENDATION DATASET (classification) ───────────────────
def _make_products(n):
    """Create a synthetic product catalogue, seeded by any real products."""
    products = []
    real = _load_json("real_products.json")
    for p in real:                      # fold in the admin's real products
        cat = p.get("category", random.choice(C.CATEGORIES))
        products.append({
            "product_id":   p.get("id", f"real_{len(products)}"),
            "category":     cat,
            "subcategory":  p.get("subcategory", random.choice(C.SUBCATEGORIES.get(cat, ["Item"]))),
            "material":     p.get("material", random.choice(C.MATERIALS)),
            "color":        (p.get("colors", [{}])[0].get("name") if p.get("colors") else p.get("color")) or random.choice(C.COLORS),
            "price":        float(p.get("price", random.randint(300, 5000))),
        })
    while len(products) < n:            # top up with synthetic products
        cat = random.choice(C.CATEGORIES)
        products.append({
            "product_id":  f"P{len(products):04d}",
            "category":    cat,
            "subcategory": random.choice(C.SUBCATEGORIES[cat]),
            "material":    random.choice(C.MATERIALS),
            "color":       random.choice(C.COLORS),
            "price":       float(random.choice([299, 499, 699, 999, 1299, 1999, 2999, 4999])),
        })
    return products


def _make_customers(n):
    customers = []
    real = _load_json("real_customers.json")
    for c in real:
        customers.append({
            "gender":         c.get("gender", random.choice(C.GENDERS)),
            "size":           c.get("size", random.choice(C.SIZES)),
            "skin_tone":      c.get("skinTone", random.choice(C.SKIN_TONES)),
            "preferred_color": (c.get("preferredColor") or random.choice(C.COLORS)).lower(),
            "occasion":       c.get("occasion", random.choice(C.OCCASIONS)),
        })
    while len(customers) < n:
        customers.append({
            "gender":          random.choice(C.GENDERS),
            "size":            random.choice(C.SIZES),
            "skin_tone":       random.choice(C.SKIN_TONES),
            "preferred_color": random.choice(C.COLORS),
            "occasion":        random.choice(C.OCCASIONS),
        })
    return customers


def _like_probability(cust, prod):
    """
    Realistic 'would this customer like this product?' probability.
    Built from the SAME signals your rule-based engine already uses,
    plus randomness so the data is not perfectly separable (like real life).
    """
    score = 0.15                                 # small base interest
    # preferred colour match
    if cust["preferred_color"] in prod["color"] or prod["color"] in cust["preferred_color"]:
        score += 0.35
    # skin-tone flattering colour
    if prod["color"] in C.SKIN_TONE_COLORS.get(cust["skin_tone"], []):
        score += 0.28
    # gender ↔ category alignment
    if (cust["gender"] == "Female" and prod["category"] == "Women") or \
       (cust["gender"] == "Male"   and prod["category"] == "Men"):
        score += 0.28
    # occasion ↔ subcategory hints
    festive = prod["subcategory"] in ("Saree", "Lehenga", "Kurta", "Blazer", "Ethnic")
    if cust["occasion"] in ("Wedding", "Party", "Festival") and festive:
        score += 0.18
    # gentle price preference (mid-range sells most)
    if 400 <= prod["price"] <= 2000:
        score += 0.08
    score += np.random.normal(0, 0.08)           # mild noise → realistic overlap
    return max(0.0, min(1.0, score))


def build_recommendation_dataset():
    products  = _make_products(C.N_SYNTHETIC_PRODUCTS)
    customers = _make_customers(C.N_SYNTHETIC_CUSTOMERS)
    rows = []
    for ci, cust in enumerate(customers):
        # each customer is exposed to a random sample of products
        sample = random.sample(products, k=min(25, len(products)))
        for prod in sample:
            p = _like_probability(cust, prod)
            # like if the match score clears the bar; a few % random flips
            # keep the classes from being perfectly separable (real life)
            liked = int(p >= 0.50)
            if np.random.random() < 0.05:
                liked = 1 - liked
            rows.append({
                "customer_id":     ci,
                "cust_gender":     cust["gender"],
                "cust_size":       cust["size"],
                "cust_skin_tone":  cust["skin_tone"],
                "cust_pref_color": cust["preferred_color"],
                "cust_occasion":   cust["occasion"],
                "prod_category":   prod["category"],
                "prod_subcategory": prod["subcategory"],
                "prod_material":   prod["material"],
                "prod_color":      prod["color"],
                "prod_price":      prod["price"],
                "liked":           liked,
            })
    df = pd.DataFrame(rows)
    df.to_csv(C.RECO_DATA, index=False)
    return df


# ── 2. SALES DATASET (regression / time-series) ──────────────────
def _is_festival(d):
    return int((d.month, d.day) in C.FESTIVAL_DATES)


def build_sales_dataset():
    """
    Generate `SALES_HISTORY_DAYS` days of daily revenue with a realistic
    structure: upward trend + weekly pattern (weekends busier) +
    festival spikes + random noise. Seeded by real orders if available.
    """
    start = dt.date.today() - dt.timedelta(days=C.SALES_HISTORY_DAYS)
    rows = []

    # anchor the baseline to real orders if the admin exported them
    real_orders = _load_json("real_orders.json")
    base_rev = 4000.0
    if real_orders:
        totals = [float(o.get("total", 0)) for o in real_orders if o.get("total")]
        if totals:
            base_rev = max(2000.0, float(np.mean(totals)) * 3)   # a few orders/day

    for i in range(C.SALES_HISTORY_DAYS):
        d = start + dt.timedelta(days=i)
        trend      = base_rev + i * 3.0                     # slow growth
        weekly     = 1.0 + (0.35 if d.weekday() >= 5 else 0.0)   # weekend lift
        monthly    = 1.0 + 0.15 * np.sin(2 * np.pi * d.timetuple().tm_yday / 365)
        festival   = 2.2 if _is_festival(d) else 1.0
        noise      = np.random.normal(1.0, 0.10)
        revenue    = max(0.0, trend * weekly * monthly * festival * noise)
        orders     = max(0, int(round(revenue / max(700, base_rev / 3) + np.random.normal(0, 1))))
        rows.append({
            "date":         d.isoformat(),
            "day_of_week":  d.weekday(),
            "day_of_month": d.day,
            "month":        d.month,
            "day_of_year":  d.timetuple().tm_yday,
            "is_weekend":   int(d.weekday() >= 5),
            "is_festival":  _is_festival(d),
            "day_index":    i,                # captures the long-term trend
            "orders":       orders,
            "revenue":      round(revenue, 2),
        })
    df = pd.DataFrame(rows)
    df.to_csv(C.SALES_DATA, index=False)
    return df


# ── 3. STOCK / DEMAND DATASET (regression) ───────────────────────
def _festival_week(d):
    """1 if any festival date falls within this ISO week."""
    for off in range(7):
        day = d + dt.timedelta(days=off)
        if (day.month, day.day) in C.FESTIVAL_DATES:
            return 1
    return 0


def build_stock_dataset(n_weeks=104):
    """
    Predict how many UNITS of a product will sell NEXT WEEK, so the admin knows
    what to restock. One row per (product, week). Demand is driven by the SAME
    signals a shopkeeper uses: category popularity, price point, season/festival,
    and the product's own recent sales momentum (lag features). This is a
    regression problem → gives the R² / MAE / RMSE metrics you asked for.
    """
    products = _make_products(min(C.N_SYNTHETIC_PRODUCTS, 80))
    start = dt.date.today() - dt.timedelta(weeks=n_weeks)
    rows = []
    for prod in products:
        cat_pull   = C.CATEGORY_POPULARITY.get(prod["category"], 1.0)
        price_pull = 1.6 if prod["price"] <= 700 else (1.0 if prod["price"] <= 2000 else 0.6)
        base       = max(1.0, 6.0 * cat_pull * price_pull)   # baseline weekly units
        prev1, prev4 = base, base                             # lag seeds
        hist = [base, base, base, base]
        for w in range(n_weeks):
            wk_start = start + dt.timedelta(weeks=w)
            fest     = _festival_week(wk_start)
            seasonal = 1.0 + 0.20 * np.sin(2 * np.pi * (wk_start.timetuple().tm_yday) / 365)
            fest_mult = 2.0 if fest else 1.0
            noise    = np.random.normal(1.0, 0.15)
            demand   = max(0.0, base * seasonal * fest_mult * noise)
            avg_4wk  = float(np.mean(hist[-4:]))
            rows.append({
                "prod_category":     prod["category"],
                "prod_subcategory":  prod["subcategory"],
                "prod_price":        prod["price"],
                "month":             wk_start.month,
                "week_of_year":      wk_start.isocalendar()[1],
                "is_festival_week":  fest,
                "units_sold_last_week": round(prev1, 2),
                "avg_sales_4wk":     round(avg_4wk, 2),
                "current_stock":     max(0, int(round(avg_4wk * np.random.uniform(0.5, 2.0)))),
                "units_sold_next_week": round(demand, 2),   # ← TARGET
            })
            prev1 = demand
            hist.append(demand)
    df = pd.DataFrame(rows)
    df.to_csv(C.STOCK_DATA, index=False)
    return df


if __name__ == "__main__":
    r = build_recommendation_dataset()
    s = build_sales_dataset()
    k = build_stock_dataset()
    print(f"[generate_data] recommendation rows: {len(r):,}  ->  {C.RECO_DATA}")
    print(f"[generate_data] sales rows:          {len(s):,}  ->  {C.SALES_DATA}")
    print(f"[generate_data] stock rows:          {len(k):,}  ->  {C.STOCK_DATA}")
