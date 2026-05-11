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
    <div className="min-h-screen bg-gray-50">
      {/* Top header */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">
              <span className="text-gold-500 font-serif">ZARA</span>
              <span className="text-gray-400 font-light text-sm ml-1">Aura</span>
            </h1>
            <p className="text-xs text-gray-500">{shop?.name} · Admin</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <button onClick={() => setTab('orders')} className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 animate-pulse">
                <Bell className="w-3 h-3" /> {pendingCount} new
              </button>
            )}
            <button onClick={logout} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab bar (scrollable) */}
        <div className="max-w-6xl mx-auto overflow-x-auto scrollbar-hide">
          <div className="flex gap-0 min-w-max px-2">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors relative ${tab === t.id ? 'text-gold-700' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
                {t.id === 'orders' && pendingCount > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full inline-flex items-center justify-center">{pendingCount}</span>
                )}
                {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-500 rounded-t" />}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-4">
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
        <h2 className="text-xl font-bold">Customers ({customers.length})</h2>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
          className="px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-gold-400 w-40" />
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
            <tr><th className="text-left py-3 px-4">Name</th><th className="text-left py-3 px-4">Username</th><th className="text-left py-3 px-4">Phone</th><th className="text-left py-3 px-4">Orders</th></tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const custOrders = orders.filter(o => o.customerId === c.id)
              return (
                <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4 font-semibold">{c.name}</td>
                  <td className="py-3 px-4 text-gray-500">@{c.username}</td>
                  <td className="py-3 px-4 text-gray-500">{c.phone || '—'}</td>
                  <td className="py-3 px-4"><Badge color="gold">{custOrders.length}</Badge></td>
                </tr>
              )
            })}
            {!filtered.length && <tr><td colSpan={4} className="py-8 text-center text-gray-400">No customers found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
