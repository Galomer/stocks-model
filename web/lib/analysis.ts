import type { HistoricalScore, Horizon } from './types'

export type Pair = { score: number; ret: number; sector: string; date: string }

export function pairsForHorizon(rows: HistoricalScore[], horizon: Horizon): Pair[] {
  const out: Pair[] = []
  for (const r of rows) {
    const score = r.composite
    const ret   = r[horizon] as number | null
    if (score === null || ret === null) continue
    if (isNaN(score as number) || isNaN(ret as number)) continue
    out.push({ score: Number(score), ret: Number(ret), sector: r.sector, date: r.as_of_date })
  }
  return out
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
export function correlationBySector(rows: HistoricalScore[], horizon: Horizon): Array<{ sector: string; sector_name: string; corr: number; n: number }> {
  const bySector: Record<string, Pair[]> = {}
  for (const r of rows) {
    const v = r[horizon] as number | null
    if (r.composite === null || v === null || isNaN(r.composite as number) || isNaN(v as number)) continue
    if (!bySector[r.sector]) bySector[r.sector] = []
    bySector[r.sector].push({ score: Number(r.composite), ret: Number(v), sector: r.sector, date: r.as_of_date })
  }
  return Object.entries(bySector)
    .map(([sector, pairs]) => ({
      sector,
      sector_name: pairs[0]?.sector,
      corr: pearson(pairs),
      n: pairs.length,
    }))
    .map((row) => ({
      ...row,
      sector_name: rows.find((r) => r.sector === row.sector)?.sector_name ?? row.sector,
    }))
    .sort((a, b) => b.corr - a.corr)
}
