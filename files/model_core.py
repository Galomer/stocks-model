"""
model_core.py — Shared composite scoring logic for production and optimization.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np

from config import FEATURE_WEIGHTS

_LW_PATH = Path(__file__).parent / "learned_weights.json"
_LEARNED: dict = {}
if _LW_PATH.exists():
    try:
        _LEARNED = json.loads(_LW_PATH.read_text())
    except Exception:
        _LEARNED = {}

PREDICTION_HORIZONS = ("fwd_return_1m", "fwd_return_3m")
DEFAULT_PREDICTION_HORIZON = "fwd_return_1m"

# Legacy top-level bundle (v2 blend) — used as fallback for 3m when by_horizon missing.
_LEGACY_WEIGHTS: dict = _LEARNED.get("weights", {})
_LEGACY_SIGNS: dict = _LEARNED.get("signs", {})
_LEGACY_CALIBRATION: dict = _LEARNED.get(
    "calibration",
    {"raw_mean": 0.0, "raw_std": 1.0, "target_std": 30.0},
)

_BY_HORIZON: dict = _LEARNED.get("by_horizon") or {}


def _legacy_bundle() -> dict:
    return {
        "weights": _LEGACY_WEIGHTS,
        "signs": _LEGACY_SIGNS,
        "calibration": _LEGACY_CALIBRATION,
    }


def get_horizon_bundle(horizon: str) -> dict:
    """Return {weights, signs, calibration, composite_stats?} for a prediction horizon."""
    if horizon in _BY_HORIZON:
        bundle = _BY_HORIZON[horizon]
        return {
            "weights": bundle.get("weights", {}),
            "signs": bundle.get("signs", {}),
            "calibration": bundle.get("calibration", _LEGACY_CALIBRATION),
            "composite_stats": bundle.get("composite_stats"),
        }
    # Legacy v2 file: single blended bundle — use for 3m; fallback for 1m until relearned.
    if _LEGACY_WEIGHTS:
        return _legacy_bundle()
    return {"weights": {}, "signs": {}, "calibration": _LEGACY_CALIBRATION}


# Default horizon config (backward compatible exports).
_default = get_horizon_bundle(DEFAULT_PREDICTION_HORIZON)
LEARNED_SIGNS: dict = _default.get("signs", {})
LEARNED_WEIGHTS: dict = _default.get("weights", {})
CALIBRATION: dict = _default.get("calibration", _LEGACY_CALIBRATION)

FEATURE_CATEGORY: dict = {
    "price_vs_50dma":            "momentum",
    "price_vs_200dma":           "momentum",
    "roc_1m":                    "momentum",
    "roc_3m":                    "momentum",
    "roc_6m":                    "momentum",
    "relative_strength_3m":      "momentum",
    "rsi":                       "momentum",
    "dist_52w_high":             "momentum",
    "yield_curve_slope":         "macro",
    "yield_curve_chg_1m":        "macro",
    "real_yield_level":          "macro",
    "hy_spread_level":           "macro",
    "hy_spread_chg_1m":          "macro",
    "ig_spread_level":           "macro",
    "usd_change_3m":             "macro",
    "commodity_change_3m":       "macro",
    "bond_equity_ratio_chg_3m":  "macro",
    "vix_level":                 "sentiment",
    "vix_term_structure":        "sentiment",
    "fear_greed":                "sentiment",
    "vix_pctile_1y":             "sentiment",
    "cyclical_vs_defensive":     "regime",
    "sector_vs_market_corr":     "regime",
    "breadth_above_50dma":       "regime",
}

CATEGORY_ORDER = ["momentum", "macro", "sentiment", "regime"]
CATEGORY_WEIGHT_CAP = 0.38


def _is_nan(v) -> bool:
    return v is None or (isinstance(v, float) and np.isnan(v))


def raw_composite_from_features(
    features: dict,
    weights: Optional[dict] = None,
    signs: Optional[dict] = None,
    use_learned: Optional[bool] = None,
    horizon: Optional[str] = None,
) -> Optional[float]:
    """Weighted average of signed feature scores, scaled to [-100, 100] before calibration."""
    bundle = get_horizon_bundle(horizon) if horizon else {}
    if use_learned is None:
        use_learned = bool(bundle.get("weights") or LEARNED_WEIGHTS)

    if weights is not None:
        effective_weights = weights
        effective_signs = signs or {}
    elif horizon and bundle.get("weights"):
        effective_weights = bundle["weights"]
        effective_signs = bundle.get("signs", {})
    elif use_learned and LEARNED_WEIGHTS:
        effective_weights = LEARNED_WEIGHTS
        effective_signs = LEARNED_SIGNS
    else:
        effective_weights = FEATURE_WEIGHTS
        effective_signs = signs or {}

    total_weight = 0.0
    weighted_sum = 0.0
    for name, raw_score in features.items():
        w = effective_weights.get(name, 1.0 if not use_learned else 0.0)
        if w == 0 or _is_nan(raw_score):
            continue
        sign = effective_signs.get(name, 1) if use_learned else 1
        score = float(raw_score) * sign
        weighted_sum += score * w
        total_weight += w

    if total_weight == 0:
        return None
    return (weighted_sum / total_weight) * 100.0


def apply_calibration(raw_composite: float, calibration: Optional[dict] = None) -> float:
    """Center and rescale raw composite to a readable [-100, 100] score."""
    cal = calibration or CALIBRATION

    if cal.get("target_std") is not None:
        raw_mean = float(cal.get("raw_mean", 0.0))
        raw_std = float(cal.get("raw_std", 1.0))
        target_std = float(cal.get("target_std", 30.0))
        if raw_std < 1e-6:
            return float(np.clip(raw_composite - raw_mean, -100.0, 100.0))
        z = (raw_composite - raw_mean) / raw_std
        return float(np.clip(z * target_std, -100.0, 100.0))

    slope = float(cal.get("slope", 1.0))
    if abs(slope) < 0.05:
        return float(np.clip(raw_composite, -100.0, 100.0))

    raw_mean = float(cal.get("raw_mean", 0.0))
    intercept = float(cal.get("intercept", 0.0))
    centered = raw_composite - raw_mean
    out = slope * centered + intercept
    return float(np.clip(out, -100.0, 100.0))


def composite_from_features(
    features: dict,
    weights: Optional[dict] = None,
    signs: Optional[dict] = None,
    calibration: Optional[dict] = None,
    use_learned: Optional[bool] = None,
    horizon: Optional[str] = None,
) -> Optional[float]:
    bundle = get_horizon_bundle(horizon) if horizon else {}
    cal = calibration or bundle.get("calibration") or CALIBRATION
    raw = raw_composite_from_features(
        features, weights, signs, use_learned=use_learned, horizon=horizon
    )
    if raw is None:
        return None
    if use_learned is False:
        return float(np.clip(raw, -100.0, 100.0))
    return apply_calibration(raw, cal)
