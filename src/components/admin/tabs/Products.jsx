import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { deleteProduct } from '../../../services/db.js'
import { fmt } from '../../../utils/formatters.js'
import { Btn, Badge, Card, Empty } from '../../ui/index.jsx'
import ProductModal from '../modals/ProductModal.jsx'

export default function ProductsTab({ products, shopId }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [q, setQ]                 = useState('')

  const filtered = products.filter(p => !q || p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return
    await deleteProduct(shopId, id)
    toast.success('Product deleted')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Products ({products.length})</h2>
        <div className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
            className="px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-gold-400 w-36" />
          <Btn variant="gold" size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Btn>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty icon={Package} title="No products" subtitle="Add your first product to get started"
          action={<Btn variant="gold" onClick={() => setModalOpen(true)}>+ Add Product</Btn>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Card key={p.id} className="overflow-hidden">
              <div className="h-36 bg-gradient-to-br from-gray-100 to-gray-200 relative">
                {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-4xl">👗</div>}
                <div className="absolute top-2 right-2 flex gap-1">
                  {p.quantity === 0 && !p.hasSizes && <Badge color="red">OOS</Badge>}
                  {p.hasSizes && <Badge color="gold">Sizes</Badge>}
                </div>
              </div>
              <div className="p-3">
                <p className="font-bold truncate">{p.name}</p>
                <p className="text-xs text-gray-500">{p.category} {p.subcategory ? `· ${p.subcategory}` : ''}</p>
                {p.hasSizes ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(p.sizeStock || []).map(s => (
                      <span key={s.size} className={`text-xs px-1.5 py-0.5 rounded font-semibold ${+s.stock === 0 ? 'bg-red-50 text-red-400 line-through' : 'bg-gold-50 text-gold-700'}`}>
                        {s.size}:{s.stock}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-bold text-gold-600 mt-1">{fmt(p.price)} · Stock: {p.quantity}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <Btn size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(p); setModalOpen(true) }}>
                    <Pencil className="w-3 h-3" /> Edit
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <ProductModal shopId={shopId} product={editing}
          onClose={() => { setModalOpen(false); setEditing(null) }} />
      )}
    </div>
  )
}
