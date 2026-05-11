import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Btn, Input, Select } from '../ui/index.jsx'
import useAuthStore from '../../store/authStore.js'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { shopId, registerCustomer } = useAuthStore()
  const { register, handleSubmit, formState: { errors } } = useForm()
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (data) => {
    if (!shopId) { toast.error('No shop found on this device. Visit the shop first.'); return }
    setLoading(true)
    const res = await registerCustomer(shopId, {
      name: data.name,
      username: data.username,
      phone: data.phone || '',
      password: data.password || '',
      gender: data.gender || '',
      size: data.size || '',
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Welcome to Zara Aura! 🎉')
      navigate('/shop')
    } else {
      toast.error(res.error || 'Registration failed')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-4 py-8">
        <div className="w-full max-w-sm mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
            <p className="text-sm text-gray-500 mt-1">Join for a personalised shopping experience</p>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-6 space-y-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Full Name" placeholder="Your full name" required
                error={errors.name?.message}
                {...register('name', { required: 'Name is required' })}
              />
              <Input
                label="Username" placeholder="Choose a unique username" required
                hint="Used to log in — keep it simple (e.g. riya25)"
                error={errors.username?.message}
                {...register('username', {
                  required: 'Username is required',
                  pattern: { value: /^[a-zA-Z0-9_]{3,20}$/, message: 'Only letters, numbers, underscore (3-20 chars)' }
                })}
              />
              <Input
                label="Phone Number"
                placeholder="10-digit mobile number"
                hint="Optional — used for order updates"
                type="tel" maxLength={10}
                error={errors.phone?.message}
                {...register('phone', {
                  pattern: { value: /^[0-9]{10}$|^$/, message: 'Must be exactly 10 digits' }
                })}
              />
              <div className="relative">
                <Input
                  label="Password"
                  placeholder="Set a password (optional)"
                  hint="Leave blank to login with username + phone"
                  type={showPwd ? 'text' : 'password'}
                  {...register('password')}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-9 text-gray-400">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Gender" {...register('gender')}>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </Select>
                <Select label="Default Size" {...register('size')}>
                  <option value="">Select</option>
                  {['XS','S','M','L','XL','XXL','XXXL'].map(s => <option key={s}>{s}</option>)}
                </Select>
              </div>
              <Btn type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
                ✦ Create My Account
              </Btn>
            </form>
            <p className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <button onClick={() => navigate('/login/customer')} className="text-gold-600 font-semibold">Sign In</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
