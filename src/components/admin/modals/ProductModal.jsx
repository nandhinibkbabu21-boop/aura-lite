import React, { useState, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Trash2, Plus, Upload } from 'lucide-react'
import { Modal, Btn, Input, Select } from '../../ui/index.jsx'
import { addProduct, updateProduct, uploadImage } from '../../../services/db.js'

const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size']
const CATEGORIES   = ['Men', 'Women', 'Kids', 'Newborn', 'Accessories', 'Footwear', 'Sports', 'Ethnic']

export default function ProductModal({ shopId, product: editing, onClose }) {
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      name:        editing?.name || '',
      category:    editing?.category || '',
      subcategory: editing?.subcategory || '',
      description: editing?.description || '',
      hasSizes:    editing?.hasSizes || false,
      price:       editing?.price || '',
      quantity:    editing?.quantity || '',
      sizeStock:   editing?.sizeStock?.length ? editing.sizeStock : [{ size: 'M', price: '', stock: '' }],
    }
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'sizeStock' })
  const hasSizes   = watch('hasSizes')
  const [loading, setLoading]   = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(editing?.image || '')
  const fileRef = useRef()

  const onImage = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setImageFile(f)
    setImagePreview(URL.createObjectURL(f))
  }

  const addPreset = (size) => {
    if (fields.find(f => f.size === size)) { toast.error(`${size} already added`); return }
    append({ size, price: '', stock: '' })
  }

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      let image = editing?.image || ''
      if (imageFile) image = await uploadImage(shopId, imageFile)

      const payload = {
        name:        data.name.trim(),
        category:    data.category,
        subcategory: data.subcategory || '',
        description: data.description || '',
        hasSizes:    !!data.hasSizes,
        image,
      }

      if (data.hasSizes) {
        const ss = data.sizeStock.filter(s => s.size && s.price)
        payload.sizeStock = ss.map(s => ({ size: s.size, price: +s.price, stock: +s.stock || 0 }))
        payload.price     = Math.min(...ss.map(s => +s.price))
        payload.quantity  = ss.reduce((s, x) => s + (+x.stock || 0), 0)
      } else {
        payload.price    = +data.price
        payload.quantity = +data.quantity
        payload.sizeStock = []
      }

      if (editing) {
        await updateProduct(shopId, editing.id, payload)
        toast.success('Product updated!')
      } else {
        await addProduct(shopId, payload)
        toast.success('Product added!')
      }
      onClose()
    } catch (e) {
      toast.error(e.message || 'Failed to save product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title={editing ? 'Edit Product' : 'Add Product'} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4 pb-8">
        {/* Image upload */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Product Image</p>
          <div
            onClick={() => fileRef.current.click()}
            className="w-full h-36 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gold-400 transition-colors overflow-hidden"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-gray-400">
                <Upload className="w-6 h-6 mx-auto mb-1" />
                <p className="text-xs">Tap to upload</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImage} />
        </div>

        <Input label="Product Name" required placeholder="e.g. Silk Anarkali Kurta"
          error={errors.name?.message} {...register('name', { required: 'Name required' })} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">Category</label>
            <input list="cat-list" className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-gold-400 text-sm outline-none"
              placeholder="Type or select…" {...register('category', { required: true })} />
            <datalist id="cat-list">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <Input label="Subcategory" placeholder="e.g. Kurtis" {...register('subcategory')} />
        </div>

        <Input label="Description" placeholder="Optional description" {...register('description')} />

        {/* Has sizes toggle */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-sm font-bold text-gray-700 mb-3">Does this product have sizes?</p>
          <div className="grid grid-cols-2 gap-2">
            {[['false', 'No — single price & stock'], ['true', 'Yes — size-wise price & stock']].map(([val, lbl]) => (
              <label key={val} className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${String(hasSizes) === val ? 'border-gold-500 bg-gold-50' : 'border-gray-200'}`}>
                <input type="radio" value={val} checked={String(hasSizes) === val}
                  onChange={() => setValue('hasSizes', val === 'true')} className="accent-gold-500" />
                <span className="text-xs font-semibold">{lbl}</span>
              </label>
            ))}
          </div>
        </div>

        {/* No sizes */}
        {!hasSizes && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price (₹)" type="number" min="0" required placeholder="e.g. 599"
              error={errors.price?.message} {...register('price', { required: !hasSizes })} />
            <Input label="Stock Qty" type="number" min="0" required placeholder="e.g. 50"
              error={errors.quantity?.message} {...register('quantity', { required: !hasSizes })} />
          </div>
        )}

        {/* With sizes */}
        {hasSizes && (
          <div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Quick Add Size</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_SIZES.map(sz => (
                <button type="button" key={sz}
                  onClick={() => addPreset(sz)}
                  className="px-3 py-1.5 rounded-full border-2 border-gray-200 text-xs font-bold text-gray-600 hover:border-gold-500 hover:bg-gold-50 hover:text-gold-700 transition-all">
                  {sz}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 font-bold">
                    <th className="text-left py-1 pl-1">Size</th>
                    <th className="text-left py-1">Price (₹)</th>
                    <th className="text-left py-1">Stock</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="space-y-2">
                  {fields.map((field, i) => (
                    <tr key={field.id}>
                      <td className="pr-2 py-1">
                        <input list="size-list" className="w-20 px-2 py-1.5 rounded-lg border text-sm outline-none focus:border-gold-400"
                          placeholder="e.g. L" {...register(`sizeStock.${i}.size`)} />
                        <datalist id="size-list">{PRESET_SIZES.map(s => <option key={s} value={s} />)}</datalist>
                      </td>
                      <td className="pr-2 py-1">
                        <input type="number" min="0" className="w-24 px-2 py-1.5 rounded-lg border text-sm outline-none focus:border-gold-400"
                          placeholder="₹" {...register(`sizeStock.${i}.price`)} />
                      </td>
                      <td className="pr-2 py-1">
                        <input type="number" min="0" className="w-20 px-2 py-1.5 rounded-lg border text-sm outline-none focus:border-gold-400"
                          placeholder="Qty" {...register(`sizeStock.${i}.stock`)} />
                      </td>
                      <td>
                        <button type="button" onClick={() => fields.length > 1 && remove(i)}
                          className="text-red-400 hover:text-red-600 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => append({ size: '', price: '', stock: '' })}
              className="mt-2 flex items-center gap-1 text-xs text-gold-600 font-semibold hover:underline">
              <Plus className="w-3 h-3" /> Add custom size
            </button>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Btn type="button" variant="ghost" size="md" className="flex-1" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="gold" size="md" className="flex-1" loading={loading}>
            {editing ? 'Save Changes' : 'Add Product'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
