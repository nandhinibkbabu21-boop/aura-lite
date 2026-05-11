import React, { useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'

/* ── Btn ─────────────────────────────────────────── */
const variantStyles = {
  gold:    'bg-gradient-to-r from-[#9B7A2F] via-[#C9A84C] to-[#9B7A2F] text-white border border-[#9B7A2F] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_14px_rgba(201,168,76,0.4)]',
  outline: 'bg-white text-[#9B7A2F] border border-[#E8D5A3] hover:bg-[#F6EDD8] hover:border-[#C9A84C]',
  ghost:   'bg-transparent text-[#9C8C7C] border border-transparent hover:bg-[#F9F6F1] hover:border-[#F0E8D4]',
  danger:  'bg-[#c0392b] text-white border border-[#c0392b] hover:bg-[#a93226]',
  success: 'bg-[#2d7a2d] text-white border border-[#2d7a2d] hover:bg-[#256025]',
  blue:    'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700',
}
const sizeStyles = {
  sm: 'px-4 py-1.5 text-[0.7rem]',
  md: 'px-6 py-2.5 text-[0.75rem]',
  lg: 'px-9 py-3.5 text-[0.8rem]',
}

export function Btn({ variant='outline', size='md', loading, disabled, children, className='', ...props }) {
  return (
    <button
      disabled={loading || disabled}
      className={`
        inline-flex items-center justify-center gap-1.5
        rounded-[6px] font-semibold tracking-[0.1em] uppercase
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant] || variantStyles.outline}
        ${sizeStyles[size] || sizeStyles.md}
        ${className}
      `}
      {...props}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  )
}

/* ── Input ───────────────────────────────────────── */
export function Input({ label, error, className='', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[0.7rem] font-semibold tracking-[0.08em] uppercase text-[#9C8C7C]">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-4 py-2.5 text-sm
          bg-white border border-[#E8D5A3] rounded-[6px]
          text-[#1C1510] placeholder-[#C4B8AD]
          transition-all duration-200
          focus:border-[#C9A84C] focus:ring-2 focus:ring-[rgba(201,168,76,0.2)]
          ${error ? 'border-red-400 focus:border-red-400' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

/* ── Select ──────────────────────────────────────── */
export function Select({ label, error, children, className='', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[0.7rem] font-semibold tracking-[0.08em] uppercase text-[#9C8C7C]">
          {label}
        </label>
      )}
      <select
        className={`
          w-full px-4 py-2.5 text-sm
          bg-white border border-[#E8D5A3] rounded-[6px]
          text-[#1C1510]
          transition-all duration-200
          focus:border-[#C9A84C] focus:ring-2 focus:ring-[rgba(201,168,76,0.2)]
          ${error ? 'border-red-400' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

/* ── Badge ───────────────────────────────────────── */
const badgeColors = {
  gold:   'bg-[#F6EDD8] text-[#9B7A2F] border border-[#E8D5A3]',
  green:  'bg-[#e8f5e8] text-[#2d7a2d]',
  red:    'bg-[#fdecea] text-[#c0392b]',
  yellow: 'bg-yellow-50 text-yellow-700',
  blue:   'bg-blue-50 text-blue-700',
  gray:   'bg-[#F9F6F1] text-[#9C8C7C]',
}
export function Badge({ color='gold', children, className='' }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-semibold tracking-[0.06em] ${badgeColors[color]||badgeColors.gold} ${className}`}>
      {children}
    </span>
  )
}

/* ── Card ────────────────────────────────────────── */
export function Card({ children, className='', ...props }) {
  return (
    <div
      className={`bg-white border border-[#F0E8D4] rounded-[20px] shadow-[0_2px_12px_rgba(201,168,76,0.10)] transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(201,168,76,0.15)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

/* ── Modal ───────────────────────────────────────── */
export function Modal({ open, title, onClose, size='md', children }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const maxW = { sm:'max-w-md', md:'max-w-xl', lg:'max-w-2xl' }[size] || 'max-w-xl'

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-4"
      style={{ background:'rgba(28,21,16,0.5)', backdropFilter:'blur(4px)', animation:'fadeIn 0.25s ease' }}
      onClick={e => e.target===e.currentTarget && onClose?.()}
    >
      <div
        className={`bg-white w-full ${maxW} max-h-[92vh] overflow-y-auto rounded-[28px] shadow-[0_32px_80px_rgba(28,21,16,0.12)]`}
        style={{ animation:'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between px-8 pt-7 pb-0">
            {title && (
              <h2 style={{ fontFamily:'var(--font-serif)' }} className="text-2xl font-semibold text-[#1C1510]">
                {title}
              </h2>
            )}
            {onClose && (
              <button onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F9F6F1] border border-[#F0E8D4] text-[#9C8C7C] hover:bg-[#F3EDE3] transition-colors ml-4 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/* ── Spinner ─────────────────────────────────────── */
export function Spinner({ size='md' }) {
  const s = { sm:'w-4 h-4', md:'w-6 h-6', lg:'w-10 h-10' }[size]||'w-6 h-6'
  return <Loader2 className={`${s} animate-spin text-[#C9A84C]`} />
}

/* ── LoadingScreen ───────────────────────────────── */
export function LoadingScreen({ text='Loading…' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFCFA] gap-4">
      <div className="w-12 h-12 rounded-full border-2 border-[#E8D5A3] border-t-[#C9A84C] animate-spin" />
      <p className="text-sm text-[#9C8C7C] tracking-[0.1em] uppercase font-medium">{text}</p>
    </div>
  )
}

/* ── Skeleton ────────────────────────────────────── */
export function Skeleton({ className='' }) {
  return <div className={`animate-pulse bg-[#F3EDE3] rounded-[6px] ${className}`} />
}
export function ProductSkeleton() {
  return (
    <div className="bg-white border border-[#F0E8D4] rounded-[20px] overflow-hidden">
      <Skeleton className="h-44" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-1/3 mt-1" />
      </div>
    </div>
  )
}

/* ── Empty ───────────────────────────────────────── */
export function Empty({ icon: Icon, title='Nothing here', subtitle='', action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      {Icon && (
        <div className="w-16 h-16 rounded-[20px] bg-[#F6EDD8] flex items-center justify-center mb-1">
          <Icon className="w-8 h-8 text-[#C9A84C]" />
        </div>
      )}
      <h3 style={{ fontFamily:'var(--font-serif)' }} className="text-xl font-semibold text-[#1C1510]">{title}</h3>
      {subtitle && <p className="text-sm text-[#9C8C7C] max-w-xs">{subtitle}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ── Divider ─────────────────────────────────────── */
export function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-[#F0E8D4]" />
      {label && <span className="text-[0.7rem] text-[#C4B8AD] uppercase tracking-[0.1em] font-medium">{label}</span>}
      <div className="flex-1 h-px bg-[#F0E8D4]" />
    </div>
  )
}

/* ── Tabs ────────────────────────────────────────── */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-0 border-b border-[#F0E8D4]">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-5 py-3 text-[0.7rem] font-semibold tracking-[0.1em] uppercase transition-colors relative whitespace-nowrap
            ${active===t.id ? 'text-[#9B7A2F]' : 'text-[#9C8C7C] hover:text-[#5C4E3C]'}`}>
          {t.label}
          {active===t.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
              style={{ background:'linear-gradient(to right, #9B7A2F, #C9A84C)' }} />
          )}
        </button>
      ))}
    </div>
  )
}
