import { createClient } from '@supabase/supabase-js'
import type { SectorScore, HistoricalScore } from './types'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

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
  return (data ?? []) as SectorScore[]
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
  return (data ?? null) as SectorScore | null
}

export async function getHistoricalScores(sector: string, limit = 90): Promise<SectorScore[]> {
  const { data } = await supabase
    .from('sector_scores')
    .select('run_date, composite, momentum, macro, sentiment, regime')
    .eq('sector', sector)
    .order('run_date', { ascending: false })
    .limit(limit)
  return ((data ?? []) as SectorScore[]).reverse()
}

export async function getAllHistoricalScores(): Promise<HistoricalScore[]> {
  // Supabase caps at ~1000 rows per request; page through to fetch ~3y × 11 sectors ≈ 1700 rows
  const all: HistoricalScore[] = []
  const pageSize = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_scores')
      .select('as_of_date, sector, sector_name, composite, momentum, macro, sentiment, regime, fwd_return_1m, fwd_return_3m, fwd_return_6m, fwd_return_1y')
      .order('as_of_date', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error || !data || data.length === 0) break
    all.push(...(data as HistoricalScore[]))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}
