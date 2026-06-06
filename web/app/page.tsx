import { getAllSectorScores, getLatestRunDate } from '@/lib/supabase'
import {
  directionLabel,
  directionBg,
  directionColor,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  compositeForPrediction,
  parsePredictionHorizon,
  predictionHorizonParam,
  PREDICTION_HORIZON_LABELS,
} from '@/lib/types'
import ScoreBar from '@/components/ScoreBar'
import InfoTip from '@/components/InfoTip'
import PredictionHorizonPicker from '@/components/PredictionHorizonPicker'
import { CATEGORY_INFO, COMPOSITE_INFO } from '@/lib/descriptions'
import { TrendingUp, Calendar, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ h?: string }>
}

export default async function HomePage({ searchParams }: Props) {
  const { h } = await searchParams
  const predHorizon = parsePredictionHorizon(h)

  const [scores, latestDate] = await Promise.all([
    getAllSectorScores(),
    getLatestRunDate(),
  ])

  const ranked = [...scores].sort((a, b) => {
    const av = compositeForPrediction(a, predHorizon) ?? -999
    const bv = compositeForPrediction(b, predHorizon) ?? -999
    return bv - av
  })

  const formatted = latestDate
    ? new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  const periodLabel = PREDICTION_HORIZON_LABELS[predHorizon].toLowerCase()

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <TrendingUp className="w-4 h-4" />
          <span>Today&rsquo;s Sector Rankings</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Which sectors look strong right now?
        </h1>
        <p className="text-zinc-400 text-sm max-w-xl">
          Each sector gets a forward-looking score from −100 to +100 for the next{' '}
          <span className="text-zinc-300">{periodLabel}</span> — not how price has moved lately.
          A sector that has rallied hard can still score negative if the model sees pullback risk ahead.
        </p>
        {formatted && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 pt-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Last updated: {formatted}</span>
          </div>
        )}
      </div>

      <PredictionHorizonPicker current={predHorizon} />

      {ranked.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Rankings table */}
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <div className="bg-white/[0.02] border-b border-white/5 px-4 py-3 grid grid-cols-[auto_1fr_140px_72px_100px] gap-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span className="w-6">#</span>
              <span>Sector</span>
              <span className="hidden sm:block">Score</span>
              <span className="text-right inline-flex items-center justify-end gap-1.5">
                Composite
                <InfoTip what={COMPOSITE_INFO.what} why={COMPOSITE_INFO.why} align="end" />
              </span>
              <span className="text-right inline-flex items-center justify-end gap-1.5">
                Signal
                <InfoTip
                  what="A plain-English label based on the composite score: Strongly Bearish, Bearish, Neutral, Bullish, or Strongly Bullish."
                  why="Quickly tells you the model's directional view without having to interpret the raw number."
                  align="end"
                />
              </span>
            </div>

            {ranked.map((s, i) => {
              const composite = compositeForPrediction(s, predHorizon)
              return (
                <Link
                  key={s.sector}
                  href={`/${s.sector}?h=${predictionHorizonParam(predHorizon)}`}
                  className="grid grid-cols-[auto_1fr_140px_72px_100px] gap-4 px-4 py-4 items-center border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors group"
                >
                  <span className="w-6 text-sm tabular-nums text-zinc-500">{i + 1}</span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{s.sector}</span>
                      <span className="hidden md:block text-xs text-zinc-500 truncate">{s.sector_name}</span>
                    </div>
                    <div className="md:hidden text-xs text-zinc-500 mt-0.5 truncate">{s.sector_name}</div>
                  </div>

                  <div className="hidden sm:block">
                    <ScoreBar score={composite} size="sm" />
                  </div>

                  <div className="text-right">
                    <span className={`text-sm font-semibold tabular-nums ${directionColor(composite)}`}>
                      {composite !== null
                        ? `${composite > 0 ? '+' : ''}${composite.toFixed(1)}`
                        : 'n/a'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${directionBg(composite)}`}>
                      {directionLabel(composite)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Category mini-scores */}
          <div>
            <p className="text-xs text-zinc-500 mb-2">Average across all 11 sectors, by category:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CATEGORY_ORDER.map((cat) => {
                const vals = scores
                  .map((s) => s[cat] as number | null)
                  .filter((v): v is number => v !== null && !isNaN(v))
                const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
                const desc: Record<string, string> = {
                  momentum:  'Forward view on price stretch — negative often means “strong run, pullback risk ahead”',
                  macro:     'Rates, credit & dollar — supportive or headwind ahead?',
                  sentiment: 'Fear vs complacency — low fear can read negative forward',
                  regime:    'How many sectors are participating — “everyone winning” can read negative forward',
                }
                const info = CATEGORY_INFO[cat]
                return (
                  <div key={cat} className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-2">
                    <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider inline-flex items-center gap-1.5">
                      {CATEGORY_LABELS[cat]}
                      {info && <InfoTip what={info.what} why={info.why} align="start" />}
                    </div>
                    <div className={`text-2xl font-bold tabular-nums ${directionColor(avg)}`}>
                      {avg !== null ? `${avg > 0 ? '+' : ''}${avg.toFixed(1)}` : 'n/a'}
                    </div>
                    <ScoreBar score={avg} size="sm" />
                    <p className="text-xs text-zinc-500 pt-1">{desc[cat]}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg bg-amber-500/10 border border-amber-600/20 p-4 flex gap-3 text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Research model only. Scores are based on quantitative signals and do not constitute
          investment advice. Always validate outputs on a holdout period before acting.
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] py-20 text-center space-y-3">
      <div className="text-4xl">📊</div>
      <p className="text-zinc-400 text-sm">No scores yet.</p>
      <p className="text-zinc-600 text-xs">
        Scores will appear here after the first GitHub Actions run.
      </p>
    </div>
  )
}
