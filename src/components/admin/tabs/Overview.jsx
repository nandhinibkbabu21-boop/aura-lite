import React from 'react'
import { ShoppingBag, Users, Package, TrendingUp, AlertTriangle } from 'lucide-react'
import { fmt, STATUS_LABELS } from '../../../utils/formatters.js'
import { Card, Badge } from '../../ui/index.jsx'

export default function Overview({ products, orders, employees, customers }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const todayOrders   = orders.filter(o => (o.createdAt?.toDate?.() || new Date(o.date||0)) >= today)
  const totalRevenue  = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0)
  const pendingOrders = orders.filter(o => o.status === 'pending')

  // Low stock alerts
  const lowStock = [], outOfStock = []
  products.forEach(p => {
    if (p.hasSizes && p.sizeStock?.length) {
      const allOos = p.sizeStock.every(s => +s.stock === 0)
      const low    = p.sizeStock.filter(s => +s.stock > 0 && +s.stock <= 5)
      if (allOos) outOfStock.push({ ...p, detail: 'All sizes OOS' })
      else if (low.length) lowStock.push({ ...p, detail: low.map(s => `${s.size}:${s.stock}`).join(', ') })
    } else {
      if (+p.quantity === 0) outOfStock.push(p)
      else if (+p.quantity <= 5) lowStock.push({ ...p, detail: `Stock: ${p.quantity}` })
    }
  })

  const stats = [
    { icon: ShoppingBag, label: "Today's Orders", value: todayOrders.length,  color: 'bg-blue-50 text-blue-600' },
    { icon: TrendingUp,  label: 'Total Revenue',  value: fmt(totalRevenue),   color: 'bg-gold-50 text-gold-600' },
    { icon: Users,       label: 'Customers',      value: customers.length,    color: 'bg-green-50 text-green-600' },
    { icon: Package,     label: 'Products',       value: products.length,     color: 'bg-purple-50 text-purple-600' },
  ]

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
                style={{ background:'linear-gradient(to bottom, var(--gold-accent), var(--gold-dark))' }} />
              <div className="w-12 h-12 rounded-[12px] flex items-center justify-center mb-3"
                style={{ background:'var(--gold-lighter)' }}>
                <Icon className="w-5 h-5" style={{ color:'var(--gold-dark)' }} />
              </div>
              <p style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', lineHeight:1, color:'var(--text-dark)' }}
                className="font-semibold">{s.value}</p>
              <p className="text-[0.72rem] uppercase tracking-[0.08em] mt-1" style={{ color:'var(--text-light)' }}>{s.label}</p>
            </Card>
          )
        })}
      </div>

      {/* Pending orders */}
      {pendingOrders.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm" style={{ color:'#c0392b' }}>
            🔔 {pendingOrders.length} Pending Order{pendingOrders.length > 1 ? 's' : ''}
          </h3>
          <div className="grid gap-3">
            {pendingOrders.slice(0, 5).map(o => (
              <Card key={o.id} className="p-4 flex items-center justify-between" style={{ borderLeft:'4px solid #c0392b' }}>
                <div>
                  <p className="font-bold text-sm font-mono" style={{ color:'var(--text-dark)' }}>#{o.id.slice(-6).toUpperCase()}</p>
                  <p className="text-xs mt-0.5" style={{ color:'var(--text-light)' }}>👤 {o.customerName} · {(o.items||[]).length} item{(o.items||[]).length>1?'s':''}</p>
                </div>
                <span className="font-semibold" style={{ fontFamily:'var(--font-serif)', color:'var(--gold-dark)' }}>{fmt(o.total)}</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Low stock alerts */}
      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm" style={{ color:'#d35400' }}>
            <AlertTriangle className="w-4 h-4" /> Stock Alerts
          </h3>
          <div className="grid gap-2">
            {outOfStock.map(p => (
              <Card key={p.id} className="p-4 flex items-center justify-between" style={{ borderLeft:'4px solid #c0392b' }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color:'var(--text-dark)' }}>{p.name}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color:'#c0392b' }}>{p.detail || 'Out of stock'}</p>
                </div>
                <Badge color="red">OOS</Badge>
              </Card>
            ))}
            {lowStock.map(p => (
              <Card key={p.id} className="p-4 flex items-center justify-between" style={{ borderLeft:'4px solid #e67e22' }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color:'var(--text-dark)' }}>{p.name}</p>
                  <p className="text-xs mt-0.5" style={{ color:'#e67e22' }}>{p.detail}</p>
                </div>
                <Badge color="yellow">Low Stock</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
