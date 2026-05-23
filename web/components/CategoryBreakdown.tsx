'use client'

import ScoreBar from './ScoreBar'
import InfoTip from './InfoTip'
import { CATEGORY_ORDER, CATEGORY_LABELS, type SectorScore } from '@/lib/types'
import { CATEGORY_INFO } from '@/lib/descriptions'
import { interpretCategoryScore } from '@/lib/scoreInterpretation'

interface CategoryBreakdownProps {
  score: SectorScore
}

export default function CategoryBreakdown({ score }: CategoryBreakdownProps) {
  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((cat) => {
        const val = score[cat] as number | null
        const isNull = val === null || val === undefined || isNaN(val)
        const info = CATEGORY_INFO[cat]
        return (
          <div key={cat} className="space-y-1.5 pb-3 border-b border-white/5 last:border-0 last:pb-0">
            <div className="grid grid-cols-[120px_1fr_52px] items-center gap-3">
              <span className="text-sm text-gray-400 inline-flex items-center gap-1.5 shrink-0">
                {CATEGORY_LABELS[cat]}
                {info && <InfoTip what={info.what} why={info.why} align="start" placement="bottom" />}
              </span>
              <ScoreBar score={val} size="sm" />
              <span className="text-sm tabular-nums text-right text-gray-300">
                {isNull ? 'n/a' : `${val! > 0 ? '+' : ''}${val!.toFixed(1)}`}
              </span>
            </div>
            {!isNull && (
              <p className="text-xs text-zinc-500 leading-relaxed pr-14">
                {interpretCategoryScore(cat, val)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
