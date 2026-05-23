'use client'

import { CATEGORY_ORDER, CATEGORY_LABELS, type SectorScore, type CategoryKey } from '@/lib/types'
import ScoreBar from './ScoreBar'
import InfoTip from './InfoTip'
import { FEATURE_INFO, CATEGORY_INFO } from '@/lib/descriptions'

interface FeatureTableProps {
  score: SectorScore
}

const FEATURE_LABELS: Record<string, string> = {
  price_vs_50dma:        'Price vs 50-Day MA',
  price_vs_200dma:       'Price vs 200-Day MA',
  roc_1m:                'Rate of Change (1M)',
  roc_3m:                'Rate of Change (3M)',
  roc_6m:                'Rate of Change (6M)',
  relative_strength_3m:  'Relative Strength vs SPY (3M)',
  rsi:                   'RSI',
  yield_curve_slope:     'Yield Curve Slope (10Y−2Y)',
  yield_curve_chg_1m:    'Yield Curve Change (1M)',
  real_yield_level:      'Real 10Y Yield (TIPS)',
  hy_spread_level:       'HY Credit Spread',
  hy_spread_chg_1m:      'HY Credit Spread Change (1M)',
  ig_spread_level:       'IG Credit Spread',
  usd_change_3m:         'USD Index Change (3M)',
  commodity_change_3m:   'Commodity Price Change (3M)',
  vix_level:             'VIX Level',
  vix_term_structure:    'VIX Term Structure',
  fear_greed:            'CNN Fear & Greed Index',
  cyclical_vs_defensive: 'Cyclical vs Defensive (XLY/XLP)',
  sector_vs_market_corr: 'Sector–Market Correlation',
}

export default function FeatureTable({ score }: FeatureTableProps) {
  if (!score.features) return null

  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((cat) => {
        const features = Object.entries(score.features!).filter(
          ([, v]) => v.category === cat
        )
        if (!features.length) return null

        const catInfo = CATEGORY_INFO[cat]

        return (
          <div key={cat}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3 inline-flex items-center gap-1.5">
              {CATEGORY_LABELS[cat as CategoryKey]}
              {catInfo && <InfoTip what={catInfo.what} why={catInfo.why} align="start" />}
            </h3>
            <div className="space-y-2">
              {features.map(([name, detail]) => {
                const scaled = detail.score !== null ? detail.score * 100 : null
                const isNull = scaled === null || isNaN(scaled)
                const info = FEATURE_INFO[name]
                return (
                  <div
                    key={name}
                    className="grid grid-cols-[1fr_140px_52px_44px] items-center gap-3 text-sm"
                  >
                    <span className="text-gray-300 truncate inline-flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{FEATURE_LABELS[name] ?? name}</span>
                      {info && <InfoTip what={info.what} why={info.why} align="start" />}
                    </span>
                    <ScoreBar score={scaled} size="sm" />
                    <span className="tabular-nums text-right text-gray-400">
                      {isNull ? 'n/a' : `${scaled! > 0 ? '+' : ''}${scaled!.toFixed(1)}`}
                    </span>
                    <span className="tabular-nums text-right text-gray-600 text-xs">
                      w={detail.weight}
                    </span>
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
