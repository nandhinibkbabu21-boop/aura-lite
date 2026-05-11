import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getUser, createUser, getShop, addCustomer, getCustomers } from '../services/db.js'
import { uid } from '../utils/formatters.js'

const useAuthStore = create(
  persist(
    (set, get) => ({
      session: null,     // { role, name, username, id, shopId }
      shop: null,        // shop info object
      shopId: null,

      setShop: (shop, shopId) => set({ shop, shopId }),
      setSession: (session) => set({ session }),

      // ── Admin/Employee login ─────────────────────────────
      async login(role, username, password) {
        try {
          const user = await getUser(username)
          if (!user) throw new Error('Account not found')
          if (user.role !== role) throw new Error(`This is a ${user.role} account`)
          if (user.password && user.password !== password) throw new Error('Incorrect password')

          const shopId = user.shopId || get().shopId
          if (!shopId) throw new Error('No shop linked to this account')

          const shop = await getShop(shopId)
          set({ session: { role, name: user.name, username, id: user.id, shopId }, shop, shopId })
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e.message }
        }
      },

      // ── Customer login (username+phone OR username+password) ─
      async loginCustomer(username, credential) {
        try {
          const shopId = get().shopId
          if (!shopId) throw new Error('No shop found on this device')

          const customers = await getCustomers(shopId)
          const isPhone = /^[0-9]{10}$/.test(username)

          let cust = null
          if (isPhone) {
            // phone as identifier
            cust = customers.find(c => c.phone === username && (!c.password || c.password === credential))
          } else {
            // username + password or username + phone
            cust = customers.find(c => c.username === username &&
              (c.phone === credential || (!c.password) || c.password === credential))
          }

          if (!cust) throw new Error('Invalid credentials')

          const shop = await getShop(shopId)
          set({ session: { role: 'customer', name: cust.name, username: cust.username, id: cust.id, shopId }, shop, shopId })
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e.message }
        }
      },

      // ── Guest login ─────────────────────────────────────
      loginGuest(name, phone) {
        const shopId = get().shopId
        if (!shopId) return { ok: false, error: 'No shop found' }
        set({ session: { role: 'customer', name, phone, id: `guest_${uid()}`, shopId, isGuest: true } })
        return { ok: true }
      },

      // ── Register customer ────────────────────────────────
      async registerCustomer(shopId, data) {
        try {
          const customers = await getCustomers(shopId)
          if (customers.find(c => c.username === data.username))
            throw new Error('Username already taken')

          const id = await addCustomer(shopId, { ...data, role: 'customer' })
          const shop = await getShop(shopId)
          set({
            session: { role: 'customer', name: data.name, username: data.username, id, shopId },
            shop, shopId
          })
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e.message }
        }
      },

      logout() {
        set({ session: null })
      },
    }),
    { name: 'zara-aura-auth', partialize: s => ({ session: s.session, shop: s.shop, shopId: s.shopId }) }
  )
)

export default useAuthStore
