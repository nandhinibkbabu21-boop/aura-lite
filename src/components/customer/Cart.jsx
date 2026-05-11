import React, { useState } from 'react'
import { X, ShoppingBag, Trash2, Minus, Plus, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import useCartStore from '../../store/cartStore.js'
import { fmt, uid } from '../../utils/formatters.js'
import { Btn, Input } from '../ui/index.jsx'
import { addOrder, getCoupons, updateCoupon, reduceStock } from '../../services/db.js'

const PAYMENT_MODES = [
  { id: 'Cash',    icon: '💵', label: 'Cash' },
  { id: 'GPay',    icon: '📱', label: 'GPay' },
  { id: 'PhonePe', icon: '💜', label: 'PhonePe' },
]

export default function Cart({ shop, shopId, session }) {
  const cart = useCartStore()
  const [couponInput, setCouponInput]   = useState('')
  const [applyingCoupon, setApplying]   = useState(false)
  const [checkout, setCheckout]         = useState(false)
  const [placing, setPlacing]           = useState(false)

  if (!cart.open) return null

  const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0)
  const total    = Math.max(0, subtotal - (cart.couponDiscount || 0))

  const applyCoupon = async () => {
    if (!couponInput.trim()) return
    setApplying(true)
    try {
      const coupons = await getCoupons(shopId)
      const c = coupons.find(x => x.code?.toUpperCase() === couponInput.toUpperCase().trim() && x.active !== false)
      if (!c) { toast.error('Invalid coupon code'); return }
      if (c.minOrder && subtotal < c.minOrder) { toast.error(`Minimum order ${fmt(c.minOrder)} required`); return }
      const disc = c.type === 'percent' ? Math.round(subtotal * c.value / 100) : c.value
      cart.setCoupon(c.code, disc)
      toast.success(`Coupon applied! You saved ${fmt(disc)} 🎉`)
    } catch { toast.error('Failed to apply coupon') }
    finally { setApplying(false) }
  }

  const placeOrder = async () => {
    if (!cart.paymentMode) { toast.error('Please select a payment method'); return }
    if (!cart.items.length) { toast.error('Cart is empty'); return }
    setPlacing(true)
    try {
      const orderId = await addOrder(shopId, {
        customerId:   session?.id || 'guest',
        customerName: session?.name || 'Guest',
        guestName:    session?.isGuest ? session?.name : null,
        items:        cart.items.map(i => ({ id: i.id, name: i.name, size: i.size, price: i.price, qty: i.qty, image: i.image })),
        total,
        subtotal,
        discount:     cart.couponDiscount || 0,
        couponCode:   cart.couponCode || '',
        paymentMode:  cart.paymentMode,
        date:         Date.now(),
      })

      // Reduce stock
      await reduceStock(shopId, cart.items.map(i => ({ id: i.id, size: i.size, qty: i.qty })))

      // Update coupon usage
      if (cart.couponCode) {
        const coupons = await getCoupons(shopId)
        const c = coupons.find(x => x.code === cart.couponCode)
        if (c) updateCoupon(shopId, c.id, { usedCount: (c.usedCount || 0) + 1 })
      }

      cart.clear()
      setCheckout(false)
      toast.success('✅ Order sent to counter! We\'ll start packing right away.', { duration: 5000 })
    } catch (e) {
      toast.error('Failed to place order. Try again.')
      console.error(e)
    } finally {
      setPlacing(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => cart.setOpen(false)} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-gold-500" />
            <span className="font-bold text-lg">Cart</span>
            <span className="text-sm text-gray-400">({cart.count} items)</span>
          </div>
          <button onClick={() => cart.setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Items */}
        {cart.items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <ShoppingBag className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">Your cart is empty</p>
              <p className="text-sm text-gray-400 mt-1">Add items to get started</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-3">
              {cart.items.map(item => (
                <div key={item.key} className="flex gap-3 bg-gray-50 rounded-2xl p-3">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-gray-200 flex items-center justify-center text-xl">👗</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.size && `Size: ${item.size} · `}{fmt(item.price)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => cart.updateQty(item.key, item.qty - 1)} className="w-6 h-6 bg-white border rounded-full flex items-center justify-center hover:bg-gray-100">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-bold w-4 text-center">{item.qty}</span>
                      <button onClick={() => cart.updateQty(item.key, item.qty + 1)} className="w-6 h-6 bg-white border rounded-full flex items-center justify-center hover:bg-gray-100">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <button onClick={() => cart.removeItem(item.key)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-bold text-sm text-gold-600">{fmt(item.price * item.qty)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Coupon */}
            <div className="px-4 pb-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    value={couponInput} onChange={e => setCouponInput(e.target.value)}
                    placeholder="Coupon code…"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-gold-400 text-sm outline-none"
                  />
                </div>
                <Btn variant="outline" size="sm" onClick={applyCoupon} loading={applyingCoupon}>Apply</Btn>
              </div>
              {cart.couponCode && (
                <div className="mt-2 flex items-center justify-between text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
                  <span>🎉 {cart.couponCode} — saving {fmt(cart.couponDiscount)}</span>
                  <button onClick={cart.clearCoupon} className="text-red-400 hover:text-red-600">✕</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer / Checkout */}
        {cart.items.length > 0 && (
          <div className="border-t p-4 space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            {cart.couponDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span><span>-{fmt(cart.couponDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base">
              <span>Total</span><span className="text-gold-600">{fmt(total)}</span>
            </div>

            {/* Payment mode */}
            <div>
              <p className="text-xs font-bold text-gray-600 mb-2">Payment Method <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_MODES.map(pm => (
                  <button key={pm.id} onClick={() => cart.setPaymentMode(pm.id)}
                    className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      cart.paymentMode === pm.id ? 'border-gold-500 bg-gold-50 text-gold-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <div>{pm.icon}</div>
                    <div className="text-xs mt-0.5">{pm.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <Btn variant="gold" size="xl" className="w-full" loading={placing}
              disabled={!cart.paymentMode} onClick={placeOrder}>
              ✦ Send Order to Counter · {fmt(total)}
            </Btn>
          </div>
        )}
      </div>
    </>
  )
}
