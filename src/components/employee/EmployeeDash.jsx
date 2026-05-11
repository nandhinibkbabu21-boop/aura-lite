import React, { useEffect, useState } from 'react'
import { Bell, Package, CheckCircle, LogOut, ClipboardList } from 'lucide-react'
import toast from 'react-hot-toast'
import useAuthStore from '../../store/authStore.js'
import { listenOrders, updateOrder, listenProducts, addProduct, updateProduct, deleteProduct, uploadImage } from '../../services/db.js'
import { fmt, timeAgo, STATUS_LABELS, PAYMENT_ICONS, uid } from '../../utils/formatters.js'
import { Btn, Badge, Card, Empty, Modal, Input, Select, Spinner } from '../ui/index.jsx'
import ProductModal from '../admin/modals/ProductModal.jsx'

const TABS = [
  { id: 'orders',   icon: Bell,          label: 'Orders' },
  { id: 'products', icon: ClipboardList, label: 'Products' },
]

const PACK_TIMES = [5, 10, 15, 20, 30]

export default function EmployeeDash() {
  const { session, shop, shopId, logout } = useAuthStore()
  const [tab, setTab]     = useState('orders')
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [addingProd, setAddingProd] = useState(false)
  const [editProd, setEditProd] = useState(null)

  // ── Live orders (pending + accepted + packing) ──────────────
  useEffect(() => {
    if (!shopId) return
    setLoading(true)
    const unsub = listenOrders(shopId, data => {
      const active = data.filter(o => ['pending','accepted','packing','ready'].includes(o.status || 'pending'))
      setOrders(active)
      setLoading(false)
    })
    return unsub
  }, [shopId])

  // ── Products ────────────────────────────────────────────────
  useEffect(() => {
    if (!shopId) return
    const unsub = listenProducts(shopId, setProducts)
    return unsub
  }, [shopId])

  const pending  = orders.filter(o => (o.status || 'pending') === 'pending')
  const inProg   = orders.filter(o => ['accepted','packing'].includes(o.status))
  const readyOrders = orders.filter(o => o.status === 'ready')

  const handlePackTime = async (orderId, minutes) => {
    await updateOrder(shopId, orderId, {
      status: 'accepted',
      estimatedTime: minutes,
      employeeId:   session.id,
      employeeName: session.name,
    })
    toast.success(`✅ Packing time set: ${minutes} min`)
  }

  const markPacking  = (id) => updateOrder(shopId, id, { status: 'packing' }).then(() => toast.success('Marked as packing'))
  const markReady    = (id) => updateOrder(shopId, id, { status: 'ready', readyAt: Date.now() }).then(() => toast.success('Order is ready! ✅'))
  const markComplete = (id) => updateOrder(shopId, id, { status: 'completed', completedAt: Date.now() }).then(() => toast.success('Order completed'))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-900">
              <span className="text-gold-500 font-serif">ZARA</span> Aura
            </h1>
            <p className="text-xs text-gray-500">{session?.name} · Employee</p>
          </div>
          <div className="flex items-center gap-3">
            {pending.length > 0 && (
              <div className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 animate-pulse">
                <Bell className="w-3 h-3" /> {pending.length} new
              </div>
            )}
            <button onClick={logout} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-lg mx-auto flex border-t">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors relative ${tab === t.id ? 'text-gold-700' : 'text-gray-500'}`}>
                <Icon className="w-4 h-4" />
                {t.label}
                {t.id === 'orders' && pending.length > 0 && (
                  <span className="bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">{pending.length}</span>
                )}
                {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-500 rounded-t" />}
              </button>
            )
          })}
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Orders Tab */}
        {tab === 'orders' && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : (
              <>
                {/* Pending */}
                {pending.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <h2 className="font-bold text-red-700">🔔 {pending.length} New Order{pending.length > 1 ? 's' : ''}</h2>
                    </div>
                    <div className="space-y-3">
                      {pending.map(o => (
                        <PendingOrderCard key={o.id} order={o} onPackTime={handlePackTime} />
                      ))}
                    </div>
                  </section>
                )}

                {/* In progress */}
                {inProg.length > 0 && (
                  <section>
                    <h2 className="font-bold text-blue-700 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" /> Packing in Progress ({inProg.length})
                    </h2>
                    <div className="space-y-3">
                      {inProg.map(o => (
                        <ActiveOrderCard key={o.id} order={o} onMarkReady={markReady} onMarkPacking={markPacking} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Ready */}
                {readyOrders.length > 0 && (
                  <section>
                    <h2 className="font-bold text-green-700 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> Ready for Pickup ({readyOrders.length})
                    </h2>
                    <div className="space-y-3">
                      {readyOrders.map(o => (
                        <ReadyOrderCard key={o.id} order={o} onComplete={markComplete} />
                      ))}
                    </div>
                  </section>
                )}

                {!pending.length && !inProg.length && !readyOrders.length && (
                  <Empty icon={CheckCircle} title="All clear!" subtitle="No pending orders right now" />
                )}
              </>
            )}
          </div>
        )}

        {/* Products Tab */}
        {tab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">Products</h2>
              <Btn variant="gold" size="sm" onClick={() => setAddingProd(true)}>+ Add Product</Btn>
            </div>
            <div className="space-y-2">
              {products.map(p => (
                <Card key={p.id} className="p-3 flex items-center gap-3">
                  {p.image ? <img src={p.image} className="w-12 h-12 rounded-xl object-cover" alt="" /> : <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl">👗</div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.hasSizes ? p.sizeStock?.map(s => `${s.size}:${s.stock}`).join(' · ') : `Stock: ${p.quantity}`}</p>
                  </div>
                  <div className="flex gap-2">
                    <Btn size="sm" variant="outline" onClick={() => setEditProd(p)}>Edit</Btn>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {(addingProd || editProd) && (
        <ProductModal
          shopId={shopId}
          product={editProd}
          onClose={() => { setAddingProd(false); setEditProd(null) }}
        />
      )}
    </div>
  )
}

// ── Pending Order Card ────────────────────────────────────────
function PendingOrderCard({ order: o, onPackTime }) {
  return (
    <Card className="p-4 border-l-4 border-red-400">
      <OrderHeader order={o} />
      <OrderItems items={o.items} />
      <div className="mt-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">Set estimated packing time:</p>
        <div className="flex flex-wrap gap-2">
          {PACK_TIMES.map(t => (
            <Btn key={t} size="sm" variant="outline" onClick={() => onPackTime(o.id, t)}
              className="border-orange-300 text-orange-700 hover:bg-orange-50">
              {t} min
            </Btn>
          ))}
        </div>
      </div>
    </Card>
  )
}

function ActiveOrderCard({ order: o, onMarkReady, onMarkPacking }) {
  const isPacking = o.status === 'packing'
  return (
    <Card className="p-4 border-l-4 border-blue-400">
      <OrderHeader order={o} />
      <OrderItems items={o.items} />
      {o.estimatedTime && <p className="text-xs text-blue-700 mt-2 font-semibold">⏱ Est. time: {o.estimatedTime} min</p>}
      <div className="flex gap-2 mt-3">
        {!isPacking && <Btn size="sm" variant="blue" onClick={() => onMarkPacking(o.id)}>📦 Start Packing</Btn>}
        <Btn size="sm" variant="success" onClick={() => onMarkReady(o.id)}>✅ Mark Ready</Btn>
      </div>
    </Card>
  )
}

function ReadyOrderCard({ order: o, onComplete }) {
  return (
    <Card className="p-4 border-l-4 border-green-400">
      <OrderHeader order={o} />
      <OrderItems items={o.items} />
      <Btn size="sm" variant="ghost" onClick={() => onComplete(o.id)} className="mt-3 text-gray-500">
        ✓ Mark Completed
      </Btn>
    </Card>
  )
}

function OrderHeader({ order: o }) {
  return (
    <div className="flex items-start justify-between mb-2">
      <div>
        <p className="font-bold text-sm font-mono">#{(o.id || '').slice(-6).toUpperCase()}</p>
        <p className="text-xs text-gray-500">👤 {o.customerName || 'Guest'} · {timeAgo(o.createdAt)}</p>
      </div>
      <div className="text-right">
        <p className="font-bold text-gold-600">{fmt(o.total)}</p>
        <span className="text-xs text-gray-500">{PAYMENT_ICONS[o.paymentMode] || '💵'} {o.paymentMode}</span>
      </div>
    </div>
  )
}

function OrderItems({ items = [] }) {
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-2 py-1">
          {item.image && <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover" />}
          <span className="flex-1">{item.name}{item.size ? ` (${item.size})` : ''}</span>
          <span className="text-gray-500 text-xs">× {item.qty}</span>
          <span className="font-semibold text-xs">{fmt(item.price * item.qty)}</span>
        </div>
      ))}
    </div>
  )
}
