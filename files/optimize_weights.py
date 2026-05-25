"""
optimize_weights.py — Learn per-horizon weights/signs/calibration from historical_scores.

Each prediction horizon (1m, 3m) gets its own weight bundle optimized against
cross-sectional excess returns for that horizon.
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import requests

from model_core import (
    CATEGORY_WEIGHT_CAP,
    FEATURE_CATEGORY,
    PREDICTION_HORIZONS,
    apply_calibration,
    raw_composite_from_features,
)

PAGE_SIZE = 1000
EXCESS_SUFFIX = "_excess"
NOISE_FLOOR = 0.03
MIN_WEIGHT = 0.05
MAX_WEIGHT = 0.35
MIN_OBS_PER_DATE = 6


def _strip_suffix(url: str) -> str:
    base = url.rstrip("/")
    for suffix in ("/rest/v1", "/rest", "/auth/v1", "/auth"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return base


def fetch_all_history(supabase_url: str, key: str) -> List[dict]:
    base = _strip_suffix(supabase_url)
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    excess_cols = [f"{h}{EXCESS_SUFFIX}" for h in PREDICTION_HORIZONS]
    select = (
        "as_of_date,sector,features,composite,"
        + ",".join(list(PREDICTION_HORIZONS) + excess_cols)
    )
    rows: List[dict] = []
    offset = 0
    while True:
        url = f"{base}/rest/v1/historical_scores?select={select}&order=as_of_date.asc"
        resp = requests.get(
            url,
            headers={**headers, "Range": f"{offset}-{offset + PAGE_SIZE - 1}"},
            timeout=60,
        )
        resp.raise_for_status()
        chunk = resp.json()
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def pearson(xs: List[float], ys: List[float]) -> float:
    n = len(xs)
    if n < 30:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    num = dx = dy = 0.0
    for x, y in zip(xs, ys):
        ex = x - mx
        ey = y - my
        num += ex * ey
        dx += ex * ex
        dy += ey * ey
    denom = (dx * dy) ** 0.5
    return num / denom if denom else 0.0


def spearman(xs: List[float], ys: List[float]) -> float:
    if len(xs) < 30:
        return 0.0
    rx = rankdata(xs)
    ry = rankdata(ys)
    return pearson(rx, ry)


def rankdata(vals: List[float]) -> List[float]:
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1
    return ranks


def target_return(row: dict, horizon: str) -> float | None:
    ex_key = f"{horizon}{EXCESS_SUFFIX}"
    if row.get(ex_key) is not None:
        return float(row[ex_key])
    if row.get(horizon) is not None:
        return float(row[horizon])
    return None


def cross_sectional_pairs(
    rows: List[dict],
    feature_name: str,
    horizon: str,
) -> Tuple[List[float], List[float]]:
    by_date: Dict[str, List[dict]] = defaultdict(list)
    for row in rows:
        by_date[row["as_of_date"]].append(row)

    xs: List[float] = []
    ys: List[float] = []
    for group in by_date.values():
        if len(group) < MIN_OBS_PER_DATE:
            continue
        feats: List[float] = []
        tgts: List[float] = []
        for row in group:
            f = (row.get("features") or {}).get(feature_name)
            t = target_return(row, horizon)
            if f is None or t is None:
                continue
            feats.append(float(f))
            tgts.append(float(t))
        if len(feats) < MIN_OBS_PER_DATE:
            continue
        fm = sum(feats) / len(feats)
        tm = sum(tgts) / len(tgts)
        for f, t in zip(feats, tgts):
            xs.append(f - fm)
            ys.append(t - tm)
    return xs, ys


def apply_category_caps(weights: Dict[str, float]) -> Dict[str, float]:
    if not weights:
        return weights
    by_cat: Dict[str, float] = defaultdict(float)
    for name, w in weights.items():
        if w > 0:
            by_cat[FEATURE_CATEGORY.get(name, "other")] += w

    capped = dict(weights)
    for cat, cat_sum in by_cat.items():
        if cat_sum <= 0:
            continue
        max_allowed = CATEGORY_WEIGHT_CAP * sum(weights.values())
        if cat_sum > max_allowed:
            scale = max_allowed / cat_sum
            for name, w in capped.items():
                if FEATURE_CATEGORY.get(name, "other") == cat and w > 0:
                    capped[name] = round(w * scale, 4)
    return capped


def simulate_rows(
    rows: List[dict],
    weights: Dict[str, float],
    signs: Dict[str, int],
    horizon: str,
    calibration: dict | None = None,
) -> Tuple[List[float], List[float], List[float]]:
    raw_scores: List[float] = []
    cal_scores: List[float] = []
    targets: List[float] = []
    for row in rows:
        feats = row.get("features") or {}
        tgt = target_return(row, horizon)
        raw = raw_composite_from_features(feats, weights, signs, use_learned=False)
        if raw is None or tgt is None:
            continue
        raw_scores.append(raw)
        cal = apply_calibration(raw, calibration) if calibration else raw
        cal_scores.append(cal)
        targets.append(tgt)
    return raw_scores, cal_scores, targets


def fit_calibration(raw_scores: List[float], targets: List[float]) -> dict:
    del targets
    if len(raw_scores) < 30:
        return {"raw_mean": 0.0, "raw_std": 1.0, "target_std": 30.0}
    raw_mean = sum(raw_scores) / len(raw_scores)
    variance = sum((x - raw_mean) ** 2 for x in raw_scores) / len(raw_scores)
    raw_std = max(variance ** 0.5, 1e-6)
    return {
        "raw_mean": round(float(raw_mean), 4),
        "raw_std": round(float(raw_std), 4),
        "target_std": 30.0,
    }


def greedy_sign_refine(
    rows: List[dict],
    weights: Dict[str, float],
    signs: Dict[str, int],
    horizon: str,
    calibration: dict,
) -> Dict[str, int]:
    signs = dict(signs)
    active = [n for n, w in weights.items() if w > 0]

    def score_corr(current_signs: Dict[str, int]) -> float:
        _, cal, tgts = simulate_rows(rows, weights, current_signs, horizon, calibration)
        return pearson(cal, tgts)

    best = score_corr(signs)
    improved = True
    while improved:
        improved = False
        for name in active:
            trial = dict(signs)
            trial[name] = -signs[name]
            c = score_corr(trial)
            if c > best + 0.002:
                signs = trial
                best = c
                improved = True
                print(f"    sign flip {name} → {horizon} excess corr {best:+.3f}")
    return signs


def optimize_horizon(rows: List[dict], horizon: str, feature_names: List[str]) -> dict:
    label = horizon.replace("fwd_return_", "").upper()
    print(f"\n{'=' * 60}")
    print(f"  Optimizing prediction horizon: {label} ({horizon})")
    print(f"{'=' * 60}")
    print(f"  {'feature':<28s} {'n':>6s} {'x-corr':>8s} {'sign':>4s} {'wgt':>6s}")

    weights: Dict[str, float] = {}
    signs: Dict[str, int] = {}
    stats: Dict[str, dict] = {}

    for name in feature_names:
        xs, ys = cross_sectional_pairs(rows, name, horizon)
        corr = pearson(xs, ys)
        sign = 1 if corr >= 0 else -1
        mag = abs(corr)
        weight = 0.0 if mag < NOISE_FLOOR else max(min(mag, MAX_WEIGHT), MIN_WEIGHT)
        weights[name] = round(weight, 4)
        signs[name] = sign
        stats[name] = {"xs_corr": round(corr, 4), "n": len(xs), "mode": "cross_sectional_excess"}
        print(f"  {name:<28s} {len(xs):>6d} {corr:>+8.3f} {('+' if sign > 0 else '-'):>4s} {weight:>6.3f}")

    weights = apply_category_caps(weights)

    print("\n  Calibration")
    raw_scores, _, _ = simulate_rows(rows, weights, signs, horizon)
    calibration = fit_calibration(raw_scores, [])
    print(
        f"    raw_mean={calibration['raw_mean']:+.2f}  "
        f"raw_std={calibration['raw_std']:.2f}  "
        f"target_std={calibration['target_std']:.1f}"
    )

    print("\n  Sign refinement")
    signs = greedy_sign_refine(rows, weights, signs, horizon, calibration)
    raw_scores, cal_scores, targets = simulate_rows(rows, weights, signs, horizon, calibration)

    corr_cal_excess = pearson(cal_scores, targets)
    corr_cal_spear = spearman(cal_scores, targets)

    abs_targets = []
    cal_for_abs = []
    for row in rows:
        feats = row.get("features") or {}
        t1 = row.get(horizon)
        if t1 is None:
            continue
        raw = raw_composite_from_features(feats, weights, signs, use_learned=False)
        if raw is None:
            continue
        cal_for_abs.append(apply_calibration(raw, calibration))
        abs_targets.append(float(t1))
    corr_cal_abs = pearson(cal_for_abs, abs_targets)

    print(f"\n  Validation ({label}):")
    print(f"    corr(calibrated, excess)     = {corr_cal_excess:+.3f}")
    print(f"    spearman(calibrated, excess) = {corr_cal_spear:+.3f}")
    print(f"    corr(calibrated, absolute)   = {corr_cal_abs:+.3f}")

    kept = sum(1 for w in weights.values() if w > 0)
    print(f"  Kept {kept} features")

    return {
        "horizon": horizon,
        "weights": weights,
        "signs": signs,
        "calibration": calibration,
        "stats": stats,
        "composite_stats": {
            "corr_excess_pearson": round(corr_cal_excess, 4),
            "corr_excess_spearman": round(corr_cal_spear, 4),
            "corr_absolute": round(corr_cal_abs, 4),
            "n": len(cal_scores),
        },
    }


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("[error] SUPABASE_URL and SUPABASE_SERVICE_KEY required")
        sys.exit(1)

    print("\n[optimize_weights] fetching history ...")
    rows = fetch_all_history(url, key)
    rows = [r for r in rows if r.get("features")]
    print(f"  {len(rows)} rows with features")
    if rows:
        print(f"  date range: {rows[0]['as_of_date']} → {rows[-1]['as_of_date']}")

    feature_names = sorted({k for r in rows for k in (r.get("features") or {})})

    by_horizon = {}
    for horizon in PREDICTION_HORIZONS:
        by_horizon[horizon] = optimize_horizon(rows, horizon, feature_names)

    default = by_horizon["fwd_return_3m"]

    out = {
        "version": 3,
        "target": "cross_sectional_excess_per_horizon",
        "prediction_horizons": list(PREDICTION_HORIZONS),
        "default_horizon": "fwd_return_3m",
        "noise_floor": NOISE_FLOOR,
        "min_weight": MIN_WEIGHT,
        "max_weight": MAX_WEIGHT,
        "category_weight_cap": CATEGORY_WEIGHT_CAP,
        "by_horizon": by_horizon,
        # Legacy top-level keys → 3m bundle for backward compatibility.
        "weights": default["weights"],
        "signs": default["signs"],
        "calibration": default["calibration"],
        "stats": default["stats"],
        "composite_stats": default["composite_stats"],
    }

    target = Path(__file__).parent / "learned_weights.json"
    target.write_text(json.dumps(out, indent=2))
    print(f"\n  Wrote {target}")


if __name__ == "__main__":
    main()
