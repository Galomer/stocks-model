import { getSectorScore, getHistoricalScores, getLatestRunDate } from '@/lib/supabase'
import { directionLabel, directionBg, directionColor, SECTOR_DESCRIPTIONS } from '@/lib/types'
import ScoreBar from '@/components/ScoreBar'
import CategoryBreakdown from '@/components/CategoryBreakdown'
import FeatureTable from '@/components/FeatureTable'
import InfoTip from '@/components/InfoTip'
import SectorHoldings from '@/components/SectorHoldings'
import ScoreReadingGuide from '@/components/ScoreReadingGuide'
import { COMPOSITE_INFO, COVERAGE_INFO } from '@/lib/descriptions'
import { SECTOR_HOLDINGS } from '@/lib/sectorHoldings'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, TrendingUp, Briefcase } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ sector: string }>
}

export async function generateStaticParams() {
  return Object.keys(SECTOR_DESCRIPTIONS).map((sector) => ({ sector }))
}

export async function generateMetadata({ params }: Props) {
  const { sector } = await params
  const name = SECTOR_DESCRIPTIONS[sector.toUpperCase()]
  if (!name) return {}
  return {
    title: `${sector.toUpperCase()} — ${name} | Sector Model`,
    description: `Composite direction score for ${name} (${sector.toUpperCase()}) — momentum, macro, sentiment & market breadth breakdown.`,
  }
}

export default async function SectorPage({ params }: Props) {
  const { sector: rawSector } = await params
  const sector = rawSector.toUpperCase()

  if (!SECTOR_DESCRIPTIONS[sector]) notFound()

  const [score, history, latestDate] = await Promise.all([
    getSectorScore(sector),
    getHistoricalScores(sector, 60),
    getLatestRunDate(),
  ])

  if (!score) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="rounded-xl border border-white/5 bg-white/[0.02] py-20 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-zinc-400 text-sm">No data yet for {sector}.</p>
          <p className="text-zinc-600 text-xs">Scores appear after the first GitHub Actions run.</p>
        </div>
      </div>
    )
  }

  const formatted = latestDate
    ? new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  return (
    <div className="space-y-8">
      <BackLink />

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <TrendingUp className="w-4 h-4" />
          <span>{score.sector_name}</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {sector}
          </h1>
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${directionBg(score.composite)}`}>
            {directionLabel(score.composite)}
          </span>
        </div>
        {formatted && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>Last updated: {formatted}</span>
          </div>
        )}
      </div>

      {/* Composite score card */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1 inline-flex items-center gap-1.5">
              Composite Score
              <InfoTip what={COMPOSITE_INFO.what} why={COMPOSITE_INFO.why} align="start" />
            </p>
            <p className={`text-5xl font-bold tabular-nums ${directionColor(score.composite)}`}>
              {score.composite !== null
                ? `${score.composite > 0 ? '+' : ''}${score.composite.toFixed(1)}`
                : 'n/a'}
            </p>
          </div>
          <div className="text-right text-xs text-zinc-600 space-y-0.5">
            <p className="inline-flex items-center gap-1.5 justify-end">
              {score.available} features used
              <InfoTip
                what="The number of input signals (out of 19) that had usable data when this score was computed."
                why="Some metrics depend on external feeds (FRED, sentiment APIs). A lower count means a few signals were temporarily unavailable."
                align="end"
              />
            </p>
            <p className="inline-flex items-center gap-1.5 justify-end">
              {((score.coverage ?? 0) * 100).toFixed(0)}% coverage
              <InfoTip what={COVERAGE_INFO.what} why={COVERAGE_INFO.why} align="end" />
            </p>
          </div>
        </div>
        <ScoreBar score={score.composite} size="lg" />
        <div className="flex justify-between text-xs text-zinc-600">
          <span>−100 Weaker returns expected ahead</span>
          <span>0 Neutral</span>
          <span>Stronger returns expected ahead +100</span>
        </div>
      </div>

      <ScoreReadingGuide />

      {/* Category breakdown */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 inline-flex items-center gap-1.5">
          Category Breakdown
          <InfoTip
            what="Each category groups related forward-looking signals. The bars show what the model expects over the next 1–3 months — not whether the sector has been going up or down lately."
            why="Example: XLK can have a great recent run and still show negative Momentum because the model treats that strength as stretched and flags pullback risk ahead."
            align="start"
            placement="bottom"
          />
        </h2>
        <CategoryBreakdown score={score} />
      </div>

      {/* Historical mini-chart (text-based sparkline) */}
      {history.length > 1 && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300">
            Historical Composite ({history.length} days)
          </h2>
          <Sparkline data={history.map((h) => h.composite)} />
        </div>
      )}

      {/* Per-feature breakdown */}
      {score.features && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 inline-flex items-center gap-1.5">
            Per-Feature Breakdown
            <InfoTip
              what="Every individual signal that feeds the composite. Each score is the model's forward view for the next 1–3 months — negative often means 'stretched or headwind ahead,' not 'price is falling today.'"
              why="Hover the (i) next to any row for a full explanation. If XLK has rallied hard, momentum rows often read negative because the model flags pullback risk — that is expected behavior."
              align="start"
              placement="bottom"
            />
          </h2>
          <FeatureTable score={score} />
        </div>
      )}

      {/* Top 20 holdings */}
      {SECTOR_HOLDINGS[sector] && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-zinc-300 inline-flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-zinc-500" />
              Top 20 Holdings
              <InfoTip
                what={`The 20 largest companies inside the ${sector} ETF by index weight.`}
                why="The score is for the sector as a whole, but the ETF is essentially these 20 names plus a long tail. They drive most of the day-to-day moves."
                align="start"
              />
            </h2>
            <span className="text-xs text-zinc-600">
              Ordered by approximate index weight
            </span>
          </div>
          <SectorHoldings sector={sector} />
          <p className="text-xs text-zinc-600 pt-2 border-t border-white/5">
            Holdings are illustrative and based on the SPDR sector ETF&rsquo;s most recent
            published top constituents. Exact weights shift week to week as prices and
            shares outstanding change.
          </p>
        </div>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
      <ArrowLeft className="w-3.5 h-3.5" />
      All sectors
    </Link>
  )
}

function Sparkline({ data }: { data: (number | null)[] }) {
  const valid = data.filter((v): v is number => v !== null && !isNaN(v))
  if (!valid.length) return null
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1
  const H = 48
  const W = 600
  const step = W / (data.length - 1)

  const points = data
    .map((v, i) => {
      if (v === null || isNaN(v)) return null
      const x = i * step
      const y = H - ((v - min) / range) * H
      return `${x},${y}`
    })
    .filter(Boolean)
    .join(' ')

  const last = valid[valid.length - 1]
  const color = last >= 25 ? '#34d399' : last >= -25 ? '#facc15' : '#f87171'

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-12"
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Zero line */}
      {min < 0 && max > 0 && (
        <line
          x1="0"
          y1={H - ((0 - min) / range) * H}
          x2={W}
          y2={H - ((0 - min) / range) * H}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      )}
    </svg>
  )
}
