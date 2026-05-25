import Link from 'next/link'
import {
  PREDICTION_HORIZONS,
  PREDICTION_HORIZON_LABELS,
  predictionHorizonParam,
  type PredictionHorizon,
} from '@/lib/types'
import InfoTip from '@/components/InfoTip'

interface PredictionHorizonPickerProps {
  current: PredictionHorizon
  basePath?: string
  /** Extra query params to preserve (e.g. return mode on history page). */
  preserveParams?: Record<string, string>
}

export default function PredictionHorizonPicker({
  current,
  basePath = '/',
  preserveParams = {},
}: PredictionHorizonPickerProps) {
  function hrefFor(horizon: PredictionHorizon) {
    const params = new URLSearchParams(preserveParams)
    params.set('h', predictionHorizonParam(horizon))
    const q = params.toString()
    return q ? `${basePath}?${q}` : basePath
  }

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-2 inline-flex items-center gap-1.5">
        Prediction period
        <InfoTip
          what="Choose whether the score targets the next 1 month or 3 months. Each horizon uses its own weights learned from weekly backtests."
          why="Short-term and medium-term signals differ — momentum may matter more at 1 month, macro more at 3 months."
          align="start"
        />:
      </p>
      <div className="flex gap-1 p-1 rounded-lg border border-white/5 bg-white/[0.02] w-fit">
        {PREDICTION_HORIZONS.map((h) => (
          <Link
            key={h}
            href={hrefFor(h)}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              current === h
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {PREDICTION_HORIZON_LABELS[h]}
          </Link>
        ))}
      </div>
    </div>
  )
}
