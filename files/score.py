"""
score.py — Assembles feature sub-scores into weighted composites.

Supports separate 1-month and 3-month forward predictions (each with its own
learned weights from optimize_weights.py). Category breakdowns use the default
(3-month) signs for display consistency.
"""

import numpy as np

from typing import Optional

from config import FEATURE_WEIGHTS
from model_core import (
    CALIBRATION,
    CATEGORY_ORDER,
    DEFAULT_PREDICTION_HORIZON,
    FEATURE_CATEGORY,
    LEARNED_SIGNS,
    LEARNED_WEIGHTS,
    PREDICTION_HORIZONS,
    apply_calibration,
    get_horizon_bundle,
    raw_composite_from_features,
)

__all__ = [
    "compute_composite",
    "compute_all_composites",
    "CATEGORY_ORDER",
    "FEATURE_CATEGORY",
    "CALIBRATION",
    "LEARNED_SIGNS",
    "LEARNED_WEIGHTS",
    "PREDICTION_HORIZONS",
    "DEFAULT_PREDICTION_HORIZON",
]


def _is_nan(v) -> bool:
    return v is None or (isinstance(v, float) and np.isnan(v))


def _signed_score(raw_score, sign: int) -> float:
    return float(raw_score) * sign


def _category_scores_from_features(all_features: dict, signs: dict) -> dict:
    """Average every available feature in each category (for display)."""
    out: dict = {}
    for cat in CATEGORY_ORDER:
        scores = []
        for name, raw in all_features.items():
            if FEATURE_CATEGORY.get(name) != cat or _is_nan(raw):
                continue
            sign = signs.get(name, 1)
            scores.append(_signed_score(raw, sign))
        out[cat] = round(float(np.mean(scores)) * 100, 1) if scores else np.nan
    return out


def _composite_for_horizon(all_features: dict, horizon: str, use_learned: bool) -> dict:
    bundle = get_horizon_bundle(horizon) if use_learned else {}
    effective_weights = bundle.get("weights") if use_learned and bundle.get("weights") else FEATURE_WEIGHTS
    effective_signs = bundle.get("signs", {}) if use_learned else {}
    calibration = bundle.get("calibration", CALIBRATION) if use_learned else None

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

        sign = effective_signs.get(name, 1) if use_learned else 1
        score = _signed_score(raw_score, sign)
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
        if use_learned:
            composite = round(apply_calibration(raw_composite, calibration), 1)
        else:
            composite = round(float(np.clip(raw_composite, -100, 100)), 1)
        raw_composite = round(raw_composite, 1)

    configured = len([k for k, w in effective_weights.items() if w > 0]) if use_learned else len(FEATURE_WEIGHTS)
    available = sum(1 for v in contributions.values() if not np.isnan(v["score"]))
    coverage = round(available / max(configured, 1), 2)

    return {
        "horizon": horizon,
        "composite": composite,
        "raw_composite": raw_composite if not np.isnan(raw_composite) else np.nan,
        "contributions": contributions,
        "available": available,
        "coverage": coverage,
        "calibration": calibration if use_learned else None,
    }


def compute_all_composites(all_features: dict, weights: dict = FEATURE_WEIGHTS) -> dict:
    """Compute 1m and 3m predictions in one pass (shared feature dict)."""
    use_learned = bool(LEARNED_WEIGHTS or any(
        get_horizon_bundle(h).get("weights") for h in PREDICTION_HORIZONS
    ))
    default_signs = get_horizon_bundle(DEFAULT_PREDICTION_HORIZON).get("signs", LEARNED_SIGNS)
    category_scores = _category_scores_from_features(
        all_features,
        default_signs if use_learned else {},
    )

    by_horizon = {}
    for horizon in PREDICTION_HORIZONS:
        by_horizon[horizon] = _composite_for_horizon(all_features, horizon, use_learned)

    default = by_horizon.get(DEFAULT_PREDICTION_HORIZON) or next(iter(by_horizon.values()))

    return {
        "composite": default["composite"],
        "composite_1m": by_horizon.get("fwd_return_1m", {}).get("composite"),
        "composite_3m": by_horizon.get("fwd_return_3m", {}).get("composite"),
        "raw_composite": default.get("raw_composite"),
        "contributions": default["contributions"],
        "category_scores": category_scores,
        "available": default["available"],
        "coverage": default["coverage"],
        "using_learned": use_learned,
        "calibration": default.get("calibration"),
        "by_horizon": by_horizon,
    }


def compute_composite(all_features: dict, weights: dict = FEATURE_WEIGHTS, horizon: Optional[str] = None) -> dict:
    """Single-horizon API; default returns all horizons plus legacy fields."""
    if horizon is None:
        return compute_all_composites(all_features, weights)
    use_learned = bool(get_horizon_bundle(horizon).get("weights") or LEARNED_WEIGHTS)
    result = _composite_for_horizon(all_features, horizon, use_learned)
    signs = get_horizon_bundle(horizon).get("signs", LEARNED_SIGNS) if use_learned else {}
    return {
        **result,
        "category_scores": _category_scores_from_features(all_features, signs),
        "using_learned": use_learned,
    }
