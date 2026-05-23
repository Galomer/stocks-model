"""
normalize.py — Convert raw signals to signed sub-scores in [-1, 1].

Positive always means bullish. Directional signing happens in features.py
before values arrive here; these functions are direction-agnostic.
"""

from typing import Optional
import numpy as np
import pandas as pd


def zscore_norm(series: pd.Series, window: int) -> float:
    """
    Z-score over a trailing rolling window, clipped at ±3 and scaled to [-1, 1].

    Clip at ±3 because extreme z-scores (financial crises, Covid) would otherwise
    dominate the composite and mask the signal from other features.

    Returns NaN if fewer than window/2 observations are available.
    """
    clean = series.dropna()
    if len(clean) < max(window // 2, 10):
        return np.nan
    w = min(window, len(clean))
    rolling_mean = clean.rolling(w).mean()
    rolling_std  = clean.rolling(w).std()
    z = (clean - rolling_mean) / (rolling_std + 1e-12)
    last = z.dropna()
    if last.empty:
        return np.nan
    return float(np.clip(last.iloc[-1], -3, 3) / 3)


def percentile_norm(series: pd.Series, window: int) -> float:
    """
    Percentile rank over a trailing window, rescaled from [0,1] to [-1,1].

    Better than z-score for bounded or skewed series (RSI, sentiment scores)
    because it doesn't assume a normal distribution.

    Returns NaN if fewer than 5 observations are available.
    """
    clean = series.dropna()
    if len(clean) < 5:
        return np.nan
    w = min(window, len(clean))
    tail = clean.iloc[-w:]
    current = float(clean.iloc[-1])
    rank = float((tail < current).sum()) / len(tail)   # 0..1
    return rank * 2 - 1                                  # rescale to [-1, 1]


def safe_last(series: pd.Series) -> Optional[float]:
    """Return the most recent non-NaN value, or None if the series is empty."""
    clean = series.dropna()
    return float(clean.iloc[-1]) if not clean.empty else None
