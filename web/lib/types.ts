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
  regime: 'Regime',
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
