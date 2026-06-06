'use client'

import type { StockScore, PredictionHorizon } from '@/lib/types'
import { stockScoreForHorizon, stockRankForHorizon, directionColor, directionBg, directionLabel } from '@/lib/types'
import { SECTOR_HOLDINGS } from '@/lib/sectorHoldings'
import ScoreBar from '@/components/ScoreBar'

interface SectorHoldingsProps {
  sector: string
  stockScores?: StockScore[] | null
  horizon?: PredictionHorizon
}

export default function SectorHoldings({
  sector,
  stockScores,
  horizon = 'fwd_return_3m',
}: SectorHoldingsProps) {
  // Fallback: no stock scores yet → show the static holdings list (no scores)
  if (!stockScores || stockScores.length === 0) {
    const holdings = SECTOR_HOLDINGS[sector.toUpperCase()]
    if (!holdings || !holdings.length) return null
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {holdings.map((h, i) => (
          <div
            key={h.ticker}
            className="grid grid-cols-[1.75rem_4.25rem_1fr] items-baseline gap-2 text-sm py-1 border-b border-white/5 last:border-0 sm:[&:nth-last-child(2)]:border-0"
          >
            <span className="text-xs tabular-nums text-zinc-600">
              {(i + 1).toString().padStart(2, '0')}
            </span>
            <span className="font-mono text-xs font-semibold text-zinc-200">{h.ticker}</span>
            <span className="text-xs text-zinc-500 truncate">{h.name}</span>
          </div>
        ))}
      </div>
    )
  }

  // Sort by the selected horizon's rank (unranked go last)
  const sorted = [...stockScores].sort((a, b) => {
    const ra = stockRankForHorizon(a, horizon) ?? 9999
    const rb = stockRankForHorizon(b, horizon) ?? 9999
    return ra - rb
  })

  const hasScores = sorted.some((s) => stockScoreForHorizon(s, horizon) !== null)

  return (
    <div className="space-y-1">
      {hasScores && (
        <div className="grid grid-cols-[1.75rem_4.25rem_1fr_90px_84px] gap-2 px-1 pb-1 border-b border-white/5 text-xs text-zinc-600 font-medium uppercase tracking-wide">
          <span>#</span>
          <span>Ticker</span>
          <span>Name</span>
          <span className="text-right">Score</span>
          <span className="text-right">Signal</span>
        </div>
      )}

      {sorted.map((h, i) => {
        const score = stockScoreForHorizon(h, horizon)
        const rank  = stockRankForHorizon(h, horizon)
        return (
          <div
            key={h.ticker}
            className="grid gap-2 items-center text-sm py-1.5 border-b border-white/5 last:border-0"
            style={{ gridTemplateColumns: hasScores ? '1.75rem 4.25rem 1fr 90px 84px' : '1.75rem 4.25rem 1fr' }}
          >
            <span className="text-xs tabular-nums text-zinc-600">
              {(rank ?? i + 1).toString().padStart(2, '0')}
            </span>

            <span className="font-mono text-xs font-semibold text-zinc-200">
              {h.ticker}
            </span>

            <span className="text-xs text-zinc-500 truncate">{h.name}</span>

            {hasScores && (
              <>
                <div className="flex flex-col items-end gap-0.5">
                  <span className={`text-xs font-semibold tabular-nums ${directionColor(score)}`}>
                    {score !== null
                      ? `${score > 0 ? '+' : ''}${score.toFixed(1)}`
                      : '—'}
                  </span>
                  <ScoreBar score={score} size="xs" />
                </div>
                <div className="text-right">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${directionBg(score)}`}>
                    {score !== null ? directionLabel(score) : '—'}
                  </span>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
