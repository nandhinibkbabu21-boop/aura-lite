"""
Fully-automated ML pipeline orchestrator.

Running this ONE file does everything end-to-end:
    generate data  ->  preprocess  ->  train  ->  evaluate  ->  save models

It also tracks how many new real records have arrived and decides whether a
retrain is due (every RETRAIN_THRESHOLD records, or when forced).

Usage:
    python pipeline.py            # train only if models are missing / threshold hit
    python pipeline.py --force    # always retrain from scratch
"""
import os, sys, json, datetime as dt
import config as C
import generate_data
import train_recommender
import train_forecaster


def _load_state():
    if os.path.exists(C.STATE_FILE):
        with open(C.STATE_FILE) as f:
            return json.load(f)
    return {"last_trained": None, "records_since_train": 0, "runs": 0}


def _save_state(state):
    with open(C.STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def models_exist():
    return os.path.exists(C.RECO_MODEL) and os.path.exists(C.SALES_MODEL)


def add_new_records(n):
    """Call this whenever new real customers/orders arrive. Returns True if a
    retrain was triggered by crossing the threshold."""
    state = _load_state()
    state["records_since_train"] += int(n)
    _save_state(state)
    if state["records_since_train"] >= C.RETRAIN_THRESHOLD:
        run(force=True)
        return True
    return False


def run(force=False):
    """Generate → train → evaluate → save. Skips if models already exist and
    no retrain is due (unless force=True)."""
    state = _load_state()
    if models_exist() and not force and state["records_since_train"] < C.RETRAIN_THRESHOLD:
        print("[pipeline] models already trained; nothing to do.")
        return _current_metrics()

    print("[pipeline] 1/4  generating datasets …")
    generate_data.build_recommendation_dataset()
    generate_data.build_sales_dataset()

    print("[pipeline] 2/4  training recommender …")
    reco_m = train_recommender.train()

    print("[pipeline] 3/4  training forecaster …")
    sales_m = train_forecaster.train()

    print("[pipeline] 4/4  saving state …")
    state["last_trained"] = dt.datetime.now().isoformat(timespec="seconds")
    state["records_since_train"] = 0
    state["runs"] = state.get("runs", 0) + 1
    _save_state(state)

    return {"recommender": reco_m, "forecaster": sales_m, "state": state}


def _current_metrics():
    out = {}
    for name, path in (("recommender", C.RECO_METRICS), ("forecaster", C.SALES_METRICS)):
        if os.path.exists(path):
            with open(path) as f:
                out[name] = json.load(f)
    out["state"] = _load_state()
    return out


if __name__ == "__main__":
    force = "--force" in sys.argv
    result = run(force=force)
    print("\n════════════ PIPELINE COMPLETE ════════════")
    r = result.get("recommender", {})
    s = result.get("forecaster", {})
    if r:
        print(f"RECOMMENDER  acc={r.get('accuracy')}  prec={r.get('precision')}  "
              f"recall={r.get('recall')}  f1={r.get('f1_score')}")
    if s:
        print(f"FORECASTER   [{s.get('algorithm_selected')}]  "
              f"R2={s.get('r2_score')}  MAE={s.get('mae')}  RMSE={s.get('rmse')}")
