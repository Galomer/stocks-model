'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'

const DISCLAIMER_VERSION = 'v1'
const STORAGE_KEY = `disclaimer_accepted_${DISCLAIMER_VERSION}`

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function getOrCreateSessionId(): string {
  const key = 'disclaimer_session_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = generateUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export default function DisclaimerModal() {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY)
    if (!accepted) setOpen(true)
  }, [])

  async function handleAccept() {
    if (!checked) return
    setLoading(true)

    const session_id = getOrCreateSessionId()
    try {
      await fetch('/api/disclaimer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id, disclaimer_version: DISCLAIMER_VERSION }),
      })
    } catch {
      // non-blocking — still let the user proceed
    }

    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    setLoading(false)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start gap-3 p-6 pb-4 border-b border-white/5 shrink-0">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white leading-tight">
              Important Disclosure — Please Read Before Continuing
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Required under Israeli law · Regulation of Investment Advice Law, 5755-1995
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 text-sm text-zinc-300 space-y-4 leading-relaxed">

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              1. Not a Licensed Investment Advisor
            </h3>
            <p>
              This website and its operator are <strong className="text-white">not licensed by the Israel Securities
              Authority (ISA)</strong> under the Regulation of Investment Advice, Investment Marketing
              and Portfolio Management Law, 5755-1995 (the &ldquo;Investment Advice Law&rdquo;). No investment
              advice, investment marketing, or portfolio management services are provided here.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              2. For Research &amp; Informational Purposes Only
            </h3>
            <p>
              All content, scores, rankings, signals, and analyses published on this site are provided
              solely for <strong className="text-white">personal research and general informational purposes</strong>.
              Nothing on this site constitutes investment advice, a recommendation to buy or sell any
              security, or any offer or solicitation to engage in investment activity of any kind.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              3. No Advisor–Client Relationship
            </h3>
            <p>
              Accessing or using this site does not create any advisor–client, fiduciary, or professional
              relationship of any kind between you and the site operator.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              4. No Guarantees &amp; Past Performance
            </h3>
            <p>
              The model outputs are based on quantitative signals and are subject to significant uncertainty.
              <strong className="text-white"> Past performance does not guarantee future results.</strong> No
              representation is made that any investment strategy will or is likely to achieve profits or
              losses similar to any backtested result shown.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              5. Consult a Licensed Professional
            </h3>
            <p>
              Before making any investment decision you should consult with a professional who is duly licensed
              by the ISA or another appropriate authority and who is familiar with your personal financial
              situation, objectives, and risk tolerance.
              You can verify the licensing status of any advisor at{' '}
              <a
                href="https://www.isa.gov.il"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline hover:text-sky-300"
              >
                isa.gov.il
              </a>.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              6. Limitation of Liability
            </h3>
            <p>
              The site operator shall not be liable for any loss or damage, direct or indirect, arising from
              reliance on any content published on this site. Use of this site is entirely at your own risk.
            </p>
          </section>
        </div>

        {/* Footer / accept */}
        <div className="px-6 py-5 border-t border-white/5 space-y-4 shrink-0 bg-zinc-900 rounded-b-2xl">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-zinc-800 accent-sky-500 cursor-pointer"
            />
            <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
              I have read and understood the above disclosure. I acknowledge that this site does not
              provide investment advice and I will not rely on it as such.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!checked || loading}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
              checked && !loading
                ? 'bg-sky-600 hover:bg-sky-500 text-white cursor-pointer'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {loading ? 'Saving…' : 'I Understand — Continue to Site'}
          </button>

          <p className="text-center text-xs text-zinc-600">
            Your acceptance is recorded for compliance purposes.
          </p>
        </div>
      </div>
    </div>
  )
}
