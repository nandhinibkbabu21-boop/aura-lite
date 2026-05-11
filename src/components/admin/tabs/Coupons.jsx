import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { addCoupon, updateCoupon, deleteCoupon } from '../../../services/db.js'
import { fmt, uid } from '../../../utils/formatters.js'
import { Btn, Badge, Card, Empty, Modal, Input, Select } from '../../ui/index.jsx'

export default function CouponsTab({ coupons, shopId }) {
  const [modal, setModal]   = useState(false)
  const [editing, setEditing] = useState(null)

  const handleDelete = async (c) => {
    if (!confirm(`Delete coupon "${c.code}"?`)) return
    await deleteCoupon(shopId, c.id)
    toast.success('Coupon deleted')
  }

  const totalDiscount = coupons.reduce((s, c) => s + (c.usedCount || 0) * (c.flatDiscount || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Coupons ({coupons.length})</h2>
          {totalDiscount > 0 && <p className="text-xs text-gray-400 mt-0.5">Total discounts given: {fmt(totalDiscount)}</p>}
        </div>
        <Btn variant="gold" size="sm" onClick={() => { setEditing(null); setModal(true) }}>
          <Plus className="w-3.5 h-3.5" /> Add Coupon
        </Btn>
      </div>

      {coupons.length === 0 ? (
        <Empty icon={Tag} title="No coupons" subtitle="Create discount codes for your customers"
          action={<Btn variant="gold" onClick={() => setModal(true)}>+ Add Coupon</Btn>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map(c => (
            <Card key={c.id} className="p-4 relative overflow-hidden">
              {/* Decorative coupon dashes */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-6 bg-gray-100 rounded-r-full" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-6 bg-gray-100 rounded-l-full" />

              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono font-bold text-lg tracking-widest text-gold-600">{c.code}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.discountType === 'percent'
                      ? `${c.discountValue}% off`
                      : `${fmt(c.flatDiscount || c.discountValue)} off`}
                    {c.minOrder > 0 && ` · Min ₹${c.minOrder}`}
                  </p>
                </div>
                <Badge color={c.active !== false ? 'green' : 'red'}>
                  {c.active !== false ? 'Active' : 'Off'}
                </Badge>
              </div>

              {c.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{c.description}</p>}

              <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                <span>Used: <strong className="text-gray-700">{c.usedCount || 0}</strong></span>
                {c.maxUses > 0 && <span>/ {c.maxUses} max</span>}
                {c.expiresAt && <span>Exp: {new Date(c.expiresAt).toLocaleDateString('en-IN')}</span>}
              </div>

              {/* Usage bar */}
              {c.maxUses > 0 && (
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gold-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((c.usedCount || 0) / c.maxUses) * 100)}%` }} />
                </div>
              )}

              <div className="flex gap-2">
                <Btn size="sm" variant="outline" className="flex-1"
                  onClick={() => { setEditing(c); setModal(true) }}>
                  <Pencil className="w-3 h-3" /> Edit
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => handleDelete(c)}>
                  <Trash2 className="w-3 h-3 text-red-400" />
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <CouponModal shopId={shopId} coupon={editing}
          onClose={() => { setModal(false); setEditing(null) }} />
      )}
    </div>
  )
}

function CouponModal({ shopId, coupon: c, onClose }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      code:          c?.code || '',
      discountType:  c?.discountType || 'flat',
      discountValue: c?.discountValue || '',
      minOrder:      c?.minOrder || '',
      maxUses:       c?.maxUses || '',
      description:   c?.description || '',
      active:        c?.active !== false,
      expiresAt:     c?.expiresAt || '',
    }
  })
  const [loading, setLoading] = useState(false)
  const discountType = watch('discountType')

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const payload = {
        code:          data.code.toUpperCase().trim(),
        discountType:  data.discountType,
        discountValue: Number(data.discountValue),
        flatDiscount:  data.discountType === 'flat' ? Number(data.discountValue) : 0,
        minOrder:      Number(data.minOrder) || 0,
        maxUses:       Number(data.maxUses) || 0,
        description:   data.description,
        active:        data.active,
        expiresAt:     data.expiresAt || null,
      }
      if (c) {
        await updateCoupon(shopId, c.id, payload)
      } else {
        await addCoupon(shopId, { ...payload, usedCount: 0 })
      }
      toast.success(c ? 'Coupon updated!' : 'Coupon created!')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title={c ? 'Edit Coupon' : 'New Coupon'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-3 pb-6">
        <Input label="Coupon Code" required placeholder="e.g. SAVE50"
          error={errors.code?.message}
          {...register('code', { required: 'Code required' })}
          style={{ textTransform: 'uppercase' }} />

        <div className="grid grid-cols-2 gap-3">
          <Select label="Discount Type" {...register('discountType')}>
            <option value="flat">Flat (₹)</option>
            <option value="percent">Percent (%)</option>
          </Select>
          <Input label={discountType === 'percent' ? 'Discount %' : 'Discount ₹'}
            type="number" required min="1"
            error={errors.discountValue?.message}
            {...register('discountValue', { required: 'Value required' })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Min Order (₹)" type="number" placeholder="0 = no min" {...register('minOrder')} />
          <Input label="Max Uses" type="number" placeholder="0 = unlimited" {...register('maxUses')} />
        </div>

        <Input label="Expiry Date" type="date" {...register('expiresAt')} />

        <Input label="Description (optional)" placeholder="e.g. First order discount"
          {...register('description')} />

        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" {...register('active')} className="w-4 h-4 accent-yellow-500" />
          Active (customers can use this coupon)
        </label>

        <div className="flex gap-3 pt-2">
          <Btn type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="gold" className="flex-1" loading={loading}>
            {c ? 'Save' : 'Create'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
