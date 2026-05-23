"""
optimize_weights.py — Learn data-driven feature weights from historical_scores.

Goals (after the upgrade):
  1. Predict 1-3 month forward returns (not just 3 month).
  2. Reject features whose predictive sign is unstable across regimes — if a
     feature works in 2019-2022 but breaks in 2023-2026 (or vice-versa) it has
     no business contributing to the live score.
  3. Use the *less impressive* of the two sub-period correlations as the
     weight magnitude, so a feature that only worked once doesn't dominate.

Scoring per feature:
  corr_full    = Pearson(feature, blended_fwd_return)   over the full history
  corr_h1      = Pearson(feature, blended_fwd_return)   over first half
  corr_h2      = Pearson(feature, blended_fwd_return)   over second half
  blended      = 0.5 * corr(feat, fwd_1m) + 0.5 * corr(feat, fwd_3m)

  if sign(corr_h1) != sign(corr_h2):    weight = 0   (DROPPED — unstable)
  else:                                 weight = min(|corr_h1|, |corr_h2|, |corr_full|)

  weight is then floored at NOISE_FLOOR (drops if below) and capped at MAX_WEIGHT.

Output:
  files/learned_weights.json
"""

import os
import json
import sys
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple

import requests

PAGE_SIZE     = 1000
HORIZONS      = ("fwd_return_1m", "fwd_return_3m")  # blended optimization target
HORIZON_W     = (0.5, 0.5)                          # blend weights, must sum to 1
NOISE_FLOOR   = 0.04                                 # drop features with stability-adjusted |corr| below this
MIN_WEIGHT    = 0.06                                 # if kept, weight is at least this much
MAX_WEIGHT    = 0.40                                 # cap so no single feature dominates
MIN_OBSERVATIONS  = 60                               # need this many obs in each sub-period


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
    select = "as_of_date,sector,features," + ",".join(HORIZONS)
    rows: List[dict] = []
    offset = 0
    while True:
        url = (
            f"{base}/rest/v1/historical_scores"
            f"?select={select}"
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


def blended_corr(xs: List[float], ys_by_horizon: Dict[str, List[float]]) -> float:
    """Weighted average of Pearson correlations against each horizon."""
    total = 0.0
    weight = 0.0
    for h, hw in zip(HORIZONS, HORIZON_W):
        ys = ys_by_horizon.get(h, [])
        if len(xs) != len(ys) or len(xs) < 30:
            continue
        total  += hw * pearson(xs, ys)
        weight += hw
    return total / weight if weight else 0.0


def split_half(items: List[Tuple]) -> Tuple[List[Tuple], List[Tuple]]:
    n = len(items)
    mid = n // 2
    return items[:mid], items[mid:]


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("[error] SUPABASE_URL and SUPABASE_SERVICE_KEY required")
        sys.exit(1)

    print(f"\n[optimize_weights] fetching history from Supabase ...")
    rows = fetch_all_history(url, key)
    print(f"  {len(rows)} rows total")
    if rows:
        first_date = rows[0].get("as_of_date")
        last_date = rows[-1].get("as_of_date")
        print(f"  date range: {first_date} → {last_date}")

    # Build per-feature observation lists across the FULL history, sorted by date.
    # Each tuple is (date, feature_value, {horizon: forward_return})
    by_feat: Dict[str, List[Tuple[str, float, Dict[str, float]]]] = defaultdict(list)

    for row in rows:
        as_of = row.get("as_of_date")
        feats = row.get("features") or {}
        if not as_of or not feats:
            continue
        targets = {h: row.get(h) for h in HORIZONS if row.get(h) is not None}
        if not targets:
            continue
        for name, val in feats.items():
            if val is None:
                continue
            by_feat[name].append((as_of, float(val), {h: float(v) for h, v in targets.items()}))

    if not by_feat:
        print("[error] No per-feature data found in historical_scores. Re-run backfill first.")
        sys.exit(2)

    print(f"\n  blended target = {HORIZON_W[0]:.0%}·corr({HORIZONS[0]}) + {HORIZON_W[1]:.0%}·corr({HORIZONS[1]})")
    print(f"  stability rule: drop features whose sign flips across sub-periods")
    print(f"  noise floor: |corr_min| ≥ {NOISE_FLOOR:.2f},  weight ∈ [{MIN_WEIGHT}, {MAX_WEIGHT}]")
    print()
    print(f"  {'feature':<28s} "
          f"{'n':>5s}  "
          f"{'h1':>+7s} "
          f"{'h2':>+7s} "
          f"{'full':>+7s}  "
          f"{'sign':>4s}  "
          f"{'wgt':>6s}  "
          f"verdict")

    weights: Dict[str, float] = {}
    signs:   Dict[str, int]   = {}
    stats:   Dict[str, dict]  = {}

    for name in sorted(by_feat):
        observations = by_feat[name]
        observations.sort(key=lambda t: t[0])
        h1, h2 = split_half(observations)

        def corr_for(obs: List[Tuple[str, float, Dict[str, float]]]) -> float:
            xs = [t[1] for t in obs]
            ys_by_h: Dict[str, List[float]] = {h: [] for h in HORIZONS}
            xs_aligned: Dict[str, List[float]] = {h: [] for h in HORIZONS}
            for _, v, tgts in obs:
                for h in HORIZONS:
                    if h in tgts:
                        ys_by_h[h].append(tgts[h])
                        xs_aligned[h].append(v)
            blended = 0.0
            wsum = 0.0
            for h, hw in zip(HORIZONS, HORIZON_W):
                if len(xs_aligned[h]) >= 30:
                    blended += hw * pearson(xs_aligned[h], ys_by_h[h])
                    wsum    += hw
            return blended / wsum if wsum else 0.0

        c_full = corr_for(observations)
        c_h1   = corr_for(h1) if len(h1) >= MIN_OBSERVATIONS else 0.0
        c_h2   = corr_for(h2) if len(h2) >= MIN_OBSERVATIONS else 0.0

        sign_full = 1 if c_full >= 0 else -1
        verdict = ""

        if len(h1) < MIN_OBSERVATIONS or len(h2) < MIN_OBSERVATIONS:
            # Not enough data to validate stability; still allow with reduced weight.
            stable_mag = abs(c_full) * 0.5
            verdict = "single-period"
            sign = sign_full
        elif (c_h1 >= 0) != (c_h2 >= 0):
            # Sign disagrees between halves — unstable, drop completely.
            stable_mag = 0.0
            verdict = "UNSTABLE → drop"
            sign = sign_full
        else:
            # Both halves agree.  Take the conservative magnitude.
            stable_mag = min(abs(c_h1), abs(c_h2), abs(c_full))
            verdict = "stable"
            sign = 1 if c_h1 >= 0 else -1

        if stable_mag < NOISE_FLOOR:
            weight = 0.0
            verdict = (verdict + ", below floor").strip(", ")
        else:
            weight = max(min(stable_mag, MAX_WEIGHT), MIN_WEIGHT)

        weights[name] = round(weight, 4)
        signs[name]   = sign
        stats[name]   = {
            "corr_full": round(c_full, 4),
            "corr_h1":   round(c_h1, 4),
            "corr_h2":   round(c_h2, 4),
            "n_full":    len(observations),
            "n_h1":      len(h1),
            "n_h2":      len(h2),
            "stability": "drop" if weight == 0 else verdict,
        }

        print(
            f"  {name:<28s} "
            f"{len(observations):>5d}  "
            f"{c_h1:>+7.3f} "
            f"{c_h2:>+7.3f} "
            f"{c_full:>+7.3f}  "
            f"{('+' if sign > 0 else '-'):>4s}  "
            f"{weight:>6.3f}  "
            f"{verdict}"
        )

    kept = sum(1 for w in weights.values() if w > 0)
    dropped = sum(1 for w in weights.values() if w == 0)
    print(f"\n  Kept: {kept} features.  Dropped: {dropped} features.")

    out = {
        "horizons": list(HORIZONS),
        "horizon_weights": list(HORIZON_W),
        "noise_floor": NOISE_FLOOR,
        "min_weight": MIN_WEIGHT,
        "max_weight": MAX_WEIGHT,
        "weights": weights,
        "signs":   signs,
        "stats":   stats,
    }
    target = Path(__file__).parent / "learned_weights.json"
    target.write_text(json.dumps(out, indent=2))
    print(f"\n  Wrote {target}")


if __name__ == "__main__":
    main()
