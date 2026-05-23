"""
config.py — Central configuration.
All model parameters live here. Adjust sector, weights, and windows without touching logic files.
"""

# ── Sectors ──────────────────────────────────────────────────────────────
SECTOR_ETFS = {
    "XLK":  "Technology",
    "XLV":  "Health Care",
    "XLF":  "Financials",
    "XLE":  "Energy",
    "XLI":  "Industrials",
    "XLY":  "Consumer Discretionary",
    "XLP":  "Consumer Staples",
    "XLU":  "Utilities",
    "XLB":  "Materials",
    "XLRE": "Real Estate",
    "XLC":  "Communication Services",
}

# The sector you want to score (override with --sector on the command line)
TARGET_SECTOR = "XLK"

# Reference instruments
BENCHMARK     = "SPY"
CYCLICAL_ETF  = "XLY"
DEFENSIVE_ETF = "XLP"

# Sector-specific commodity to track (set to None if not applicable)
SECTOR_COMMODITIES = {
    "XLE":  "CL=F",   # Crude oil  — Energy
    "XLB":  "HG=F",   # Copper     — Materials
    "XLI":  "HG=F",   # Copper     — Industrials
    "XLK":  None,
    "XLV":  None,
    "XLF":  None,
    "XLY":  None,
    "XLP":  None,
    "XLU":  None,
    "XLRE": None,
    "XLC":  None,
}

# USD directional sign per sector (+1 = strong USD bullish, -1 = bearish)
# Energy/materials multinationals hurt by strong USD; domestic sectors less so
SECTOR_USD_SIGN = {
    "XLE":  -1,
    "XLB":  -1,
    "XLK":  -1,
    "XLI":  -1,
    "XLV":   1,
    "XLF":   1,
    "XLY":  -1,
    "XLP":  -1,
    "XLU":  -1,
    "XLRE": -1,
    "XLC":  -1,
}

# ── FRED macro series ─────────────────────────────────────────────────────
FRED_SERIES = {
    "DGS10":        "10Y Treasury Yield",
    "DGS2":         "2Y Treasury Yield",
    "DFII10":       "10Y Real Yield (TIPS)",
    "BAMLH0A0HYM2": "HY Credit Spread (OAS)",
    "BAMLC0A0CM":   "IG Credit Spread (OAS)",
    "DTWEXBGS":     "USD Index (Broad)",
}

# ── Windows ───────────────────────────────────────────────────────────────
LOOKBACK_DAYS    = 760   # Calendar days to pull (~3 years; more = better z-score baseline)
ZSCORE_WINDOW    = 252   # Rolling window for z-score normalization (1 trading year)
PERCENTILE_WINDOW = 252  # Rolling window for percentile normalization

# ── Feature weights ───────────────────────────────────────────────────────
# Start equal. After you've built a validation set, fit these via logistic regression.
# Setting a weight to 0 disables that feature without touching code.
FEATURE_WEIGHTS = {
    # — Momentum
    "price_vs_50dma":       1.0,
    "price_vs_200dma":      1.0,
    "relative_strength_3m": 1.0,
    "roc_1m":               0.5,
    "roc_3m":               1.0,
    "roc_6m":               0.5,
    "rsi":                  0.5,

    # — Macro
    "yield_curve_slope":    1.0,
    "yield_curve_chg_1m":   0.5,
    "real_yield_level":     1.0,
    "hy_spread_level":      1.0,
    "hy_spread_chg_1m":     0.5,
    "ig_spread_level":      0.5,
    "usd_change_3m":        1.0,
    "commodity_change_3m":  1.0,

    # — Sentiment
    "vix_level":            1.0,
    "vix_term_structure":   1.0,
    "fear_greed":           0.5,

    # — Regime
    "cyclical_vs_defensive": 1.0,
    "sector_vs_market_corr":  0.5,
}
