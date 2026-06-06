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

from config import SECTOR_ETFS, TARGET_SECTOR, SECTOR_COMMODITIES, BENCHMARK, BOND_ETF, CYCLICAL_ETF, DEFENSIVE_ETF, FEATURE_WEIGHTS
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
    # Defensively strip common suffixes the user might have pasted by mistake
    base = supabase_url.rstrip("/")
    for suffix in ("/rest/v1", "/rest", "/auth/v1", "/auth"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break

    # URL sanity check (without leaking the full value)
    print(f"  [diag] base URL length: {len(base)}, scheme/host check: starts={base[:8]}, host_tail={base[-25:]}")

    headers = {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
    }

    # Diagnostic: confirm we can reach the API root
    root = requests.get(f"{base}/rest/v1/", headers=headers, timeout=30)
    print(f"  [diag] GET /rest/v1/ -> {root.status_code}")
    if not root.ok:
        print(f"  [diag] body: {root.text[:300]}")

    # Diagnostic: confirm we can reach the table
    diag = requests.get(
        f"{base}/rest/v1/sector_scores?select=run_date&limit=1",
        headers=headers, timeout=30,
    )
    print(f"  [diag] GET sector_scores -> {diag.status_code} (body len={len(diag.text)})")
    if not diag.ok:
        print(f"  [diag] body: {diag.text[:300]}")
        raise RuntimeError(
            f"Supabase API not reachable at the configured URL. "
            f"Verify SUPABASE_URL secret looks like https://<project-ref>.supabase.co"
        )

    # Per-row UPSERT: delete existing rows for today, then insert fresh ones.
    # Avoids on_conflict / Prefer header quirks that triggered PGRST125.
    run_dates = sorted({r["run_date"] for r in rows})
    for d in run_dates:
        del_url = f"{base}/rest/v1/sector_scores?run_date=eq.{d}"
        d_resp = requests.delete(del_url, headers=headers, timeout=30)
        print(f"  [delete] {d}: {d_resp.status_code}")
        if not d_resp.ok and d_resp.status_code not in (200, 204):
            raise RuntimeError(f"Supabase delete failed [{d_resp.status_code}]: {d_resp.text}")

    insert_url = f"{base}/rest/v1/sector_scores"
    ins_headers = {**headers, "Prefer": "return=representation"}
    resp = requests.post(insert_url, json=rows, headers=ins_headers, timeout=30)
    if not resp.ok:
        raise RuntimeError(f"Supabase insert failed [{resp.status_code}]: {resp.text}")
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
    tickers = list(SECTOR_ETFS.keys()) + [BENCHMARK, BOND_ETF, "^VIX", "^VIX3M"]
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
        by_h   = result.get("by_horizon") or {}
        c1m    = result.get("composite_1m")
        c3m    = result.get("composite_3m")
        if c1m is None:
            c1m = (by_h.get("fwd_return_1m") or {}).get("composite")
        if c3m is None:
            c3m = (by_h.get("fwd_return_3m") or {}).get("composite")
        row = {
            "run_date":    run_date,
            "sector":      sector,
            "sector_name": sector_name,
            "composite":   nan_to_none(c1m if c1m is not None else result["composite"]),
            "composite_1m": nan_to_none(c1m),
            "composite_3m": nan_to_none(c3m),
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
