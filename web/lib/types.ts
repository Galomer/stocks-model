export type SectorScore = {
  id: number
  run_date: string
  sector: string
  sector_name: string
  composite: number | null
  momentum: number | null
  macro: number | null
  sentiment: number | null
  regime: number | null
  coverage: number | null
  available: number | null
  features: Record<string, FeatureDetail> | null
  created_at: string
}

export type HistoricalScore = {
  id: number
  as_of_date: string
  sector: string
  sector_name: string
  composite: number | null
  momentum: number | null
  macro: number | null
  sentiment: number | null
  regime: number | null
  available: number | null
  coverage: number | null
  fwd_return_1m: number | null
  fwd_return_3m: number | null
  fwd_return_6m: number | null
  fwd_return_1y: number | null
  fwd_return_1m_excess: number | null
  fwd_return_3m_excess: number | null
  fwd_return_6m_excess: number | null
  fwd_return_1y_excess: number | null
  fwd_spy_return_1m: number | null
  fwd_spy_return_3m: number | null
  fwd_spy_return_6m: number | null
  fwd_spy_return_1y: number | null
}

export type Horizon = 'fwd_return_1m' | 'fwd_return_3m' | 'fwd_return_6m' | 'fwd_return_1y'

export type ExcessHorizon = 'fwd_return_1m_excess' | 'fwd_return_3m_excess' | 'fwd_return_6m_excess' | 'fwd_return_1y_excess'

export type ReturnHorizon = Horizon | ExcessHorizon

export type ReturnMode = 'absolute' | 'excess'

export const HORIZON_LABELS: Record<Horizon, string> = {
  fwd_return_1m: '1 Month',
  fwd_return_3m: '3 Months',
  fwd_return_6m: '6 Months',
  fwd_return_1y: '1 Year',
}

export const EXCESS_HORIZON: Record<Horizon, ExcessHorizon> = {
  fwd_return_1m: 'fwd_return_1m_excess',
  fwd_return_3m: 'fwd_return_3m_excess',
  fwd_return_6m: 'fwd_return_6m_excess',
  fwd_return_1y: 'fwd_return_1y_excess',
}

export const SPY_HORIZON: Record<Horizon, keyof HistoricalScore> = {
  fwd_return_1m: 'fwd_spy_return_1m',
  fwd_return_3m: 'fwd_spy_return_3m',
  fwd_return_6m: 'fwd_spy_return_6m',
  fwd_return_1y: 'fwd_spy_return_1y',
}

export type FeatureDetail = {
  score: number | null
  weight: number
  contribution: number
  category: string
}

export type CategoryKey = 'momentum' | 'macro' | 'sentiment' | 'regime'

export const CATEGORY_ORDER: CategoryKey[] = ['momentum', 'macro', 'sentiment', 'regime']

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  momentum: 'Momentum',
  macro: 'Macro & Rates',
  sentiment: 'Sentiment',
  regime: 'Market Breadth',
}

export const SECTOR_DESCRIPTIONS: Record<string, string> = {
  XLK:  'Technology',
  XLV:  'Health Care',
  XLF:  'Financials',
  XLE:  'Energy',
  XLI:  'Industrials',
  XLY:  'Consumer Discretionary',
  XLP:  'Consumer Staples',
  XLU:  'Utilities',
  XLB:  'Materials',
  XLRE: 'Real Estate',
  XLC:  'Communication Services',
}

export function directionLabel(score: number | null): string {
  if (score === null || isNaN(score)) return 'No Data'
  if (score >= 60)  return 'Strongly Bullish'
  if (score >= 25)  return 'Bullish'
  if (score >= -25) return 'Neutral'
  if (score >= -60) return 'Bearish'
  return 'Strongly Bearish'
}

export function directionColor(score: number | null): string {
  if (score === null || isNaN(score)) return 'text-gray-400'
  if (score >= 60)  return 'text-emerald-400'
  if (score >= 25)  return 'text-green-400'
  if (score >= -25) return 'text-yellow-400'
  if (score >= -60) return 'text-orange-400'
  return 'text-red-400'
}

export function directionBg(score: number | null): string {
  if (score === null || isNaN(score)) return 'bg-gray-500/10 text-gray-400'
  if (score >= 60)  return 'bg-emerald-500/10 text-emerald-400'
  if (score >= 25)  return 'bg-green-500/10 text-green-400'
  if (score >= -25) return 'bg-yellow-500/10 text-yellow-400'
  if (score >= -60) return 'bg-orange-500/10 text-orange-400'
  return 'bg-red-500/10 text-red-400'
}
