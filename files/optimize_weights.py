"""
optimize_weights.py — Learn data-driven feature weights from historical_scores.

For each feature, computes its Pearson correlation with the realized 3-month
forward return across all historical (date, sector) observations. The new
"learned weight" for each feature is the absolute correlation value, and the
"learned sign" is the sign of the correlation. Features that historically
predicted in the OPPOSITE direction of how they were signed in features.py
get flipped here.

Output is written to files/learned_weights.json:
    {
      "horizon": "fwd_return_3m",
      "weights": { "feature_name": float (positive),  ... },
      "signs":   { "feature_name": +1 or -1, ... },
      "stats":   { "feature_name": {"corr": ..., "n": ...}, ... }
    }

The runtime model (config.py / score.py) loads this file and applies it.
If the file is missing, the original equal weights are used.
"""

import os
import json
import sys
from pathlib import Path
from collections import defaultdict
from typing import Dict, List

import requests

HORIZON = "fwd_return_3m"  # weights are optimized against 3-month forward returns
PAGE_SIZE = 1000


def _strip_suffix(url: str) -> str:
    base = url.rstrip("/")
    for suffix in ("/rest/v1", "/rest", "/auth/v1", "/auth"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return base


def fetch_all_history(supabase_url: str, key: str) -> List[dict]:
    base = _strip_suffix(supabase_url)
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows: List[dict] = []
    offset = 0
    while True:
        url = (
            f"{base}/rest/v1/historical_scores"
            f"?select=as_of_date,sector,features,{HORIZON}"
            f"&order=as_of_date.asc"
        )
        resp = requests.get(
            url,
            headers={**headers, "Range": f"{offset}-{offset+PAGE_SIZE-1}"},
            timeout=60,
        )
        resp.raise_for_status()
        chunk = resp.json()
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def pearson(xs: List[float], ys: List[float]) -> float:
    n = len(xs)
    if n < 30:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    num = 0.0
    dx = 0.0
    dy = 0.0
    for x, y in zip(xs, ys):
        ex = x - mx
        ey = y - my
        num += ex * ey
        dx  += ex * ex
        dy  += ey * ey
    denom = (dx * dy) ** 0.5
    return num / denom if denom else 0.0


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("[error] SUPABASE_URL and SUPABASE_SERVICE_KEY required")
        sys.exit(1)

    print(f"\n[optimize_weights] fetching history ...")
    rows = fetch_all_history(url, key)
    print(f"  {len(rows)} rows")

    # Group per-feature observations
    feat_xs: Dict[str, List[float]] = defaultdict(list)
    feat_ys: Dict[str, List[float]] = defaultdict(list)

    for row in rows:
        ret = row.get(HORIZON)
        feats = row.get("features") or {}
        if ret is None or not feats:
            continue
        for name, val in feats.items():
            if val is None:
                continue
            feat_xs[name].append(float(val))
            feat_ys[name].append(float(ret))

    if not feat_xs:
        print("[error] No per-feature data found. Re-run backfill first.")
        sys.exit(2)

    stats: Dict[str, dict] = {}
    weights: Dict[str, float] = {}
    signs:   Dict[str, int]   = {}

    print(f"\n  Per-feature correlation with {HORIZON}:")
    print(f"  {'feature':<28s}  {'n':>6s}  {'corr':>8s}  -> {'weight':>7s} (sign)")
    for name in sorted(feat_xs):
        xs = feat_xs[name]
        ys = feat_ys[name]
        corr = pearson(xs, ys)
        # Use absolute correlation as weight magnitude. Floor at 0.05 to keep
        # very-low-signal features quiet but not entirely zeroed (would lose
        # context). Cap at 1.5 so no single feature dominates.
        weight = max(min(abs(corr), 1.5), 0.05) if abs(corr) >= 0.02 else 0.0
        sign = 1 if corr >= 0 else -1
        weights[name] = round(weight, 4)
        signs[name]   = sign
        stats[name]   = {"corr": round(corr, 4), "n": len(xs)}
        print(f"  {name:<28s}  {len(xs):>6d}  {corr:>+8.3f}  -> {weight:>6.3f} ({'+' if sign>0 else '-'})")

    out = {"horizon": HORIZON, "weights": weights, "signs": signs, "stats": stats}
    target = Path(__file__).parent / "learned_weights.json"
    target.write_text(json.dumps(out, indent=2))
    print(f"\n  Wrote {target}")


if __name__ == "__main__":
    main()
