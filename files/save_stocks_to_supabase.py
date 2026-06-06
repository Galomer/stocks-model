"""
save_stocks_to_supabase.py — Score ~220 individual stocks and persist to Supabase.

Usage (called by GitHub Actions or manually):
    SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=sbp_... python save_stocks_to_supabase.py

Runs after save_to_supabase.py in the daily pipeline. Talks to PostgREST directly
via HTTP — no supabase-py SDK dependency required.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date

import requests

from config import SECTOR_ETFS, BENCHMARK, BOND_ETF, SECTOR_COMMODITIES
from data_loader import fetch_prices
from holdings import all_yf_tickers
from score_stocks import score_all_stocks


def _strip_url(url: str) -> str:
    base = url.rstrip("/")
    for suffix in ("/rest/v1", "/rest", "/auth/v1", "/auth"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return base


def upsert_stock_scores(rows: list, supabase_url: str, service_key: str) -> int:
    base = _strip_url(supabase_url)
    headers = {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
    }

    # Confirm we can reach the table
    diag = requests.get(
        f"{base}/rest/v1/stock_scores?select=run_date&limit=1",
        headers=headers, timeout=30,
    )
    print(f"  [diag] GET stock_scores -> {diag.status_code}")
    if not diag.ok:
        print(f"  [diag] body: {diag.text[:300]}")
        raise RuntimeError(
            f"stock_scores table not reachable. "
            f"Run the Supabase migration to create it first."
        )

    # Delete today's rows, then insert fresh ones
    run_dates = sorted({r["run_date"] for r in rows})
    for d in run_dates:
        del_resp = requests.delete(
            f"{base}/rest/v1/stock_scores?run_date=eq.{d}",
            headers=headers, timeout=30,
        )
        print(f"  [delete] {d}: {del_resp.status_code}")
        if not del_resp.ok and del_resp.status_code not in (200, 204):
            raise RuntimeError(f"Delete failed [{del_resp.status_code}]: {del_resp.text}")

    ins_resp = requests.post(
        f"{base}/rest/v1/stock_scores",
        json=rows,
        headers={**headers, "Prefer": "return=representation"},
        timeout=60,
    )
    if not ins_resp.ok:
        raise RuntimeError(f"Insert failed [{ins_resp.status_code}]: {ins_resp.text}")
    return len(ins_resp.json())


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("[error] SUPABASE_URL and SUPABASE_SERVICE_KEY required")
        sys.exit(1)

    run_date = date.today().isoformat()
    print(f"\n[save_stocks] Run date: {run_date}")

    # Build full ticker list: all stocks + market tickers already needed by sector model
    stock_tickers = all_yf_tickers()
    market_tickers = (
        list(SECTOR_ETFS.keys())
        + [BENCHMARK, BOND_ETF, "^VIX", "^VIX3M"]
    )
    for s in SECTOR_ETFS:
        comm = SECTOR_COMMODITIES.get(s)
        if comm:
            market_tickers.append(comm)

    all_tickers = list(dict.fromkeys(stock_tickers + market_tickers))
    print(f"  Fetching {len(all_tickers)} tickers (yfinance) ...")
    prices = fetch_prices(all_tickers)
    print(f"  Price matrix: {prices.shape[0]} rows × {prices.shape[1]} columns")

    print("\n  Scoring stocks ...")
    rows = score_all_stocks(prices, run_date)
    print(f"\n  Total rows: {len(rows)}")

    print(f"\n  Writing to Supabase ...")
    written = upsert_stock_scores(rows, url, key)
    print(f"  Done. {written} rows written for {run_date}.")


if __name__ == "__main__":
    main()
