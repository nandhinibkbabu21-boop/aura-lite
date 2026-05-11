import React, { useState } from 'react'
import { ShoppingCart, Eye } from 'lucide-react'
import useCartStore from '../../store/cartStore.js'
import { fmt } from '../../utils/formatters.js'
import toast from 'react-hot-toast'

export default function ProductCard({ product: p, onSelect }) {
  const cart = useCartStore()
  const hasSizes = p.hasSizes && p.sizeStock?.length
  const basePrice = hasSizes ? Math.min(...p.sizeStock.map(s => +s.price)) : +(p.price || 0)
  const totalStock = hasSizes
    ? p.sizeStock.reduce((s, x) => s + +x.stock, 0)
    : +(p.quantity || 0)
  const oos = totalStock === 0

  const quickAdd = (e) => {
    e.stopPropagation()
    if (hasSizes) { onSelect(); return }
    if (oos) { toast.error('Out of stock'); return }
    cart.addItem(p, '', +(p.price || 0))
    toast.success(`${p.name} added!`)
  }

  return (
    <div onClick={onSelect} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer active:scale-98 transition-transform hover:shadow-md">
      {/* Image */}
      <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-200">
        {p.image ? (
          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">👗</div>
        )}
        {oos && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-white text-gray-700 text-xs font-bold px-3 py-1 rounded-full">Out of Stock</span>
          </div>
        )}
        {hasSizes && !oos && (
          <div className="absolute top-2 right-2 bg-gold-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
            Sizes
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="font-semibold text-sm text-gray-900 truncate">{p.name}</p>
        {p.category && <p className="text-xs text-gray-400 truncate">{p.category}</p>}

        {/* Size chips preview */}
        {hasSizes && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {p.sizeStock.slice(0, 4).map(s => (
              <span key={s.size} className={`text-xs px-1.5 py-0.5 rounded font-medium ${+s.stock === 0 ? 'bg-gray-100 text-gray-300 line-through' : 'bg-gold-50 text-gold-700'}`}>
                {s.size}
              </span>
            ))}
            {p.sizeStock.length > 4 && <span className="text-xs text-gray-400">+{p.sizeStock.length - 4}</span>}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <div>
            <span className="font-bold text-gold-600 text-base">{fmt(basePrice)}</span>
            {hasSizes && <span className="text-xs text-gray-400 ml-1">from</span>}
          </div>
          <button onClick={quickAdd}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              oos ? 'bg-gray-100 text-gray-300' : 'bg-gold-500 text-white hover:bg-gold-600 active:scale-90'
            }`}>
            <ShoppingCart className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
