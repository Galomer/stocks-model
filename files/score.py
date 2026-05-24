"""
score.py — Assembles feature sub-scores into a weighted composite.

If learned_weights.json exists (from optimize_weights.py), applies learned
signs/weights plus affine calibration fit on historical excess returns.
Category scores and feature breakdowns always include every available signal
(even when learned weight is 0) so Sentiment and Market Breadth stay visible.
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
)

__all__ = [
    "compute_composite",
    "CATEGORY_ORDER",
    "FEATURE_CATEGORY",
    "CALIBRATION",
    "LEARNED_SIGNS",
    "LEARNED_WEIGHTS",
]


def _is_nan(v) -> bool:
    return v is None or (isinstance(v, float) and np.isnan(v))


def _signed_score(raw_score, use_learned: bool, name: str) -> float:
    sign = LEARNED_SIGNS.get(name, 1) if use_learned else 1
    return float(raw_score) * sign


def _category_scores_from_features(all_features: dict, use_learned: bool) -> dict:
    """Average every available feature in each category (for display, not composite weighting)."""
    out: dict = {}
    for cat in CATEGORY_ORDER:
        scores = []
        for name, raw in all_features.items():
            if FEATURE_CATEGORY.get(name) != cat or _is_nan(raw):
                continue
            scores.append(_signed_score(raw, use_learned, name))
        out[cat] = round(float(np.mean(scores)) * 100, 1) if scores else np.nan
    return out


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
        cat = FEATURE_CATEGORY.get(name, "other")
        if _is_nan(raw_score):
            contributions[name] = {
                "score": np.nan,
                "weight": w,
                "contribution": 0.0,
                "category": cat,
            }
            continue

        score = _signed_score(raw_score, use_learned, name)
        contrib = score * w if w > 0 else 0.0
        if w > 0:
            weighted_sum += score * w
            total_weight += w

        contributions[name] = {
            "score": round(score, 4),
            "weight": w,
            "contribution": round(contrib, 4),
            "category": cat,
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

    category_scores = _category_scores_from_features(all_features, use_learned)

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
