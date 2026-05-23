"""
score.py — Assembles feature sub-scores into a weighted composite.

Design decisions:
- Weights are normalized internally so adding or removing features
  doesn't require re-scaling all other weights by hand.
- NaN features are excluded from the weighted sum and their weight
  is redistributed proportionally across available features.
- The composite is scaled to [-100, 100] for intuitive readability.
"""

from typing import Optional
import numpy as np

from config import FEATURE_WEIGHTS

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

    Args:
        all_features: {feature_name: float_or_nan} — output of the build_*_features() calls
        weights:      {feature_name: float}          — from config.FEATURE_WEIGHTS

    Returns a dict with:
        composite      float [-100, 100] — the headline score
        contributions  dict  — per-feature breakdown with score, weight, contribution
        category_scores dict — average signed score per category
        available      int   — number of non-NaN features used
        coverage       float — fraction of configured features with data
    """
    total_weight = 0.0
    weighted_sum = 0.0
    contributions: dict = {}

    for name, raw_score in all_features.items():
        w = weights.get(name, 1.0)
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
        score = float(raw_score)
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

    # Per-category summary
    category_scores: dict = {}
    for cat in CATEGORY_ORDER:
        cat_scores = [
            v["score"] for v in contributions.values()
            if v["category"] == cat and not np.isnan(v["score"])
        ]
        category_scores[cat] = round(np.mean(cat_scores) * 100, 1) if cat_scores else np.nan

    available = sum(1 for v in contributions.values() if not np.isnan(v["score"]))
    configured = len([k for k, w in weights.items() if w > 0])
    coverage   = round(available / max(configured, 1), 2)

    return {
        "composite":       composite,
        "contributions":   contributions,
        "category_scores": category_scores,
        "available":       available,
        "coverage":        coverage,
    }
