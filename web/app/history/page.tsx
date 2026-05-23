import { getAllHistoricalScores } from '@/lib/supabase'
import HistoryView from './HistoryView'

export const revalidate = 3600

export const metadata = {
  title: 'Backtest — Sector Model',
  description: 'Historical sector composite scores vs realized 1M / 3M / 6M / 1Y forward returns.',
}

export default async function HistoryPage() {
  const rows = await getAllHistoricalScores()
  return <HistoryView rows={rows} />
}
