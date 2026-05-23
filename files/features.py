"""
features.py — Compute and sign all feature sub-scores.

Each build_*_features() function returns a dict of {feature_name: sub_score}
where every sub-score is already directionally signed so that:
  +1.0 = maximally bullish signal
  -1.0 = maximally bearish signal
  NaN  = data unavailable for this feature

Signing logic is documented inline for each feature.
"""

from typing import Optional
import numpy as np
import pandas as pd

from config import (
    TARGET_SECTOR,
    BENCHMARK,
    CYCLICAL_ETF,
    DEFENSIVE_ETF,
    BOND_ETF,
    SECTOR_ETFS,
    SECTOR_COMMODITIES,
    SECTOR_USD_SIGN,
    ZSCORE_WINDOW,
    PERCENTILE_WINDOW,
)
from normalize import zscore_norm, percentile_norm


# ── Internal helpers ───────────────────────────────────────────────────────

def _rsi(prices: pd.Series, window: int = 14) -> pd.Series:
    """Wilder's RSI using exponential moving average (industry standard)."""
    delta = prices.diff()
    gain = delta.clip(lower=0).ewm(span=window, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(span=window, adjust=False).mean()
    rs = gain / (loss + 1e-12)
    return 100 - (100 / (1 + rs))


def _require(prices: pd.DataFrame, *tickers: str) -> bool:
    """Return True only if all tickers have data in the price DataFrame."""
    return all(t in prices.columns and not prices[t].dropna().empty for t in tickers)


# ── Momentum ───────────────────────────────────────────────────────────────

def build_momentum_features(
    prices: pd.DataFrame,
    sector: str = TARGET_SECTOR,
) -> dict:
    """
    Price-based momentum and technical signals.
    All signed: positive = above average / accelerating = bullish.
    """
    features: dict = {}
    if not _require(prices, sector):
        return features

    s = prices[sector].dropna()

    # Distance from moving averages
    # + = above MA = price supported = bullish
    for window, label in [(50, "50dma"), (200, "200dma")]:
        ma = s.rolling(window).mean()
        dist = (s - ma) / (ma + 1e-12)
        features[f"price_vs_{label}"] = zscore_norm(dist, ZSCORE_WINDOW)

    # Absolute rate of change (+ = sector rising = bullish)
    for periods, label in [(21, "1m"), (63, "3m"), (126, "6m")]:
        roc = s.pct_change(periods)
        features[f"roc_{label}"] = zscore_norm(roc, ZSCORE_WINDOW)

    # Relative strength vs benchmark (+ = sector outperforming market = bullish)
    if _require(prices, BENCHMARK):
        aligned = pd.concat([s, prices[BENCHMARK].dropna()], axis=1).dropna()
        aligned.columns = [sector, BENCHMARK]
        rs_ratio = aligned[sector] / (aligned[BENCHMARK] + 1e-12)
        rs_roc = rs_ratio.pct_change(63)
        features["relative_strength_3m"] = zscore_norm(rs_roc, ZSCORE_WINDOW)

    # RSI — mapped linearly: 50 → 0, 100 → +1, 0 → -1
    # Mid-range is neutral; this treats RSI as a trend signal, not a contrarian one.
    # Swap sign if you prefer a mean-reversion interpretation.
    rsi_series = _rsi(s)
    rsi_clean = rsi_series.dropna()
    if not rsi_clean.empty:
        features["rsi"] = float(np.clip((rsi_clean.iloc[-1] - 50) / 50, -1, 1))

    # NEW: distance from 52-week high
    # Always ≤ 0; the larger the drawdown, the more "stretched cheap" the sector is.
    # Signing: deeper below high (more negative dist) → stronger mean-reversion bullish setup
    # → invert sign so the feature value is + when sector is far below its 52w high.
    if len(s) >= 252:
        rolling_high = s.rolling(252, min_periods=200).max()
        dist = (s - rolling_high) / (rolling_high + 1e-12)  # in (-1, 0]
        # Z-score across history then invert (deeper drawdown → more bullish)
        z = zscore_norm(dist, ZSCORE_WINDOW)
        if z is not None and not (isinstance(z, float) and np.isnan(z)):
            features["dist_52w_high"] = -float(z)

    return features


# ── Macro & Rates ──────────────────────────────────────────────────────────

def build_macro_features(
    prices: pd.DataFrame,
    fred: pd.DataFrame,
    sector: str = TARGET_SECTOR,
) -> dict:
    """
    Macro and interest rate signals.
    Signing notes are inline — direction varies by feature and sector.
    """
    features: dict = {}
    have_fred = not fred.empty

    # Yield curve slope (10Y − 2Y)
    # Steeper curve → growth expectations rising → bullish equities
    if have_fred and all(s in fred for s in ["DGS10", "DGS2"]):
        slope = (fred["DGS10"] - fred["DGS2"]).dropna()
        slope_chg = slope.diff(21)
        features["yield_curve_slope"]  = zscore_norm(slope, ZSCORE_WINDOW)
        features["yield_curve_chg_1m"] = zscore_norm(slope_chg, ZSCORE_WINDOW)

    # Real 10Y yield (TIPS)
    # Rising real yields tighten financial conditions → bearish for most equity sectors → invert
    if have_fred and "DFII10" in fred:
        real = fred["DFII10"].dropna()
        features["real_yield_level"] = -zscore_norm(real, ZSCORE_WINDOW)

    # High-yield credit spread (OAS)
    # Widening = stress / risk-off → bearish → invert both level and change
    if have_fred and "BAMLH0A0HYM2" in fred:
        hy = fred["BAMLH0A0HYM2"].dropna()
        hy_chg = hy.diff(21)
        features["hy_spread_level"]  = -zscore_norm(hy, ZSCORE_WINDOW)
        features["hy_spread_chg_1m"] = -zscore_norm(hy_chg, ZSCORE_WINDOW)

    # Investment-grade credit spread
    # Same direction as HY but less volatile; good cross-check
    if have_fred and "BAMLC0A0CM" in fred:
        ig = fred["BAMLC0A0CM"].dropna()
        features["ig_spread_level"] = -zscore_norm(ig, ZSCORE_WINDOW)

    # USD index
    # Direction is sector-specific (see SECTOR_USD_SIGN in config).
    # Default: strong USD tends to be a headwind for multinationals → negative sign for most sectors
    if have_fred and "DTWEXBGS" in fred:
        usd = fred["DTWEXBGS"].dropna()
        usd_chg = usd.pct_change(63)
        sign = SECTOR_USD_SIGN.get(sector, -1)
        features["usd_change_3m"] = sign * zscore_norm(usd_chg, ZSCORE_WINDOW)

    # Sector-specific commodity (e.g., oil for XLE, copper for XLB/XLI)
    commodity_ticker = SECTOR_COMMODITIES.get(sector)
    if commodity_ticker and _require(prices, commodity_ticker):
        comm = prices[commodity_ticker].dropna()
        comm_chg = comm.pct_change(63)
        features["commodity_change_3m"] = zscore_norm(comm_chg, ZSCORE_WINDOW)

    # NEW: bond/equity ratio change (TLT / SPY, 3-month % change)
    # Rising ratio = bonds beating stocks = risk-off → bearish for equities
    # Sign inverted so + value = ratio falling = stocks beating bonds = bullish
    if _require(prices, BOND_ETF, BENCHMARK):
        aligned = pd.concat([prices[BOND_ETF], prices[BENCHMARK]], axis=1).dropna()
        aligned.columns = [BOND_ETF, BENCHMARK]
        ratio = aligned[BOND_ETF] / (aligned[BENCHMARK] + 1e-12)
        ratio_chg = ratio.pct_change(63)
        z = zscore_norm(ratio_chg, ZSCORE_WINDOW)
        if z is not None and not (isinstance(z, float) and np.isnan(z)):
            features["bond_equity_ratio_chg_3m"] = -float(z)

    return features


# ── Sentiment & Positioning ────────────────────────────────────────────────

def build_sentiment_features(
    prices: pd.DataFrame,
    fear_greed_score: Optional[float] = None,
    put_call_ratio: Optional[float] = None,
) -> dict:
    """
    Sentiment and volatility signals.

    Fear/Greed and put/call are used as trend-following signals here (high greed = bullish).
    You can flip their signs for a contrarian interpretation — test both on your data.
    """
    features: dict = {}

    # VIX level: low VIX = calm markets = bullish → invert
    if _require(prices, "^VIX"):
        vix = prices["^VIX"].dropna()
        features["vix_level"] = -zscore_norm(vix, ZSCORE_WINDOW)

    # VIX term structure: VIX / VIX3M
    # < 1 (contango) = market expects calm ahead = bullish → invert ratio
    # > 1 (backwardation) = near-term fear > medium-term fear = stress signal
    if _require(prices, "^VIX", "^VIX3M"):
        aligned = pd.concat([prices["^VIX"], prices["^VIX3M"]], axis=1).dropna()
        aligned.columns = ["vix", "vix3m"]
        ratio = aligned["vix"] / (aligned["vix3m"] + 1e-12)
        features["vix_term_structure"] = -zscore_norm(ratio, ZSCORE_WINDOW)

    # CNN Fear & Greed (trend-following): high score = greed = risk-on = bullish
    if fear_greed_score is not None:
        features["fear_greed"] = float(np.clip((fear_greed_score - 50) / 50, -1, 1))

    # NEW: VIX percentile rank over trailing 1y window
    # Uses rank-based normalization (more robust to outliers than the z-score on a fat-tailed series).
    # High VIX percentile = elevated fear, which historically mean-reverts → bullish for forward returns
    # → emit a positive value when VIX is in the upper percentile of its 1y range.
    if _require(prices, "^VIX"):
        vix = prices["^VIX"].dropna()
        if len(vix) >= 252:
            current = float(vix.iloc[-1])
            recent_window = vix.iloc[-252:]
            pctile = float((recent_window <= current).mean())   # in [0, 1]
            features["vix_pctile_1y"] = float(np.clip((pctile - 0.5) * 2.0, -1, 1))

    return features


# ── Regime ────────────────────────────────────────────────────────────────

def build_regime_features(
    prices: pd.DataFrame,
    sector: str = TARGET_SECTOR,
) -> dict:
    """
    Cross-sector rotation and correlation signals.

    These are regime context signals, not pure directional ones.
    Cyclical outperformance indicates risk appetite is high, which is broadly bullish
    for most sectors (though less so for defensive ones — adjust sign in config for XLP/XLU).
    """
    features: dict = {}

    # XLY / XLP ratio — cyclical vs defensive leadership
    # Rising ratio → investors prefer growth over safety → risk-on → bullish
    if _require(prices, CYCLICAL_ETF, DEFENSIVE_ETF):
        aligned = pd.concat([prices[CYCLICAL_ETF], prices[DEFENSIVE_ETF]], axis=1).dropna()
        aligned.columns = ["cycl", "def"]
        ratio = aligned["cycl"] / (aligned["def"] + 1e-12)
        ratio_roc = ratio.pct_change(63)
        features["cyclical_vs_defensive"] = zscore_norm(ratio_roc, ZSCORE_WINDOW)

    # Rolling sector-market correlation
    # High correlation = sector can't decouple from the market
    # This is a context flag (regime info), not a direction signal
    # High correlation → sector moves with market → slightly bullish if mkt is up → positive signed
    if _require(prices, sector, BENCHMARK):
        aligned = pd.concat([prices[sector], prices[BENCHMARK]], axis=1).dropna()
        aligned.columns = ["sector", "mkt"]
        rets = aligned.pct_change()
        corr = rets["sector"].rolling(60).corr(rets["mkt"])
        features["sector_vs_market_corr"] = zscore_norm(corr, ZSCORE_WINDOW)

    # NEW: market breadth — % of the 11 sector ETFs trading above their own 50-DMA.
    # This is a market-wide regime indicator (same value for every sector on a given day).
    # High breadth = broad participation = healthy bull regime = bullish.
    sector_tickers = [t for t in SECTOR_ETFS.keys() if t in prices.columns]
    above_count = 0
    counted = 0
    for t in sector_tickers:
        ts = prices[t].dropna()
        if len(ts) < 50:
            continue
        ma50 = ts.rolling(50).mean().iloc[-1]
        last = ts.iloc[-1]
        if pd.isna(ma50) or pd.isna(last):
            continue
        counted += 1
        if last > ma50:
            above_count += 1
    if counted >= 6:  # need most of the universe to compute meaningful breadth
        breadth = above_count / counted   # in [0, 1]
        features["breadth_above_50dma"] = float(np.clip((breadth - 0.5) * 2.0, -1, 1))

    return features
