"""
data_loader.py — Fetch prices (yfinance), macro (FRED), and sentiment data.

All fetches degrade gracefully: a failed source returns an empty DataFrame or None
so the rest of the model still runs with reduced feature coverage.
"""

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

def fetch_fred(days_back: int = LOOKBACK_DAYS) -> pd.DataFrame:
    """
    Download macro series directly from the FRED CSV endpoint.
    No API key required. Each series is fetched individually; failures are
    silently dropped so the model still runs with reduced coverage.
    """
    start = _start_date(days_back)
    results = {}

    for sid in FRED_SERIES:
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&vintage_date="
        # Use the observation endpoint which supports a start date filter
        obs_url = (
            f"https://fred.stlouisfed.org/graph/fredgraph.csv"
            f"?id={sid}&cosd={start}"
        )
        try:
            resp = requests.get(obs_url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            from io import StringIO
            df_s = pd.read_csv(StringIO(resp.text), parse_dates=[0], index_col=0)
            df_s.columns = [sid]
            df_s = df_s.replace(".", float("nan")).infer_objects()
            df_s[sid] = pd.to_numeric(df_s[sid], errors="coerce")
            results[sid] = df_s[sid]
        except Exception as e:
            print(f"  [warn] FRED series {sid} unavailable: {e}")

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
