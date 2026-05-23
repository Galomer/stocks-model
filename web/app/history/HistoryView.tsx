'use client'

import { useMemo, useState } from 'react'
import type { HistoricalScore, Horizon } from '@/lib/types'
import { HORIZON_LABELS } from '@/lib/types'
import { pairsForHorizon, bucketize, pearson, correlationBySector } from '@/lib/analysis'
import ScatterPlot from '@/components/ScatterPlot'
import { TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react'

const HORIZONS: Horizon[] = ['fwd_return_1m', 'fwd_return_3m', 'fwd_return_6m', 'fwd_return_1y']

export default function HistoryView({ rows }: { rows: HistoricalScore[] }) {
  const [horizon, setHorizon] = useState<Horizon>('fwd_return_3m')

  const pairs    = useMemo(() => pairsForHorizon(rows, horizon), [rows, horizon])
  const buckets  = useMemo(() => bucketize(pairs), [pairs])
  const corr     = useMemo(() => pearson(pairs), [pairs])
  const bySector = useMemo(() => correlationBySector(rows, horizon), [rows, horizon])

  const dateRange = useMemo(() => {
    if (!rows.length) return null
    const dates = rows.map((r) => r.as_of_date).sort()
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [rows])

  const totalSamples = pairs.length

  if (!rows.length) {
    return (
      <div className="space-y-8">
        <Header />
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Header />

      {/* Meta info */}
      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        {dateRange && (
          <span>Range: <span className="text-zinc-300">{dateRange.from}</span> → <span className="text-zinc-300">{dateRange.to}</span></span>
        )}
        <span>Samples: <span className="text-zinc-300 tabular-nums">{totalSamples.toLocaleString()}</span></span>
        <span>Sectors: <span className="text-zinc-300">11</span></span>
      </div>

      {/* Horizon tabs */}
      <div className="flex gap-1 p-1 rounded-lg border border-white/5 bg-white/[0.02] w-fit">
        {HORIZONS.map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              horizon === h
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {HORIZON_LABELS[h]}
          </button>
        ))}
      </div>

      {/* Headline correlation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Score ↔ Return Correlation"
          value={corr.toFixed(3)}
          hint={
            corr >  0.2 ? 'Strong positive — model predictive' :
            corr >  0.05 ? 'Mild positive' :
            corr > -0.05 ? 'No clear relationship' :
            corr > -0.2 ? 'Mild negative' :
                          'Negative — model inverted'
          }
          color={corr > 0.05 ? 'green' : corr < -0.05 ? 'red' : 'gray'}
        />
        <StatCard
          label="Bullish Avg Return"
          value={
            (() => {
              const b = buckets.find((x) => x.label.startsWith('Bullish') || x.label.startsWith('Strongly Bullish'))
              const all = buckets.filter((x) => x.min >= 25 && x.n > 0)
              const totalN = all.reduce((a, b) => a + b.n, 0)
              if (!totalN) return 'n/a'
              const w = all.reduce((a, b) => a + b.meanReturn * b.n, 0) / totalN
              return `${w >= 0 ? '+' : ''}${(w * 100).toFixed(2)}%`
            })()
          }
          hint="When score ≥ +25"
          color="green"
        />
        <StatCard
          label="Bearish Avg Return"
          value={
            (() => {
              const all = buckets.filter((x) => x.max <= -25 && x.n > 0)
              const totalN = all.reduce((a, b) => a + b.n, 0)
              if (!totalN) return 'n/a'
              const w = all.reduce((a, b) => a + b.meanReturn * b.n, 0) / totalN
              return `${w >= 0 ? '+' : ''}${(w * 100).toFixed(2)}%`
            })()
          }
          hint="When score ≤ −25"
          color="red"
        />
      </div>

      {/* Bucket table */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Forward Returns by Score Band  ·  {HORIZON_LABELS[horizon]}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            For each composite score band, the average and median realized {HORIZON_LABELS[horizon].toLowerCase()} return.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-xs text-zinc-500 uppercase tracking-wider">
            <tr>
              <th className="text-left  font-medium px-5 py-3">Score Band</th>
              <th className="text-right font-medium px-5 py-3">N</th>
              <th className="text-right font-medium px-5 py-3">Mean Return</th>
              <th className="text-right font-medium px-5 py-3">Median Return</th>
              <th className="text-right font-medium px-5 py-3">Hit Rate</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => {
              const color =
                b.meanReturn > 0.005  ? 'text-green-400'  :
                b.meanReturn < -0.005 ? 'text-red-400'    :
                                        'text-zinc-300'
              return (
                <tr key={b.label} className="border-t border-white/5">
                  <td className="px-5 py-3 text-zinc-300">{b.label}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-400">{b.n.toLocaleString()}</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-medium ${color}`}>
                    {b.n ? `${b.meanReturn >= 0 ? '+' : ''}${(b.meanReturn * 100).toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-400">
                    {b.n ? `${b.median >= 0 ? '+' : ''}${(b.median * 100).toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-400">
                    {b.n ? `${(b.hitRate * 100).toFixed(0)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Scatter plot */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4" />
          Score vs Forward Return  ·  {HORIZON_LABELS[horizon]}
        </h2>
        <ScatterPlot pairs={pairs} horizonLabel={HORIZON_LABELS[horizon]} />
      </div>

      {/* Per-sector correlation */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-zinc-200">
            Per-Sector Correlation  ·  {HORIZON_LABELS[horizon]}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            How well the composite score predicts forward returns within each sector.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-xs text-zinc-500 uppercase tracking-wider">
            <tr>
              <th className="text-left  font-medium px-5 py-3">Sector</th>
              <th className="text-right font-medium px-5 py-3">Samples</th>
              <th className="text-right font-medium px-5 py-3">Correlation</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {bySector.map((row) => {
              const c = row.corr
              const color = c > 0.1 ? 'text-green-400' : c < -0.1 ? 'text-red-400' : 'text-zinc-300'
              const barWidth = Math.max(2, Math.abs(c) * 200)
              return (
                <tr key={row.sector} className="border-t border-white/5">
                  <td className="px-5 py-3">
                    <span className="font-mono font-semibold text-white">{row.sector}</span>{' '}
                    <span className="text-zinc-500">{row.sector_name}</span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-400">{row.n}</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-medium ${color}`}>
                    {c >= 0 ? '+' : ''}{c.toFixed(3)}
                  </td>
                  <td className="px-5 py-3 w-48">
                    <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30" />
                      <div
                        className={`absolute top-0 bottom-0 ${c >= 0 ? 'bg-green-400' : 'bg-red-400'} rounded-sm`}
                        style={{
                          left: c >= 0 ? '50%' : `calc(50% - ${barWidth}px)`,
                          width: `${barWidth}px`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-4 flex gap-3 text-sm text-amber-400/80">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Backfilled scores were computed point-in-time (no look-ahead): for each as-of date, the
          model only sees data available up to that day. Historical Fear/Greed is unavailable so the
          backfill omits that single feature (coverage ≈ 95%). Past performance is not predictive of future returns.
        </p>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <BarChart3 className="w-4 h-4" />
        <span>Backtest</span>
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
        Score vs Forward Return
      </h1>
      <p className="text-zinc-400 text-sm max-w-xl">
        How well has the composite signal predicted realized sector returns? This view runs the
        same model on every business day for the past 3 years and compares to actual 1M / 3M /
        6M / 1Y returns.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] py-20 text-center space-y-3">
      <div className="text-4xl">📊</div>
      <p className="text-zinc-400 text-sm">No historical data yet.</p>
      <p className="text-zinc-600 text-xs">Run the &quot;Backfill Historical Scores&quot; workflow to populate this view.</p>
    </div>
  )
}

function StatCard({
  label, value, hint, color,
}: {
  label: string
  value: string
  hint: string
  color: 'green' | 'red' | 'gray'
}) {
  const valueColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-zinc-200'
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-1.5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  )
}
