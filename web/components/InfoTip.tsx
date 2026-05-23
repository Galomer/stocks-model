'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

interface InfoTipProps {
  what: string
  why?: string
  size?: 'sm' | 'md'
  align?: 'center' | 'start' | 'end'
  placement?: 'top' | 'bottom'
  className?: string
}

export default function InfoTip({
  what,
  why,
  size = 'sm',
  align = 'center',
  placement = 'top',
  className = '',
}: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<number | null>(null)

  const updatePosition = useCallback(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const tooltipW = 288 // w-72
    let left = rect.left + rect.width / 2 - tooltipW / 2
    if (align === 'start') left = rect.left
    if (align === 'end') left = rect.right - tooltipW
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipW - 8))
    const top = placement === 'bottom' ? rect.bottom + 8 : rect.top - 8
    setCoords({ top, left })
  }, [align, placement])

  const show = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    updatePosition()
    setOpen(true)
  }
  const hide = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    document.addEventListener('mousedown', handle)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('mousedown', handle)
    }
  }, [open, updatePosition])

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
  }, [])

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  const tooltip =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        role="tooltip"
        onMouseEnter={show}
        onMouseLeave={hide}
        className="fixed z-[9999] w-72 pointer-events-auto"
        style={{
          top: coords.top,
          left: coords.left,
          transform: placement === 'top' ? 'translateY(-100%)' : undefined,
        }}
      >
        <div className="bg-zinc-900 border border-white/10 rounded-md shadow-xl px-3 py-2.5 text-xs text-zinc-300 leading-relaxed text-left whitespace-normal break-words font-normal normal-case tracking-normal">
          <p>{what}</p>
          {why && (
            <>
              <div className="h-2" />
              <p className="text-zinc-400">
                <span className="font-semibold text-zinc-300">Why it matters: </span>
                {why}
              </p>
            </>
          )}
        </div>
      </div>,
      document.body,
    )

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center align-middle shrink-0 ${className}`}
    >
      <button
        type="button"
        aria-label="More info"
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          updatePosition()
          setOpen((v) => !v)
        }}
        className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-help inline-flex items-center"
      >
        <Info className={iconSize} />
      </button>
      {tooltip}
    </span>
  )
}
