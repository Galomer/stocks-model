import { SECTOR_HOLDINGS } from '@/lib/sectorHoldings'

interface SectorHoldingsProps {
  sector: string
}

export default function SectorHoldings({ sector }: SectorHoldingsProps) {
  const holdings = SECTOR_HOLDINGS[sector.toUpperCase()]
  if (!holdings || !holdings.length) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
      {holdings.map((h, i) => (
        <div
          key={h.ticker}
          className="grid grid-cols-[1.75rem_4.25rem_1fr] items-baseline gap-2 text-sm py-1 border-b border-white/5 last:border-0 sm:[&:nth-last-child(2)]:border-0"
        >
          <span className="text-xs tabular-nums text-zinc-600">
            {(i + 1).toString().padStart(2, '0')}
          </span>
          <span className="font-mono text-xs font-semibold text-zinc-200">
            {h.ticker}
          </span>
          <span className="text-xs text-zinc-500 truncate">{h.name}</span>
        </div>
      ))}
    </div>
  )
}
