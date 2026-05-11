import React, { useState, useMemo } from 'react'
import { TrendingUp, ShoppingBag, Users, Trophy } from 'lucide-react'
import { fmt, PAYMENT_ICONS } from '../../../utils/formatters.js'
import { Card, Badge } from '../../ui/index.jsx'

const PERIODS = [
  { id: 'weekly',  label: 'Weekly',  days: 7 },
  { id: 'monthly', label: 'Monthly', days: 30 },
  { id: 'yearly',  label: 'Yearly',  days: 365 },
]

export default function AnalyticsTab({ orders, employees, products }) {
  const [period, setPeriod] = useState('monthly')
  const days = PERIODS.find(p => p.id === period)?.days || 30

  const now = Date.now()
  const cutoff = now - days * 86400000

  const periodOrders = useMemo(() =>
    orders.filter(o => (o.createdAt?.toDate?.() || new Date(o.date||0)).getTime() > cutoff && o.status !== 'cancelled'),
    [orders, cutoff]
  )

  const totalRevenue = periodOrders.reduce((s, o) => s + (o.total || 0), 0)
  const avgOrder     = periodOrders.length ? totalRevenue / periodOrders.length : 0

  // Revenue by day (last N days)
  const dayBuckets = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000)
    dayBuckets[d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })] = 0
  }
  periodOrders.forEach(o => {
    const d = (o.createdAt?.toDate?.() || new Date(o.date||0))
    const key = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    if (dayBuckets[key] !== undefined) dayBuckets[key] += o.total || 0
  })

  const chartLabels = Object.keys(dayBuckets)
  const chartData   = Object.values(dayBuckets)
  const maxVal      = Math.max(...chartData, 1)

  // Payment breakdown
  const payBreak = { Cash: 0, GPay: 0, PhonePe: 0 }
  periodOrders.forEach(o => { if (payBreak[o.paymentMode] !== undefined) payBreak[o.paymentMode] += o.total || 0 })

  // Top products
  const prodSales = {}
  periodOrders.forEach(o => (o.items || []).forEach(i => { prodSales[i.name] = (prodSales[i.name] || 0) + i.qty }))
  const topProds = Object.entries(prodSales).sort((a,b)=>b[1]-a[1]).slice(0,5)

  // Employee performance
  const empPerf = {}
  periodOrders.forEach(o => {
    if (!o.employeeId) return
    if (!empPerf[o.employeeId]) empPerf[o.employeeId] = { name: o.employeeName || '?', count: 0 }
    empPerf[o.employeeId].count++
  })
  const topEmps = Object.values(empPerf).sort((a,b)=>b.count-a.count).slice(0,5)

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${period===p.id ? 'bg-gold-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Orders',    value: periodOrders.length, icon: ShoppingBag, color: 'text-blue-600 bg-blue-50' },
          { label: 'Revenue',   value: fmt(totalRevenue),   icon: TrendingUp,  color: 'text-gold-600 bg-gold-50' },
          { label: 'Avg. Order',value: fmt(avgOrder),       icon: TrendingUp,  color: 'text-green-600 bg-green-50' },
          { label: 'Customers', value: new Set(periodOrders.map(o=>o.customerId)).size, icon: Users, color: 'text-purple-600 bg-purple-50' },
        ].map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="p-4">
              <div className={`w-9 h-9 ${s.color} rounded-xl flex items-center justify-center mb-2`}><Icon className="w-4 h-4" /></div>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </Card>
          )
        })}
      </div>

      {/* Revenue chart */}
      <Card className="p-4">
        <h3 className="font-bold mb-4">Revenue Trend</h3>
        <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
          {chartLabels.slice(-14).map((label, i) => {
            const val = chartData[chartLabels.indexOf(label)]
            const pct = Math.max(2, (val / maxVal) * 100)
            return (
              <div key={label} className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[28px]">
                <div className="relative group w-5 rounded-t bg-gold-400 transition-all hover:bg-gold-500"
                  style={{ height: `${pct}%` }}>
                  {val > 0 && (
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                      {fmt(val)}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-400 truncate w-8 text-center" style={{fontSize:'9px'}}>{label}</span>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payment breakdown */}
        <Card className="p-4">
          <h3 className="font-bold mb-3">Payment Methods</h3>
          <div className="space-y-3">
            {Object.entries(payBreak).map(([pm, amt]) => {
              const pct = totalRevenue > 0 ? Math.round(amt / totalRevenue * 100) : 0
              return (
                <div key={pm}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold">{PAYMENT_ICONS[pm]} {pm}</span>
                    <span className="text-gray-500">{pct}% · {fmt(amt)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gold-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Top products */}
        <Card className="p-4">
          <h3 className="font-bold mb-3">Top Products</h3>
          <div className="space-y-2">
            {topProds.map(([name, qty], i) => (
              <div key={name} className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 w-4">{i+1}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  <p className="text-xs text-gray-400">{qty} sold</p>
                </div>
              </div>
            ))}
            {!topProds.length && <p className="text-gray-400 text-sm">No data</p>}
          </div>
        </Card>

        {/* Employee leaderboard */}
        <Card className="p-4">
          <h3 className="font-bold mb-3 flex items-center gap-1"><Trophy className="w-4 h-4 text-yellow-500" /> Top Employees</h3>
          <div className="space-y-2">
            {topEmps.map((e, i) => (
              <div key={e.name} className="flex items-center gap-2">
                <span className="text-sm">{i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{e.name}</p>
                  <p className="text-xs text-gray-400">{e.count} orders</p>
                </div>
                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gold-400 rounded-full" style={{ width: `${Math.min(100, e.count * 5)}%` }} />
                </div>
              </div>
            ))}
            {!topEmps.length && <p className="text-gray-400 text-sm">No data</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
