import React from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore.js'
import { Crown, Tag, ShoppingBag, Store } from 'lucide-react'
import { Btn } from '../ui/index.jsx'

const roles = [
  { id: 'admin',    icon: Crown,       title: 'Admin',    desc: 'Manage shop, products & team', color: 'bg-amber-50 border-amber-200', iconColor: 'text-amber-600' },
  { id: 'employee', icon: Tag,         title: 'Employee', desc: 'Handle orders & inventory',    color: 'bg-blue-50 border-blue-200',   iconColor: 'text-blue-600' },
  { id: 'customer', icon: ShoppingBag, title: 'Customer', desc: 'Browse & order products',      color: 'bg-green-50 border-green-200', iconColor: 'text-green-600' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { shop, shopId } = useAuthStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-gold-50 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-gold-100 text-gold-800 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            ✦ &nbsp; Smart Retail Ordering &nbsp; ✦
          </div>
          <h1 className="text-5xl font-bold mb-2">
            <span className="text-gold-500 font-serif">ZARA</span>
            <span className="text-gray-400 font-light ml-1 text-3xl">Aura</span>
          </h1>
          <p className="text-gray-500 mt-3 text-sm max-w-xs mx-auto leading-relaxed">
            Reduce counter wait time — customers order ahead while staff packs on time
          </p>
          {shop && (
            <div className="mt-5 inline-flex items-center gap-2 bg-white border border-gold-200 px-4 py-2 rounded-full text-sm text-gold-700 shadow-sm">
              <Store className="w-4 h-4" /> {shop.name}
            </div>
          )}
        </div>

        {/* Role cards */}
        <div className="w-full max-w-sm space-y-3">
          {roles.map(role => {
            const Icon = role.icon
            return (
              <button
                key={role.id}
                onClick={() => navigate(`/login/${role.id}`)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 ${role.color} hover:shadow-md active:scale-98 transition-all text-left`}
              >
                <div className={`w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center ${role.iconColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-gray-900">{role.title}</div>
                  <div className="text-xs text-gray-500">{role.desc}</div>
                </div>
                <span className="text-gray-400 text-lg">›</span>
              </button>
            )
          })}
        </div>

        {/* Register shop */}
        {!shopId && (
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-500 mb-2">New boutique owner?</p>
            <Btn variant="outline" size="sm" onClick={() => navigate('/register-shop')}>
              ✦ &nbsp; Set Up My Shop
            </Btn>
          </div>
        )}
      </div>

      {/* Feature highlights */}
      <div className="pb-8 px-4">
        <div className="max-w-sm mx-auto grid grid-cols-3 gap-3">
          {[
            { emoji: '⚡', text: 'Real-time orders' },
            { emoji: '📦', text: 'Smart packing' },
            { emoji: '📊', text: 'Analytics' },
          ].map(f => (
            <div key={f.text} className="text-center py-3 bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="text-xl mb-1">{f.emoji}</div>
              <div className="text-xs text-gray-500 font-medium">{f.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
