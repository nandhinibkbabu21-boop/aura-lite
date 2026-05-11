import React from 'react'
import { Loader2, AlertCircle, ShoppingBag, Package, Users } from 'lucide-react'

// ── Button ────────────────────────────────────────────────────
export function Btn({ children, variant = 'gold', size = 'md', className = '', loading, disabled, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    gold:    'bg-gold-500 hover:bg-gold-600 text-white shadow-md hover:shadow-lg',
    outline: 'border-2 border-gold-500 text-gold-700 hover:bg-gold-50',
    ghost:   'text-gray-600 hover:bg-gray-100',
    danger:  'bg-red-500 hover:bg-red-600 text-white',
    success: 'bg-green-500 hover:bg-green-600 text-white',
    blue:    'bg-blue-600 hover:bg-blue-700 text-white',
  }
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base', xl: 'px-8 py-4 text-lg' }
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
}

// ── Input ─────────────────────────────────────────────────────
export function Input({ label, error, hint, required, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-semibold text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        className={`w-full px-4 py-2.5 rounded-xl border-2 text-sm outline-none transition-colors
          ${error ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-gold-400'}
          ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────
export function Select({ label, error, required, children, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-semibold text-gray-700">{label} {required && <span className="text-red-500">*</span>}</label>}
      <select className={`w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-gold-400 text-sm outline-none bg-white ${className}`} {...props}>
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', full: 'max-w-full mx-4' }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] flex flex-col animate-slide-up sm:animate-bounce-in`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="font-bold text-lg text-gray-900">{title}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-xl">✕</button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────
export function Badge({ children, color = 'gray', className = '' }) {
  const colors = {
    gray:   'bg-gray-100 text-gray-700',
    gold:   'bg-gold-100 text-gold-800',
    green:  'bg-green-100 text-green-800',
    blue:   'bg-blue-100 text-blue-800',
    red:    'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    purple: 'bg-purple-100 text-purple-800',
  }
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color] || colors.gray} ${className}`}>{children}</span>
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return <Loader2 className={`animate-spin text-gold-500 ${sizes[size]} ${className}`} />
}

// ── Loading screen ────────────────────────────────────────────
export function LoadingScreen({ text = 'Loading…' }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-gray-500 text-sm">{text}</p>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
export function Skeleton({ className = '' }) {
  return <div className={`bg-gray-200 rounded-xl animate-pulse ${className}`} />
}

export function ProductSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <Skeleton className="h-44 rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-8 w-full mt-2" />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────
export function Empty({ icon: Icon = Package, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="font-semibold text-gray-700 mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
      {action}
    </div>
  )
}

// ── Toast container ───────────────────────────────────────────
export { Toaster } from 'react-hot-toast'

// ── Card ──────────────────────────────────────────────────────
export function Card({ children, className = '', ...props }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`} {...props}>{children}</div>
}

// ── Divider ───────────────────────────────────────────────────
export function Divider({ text }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-gray-200" />
      {text && <span className="text-xs text-gray-400">{text}</span>}
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 p-1 bg-gray-100 rounded-xl ${className}`}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${active === t.id ? 'bg-white shadow text-gold-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
