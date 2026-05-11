import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import { Btn, Input, Divider } from '../ui/index.jsx'
import useAuthStore from '../../store/authStore.js'

const ROLE_META = {
  admin:    { icon: '👑', title: 'Admin',    label: 'Admin Login' },
  employee: { icon: '🏷️', title: 'Employee', label: 'Employee Login' },
  customer: { icon: '🛍️', title: 'Customer', label: 'Customer Login' },
}

export default function LoginPage() {
  const { role } = useParams()
  const navigate  = useNavigate()
  const { login, loginCustomer, loginGuest, shopId } = useAuthStore()
  const { register, handleSubmit, formState: { errors } } = useForm()
  const [showPwd,   setShowPwd]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [loginMode, setLoginMode] = useState('username')
  const [guestMode, setGuestMode] = useState(false)
  const meta = ROLE_META[role] || ROLE_META.customer

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const res = role === 'customer'
        ? await loginCustomer(data.identifier, data.credential)
        : await login(role, data.identifier, data.credential)
      if (res.ok) {
        toast.success('Welcome back!')
        navigate(role === 'admin' ? '/admin' : role === 'employee' ? '/employee' : '/shop')
      } else {
        toast.error(res.error || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const onGuest = (data) => {
    const res = loginGuest(data.guestName, data.guestPhone)
    if (res.ok) { toast.success(`Welcome, ${data.guestName}!`); navigate('/shop') }
    else toast.error(res.error)
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-5 py-12"
      style={{ background:'var(--white)' }}>
      {/* BG patterns */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:`radial-gradient(circle at 20% 60%, rgba(201,168,76,0.06) 0%, transparent 50%),
                         radial-gradient(circle at 80% 20%, rgba(201,168,76,0.06) 0%, transparent 40%)`
      }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{
        backgroundImage:`repeating-linear-gradient(0deg,#C9A84C 0,#C9A84C 1px,transparent 1px,transparent 60px),
                         repeating-linear-gradient(90deg,#C9A84C 0,#C9A84C 1px,transparent 1px,transparent 60px)`
      }} />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div style={{ fontFamily:'var(--font-serif)', lineHeight:1 }} className="mb-4">
            <span className="text-3xl font-semibold gold-text">ZARA</span>
            <span className="ml-2 text-sm font-light tracking-[0.25em] uppercase align-middle"
              style={{ color:'var(--text-light)' }}>Aura</span>
          </div>
          <div className="text-3xl mb-2">{meta.icon}</div>
          <h2 style={{ fontFamily:'var(--font-serif)', color:'var(--text-dark)' }} className="text-2xl font-semibold">
            {meta.label}
          </h2>
        </div>

        <div className="rounded-[28px] p-8"
          style={{ background:'var(--white)', border:'1px solid var(--border-light)', boxShadow:'var(--shadow-xl)' }}>

          {/* Customer login type toggle */}
          {role === 'customer' && !guestMode && (
            <div className="flex rounded-[8px] overflow-hidden mb-6"
              style={{ border:'1px solid var(--border)', background:'var(--cream-2)' }}>
              {[['username','👤 Username'],['phone','📱 Phone']].map(([m,l]) => (
                <button key={m} onClick={() => setLoginMode(m)}
                  className="flex-1 py-2.5 text-xs font-semibold tracking-[0.05em] transition-all"
                  style={{
                    background: loginMode===m ? 'var(--white)' : 'transparent',
                    color: loginMode===m ? 'var(--gold-dark)' : 'var(--text-light)',
                    borderRight: m==='username' ? '1px solid var(--border-light)' : 'none',
                    boxShadow: loginMode===m ? 'var(--shadow-sm)' : 'none',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {!guestMode ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label={loginMode === 'phone' ? 'Phone Number' : (role === 'customer' ? 'Username or Phone' : 'Username')}
                placeholder={loginMode === 'phone' ? '10-digit phone number' : 'Enter your username'}
                type={loginMode === 'phone' ? 'tel' : 'text'}
                required
                error={errors.identifier?.message}
                {...register('identifier', { required: 'This field is required' })}
              />
              <div className="relative">
                <Input
                  label={role === 'customer' ? 'Password or Phone' : 'Password'}
                  placeholder={role === 'customer' ? 'Password or registered phone' : 'Enter password'}
                  type={showPwd ? 'text' : 'password'}
                  required={role !== 'customer'}
                  error={errors.credential?.message}
                  {...register('credential', role !== 'customer' ? { required: 'Password required' } : {})}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 bottom-2.5 transition-colors"
                  style={{ color:'var(--text-xlight)' }}>
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Btn type="submit" variant="gold" size="lg" className="w-full mt-2" loading={loading}>
                Sign In
              </Btn>
            </form>
          ) : (
            <form onSubmit={handleSubmit(onGuest)} className="space-y-4">
              <Input label="Your Name" placeholder="Enter your name" required
                error={errors.guestName?.message}
                {...register('guestName', { required: 'Name required' })} />
              <Input label="Phone Number" placeholder="10-digit phone" type="tel"
                {...register('guestPhone')} />
              <Btn type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
                Continue as Guest →
              </Btn>
            </form>
          )}

          {role === 'customer' && (
            <>
              <Divider label="or" />
              <div className="space-y-2.5">
                <Btn variant="outline" size="md" className="w-full" onClick={() => navigate('/register')}>
                  ✦ &nbsp; Create New Account
                </Btn>
                <Btn variant="ghost" size="md" className="w-full" onClick={() => setGuestMode(v => !v)}>
                  {guestMode ? '← Back to Login' : '👤 Continue as Guest'}
                </Btn>
              </div>
            </>
          )}
        </div>

        {/* Back */}
        <div className="text-center mt-6">
          <button onClick={() => navigate('/')}
            className="text-xs font-medium transition-colors"
            style={{ color:'var(--text-light)' }}>
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}
