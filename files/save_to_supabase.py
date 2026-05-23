"""
save_to_supabase.py — Run the sector model for all sectors and persist results to Supabase.

Usage (called by GitHub Actions or manually):
    SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=sbp_... python save_to_supabase.py

Talks to PostgREST directly via HTTP — no `supabase` SDK dependency required.
"""

import os
import sys
import json
from datetime import date

import numpy as np
import requests

from config import SECTOR_ETFS, TARGET_SECTOR, SECTOR_COMMODITIES, BENCHMARK, CYCLICAL_ETF, DEFENSIVE_ETF, FEATURE_WEIGHTS
from data_loader import fetch_prices, fetch_fred, fetch_fear_greed
from features import build_momentum_features, build_macro_features, build_sentiment_features, build_regime_features
from score import compute_composite


def score_sector(sector: str, prices, fred, fear_greed) -> dict:
    features = {}
    features.update(build_momentum_features(prices, sector))
    features.update(build_macro_features(prices, fred, sector))
    features.update(build_sentiment_features(prices, fear_greed_score=fear_greed))
    features.update(build_regime_features(prices, sector))
    return compute_composite(features, FEATURE_WEIGHTS)


def nan_to_none(v):
    """Convert numpy NaN / np.floating to Python float or None for JSON safety."""
    if v is None:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.integer):
        return int(v)
    return v


def clean_features(contributions: dict) -> dict:
    """Serialize per-feature contributions, replacing NaN with None."""
    out = {}
    for name, detail in contributions.items():
        out[name] = {
            "score":        nan_to_none(detail.get("score")),
            "weight":       nan_to_none(detail.get("weight")),
            "contribution": nan_to_none(detail.get("contribution")),
            "category":     detail.get("category", "other"),
        }
    return out


def upsert_via_rest(rows: list, supabase_url: str, service_key: str) -> int:
    """
    Upsert rows directly via the PostgREST REST API.
    Uses `Prefer: resolution=merge-duplicates` which respects the UNIQUE constraint
    on (run_date, sector). More reliable than supabase-py 2.30's upsert wrapper.
    """
    url = f"{supabase_url}/rest/v1/sector_scores?on_conflict=run_date,sector"
    headers = {
        "apikey":         service_key,
        "Authorization":  f"Bearer {service_key}",
        "Content-Type":   "application/json",
        "Prefer":         "resolution=merge-duplicates,return=representation",
    }
    resp = requests.post(url, json=rows, headers=headers, timeout=30)
    if not resp.ok:
        raise RuntimeError(f"Supabase upsert failed [{resp.status_code}]: {resp.text}")
    return len(resp.json())


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("[error] SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required.")
        sys.exit(1)

    run_date = date.today().isoformat()

    print(f"\n[save_to_supabase] Run date: {run_date}")

    # Build full ticker list
    tickers = list(SECTOR_ETFS.keys()) + [BENCHMARK, "^VIX", "^VIX3M"]
    for s in SECTOR_ETFS:
        comm = SECTOR_COMMODITIES.get(s)
        if comm:
            tickers.append(comm)
    tickers = list(dict.fromkeys(tickers))

    print("  Fetching prices (yfinance) ...")
    prices = fetch_prices(tickers)

    print("  Fetching macro (FRED) ...")
    fred = fetch_fred()

    print("  Fetching sentiment (CNN Fear/Greed) ...")
    fg = fetch_fear_greed()
    if fg is not None:
        print(f"    Fear/Greed: {fg:.0f}")
    else:
        print("    Fear/Greed: unavailable")

    rows = []
    for sector, sector_name in SECTOR_ETFS.items():
        result = score_sector(sector, prices, fred, fg)
        cat    = result["category_scores"]
        row = {
            "run_date":    run_date,
            "sector":      sector,
            "sector_name": sector_name,
            "composite":   nan_to_none(result["composite"]),
            "momentum":    nan_to_none(cat.get("momentum")),
            "macro":       nan_to_none(cat.get("macro")),
            "sentiment":   nan_to_none(cat.get("sentiment")),
            "regime":      nan_to_none(cat.get("regime")),
            "coverage":    nan_to_none(result["coverage"]),
            "available":   int(result["available"]),
            "features":    clean_features(result["contributions"]),
        }
        rows.append(row)
        print(f"  {sector:<5s} {sector_name:<30s} composite={row['composite']}")

    print(f"\n  Writing {len(rows)} rows to Supabase ...")
    written = upsert_via_rest(rows, url, key)
    print(f"  Done. {written} rows written for {run_date}.")


if __name__ == "__main__":
    main()
