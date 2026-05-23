'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/',        label: 'Today' },
  { href: '/history', label: 'Backtest' },
]

export default function NavTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-1">
      {TABS.map((t) => {
        const active = pathname === t.href || (t.href !== '/' && pathname.startsWith(t.href))
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
              active
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
