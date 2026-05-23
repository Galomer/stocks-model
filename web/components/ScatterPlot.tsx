'use client'

import { useMemo, useState } from 'react'
import type { Pair } from '@/lib/analysis'

interface ScatterPlotProps {
  pairs: Pair[]
  horizonLabel: string
}

const SECTOR_COLORS: Record<string, string> = {
  XLK: '#60a5fa', XLV: '#34d399', XLF: '#fbbf24', XLE: '#f97316',
  XLI: '#a78bfa', XLY: '#f472b6', XLP: '#22d3ee', XLU: '#84cc16',
  XLB: '#fb923c', XLRE:'#94a3b8', XLC: '#e879f9',
}

export default function ScatterPlot({ pairs, horizonLabel }: ScatterPlotProps) {
  const [hover, setHover] = useState<Pair | null>(null)
  const [hoverSector, setHoverSector] = useState<string | null>(null)
  const [pinnedSector, setPinnedSector] = useState<string | null>(null)

  const activeSector = pinnedSector ?? hoverSector

  const visiblePairs = useMemo(
    () => (pinnedSector ? pairs.filter((p) => p.sector === pinnedSector) : pairs),
    [pairs, pinnedSector],
  )

  const { width, height, padding, xScale, yScale, xMin, xMax, yMin, yMax } = useMemo(() => {
    const W = 720, H = 360, P = 36
    const sx = visiblePairs.map((p) => p.score)
    const sy = visiblePairs.map((p) => p.ret)
    const xMin = Math.min(-100, sx.length ? Math.floor(Math.min(...sx)) : -100)
    const xMax = Math.max(100, sx.length ? Math.ceil(Math.max(...sx)) : 100)
    const dy = sy.length ? Math.max(Math.abs(Math.min(...sy)), Math.abs(Math.max(...sy)), 0.02) : 0.2
    const yMin = -dy * 1.1
    const yMax =  dy * 1.1
    const xScale = (v: number) => P + ((v - xMin) / (xMax - xMin)) * (W - 2 * P)
    const yScale = (v: number) => H - P - ((v - yMin) / (yMax - yMin)) * (H - 2 * P)
    return { width: W, height: H, padding: P, xScale, yScale, xMin, xMax, yMin, yMax }
  }, [visiblePairs])

  if (!pairs.length) {
    return (
      <div className="text-sm text-zinc-500 text-center py-12">
        No data points available.
      </div>
    )
  }

  const sectors = Array.from(new Set(pairs.map((p) => p.sector))).sort()

  function togglePin(sector: string) {
    setPinnedSector((prev) => (prev === sector ? null : sector))
    setHoverSector(null)
    setHover(null)
  }

  return (
    <div className="space-y-3">
      {pinnedSector && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-zinc-400">
            Showing only{' '}
            <span className="font-mono font-semibold" style={{ color: SECTOR_COLORS[pinnedSector] ?? 'white' }}>
              {pinnedSector}
            </span>
            {' '}({visiblePairs.length} points)
          </span>
          <button
            type="button"
            onClick={() => setPinnedSector(null)}
            className="text-zinc-400 hover:text-white underline underline-offset-2"
          >
            Show all sectors
          </button>
        </div>
      )}

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          onMouseLeave={() => setHover(null)}
        >
          {/* Quadrant fill */}
          <rect
            x={xScale(0)} y={yScale(yMax)}
            width={xScale(xMax) - xScale(0)} height={yScale(0) - yScale(yMax)}
            fill="rgba(52,211,153,0.04)"
          />
          <rect
            x={xScale(xMin)} y={yScale(0)}
            width={xScale(0) - xScale(xMin)} height={yScale(yMin) - yScale(0)}
            fill="rgba(248,113,113,0.04)"
          />

          {/* Axes through 0 */}
          <line x1={xScale(xMin)} x2={xScale(xMax)} y1={yScale(0)} y2={yScale(0)} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          <line x1={xScale(0)} x2={xScale(0)} y1={yScale(yMin)} y2={yScale(yMax)} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

          {/* Grid */}
          {[-50, 50].map((v) => (
            <line key={v} x1={xScale(v)} x2={xScale(v)} y1={yScale(yMin)} y2={yScale(yMax)} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          ))}

          {/* Tick labels */}
          {[xMin, -50, 0, 50, xMax].map((v) => (
            <text key={v} x={xScale(v)} y={height - padding + 18} fontSize="10" fill="#71717a" textAnchor="middle">
              {v > 0 ? `+${v}` : v}
            </text>
          ))}
          {[yMin, yMin / 2, 0, yMax / 2, yMax].map((v, i) => (
            <text key={i} x={padding - 6} y={yScale(v) + 3} fontSize="10" fill="#71717a" textAnchor="end">
              {(v * 100).toFixed(0)}%
            </text>
          ))}

          {/* Axis titles */}
          <text x={width / 2} y={height - 4} fontSize="11" fill="#a1a1aa" textAnchor="middle">
            Composite Score
          </text>
          <text x={12} y={height / 2} fontSize="11" fill="#a1a1aa" textAnchor="middle"
                transform={`rotate(-90, 12, ${height / 2})`}>
            Forward Return ({horizonLabel})
          </text>

          {/* Points — when not pinned, render all with dimming; when pinned, only visiblePairs */}
          {(pinnedSector ? visiblePairs : pairs).map((p, i) => {
            const dim = !pinnedSector && activeSector && activeSector !== p.sector
            return (
              <circle
                key={`${p.sector}-${p.date}-${i}`}
                cx={xScale(p.score)}
                cy={yScale(p.ret)}
                r={hover === p ? 4.5 : pinnedSector ? 3 : 2.4}
                fill={SECTOR_COLORS[p.sector] ?? '#9ca3af'}
                fillOpacity={dim ? 0.05 : pinnedSector ? 0.85 : 0.6}
                stroke={hover === p ? '#fff' : 'none'}
                strokeWidth={hover === p ? 1.5 : 0}
                onMouseEnter={() => setHover(p)}
                style={{ cursor: 'pointer', transition: 'r 100ms' }}
              />
            )
          })}
        </svg>

        {hover && (
          <div className="absolute top-2 right-2 bg-zinc-900 border border-white/10 rounded-md px-3 py-2 text-xs space-y-0.5 pointer-events-none">
            <div className="font-mono font-semibold" style={{ color: SECTOR_COLORS[hover.sector] ?? 'white' }}>
              {hover.sector}
            </div>
            <div className="text-zinc-400">{hover.date}</div>
            <div className="text-zinc-300">
              Score: <span className="tabular-nums">{hover.score > 0 ? '+' : ''}{hover.score.toFixed(1)}</span>
            </div>
            <div className="text-zinc-300">
              Return: <span className="tabular-nums">{hover.ret >= 0 ? '+' : ''}{(hover.ret * 100).toFixed(2)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Sector legend — click to pin, hover to highlight when not pinned */}
      <p className="text-center text-[11px] text-zinc-600">
        Hover to highlight · click to pin one sector
      </p>
      <div className="flex flex-wrap gap-2 justify-center pt-1 text-xs">
        {sectors.map((s) => {
          const isPinned = pinnedSector === s
          const isActive = activeSector === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => togglePin(s)}
              onMouseEnter={() => { if (!pinnedSector) setHoverSector(s) }}
              onMouseLeave={() => { if (!pinnedSector) setHoverSector(null) }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${
                isPinned
                  ? 'border-white/30 bg-white/10 text-white'
                  : isActive
                    ? 'border-white/20 bg-white/5 text-zinc-200'
                    : 'border-white/10 hover:bg-white/5 text-zinc-300'
              }`}
              aria-pressed={isPinned}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: SECTOR_COLORS[s] ?? '#9ca3af' }} />
              <span className="font-mono">{s}</span>
              {isPinned && <span className="text-[10px] text-zinc-400">pinned</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
