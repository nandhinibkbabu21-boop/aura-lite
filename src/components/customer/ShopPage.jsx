import React, { useEffect, useState, useCallback } from 'react'
import { ShoppingCart, Search, X, Package, LogOut, Bell } from 'lucide-react'
import toast from 'react-hot-toast'
import useAuthStore from '../../store/authStore.js'
import useCartStore from '../../store/cartStore.js'
import { listenProducts, listenCustomerOrders, addOrder, getCoupons, updateCoupon, reduceStock } from '../../services/db.js'
import { fmt, timeAgo, STATUS_LABELS, PAYMENT_ICONS, uid } from '../../utils/formatters.js'
import { Spinner, Badge, Modal, Card, Empty, Skeleton, ProductSkeleton, Btn, Input } from '../ui/index.jsx'
import ProductCard from './ProductCard.jsx'
import Cart from './Cart.jsx'
import { downloadBill, printBill } from '../../utils/pdf.js'

const TABS = [
  { id: 'shop',   label: '🛍 Shop' },
  { id: 'orders', label: '📦 Orders' },
]

export default function ShopPage() {
  const { session, shop, shopId, logout } = useAuthStore()
  const cart = useCartStore()

  const [products, setProducts]       = useState([])
  const [myOrders, setMyOrders]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('shop')
  const [search, setSearch]           = useState('')
  const [catFilter, setCatFilter]     = useState('all')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [prevOrderStatuses, setPrevOrderStatuses] = useState({})

  // ── Real-time products ──────────────────────────────────────
  useEffect(() => {
    if (!shopId) return
    setLoading(true)
    const unsub = listenProducts(shopId, data => {
      setProducts(data.filter(p => +p.quantity > 0 || p.hasSizes))
      setLoading(false)
    })
    return unsub
  }, [shopId])

  // ── Real-time customer orders + push notification ──────────
  useEffect(() => {
    if (!shopId || !session?.id || session.isGuest) return
    const unsub = listenCustomerOrders(shopId, session.id, orders => {
      setMyOrders(orders)
      // Notify on status change
      orders.forEach(o => {
        const prev = prevOrderStatuses[o.id]
        if (prev && prev !== o.status) {
          const msgs = {
            accepted: `📦 Order #${o.id.slice(-4).toUpperCase()} accepted! Packing in ~${o.estimatedTime || '?'} min`,
            packing:  `⏱ Your order #${o.id.slice(-4).toUpperCase()} is being packed`,
            ready:    `✅ Order #${o.id.slice(-4).toUpperCase()} is READY for pickup!`,
            completed:`✓ Order completed. Thank you!`,
          }
          if (msgs[o.status]) toast.success(msgs[o.status], { duration: 6000 })
        }
      })
      setPrevOrderStatuses(Object.fromEntries(orders.map(o => [o.id, o.status])))
    })
    return unsub
  }, [shopId, session?.id])

  // ── Filtered products ───────────────────────────────────────
  const categories = ['all', ...new Set(products.map(p => p.category).filter(Boolean))]
  const filtered = products.filter(p => {
    const matchCat = catFilter === 'all' || p.category === catFilter
    const q = search.toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  const activeOrders = myOrders.filter(o => ['pending','accepted','packing','ready'].includes(o.status || 'pending'))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">
              <span className="text-gold-500 font-serif">ZARA</span>
              <span className="text-gray-400 font-light text-sm ml-1">Aura</span>
            </h1>
            {shop?.name && <p className="text-xs text-gray-500 -mt-0.5">{shop.name}</p>}
          </div>
          <div className="relative flex-1 max-w-[180px]">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gold-400 bg-gray-50"
            />
          </div>
          <button onClick={() => cart.setOpen(true)} className="relative p-2.5 bg-gold-500 text-white rounded-xl shadow">
            <ShoppingCart className="w-4 h-4" />
            {cart.count > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {cart.count}
              </span>
            )}
          </button>
          <button onClick={logout} className="p-2.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Active order banner */}
        {activeOrders.length > 0 && (
          <button onClick={() => setTab('orders')} className="w-full bg-blue-600 text-white text-xs font-semibold py-2 px-4 flex items-center justify-center gap-2 animate-pulse-slow">
            <Bell className="w-3.5 h-3.5" />
            {activeOrders.length} active order{activeOrders.length > 1 ? 's' : ''} — tap to track
          </button>
        )}
      </header>

      {/* Bottom nav */}
      <div className="sticky top-[56px] z-20 bg-white border-b flex max-w-lg mx-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors relative ${tab === t.id ? 'text-gold-700' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.id === 'orders' && activeOrders.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{activeOrders.length}</span>
            )}
            {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-500 rounded-t" />}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto">
        {/* Shop tab */}
        {tab === 'shop' && (
          <>
            {/* Category nav */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
              {categories.map(cat => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    catFilter === cat ? 'bg-gold-500 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'
                  }`}>
                  {cat === 'all' ? '✦ All' : cat}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-3 px-4">
                {[1,2,3,4].map(i => <ProductSkeleton key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <Empty icon={Package} title="No products found" subtitle={search ? 'Try a different search' : 'No products available'} />
            ) : (
              <div className="grid grid-cols-2 gap-3 px-4 pb-24">
                {filtered.map(p => (
                  <ProductCard key={p.id} product={p} onSelect={() => setSelectedProduct(p)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Orders tab */}
        {tab === 'orders' && <OrderHistory orders={myOrders} shop={shop} session={session} />}
      </div>

      {/* Cart sidebar */}
      <Cart shop={shop} shopId={shopId} session={session} />

      {/* Product detail modal */}
      {selectedProduct && (
        <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  )
}

// ── Product Detail Modal ──────────────────────────────────────
function ProductDetailModal({ product: p, onClose }) {
  const cart = useCartStore()
  const [selSizeIdx, setSelSizeIdx] = useState(0)

  const sizes = p.hasSizes && p.sizeStock?.length ? p.sizeStock : []
  const selSize = sizes[selSizeIdx]
  const price = selSize ? +selSize.price : +(p.price || 0)
  const stock = selSize ? +selSize.stock : +(p.quantity || 0)
  const oos = stock === 0

  const addToCart = () => {
    cart.addItem(p, selSize?.size || '', price)
    toast.success(`Added to cart!`)
    onClose()
  }

  return (
    <Modal open title={p.name} onClose={onClose} size="md">
      <div className="p-4">
        {p.image && <img src={p.image} alt={p.name} className="w-full h-52 object-cover rounded-xl mb-4" />}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-bold text-lg">{p.name}</h2>
            {p.category && <p className="text-sm text-gray-500">{p.category}{p.subcategory ? ` · ${p.subcategory}` : ''}</p>}
          </div>
          <span className="text-2xl font-bold text-gold-600">{fmt(price)}</span>
        </div>

        {sizes.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Select Size</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s, i) => {
                const oos = +s.stock === 0
                return (
                  <button key={s.size} onClick={() => !oos && setSelSizeIdx(i)}
                    className={`relative px-4 py-2 rounded-xl border-2 text-sm font-bold transition-all ${
                      i === selSizeIdx ? 'border-gold-500 bg-gold-50 text-gold-700' :
                      oos ? 'border-gray-200 text-gray-300 cursor-not-allowed line-through' :
                      'border-gray-200 text-gray-700 hover:border-gold-300'
                    }`}>
                    {s.size}
                    <span className="block text-xs font-normal text-gray-500">{fmt(s.price)}</span>
                    {oos && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 rounded-full">OOS</span>}
                  </button>
                )
              })}
            </div>
            {selSize && <p className="text-xs text-gray-500 mt-2">Stock: {selSize.stock} remaining</p>}
          </div>
        )}

        {p.description && <p className="text-sm text-gray-600 mb-4">{p.description}</p>}

        <Btn variant={oos ? 'ghost' : 'gold'} size="xl" className="w-full" disabled={oos} onClick={addToCart}>
          {oos ? 'Out of Stock' : `+ Add to Cart — ${fmt(price)}`}
        </Btn>
      </div>
    </Modal>
  )
}

// ── Order History ─────────────────────────────────────────────
function OrderHistory({ orders, shop, session }) {
  if (!session || session.isGuest) {
    return <Empty icon={Package} title="Order history unavailable" subtitle="Log in with an account to track your orders" />
  }
  if (!orders.length) {
    return <Empty icon={Package} title="No orders yet" subtitle="Start shopping to see your order history here!" />
  }

  return (
    <div className="px-4 pb-24 pt-4 space-y-4">
      {orders.map(o => <OrderCard key={o.id} order={o} shop={shop} />)}
    </div>
  )
}

function OrderCard({ order: o, shop }) {
  const meta = STATUS_LABELS[o.status] || STATUS_LABELS.pending
  const [showBill, setShowBill] = useState(false)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-sm font-mono">#{(o.id || '').slice(-6).toUpperCase()}</p>
          <p className="text-xs text-gray-500">{timeAgo(o.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-gold-600">{fmt(o.total)}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>{meta.label}</span>
        </div>
      </div>

      <div className="space-y-1 mb-3">
        {(o.items || []).map((item, i) => (
          <p key={i} className="text-sm text-gray-700">• {item.name}{item.size ? ` (${item.size})` : ''} × {item.qty} — {fmt(item.price * item.qty)}</p>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
        <span>{PAYMENT_ICONS[o.paymentMode] || '💵'} {o.paymentMode || 'Cash'}</span>
        {o.estimatedTime && <span>⏱ ~{o.estimatedTime} min</span>}
        {o.employeeName && <span>👤 {o.employeeName}</span>}
      </div>

      {/* Status banners */}
      {o.status === 'accepted' && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
          📦 Your order is being packed. Estimated time: <strong>{o.estimatedTime || '?'} min</strong>
        </div>
      )}
      {o.status === 'ready' && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 font-semibold">
          ✅ Your order is ready! Please collect it from the counter.
        </div>
      )}

      {(o.status === 'ready' || o.status === 'completed') && (
        <div className="mt-3 flex gap-2">
          <Btn size="sm" variant="outline" onClick={() => downloadBill(o, shop, { name: o.customerName })}>⬇ Download Bill</Btn>
          <Btn size="sm" variant="ghost"   onClick={() => printBill(o, shop, { name: o.customerName })}>🖨 Print</Btn>
        </div>
      )}
    </Card>
  )
}
