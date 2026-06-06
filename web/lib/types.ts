export type SectorScore = {
  id: number
  run_date: string
  sector: string
  sector_name: string
  composite: number | null
  composite_1m: number | null
  composite_3m: number | null
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
  composite_1m: number | null
  composite_3m: number | null
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

/** Live prediction horizons (separate learned models). */
export type PredictionHorizon = 'fwd_return_1m' | 'fwd_return_3m'

export const PREDICTION_HORIZONS: PredictionHorizon[] = ['fwd_return_1m', 'fwd_return_3m']

export const PREDICTION_HORIZON_LABELS: Record<PredictionHorizon, string> = {
  fwd_return_1m: '1 Month',
  fwd_return_3m: '3 Months',
}

export function parsePredictionHorizon(v: string | undefined | null): PredictionHorizon {
  if (v === '3m' || v === 'fwd_return_3m') return 'fwd_return_3m'
  return 'fwd_return_1m'
}

/**
 * Year-months excluded from the model & backtest because they capture the
 * COVID crash (an exogenous shock the model cannot learn from).
 */
export const EXCLUDED_TRAINING_MONTHS = new Set(['2020-02', '2020-03', '2020-04'])

/** True if an as_of_date (YYYY-MM-DD) falls in an excluded training month. */
export function isExcludedTrainingDate(asOfDate: string): boolean {
  return EXCLUDED_TRAINING_MONTHS.has(asOfDate.slice(0, 7))
}

export function predictionHorizonParam(h: PredictionHorizon): string {
  return h === 'fwd_return_1m' ? '1m' : '3m'
}

export function compositeForPrediction(
  row: Pick<SectorScore, 'composite' | 'composite_1m' | 'composite_3m'>,
  horizon: PredictionHorizon,
): number | null {
  if (horizon === 'fwd_return_1m') {
    const v = row.composite_1m ?? row.composite
    return v !== null && !isNaN(v as number) ? Number(v) : null
  }
  const v = row.composite_3m ?? row.composite
  return v !== null && !isNaN(v as number) ? Number(v) : null
}

/** Match backtest score column to the return horizon being evaluated. */
export function predictionScoreForReturnHorizon(
  row: Pick<HistoricalScore, 'composite' | 'composite_1m' | 'composite_3m'>,
  returnHorizon: Horizon,
): number | null {
  if (returnHorizon === 'fwd_return_1m') {
    return compositeForPrediction(row, 'fwd_return_1m')
  }
  return compositeForPrediction(row, 'fwd_return_3m')
}

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

export type StockScore = {
  id: number
  run_date: string
  ticker: string
  name: string
  sector: string
  sector_name: string
  momentum_1m: number | null
  momentum_3m: number | null
  rank_in_sector_1m: number | null
  rank_in_sector_3m: number | null
  available: number | null
  coverage: number | null
  features: Record<string, number | null> | null
  created_at: string
}

export function stockScoreForHorizon(
  row: Pick<StockScore, 'momentum_1m' | 'momentum_3m'>,
  horizon: PredictionHorizon,
): number | null {
  const v = horizon === 'fwd_return_1m' ? row.momentum_1m : row.momentum_3m
  return v !== null && v !== undefined && !isNaN(v as number) ? Number(v) : null
}

export function stockRankForHorizon(
  row: Pick<StockScore, 'rank_in_sector_1m' | 'rank_in_sector_3m'>,
  horizon: PredictionHorizon,
): number | null {
  return horizon === 'fwd_return_1m' ? row.rank_in_sector_1m : row.rank_in_sector_3m
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
  if (score === null || isNaN(score)) return 'text-zinc-500'
  if (score >= 60)  return 'text-emerald-700'
  if (score >= 25)  return 'text-green-700'
  if (score >= -25) return 'text-yellow-700'
  if (score >= -60) return 'text-orange-700'
  return 'text-red-700'
}

export function directionBg(score: number | null): string {
  if (score === null || isNaN(score)) return 'bg-zinc-500/10 text-zinc-500'
  if (score >= 60)  return 'bg-emerald-500/15 text-emerald-700'
  if (score >= 25)  return 'bg-green-500/15 text-green-700'
  if (score >= -25) return 'bg-yellow-500/20 text-yellow-700'
  if (score >= -60) return 'bg-orange-500/15 text-orange-700'
  return 'bg-red-500/15 text-red-700'
}
