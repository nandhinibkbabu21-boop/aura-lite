export const fmt = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export const fmtDate = (ts) => {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const esc = (s) =>
  String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const timeAgo = (ts) => {
  const sec = Math.floor((Date.now() - (ts?.toDate ? ts.toDate() : new Date(ts))) / 1000)
  if (sec < 60)  return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

export const STATUS_LABELS = {
  pending:   { label: '⏳ Pending',    color: 'bg-yellow-100 text-yellow-800' },
  accepted:  { label: '📦 Accepted',   color: 'bg-blue-100 text-blue-800' },
  packing:   { label: '⏱ Packing',    color: 'bg-purple-100 text-purple-800' },
  ready:     { label: '✅ Ready',      color: 'bg-green-100 text-green-800' },
  completed: { label: '✓ Completed',  color: 'bg-gray-100 text-gray-700' },
  cancelled: { label: '✕ Cancelled',  color: 'bg-red-100 text-red-700' },
}

export const PAYMENT_ICONS = { Cash: '💵', GPay: '📱', PhonePe: '💜' }

export const SIZES_PRESET = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size']
