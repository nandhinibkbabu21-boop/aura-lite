import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
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
      name: data.name, username: data.username,
      phone: data.phone || '', password: data.password || '',
      gender: data.gender || '', size: data.size || '',
    })
    setLoading(false)
    if (res.ok) { toast.success('Welcome to Zara Aura!'); navigate('/shop') }
    else toast.error(res.error || 'Registration failed')
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-5 py-12"
      style={{ background:'var(--white)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:`radial-gradient(circle at 20% 60%, rgba(201,168,76,0.06) 0%, transparent 50%),
                         radial-gradient(circle at 80% 20%, rgba(201,168,76,0.06) 0%, transparent 40%)`
      }} />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div style={{ fontFamily:'var(--font-serif)', lineHeight:1 }} className="mb-3">
            <span className="text-3xl font-semibold gold-text">ZARA</span>
            <span className="ml-2 text-sm font-light tracking-[0.25em] uppercase align-middle"
              style={{ color:'var(--text-light)' }}>Aura</span>
          </div>
          <h2 style={{ fontFamily:'var(--font-serif)', color:'var(--text-dark)' }} className="text-2xl font-semibold">
            Create Account
          </h2>
          <p className="text-xs mt-1" style={{ color:'var(--text-light)' }}>Join for a personalised shopping experience</p>
        </div>

        <div className="rounded-[28px] p-8 space-y-4"
          style={{ background:'var(--white)', border:'1px solid var(--border-light)', boxShadow:'var(--shadow-xl)' }}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Full Name" placeholder="Your full name" required
              error={errors.name?.message}
              {...register('name', { required: 'Name is required' })} />
            <Input label="Username" placeholder="e.g. riya25" required
              error={errors.username?.message}
              {...register('username', {
                required: 'Username is required',
                pattern: { value:/^[a-zA-Z0-9_]{3,20}$/, message:'Only letters, numbers, underscore (3-20 chars)' }
              })} />
            <Input label="Phone Number (optional)" placeholder="10-digit mobile" type="tel" maxLength={10}
              error={errors.phone?.message}
              {...register('phone', { pattern: { value:/^[0-9]{10}$|^$/, message:'Must be exactly 10 digits' } })} />
            <div className="relative">
              <Input label="Password (optional)" placeholder="Leave blank to login with username + phone"
                type={showPwd ? 'text' : 'password'} {...register('password')} />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 bottom-2.5" style={{ color:'var(--text-xlight)' }}>
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Gender" {...register('gender')}>
                <option value="">Select</option>
                <option>Female</option><option>Male</option><option>Other</option>
              </Select>
              <Select label="Default Size" {...register('size')}>
                <option value="">Select</option>
                {['XS','S','M','L','XL','XXL','XXXL'].map(s => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <Btn type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
              ✦ &nbsp; Create My Account
            </Btn>
          </form>
          <p className="text-center text-xs" style={{ color:'var(--text-light)' }}>
            Already have an account?{' '}
            <button onClick={() => navigate('/login/customer')}
              className="font-semibold" style={{ color:'var(--gold-dark)' }}>Sign In</button>
          </p>
        </div>

        <div className="text-center mt-6">
          <button onClick={() => navigate(-1)} className="text-xs font-medium" style={{ color:'var(--text-light)' }}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  )
}
