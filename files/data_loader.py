"""
data_loader.py — Fetch prices (yfinance), macro (FRED), and sentiment data.

All fetches degrade gracefully: a failed source returns an empty DataFrame or None
so the rest of the model still runs with reduced feature coverage.
"""

import os
from typing import Optional, List
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import requests
import yfinance as yf

from config import FRED_SERIES, LOOKBACK_DAYS


# ── Helpers ───────────────────────────────────────────────────────────────

def _start_date(days_back: int = LOOKBACK_DAYS) -> str:
    return (datetime.today() - timedelta(days=days_back)).strftime("%Y-%m-%d")


# ── Prices ────────────────────────────────────────────────────────────────

def fetch_prices(tickers: List[str], days_back: int = LOOKBACK_DAYS) -> pd.DataFrame:
    """
    Download adjusted close prices for a list of tickers via yfinance.
    Returns a DataFrame with tickers as columns, dated index.

    Handles both single-ticker (flat column) and multi-ticker (MultiIndex) yfinance output.
    Missing tickers are silently dropped.
    """
    start = _start_date(days_back)
    tickers = list(dict.fromkeys(tickers))   # deduplicate, preserve order

    try:
        raw = yf.download(tickers, start=start, auto_adjust=True, progress=False, threads=True)
    except Exception as e:
        print(f"  [error] yfinance download failed: {e}")
        return pd.DataFrame()

    # Multi-ticker download → MultiIndex columns; single ticker → flat columns
    if isinstance(raw.columns, pd.MultiIndex):
        prices = raw["Close"].copy()
    else:
        # Single ticker
        prices = raw[["Close"]].copy()
        prices.columns = [tickers[0]]

    prices.index = pd.to_datetime(prices.index)
    prices = prices.dropna(how="all")
    return prices


# ── Macro (FRED) ──────────────────────────────────────────────────────────

_FRED_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/csv,*/*",
}


def _fetch_fred_api(sid: str, start: str, api_key: str, timeout: int = 20) -> Optional[pd.Series]:
    """
    Fetch a single FRED series via the official JSON API.
    Reliable and fast (~100-300ms per series).
    """
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id":         sid,
        "api_key":           api_key,
        "file_type":         "json",
        "observation_start": start,
    }
    try:
        resp = requests.get(url, params=params, timeout=timeout, headers=_FRED_HEADERS)
        resp.raise_for_status()
        obs = resp.json().get("observations", [])
        if not obs:
            return None
        idx = pd.to_datetime([o["date"] for o in obs])
        vals = pd.to_numeric([o["value"] for o in obs], errors="coerce")
        return pd.Series(vals, index=idx, name=sid)
    except Exception:
        return None


def _fetch_fred_csv(sid: str, start: str, timeout: int = 25) -> Optional[pd.Series]:
    """
    Fetch a single FRED series from the public CSV endpoint (fallback when no API key).
    """
    from io import StringIO

    urls = [
        f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={start}",
        f"https://fred.stlouisfed.org/series/{sid}/downloaddata/{sid}.csv",
    ]
    for url in urls:
        try:
            resp = requests.get(url, timeout=timeout, headers=_FRED_HEADERS)
            resp.raise_for_status()
            df_s = pd.read_csv(StringIO(resp.text), parse_dates=[0], index_col=0)
            df_s.columns = [sid]
            df_s = df_s.replace(".", float("nan"))
            df_s[sid] = pd.to_numeric(df_s[sid], errors="coerce")
            return df_s[sid]
        except Exception:
            continue
    return None


def _fetch_fred_one(sid: str, start: str) -> Optional[pd.Series]:
    """Use the FRED API if an API key is available; otherwise fall back to CSV scraping."""
    api_key = os.environ.get("FRED_API_KEY")
    if api_key:
        return _fetch_fred_api(sid, start, api_key)
    return _fetch_fred_csv(sid, start)


def fetch_fred(days_back: int = LOOKBACK_DAYS, total_budget_sec: int = 90) -> pd.DataFrame:
    """
    Download all FRED macro series in parallel with a hard total-time budget.
    Returns whatever series finished within the budget; missing series degrade
    gracefully (the model excludes them and redistributes weight).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    start = _start_date(days_back)
    series_ids = list(FRED_SERIES.keys())
    results = {}

    with ThreadPoolExecutor(max_workers=len(series_ids)) as ex:
        future_to_sid = {ex.submit(_fetch_fred_one, sid, start): sid for sid in series_ids}
        try:
            for future in as_completed(future_to_sid, timeout=total_budget_sec):
                sid = future_to_sid[future]
                try:
                    s = future.result()
                    if s is not None:
                        results[sid] = s
                    else:
                        print(f"  [warn] FRED series {sid} returned no data")
                except Exception as e:
                    print(f"  [warn] FRED series {sid} failed: {e}")
        except TimeoutError:
            missing = [sid for sid in series_ids if sid not in results]
            print(f"  [warn] FRED budget of {total_budget_sec}s exceeded; missing: {missing}")

    if not results:
        return pd.DataFrame()

    df = pd.DataFrame(results)
    df.index = pd.to_datetime(df.index)
    return df.ffill()


# ── CNN Fear & Greed ──────────────────────────────────────────────────────

def fetch_fear_greed() -> Optional[float]:
    """
    Fetch the current CNN Fear & Greed Index score (0 = extreme fear, 100 = extreme greed).

    Uses CNN's production data endpoint. This is unofficial — if it breaks,
    check https://edition.cnn.com/markets/fear-and-greed for the updated URL.

    Returns None on failure so the caller can handle gracefully.
    """
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)"}
    try:
        resp = requests.get(url, timeout=8, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        score = data["fear_and_greed"]["score"]
        return float(score)
    except Exception:
        return None


# ── CBOE Put/Call Ratio ───────────────────────────────────────────────────

def fetch_put_call_ratio() -> Optional[float]:
    """
    Fetch the most recent CBOE total put/call ratio from their public CDN.

    Returns None on failure. The CBOE CDN URL has changed before — if it
    breaks, check https://www.cboe.com/data/historical-options-data/.
    """
    candidates = [
        "https://cdn.cboe.com/api/global/us_indices/daily_prices/PUT_CALL-RATIO_US.csv",
        "https://www.cboe.com/data/historical-options-data/options-volume/",
    ]
    for url in candidates:
        try:
            df = pd.read_csv(url, parse_dates=[0])
            df.columns = [c.strip().upper() for c in df.columns]
            date_col = df.columns[0]
            df = df.sort_values(date_col)
            ratio_col = next((c for c in df.columns if "TOTAL" in c or "RATIO" in c), None)
            if ratio_col:
                return float(df[ratio_col].dropna().iloc[-1])
        except Exception:
            continue
    return None
