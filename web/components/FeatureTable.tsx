'use client'

import { CATEGORY_ORDER, CATEGORY_LABELS, type SectorScore, type CategoryKey } from '@/lib/types'
import ScoreBar from './ScoreBar'
import InfoTip from './InfoTip'
import { getFeatureInfo, CATEGORY_INFO } from '@/lib/descriptions'
import { interpretFeatureScore } from '@/lib/scoreInterpretation'

interface FeatureTableProps {
  score: SectorScore
}

const FEATURE_LABELS: Record<string, string> = {
  price_vs_50dma:           'Price vs 50-Day MA',
  price_vs_200dma:          'Price vs 200-Day MA',
  roc_1m:                   'Rate of Change (1M)',
  roc_3m:                   'Rate of Change (3M)',
  roc_6m:                   'Rate of Change (6M)',
  relative_strength_3m:     'Relative Strength vs SPY (3M)',
  rsi:                      'RSI',
  dist_52w_high:            'Distance from 52-Week High',
  yield_curve_slope:        'Yield Curve Slope (10Y−2Y)',
  yield_curve_chg_1m:       'Yield Curve Change (1M)',
  real_yield_level:         'Real 10Y Yield (TIPS)',
  hy_spread_level:          'HY Credit Spread',
  hy_spread_chg_1m:         'HY Credit Spread Change (1M)',
  ig_spread_level:          'IG Credit Spread',
  usd_change_3m:            'USD Index Change (3M)',
  commodity_change_3m:      'Commodity Price Change (3M)',
  bond_equity_ratio_chg_3m: 'Bond/Equity Ratio Change (3M)',
  vix_level:                'VIX Level',
  vix_term_structure:       'VIX Term Structure',
  fear_greed:               'CNN Fear & Greed Index',
  vix_pctile_1y:            'VIX Percentile (1Y)',
  cyclical_vs_defensive:    'Cyclical vs Defensive (XLY/XLP)',
  sector_vs_market_corr:    'Sector–Market Correlation',
  breadth_above_50dma:      'Sector Breadth (% above 50-DMA)',
}

const WEIGHT_INFO = {
  what: 'How much influence this signal has in today\'s composite score (learned from 2019–2026 backtests).',
  why: 'Higher weight = this signal moved the headline score more. A feature can have a high weight even when its raw reading looks counter-intuitive — that is intentional mean-reversion logic.',
}

export default function FeatureTable({ score }: FeatureTableProps) {
  if (!score.features) return null

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Each row shows what the model expects ahead, not what already happened. Hover the{' '}
        <span className="text-zinc-400">(i)</span> on any line for a full explanation.
      </p>

      {CATEGORY_ORDER.map((cat) => {
        const features = Object.entries(score.features!).filter(
          ([, v]) => v.category === cat
        )
        if (!features.length) return null

        const catInfo = CATEGORY_INFO[cat]

        return (
          <div key={cat} className="overflow-visible">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3 inline-flex items-center gap-1.5">
              {CATEGORY_LABELS[cat as CategoryKey]}
              {catInfo && (
                <InfoTip what={catInfo.what} why={catInfo.why} align="start" placement="bottom" />
              )}
            </h3>

            <div className="hidden sm:grid grid-cols-[1fr_140px_56px_48px] gap-3 text-[10px] uppercase tracking-wider text-zinc-600 mb-2 px-0.5">
              <span>Signal</span>
              <span>Score (forward view)</span>
              <span className="text-right">Value</span>
              <span className="text-right inline-flex items-center justify-end gap-1">
                Wt
                <InfoTip what={WEIGHT_INFO.what} why={WEIGHT_INFO.why} align="end" placement="bottom" size="sm" />
              </span>
            </div>

            <div className="space-y-3">
              {features.map(([name, detail]) => {
                const scaled = detail.score !== null ? detail.score * 100 : null
                const isNull = scaled === null || isNaN(scaled)
                const info = getFeatureInfo(name)
                const hint = interpretFeatureScore(name, scaled)

                return (
                  <div key={name} className="space-y-1 overflow-visible">
                    <div className="grid grid-cols-[1fr_140px_56px_48px] items-center gap-3 text-sm">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-gray-300">
                          {FEATURE_LABELS[name] ?? name}
                        </span>
                        <InfoTip
                          what={info.what}
                          why={info.why}
                          align="start"
                          placement="bottom"
                        />
                      </span>
                      <ScoreBar score={scaled} size="sm" />
                      <span className="tabular-nums text-right text-gray-400">
                        {isNull ? 'n/a' : `${scaled! > 0 ? '+' : ''}${scaled!.toFixed(1)}`}
                      </span>
                      <span className="tabular-nums text-right text-gray-600 text-xs">
                        {detail.weight.toFixed(2)}
                      </span>
                    </div>
                    {hint && (
                      <p className="text-[11px] text-zinc-600 leading-snug pl-0.5">{hint}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
