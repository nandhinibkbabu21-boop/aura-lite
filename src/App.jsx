import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from './store/authStore.js'
import Landing      from './components/auth/Landing.jsx'
import LoginPage    from './components/auth/LoginPage.jsx'
import RegisterPage from './components/auth/RegisterPage.jsx'
import RegisterShop from './components/auth/RegisterShop.jsx'
import AdminDash    from './components/admin/AdminDash.jsx'
import EmployeeDash from './components/employee/EmployeeDash.jsx'
import ShopPage     from './components/customer/ShopPage.jsx'
import { LoadingScreen } from './components/ui/index.jsx'

// ── Route guard ──────────────────────────────────────────────
function ProtectedRoute({ children, requiredRole }) {
  const { session } = useAuthStore()
  if (!session) return <Navigate to="/" replace />
  if (requiredRole && session.role !== requiredRole) return <Navigate to={roleHome(session.role)} replace />
  return children
}

function roleHome(role) {
  if (role === 'admin')    return '/admin'
  if (role === 'employee') return '/employee'
  return '/shop'
}

// ── Redirect logged-in user from auth pages ──────────────────
function AuthGate({ children }) {
  const { session } = useAuthStore()
  if (session) return <Navigate to={roleHome(session.role)} replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter basename="/aura-lite">
      <Routes>
        {/* Public */}
        <Route path="/" element={<AuthGate><Landing /></AuthGate>} />
        <Route path="/login/:role" element={<AuthGate><LoginPage /></AuthGate>} />
        <Route path="/register" element={<AuthGate><RegisterPage /></AuthGate>} />
        <Route path="/register-shop" element={<RegisterShop />} />

        {/* Protected */}
        <Route path="/admin" element={
          <ProtectedRoute requiredRole="admin"><AdminDash /></ProtectedRoute>
        } />
        <Route path="/employee" element={
          <ProtectedRoute requiredRole="employee"><EmployeeDash /></ProtectedRoute>
        } />
        <Route path="/shop" element={
          <ProtectedRoute requiredRole="customer"><ShopPage /></ProtectedRoute>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
