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
            <Card key={s.label} className="p-4">
              <div className={`w-10 h-10 ${s.color} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
            </Card>
          )
        })}
      </div>

      {/* Pending orders */}
      {pendingOrders.length > 0 && (
        <div>
          <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2">
            🔔 {pendingOrders.length} Pending Order{pendingOrders.length > 1 ? 's' : ''}
          </h3>
          <div className="grid gap-3">
            {pendingOrders.slice(0, 5).map(o => (
              <Card key={o.id} className="p-3 flex items-center justify-between border-l-4 border-red-400">
                <div>
                  <p className="font-bold text-sm font-mono">#{o.id.slice(-6).toUpperCase()}</p>
                  <p className="text-xs text-gray-500">👤 {o.customerName} · {(o.items||[]).length} item{(o.items||[]).length>1?'s':''}</p>
                </div>
                <span className="font-bold text-gold-600">{fmt(o.total)}</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Low stock alerts */}
      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div>
          <h3 className="font-bold text-orange-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Stock Alerts
          </h3>
          <div className="grid gap-2">
            {outOfStock.map(p => (
              <Card key={p.id} className="p-3 border-l-4 border-red-400 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{p.name}</p>
                  <p className="text-xs text-red-600 font-semibold">{p.detail || 'Out of stock'}</p>
                </div>
                <Badge color="red">OOS</Badge>
              </Card>
            ))}
            {lowStock.map(p => (
              <Card key={p.id} className="p-3 border-l-4 border-orange-400 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{p.name}</p>
                  <p className="text-xs text-orange-600">{p.detail}</p>
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
