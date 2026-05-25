import { createClient } from '@supabase/supabase-js'
import type { SectorScore, HistoricalScore } from './types'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeSectorScore(row: Record<string, unknown>): SectorScore {
  const base = row as unknown as SectorScore
  return {
    ...base,
    composite: toNum(row.composite),
    composite_1m: toNum(row.composite_1m),
    composite_3m: toNum(row.composite_3m),
    momentum: toNum(row.momentum),
    macro: toNum(row.macro),
    sentiment: toNum(row.sentiment),
    regime: toNum(row.regime),
    coverage: toNum(row.coverage),
    available: row.available != null ? Number(row.available) : null,
  }
}

function normalizeHistoricalScore(row: Record<string, unknown>): HistoricalScore {
  const base = row as unknown as HistoricalScore
  return {
    ...base,
    composite: toNum(row.composite),
    composite_1m: toNum(row.composite_1m),
    composite_3m: toNum(row.composite_3m),
    momentum: toNum(row.momentum),
    macro: toNum(row.macro),
    sentiment: toNum(row.sentiment),
    regime: toNum(row.regime),
    coverage: toNum(row.coverage),
    available: row.available != null ? Number(row.available) : null,
    fwd_return_1m: toNum(row.fwd_return_1m),
    fwd_return_3m: toNum(row.fwd_return_3m),
    fwd_return_6m: toNum(row.fwd_return_6m),
    fwd_return_1y: toNum(row.fwd_return_1y),
    fwd_return_1m_excess: toNum(row.fwd_return_1m_excess),
    fwd_return_3m_excess: toNum(row.fwd_return_3m_excess),
    fwd_return_6m_excess: toNum(row.fwd_return_6m_excess),
    fwd_return_1y_excess: toNum(row.fwd_return_1y_excess),
    fwd_spy_return_1m: toNum(row.fwd_spy_return_1m),
    fwd_spy_return_3m: toNum(row.fwd_spy_return_3m),
    fwd_spy_return_6m: toNum(row.fwd_spy_return_6m),
    fwd_spy_return_1y: toNum(row.fwd_spy_return_1y),
  }
}

export async function getLatestRunDate(): Promise<string | null> {
  const { data } = await supabase
    .from('sector_scores')
    .select('run_date')
    .order('run_date', { ascending: false })
    .limit(1)
    .single()
  return data?.run_date ?? null
}

export async function getAllSectorScores(runDate?: string): Promise<SectorScore[]> {
  let date = runDate
  if (!date) {
    date = await getLatestRunDate() ?? undefined
    if (!date) return []
  }
  const { data } = await supabase
    .from('sector_scores')
    .select('*')
    .eq('run_date', date)
    .order('composite', { ascending: false })
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeSectorScore)
}

export async function getSectorScore(sector: string, runDate?: string): Promise<SectorScore | null> {
  let date = runDate
  if (!date) {
    date = await getLatestRunDate() ?? undefined
    if (!date) return null
  }
  const { data } = await supabase
    .from('sector_scores')
    .select('*')
    .eq('run_date', date)
    .eq('sector', sector)
    .single()
  return data ? normalizeSectorScore(data as Record<string, unknown>) : null
}

export async function getHistoricalScores(sector: string, limit = 90): Promise<SectorScore[]> {
  const { data } = await supabase
    .from('sector_scores')
    .select('run_date, composite, composite_1m, composite_3m, momentum, macro, sentiment, regime')
    .eq('sector', sector)
    .order('run_date', { ascending: false })
    .limit(limit)
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeSectorScore).reverse()
}

export async function getAllHistoricalScores(): Promise<HistoricalScore[]> {
  // Supabase caps at ~1000 rows per request; page through to fetch ~3y × 11 sectors ≈ 1700 rows
  const all: HistoricalScore[] = []
  const pageSize = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_scores')
      .select('as_of_date, sector, sector_name, composite, composite_1m, composite_3m, momentum, macro, sentiment, regime, fwd_return_1m, fwd_return_3m, fwd_return_6m, fwd_return_1y, fwd_return_1m_excess, fwd_return_3m_excess, fwd_return_6m_excess, fwd_return_1y_excess, fwd_spy_return_1m, fwd_spy_return_3m, fwd_spy_return_6m, fwd_spy_return_1y')
      .order('as_of_date', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) {
      console.error('[getAllHistoricalScores]', error.message, 'offset', offset)
      break
    }
    if (!data || data.length === 0) break
    all.push(...(data as Record<string, unknown>[]).map(normalizeHistoricalScore))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}
