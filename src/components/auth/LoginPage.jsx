import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff, ArrowLeft, Crown, Tag, ShoppingBag, User, Phone } from 'lucide-react'
import { Btn, Input, Divider } from '../ui/index.jsx'
import useAuthStore from '../../store/authStore.js'

const ROLE_META = {
  admin:    { icon: Crown,        title: 'Admin Login',    color: 'text-amber-600', bg: 'bg-amber-50' },
  employee: { icon: Tag,          title: 'Employee Login', color: 'text-blue-600',  bg: 'bg-blue-50'  },
  customer: { icon: ShoppingBag,  title: 'Customer Login', color: 'text-green-600', bg: 'bg-green-50' },
}

export default function LoginPage() {
  const { role } = useParams()
  const navigate = useNavigate()
  const { login, loginCustomer, loginGuest, shopId } = useAuthStore()
  const { register, handleSubmit, formState: { errors } } = useForm()
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loginMode, setLoginMode] = useState('username') // 'username' | 'phone'
  const [guestMode, setGuestMode] = useState(false)
  const meta = ROLE_META[role] || ROLE_META.customer
  const Icon = meta.icon

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      let res
      if (role === 'customer') {
        res = await loginCustomer(data.identifier, data.credential)
      } else {
        res = await login(role, data.identifier, data.credential)
      }

      if (res.ok) {
        toast.success('Welcome back! 👋')
        navigate(role === 'admin' ? '/admin' : role === 'employee' ? '/employee' : '/shop')
      } else {
        toast.error(res.error || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const onGuest = async (data) => {
    setLoading(true)
    const res = loginGuest(data.guestName, data.guestPhone)
    setLoading(false)
    if (res.ok) {
      toast.success(`Welcome, ${data.guestName}!`)
      navigate('/shop')
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50 flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-4 py-8">
        <div className="w-full max-w-sm mx-auto">
          {/* Back */}
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <div className={`w-14 h-14 ${meta.bg} rounded-2xl flex items-center justify-center mx-auto mb-3`}>
              <Icon className={`w-7 h-7 ${meta.color}`} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{meta.title}</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to access your dashboard</p>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-6">
            {/* Customer: toggle login mode */}
            {role === 'customer' && !guestMode && (
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5">
                {[['username','👤 Username'],['phone','📱 Phone']].map(([m,l]) => (
                  <button key={m} onClick={() => setLoginMode(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${loginMode===m ? 'bg-white shadow text-gold-700' : 'text-gray-500'}`}>
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
                    label={role === 'customer' ? 'Password or Phone (if registered)' : 'Password'}
                    placeholder={role === 'customer' ? 'Password or registered phone' : 'Enter password'}
                    type={showPwd ? 'text' : 'password'}
                    required={role !== 'customer'}
                    error={errors.credential?.message}
                    {...register('credential', role !== 'customer' ? { required: 'Password required' } : {})}
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-9 text-gray-400">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Btn type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
                  Sign In
                </Btn>
              </form>
            ) : (
              <form onSubmit={handleSubmit(onGuest)} className="space-y-4">
                <Input label="Your Name" placeholder="Enter your name" required
                  error={errors.guestName?.message}
                  {...register('guestName', { required: 'Name required' })} />
                <Input label="Phone Number" placeholder="10-digit phone" type="tel"
                  error={errors.guestPhone?.message}
                  {...register('guestPhone')} />
                <Btn type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
                  Continue as Guest →
                </Btn>
              </form>
            )}

            {role === 'customer' && (
              <>
                <Divider text="or" />
                <div className="space-y-2">
                  <Btn variant="outline" size="md" className="w-full" onClick={() => navigate('/register')}>
                    ✦ Create New Account
                  </Btn>
                  <Btn variant="ghost" size="md" className="w-full" onClick={() => setGuestMode(v => !v)}>
                    {guestMode ? '← Back to Login' : '👤 Continue as Guest'}
                  </Btn>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
