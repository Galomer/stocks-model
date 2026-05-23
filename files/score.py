"""
score.py — Assembles feature sub-scores into a weighted composite.

If learned_weights.json exists (from optimize_weights.py), applies learned
signs/weights plus affine calibration fit on historical excess returns.
"""

import numpy as np

from config import FEATURE_WEIGHTS
from model_core import (
    CALIBRATION,
    CATEGORY_ORDER,
    FEATURE_CATEGORY,
    LEARNED_SIGNS,
    LEARNED_WEIGHTS,
    apply_calibration,
    raw_composite_from_features,
)

__all__ = [
    "compute_composite",
    "CATEGORY_ORDER",
    "FEATURE_CATEGORY",
    "CALIBRATION",
    "LEARNED_SIGNS",
    "LEARNED_WEIGHTS",
]


def compute_composite(
    all_features: dict,
    weights: dict = FEATURE_WEIGHTS,
) -> dict:
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
        raw_composite = np.nan
        composite = np.nan
    else:
        raw_composite = (weighted_sum / total_weight) * 100
        composite = (
            apply_calibration(raw_composite)
            if use_learned
            else float(np.clip(raw_composite, -100, 100))
        )
        composite = round(composite, 1)

    category_scores: dict = {}
    for cat in CATEGORY_ORDER:
        cat_scores = [
            v["score"] for v in contributions.values()
            if v["category"] == cat and not np.isnan(v["score"])
        ]
        category_scores[cat] = round(np.mean(cat_scores) * 100, 1) if cat_scores else np.nan

    available = sum(1 for v in contributions.values() if not np.isnan(v["score"]))
    configured = len([k for k, w in effective_weights.items() if w > 0])
    coverage = round(available / max(configured, 1), 2)

    return {
        "composite":       composite,
        "raw_composite":   round(raw_composite, 1) if not np.isnan(raw_composite) else np.nan,
        "contributions":   contributions,
        "category_scores": category_scores,
        "available":       available,
        "coverage":        coverage,
        "using_learned":   use_learned,
        "calibration":     CALIBRATION if use_learned else None,
    }
