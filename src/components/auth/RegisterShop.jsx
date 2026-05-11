import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import { Btn, Input } from '../ui/index.jsx'
import { setShop, createUser } from '../../services/db.js'
import useAuthStore from '../../store/authStore.js'
import { uid } from '../../utils/formatters.js'

export default function RegisterShop() {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm()
  const [loading, setLoading] = useState(false)
  const { setShop: storeSetShop, setSession } = useAuthStore()

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const shopId = uid()
      const shop = {
        name: data.shopName, address: data.address,
        phone: data.phone, gst: data.gst || '',
        ownerName: data.ownerName, adminUsername: data.adminUsername,
        createdAt: Date.now()
      }
      await setShop(shopId, shop)
      await createUser(data.adminUsername, {
        role: 'admin', shopId, name: data.ownerName,
        id: shopId, password: data.adminPassword
      })
      storeSetShop(shop, shopId)
      setSession({ role: 'admin', name: data.ownerName, username: data.adminUsername, id: shopId, shopId })
      toast.success(`Welcome, ${data.shopName}! 🎉`)
      navigate('/admin')
    } catch (e) {
      toast.error(e.message || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-white flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-500 mb-6 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Set Up Your Shop</h1>
          <p className="text-sm text-gray-500 mt-1">Get started in under 2 minutes</p>
        </div>
        <div className="bg-white rounded-3xl shadow-lg p-6 space-y-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Shop Name" placeholder="e.g. Zara Aura Boutique" required error={errors.shopName?.message}
              {...register('shopName', { required: 'Shop name required' })} />
            <Input label="Owner Name" placeholder="Your full name" required error={errors.ownerName?.message}
              {...register('ownerName', { required: 'Owner name required' })} />
            <Input label="Shop Address" placeholder="Full address" required error={errors.address?.message}
              {...register('address', { required: 'Address required' })} />
            <Input label="Phone Number" placeholder="10-digit number" type="tel" required error={errors.phone?.message}
              {...register('phone', { required: 'Phone required', pattern: { value: /^[0-9]{10}$/, message: 'Must be 10 digits' } })} />
            <Input label="GST Number (optional)" placeholder="15-char GST" {...register('gst')} />
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Admin Credentials</p>
              <div className="space-y-3">
                <Input label="Admin Username" placeholder="Choose username" required error={errors.adminUsername?.message}
                  {...register('adminUsername', { required: 'Username required' })} />
                <Input label="Admin Password" placeholder="Choose strong password" type="password" required error={errors.adminPassword?.message}
                  {...register('adminPassword', { required: 'Password required', minLength: { value: 6, message: 'Min 6 characters' } })} />
              </div>
            </div>
            <Btn type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
              ✦ Launch My Boutique
            </Btn>
          </form>
        </div>
      </div>
    </div>
  )
}
