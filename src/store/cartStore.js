import { create } from 'zustand'

const useCartStore = create((set, get) => ({
  items: [],
  couponCode: '',
  couponDiscount: 0,
  paymentMode: '',
  open: false,

  addItem: (product, size, price, qty = 1) => {
    const key = `${product.id}_${size || ''}`
    set(s => {
      const existing = s.items.find(i => i.key === key)
      if (existing) {
        return { items: s.items.map(i => i.key === key ? { ...i, qty: i.qty + qty } : i) }
      }
      return { items: [...s.items, {
        key, id: product.id, name: product.name,
        size: size || '', price, qty,
        image: product.image || product.colors?.[0]?.image || '',
        category: product.category || '',
      }] }
    })
  },

  removeItem: (key) => set(s => ({ items: s.items.filter(i => i.key !== key) })),

  updateQty: (key, qty) => set(s => ({
    items: qty <= 0
      ? s.items.filter(i => i.key !== key)
      : s.items.map(i => i.key === key ? { ...i, qty } : i)
  })),

  clear: () => set({ items: [], couponCode: '', couponDiscount: 0, paymentMode: '', open: false }),

  setCoupon: (code, discount) => set({ couponCode: code, couponDiscount: discount }),
  clearCoupon: () => set({ couponCode: '', couponDiscount: 0 }),

  setPaymentMode: (mode) => set({ paymentMode: mode }),
  setOpen: (open) => set({ open }),

  get total() {
    const sub = get().items.reduce((s, i) => s + i.price * i.qty, 0)
    return Math.max(0, sub - get().couponDiscount)
  },
  get subtotal() {
    return get().items.reduce((s, i) => s + i.price * i.qty, 0)
  },
  get count() {
    return get().items.reduce((s, i) => s + i.qty, 0)
  },
}))

export default useCartStore
