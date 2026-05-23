'use client'

import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'

interface InfoTipProps {
  what: string
  why?: string
  size?: 'sm' | 'md'
  align?: 'center' | 'start' | 'end'
  className?: string
}

export default function InfoTip({
  what,
  why,
  size = 'sm',
  align = 'center',
  className = '',
}: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<number | null>(null)

  const show = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }
  const hide = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 100)
  }

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
  }, [])

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  const alignClasses =
    align === 'start'
      ? 'left-0'
      : align === 'end'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2'

  const arrowAlign =
    align === 'start'
      ? 'left-3'
      : align === 'end'
      ? 'right-3'
      : 'left-1/2 -translate-x-1/2'

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center align-middle ${className}`}
    >
      <button
        type="button"
        aria-label="More info"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-help inline-flex items-center"
      >
        <Info className={iconSize} />
      </button>

      {open && (
        <span
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
          className={`absolute bottom-full mb-2 w-72 z-50 ${alignClasses}`}
        >
          <span className="block bg-zinc-900 border border-white/10 rounded-md shadow-xl px-3 py-2.5 text-xs text-zinc-300 leading-relaxed text-left whitespace-normal break-words font-normal normal-case tracking-normal">
            <span className="block">{what}</span>
            {why && (
              <>
                <span className="block h-2" />
                <span className="block text-zinc-400">
                  <span className="font-semibold text-zinc-300">Why it matters: </span>
                  {why}
                </span>
              </>
            )}
          </span>
          <span
            className={`absolute top-full ${arrowAlign}`}
            style={{
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid rgb(24 24 27)',
            }}
          />
        </span>
      )}
    </span>
  )
}
