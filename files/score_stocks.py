"""
score_stocks.py — Within-sector momentum scoring for ~220 individual stocks.

For each stock in SECTOR_HOLDINGS, computes momentum sub-scores using the same
feature pipeline as the sector model, adds a relative-strength-vs-sector feature,
then ranks each stock within its sector on both 1m and 3m horizons.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from config import BENCHMARK, SECTOR_ETFS, ZSCORE_WINDOW
from features import build_momentum_features, _require
from normalize import zscore_norm
from model_core import get_horizon_bundle, apply_calibration, PREDICTION_HORIZONS
from holdings import SECTOR_HOLDINGS, all_yf_tickers, yf_ticker

# Features used for stock scoring — all are per-stock (no macro/market-wide).
# The existing momentum features already work for individual tickers via
# build_momentum_features(prices, ticker). rs_vs_sector_3m is added here.
STOCK_FEATURES = [
    "price_vs_50dma",
    "price_vs_200dma",
    "roc_1m",
    "roc_3m",
    "roc_6m",
    "rsi",
    "dist_52w_high",
    "relative_strength_3m",   # stock vs SPY
    "rs_vs_sector_3m",         # stock vs its own sector ETF (more discriminating within a sector)
]

# Macro/market-wide features that are the same for every stock → excluded from
# within-sector ranking (they add zero discriminating power).
_MACRO_FEATURES = {"usd_change_3m", "yield_curve_slope", "yield_curve_chg_1m",
                   "real_yield_level", "hy_spread_level", "hy_spread_chg_1m",
                   "ig_spread_level", "bond_equity_ratio_chg_3m",
                   "vix_level", "vix_term_structure", "fear_greed", "vix_pctile_1y",
                   "cyclical_vs_defensive", "sector_vs_market_corr", "breadth_above_50dma",
                   "commodity_change_3m"}


def _stock_weights(horizon: str) -> dict:
    """
    Extract per-stock momentum weights from the learned bundle.
    Filters out macro/market-wide features that are constant within a sector.
    Adds rs_vs_sector_3m with same weight as relative_strength_3m.
    Falls back to equal weights if nothing is learned.
    """
    bundle = get_horizon_bundle(horizon)
    learned = bundle.get("weights") or {}

    # Keep only momentum features that differ stock-by-stock
    w = {k: v for k, v in learned.items()
         if k not in _MACRO_FEATURES and v > 0}

    if not w:
        # Fallback: equal weight across all STOCK_FEATURES except rs_vs_sector_3m
        base = [f for f in STOCK_FEATURES if f != "rs_vs_sector_3m"]
        w = {k: 1.0 for k in base}

    # rs_vs_sector_3m inherits the relative_strength_3m weight (or roc_3m as fallback)
    rs_w = w.get("relative_strength_3m") or w.get("roc_3m") or (1.0 / len(w))
    w["rs_vs_sector_3m"] = rs_w

    return w


def _stock_signs(horizon: str) -> dict:
    bundle = get_horizon_bundle(horizon)
    learned = bundle.get("signs") or {}
    signs = {k: learned.get(k, 1) for k in STOCK_FEATURES}
    signs["rs_vs_sector_3m"] = 1
    return signs


def build_stock_features(
    prices: pd.DataFrame,
    ticker: str,
    sector_etf: str,
) -> dict:
    """
    Compute momentum features for one stock.
    ticker must be in yfinance format (e.g. BRK-B).
    Reuses build_momentum_features() for the 8 base momentum features,
    then adds rs_vs_sector_3m (stock vs parent sector ETF).
    """
    feats = build_momentum_features(prices, ticker)

    # Relative strength vs the parent sector ETF (3m rolling)
    # +1 = stock leading its sector = bullish within-sector signal
    if _require(prices, ticker, sector_etf):
        s = prices[ticker].dropna()
        e = prices[sector_etf].dropna()
        aligned = pd.concat([s, e], axis=1).dropna()
        aligned.columns = ["stock", "etf"]
        ratio = aligned["stock"] / (aligned["etf"] + 1e-12)
        rs_roc = ratio.pct_change(63)
        feats["rs_vs_sector_3m"] = zscore_norm(rs_roc, ZSCORE_WINDOW)

    return feats


def _compute_composite(features: dict, horizon: str) -> Optional[float]:
    """
    Weighted sum of signed feature sub-scores, calibrated to [-100, +100].
    """
    weights = _stock_weights(horizon)
    signs = _stock_signs(horizon)
    bundle = get_horizon_bundle(horizon)
    calibration = bundle.get("calibration")

    total = 0.0
    weighted = 0.0
    for name, w in weights.items():
        if w <= 0:
            continue
        v = features.get(name)
        if v is None or (isinstance(v, float) and np.isnan(v)):
            continue
        sign = signs.get(name, 1)
        weighted += float(v) * sign * w
        total += w

    if total == 0:
        return None

    raw = (weighted / total) * 100.0
    if calibration:
        return round(apply_calibration(raw, calibration), 1)
    return round(float(np.clip(raw, -100.0, 100.0)), 1)


def _coverage(features: dict, horizon: str) -> tuple:
    """Return (available_count, coverage_fraction) for the feature set."""
    weights = _stock_weights(horizon)
    avail = sum(
        1 for k in weights
        if features.get(k) is not None
        and not (isinstance(features.get(k), float) and np.isnan(features.get(k)))
    )
    return avail, round(avail / max(len(weights), 1), 2)


def _rank_within_sector(rows: list, score_key: str, rank_key: str) -> None:
    """Assign 1-based rank within a sector in-place (1 = highest score, None = unscored)."""
    valid = [(i, r[score_key]) for i, r in enumerate(rows)
             if r.get(score_key) is not None]
    valid.sort(key=lambda x: x[1], reverse=True)
    for rank, (i, _) in enumerate(valid, 1):
        rows[i][rank_key] = rank


def _clean_feats(feats: dict) -> dict:
    out = {}
    for k, v in feats.items():
        if v is None or (isinstance(v, float) and np.isnan(v)):
            out[k] = None
        else:
            out[k] = round(float(v), 4)
    return out


def score_all_stocks(prices: pd.DataFrame, run_date: str) -> list:
    """
    Score all stocks in SECTOR_HOLDINGS.
    prices must already include all stock tickers + SPY + all 11 sector ETFs.
    Returns a list of row dicts ready to insert into Supabase.
    """
    rows = []

    for sector, holdings in SECTOR_HOLDINGS.items():
        sector_rows = []

        for h in holdings:
            ticker_orig = h["ticker"]
            ticker_yf   = yf_ticker(ticker_orig)

            feats = build_stock_features(prices, ticker_yf, sector)

            m1m = _compute_composite(feats, "fwd_return_1m")
            m3m = _compute_composite(feats, "fwd_return_3m")
            avail_1m, cov_1m = _coverage(feats, "fwd_return_1m")
            avail_3m, cov_3m = _coverage(feats, "fwd_return_3m")

            sector_rows.append({
                "run_date":          run_date,
                "ticker":            ticker_orig,
                "name":              h["name"],
                "sector":            sector,
                "sector_name":       SECTOR_ETFS[sector],
                "momentum_1m":       m1m,
                "momentum_3m":       m3m,
                "rank_in_sector_1m": None,
                "rank_in_sector_3m": None,
                "available":         max(avail_1m, avail_3m),
                "coverage":          round((cov_1m + cov_3m) / 2, 2),
                "features":          _clean_feats(feats),
            })

        _rank_within_sector(sector_rows, "momentum_1m", "rank_in_sector_1m")
        _rank_within_sector(sector_rows, "momentum_3m", "rank_in_sector_3m")

        rows.extend(sector_rows)
        nscored = sum(1 for r in sector_rows if r["momentum_3m"] is not None)
        print(f"  {sector:<5s}  scored {nscored}/{len(sector_rows)} stocks")

    return rows
