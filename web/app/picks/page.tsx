import { getAllSectorScores, getAllStockScores, getLatestRunDate } from '@/lib/supabase'
import {
  directionLabel,
  directionBg,
  directionColor,
  compositeForPrediction,
  stockScoreForHorizon,
  stockRankForHorizon,
  parsePredictionHorizon,
  predictionHorizonParam,
  PREDICTION_HORIZON_LABELS,
  type SectorScore,
  type StockScore,
  type PredictionHorizon,
} from '@/lib/types'
import ScoreBar from '@/components/ScoreBar'
import InfoTip from '@/components/InfoTip'
import PredictionHorizonPicker from '@/components/PredictionHorizonPicker'
import { Sparkles, Calendar, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ h?: string }>
}

const TOP_PER_SECTOR = 5

export default async function PicksPage({ searchParams }: Props) {
  const { h } = await searchParams
  const predHorizon = parsePredictionHorizon(h)

  const [sectorScores, stockScores, latestDate] = await Promise.all([
    getAllSectorScores(),
    getAllStockScores(),
    getLatestRunDate(),
  ])

  const formatted = latestDate
    ? new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  const periodLabel = PREDICTION_HORIZON_LABELS[predHorizon].toLowerCase()
  const groups = buildGroups(sectorScores, stockScores, predHorizon)

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Sparkles className="w-4 h-4" />
          <span>Top Stock Ideas</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Best names in the strongest sectors
        </h1>
        <p className="text-zinc-400 text-sm max-w-xl">
          We start with the sectors the model favors over the next{' '}
          <span className="text-zinc-300">{periodLabel}</span>, then surface the
          individual stocks with the strongest price momentum inside each one.
          Sectors are ordered by their composite score; stocks by their within-sector momentum.
        </p>
        {formatted && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 pt-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Last updated: {formatted}</span>
          </div>
        )}
      </div>

      <PredictionHorizonPicker current={predHorizon} basePath="/picks" />

      {groups.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {groups.map(({ sector, sectorName, sectorComposite, stocks }) => (
            <div key={sector} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
              {/* Sector header */}
              <Link
                href={`/${sector}?h=${predictionHorizonParam(predHorizon)}`}
                className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/5 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-sm font-semibold text-white">{sector}</span>
                  <span className="text-xs text-zinc-500 truncate">{sectorName}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-semibold tabular-nums ${directionColor(sectorComposite)}`}>
                    {sectorComposite !== null
                      ? `${sectorComposite > 0 ? '+' : ''}${sectorComposite.toFixed(1)}`
                      : 'n/a'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${directionBg(sectorComposite)}`}>
                    {directionLabel(sectorComposite)}
                  </span>
                </div>
              </Link>

              {/* Top stocks in this sector */}
              <div className="px-5 py-3 space-y-1">
                {stocks.map((s) => {
                  const score = stockScoreForHorizon(s, predHorizon)
                  const rank  = stockRankForHorizon(s, predHorizon)
                  return (
                    <div
                      key={s.ticker}
                      className="grid grid-cols-[1.75rem_4.5rem_1fr_90px_84px] gap-2 items-center py-1.5 border-b border-white/5 last:border-0"
                    >
                      <span className="text-xs tabular-nums text-zinc-600">
                        {(rank ?? 0).toString().padStart(2, '0')}
                      </span>
                      <span className="font-mono text-xs font-semibold text-zinc-200">{s.ticker}</span>
                      <span className="text-xs text-zinc-500 truncate">{s.name}</span>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-xs font-semibold tabular-nums ${directionColor(score)}`}>
                          {score !== null ? `${score > 0 ? '+' : ''}${score.toFixed(1)}` : '—'}
                        </span>
                        <ScoreBar score={score} size="xs" />
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${directionBg(score)}`}>
                          {score !== null ? directionLabel(score) : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg bg-amber-500/10 border border-amber-600/20 p-4 flex gap-3 text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Stock momentum scores are price-based signals only — they do not consider valuation,
          fundamentals, or news, and are not yet validated on a holdout period. Research model only;
          not investment advice.
        </p>
      </div>
    </div>
  )
}

type PickGroup = {
  sector: string
  sectorName: string
  sectorComposite: number | null
  stocks: StockScore[]
}

function buildGroups(
  sectorScores: SectorScore[],
  stockScores: StockScore[],
  horizon: PredictionHorizon,
): PickGroup[] {
  // Only sectors with a favorable (positive) composite for this horizon
  const favorable = sectorScores
    .map((s) => ({ score: s, composite: compositeForPrediction(s, horizon) }))
    .filter((x) => x.composite !== null && x.composite > 0)
    .sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0))

  const bySector = new Map<string, StockScore[]>()
  for (const st of stockScores) {
    const arr = bySector.get(st.sector) ?? []
    arr.push(st)
    bySector.set(st.sector, arr)
  }

  const groups: PickGroup[] = []
  for (const { score, composite } of favorable) {
    const stocks = (bySector.get(score.sector) ?? [])
      .filter((s) => stockScoreForHorizon(s, horizon) !== null)
      .sort((a, b) => {
        const ra = stockRankForHorizon(a, horizon) ?? 9999
        const rb = stockRankForHorizon(b, horizon) ?? 9999
        return ra - rb
      })
      .slice(0, TOP_PER_SECTOR)

    if (stocks.length > 0) {
      groups.push({
        sector: score.sector,
        sectorName: score.sector_name,
        sectorComposite: composite,
        stocks,
      })
    }
  }
  return groups
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] py-20 text-center space-y-3">
      <div className="text-4xl">✨</div>
      <p className="text-zinc-400 text-sm">No favorable sectors right now, or stock scores haven&rsquo;t been generated yet.</p>
      <p className="text-zinc-600 text-xs">
        Stock scores populate after the daily GitHub Actions run.
      </p>
    </div>
  )
}
