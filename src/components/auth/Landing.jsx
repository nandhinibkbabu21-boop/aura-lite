import React from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore.js'

const ROLES = [
  { id: 'admin',    icon: '👑', title: 'Admin',    desc: 'Manage shop, products & team' },
  { id: 'employee', icon: '🏷️', title: 'Employee', desc: 'Stock & product management' },
  { id: 'customer', icon: '🛍️', title: 'Customer', desc: 'Browse & shop the collection' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { shop, shopId } = useAuthStore()

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background:'var(--white)' }}>
      {/* Background pattern (matches original) */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        backgroundImage: `
          radial-gradient(circle at 15% 50%, rgba(201,168,76,0.06) 0%, transparent 50%),
          radial-gradient(circle at 85% 20%, rgba(201,168,76,0.06) 0%, transparent 40%),
          radial-gradient(circle at 50% 90%, rgba(201,168,76,0.04) 0%, transparent 35%)`
      }} />
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.025]" style={{
        backgroundImage: `repeating-linear-gradient(0deg,#C9A84C 0,#C9A84C 1px,transparent 1px,transparent 60px),
                          repeating-linear-gradient(90deg,#C9A84C 0,#C9A84C 1px,transparent 1px,transparent 60px)`
      }} />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm text-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2 mb-7 rounded-full text-[0.7rem] font-semibold tracking-[0.1em] uppercase"
            style={{ background:'var(--gold-lighter)', border:'1px solid var(--gold-light)', color:'var(--gold-dark)' }}>
            ✦ &nbsp; Fashion Management for Everyone &nbsp; ✦
          </div>

          {/* Logo */}
          <div className="mb-3" style={{ fontFamily:'var(--font-serif)', lineHeight:1 }}>
            <span className="text-[3.6rem] font-semibold gold-text">ZARA</span>
            <span className="ml-3 text-[1rem] font-light tracking-[0.3em] uppercase align-middle"
              style={{ color:'var(--text-light)' }}>Aura</span>
          </div>

          {/* Divider */}
          <div className="flex items-center justify-center gap-3 my-4">
            <div className="h-px w-12" style={{ background:'var(--border-light)' }} />
            <span style={{ color:'var(--gold)', fontSize:'0.55rem' }}>◆</span>
            <div className="h-px w-12" style={{ background:'var(--border-light)' }} />
          </div>

          {/* Tagline */}
          <p className="text-base mb-2 leading-relaxed" style={{ color:'var(--text-medium)', fontFamily:'var(--font-serif)', fontStyle:'italic' }}>
            Elegance in every stitch,<br />precision in every sale.
          </p>

          {/* Highlights */}
          <div className="mt-5 mb-6 space-y-2 text-left max-w-xs mx-auto">
            {[
              ['🏘️', 'Designed for small & rural boutiques'],
              ['📦', 'Easy billing, stock & inventory management'],
              ['🔄', 'Real-time sync across all your devices'],
              ['📵', 'Simple to use — no technical knowledge needed'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-2.5 text-[0.78rem]" style={{ color:'var(--text-medium)' }}>
                <span className="text-base">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Shop chip */}
          {shop && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-5"
              style={{ background:'var(--gold-lighter)', border:'1px solid var(--gold-light)', color:'var(--gold-dark)' }}>
              ✦ &nbsp; {shop.name}
            </div>
          )}

          {/* Role cards */}
          <div className="space-y-3 mt-2">
            {ROLES.map(role => (
              <button key={role.id} onClick={() => navigate(`/login/${role.id}`)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-[20px] text-left transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background:'var(--white)',
                  border:'1px solid var(--border-light)',
                  boxShadow:'var(--shadow-sm)',
                }}>
                <div className="text-2xl w-10 text-center">{role.icon}</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color:'var(--text-dark)' }}>{role.title}</div>
                  <div className="text-[0.72rem] mt-0.5" style={{ color:'var(--text-light)' }}>{role.desc}</div>
                </div>
                <span className="text-lg" style={{ color:'var(--text-xlight)' }}>›</span>
              </button>
            ))}
          </div>

          {/* Footer */}
          <p className="mt-8 text-[0.78rem]" style={{ color:'var(--text-light)' }}>
            New shop?{' '}
            <button onClick={() => navigate('/register-shop')}
              className="font-semibold transition-colors hover:underline"
              style={{ color:'var(--gold-dark)' }}>
              Set up your boutique →
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
