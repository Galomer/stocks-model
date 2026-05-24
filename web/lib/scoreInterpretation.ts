import type { CategoryKey } from './types'

type Band = 'positive' | 'negative' | 'neutral'

function band(score: number | null): Band {
  if (score === null || isNaN(score)) return 'neutral'
  if (score >= 25) return 'positive'
  if (score <= -25) return 'negative'
  return 'neutral'
}

/** One-line plain-English read of a category score (forward-looking, not past price direction). */
export function interpretCategoryScore(cat: CategoryKey, score: number | null): string {
  if (score === null || isNaN(score)) return 'Not enough data for this category today.'

  const b = band(score)

  const text: Record<CategoryKey, Record<Band, string>> = {
    momentum: {
      negative:
        'Recent price strength looks stretched. This does not mean the sector is falling right now — it means the model sees higher pullback risk over the next 1–3 months.',
      positive:
        'Recent weakness may be overdone. The model sees room for prices to recover over the next 1–3 months.',
      neutral:
        'Price trends look balanced — no strong “stretched rally” or “deep washout” signal.',
    },
    macro: {
      negative:
        'Rates, credit, or the dollar look like headwinds for this sector over the next 1–3 months.',
      positive:
        'The macro backdrop (rates, credit, dollar) looks supportive for this sector ahead.',
      neutral:
        'Macro signals are mixed — no clear tailwind or headwind.',
    },
    sentiment: {
      negative:
        'Markets look calm or complacent. That can feel good today, but historically it has often preceded weaker forward returns.',
      positive:
        'Fear or stress is elevated. That often marks better forward returns ahead (a “buy the dip” setup).',
      neutral:
        'Sentiment is neither extreme fear nor extreme greed.',
    },
    regime: {
      negative:
        'Participation looks narrow, or recent “risk-on” leadership may be due to reverse over the next 1–3 months.',
      positive:
        'Market breadth and risk appetite look healthy — a supportive backdrop for this sector ahead.',
      neutral:
        'Market breadth signals are mixed.',
    },
  }

  return text[cat][b]
}

/** Short hint under an individual feature score. */
export function interpretFeatureScore(featureName: string, score: number | null): string | null {
  if (score === null || isNaN(score)) return null
  const b = band(score)

  const momentumFeatures = new Set([
    'price_vs_50dma', 'price_vs_200dma', 'roc_1m', 'roc_3m', 'roc_6m',
    'relative_strength_3m', 'rsi', 'dist_52w_high',
  ])
  const meanRevertFeatures = new Set([
    'breadth_above_50dma', 'cyclical_vs_defensive', 'bond_equity_ratio_chg_3m',
    'hy_spread_level', 'ig_spread_level', 'vix_level', 'vix_term_structure',
    'vix_pctile_1y', 'commodity_change_3m', 'price_vs_50dma', 'price_vs_200dma',
    'roc_1m', 'roc_3m', 'roc_6m', 'relative_strength_3m', 'rsi',
  ])

  if (momentumFeatures.has(featureName) && b === 'negative') {
    return 'Stretched / strong recently → model flags pullback risk ahead'
  }
  if (momentumFeatures.has(featureName) && b === 'positive') {
    return 'Weak or washed out recently → model sees bounce potential ahead'
  }
  if (meanRevertFeatures.has(featureName) && b === 'negative') {
    return 'Conditions look “too good” → model expects less upside ahead'
  }
  if (meanRevertFeatures.has(featureName) && b === 'positive') {
    return 'Conditions look stressed or washed out → model expects recovery ahead'
  }
  if (b === 'negative') return 'Leaning against this sector over the next 1–3 months'
  if (b === 'positive') return 'Supportive for this sector over the next 1–3 months'
  return null
}

export const SCORE_READING_GUIDE = {
  title: 'Scores look forward, not backward',
  body:
    'Every number on this page is about what the model expects over the next 1–3 months — not whether the sector has been going up or down lately. When a sector like XLK has had a strong run, momentum inputs often turn negative because the model treats that strength as “stretched” and flags higher pullback risk ahead. A negative momentum bar does not mean price is falling today.',
}
