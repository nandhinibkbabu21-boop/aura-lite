import React, { useState } from 'react'
import { fmt, fmtDate, STATUS_LABELS, PAYMENT_ICONS } from '../../../utils/formatters.js'
import { Btn, Badge, Card } from '../../ui/index.jsx'
import { downloadBill, printBill } from '../../../utils/pdf.js'
import { updateOrder } from '../../../services/db.js'
import toast from 'react-hot-toast'

const STATUS_FILTERS = ['all','pending','accepted','packing','ready','completed','cancelled']

export default function OrdersTab({ orders, employees, customers, shopId, shop }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [q, setQ] = useState('')

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    const matchQ = !q || o.customerName?.toLowerCase().includes(q) || o.id?.includes(q)
    return matchStatus && matchQ
  })

  const handleStatus = async (id, status) => {
    await updateOrder(shopId, id, { status })
    toast.success(`Order ${status}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-bold">Orders ({filtered.length})</h2>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer / ID…"
          className="px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-gold-400 w-40" />
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all capitalize ${
              statusFilter === s ? 'bg-gold-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}>
            {s === 'all' ? `All (${orders.length})` : `${STATUS_LABELS[s]?.label || s} (${orders.filter(o=>o.status===s).length})`}
          </button>
        ))}
      </div>

      {/* Orders table (desktop) / cards (mobile) */}
      <div className="hidden lg:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
            <tr>
              <th className="text-left py-3 px-4">Order ID</th>
              <th className="text-left py-3 px-4">Customer</th>
              <th className="text-left py-3 px-4">Items</th>
              <th className="text-left py-3 px-4">Total</th>
              <th className="text-left py-3 px-4">Payment</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Employee</th>
              <th className="text-left py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => {
              const meta = STATUS_LABELS[o.status] || STATUS_LABELS.pending
              return (
                <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4 font-mono font-bold text-xs">#{o.id.slice(-6).toUpperCase()}</td>
                  <td className="py-3 px-4">{o.customerName || 'Guest'}</td>
                  <td className="py-3 px-4 text-gray-600">{(o.items||[]).length} item{(o.items||[]).length!==1?'s':''}</td>
                  <td className="py-3 px-4 font-bold text-gold-600">{fmt(o.total)}</td>
                  <td className="py-3 px-4">{PAYMENT_ICONS[o.paymentMode]||'💵'} {o.paymentMode||'—'}</td>
                  <td className="py-3 px-4"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>{meta.label}</span></td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{o.employeeName||'—'}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      <Btn size="sm" variant="outline" onClick={() => downloadBill(o, shop, { name: o.customerName })}>⬇</Btn>
                      <Btn size="sm" variant="ghost"   onClick={() => printBill(o, shop, { name: o.customerName })}>🖨</Btn>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {filtered.map(o => {
          const meta = STATUS_LABELS[o.status] || STATUS_LABELS.pending
          return (
            <Card key={o.id} className="p-4">
              <div className="flex justify-between mb-2">
                <div>
                  <p className="font-mono font-bold text-sm">#{o.id.slice(-6).toUpperCase()}</p>
                  <p className="text-xs text-gray-500">👤 {o.customerName||'Guest'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gold-600">{fmt(o.total)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>{meta.label}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 flex gap-3 mb-3">
                <span>{PAYMENT_ICONS[o.paymentMode]||'💵'} {o.paymentMode}</span>
                {o.employeeName && <span>By: {o.employeeName}</span>}
                {o.estimatedTime && <span>⏱ {o.estimatedTime}min</span>}
              </div>
              <div className="flex gap-2">
                <Btn size="sm" variant="outline" onClick={() => downloadBill(o, shop, { name: o.customerName })}>⬇ Download</Btn>
                <Btn size="sm" variant="ghost" onClick={() => printBill(o, shop, { name: o.customerName })}>🖨 Print</Btn>
              </div>
            </Card>
          )
        })}
        {!filtered.length && <p className="text-center text-gray-400 py-8">No orders found</p>}
      </div>
    </div>
  )
}
