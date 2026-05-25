import type { HistoricalScore, Horizon, ReturnHorizon, ReturnMode } from './types'
import { EXCESS_HORIZON, SPY_HORIZON, predictionScoreForReturnHorizon } from './types'

export type Pair = { score: number; ret: number; sector: string; date: string }

const ALL_HORIZONS: Horizon[] = ['fwd_return_1m', 'fwd_return_3m', 'fwd_return_6m', 'fwd_return_1y']

export function returnColumn(horizon: Horizon, mode: ReturnMode): ReturnHorizon {
  return mode === 'excess' ? EXCESS_HORIZON[horizon] : horizon
}

/** Infer SPY forward return per date from rows that already have excess populated. */
function buildSpyReturnsByDate(rows: HistoricalScore[]): Map<string, Partial<Record<Horizon, number>>> {
  const byDate = new Map<string, Partial<Record<Horizon, number>>>()
  for (const r of rows) {
    for (const h of ALL_HORIZONS) {
      const abs = r[h] as number | null
      const exc = r[EXCESS_HORIZON[h]] as number | null
      if (abs === null || exc === null || isNaN(abs as number) || isNaN(exc as number)) continue
      const spy = Number(abs) - Number(exc)
      const bucket = byDate.get(r.as_of_date) ?? {}
      if (bucket[h] === undefined) bucket[h] = spy
      byDate.set(r.as_of_date, bucket)
    }
  }
  return byDate
}

function resolveReturn(
  row: HistoricalScore,
  horizon: Horizon,
  mode: ReturnMode,
  spyByDate: Map<string, Partial<Record<Horizon, number>>>,
): number | null {
  if (mode === 'absolute') {
    const v = row[horizon] as number | null
    if (v === null || isNaN(v as number)) return null
    return Number(v)
  }

  const stored = row[EXCESS_HORIZON[horizon]] as number | null
  if (stored !== null && !isNaN(stored as number)) return Number(stored)

  const abs = row[horizon] as number | null
  const spyStored = row[SPY_HORIZON[horizon]] as number | null
  const spy = spyStored !== null && !isNaN(spyStored as number)
    ? Number(spyStored)
    : spyByDate.get(row.as_of_date)?.[horizon]
  if (abs === null || spy === undefined || isNaN(abs as number)) return null
  return Number(abs) - spy
}

export function pairsForHorizon(
  rows: HistoricalScore[],
  horizon: Horizon,
  mode: ReturnMode = 'absolute',
): Pair[] {
  const spyByDate = mode === 'excess' ? buildSpyReturnsByDate(rows) : null
  const out: Pair[] = []
  for (const r of rows) {
    const score = predictionScoreForReturnHorizon(r, horizon)
    const ret = resolveReturn(r, horizon, mode, spyByDate ?? new Map())
    if (score === null || ret === null) continue
    if (isNaN(score) || isNaN(ret)) continue
    out.push({ score, ret, sector: r.sector, date: r.as_of_date })
  }
  return out
}

export function excessCoverage(rows: HistoricalScore[], horizon: Horizon): { usable: number; total: number } {
  const pairs = pairsForHorizon(rows, horizon, 'excess')
  const absPairs = pairsForHorizon(rows, horizon, 'absolute')
  return { usable: pairs.length, total: absPairs.length }
}

export type Bucket = {
  label: string
  min: number
  max: number
  n: number
  meanReturn: number
  hitRate: number     // fraction of positive returns
  median: number
}

const BUCKET_DEFS: Array<[string, number, number]> = [
  ['Strongly bearish (sell signal, score ≤ −60)',  -200, -60],
  ['Bearish (−60 to −25)',                          -60, -25],
  ['Neutral (−25 to +25, no strong signal)',        -25,  25],
  ['Bullish (+25 to +60)',                           25,  60],
  ['Strongly bullish (buy signal, score ≥ +60)',     60, 200],
]

export function bucketize(pairs: Pair[]): Bucket[] {
  return BUCKET_DEFS.map(([label, min, max]) => {
    const inBucket = pairs.filter((p) => p.score >= min && p.score < max)
    if (!inBucket.length) {
      return { label, min, max, n: 0, meanReturn: 0, hitRate: 0, median: 0 }
    }
    const rets = inBucket.map((p) => p.ret)
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const sorted = [...rets].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const hits = rets.filter((r) => r > 0).length
    return {
      label, min, max,
      n: rets.length,
      meanReturn: mean,
      hitRate: hits / rets.length,
      median,
    }
  })
}

/** Pearson correlation coefficient. */
export function pearson(pairs: Pair[]): number {
  const n = pairs.length
  if (n < 2) return 0
  const xs = pairs.map((p) => p.score)
  const ys = pairs.map((p) => p.ret)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - mx
    const ey = ys[i] - my
    num += ex * ey
    dx  += ex * ex
    dy  += ey * ey
  }
  const denom = Math.sqrt(dx * dy)
  return denom === 0 ? 0 : num / denom
}

/** R² for score → forward return (share of return variance explained by the score). */
export function rSquared(pairs: Pair[]): number {
  const r = pearson(pairs)
  return r * r
}

export type SectorBacktestStats = {
  sector: string
  sector_name: string
  corr: number
  r2: number
  n: number
}

/** Mean forward return per sector for a given horizon. */
export function meanReturnBySector(rows: HistoricalScore[], horizon: Horizon): Record<string, { sector: string; sector_name: string; mean: number; n: number }> {
  const acc: Record<string, { sector_name: string; total: number; n: number }> = {}
  for (const r of rows) {
    const v = r[horizon] as number | null
    if (v === null || isNaN(v as number)) continue
    if (!acc[r.sector]) acc[r.sector] = { sector_name: r.sector_name, total: 0, n: 0 }
    acc[r.sector].total += Number(v)
    acc[r.sector].n += 1
  }
  const out: ReturnType<typeof meanReturnBySector> = {}
  for (const sector of Object.keys(acc)) {
    out[sector] = {
      sector,
      sector_name: acc[sector].sector_name,
      mean: acc[sector].total / acc[sector].n,
      n: acc[sector].n,
    }
  }
  return out
}

/**
 * For each sector, correlation between its score and forward return at given horizon.
 * Useful to see which sectors the model predicts best.
 */
export function correlationBySector(
  rows: HistoricalScore[],
  horizon: Horizon,
  mode: ReturnMode = 'absolute',
): SectorBacktestStats[] {
  const spyByDate = mode === 'excess' ? buildSpyReturnsByDate(rows) : new Map()
  const bySector: Record<string, Pair[]> = {}
  for (const r of rows) {
    const v = resolveReturn(r, horizon, mode, spyByDate)
    const score = predictionScoreForReturnHorizon(r, horizon)
    if (score === null || v === null || isNaN(score)) continue
    if (!bySector[r.sector]) bySector[r.sector] = []
    bySector[r.sector].push({ score, ret: v, sector: r.sector, date: r.as_of_date })
  }
  return Object.entries(bySector)
    .map(([sector, pairs]) => ({
      sector,
      sector_name: pairs[0]?.sector,
      corr: pearson(pairs),
      r2: rSquared(pairs),
      n: pairs.length,
    }))
    .map((row) => ({
      ...row,
      sector_name: rows.find((r) => r.sector === row.sector)?.sector_name ?? row.sector,
    }))
    .sort((a, b) => b.corr - a.corr)
}
