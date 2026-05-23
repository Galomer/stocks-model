"""
main.py — Entry point for the sector direction model.

Usage:
    python main.py                          # score TARGET_SECTOR from config
    python main.py --sector XLE             # score a specific sector
    python main.py --sector XLF --verbose   # show per-feature breakdown
    python main.py --all                    # score all 11 sectors (ranked)

This is a research tool, not investment advice.
Validate on a holdout period before acting on any output.
"""

import argparse
import sys
from typing import Optional
import numpy as np

from config import SECTOR_ETFS, TARGET_SECTOR, SECTOR_COMMODITIES, BENCHMARK, CYCLICAL_ETF, DEFENSIVE_ETF, FEATURE_WEIGHTS
from data_loader import fetch_prices, fetch_fred, fetch_fear_greed
from features import build_momentum_features, build_macro_features, build_sentiment_features, build_regime_features
from score import compute_composite, CATEGORY_ORDER, FEATURE_CATEGORY


# ── Display helpers ────────────────────────────────────────────────────────

def _direction_label(score: float) -> str:
    if np.isnan(score):    return "no data"
    if score >=  60:       return "STRONGLY BULLISH"
    if score >=  25:       return "BULLISH"
    if score >= -25:       return "NEUTRAL"
    if score >= -60:       return "BEARISH"
    return                        "STRONGLY BEARISH"


def _bar(score: float, half: int = 15) -> str:
    """
    ASCII progress bar centered at 0.
    Example: [-----------█████│          ]  +35
             [          │█████-----------]  -35
    """
    if np.isnan(score):
        return " " * (half * 2 + 3)
    total = half * 2 + 1
    chars = [" "] * total
    center = half
    chars[center] = "│"
    pos = int(round((score / 100.0) * half))
    pos = max(-half, min(half, pos))
    if pos >= 0:
        for i in range(center, center + pos + 1):
            chars[i] = "█"
    else:
        for i in range(center + pos, center + 1):
            chars[i] = "█"
    return "[" + "".join(chars) + "]"


def _score_str(score: float) -> str:
    return f"{score:+6.1f}" if not np.isnan(score) else "   n/a"


# ── Score sheet renderer ────────────────────────────────────────────────────

def print_score_sheet(sector: str, result: dict, verbose: bool = False):
    name      = SECTOR_ETFS.get(sector, sector)
    composite = result["composite"]
    label     = _direction_label(composite)
    cat_scores = result["category_scores"]
    available  = result["available"]
    coverage   = result["coverage"]

    W = 64
    print()
    print("═" * W)
    print(f"  SECTOR DIRECTION MODEL  ·  {sector} — {name}")
    print("═" * W)
    print()
    print(f"  Composite score   {_bar(composite, 14)}  {_score_str(composite)}")
    print(f"  Direction         {label}")
    print(f"  Feature coverage  {available} features  ({coverage:.0%} of configured)")
    print()
    print(f"  Category breakdown")
    print(f"  {'─' * (W - 4)}")
    for cat in CATEGORY_ORDER:
        cs = cat_scores.get(cat, np.nan)
        print(f"  {cat.capitalize():<12s} {_bar(cs, 14)}  {_score_str(cs)}")
    print()

    if verbose:
        contribs = result["contributions"]
        for cat in CATEGORY_ORDER:
            items = [(n, v) for n, v in contribs.items() if v["category"] == cat]
            if not items:
                continue
            print(f"  ── {cat.upper()} ──")
            for name_f, vals in items:
                s = vals["score"]
                scaled = s * 100 if not np.isnan(s) else np.nan
                available_str = _bar(scaled, 10)
                score_str     = _score_str(scaled)
                wt_str        = f"(w={vals['weight']:.1f})"
                print(f"    {name_f:<28s}  {available_str}  {score_str}  {wt_str}")
            print()

    print("═" * W)
    print("  ⚠  Research model only — not investment advice.")
    print("     Backtest on a holdout period before trusting any output.")
    print("═" * W)
    print()


# ── Core scoring pipeline ──────────────────────────────────────────────────

def score_sector(
    sector: str,
    prices,
    fred,
    fear_greed: Optional[float],
    verbose: bool = False,
) -> dict:
    features = {}
    features.update(build_momentum_features(prices, sector))
    features.update(build_macro_features(prices, fred, sector))
    features.update(build_sentiment_features(prices, fear_greed_score=fear_greed))
    features.update(build_regime_features(prices, sector))
    return compute_composite(features, FEATURE_WEIGHTS)


def run(sector: Optional[str] = None, verbose: bool = False, all_sectors: bool = False):
    # Determine which sectors to score
    sectors = list(SECTOR_ETFS.keys()) if all_sectors else [sector or TARGET_SECTOR]

    # Build the full ticker list
    tickers = list(SECTOR_ETFS.keys()) + [BENCHMARK, "^VIX", "^VIX3M"]
    for s in sectors:
        comm = SECTOR_COMMODITIES.get(s)
        if comm:
            tickers.append(comm)
    tickers = list(dict.fromkeys(tickers))

    print(f"\n[sector-model] Fetching data for {len(sectors)} sector(s) ...")

    print("  Prices (yfinance) ...")
    prices = fetch_prices(tickers)

    print("  Macro (FRED) ...")
    fred = fetch_fred()

    print("  Sentiment (CNN Fear/Greed) ...")
    fg = fetch_fear_greed()
    if fg is not None:
        print(f"    Fear/Greed index: {fg:.0f} / 100")
    else:
        print("    Fear/Greed: unavailable (skipped)")

    print()

    if all_sectors:
        # Score all sectors and rank them
        results = {}
        for s in sectors:
            results[s] = score_sector(s, prices, fred, fg)

        scored = sorted(
            [(s, r["composite"]) for s, r in results.items() if not np.isnan(r["composite"])],
            key=lambda x: x[1], reverse=True,
        )

        W = 64
        print("═" * W)
        print("  ALL-SECTOR RANKINGS")
        print("═" * W)
        print()
        for rank, (s, composite) in enumerate(scored, 1):
            name = SECTOR_ETFS.get(s, s)
            label = _direction_label(composite)
            print(f"  {rank:2d}.  {s:<5s}  {name:<28s}  {_bar(composite, 10)}  {_score_str(composite)}")
        print()
        print("═" * W)
        print("  ⚠  Research model only — not investment advice.")
        print("═" * W)
        print()

        if verbose:
            for s in [t for t, _ in scored]:
                print_score_sheet(s, results[s], verbose=True)
    else:
        result = score_sector(sectors[0], prices, fred, fg)
        print_score_sheet(sectors[0], result, verbose=verbose)


# ── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Sector Direction Model — composite signal scorer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py                      # score XLK (default)
  python main.py --sector XLE         # score Energy
  python main.py --sector XLF --verbose
  python main.py --all                # rank all 11 sectors
  python main.py --all --verbose      # rank + full breakdown
        """,
    )
    parser.add_argument(
        "--sector",
        default=None,
        choices=list(SECTOR_ETFS.keys()),
        help="Sector ETF ticker to score (default: TARGET_SECTOR in config.py)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Score and rank all 11 SPDR sector ETFs",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show per-feature sub-score breakdown",
    )

    args = parser.parse_args()
    run(sector=args.sector, verbose=args.verbose, all_sectors=args.all)
