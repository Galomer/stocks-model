'use client'

interface ScoreBarProps {
  score: number | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showValue?: boolean
}

export default function ScoreBar({ score, size = 'md', showValue = false }: ScoreBarProps) {
  const isNull = score === null || score === undefined || isNaN(score)
  const clamped = isNull ? 0 : Math.max(-100, Math.min(100, score))

  const trackH = size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2'

  const fillColor = isNull
    ? 'bg-zinc-600'
    : clamped >= 60
    ? 'bg-emerald-600'
    : clamped >= 25
    ? 'bg-green-600'
    : clamped >= -25
    ? 'bg-yellow-500'
    : clamped >= -60
    ? 'bg-orange-500'
    : 'bg-red-500'

  const leftPct  = clamped >= 0 ? 50 : 50 + clamped / 2
  const widthPct = Math.abs(clamped) / 2

  return (
    <div className="flex items-center gap-2 w-full">
      <div className={`relative w-full ${trackH} bg-white/10 rounded-full overflow-hidden`}>
        {/* Center tick */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30 z-10" />
        {!isNull && (
          <div
            className={`absolute top-0 bottom-0 ${fillColor} rounded-sm transition-all duration-500`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
        )}
      </div>
      {showValue && (
        <span className="text-xs tabular-nums text-gray-400 w-10 text-right shrink-0">
          {isNull ? 'n/a' : `${clamped > 0 ? '+' : ''}${clamped.toFixed(1)}`}
        </span>
      )}
    </div>
  )
}
