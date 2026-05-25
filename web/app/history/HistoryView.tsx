'use client'

import { useMemo, useState } from 'react'
import type { HistoricalScore, Horizon, ReturnMode } from '@/lib/types'
import { HORIZON_LABELS } from '@/lib/types'
import { pairsForHorizon, bucketize, pearson, correlationBySector } from '@/lib/analysis'
import ScatterPlot from '@/components/ScatterPlot'
import InfoTip from '@/components/InfoTip'
import { TrendingUp, AlertTriangle, BarChart3, HelpCircle } from 'lucide-react'

const HORIZONS: Horizon[] = ['fwd_return_1m', 'fwd_return_3m', 'fwd_return_6m', 'fwd_return_1y']

export default function HistoryView({ rows }: { rows: HistoricalScore[] }) {
  const [horizon, setHorizon] = useState<Horizon>('fwd_return_3m')
  const [returnMode, setReturnMode] = useState<ReturnMode>('excess')

  const pairs    = useMemo(() => pairsForHorizon(rows, horizon, returnMode), [rows, horizon, returnMode])
  const buckets  = useMemo(() => bucketize(pairs), [pairs])
  const corr     = useMemo(() => pearson(pairs), [pairs])
  const bySector = useMemo(() => correlationBySector(rows, horizon, returnMode), [rows, horizon, returnMode])

  const returnLabel = returnMode === 'excess'
    ? `vs the S&P 500 over the next ${HORIZON_LABELS[horizon].toLowerCase()}`
    : `over the next ${HORIZON_LABELS[horizon].toLowerCase()}`

  const dateRange = useMemo(() => {
    if (!rows.length) return null
    const dates = rows.map((r) => r.as_of_date).sort()
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [rows])

  const totalSamples = pairs.length

  const bullishAvg = useMemo(() => {
    const all = buckets.filter((x) => x.min >= 25 && x.n > 0)
    const n = all.reduce((a, b) => a + b.n, 0)
    if (!n) return null
    return all.reduce((a, b) => a + b.meanReturn * b.n, 0) / n
  }, [buckets])

  const bearishAvg = useMemo(() => {
    const all = buckets.filter((x) => x.max <= -25 && x.n > 0)
    const n = all.reduce((a, b) => a + b.n, 0)
    if (!n) return null
    return all.reduce((a, b) => a + b.meanReturn * b.n, 0) / n
  }, [buckets])

  if (!rows.length) {
    return (
      <div className="space-y-8">
        <Header />
        <EmptyState />
      </div>
    )
  }

  // Plain-English verdict on the model based on correlation strength + sign
  const verdict = (() => {
    if (corr > 0.2)   return { tone: 'green',  text: 'Higher scores have led to higher returns. The model worked at this horizon.' }
    if (corr > 0.05)  return { tone: 'green',  text: 'Higher scores have slightly led to higher returns. The model has been mildly useful.' }
    if (corr > -0.05) return { tone: 'gray',   text: 'No clear relationship. The score did not reliably predict returns at this horizon.' }
    if (corr > -0.2)  return { tone: 'red',    text: 'Higher scores have slightly led to lower returns — the model has been mildly contrarian.' }
    return                  { tone: 'red',    text: 'Higher scores have led to lower returns — the model has been a contrarian indicator at this horizon.' }
  })()

  return (
    <div className="space-y-8">
      <Header />

      {/* How to read */}
      <div className="rounded-xl border border-blue-500/10 bg-blue-500/[0.04] p-5 flex gap-3 text-sm text-zinc-300">
        <HelpCircle className="w-5 h-5 shrink-0 mt-0.5 text-blue-400" />
        <div className="space-y-2">
          <p className="font-medium text-white">How to read this page</p>
          <p>
            Every Friday since January 2019, we re-calculated each sector&rsquo;s score using the same model
            you see on the &ldquo;Today&rdquo; page (with no peeking at future data). Then we tracked what
            actually happened to each sector&rsquo;s price 1, 3, 6, and 12 months later.
          </p>
          <p className="text-zinc-400">
            <span className="font-medium text-zinc-300">A working model</span> would mean high scores led to
            better outcomes than low scores. For 1-month and 3-month backtests, each uses its own trained
            prediction score. Because 2019–2026 was mostly a rising market, use &ldquo;vs S&P 500&rdquo; below
            to see whether the score picked winners, not just up markets.
          </p>
        </div>
      </div>

      {/* Date range */}
      {dateRange && (
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
          <span>Data range: <span className="text-zinc-300">{dateRange.from}</span> → <span className="text-zinc-300">{dateRange.to}</span></span>
          <span>Total observations: <span className="text-zinc-300 tabular-nums">{totalSamples.toLocaleString()}</span></span>
        </div>
      )}

      {/* Horizon tabs */}
      <div className="space-y-4">
        <div>
          <p className="text-xs text-zinc-500 mb-2 inline-flex items-center gap-1.5">
            Look ahead by
            <InfoTip
              what="Choose how far into the future you want to compare. We measure the sector's actual price change over that period after each score."
              why="Some signals work over weeks, others over months. The model's edge is strongest at the 3 and 6-month horizons."
              align="start"
            />:
          </p>
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
        </div>

        <div>
          <p className="text-xs text-zinc-500 mb-2 inline-flex items-center gap-1.5">
            Compare returns
            <InfoTip
              what="Absolute = raw sector price change. vs S&P 500 = sector return minus SPY — did this sector beat the broad market?"
              why="The model is trained to rank sectors (who beats the market), not predict whether prices go up. vs S&P 500 removes the bull-market lift that clusters dots in the top-left."
              align="start"
            />:
          </p>
          <div className="flex gap-1 p-1 rounded-lg border border-white/5 bg-white/[0.02] w-fit">
            <button
              onClick={() => setReturnMode('excess')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                returnMode === 'excess'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              vs S&amp;P 500
            </button>
            <button
              onClick={() => setReturnMode('absolute')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                returnMode === 'absolute'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Absolute price change
            </button>
          </div>
        </div>
      </div>

      {/* Plain-English verdict */}
      <div className={`rounded-xl border p-5 ${
        verdict.tone === 'green' ? 'border-green-500/20 bg-green-500/[0.05]' :
        verdict.tone === 'red'   ? 'border-red-500/20   bg-red-500/[0.05]'   :
                                   'border-white/10    bg-white/[0.02]'
      }`}>
        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
          The verdict ({HORIZON_LABELS[horizon]}{returnMode === 'excess' ? ', vs S&P 500' : ''})
        </p>
        <p className="text-base text-white">{verdict.text}</p>
      </div>

      {/* Headline stats — plain English */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PlainStat
          label={`When the score said BULLISH (+25 or higher)`}
          value={bullishAvg !== null ? `${bullishAvg >= 0 ? '+' : ''}${(bullishAvg * 100).toFixed(2)}%` : 'n/a'}
          hint={`Average return ${returnLabel}`}
          color={bullishAvg !== null && bullishAvg > 0 ? 'green' : 'red'}
          info={{
            what: 'The simple average price change for every (sector, day) where the model gave a Bullish or Strongly Bullish score (+25 to +100).',
            why:  'If the model works, this number should be meaningfully positive — and ideally larger than the bearish-case number below.',
          }}
        />
        <PlainStat
          label="When the score said BEARISH (−25 or lower)"
          value={bearishAvg !== null ? `${bearishAvg >= 0 ? '+' : ''}${(bearishAvg * 100).toFixed(2)}%` : 'n/a'}
          hint={`Average return ${returnLabel}`}
          color={bearishAvg !== null && bearishAvg > 0 ? 'green' : 'red'}
          info={{
            what: 'The simple average price change for every (sector, day) where the model gave a Bearish or Strongly Bearish score (−25 to −100).',
            why:  'If the model works, this number should be lower than the bullish-case number — ideally negative or near zero.',
          }}
        />
      </div>

      {/* Bucket table — plain English */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            What happened after each kind of score
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Sorted by how strong the signal was. &ldquo;Times this happened&rdquo; counts every (sector, day)
            where the score landed in that range.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-xs text-zinc-500 uppercase tracking-wider">
              <tr>
                <th className="text-left  font-medium px-5 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    When the score said…
                    <InfoTip
                      what="The five score bands the model produces, from very bearish (−100 to −60) to very bullish (+60 to +100)."
                      why="Grouping individual scores into bands lets us see how outcomes differ between strongly bullish, mildly bullish, neutral, and bearish reads."
                      align="start"
                    />
                  </span>
                </th>
                <th className="text-right font-medium px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    Times this happened
                    <InfoTip
                      what="How many (sector, day) observations fell into this score band over the 3-year backtest."
                      why="Bands with very few observations are noisy. Trust patterns more when the count is large."
                      align="end"
                    />
                  </span>
                </th>
                <th className="text-right font-medium px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    Average price change
                    <InfoTip
                      what="The arithmetic mean of every observation's forward return for this score band."
                      why="The headline question — what would you have earned, on average, by holding the sector for the chosen horizon after seeing this score?"
                      align="end"
                    />
                  </span>
                </th>
                <th className="text-right font-medium px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    Typical price change
                    <InfoTip
                      what="The median forward return — the middle observation when you line them all up from worst to best."
                      why="Less affected by extreme moves than the average. If the median is much lower than the mean, a few big winners are doing the lifting."
                      align="end"
                    />
                  </span>
                </th>
                <th className="text-right font-medium px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    % of time price went up
                    <InfoTip
                      what="The percentage of observations in this band where the forward return was positive (greater than zero)."
                      why="Tells you whether the band was directionally correct more often than not — separate from how big the moves were."
                      align="end"
                    />
                  </span>
                </th>
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
        <p className="px-5 py-3 text-xs text-zinc-500 border-t border-white/5">
          <strong className="text-zinc-300">Reading the table:</strong>
          {' '}If the model worked, you&rsquo;d see the &ldquo;Average price change&rdquo; column getting more
          positive as you move down the rows (from bearish to bullish). If the column moves the wrong way,
          the model has been a contrarian signal.
        </p>
      </div>

      {/* Scatter plot */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4" />
          Every observation, plotted
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          Each dot is one sector on one day. Left/right = score that day. Up/down = return {returnLabel}.
          If the model worked, dots should slope from bottom-left to top-right.
          {returnMode === 'absolute' && (
            <> In a rising market, many dots sit above zero even with negative scores — switch to &ldquo;vs S&amp;P 500&rdquo; for a fairer read.</>
          )}
        </p>
        <ScatterPlot pairs={pairs} horizonLabel={returnMode === 'excess' ? `${HORIZON_LABELS[horizon]} vs SPY` : HORIZON_LABELS[horizon]} />
      </div>

      {/* Per-sector */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-zinc-200 inline-flex items-center gap-1.5">
            Did the score work for each sector?
            <InfoTip
              what={`Pearson correlation between the score and the next ${HORIZON_LABELS[horizon].toLowerCase()} price change, calculated separately for each of the 11 sectors.`}
              why="The model can work overall yet be uneven across sectors. This breakdown shows where the model is genuinely useful and where it isn't."
              align="start"
            />
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            How much the score and actual return moved together for each sector, over the next {HORIZON_LABELS[horizon].toLowerCase()}.
            R² shows what fraction of return variation the score explained. Green bars = score was helpful. Red bars = score was misleading.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-xs text-zinc-500 uppercase tracking-wider">
              <tr>
                <th className="text-left  font-medium px-5 py-3">Sector</th>
                <th className="text-right font-medium px-5 py-3">Observations</th>
                <th className="text-right font-medium px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    R²
                    <InfoTip
                      what="R-squared: the share of forward return variation that the score explains for this sector. 4% means the score accounted for about 4% of the ups and downs — the rest was noise or other factors."
                      why="Correlation tells you direction and strength together; R² is easier to read as “how much did the model actually explain?”"
                      align="end"
                    />
                  </span>
                </th>
                <th className="text-right font-medium px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    How well it predicted
                    <InfoTip
                      what='A short verdict ranging from "Backwards" through "No real signal" to "Worked well" — based on how strongly the score and forward return moved together.'
                      why="Translates the underlying correlation number into a quick read so you don't have to know what 0.18 means."
                      align="end"
                    />
                  </span>
                </th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {bySector.map((row) => {
                const c = row.corr
                const r2 = row.r2
                const color = c > 0.1 ? 'text-green-400' : c < -0.1 ? 'text-red-400' : 'text-zinc-300'
                const r2Color = r2 >= 0.04 ? 'text-green-400' : r2 >= 0.01 ? 'text-zinc-300' : 'text-zinc-500'
                const barWidth = Math.max(2, Math.abs(c) * 200)
                const verdict =
                  c >  0.2  ? 'Worked well'      :
                  c >  0.05 ? 'Mildly helpful'   :
                  c > -0.05 ? 'No real signal'   :
                  c > -0.2  ? 'Mildly contrarian':
                              'Backwards'
                return (
                  <tr key={row.sector} className="border-t border-white/5">
                    <td className="px-5 py-3">
                      <span className="font-mono font-semibold text-white">{row.sector}</span>{' '}
                      <span className="text-zinc-500">{row.sector_name}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-400">{row.n}</td>
                    <td className={`px-5 py-3 text-right tabular-nums text-sm font-medium ${r2Color}`}>
                      {(r2 * 100).toFixed(1)}%
                    </td>
                    <td className={`px-5 py-3 text-right text-xs font-medium ${color}`}>
                      {verdict}
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
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-4 flex gap-3 text-sm text-amber-400/80">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Important caveats: this sample runs from 2019 through today and includes several very
          different market regimes, but it is still one historical window. Past performance does not
          predict future performance. This is research, not investment advice.
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
        <span>Track Record</span>
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
        Has the score actually predicted prices?
      </h1>
      <p className="text-zinc-400 text-sm max-w-2xl">
        We re-ran the model every Friday going back to January 2019 and compared each score to
        what the sector&rsquo;s price actually did over the next 1, 3, 6, and 12 months — across
        multiple bull and bear cycles.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] py-20 text-center space-y-3">
      <div className="text-4xl">📊</div>
      <p className="text-zinc-400 text-sm">No historical data yet.</p>
      <p className="text-zinc-600 text-xs">Run the &ldquo;Backfill Historical Scores&rdquo; workflow to populate this view.</p>
    </div>
  )
}

function PlainStat({
  label, value, hint, color, info,
}: {
  label: string
  value: string
  hint: string
  color: 'green' | 'red' | 'gray'
  info?: { what: string; why?: string }
}) {
  const valueColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-zinc-200'
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-5 space-y-1.5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider inline-flex items-center gap-1.5">
        {label}
        {info && <InfoTip what={info.what} why={info.why} align="start" />}
      </p>
      <p className={`text-3xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  )
}
