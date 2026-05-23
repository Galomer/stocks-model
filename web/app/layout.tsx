import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import NavTabs from '@/components/NavTabs'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sector Model — galomer.com',
  description: 'Quantitative sector direction scores across all 11 SPDR sector ETFs.',
  openGraph: {
    title: 'Sector Direction Model',
    description: 'Daily composite scores for US equity sectors — momentum, macro, sentiment & regime.',
    url: 'https://stocks.galomer.com',
    siteName: 'galomer.com',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="border-b border-white/5 sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 gap-4">
            <a href="/" className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-semibold tracking-tight text-white">Sector Model</span>
              <span className="hidden sm:inline text-xs text-zinc-500 border border-white/10 px-2 py-0.5 rounded-full">
                Research Only
              </span>
            </a>
            <NavTabs />
            <a
              href="https://galomer.com"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors hidden sm:inline shrink-0"
            >
              galomer.com →
            </a>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        <footer className="border-t border-white/5 mt-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-xs text-zinc-600">
            Research model only — not investment advice. Validate on a holdout period before acting on any output.
          </div>
        </footer>
      </body>
    </html>
  )
}
