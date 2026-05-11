import React, { useEffect, useState } from 'react'
import { LogOut, LayoutDashboard, Package, Users, ShoppingBag, BarChart2, Tag, Bell } from 'lucide-react'
import useAuthStore from '../../store/authStore.js'
import { listenProducts, listenOrders, listenEmployees, listenCustomers, listenCoupons,
         addProduct, updateProduct, deleteProduct, addEmployee, updateEmployee, deleteEmployee,
         addCoupon, updateCoupon, deleteCoupon, updateOrder } from '../../services/db.js'
import { Spinner, Tabs, Btn, Badge, Card, Empty, Modal, Input, Select } from '../ui/index.jsx'
import Overview     from './tabs/Overview.jsx'
import ProductsTab  from './tabs/Products.jsx'
import OrdersTab    from './tabs/Orders.jsx'
import EmployeesTab from './tabs/Employees.jsx'
import AnalyticsTab from './tabs/Analytics.jsx'
import CouponsTab   from './tabs/Coupons.jsx'

const TABS = [
  { id: 'overview',   label: '◈ Overview' },
  { id: 'orders',     label: '📦 Orders' },
  { id: 'products',   label: '✦ Products' },
  { id: 'employees',  label: '◉ Employees' },
  { id: 'customers',  label: '◎ Customers' },
  { id: 'analytics',  label: '📊 Analytics' },
  { id: 'coupons',    label: '🎟 Coupons' },
]

export default function AdminDash() {
  const { session, shop, shopId, logout } = useAuthStore()
  const [tab, setTab]           = useState('overview')
  const [products, setProducts] = useState([])
  const [orders, setOrders]     = useState([])
  const [employees, setEmployees] = useState([])
  const [customers, setCustomers] = useState([])
  const [coupons, setCoupons]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!shopId) return
    setLoading(true)
    const unsubs = [
      listenProducts(shopId, data => { setProducts(data); setLoading(false) }),
      listenOrders(shopId, data => {
        setOrders(data)
        setPendingCount(data.filter(o => o.status === 'pending').length)
      }),
      listenEmployees(shopId, setEmployees),
      listenCustomers(shopId, setCustomers),
      listenCoupons(shopId, setCoupons),
    ]
    return () => unsubs.forEach(u => u())
  }, [shopId])

  const tabContent = {
    overview:  <Overview products={products} orders={orders} employees={employees} customers={customers} />,
    orders:    <OrdersTab orders={orders} employees={employees} customers={customers} shopId={shopId} shop={shop} />,
    products:  <ProductsTab products={products} shopId={shopId} />,
    employees: <EmployeesTab employees={employees} orders={orders} shopId={shopId} />,
    customers: <CustomersTab customers={customers} orders={orders} />,
    analytics: <AnalyticsTab orders={orders} employees={employees} products={products} />,
    coupons:   <CouponsTab coupons={coupons} shopId={shopId} />,
  }

  return (
    <div className="min-h-screen" style={{ background:'var(--cream)' }}>
      {/* Top header */}
      <header className="sticky top-0 z-30" style={{
        background:'rgba(255,255,255,0.95)',
        backdropFilter:'blur(12px)',
        borderBottom:'1px solid var(--border-light)'
      }}>
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily:'var(--font-serif)', fontSize:'1.4rem', fontWeight:600 }}
              className="gold-text">ZARA</span>
            <span style={{ fontFamily:'var(--font-sans)', fontSize:'0.65rem', fontWeight:300, letterSpacing:'0.28em', color:'var(--text-light)' }}
              className="uppercase">Aura</span>
            {shop?.name && (
              <span className="ml-3 text-xs hidden sm:inline"
                style={{ color:'var(--text-medium)', fontWeight:500, letterSpacing:'0.06em' }}>
                {shop.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <button onClick={() => setTab('orders')}
                className="text-white text-[0.65rem] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 animate-pulse"
                style={{ background:'#c0392b' }}>
                <Bell className="w-3 h-3" /> {pendingCount} new
              </button>
            )}
            <button onClick={logout}
              className="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-[6px] transition-colors"
              style={{ color:'var(--text-light)', border:'1px solid var(--border-light)' }}>
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-6xl mx-auto overflow-x-auto scrollbar-hide">
          <div className="flex gap-0 min-w-max px-4">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-4 py-3 text-[0.72rem] font-semibold tracking-[0.08em] uppercase whitespace-nowrap transition-colors relative"
                style={{ color: tab===t.id ? 'var(--gold-dark)' : 'var(--text-light)' }}>
                {t.label}
                {t.id === 'orders' && pendingCount > 0 && (
                  <span className="ml-1 text-white text-[0.6rem] w-4 h-4 rounded-full inline-flex items-center justify-center"
                    style={{ background:'#c0392b' }}>{pendingCount}</span>
                )}
                {tab === t.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                    style={{ background:'linear-gradient(to right, var(--gold-dark), var(--gold-accent))' }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          tabContent[tab] || null
        )}
      </div>
    </div>
  )
}

// ── Customers tab (inline simple) ────────────────────────────
function CustomersTab({ customers, orders }) {
  const [q, setQ] = useState('')
  const filtered = customers.filter(c => !q || c.name?.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontFamily:'var(--font-serif)', fontSize:'1.6rem', color:'var(--text-dark)' }}>
          Customers ({customers.length})
        </h2>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
          className="px-4 py-2 text-sm w-40"
          style={{ border:'1.5px solid var(--border)', borderRadius:'6px', background:'var(--white)', color:'var(--text-dark)' }} />
      </div>
      <div className="overflow-hidden" style={{ background:'var(--white)', border:'1px solid var(--border-light)', borderRadius:'12px', boxShadow:'var(--shadow-sm)' }}>
        <table className="w-full text-sm">
          <thead style={{ background:'var(--cream-2)' }}>
            <tr>
              {['Name','Username','Phone','Orders'].map(h => (
                <th key={h} className="text-left py-3.5 px-5 text-[0.68rem] font-bold tracking-[0.12em] uppercase"
                  style={{ color:'var(--text-light)', borderBottom:'1px solid var(--border-light)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const custOrders = orders.filter(o => o.customerId === c.id)
              return (
                <tr key={c.id} className="transition-colors" style={{ borderTop:'1px solid var(--border-light)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--cream)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td className="py-3.5 px-5 font-semibold" style={{ color:'var(--text-dark)' }}>{c.name}</td>
                  <td className="py-3.5 px-5" style={{ color:'var(--text-medium)' }}>@{c.username}</td>
                  <td className="py-3.5 px-5" style={{ color:'var(--text-medium)' }}>{c.phone || '—'}</td>
                  <td className="py-3.5 px-5"><Badge color="gold">{custOrders.length}</Badge></td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr><td colSpan={4} className="py-10 text-center text-sm" style={{ color:'var(--text-xlight)' }}>No customers found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
