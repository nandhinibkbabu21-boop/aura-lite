import {
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, onSnapshot, query, where,
  orderBy, limit, serverTimestamp, increment
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase.js'
import { uid } from '../utils/formatters.js'

// ─── Shop helpers ──────────────────────────────────────────────
const shopRef  = (shopId) => doc(db, 'shops', shopId)
const colRef   = (shopId, col) => collection(db, 'shops', shopId, col)
const docRef   = (shopId, col, id) => doc(db, 'shops', shopId, col, id)

// ─── Shop ──────────────────────────────────────────────────────
export async function getShop(shopId) {
  const snap = await getDoc(shopRef(shopId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}
export async function setShop(shopId, data) {
  await setDoc(shopRef(shopId), data, { merge: true })
}

// ─── Users ────────────────────────────────────────────────────
export async function getUser(username) {
  const snap = await getDoc(doc(db, 'users', username))
  return snap.exists() ? snap.data() : null
}
export async function createUser(username, data) {
  await setDoc(doc(db, 'users', username), data)
}

// ─── Products ─────────────────────────────────────────────────
export async function getProducts(shopId) {
  const snap = await getDocs(query(colRef(shopId, 'products'), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
export async function addProduct(shopId, data) {
  const id = uid()
  await setDoc(docRef(shopId, 'products', id), { ...data, id, createdAt: serverTimestamp() })
  return id
}
export async function updateProduct(shopId, id, data) {
  await updateDoc(docRef(shopId, 'products', id), { ...data, updatedAt: serverTimestamp() })
}
export async function deleteProduct(shopId, id) {
  await deleteDoc(docRef(shopId, 'products', id))
}
export function listenProducts(shopId, cb) {
  return onSnapshot(query(colRef(shopId, 'products'), orderBy('createdAt', 'desc')), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

// ─── Orders ───────────────────────────────────────────────────
export async function addOrder(shopId, data) {
  const id = uid()
  await setDoc(docRef(shopId, 'orders', id), {
    ...data, id, status: 'pending',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  })
  return id
}
export async function updateOrder(shopId, id, data) {
  await updateDoc(docRef(shopId, 'orders', id), { ...data, updatedAt: serverTimestamp() })
}
export function listenOrders(shopId, cb, statusFilter) {
  const q = statusFilter
    ? query(colRef(shopId, 'orders'), where('status', 'in', statusFilter), orderBy('createdAt', 'desc'))
    : query(colRef(shopId, 'orders'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
}
export function listenCustomerOrders(shopId, customerId, cb) {
  const q = query(colRef(shopId, 'orders'), where('customerId', '==', customerId), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
}

// ─── Employees ────────────────────────────────────────────────
export async function getEmployees(shopId) {
  const snap = await getDocs(colRef(shopId, 'employees'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
export async function addEmployee(shopId, data) {
  const id = uid()
  await setDoc(docRef(shopId, 'employees', id), { ...data, id, createdAt: serverTimestamp() })
  return id
}
export async function updateEmployee(shopId, id, data) {
  await updateDoc(docRef(shopId, 'employees', id), data)
}
export async function deleteEmployee(shopId, id) {
  await deleteDoc(docRef(shopId, 'employees', id))
}
export function listenEmployees(shopId, cb) {
  return onSnapshot(colRef(shopId, 'employees'), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
}

// ─── Customers ────────────────────────────────────────────────
export async function getCustomers(shopId) {
  const snap = await getDocs(colRef(shopId, 'customers'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
export async function addCustomer(shopId, data) {
  const id = uid()
  await setDoc(docRef(shopId, 'customers', id), { ...data, id, createdAt: serverTimestamp() })
  return id
}
export function listenCustomers(shopId, cb) {
  return onSnapshot(colRef(shopId, 'customers'), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
}

// ─── Coupons ──────────────────────────────────────────────────
export async function getCoupons(shopId) {
  const snap = await getDocs(colRef(shopId, 'coupons'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
export function listenCoupons(shopId, cb) {
  return onSnapshot(colRef(shopId, 'coupons'), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
}
export async function addCoupon(shopId, data) {
  const id = uid()
  await setDoc(docRef(shopId, 'coupons', id), { ...data, id, usedCount: 0 })
  return id
}
export async function updateCoupon(shopId, id, data) {
  await updateDoc(docRef(shopId, 'coupons', id), data)
}
export async function deleteCoupon(shopId, id) {
  await deleteDoc(docRef(shopId, 'coupons', id))
}

// ─── Image upload ─────────────────────────────────────────────
export async function uploadImage(shopId, file) {
  const r = ref(storage, `shops/${shopId}/products/${uid()}_${file.name}`)
  await uploadBytes(r, file)
  return getDownloadURL(r)
}

// ─── Stock reduction ──────────────────────────────────────────
export async function reduceStock(shopId, items) {
  for (const item of items) {
    const snap = await getDoc(docRef(shopId, 'products', item.id))
    if (!snap.exists()) continue
    const p = snap.data()
    if (p.hasSizes && p.sizeStock?.length && item.size) {
      const newSS = p.sizeStock.map(s =>
        s.size === item.size ? { ...s, stock: Math.max(0, (s.stock || 0) - item.qty) } : s
      )
      const totalQty = newSS.reduce((s, x) => s + (x.stock || 0), 0)
      await updateProduct(shopId, item.id, { sizeStock: newSS, quantity: totalQty })
    } else {
      await updateProduct(shopId, item.id, { quantity: Math.max(0, (p.quantity || 0) - item.qty) })
    }
  }
}
