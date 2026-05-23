"""
score.py — Assembles feature sub-scores into a weighted composite.

Design decisions:
- Weights are normalized internally so adding or removing features
  doesn't require re-scaling all other weights by hand.
- NaN features are excluded from the weighted sum and their weight
  is redistributed proportionally across available features.
- The composite is scaled to [-100, 100] for intuitive readability.

If a `learned_weights.json` file exists alongside this script (produced by
`optimize_weights.py`), each feature's per-observation contribution is
multiplied by the LEARNED SIGN — features that historically predicted in the
opposite direction of how `features.py` signed them get flipped here, before
the weighted average is taken.
"""

import json
from pathlib import Path
from typing import Optional
import numpy as np

from config import FEATURE_WEIGHTS

# ── Optional: load learned weights/signs from disk ────────────────────────
_LEARNED: dict = {}
_lw_path = Path(__file__).parent / "learned_weights.json"
if _lw_path.exists():
    try:
        _LEARNED = json.loads(_lw_path.read_text())
    except Exception:
        _LEARNED = {}

LEARNED_SIGNS:   dict = _LEARNED.get("signs",   {})
LEARNED_WEIGHTS: dict = _LEARNED.get("weights", {})

# ── Category metadata (used for display grouping) ────────────────────────
FEATURE_CATEGORY: dict = {
    "price_vs_50dma":        "momentum",
    "price_vs_200dma":       "momentum",
    "roc_1m":                "momentum",
    "roc_3m":                "momentum",
    "roc_6m":                "momentum",
    "relative_strength_3m":  "momentum",
    "rsi":                   "momentum",
    "yield_curve_slope":     "macro",
    "yield_curve_chg_1m":    "macro",
    "real_yield_level":      "macro",
    "hy_spread_level":       "macro",
    "hy_spread_chg_1m":      "macro",
    "ig_spread_level":       "macro",
    "usd_change_3m":         "macro",
    "commodity_change_3m":   "macro",
    "vix_level":             "sentiment",
    "vix_term_structure":    "sentiment",
    "fear_greed":            "sentiment",
    "cyclical_vs_defensive": "regime",
    "sector_vs_market_corr": "regime",
}

CATEGORY_ORDER = ["momentum", "macro", "sentiment", "regime"]


def compute_composite(
    all_features: dict,
    weights: dict = FEATURE_WEIGHTS,
) -> dict:
    """
    Combine signed feature sub-scores into a single weighted composite.

    If learned weights/signs are present, they OVERRIDE both the static
    `weights` argument and the original signing in `features.py`. This is the
    backtest-fitted runtime path. Otherwise the original equal-weight model
    is used (useful for backfilling fresh history).

    Args:
        all_features: {feature_name: float_or_nan} — output of build_*_features()
        weights:      {feature_name: float}          — from config.FEATURE_WEIGHTS

    Returns a dict with:
        composite      float [-100, 100] — the headline score
        contributions  dict  — per-feature breakdown with score (after sign flip), weight, contribution
        category_scores dict — average signed score per category
        available      int   — number of non-NaN features used
        coverage       float — fraction of configured features with data
    """
    use_learned = bool(LEARNED_WEIGHTS)
    effective_weights = LEARNED_WEIGHTS if use_learned else weights

    total_weight = 0.0
    weighted_sum = 0.0
    contributions: dict = {}

    for name, raw_score in all_features.items():
        w = effective_weights.get(name, 1.0 if not use_learned else 0.0)
        if w == 0:
            continue
        is_nan = (raw_score is None) or (isinstance(raw_score, float) and np.isnan(raw_score))
        if is_nan:
            contributions[name] = {
                "score": np.nan,
                "weight": w,
                "contribution": 0.0,
                "category": FEATURE_CATEGORY.get(name, "other"),
            }
            continue
        sign = LEARNED_SIGNS.get(name, 1) if use_learned else 1
        score = float(raw_score) * sign
        contrib = score * w
        weighted_sum += contrib
        total_weight += w
        contributions[name] = {
            "score": round(score, 4),
            "weight": w,
            "contribution": round(contrib, 4),
            "category": FEATURE_CATEGORY.get(name, "other"),
        }

    if total_weight == 0:
        composite = np.nan
    else:
        composite = round((weighted_sum / total_weight) * 100, 1)

    # Per-category summary (uses sign-adjusted scores)
    category_scores: dict = {}
    for cat in CATEGORY_ORDER:
        cat_scores = [
            v["score"] for v in contributions.values()
            if v["category"] == cat and not np.isnan(v["score"])
        ]
        category_scores[cat] = round(np.mean(cat_scores) * 100, 1) if cat_scores else np.nan

    available = sum(1 for v in contributions.values() if not np.isnan(v["score"]))
    configured = len([k for k, w in effective_weights.items() if w > 0])
    coverage   = round(available / max(configured, 1), 2)

    return {
        "composite":       composite,
        "contributions":   contributions,
        "category_scores": category_scores,
        "available":       available,
        "coverage":        coverage,
        "using_learned":   use_learned,
    }
