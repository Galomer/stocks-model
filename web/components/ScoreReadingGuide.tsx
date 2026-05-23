import { Info } from 'lucide-react'
import { SCORE_READING_GUIDE } from '@/lib/scoreInterpretation'

export default function ScoreReadingGuide() {
  return (
    <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.06] p-4 flex gap-3 text-sm text-zinc-300">
      <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
      <div className="space-y-1">
        <p className="font-medium text-white">{SCORE_READING_GUIDE.title}</p>
        <p className="text-zinc-400 leading-relaxed">{SCORE_READING_GUIDE.body}</p>
      </div>
    </div>
  )
}
