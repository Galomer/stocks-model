"""
optimize_weights.py — Learn weights/signs/calibration from historical_scores.

Previous approach correlated each raw feature with absolute forward returns.
That produced individually “correct” mean-reversion signs, but:
  • 2019–2026 was mostly a bull market → most 3m returns are positive
  • many features stack the same way → composite skews negative
  • scatter plot looks top-left even when bullish > bearish on average

New approach:
  1. Target EXCESS returns (sector − SPY) — “did this sector beat the market?”
  2. Cross-sectional demeaning within each date — rank sectors, not time-series level
  3. Category weight caps — stop 8 momentum signals from dominating
  4. Fit composite-level calibration (center + scale) on simulated scores
  5. Validate corr(composite, excess_return) and print before/after stats
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
    apply_calibration,
    raw_composite_from_features,
)

PAGE_SIZE = 1000
HORIZONS = ("fwd_return_1m", "fwd_return_3m")
HORIZON_W = (0.5, 0.5)
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
    excess_cols = [f"{h}{EXCESS_SUFFIX}" for h in HORIZONS]
    select = (
        "as_of_date,sector,features,composite,"
        + ",".join(list(HORIZONS) + excess_cols)
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


def blended_target(row: dict) -> float | None:
    total = 0.0
    wsum = 0.0
    for h, hw in zip(HORIZONS, HORIZON_W):
        v = target_return(row, h)
        if v is None:
            continue
        total += hw * v
        wsum += hw
    return total / wsum if wsum else None


def cross_sectional_pairs(
    rows: List[dict],
    feature_name: str,
) -> Tuple[List[float], List[float]]:
    """Within each date, demean feature and target across sectors."""
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
            t = blended_target(row)
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
    """Renormalize so no single category exceeds CATEGORY_WEIGHT_CAP of total."""
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
    calibration: dict | None = None,
) -> Tuple[List[float], List[float], List[float]]:
    """Return (raw_composites, calibrated_composites, blended_targets)."""
    raw_scores: List[float] = []
    cal_scores: List[float] = []
    targets: List[float] = []
    for row in rows:
        feats = row.get("features") or {}
        tgt = blended_target(row)
        raw = raw_composite_from_features(feats, weights, signs, use_learned=False)
        if raw is None or tgt is None:
            continue
        raw_scores.append(raw)
        cal = apply_calibration(raw, calibration) if calibration else raw
        cal_scores.append(cal)
        targets.append(tgt)
    return raw_scores, cal_scores, targets


def fit_calibration(raw_scores: List[float], targets: List[float]) -> dict:
    """Center/spread raw composites for display on [-100, 100] (rank-preserving)."""
    del targets  # correlation validated separately; not used for display scale
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
    calibration: dict,
) -> Dict[str, int]:
    """Flip signs on marginal features if composite excess corr improves."""
    signs = dict(signs)
    active = [n for n, w in weights.items() if w > 0]

    def score_corr(current_signs: Dict[str, int]) -> float:
        _, cal, tgts = simulate_rows(rows, weights, current_signs, calibration)
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
                print(f"    sign flip {name} → composite excess corr {best:+.3f}")
    return signs


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

    has_excess = sum(1 for r in rows if r.get("fwd_return_3m_excess") is not None)
    print(f"  rows with excess returns: {has_excess} / {len(rows)}")
    if has_excess < len(rows) * 0.5:
        print("  [warn] excess return column sparse — re-run backfill after migration")

    # ── Stage 1: per-feature cross-sectional weights on excess returns ────────
    feature_names = sorted({k for r in rows for k in (r.get("features") or {})})
    print(f"\n  Stage 1 — cross-sectional feature selection (target: excess 1m+3m blend)")
    print(f"  {'feature':<28s} {'n':>6s} {'x-corr':>8s} {'sign':>4s} {'wgt':>6s}")

    weights: Dict[str, float] = {}
    signs: Dict[str, int] = {}
    stats: Dict[str, dict] = {}

    for name in feature_names:
        xs, ys = cross_sectional_pairs(rows, name)
        corr = pearson(xs, ys)
        sign = 1 if corr >= 0 else -1
        mag = abs(corr)
        weight = 0.0 if mag < NOISE_FLOOR else max(min(mag, MAX_WEIGHT), MIN_WEIGHT)
        weights[name] = round(weight, 4)
        signs[name] = sign
        stats[name] = {"xs_corr": round(corr, 4), "n": len(xs), "mode": "cross_sectional_excess"}
        print(f"  {name:<28s} {len(xs):>6d} {corr:>+8.3f} {('+' if sign > 0 else '-'):>4s} {weight:>6.3f}")

    weights = apply_category_caps(weights)

    # ── Stage 2: composite calibration ────────────────────────────────────────
    print("\n  Stage 2 — composite calibration on simulated scores")
    raw_scores, _, targets = simulate_rows(rows, weights, signs)
    calibration = fit_calibration(raw_scores, targets)
    print(
        f"    raw_mean={calibration['raw_mean']:+.2f}  "
        f"raw_std={calibration['raw_std']:.2f}  "
        f"target_std={calibration['target_std']:.1f}"
    )

    # ── Stage 3: greedy sign refinement at composite level ──────────────────
    print("\n  Stage 3 — composite-level sign refinement")
    signs = greedy_sign_refine(rows, weights, signs, calibration)
    raw_scores, cal_scores, targets = simulate_rows(rows, weights, signs, calibration)

    corr_raw_abs = pearson(raw_scores, targets)
    corr_cal_excess = pearson(cal_scores, targets)
    corr_cal_spear = spearman(cal_scores, targets)

    # Absolute return correlation (for reference)
    abs_targets = []
    cal_for_abs = []
    for row in rows:
        feats = row.get("features") or {}
        t1 = row.get("fwd_return_3m")
        if t1 is None:
            continue
        raw = raw_composite_from_features(feats, weights, signs, use_learned=False)
        if raw is None:
            continue
        cal_for_abs.append(apply_calibration(raw, calibration))
        abs_targets.append(float(t1))
    corr_cal_abs = pearson(cal_for_abs, abs_targets)

    print(f"\n  Validation:")
    print(f"    corr(raw_composite, excess)     = {corr_raw_abs:+.3f}")
    print(f"    corr(calibrated, excess)        = {corr_cal_excess:+.3f}  (primary target)")
    print(f"    spearman(calibrated, excess)    = {corr_cal_spear:+.3f}")
    print(f"    corr(calibrated, absolute 3m)   = {corr_cal_abs:+.3f}")

    composite_stats = {
        "corr_excess_pearson": round(corr_cal_excess, 4),
        "corr_excess_spearman": round(corr_cal_spear, 4),
        "corr_absolute_3m": round(corr_cal_abs, 4),
        "n": len(cal_scores),
    }

    kept = sum(1 for w in weights.values() if w > 0)
    print(f"\n  Kept {kept} features with category cap {CATEGORY_WEIGHT_CAP:.0%}")

    out = {
        "version": 2,
        "target": "cross_sectional_excess_blend",
        "horizons": list(HORIZONS),
        "horizon_weights": list(HORIZON_W),
        "noise_floor": NOISE_FLOOR,
        "min_weight": MIN_WEIGHT,
        "max_weight": MAX_WEIGHT,
        "category_weight_cap": CATEGORY_WEIGHT_CAP,
        "weights": weights,
        "signs": signs,
        "calibration": calibration,
        "stats": stats,
        "composite_stats": composite_stats,
    }
    target = Path(__file__).parent / "learned_weights.json"
    target.write_text(json.dumps(out, indent=2))
    print(f"\n  Wrote {target}")


if __name__ == "__main__":
    main()
