"""
backfill_history.py — Compute historical sector scores + forward returns
and persist them to Supabase for backtesting analysis.

For each business day in the lookback window:
  1. Slice prices and FRED data up to that date (no look-ahead bias)
  2. Run the same composite model used in production
  3. Compute realized forward returns at 1M / 3M / 6M / 1Y horizons
  4. Bulk-insert one row per (date, sector) into `historical_scores`

Notes
- Fear/Greed and CNN sentiment are not historical, so this backfill omits
  the `fear_greed` feature. Coverage is therefore 95% rather than 100%.
- The script fetches ~5 years of data once and slices in-memory — it does NOT
  hit yfinance/FRED once per date.
"""

import os
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd
import requests

from config import SECTOR_ETFS, SECTOR_COMMODITIES, BENCHMARK, FEATURE_WEIGHTS, LOOKBACK_DAYS
from data_loader import fetch_prices, fetch_fred
from features import build_momentum_features, build_macro_features, build_sentiment_features, build_regime_features
from score import compute_composite


# ── Tunables ───────────────────────────────────────────────────────────────
BACKFILL_YEARS = 3            # how far back to backfill scores
SAMPLE_EVERY_N_DAYS = 5       # 1 = daily, 5 = weekly-ish (Fri only)
EXTRA_LOOKBACK_DAYS = 760     # buffer for z-score baseline at the earliest backfill date
FORWARD_HORIZONS = {
    "fwd_return_1m": 21,
    "fwd_return_3m": 63,
    "fwd_return_6m": 126,
    "fwd_return_1y": 252,
}


def score_at(prices_slice: pd.DataFrame, fred_slice: pd.DataFrame, sector: str) -> dict:
    features = {}
    features.update(build_momentum_features(prices_slice, sector))
    features.update(build_macro_features(prices_slice, fred_slice, sector))
    # No historical fear_greed — pass None
    features.update(build_sentiment_features(prices_slice, fear_greed_score=None))
    features.update(build_regime_features(prices_slice, sector))
    result = compute_composite(features, FEATURE_WEIGHTS)
    result["raw_features"] = features
    return result


def features_to_jsonb(raw: dict) -> dict:
    """Convert raw per-feature signed scores (in [-1, 1]) to a JSONB-safe dict."""
    out = {}
    for name, val in raw.items():
        out[name] = nan_to_none(val)
    return out


def forward_returns(full_prices: pd.DataFrame, sector: str, as_of: pd.Timestamp) -> dict:
    """Return realized forward returns for each horizon, or None when out of data."""
    out = {h: None for h in FORWARD_HORIZONS}
    if sector not in full_prices.columns:
        return out
    s = full_prices[sector].dropna()
    if as_of not in s.index:
        # Find next available trading day on or after as_of
        idx = s.index.searchsorted(as_of)
        if idx >= len(s):
            return out
        as_of = s.index[idx]
    pos = s.index.get_loc(as_of)
    cur = float(s.iloc[pos])
    for col, days in FORWARD_HORIZONS.items():
        target_pos = pos + days
        if target_pos < len(s):
            future = float(s.iloc[target_pos])
            out[col] = round(future / cur - 1.0, 6)
    return out


def nan_to_none(v):
    if v is None: return None
    if isinstance(v, float) and np.isnan(v): return None
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.integer):
        return int(v)
    return v


def upsert_rows(rows: list, supabase_url: str, service_key: str, batch_size: int = 500) -> int:
    base = supabase_url.rstrip("/")
    for suffix in ("/rest/v1", "/rest", "/auth/v1", "/auth"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break

    headers = {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal",
    }
    url = f"{base}/rest/v1/historical_scores?on_conflict=as_of_date%2Csector"
    written = 0
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        resp = requests.post(url, json=chunk, headers=headers, timeout=60)
        if not resp.ok:
            raise RuntimeError(f"Supabase upsert failed [{resp.status_code}]: {resp.text[:400]}")
        written += len(chunk)
        print(f"  [{written}/{len(rows)}] batch upserted ({resp.status_code})")
    return written


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("[error] SUPABASE_URL and SUPABASE_SERVICE_KEY required")
        sys.exit(1)

    print(f"\n[backfill_history] {BACKFILL_YEARS}y, every {SAMPLE_EVERY_N_DAYS}-day samples")

    # 1. Fetch full data once. We need: backfill window + 1y forward + 760d z-score baseline.
    total_days = BACKFILL_YEARS * 365 + 365 + EXTRA_LOOKBACK_DAYS
    tickers = list(SECTOR_ETFS.keys()) + [BENCHMARK, "^VIX", "^VIX3M"]
    for c in SECTOR_COMMODITIES.values():
        if c: tickers.append(c)
    tickers = list(dict.fromkeys(tickers))

    print(f"  Fetching {total_days}d of prices ({len(tickers)} tickers) ...")
    prices = fetch_prices(tickers, days_back=total_days)
    print(f"    -> {len(prices)} rows, {len(prices.columns)} columns, "
          f"range {prices.index.min().date()} to {prices.index.max().date()}")

    print(f"  Fetching {total_days}d of FRED macro ...")
    fred = fetch_fred(days_back=total_days)
    print(f"    -> {len(fred)} rows, {list(fred.columns)}")

    # 2. Build the list of as-of dates (business days that exist in our price index)
    today = pd.Timestamp(date.today())
    earliest = today - pd.Timedelta(days=BACKFILL_YEARS * 365)
    candidate_dates = prices.index[(prices.index >= earliest) & (prices.index <= today)]
    sample_dates = candidate_dates[::SAMPLE_EVERY_N_DAYS]
    print(f"  Sampling {len(sample_dates)} dates from {sample_dates[0].date()} to {sample_dates[-1].date()}")

    # 3. Score each (date, sector)
    rows = []
    for i, as_of in enumerate(sample_dates):
        p_slice = prices.loc[:as_of]
        f_slice = fred.loc[:as_of] if not fred.empty else fred

        for sector, name in SECTOR_ETFS.items():
            r = score_at(p_slice, f_slice, sector)
            cat = r["category_scores"]
            fwd = forward_returns(prices, sector, as_of)
            rows.append({
                "as_of_date":     as_of.date().isoformat(),
                "sector":         sector,
                "sector_name":    name,
                "composite":      nan_to_none(r["composite"]),
                "momentum":       nan_to_none(cat.get("momentum")),
                "macro":          nan_to_none(cat.get("macro")),
                "sentiment":      nan_to_none(cat.get("sentiment")),
                "regime":         nan_to_none(cat.get("regime")),
                "available":      int(r["available"]),
                "coverage":       nan_to_none(r["coverage"]),
                "fwd_return_1m":  fwd["fwd_return_1m"],
                "fwd_return_3m":  fwd["fwd_return_3m"],
                "fwd_return_6m":  fwd["fwd_return_6m"],
                "fwd_return_1y":  fwd["fwd_return_1y"],
                "features":       features_to_jsonb(r["raw_features"]),
            })

        if (i + 1) % 50 == 0 or i == len(sample_dates) - 1:
            print(f"    scored {i+1}/{len(sample_dates)} dates  ({len(rows)} rows)")

    # 4. Bulk upsert
    print(f"\n  Writing {len(rows)} rows to Supabase ...")
    written = upsert_rows(rows, url, key)
    print(f"  Done. {written} rows written.")


if __name__ == "__main__":
    main()
