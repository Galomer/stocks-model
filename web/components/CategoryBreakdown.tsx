'use client'

import ScoreBar from './ScoreBar'
import { CATEGORY_ORDER, CATEGORY_LABELS, type SectorScore } from '@/lib/types'

interface CategoryBreakdownProps {
  score: SectorScore
}

export default function CategoryBreakdown({ score }: CategoryBreakdownProps) {
  return (
    <div className="space-y-3">
      {CATEGORY_ORDER.map((cat) => {
        const val = score[cat] as number | null
        const isNull = val === null || val === undefined || isNaN(val)
        return (
          <div key={cat} className="grid grid-cols-[100px_1fr_52px] items-center gap-3">
            <span className="text-sm text-gray-400">{CATEGORY_LABELS[cat]}</span>
            <ScoreBar score={val} size="sm" />
            <span className="text-sm tabular-nums text-right text-gray-300">
              {isNull ? 'n/a' : `${val! > 0 ? '+' : ''}${val!.toFixed(1)}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
