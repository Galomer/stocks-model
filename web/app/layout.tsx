import type { Metadata } from 'next'
import { Geist, Geist_Mono, Fraunces } from 'next/font/google'
import './globals.css'
import NavTabs from '@/components/NavTabs'
import DisclaimerModal from '@/components/DisclaimerModal'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const displaySerif = Fraunces({
  variable: '--font-display-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal'],
})

export const metadata: Metadata = {
  title: 'Sector Model — galomer.com',
  description: 'Quantitative sector direction scores across all 11 SPDR sector ETFs.',
  openGraph: {
    title: 'Sector Direction Model',
    description: 'Daily composite scores for US equity sectors — momentum, macro, sentiment & market breadth.',
    url: 'https://stocks.galomer.com',
    siteName: 'galomer.com',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${displaySerif.variable}`}>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="border-b border-white/5 sticky top-0 z-50 bg-zinc-950/70 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 gap-4">
            <a href="/" className="flex items-center gap-2.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]" />
              <span className="text-sm font-semibold tracking-tight text-white" style={{ fontFamily: 'var(--font-display)' }}>Sector Model</span>
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
        <DisclaimerModal />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        <footer className="border-t border-white/5 mt-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-xs text-zinc-400 space-y-1">
            <p>
              Research model only — not investment advice. Validate on a holdout period before acting on any output.
            </p>
            <p>
              I am not a certified or licensed financial advisor, broker, or investment consultant. Nothing here is a
              recommendation to buy or sell any security. This is a personal research project provided &ldquo;as is&rdquo;
              with no guarantees of accuracy. Do your own research and consult a qualified professional before investing.
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
