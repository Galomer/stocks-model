import { getAllSectorScores, getLatestRunDate } from '@/lib/supabase'
import { directionLabel, directionBg, directionColor, CATEGORY_ORDER, CATEGORY_LABELS } from '@/lib/types'
import ScoreBar from '@/components/ScoreBar'
import { TrendingUp, Calendar, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export const revalidate = 3600 // revalidate at most once per hour

export default async function HomePage() {
  const [scores, latestDate] = await Promise.all([
    getAllSectorScores(),
    getLatestRunDate(),
  ])

  const formatted = latestDate
    ? new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

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
          Each of the 11 US stock-market sectors gets a single score from −100 (very bearish)
          to +100 (very bullish), based on its price trend, the macro environment, market
          sentiment, and the overall risk-on/risk-off mood. Updated daily after market close.
        </p>
        {formatted && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 pt-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Last updated: {formatted}</span>
          </div>
        )}
      </div>

      {scores.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Rankings table */}
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <div className="bg-white/[0.02] border-b border-white/5 px-4 py-3 grid grid-cols-[auto_1fr_140px_72px_100px] gap-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span className="w-6">#</span>
              <span>Sector</span>
              <span className="hidden sm:block">Score</span>
              <span className="text-right">Composite</span>
              <span className="text-right">Signal</span>
            </div>

            {scores.map((s, i) => (
              <Link
                key={s.sector}
                href={`/${s.sector}`}
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
                  <ScoreBar score={s.composite} size="sm" />
                </div>

                <div className="text-right">
                  <span className={`text-sm font-semibold tabular-nums ${directionColor(s.composite)}`}>
                    {s.composite !== null
                      ? `${s.composite > 0 ? '+' : ''}${s.composite.toFixed(1)}`
                      : 'n/a'}
                  </span>
                </div>

                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${directionBg(s.composite)}`}>
                    {directionLabel(s.composite)}
                  </span>
                </div>
              </Link>
            ))}
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
                  momentum:  'Are prices trending up?',
                  macro:     'Is the macro backdrop supportive?',
                  sentiment: 'Is the market calm and confident?',
                  regime:    'Are investors in risk-on mode?',
                }
                return (
                  <div key={cat} className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-2">
                    <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                      {CATEGORY_LABELS[cat]}
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
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-4 flex gap-3 text-sm text-amber-400/80">
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
