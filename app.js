'use strict';

/* ═══════════════════════════════════════════════════
   0. BACKEND CONFIG
   Set BACKEND_URL to your deployed backend URL.
   Leave empty to disable SMS features (app still works).
═══════════════════════════════════════════════════ */
const BACKEND_URL = (typeof backendConfig !== 'undefined' && backendConfig.url)
  ? backendConfig.url.replace(/\/$/, '')
  : '';                    // e.g. "https://aura-lite-backend.onrender.com"

const ADMIN_SECRET = (typeof backendConfig !== 'undefined' && backendConfig.adminSecret)
  ? backendConfig.adminSecret : '';

async function apiPost(path, body, adminAuth = false) {
  if (!BACKEND_URL) return { success: false, error: 'Backend not configured' };
  const headers = { 'Content-Type': 'application/json' };
  if (adminAuth && ADMIN_SECRET) headers['x-admin-token'] = ADMIN_SECRET;
  const res = await fetch(`${BACKEND_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}
async function apiGet(path, adminAuth = false) {
  if (!BACKEND_URL) return { success: false, error: 'Backend not configured' };
  const headers = {};
  if (adminAuth && ADMIN_SECRET) headers['x-admin-token'] = ADMIN_SECRET;
  const res = await fetch(`${BACKEND_URL}${path}`, { headers });
  return res.json();
}

/* ═══════════════════════════════════════════════════
   1. FIREBASE INIT
═══════════════════════════════════════════════════ */
let db = null;
let firebaseReady = false;

(function initFirebase() {
  try {
    if (typeof firebaseConfig === 'undefined' ||
        !firebaseConfig.apiKey ||
        firebaseConfig.apiKey === 'YOUR_API_KEY_HERE') {
      console.warn('⚠ Firebase not configured – running in local-only mode.');
      return;
    }
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firebaseReady = true;
    console.log('✓ Firebase connected');
  } catch (e) {
    console.error('Firebase init error:', e);
  }
})();

/* ═══════════════════════════════════════════════════
   2. CONSTANTS & STATE
═══════════════════════════════════════════════════ */
const APP_KEY = 'aura_lite';
const KEYS = {
  shop:           `${APP_KEY}_shop`,
  employees:      `${APP_KEY}_employees`,
  customers:      `${APP_KEY}_customers`,
  products:       `${APP_KEY}_products`,
  categories:     `${APP_KEY}_categories`,
  orders:         `${APP_KEY}_orders`,
  bills:          `${APP_KEY}_bills`,
  coupons:        `${APP_KEY}_coupons`,
  session:        `${APP_KEY}_session`,
  shopId:         `${APP_KEY}_shopId`,
  mainCategories: `${APP_KEY}_mainCategories`,
  subCategories:  `${APP_KEY}_subCategories`,
  attendance:     `${APP_KEY}_attendance`,
};

const SUPER_ADMIN_CREDS = { username: 'superadmin', password: '1234567890@' };

/* ── Product category & size system ─────────────── */
const DEFAULT_CATEGORIES = ['Men','Women','Kids','Newborn'];
const CATEGORY_SIZES = {
  'Men':     ['XXS','XS','S','M','L','XL','XXL','2XL','3XL'],
  'Women':   ['XXS','XS','S','M','L','XL','XXL','2XL','3XL'],
  'Kids':    ['0-1Y','1-2Y','2-3Y','3-4Y','4-5Y','5-6Y','6-7Y','7-8Y','8-9Y','9-10Y','10-11Y','11-12Y'],
  'Newborn': ['0-3M','3-6M','6-9M','9-12M'],
};
function getSizesForCategory(cat) { return [...(CATEGORY_SIZES[cat] || CATEGORY_SIZES['Men']), 'Free Size']; }

/* Dynamic category/subcategory helpers — reads from DB */
function getMainCategories() {
  const stored = _ls(KEYS.mainCategories);
  return (stored && stored.length) ? stored : [...DEFAULT_CATEGORIES];
}
function getSubCategories(mainCat) {
  const all = _ls(KEYS.subCategories) || {};
  if (all[mainCat]) return all[mainCat];
  const defaults = {
    'Men':     ['T-Shirts','Shirts','Pants / Trousers','Jeans','Shorts','Innerwear'],
    'Women':   ['Tops / Shirts','Kurtis','Dresses','Sarees','Pants / Leggings','Innerwear'],
    'Kids':    ['Boys Clothing','Girls Clothing','Nightwear','School Wear'],
    'Newborn': ['Rompers','Bodysuits','Sleepsuits','Mittens & Socks Sets','Swaddle Cloths'],
  };
  return defaults[mainCat] || [];
}
/* Keep SUBCATEGORIES alias for backward compat */
const SUBCATEGORIES = new Proxy({}, { get: (_, cat) => getSubCategories(cat) });

/* Auto-detect subcategory from product name */
function autoDetectSubcategory(name) {
  const n = (name||'').toLowerCase();
  const rules = [
    [['t-shirt','tshirt','t shirt','polo'], 'T-Shirts'],
    [['shirt'], 'Shirts'],
    [['pant','trouser','chino','palazzo'], 'Pants'],
    [['jean','jeans','denim'], 'Jeans'],
    [['frock','dress','gown','maxi'], 'Frocks & Dresses'],
    [['kurta','kurti','anarkali','churidar'], 'Kurtas'],
    [['saree','sari'], 'Sarees'],
    [['lehenga'], 'Lehengas'],
    [['top','blouse','crop'], 'Tops'],
    [['short','shorts'], 'Shorts'],
    [['jacket','coat','blazer','cardigan'], 'Jackets'],
    [['suit','sherwani'], 'Suits'],
    [['set','combo','co-ord'], 'Sets'],
    [['jogger','track','sweat pant'], 'Joggers'],
    [['skirt','midi','mini'], 'Skirts'],
    [['salwar','churidar'], 'Salwars'],
    [['sweater','sweatshirt','hoodie','pullover'], 'Sweaters'],
    [['dupatta','scarf','stole'], 'Dupattas'],
    [['nightwear','night','pajama','pyjama','nighty'], 'Nightwear'],
    [['inner','innerwear','vest','bra','undergarment'], 'Innerwear'],
    [['shoe','sandal','slipper','footwear','chappal'], 'Footwear'],
    [['bag','purse','handbag','clutch'], 'Bags'],
    [['cap','hat','headband'], 'Accessories'],
    [['romper','onesie','bodysuit','jumpsuit'], 'Rompers'],
    [['diaper','bib'], 'Baby Essentials'],
  ];
  for (const [kws, cat] of rules) {
    if (kws.some(k => n.includes(k))) return cat;
  }
  return 'Others';
}
function getProductSizes(p) {
  if (p.sizes && p.sizes.length) return p.sizes;
  if (p.size) return [{ size: p.size, price: +(p.price||0) }];
  return [];
}
function getProductBasePrice(p) {
  const ss = getProductSizes(p);
  return ss.length ? Math.min(...ss.map(s=>+s.price)) : +(p.price||0);
}

function getDeviceId() {
  let id = localStorage.getItem('aura_device_id');
  if (!id) { id = uid(); localStorage.setItem('aura_device_id', id); }
  return id;
}
function recordDeviceLogin(shopId, info) {
  if (!firebaseReady || !shopId) return;
  const deviceId = getDeviceId();
  db.collection('shops').doc(shopId).collection('devices').doc(deviceId).set({
    role: info.role, name: info.name, lastLogin: Date.now(),
    userAgent: navigator.userAgent.substring(0, 120)
  }, { merge: true }).catch(console.error);
}

let state = {
  route: 'landing', subRoute: 'overview',
  session: null, shopId: null,
  cart: [], cartOpen: false,
  activeFilter: 'all', searchQuery: '',
  modalOpen: null, editingId: null, loginRole: null,
  viewingProductId: null, viewingOrderId: null, stockProductId: null,
  analyticsPeriod: 'monthly', salaryEmpId: null, empPerfPeriod: 'all',
  selectedColorIdx: 0, selectedSizeIdx: 0, activeSubFilter: 'all', productCategoryTab: 'all', openCategoryAccordion: null,
  fpStep: 1, fpVerifiedUser: null, fpOtp: null, fpOtpExpiry: null, fpFoundUser: null,
  selectedPaymentMode: 'Cash',
  selectedSizes: {},
  paymentMode: '',
  couponCode: '',
  couponDiscount: 0,
  custLoginMode: null,
  attendanceFilter: 'all',
  attendanceDateFrom: '',
  attendanceDateTo: '',
  currentBillId: null,
};

/* ═══════════════════════════════════════════════════
   3. REAL-TIME SYNC LAYER
═══════════════════════════════════════════════════ */
const Sync = {
  _unsubs: [],
  active: false,

  start(shopId) {
    if (!firebaseReady || !shopId) return;
    this.stop();
    this.active = true;
    const shopRef = db.collection('shops').doc(shopId);

    ['products','employees','customers','orders','coupons','attendance'].forEach(col => {
      this._unsubs.push(
        shopRef.collection(col).onSnapshot(snap => {
          const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
          _ls(KEYS[col], data);
          safeRender();
        }, e => console.warn(`${col} sync:`, e))
      );
    });

    this._unsubs.push(
      shopRef.onSnapshot(snap => {
        if (snap.exists) {
          const d = snap.data();
          if (d.shopInfo)   _ls(KEYS.shop, d.shopInfo);
          if (d.categories) _ls(KEYS.categories, d.categories);
          safeRender();
        }
      }, e => console.warn('shop sync:', e))
    );
  },

  stop() {
    this._unsubs.forEach(fn => { try { fn(); } catch (_) {} });
    this._unsubs = []; this.active = false;
  }
};

let _renderPending = false;
function safeRender() {
  if (_renderPending) return;
  _renderPending = true;
  requestAnimationFrame(() => { _renderPending = false; render(); postRender(); });
}

/* ═══════════════════════════════════════════════════
   4. LOCAL STORAGE HELPERS
═══════════════════════════════════════════════════ */
function _ls(key, val) {
  if (val !== undefined) { localStorage.setItem(key, JSON.stringify(val)); return val; }
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}

const DB = {
  getShop:       () => _ls(KEYS.shop),
  getShopId:     () => _ls(KEYS.shopId) || state.shopId,
  getSession:    () => _ls(KEYS.session),
  setSession:    (d) => _ls(KEYS.session, d),
  clearSession:  ()  => { localStorage.removeItem(KEYS.session); }, // keep shopId so customers can register after admin logs out
  getEmployees:  () => _ls(KEYS.employees)  || [],
  getCustomers:  () => _ls(KEYS.customers)  || [],
  getProducts:   () => _ls(KEYS.products)   || [],
  getCategories: () => _ls(KEYS.categories) || [],
  getOrders:     () => _ls(KEYS.orders)     || [],

  setShop(data, shopId) {
    _ls(KEYS.shop, data);
    if (shopId) _ls(KEYS.shopId, shopId);
    const sid = shopId || DB.getShopId();
    if (firebaseReady && sid)
      db.collection('shops').doc(sid).set({ shopInfo: data, categories: DB.getCategories() }, { merge: true }).catch(console.error);
  },

  _col(col) {
    const sid = DB.getShopId();
    return (firebaseReady && sid) ? db.collection('shops').doc(sid).collection(col) : null;
  },

  addProduct(p) {
    const list = DB.getProducts(); list.push(p); _ls(KEYS.products, list);
    DB._col('products')?.doc(p.id).set(p).catch(console.error);
  },
  updateProduct(id, data) {
    const list = DB.getProducts().map(p => p.id === id ? { ...p, ...data } : p);
    _ls(KEYS.products, list);
    DB._col('products')?.doc(id).update(data).catch(console.error);
  },
  deleteProduct(id) {
    _ls(KEYS.products, DB.getProducts().filter(p => p.id !== id));
    DB._col('products')?.doc(id).delete().catch(console.error);
  },

  addEmployee(e) {
    const list = DB.getEmployees(); list.push(e); _ls(KEYS.employees, list);
    DB._col('employees')?.doc(e.id).set(e).catch(console.error);
    if (firebaseReady)
      db.collection('users').doc(e.username).set({ role:'employee', shopId:DB.getShopId(), name:e.name, id:e.id, password:e.password }).catch(console.error);
  },
  updateEmployee(id, data) {
    _ls(KEYS.employees, DB.getEmployees().map(e => e.id === id ? { ...e, ...data } : e));
    DB._col('employees')?.doc(id).update(data).catch(console.error);
  },
  deleteEmployee(id) {
    const emp = DB.getEmployees().find(e => e.id === id);
    _ls(KEYS.employees, DB.getEmployees().filter(e => e.id !== id));
    DB._col('employees')?.doc(id).delete().catch(console.error);
    if (firebaseReady && emp?.username) db.collection('users').doc(emp.username).delete().catch(console.error);
  },

  addCustomer(c) {
    const list = DB.getCustomers(); list.push(c); _ls(KEYS.customers, list);
    DB._col('customers')?.doc(c.id).set(c).catch(console.error);
    const shopId = DB.getShopId();
    if (firebaseReady && c.username) {
      db.collection('users').doc(c.username).set({ role:'customer', shopId, name:c.name, id:c.id, password:c.password||'', whatsapp:c.whatsapp||'' }).catch(console.error);
      if (shopId) db.collection('customerIndex').doc(c.username).set({ shopId, id:c.id, name:c.name, whatsapp:c.whatsapp||'' }).catch(console.error);
    }
  },
  updateCustomer(id, data) {
    _ls(KEYS.customers, DB.getCustomers().map(c => c.id === id ? { ...c, ...data } : c));
    DB._col('customers')?.doc(id).update(data).catch(console.error);
  },

  addOrder(o) {
    const list = DB.getOrders(); list.push(o); _ls(KEYS.orders, list);
    DB._col('orders')?.doc(o.id).set(o).catch(console.error);
  },
  updateOrder(id, data) {
    const list = DB.getOrders().map(o => o.id===id ? {...o,...data} : o);
    _ls(KEYS.orders, list);
    DB._col('orders')?.doc(id).update(data).catch(console.error);
  },

  /* ── Bills ── */
  getBills() { return _ls(KEYS.bills) || []; },
  addBill(b) {
    const list = DB.getBills(); list.push(b); _ls(KEYS.bills, list);
    DB._col('bills')?.doc(b.id).set(b).catch(console.error);
  },
  updateBill(id, data) {
    _ls(KEYS.bills, DB.getBills().map(b => b.id===id ? {...b,...data} : b));
    DB._col('bills')?.doc(id).update(data).catch(console.error);
  },

  /* ── Coupons ── */
  getCoupons() { return _ls(KEYS.coupons) || []; },
  addCoupon(c) {
    const list = DB.getCoupons(); list.push(c); _ls(KEYS.coupons, list);
    DB._col('coupons')?.doc(c.id).set(c).catch(console.error);
  },
  updateCoupon(id, data) {
    const list = DB.getCoupons().map(c => c.id===id ? {...c,...data} : c);
    _ls(KEYS.coupons, list);
    DB._col('coupons')?.doc(id).update(data).catch(console.error);
  },
  deleteCoupon(id) {
    _ls(KEYS.coupons, DB.getCoupons().filter(c => c.id !== id));
    DB._col('coupons')?.doc(id).delete().catch(console.error);
  },

  /* ── Attendance ── */
  getAttendance() { return _ls(KEYS.attendance) || []; },
  addAttendance(rec) {
    const list = DB.getAttendance();
    list.push(rec);
    _ls(KEYS.attendance, list);
    const sid = DB.getShopId();
    if (firebaseReady && sid)
      db.collection('shops').doc(sid).collection('attendance').doc(rec.id).set(rec).catch(console.error);
  },

  addCategory(cat) {
    const list = DB.getCategories();
    if (!list.includes(cat)) {
      list.push(cat); _ls(KEYS.categories, list);
      const sid = DB.getShopId();
      if (firebaseReady && sid) db.collection('shops').doc(sid).set({ categories: list }, { merge: true }).catch(console.error);
    }
  },
  deleteCategory(cat) {
    const list = DB.getCategories().filter(c => c !== cat);
    _ls(KEYS.categories, list);
    const sid = DB.getShopId();
    if (firebaseReady && sid) db.collection('shops').doc(sid).set({ categories: list }, { merge: true }).catch(console.error);
  },

  /* ── Main categories (gender / top-level) ── */
  getMainCategories() { return getMainCategories(); },
  addMainCategory(name) {
    const list = getMainCategories();
    if (!list.includes(name)) {
      list.push(name); _ls(KEYS.mainCategories, list);
      const sid = DB.getShopId();
      if (firebaseReady && sid) db.collection('shops').doc(sid).set({ mainCategories: list }, { merge: true }).catch(console.error);
    }
  },
  deleteMainCategory(name) {
    const list = getMainCategories().filter(c => c !== name);
    _ls(KEYS.mainCategories, list);
    const sid = DB.getShopId();
    if (firebaseReady && sid) db.collection('shops').doc(sid).set({ mainCategories: list }, { merge: true }).catch(console.error);
  },

  /* ── Subcategories per main category ── */
  getSubCategories(mainCat) { return getSubCategories(mainCat); },
  addSubCategory(mainCat, subName) {
    const all = _ls(KEYS.subCategories) || {};
    if (!all[mainCat]) all[mainCat] = [...getSubCategories(mainCat)];
    if (!all[mainCat].includes(subName)) {
      all[mainCat].push(subName); _ls(KEYS.subCategories, all);
      const sid = DB.getShopId();
      if (firebaseReady && sid) db.collection('shops').doc(sid).set({ subCategories: all }, { merge: true }).catch(console.error);
    }
  },
  deleteSubCategory(mainCat, subName) {
    const all = _ls(KEYS.subCategories) || {};
    if (!all[mainCat]) all[mainCat] = [...getSubCategories(mainCat)];
    all[mainCat] = all[mainCat].filter(s => s !== subName);
    _ls(KEYS.subCategories, all);
    const sid = DB.getShopId();
    if (firebaseReady && sid) db.collection('shops').doc(sid).set({ subCategories: all }, { merge: true }).catch(console.error);
  },

};

/* ═══════════════════════════════════════════════════
   5. UTILITIES
═══════════════════════════════════════════════════ */
const uid     = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const esc     = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt     = n  => `₹${Number(n||0).toLocaleString('en-IN')}`;
const fmtDate = ts => new Date(ts).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
async function compressImage(file, maxPx = 360, quality = 0.72) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════════
   6. TOAST
═══════════════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const icons = { success:'✓', error:'✕', info:'◆', warning:'⚠' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'◆'}</span><span class="toast-msg">${esc(msg)}</span>`;
  document.getElementById('toast-container')?.appendChild(el);
  setTimeout(() => { el.classList.add('toast-fade'); setTimeout(() => el.remove(), 300); }, 3200);
}

/* ═══════════════════════════════════════════════════
   7. ROUTER
═══════════════════════════════════════════════════ */
function navigate(route, subRoute = 'overview') {
  state.route = route; state.subRoute = subRoute;
  state.cartOpen = false; state.modalOpen = null;
  const hash = (route === 'landing') ? '' : '#' + route;
  const newUrl = window.location.pathname + (hash || '');
  if (window.location.href !== window.location.origin + newUrl)
    window.history.pushState({ route, subRoute }, '', newUrl);
  render(); postRender(); window.scrollTo(0, 0);
}

window.addEventListener('popstate', e => {
  if (e.state && e.state.route) {
    state.route = e.state.route;
    state.subRoute = e.state.subRoute || 'overview';
    render(); postRender();
  }
});

function render() {
  const app = document.getElementById('app'); if (!app) return;
  ['cart-overlay-bg','checkout-overlay','success-overlay','product-detail-overlay','stock-modal-overlay']
    .forEach(id => document.getElementById(id)?.remove());
  document.querySelectorAll('.cart-overlay,.cart-sidebar').forEach(el => el.remove());

  state.session = DB.getSession();
  state.shopId  = DB.getShopId();

  const views = {
    'landing':                renderLanding,
    'login':                  () => renderLogin(state.loginRole),
    'forgot-password':        () => renderForgotPassword(state.loginRole),
    'register-shop':          renderRegisterShop,
    'register-customer':      renderRegisterCustomer,
    'customer-login-choose':  renderCustomerLoginChoose,
    'admin':                  renderAdminDash,
    'employee':               renderEmployeeDash,
    'customer':               renderCustomerShop,
    'super-admin':            renderSuperAdminDash,
  };
  try {
    app.innerHTML = (views[state.route] || renderLanding)();
  } catch(renderErr) {
    console.error('Render error on route', state.route, renderErr);
    try { app.innerHTML = renderLanding(); } catch(_) {}
  }

  if (state.cartOpen && state.route === 'customer')
    document.body.insertAdjacentHTML('beforeend', renderCartSidebar());

  attachListeners();
}

/* ═══════════════════════════════════════════════════
   8. AUTH
═══════════════════════════════════════════════════ */
async function loginSuperAdmin(username, password) {
  if (username === SUPER_ADMIN_CREDS.username && password === SUPER_ADMIN_CREDS.password) {
    DB.setSession({ role:'super-admin', name:'Super Admin', username }); return true;
  }
  showToast('Invalid Super Admin credentials', 'error'); return false;
}

/* All Firebase auth logic — returns true (ok), false (bad creds), or null (not found/timeout) */
async function _loginViaFirebase(role, username, password, mobile) {
  try {
    let userDoc = await db.collection('users').doc(username).get();

    // Phone-number-as-username shortcut
    if (!userDoc.exists && role === 'customer' && /^[0-9]{10}$/.test(username)) {
      const shopId = _ls(KEYS.shopId) || state.shopId;
      if (shopId) {
        const snap = await db.collection('shops').doc(shopId).collection('customers')
          .where('whatsapp','==',username).limit(1).get();
        if (!snap.empty) {
          const cd = snap.docs[0].data();
          userDoc = await db.collection('users').doc(cd.username||'').get().catch(()=>({exists:false}));
          if (!userDoc.exists) {
            if (!cd.password || cd.password === password) {
              _ls(KEYS.shopId, shopId); state.shopId = shopId;
              DB.setSession({ role:'customer', name:cd.name, username:cd.username||username, id:cd.id, shopId });
              Sync.start(shopId); return true;
            } else { showToast('Incorrect password','error'); return false; }
          }
        }
      }
    }

    // Sub-collection search (customer with no users/ doc)
    if (!userDoc.exists && role === 'customer') {
      const shopId = _ls(KEYS.shopId) || state.shopId;
      if (shopId) {
        try {
          let cs = await db.collection('shops').doc(shopId).collection('customers').where('username','==',username).limit(1).get();
          if (cs.empty) cs = await db.collection('shops').doc(shopId).collection('customers').where('name','==',username).limit(1).get();
          if (cs.empty && /^[0-9]{10}$/.test(username)) cs = await db.collection('shops').doc(shopId).collection('customers').where('whatsapp','==',username).limit(1).get();
          if (!cs.empty) {
            const c = cs.docs[0].data();
            _ls(KEYS.shopId, shopId); state.shopId = shopId;
            const uname = c.username||c.name||username;
            DB.setSession({ role:'customer', name:c.name, username:uname, id:c.id, shopId });
            db.collection('users').doc(uname).set({ role:'customer', id:c.id, name:c.name, username:uname, password:c.password||'', whatsapp:c.whatsapp||'', shopId }).catch(()=>{});
            db.collection('customerIndex').doc(uname).set({ shopId, id:c.id, name:c.name, whatsapp:c.whatsapp||'' }).catch(()=>{});
            Sync.start(shopId); recordDeviceLogin(shopId,{role:'customer',name:c.name}); return true;
          }
        } catch(_) {}
      }
      // customerIndex fallback — works on any fresh device
      try {
        const idxDoc = await db.collection('customerIndex').doc(username).get();
        if (idxDoc.exists) {
          const idx = idxDoc.data();
          if (idx.shopId) {
            _ls(KEYS.shopId, idx.shopId); state.shopId = idx.shopId;
            const cs2 = await db.collection('shops').doc(idx.shopId).collection('customers').doc(idx.id).get();
            if (cs2.exists) {
              const c = cs2.data();
              const mv = mobile || (/^[0-9]{10}$/.test(password) ? password : '');
              const pwdOk = password && c.password ? c.password===password : false;
              const mobOk = mv && c.whatsapp ? c.whatsapp===mv : false;
              const noCred = !c.password && !c.whatsapp;
              if (!noCred && !pwdOk && !mobOk) { showToast('Wrong password or mobile. Try again.','error'); return false; }
              DB.setSession({ role:'customer', name:c.name, username:c.username||username, id:c.id, shopId:idx.shopId });
              db.collection('users').doc(c.username||username).set({ role:'customer', id:c.id, name:c.name, username:c.username||username, password:c.password||'', whatsapp:c.whatsapp||'', shopId:idx.shopId }).catch(()=>{});
              Sync.start(idx.shopId); recordDeviceLogin(idx.shopId,{role:'customer',name:c.name}); return true;
            }
          }
        }
      } catch(_) {}
    }

    // Standard users/ doc path
    if (userDoc.exists) {
      const u = userDoc.data();
      if (role === 'customer') {
        const mv = mobile || (/^[0-9]{10}$/.test(password) ? password : '');
        const pwdOk = password && u.password ? u.password===password : false;
        const mobOk = mv && u.whatsapp ? u.whatsapp===mv : false;
        const noCred = !u.password && !u.whatsapp;
        if (!noCred && !pwdOk && !mobOk) { showToast('Wrong password or mobile number. Try again.','error'); return false; }
      } else {
        if (u.password && u.password !== password) { showToast('Incorrect password','error'); return false; }
      }
      if (u.role !== role) { showToast(`This is a ${u.role} account`,'error'); return false; }
      const sid = u.shopId || _ls(KEYS.shopId) || state.shopId;
      if (sid) {
        const ss = await db.collection('shops').doc(sid).get();
        if (ss.exists) { const sd=ss.data(); if(sd.shopInfo) _ls(KEYS.shop,sd.shopInfo); if(sd.categories) _ls(KEYS.categories,sd.categories); }
        _ls(KEYS.shopId, sid); state.shopId = sid;
        if (!u.shopId) db.collection('users').doc(username).update({shopId:sid}).catch(()=>{});
        if (role==='customer') {
          const cr = db.collection('shops').doc(sid).collection('customers').doc(u.id);
          const cs = await cr.get().catch(()=>null);
          if (cs && !cs.exists) cr.set({id:u.id,name:u.name,username,password:u.password,whatsapp:u.whatsapp||'',gender:u.gender||'',size:u.size||''}).catch(()=>{});
        }
      }
      DB.setSession({ role, name:u.name, username, id:u.id, shopId:sid||undefined });
      recordDeviceLogin(sid,{role,name:u.name}); Sync.start(sid);
      if (role==='admin') { repairOrphanedCustomers(sid); syncLocalCustomersToFirebase(sid); }
      return true;
    }

    return null; // not found in Firebase — fall through to local
  } catch(e) {
    console.error('Firebase login error:', e);
    return null; // fall through to local on any Firebase error
  }
}

async function login(role, username, password, mobile) {
  if (role === 'super-admin') return loginSuperAdmin(username, password);

  /* ── CUSTOMER: local storage first (instant), Firebase only if not found ── */
  if (role === 'customer') {
    const custs = DB.getCustomers();
    const cust = custs.find(c => c.username === username);
    if (cust) {
      // Found locally — verify credentials immediately, no network needed
      const mv = mobile || (/^[0-9]{10}$/.test(password) ? password : '');
      const pwdOk = password && cust.password ? cust.password === password : false;
      const mobOk = mv && cust.whatsapp ? cust.whatsapp === mv : false;
      const noCred = !cust.password && !cust.whatsapp;
      if (!pwdOk && !mobOk && !noCred) {
        showToast('Wrong password or mobile number. Try again.', 'error');
        return false;
      }
      const shopId = DB.getShopId();
      DB.setSession({ role:'customer', name:cust.name, username:cust.username, id:cust.id, shopId:shopId||undefined });
      recordDeviceLogin(shopId, { role:'customer', name:cust.name });
      if (firebaseReady && shopId) Sync.start(shopId);
      return true;
    }
    // Not in local storage — try Firebase (cross-device login)
    if (firebaseReady) {
      const fbResult = await Promise.race([
        _loginViaFirebase('customer', username, password, mobile),
        new Promise(resolve => setTimeout(() => resolve(null), 6000))
      ]).catch(() => null);
      if (fbResult === true || fbResult === false) return fbResult;
    }
    showToast('Account not found. Please tap "New Customer" to register first.', 'error');
    return false;
  }

  /* ── ADMIN & EMPLOYEE: Firebase first, local fallback ── */
  if (firebaseReady) {
    const fbResult = await Promise.race([
      _loginViaFirebase(role, username, password, mobile),
      new Promise(resolve => setTimeout(() => resolve(null), 7000))
    ]).catch(() => null);
    if (fbResult === true || fbResult === false) return fbResult;
  }

  // Local fallback for admin / employee
  let shop = DB.getShop();
  if (!shop && firebaseReady) {
    const shopId = _ls(KEYS.shopId) || state.shopId;
    if (shopId) {
      try {
        const ss = await Promise.race([
          db.collection('shops').doc(shopId).get(),
          new Promise((_,r) => setTimeout(() => r(new Error('t')), 5000))
        ]);
        if (ss.exists) { const sd=ss.data(); if(sd.shopInfo){_ls(KEYS.shop,sd.shopInfo);shop=sd.shopInfo;} if(sd.categories)_ls(KEYS.categories,sd.categories); }
      } catch(_) {}
    }
  }
  if (!shop) { showToast('No shop found. Please open the app on the shop device first.','error'); return false; }

  if (role === 'admin') {
    if (shop.adminUsername===username && shop.adminPassword===password) {
      let shopId = DB.getShopId();
      if (firebaseReady && !shopId) {
        shopId = uid(); _ls(KEYS.shopId, shopId); state.shopId = shopId;
        const cats = DB.getCategories();
        db.collection('shops').doc(shopId).set({shopInfo:shop,categories:cats,createdAt:Date.now()}).catch(console.error);
        db.collection('users').doc(username).set({role:'admin',shopId,name:shop.ownerName,id:shopId,password}).catch(console.error);
        DB.getEmployees().forEach(e=>db.collection('shops').doc(shopId).collection('employees').doc(e.id).set(e).catch(console.error));
        DB.getCustomers().forEach(c=>db.collection('shops').doc(shopId).collection('customers').doc(c.id).set(c).catch(console.error));
        DB.getProducts().forEach(p=>db.collection('shops').doc(shopId).collection('products').doc(p.id).set(p).catch(console.error));
        DB.getOrders().forEach(o=>db.collection('shops').doc(shopId).collection('orders').doc(o.id).set(o).catch(console.error));
        showToast('Shop synced to cloud ☁️','success');
      }
      DB.setSession({role:'admin',name:shop.ownerName,username,shopId:shopId||undefined});
      if (shopId) { state.shopId=shopId; Sync.start(shopId); recordDeviceLogin(shopId,{role:'admin',name:shop.ownerName}); repairOrphanedCustomers(shopId); syncLocalCustomersToFirebase(shopId); }
      return true;
    }
    showToast('Invalid admin credentials','error'); return false;
  }
  if (role === 'employee') {
    const emp = DB.getEmployees().find(e=>e.username===username&&e.password===password);
    if (emp) { DB.setSession({role:'employee',name:emp.name,username,id:emp.id}); recordDeviceLogin(DB.getShopId(),{role:'employee',name:emp.name}); return true; }
    showToast('Invalid employee credentials','error'); return false;
  }
  return false;
}

function logout() {
  Sync.stop(); DB.clearSession();
  state.cart = []; state.cartOpen = false; state.shopId = null;
  navigate('landing');
}

/* ═══════════════════════════════════════════════════
   9. LANDING PAGE
═══════════════════════════════════════════════════ */
function renderLanding() {
  const shop = DB.getShop();
  return `
  <div class="landing">
    <div class="landing-bg-pattern"></div><div class="landing-grid"></div>
    <div class="landing-content">
      <div class="landing-inner animate-fadeIn">
        <div class="landing-badge">✦ &nbsp; Fashion Management for Everyone &nbsp; ✦</div>
        <div class="landing-logo"><span class="gold-text">ZARA</span><span class="landing-logo-lite">Aura</span></div>
        <div class="landing-divider"><span class="landing-divider-icon">◆</span></div>
        <p class="landing-tagline">Elegance in every stitch,<br/>precision in every sale.</p>
        <div class="landing-highlights">
          <div class="landing-highlight-item">🏘️ <span>Designed for small &amp; rural boutiques</span></div>
          <div class="landing-highlight-item">📦 <span>Easy billing, stock &amp; inventory management</span></div>
          <div class="landing-highlight-item">🔄 <span>Real-time sync across all your devices</span></div>
          <div class="landing-highlight-item">📵 <span>Simple to use — no technical knowledge needed</span></div>
        </div>
        ${shop ? `<div class="shop-welcome-chip">✦ &nbsp; ${esc(shop.name)}</div>` : ''}
        <div class="login-options">
          ${loginCard('admin',    '👑', 'Admin',    'Manage shop, products &amp; team')}
          ${loginCard('employee', '🏷️', 'Employee', 'Stock &amp; product management')}
          ${loginCard('customer', '🛍️', 'Customer', 'Browse &amp; shop the collection')}
        </div>
        <p class="landing-footer">
          New shop? <a id="setup-shop-link">Set up your boutique →</a>
          <br/><a id="sa-link" style="font-size:0.68rem;color:var(--text-xlight);margin-top:6px;display:inline-block;cursor:pointer;">Super Admin ↗</a>
        </p>
      </div>
    </div>
  </div>`;
}
function loginCard(role, icon, title, desc) {
  return `<div class="login-option-card" data-role="${role}">
    <div class="login-option-icon">${icon}</div>
    <div class="login-option-text"><div class="login-option-title">${title}</div><div class="login-option-desc">${desc}</div></div>
    <span class="login-option-arrow">›</span></div>`;
}

/* ═══════════════════════════════════════════════════
   9b. CUSTOMER LOGIN CHOOSE (Existing vs New)
═══════════════════════════════════════════════════ */
function renderCustomerLoginChoose() {
  return `
  <div class="landing"><div class="landing-bg-pattern"></div><div class="landing-grid"></div>
    <div class="landing-content">
      <div style="width:100%;max-width:440px;" class="animate-slideUp">
        <div class="register-card">
          <div style="text-align:center;margin-bottom:28px;">
            <div class="landing-logo" style="font-size:2.4rem;"><span class="gold-text">ZARA</span><span class="landing-logo-lite" style="font-size:0.68rem;">Aura</span></div>
          </div>
          <div class="login-role-badge">🛍️ &nbsp; Customer</div>
          <h2 style="font-family:var(--font-serif);margin-bottom:6px;">Welcome</h2>
          <p class="text-muted" style="margin-bottom:28px;">Are you an existing customer or new here?</p>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <button id="cust-existing-btn" class="btn btn-gold btn-lg btn-block" style="display:flex;align-items:center;justify-content:center;gap:10px;font-size:1rem;">
              👤 &nbsp; Existing Customer
            </button>
            <button id="cust-new-btn" class="btn btn-outline btn-lg btn-block" style="display:flex;align-items:center;justify-content:center;gap:10px;font-size:1rem;">
              ✦ &nbsp; New Customer
            </button>
          </div>
          <div style="text-align:center;margin-top:20px;">
            <button class="btn btn-ghost btn-sm" id="back-to-landing">← Back</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   10. LOGIN
═══════════════════════════════════════════════════ */
function renderLogin(role) {
  const labels = { admin:'Admin', employee:'Employee', customer:'Customer', 'super-admin':'Super Admin' };
  const icons  = { admin:'👑', employee:'🏷️', customer:'🛍️', 'super-admin':'⚡' };
  return `
  <div class="landing"><div class="landing-bg-pattern"></div><div class="landing-grid"></div>
    <div class="landing-content">
      <div style="width:100%;max-width:440px;" class="animate-slideUp">
        <div class="register-card">
          <div style="text-align:center;margin-bottom:28px;">
            <div class="landing-logo" style="font-size:2.4rem;"><span class="gold-text">ZARA</span><span class="landing-logo-lite" style="font-size:0.68rem;">Aura</span></div>
          </div>
          <div class="login-role-badge">${icons[role]||'🔐'} &nbsp; ${labels[role]||'User'} Login</div>
          <h2 style="font-family:var(--font-serif);margin-bottom:6px;">Welcome Back</h2>
          <p class="text-muted" style="margin-bottom:24px;">Sign in to access your account</p>
          <form id="login-form" novalidate>
            <div style="display:flex;flex-direction:column;gap:16px;">
              <div class="form-group">
                <label class="form-label">Username <span class="required">*</span></label>
                <input type="text" class="form-control" name="username" id="login-identifier"
                  placeholder="Enter your username" autocomplete="username"/>
              </div>
              <div class="form-group">
                <label class="form-label">Password <span class="${role==='customer'?'optional-tag':'required'}">${role==='customer'?'(Enter password OR mobile)':'*'}</span></label>
                <div class="password-input-wrap">
                  <input type="password" class="form-control" name="password" id="login-password"
                    placeholder="Enter your password" autocomplete="current-password"/>
                  <button type="button" class="password-toggle-btn" data-target="login-password">👁</button>
                </div>
              </div>
              ${role==='customer'?`
              <div class="form-group">
                <label class="form-label">Mobile Number <span class="optional-tag">(Enter mobile OR password)</span></label>
                <input type="tel" class="form-control" name="mobile" id="login-mobile"
                  placeholder="10-digit mobile number" maxlength="10" autocomplete="tel"/>
                <small class="form-hint" style="color:#c62828;font-weight:500;">⚠ At least one of password or mobile is required</small>
              </div>
              <div class="form-group">
                <label class="form-label">Employee Attended By <span class="optional-tag">(Optional)</span></label>
                <input type="text" class="form-control" name="attendedBy" id="login-attended-by"
                  placeholder="Employee name who assisted you" autocomplete="off"/>
              </div>`:''}
              <div style="text-align:right;margin-top:-8px;">
                ${role !== 'super-admin' ? `<button type="button" class="btn-forgot-link" id="forgot-password-link">Forgot Password?</button>` : ''}
              </div>
              <button type="button" class="btn btn-gold btn-block btn-lg" id="login-submit-btn">Sign In</button>
            </div>
          </form>
          ${role === 'customer' ? `<div class="divider">or</div>
            <button class="btn btn-outline btn-block" id="go-register-customer">✦ Create New Account</button>` : ''}
          <div style="text-align:center;margin-top:20px;">
            <button class="btn btn-ghost btn-sm" id="back-to-landing">← Back</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   10b. FORGOT PASSWORD (OTP via WhatsApp)
═══════════════════════════════════════════════════ */
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskPhone(phone) {
  if (!phone || phone.length < 4) return '******';
  return phone.slice(0, 2) + '****' + phone.slice(-2);
}

function renderForgotPassword(role) {
  const labels = { admin:'Admin', employee:'Employee', customer:'Customer' };
  const icons  = { admin:'👑', employee:'🏷️', customer:'🛍️' };

  // Step indicator helper
  function stepBadge(n) {
    if (state.fpStep > n) return `<div class="fp-step done"><div class="fp-step-num">✓</div><div class="fp-step-label">${['','Username','OTP','Password'][n]}</div></div>`;
    if (state.fpStep === n) return `<div class="fp-step active"><div class="fp-step-num">${n}</div><div class="fp-step-label">${['','Username','OTP','Password'][n]}</div></div>`;
    return `<div class="fp-step"><div class="fp-step-num">${n}</div><div class="fp-step-label">${['','Username','OTP','Password'][n]}</div></div>`;
  }
  function stepLine(afterStep) {
    return `<div class="fp-step-line ${state.fpStep > afterStep ? 'done' : ''}"></div>`;
  }

  const stepIndicator = `
    <div class="fp-step-indicator">
      ${stepBadge(1)}${stepLine(1)}${stepBadge(2)}${stepLine(2)}${stepBadge(3)}
    </div>`;

  /* ── Step 1: Enter username ── */
  const step1Html = `
    <form id="fp-step1-form">
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="form-group">
          <label class="form-label">Username <span class="required">*</span></label>
          <input type="text" class="form-control" id="fp-username-input" name="fp-username"
            placeholder="Enter your username" required autocomplete="off"/>
          <small class="form-hint">We'll send an OTP directly to your registered phone number via SMS</small>
        </div>
        <button type="submit" class="btn btn-gold btn-block btn-lg" id="fp-send-otp-btn">
          📱 &nbsp; Send OTP via SMS
        </button>
      </div>
    </form>`;

  /* ── Step 2: Enter OTP ── */
  const maskedPhone = maskPhone(state.fpFoundUser?.phone || '');
  const expMins = state.fpOtpExpiry
    ? Math.max(0, Math.ceil((state.fpOtpExpiry - Date.now()) / 60000))
    : 5;
  const step2Html = `
    <div class="fp-verified-badge">
      📱 OTP sent via SMS to number ending in <strong>${maskedPhone}</strong>
    </div>
    <form id="fp-otp-form">
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="form-group">
          <label class="form-label">Enter 6-digit OTP <span class="required">*</span></label>
          <input type="text" class="form-control otp-input" id="fp-otp-input" name="fp-otp"
            placeholder="• • • • • •" required maxlength="6" pattern="[0-9]{6}"
            inputmode="numeric" autocomplete="one-time-code"
            style="font-size:1.6rem;letter-spacing:12px;text-align:center;font-weight:700;"/>
          <small class="form-hint">OTP expires in ${expMins} minute${expMins!==1?'s':''}. Check your SMS inbox.</small>
        </div>
        <button type="submit" class="btn btn-gold btn-block btn-lg" id="fp-verify-otp-btn">
          ✅ &nbsp; Verify OTP
        </button>
        <button type="button" class="btn btn-outline btn-block btn-sm" id="fp-resend-otp-btn">
          🔄 Resend OTP
        </button>
      </div>
    </form>`;

  /* ── Step 3: Set new password ── */
  const step3Html = `
    <div class="fp-verified-badge">✅ OTP Verified — ${state.fpFoundUser?.name || ''}</div>
    <form id="fp-step3-form">
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="form-group">
          <label class="form-label">New Password <span class="required">*</span></label>
          <div class="password-input-wrap">
            <input type="password" class="form-control" id="fp-newpass" name="fp-newpass"
              placeholder="Enter new password" required minlength="4" autocomplete="new-password"/>
            <button type="button" class="password-toggle-btn" data-target="fp-newpass">👁</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password <span class="required">*</span></label>
          <div class="password-input-wrap">
            <input type="password" class="form-control" id="fp-confirmpass" name="fp-confirmpass"
              placeholder="Confirm new password" required minlength="4" autocomplete="new-password"/>
            <button type="button" class="password-toggle-btn" data-target="fp-confirmpass">👁</button>
          </div>
        </div>
        <button type="submit" class="btn btn-gold btn-block btn-lg" id="fp-save-btn">
          🔐 &nbsp; Reset Password
        </button>
      </div>
    </form>`;

  const stepContent = [null, step1Html, step2Html, step3Html][state.fpStep] || step1Html;
  const stepTitles  = ['','Enter Your Username','Verify OTP','Set New Password'];
  const stepDescs   = ['',
    'Enter your username to receive a one-time password via SMS',
    'Enter the 6-digit OTP sent to your registered phone number',
    'Choose a strong new password for your account'
  ];

  return `
  <div class="landing"><div class="landing-bg-pattern"></div><div class="landing-grid"></div>
    <div class="landing-content">
      <div style="width:100%;max-width:460px;" class="animate-slideUp">
        <div class="register-card">
          <div style="text-align:center;margin-bottom:24px;">
            <div class="landing-logo" style="font-size:2.4rem;"><span class="gold-text">ZARA</span><span class="landing-logo-lite" style="font-size:0.68rem;">Aura</span></div>
          </div>
          <div class="login-role-badge">🔑 &nbsp; Forgot Password — ${icons[role]||'🔐'} ${labels[role]||'User'}</div>
          ${stepIndicator}
          <h2 style="font-family:var(--font-serif);margin-bottom:6px;">${stepTitles[state.fpStep]}</h2>
          <p class="text-muted" style="margin-bottom:24px;">${stepDescs[state.fpStep]}</p>
          ${stepContent}
          <div style="text-align:center;margin-top:20px;">
            <button class="btn btn-ghost btn-sm" id="back-to-login-fp">← Back to Login</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   11. SHOP REGISTRATION
═══════════════════════════════════════════════════ */
function renderRegisterShop() {
  return `
  <div class="register-page" style="padding:20px 12px 40px;">
    <div class="animate-slideUp" style="max-width:980px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:24px;">
        <div class="badge" style="margin-bottom:8px;">✦ &nbsp; First Time Setup</div>
        <h2 style="font-family:var(--font-serif);font-size:2rem;">Set Up Your <span class="gold-text">Boutique</span></h2>
        <p class="text-muted" style="margin-top:6px;">Fill in your shop details — they'll appear on bills &amp; customer view automatically</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start;">

        <!-- ── LEFT: FORM ── -->
        <div class="register-card" style="padding:28px;">
          <form id="shop-register-form">
            <div style="display:flex;flex-direction:column;gap:18px;">

              <!-- Shop Details -->
              <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:-6px;">🏪 Shop Details</div>
              <div class="form-row">
                <div class="form-group"><label class="form-label">Shop Name <span class="required">*</span></label>
                  <input type="text" class="form-control" name="name" id="reg-name" placeholder="e.g. Radiant Collections" required oninput="updateBillPreview()"/></div>
                <div class="form-group"><label class="form-label">Owner Name <span class="required">*</span></label>
                  <input type="text" class="form-control" name="ownerName" placeholder="e.g. Priya Sharma" required/></div>
              </div>
              <div class="form-group"><label class="form-label">Shop Address <span class="required">*</span></label>
                <textarea class="form-control" name="address" id="reg-address" placeholder="Full address with city, state, pincode…" required style="min-height:64px;" oninput="updateBillPreview()"></textarea></div>
              <div class="form-row">
                <div class="form-group"><label class="form-label">Phone Number <span class="required">*</span></label>
                  <input type="tel" class="form-control" name="phone" id="reg-phone" placeholder="10-digit number" required maxlength="10" pattern="[0-9]{10}" oninput="updateBillPreview()"/></div>
                <div class="form-group"><label class="form-label">GST Number <span class="optional-tag">(Optional)</span></label>
                  <input type="text" class="form-control" name="gst" id="reg-gst" placeholder="e.g. 29ABCDE1234F1Z5" maxlength="15" style="text-transform:uppercase" oninput="updateBillPreview()"/>
                  <small class="form-hint">15-character GST number</small></div>
              </div>

              <!-- Bill Details -->
              <div style="border-top:1px solid var(--border-light);padding-top:14px;">
                <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:12px;">🧾 Bill / Invoice Details</div>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">UPI ID <span class="optional-tag">(Optional)</span></label>
                    <input type="text" class="form-control" name="upiId" id="reg-upi" placeholder="shop@upi or phone@ybl" oninput="updateBillPreview()"/>
                    <small class="form-hint">Shown on invoice for payment</small></div>
                  <div class="form-group"><label class="form-label">Bill Footer Message <span class="optional-tag">(Optional)</span></label>
                    <input type="text" class="form-control" name="billFooter" id="reg-footer" placeholder="e.g. Thank you! Visit again 🛍" oninput="updateBillPreview()"/>
                    <small class="form-hint">Printed at bottom of every bill</small></div>
                </div>
              </div>

              <!-- Admin Credentials -->
              <div style="border-top:1px solid var(--border-light);padding-top:14px;">
                <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:12px;">🔐 Admin Login Credentials</div>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Admin Username <span class="required">*</span></label>
                    <input type="text" class="form-control" name="adminUsername" placeholder="Choose a username" required autocomplete="new-password"/></div>
                  <div class="form-group"><label class="form-label">Admin Password <span class="required">*</span></label>
                    <div class="password-input-wrap">
                      <input type="password" class="form-control" name="adminPassword" id="admin-pwd" placeholder="Choose a password" required autocomplete="new-password"/>
                      <button type="button" class="password-toggle-btn" data-target="admin-pwd">👁</button>
                    </div></div>
                </div>
              </div>

              <button type="submit" class="btn btn-gold btn-block btn-lg" id="shop-register-btn">✦ &nbsp; Launch My Boutique</button>
            </div>
          </form>
          <div style="text-align:center;margin-top:16px;"><button class="btn btn-ghost btn-sm" id="back-to-landing">← Back</button></div>
        </div>

        <!-- ── RIGHT: LIVE BILL PREVIEW ── -->
        <div style="position:sticky;top:20px;">
          <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:10px;text-align:center;">📄 Live Bill Preview</div>
          <div id="bill-setup-preview" style="background:#fff;border:1px solid var(--border-light);border-radius:10px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);font-size:0.78rem;font-family:monospace;">
            <div id="prev-shop-name" style="font-size:1rem;font-weight:700;text-align:center;font-family:var(--font-serif);color:#1a1a2e;">Your Shop Name</div>
            <div id="prev-shop-addr" style="font-size:0.7rem;text-align:center;color:#666;margin-top:3px;line-height:1.4;">Shop Address</div>
            <div id="prev-shop-phone" style="font-size:0.7rem;text-align:center;color:#666;"></div>
            <div id="prev-shop-gst" style="font-size:0.68rem;text-align:center;font-weight:700;color:var(--gold-dark);margin-top:3px;"></div>
            <div style="border-top:1px dashed #bbb;margin:8px 0;text-align:center;font-size:0.6rem;letter-spacing:0.12em;color:#888;font-family:monospace;">── GST TAX INVOICE ──</div>
            <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:#888;margin-bottom:6px;">
              <span>Bill No: BILL-00001</span><span>Date: ${new Date().toLocaleDateString('en-IN')}</span>
            </div>
            <div style="border-top:1px dashed #bbb;margin:8px 0;font-size:0.65rem;color:#aaa;">[Items table will appear here]</div>
            <div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:700;border-top:1px dashed #bbb;padding-top:6px;margin-top:4px;">
              <span>Grand Total</span><span>₹ — —</span>
            </div>
            <div id="prev-upi" style="font-size:0.65rem;color:#555;margin-top:6px;text-align:center;"></div>
            <div style="border-top:1px dashed #bbb;margin:8px 0;"></div>
            <div id="prev-footer" style="font-size:0.68rem;text-align:center;color:#888;font-style:italic;">Thank you for shopping with us! ✦</div>
            <div id="prev-shop-footer-name" style="font-size:0.65rem;text-align:center;color:#bbb;margin-top:2px;"></div>
          </div>
          <div style="margin-top:8px;font-size:0.68rem;color:var(--text-light);text-align:center;">Updates as you type ↑</div>
        </div>

      </div>
    </div>
  </div>`;

}

/* ═══════════════════════════════════════════════════
   12. CUSTOMER REGISTRATION
═══════════════════════════════════════════════════ */
function renderRegisterCustomer() {
  return `
  <div class="register-page">
    <div class="register-card animate-slideUp" style="max-width:660px;">
      <div class="register-header">
        <div class="badge">✦ &nbsp; Customer Registration</div>
        <h2 style="font-family:var(--font-serif);font-size:2rem;">Join <span class="gold-text">Zara Aura</span></h2>
        <p class="text-muted" style="margin-top:6px;">Create your account for a personalised experience</p>
      </div>
      <form id="customer-register-form">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Full Name <span class="required">*</span></label>
              <input type="text" class="form-control" name="name" required placeholder="Your name"/></div>
            <div class="form-group"><label class="form-label">Phone Number <span class="optional-tag">(Optional)</span></label>
              <input type="tel" class="form-control" name="whatsapp" maxlength="10" pattern="[0-9]{10}" title="Enter exactly 10 digits" placeholder="10-digit mobile number"/>
              <small class="form-hint">Used for order updates &amp; password recovery</small></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Gender <span class="optional-tag">(Optional)</span></label>
              <select class="form-control" name="gender">
                <option value="">Select</option>
                <option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other</option>
              </select></div>
            <div class="form-group"><label class="form-label">Clothing Size <span class="optional-tag">(Optional)</span></label>
              <select class="form-control" name="size">
                <option value="">Select</option>
                ${['XS','S','M','L','XL','XXL','3XL'].map(s=>`<option value="${s}">${s}</option>`).join('')}
              </select></div>
          </div>
          <div class="form-group"><label class="form-label">Address <span class="optional-tag">(Optional)</span></label>
            <textarea class="form-control" name="address" placeholder="Your address…" style="min-height:64px;"></textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
            <div class="form-group"><label class="form-label">Skin Tone <span class="optional-tag">(Opt.)</span></label>
              <select class="form-control" name="skinTone"><option value="">—</option>
                ${['Fair','Wheatish','Medium','Dusky','Dark'].map(s=>`<option>${s}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">Fav. Color <span class="optional-tag">(Opt.)</span></label>
              <input type="text" class="form-control" name="preferredColor" placeholder="e.g. Blue"/></div>
            <div class="form-group"><label class="form-label">Occasion <span class="optional-tag">(Opt.)</span></label>
              <select class="form-control" name="occasion"><option value="">—</option>
                ${['Casual','Formal','Wedding','Festival','Party','Sports'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          </div>
          <div style="border-top:1px solid var(--border-light);padding-top:14px;">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Username <span class="required">*</span></label>
                <input type="text" class="form-control" name="username" required placeholder="Choose a unique username" autocomplete="new-password"/>
                <small class="form-hint">Used to log in. Keep it simple (e.g. riya_2025)</small></div>
              <div class="form-group"><label class="form-label">Password <span class="optional-tag">(Optional)</span></label>
                <div class="password-input-wrap">
                  <input type="password" class="form-control" name="password" id="cust-reg-pwd" placeholder="Set a password (recommended)" autocomplete="new-password"/>
                  <button type="button" class="password-toggle-btn" data-target="cust-reg-pwd">👁</button>
                </div>
                <small class="form-hint">Leave blank to log in with only username &amp; phone</small></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Employee Attended By <span class="optional-tag">(Optional)</span></label>
            <input type="text" class="form-control" name="attendedBy" placeholder="Employee name who assisted you" autocomplete="off"/>
            <small class="form-hint">Enter the name of the employee who helped you today</small>
          </div>
          <label class="sms-consent-label">
            <input type="checkbox" name="smsConsent" value="yes" class="sms-consent-checkbox"/>
            <span>📱 I agree to receive <strong>exclusive offers & updates via SMS</strong> from the shop</span>
          </label>
          <button type="submit" class="btn btn-gold btn-block btn-lg">✦ &nbsp; Create My Account</button>
        </div>
      </form>
      <div style="text-align:center;margin-top:16px;">
        <button class="btn btn-ghost btn-sm" id="back-to-login-customer">← Back to Login</button>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   13. SHARED LAYOUT
═══════════════════════════════════════════════════ */
function renderAppHeader({ shopName, userName }) {
  const session = DB.getSession();
  const isAdmin = session?.role === 'admin';
  const roleSwitcher = isAdmin ? `
    <div class="role-switcher no-print">
      <span class="role-switcher-label">View as:</span>
      <button class="role-switch-btn${state.route==='admin'?' active':''}" data-switch-role="admin">👑 Admin</button>
      <button class="role-switch-btn${state.route==='employee'?' active':''}" data-switch-role="employee">🏷️ Employee</button>
      <button class="role-switch-btn${state.route==='customer'?' active':''}" data-switch-role="customer">🛍️ Customer</button>
    </div>` : '';
  return `
  <header class="app-header no-print">
    <div class="app-logo">
      <span class="gold-text">ZARA</span><span class="app-logo-lite">Aura</span>
      ${shopName ? `<span class="header-shop-name">· ${esc(shopName)}</span>` : ''}
    </div>
    ${roleSwitcher}
    <div class="header-actions">
      ${firebaseReady ? `<span class="live-indicator" title="Real-time sync active">● LIVE</span>` : ''}
      <span class="header-user">
        <span class="header-user-dot"></span>${esc(userName||'')}
      </span>
      <button class="btn btn-ghost btn-sm" id="logout-btn">Sign Out</button>
    </div>
  </header>`;
}

function renderSidebar(role) {
  const links = role === 'admin'
    ? [['overview','◈','Overview'],['products','✦','Products'],['categories','◻','Categories'],
       ['employees','◉','Employees'],['customers','◎','Customers'],['orders','◊','Orders'],
       ['billing','🧾','Billing'],
       ['analytics','📊','Analytics'],['sms','📣','Send Offers'],['feedback','⭐','Feedback']]
    : role === 'employee'
    ? [['products','✦','Products'],['categories','◻','Categories'],['stock','📦','Stock'],['salary','💰','My Salary']]
    : [['products','✦','Products'],['stock','◻','Stock'],['feedback','⭐','My Feedback']];
  const session = DB.getSession();
  return `
  <nav class="dash-sidebar no-print">
    <div class="sidebar-section">
      <div class="sidebar-section-label">Navigation</div>
      ${links.map(([id,icon,label]) => `
        <div class="sidebar-nav-item${state.subRoute===id?' active':''}" data-sub="${id}">
          <span class="sidebar-nav-icon">${icon}</span><span>${label}</span>
        </div>`).join('')}
    </div>
    <div class="sidebar-user">
      <div class="sidebar-user-name">${esc(session?.name||'')}</div>
      <div class="sidebar-user-role">${role==='admin'?'Administrator':'Employee'}</div>
      <div class="sidebar-logout" id="logout-btn-sidebar">⎋ &nbsp; Sign Out</div>
    </div>
  </nav>`;
}

/* ═══════════════════════════════════════════════════
   14. ADMIN DASHBOARD
═══════════════════════════════════════════════════ */
function renderAdminDash() {
  const session = DB.getSession(), shop = DB.getShop();
  const subViews = { overview:renderAdminOverview, products:renderAdminProducts,
    categories:renderAdminCategories, employees:renderAdminEmployees,
    customers:renderAdminCustomers, orders:renderAdminOrders,
    billing:renderAdminBilling,
    analytics:renderAdminAnalytics, sms:renderAdminSms, feedback:renderAdminFeedback };
  return `<div>${renderAppHeader({ shopName:shop?.name, userName:session?.name })}
    <div class="dash-layout">${renderSidebar('admin')}
      <main class="dash-main">${(subViews[state.subRoute]||renderAdminOverview)()}</main>
    </div></div>`;
}

/* Wrapper: customer feedback page in the customer shop layout */
function renderCustomerFeedbackPage() {
  const shop = DB.getShop(), session = DB.getSession();
  const cartCount = state.cart.reduce((s,i) => s+i.qty, 0);
  state.feedbackRating = state.feedbackRating || 0;
  return `<div>
    <header class="app-header">
      <div class="app-logo"><span class="gold-text">ZARA</span><span class="app-logo-lite">Aura</span></div>
      <div class="header-actions">
        <button class="btn btn-ghost btn-sm" data-sub="products" id="back-to-shop-btn">← Shop</button>
        <button class="btn btn-ghost btn-sm cart-btn" id="cart-toggle-btn">🛍️ Cart${cartCount>0?` <span class="cart-badge">${cartCount}</span>`:''}</button>
        <button class="btn btn-ghost btn-sm" id="logout-btn">⎋ Sign Out</button>
      </div>
    </header>
    <div class="dash-layout">
      ${renderSidebar('customer')}
      <main class="dash-main">${renderCustomerFeedbackForm()}</main>
    </div>
  </div>`;
}

function renderAdminOverview() {
  const prods=DB.getProducts(), emps=DB.getEmployees(), custs=DB.getCustomers(), ords=DB.getOrders();
  const rev=ords.reduce((s,o)=>s+(+o.total||0),0);
  // Low stock logic — handles both sized and unsized products
  const oos=[], low=[];
  prods.forEach(p=>{
    if(p.hasSizes&&p.sizeStock?.length){
      const allOos=p.sizeStock.every(s=>+s.stock===0);
      const anyLow=p.sizeStock.some(s=>+s.stock>0&&+s.stock<=5);
      const allOosNames=p.sizeStock.filter(s=>+s.stock===0).map(s=>s.size);
      if(allOos) oos.push({...p,_detail:'all sizes OOS'});
      else if(anyLow){const lowSizes=p.sizeStock.filter(s=>+s.stock>0&&+s.stock<=5).map(s=>`${s.size}:${s.stock}`).join(', ');low.push({...p,_detail:lowSizes});}
    } else {
      if(+p.quantity===0) oos.push(p);
      else if(+p.quantity>0&&+p.quantity<=5) low.push(p);
    }
  });
  const weekOrds=ords.filter(o=>{const d=new Date(o.date);const now=new Date();return now-d<7*24*60*60*1000;});
  const weekRev=weekOrds.reduce((s,o)=>s+(+o.total||0),0);
  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Dashboard Overview</div>
    <div class="dash-page-subtitle">Your boutique at a glance.
      ${firebaseReady?'<span style="color:var(--gold-dark);font-size:0.78rem;"> · Live sync active across all devices</span>':''}</div>
    <div class="grid-4" style="margin-bottom:28px;">
      ${statCard('✦','Total Products',prods.length,'catalogue items')}
      ${statCard('◉','Employees',emps.length,'team members')}
      ${statCard('◎','Customers',custs.length,'registered')}
      ${statCard('◊','Revenue',fmt(rev),`${ords.length} orders`)}
    </div>
    <div class="grid-4" style="margin-bottom:24px;">
      ${statCard('🛍','Today\'s Orders',ords.filter(o=>new Date(o.date).toDateString()===new Date().toDateString()).length,'orders today')}
      ${statCard('📅','This Week',weekOrds.length,fmt(weekRev))}
      ${statCard('⚠','Low Stock',low.length,'items')}
      ${statCard('❌','Out of Stock',oos.length,'items')}
    </div>
    ${(oos.length||low.length)?`<div style="margin-bottom:24px;">
      ${oos.slice(0,3).map(p=>`<div class="alert alert-danger">❌ &nbsp; <strong>${esc(p.name)}</strong> is out of stock${p._detail?' ('+esc(p._detail)+')':''}</div>`).join('')}
      ${low.slice(0,5).map(p=>`<div class="alert alert-warning">⚠ &nbsp; <strong>${esc(p.name)}</strong> – low stock${p._detail?' ('+esc(p._detail)+')':' (only '+p.quantity+' left)'}</div>`).join('')}
    </div>`:''}
    <!-- Shop & Bill Details Card -->
    ${(()=>{const s=DB.getShop();return `<div class="card" style="margin-bottom:24px;border-left:4px solid var(--gold-light);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <h4 style="font-family:var(--font-serif);margin:0;">🏪 Shop &amp; Bill Details</h4>
        <button class="btn btn-outline btn-sm" id="edit-shop-btn">✏️ Edit Details</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;font-size:0.85rem;">
        <div><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-light);">Shop Name</span><div style="font-weight:700;">${esc(s?.name||'—')}</div></div>
        <div><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-light);">Address</span><div>${esc(s?.address||'—')}</div></div>
        <div><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-light);">Phone</span><div>📞 ${esc(s?.phone||'—')}</div></div>
        <div><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-light);">GST Number</span><div style="font-family:monospace;">${esc(s?.gst||'—')}</div></div>
        <div><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-light);">UPI ID</span><div>📱 ${esc(s?.upiId||'—')}</div></div>
        <div><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-light);">Bill Footer</span><div style="font-style:italic;">${esc(s?.billFooter||'—')}</div></div>
      </div>
      <div style="margin-top:10px;font-size:0.75rem;color:var(--text-light);">✦ Changes here automatically appear on bills &amp; customer view</div>
    </div>`;})()}
    ${state.modalOpen==='edit-shop'?renderEditShopModal():''}

    <div class="grid-2">
      <div class="card"><h4 style="font-family:var(--font-serif);margin-bottom:14px;">Recent Products</h4>
        ${prods.length===0?`<p class="text-muted">No products yet.</p>`:
          prods.slice(-5).reverse().map(p=>`
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light);">
            ${p.image?`<img src="${p.image}" style="width:38px;height:38px;border-radius:6px;object-fit:cover;">`:
              `<div style="width:38px;height:38px;border-radius:6px;background:var(--cream-2);display:flex;align-items:center;justify-content:center;">👗</div>`}
            <div style="flex:1;"><div style="font-weight:600;font-size:0.85rem;">${esc(p.name)}</div>
              <div style="font-size:0.72rem;color:var(--text-light);">${esc(p.category)} · ${esc(p.size)} · ${fmt(p.price)}</div></div>
            <span class="td-badge ${+p.quantity===0?'badge-red':+p.quantity<=5?'badge-gold':'badge-green'}">${p.quantity} left</span>
          </div>`).join('')}
      </div>
      <div class="card"><h4 style="font-family:var(--font-serif);margin-bottom:14px;">Recent Orders</h4>
        ${ords.length===0?`<p class="text-muted">No orders yet.</p>`:
          ords.slice(-5).reverse().map(o=>{const c=custs.find(x=>x.id===o.customerId);
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light);">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);display:flex;align-items:center;justify-content:center;">🛍</div>
              <div style="flex:1;"><div style="font-weight:600;font-size:0.85rem;">${esc(c?.name||'Guest')}</div>
                <div style="font-size:0.72rem;color:var(--text-light);">${fmtDate(o.date)}</div></div>
              <span style="font-family:var(--font-serif);font-weight:700;color:var(--gold-dark);">${fmt(o.total)}</span>
            </div>`;}).join('')}
      </div>
    </div>
  </div>`;
}
function renderEditShopModal() {
  const s = DB.getShop() || {};
  return `<div class="modal-overlay" id="edit-shop-overlay">
    <div class="modal animate-slideUp" style="max-width:600px;width:95vw;">
      <div class="modal-header" style="background:var(--gold-lighter);border-bottom:2px solid var(--gold-light);">
        <div class="modal-title" style="font-family:var(--font-serif);color:var(--gold-dark);">✏️ Edit Shop &amp; Bill Details</div>
        <button class="modal-close" data-close-modal="edit-shop">✕</button>
      </div>
      <div class="modal-body" style="padding:24px;">
        <form id="edit-shop-form">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;">🏪 Shop Details</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Shop Name <span class="required">*</span></label>
                <input type="text" class="form-control" name="name" value="${esc(s.name||'')}" required/></div>
              <div class="form-group"><label class="form-label">Owner Name</label>
                <input type="text" class="form-control" name="ownerName" value="${esc(s.ownerName||'')}"/></div>
            </div>
            <div class="form-group"><label class="form-label">Shop Address</label>
              <textarea class="form-control" name="address" style="min-height:60px;">${esc(s.address||'')}</textarea></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Phone Number</label>
                <input type="tel" class="form-control" name="phone" value="${esc(s.phone||'')}" maxlength="10"/></div>
              <div class="form-group"><label class="form-label">GST Number</label>
                <input type="text" class="form-control" name="gst" value="${esc(s.gst||'')}" maxlength="15" style="text-transform:uppercase"/></div>
            </div>
            <div style="border-top:1px solid var(--border-light);padding-top:14px;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;">🧾 Bill / Invoice Details</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">UPI ID</label>
                <input type="text" class="form-control" name="upiId" value="${esc(s.upiId||'')}" placeholder="shop@upi"/>
                <small class="form-hint">Shown on invoice for easy payment</small></div>
              <div class="form-group"><label class="form-label">Bill Footer Message</label>
                <input type="text" class="form-control" name="billFooter" value="${esc(s.billFooter||'')}" placeholder="Thank you for shopping!"/>
                <small class="form-hint">Printed at bottom of every bill</small></div>
            </div>
            <div style="background:var(--cream-2);border-radius:8px;padding:10px 14px;font-size:0.78rem;color:var(--text-medium);">
              ✦ After saving, changes automatically appear on all bills and the customer shop view
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer" style="justify-content:flex-end;gap:10px;">
        <button class="btn btn-ghost" data-close-modal="edit-shop">Cancel</button>
        <button class="btn btn-gold" id="save-shop-details-btn">💾 Save Changes</button>
      </div>
    </div>
  </div>`;
}

function statCard(icon,label,value,sub){
  return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-info">
    <div class="stat-value">${value}</div><div class="stat-label">${label}</div>
    ${sub?`<div class="stat-badge">${sub}</div>`:''}</div></div>`;
}

function renderAdminProducts() {
  const q=state.searchQuery.toLowerCase();
  const allProds=DB.getProducts();
  const activeCat=state.productCategoryTab||'all';
  const prods=allProds.filter(p=>{
    const matchQ=!q||p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)||(p.color||'').toLowerCase().includes(q);
    const matchCat=activeCat==='all'||p.category===activeCat;
    return matchQ&&matchCat;
  });
  const catIcons={'Men':'👔','Women':'👗','Kids':'🧒','Newborn':'🍼'};
  // Dynamic: combine configured categories + any found in product data
  const allProdCats=[...new Set(allProds.map(p=>p.category).filter(Boolean))];
  const adminCatList=[...new Set([...getMainCategories(),...allProdCats])];
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Product Catalogue</div><div class="dash-page-subtitle">Manage your clothing inventory</div>
    <div class="dash-toolbar">
      <div class="dash-search"><span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search products…" id="product-search" value="${esc(state.searchQuery)}"/></div>
      <button class="btn btn-gold" id="add-product-btn">+ Add Product</button>
    </div>
    <!-- Category Tabs — dynamic from product data + configured categories -->
    <div class="prod-cat-tabs">
      <button class="prod-cat-tab${activeCat==='all'?' active':''}" data-prod-cat="all">
        ✦ All <span class="prod-cat-count">${allProds.length}</span>
      </button>
      ${adminCatList.map(c=>`<button class="prod-cat-tab${activeCat===c?' active':''}" data-prod-cat="${esc(c)}">
        ${catIcons[c]||'👕'} ${esc(c)} <span class="prod-cat-count">${allProds.filter(p=>p.category===c).length}</span>
      </button>`).join('')}
    </div>
    ${prods.length===0
      ?`<div class="empty-state"><div class="empty-state-icon">${catIcons[activeCat]||'👗'}</div>
          <div class="empty-state-title">No ${activeCat==='all'?'products':activeCat+' products'} found</div>
          <button class="btn btn-gold" id="add-product-btn" style="margin-top:16px;">+ Add Product</button>
        </div>`
      :`<div class="grid-3">${prods.map(renderProductCard).join('')}</div>`}
    ${state.modalOpen==='product'?renderProductModal():''}
    ${state.modalOpen==='stock'?renderStockModal(state.stockProductId):''}
  </div>`;
}
function renderProductCard(p) {
  const qty=+p.quantity, sc=qty===0?'badge-red':qty<=5?'badge-gold':'badge-green', sl=qty===0?'Out of Stock':qty<=5?`Low: ${qty}`:`In Stock: ${qty}`;
  const sizes=getProductSizes(p);
  const priceDisplay=sizes.length>1?`From ${fmt(Math.min(...sizes.map(s=>+s.price)))}`:sizes.length===1?fmt(sizes[0].price):fmt(p.price||0);
  const sizeTagsHtml=sizes.slice(0,4).map(s=>`<span class="product-tag size-tag-sm">${esc(s.size)}</span>`).join('')+(sizes.length>4?`<span class="product-tag" style="color:var(--text-light);">+${sizes.length-4}</span>`:'');
  return `<div class="product-card">
    <div class="product-card-img">${p.image?`<img src="${p.image}" alt="${esc(p.name)}"/>`:
      `<div class="no-img"><span style="font-size:2.5rem;">👗</span><span style="font-size:0.72rem;">No Image</span></div>`}</div>
    <div class="product-card-body">
      <div class="product-card-name">${esc(p.name)}</div>
      <div class="product-card-meta">
        <span class="product-tag gold">${esc(p.category)}</span>
        ${p.material?`<span class="product-tag">${esc(p.material)}</span>`:''}
        ${(p.colors&&p.colors.length?p.colors:[{name:p.color||''}]).slice(0,4).map(c=>`<span class="product-tag" style="display:inline-flex;align-items:center;gap:4px;"><span class="color-dot" style="background:${esc((c.name||'#ccc').toLowerCase())};"></span>${esc(c.name||'')}</span>`).join('')}${(p.colors&&p.colors.length>4)?`<span class="product-tag" style="color:var(--text-light);">+${p.colors.length-4}</span>`:''}
      </div>
      ${sizeTagsHtml?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${sizeTagsHtml}</div>`:''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
        <div class="product-card-price">${priceDisplay}</div><span class="td-badge ${sc}">${sl}</span></div>
      <div class="product-card-actions">
        <button class="btn btn-outline btn-sm" data-edit-product="${esc(p.id)}" style="flex:1;">Edit</button>
        <button class="btn btn-ghost btn-sm" data-stock-product="${esc(p.id)}">Stock</button>
        <button class="btn-icon" data-delete-product="${esc(p.id)}" style="width:34px;height:34px;font-size:0.85rem;">✕</button>
      </div>
    </div>
  </div>`;
}
function _sizeDatalistId(idx) { return `size-dl-${idx}`; }

/* Global: remove a single size row from a color variant — called via onclick */
window._removeColorSizeRow = function(btn) {
  const row = btn.closest('tr');
  const tbody = row && row.closest('tbody');
  if (tbody && tbody.querySelectorAll('tr').length > 1) {
    row.parentNode.removeChild(row);
  } else {
    showToast('At least one size per color is required', 'error');
  }
};

function renderColorVariantBlock(cv, idx, availSizes) {
  const dlId = _sizeDatalistId(idx);
  const dlHtml = `<datalist id="${dlId}">${availSizes.map(sz=>`<option value="${sz}">`).join('')}</datalist>`;
  const makeRow = (size, price, stock) => `<tr class="size-row">
    <td>${dlHtml}<input type="text" class="form-control form-control-sm size-size-sel" list="${dlId}" value="${esc(size||'')}" placeholder="e.g. S, M, L, XL…"/></td>
    <td><input type="number" class="form-control form-control-sm size-price-inp" min="0" value="${esc(price||'')}" placeholder="0"/></td>
    <td><input type="number" class="form-control form-control-sm size-stock-col" min="0" value="${esc(stock||'')}" placeholder="0"/></td>
    <td><button type="button" class="btn-icon" onclick="window._removeColorSizeRow(this)" style="width:28px;height:28px;font-size:0.8rem;">✕</button></td>
  </tr>`;
  const sizeRows = (cv.sizes && cv.sizes.length ? cv.sizes : []).map(s=>makeRow(s.size, s.price, s.stock)).join('')
    || makeRow('', '', '');
  return `<div class="color-variant-block" data-vid="${esc(cv.id||String(idx))}">
    <div class="color-variant-header">
      <span class="color-variant-title">🎨 Color Variant ${idx+1}</span>
      <button type="button" class="btn-icon remove-color-variant" style="width:28px;height:28px;font-size:0.8rem;" title="Delete this color">✕</button>
    </div>
    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:12px;">
        <div class="form-group">
          <label class="form-label">Color Name <span class="required">*</span></label>
          <input type="text" class="form-control color-name-input" placeholder="e.g. Red, Royal Blue, Black" value="${esc(cv.name||'')}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Sizes &amp; Prices <span class="required">*</span></label>
          <div class="size-price-wrap">
            <table class="size-price-table">
              <thead><tr><th>Size</th><th>Price (₹)</th><th>Stock</th><th></th></tr></thead>
              <tbody class="sizes-tbody" data-dl-id="${_sizeDatalistId(idx)}">${sizeRows}</tbody>
            </table>
            <button type="button" class="btn btn-outline btn-sm add-size-row-btn" style="margin-top:8px;" data-dl-id="${_sizeDatalistId(idx)}">+ Add Size</button>
          </div>
        </div>
      </div>
      <div style="width:150px;flex-shrink:0;">
        <label class="form-label">Color Image</label>
        <div class="img-upload-area color-img-upload" style="min-height:140px;cursor:pointer;position:relative;">
          <input type="file" class="color-img-file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;z-index:2;"/>
          ${cv.image
            ?`<img src="${cv.image}" class="img-preview color-img-preview" style="width:100%;height:130px;object-fit:cover;border-radius:var(--radius-md);"/>
               <p class="img-upload-text" style="margin-top:4px;font-size:0.7rem;">Click to change</p>`
            :`<div class="img-upload-icon">📷</div><p class="img-upload-text">Upload image</p>`}
        </div>
        <input type="hidden" class="color-img-data" value="${esc(cv.image||'')}"/>
      </div>
    </div>
  </div>`;
}

function renderProductModal() {
  const editing   = state.editingId ? DB.getProducts().find(p=>p.id===state.editingId) : null;
  const v         = editing || {};
  const shop      = DB.getShop();
  const curCat    = v.category || getMainCategories()[0] || '';
  const availSizes = getSizesForCategory(curCat);

  let colorVariants = [];
  if (v.colors && v.colors.length) {
    colorVariants = v.colors;
  } else if (v.color || v.image || (v.sizes && v.sizes.length)) {
    colorVariants = [{ id: uid(), name: v.color||'', image: v.image||'', sizes: getProductSizes(v) }];
  } else {
    colorVariants = [{ id: uid(), name: '', image: '', sizes: [] }];
  }

  // Combine configured categories + any already used in products
  const _existingProdCats=[...new Set(DB.getProducts().map(p=>p.category).filter(Boolean))];
  const mainCats=[...new Set([...getMainCategories(),..._existingProdCats])];
  const subCats  = curCat ? [...new Set([...getSubCategories(curCat),...DB.getProducts().filter(p=>p.category===curCat&&p.subcategory).map(p=>p.subcategory)])] : [];

  return `<div class="modal-overlay" id="product-modal-overlay">
    <div class="modal modal-lg animate-slideUp" style="max-width:760px;">
      <div class="modal-header">
        <div>
          <div class="login-role-badge">✦ &nbsp; ${editing?'Edit Product':'Add Product'}</div>
          <div class="modal-title">${editing?esc(editing.name):'New Product'}</div>
        </div>
        <button class="modal-close" data-close-modal="product">✕</button>
      </div>
      <div class="modal-body">
        <!-- Shop Info Banner -->
        <div class="prod-shop-banner">
          🏪 Adding to: <strong>${esc(shop?.name||'Your Shop')}</strong>
          <span class="prod-shop-tag">All fields marked * are required</span>
        </div>
        <form id="product-form">
          <div style="display:flex;flex-direction:column;gap:18px;">

            <!-- Row 1: Product Name -->
            <div class="form-group">
              <label class="form-label">Product Name <span class="required">*</span></label>
              <input type="text" class="form-control" name="name" id="prod-name"
                value="${esc(v.name||'')}" placeholder="e.g. Silk Anarkali Kurta" required/>
            </div>

            <!-- Row 2: Category + Subcategory (free-type OR select from suggestions) -->
            <datalist id="prod-cat-list">${mainCats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
            <datalist id="prod-subcat-list">${subCats.map(s=>`<option value="${esc(s)}">`).join('')}</datalist>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Category <span class="required">*</span></label>
                <input type="text" class="form-control" name="category" id="prod-category-inp"
                  list="prod-cat-list" autocomplete="off" required
                  value="${esc(curCat)}" placeholder="Type or select (e.g. Women, Ethnic Wear…)"/>
                <small class="form-hint">Type a new category or pick an existing one</small>
              </div>
              <div class="form-group">
                <label class="form-label">Subcategory <span class="required">*</span></label>
                <input type="text" class="form-control" name="subcategory" id="prod-subcat-inp"
                  list="prod-subcat-list" autocomplete="off" required
                  value="${esc(v.subcategory||'')}" placeholder="Type or select (e.g. Kurtis, T-Shirts…)"/>
                <small class="form-hint">Type a new subcategory or pick an existing one</small>
              </div>
            </div>

            <!-- Material (always optional) -->
            <div class="form-group">
              <label class="form-label">Material / Type <span class="optional-tag">(Optional)</span></label>
              <input type="text" class="form-control" name="material"
                value="${esc(v.material||'')}" placeholder="e.g. Cotton, Silk, Polyester"/>
            </div>

            <!-- Row 4: Description (Optional) -->
            <div class="form-group">
              <label class="form-label">Description <span class="optional-tag">(Optional)</span></label>
              <textarea class="form-control" name="description" rows="2"
                placeholder="Describe the product — fabric, occasion, style, care instructions…"
                style="resize:vertical;">${esc(v.description||'')}</textarea>
            </div>

            <!-- Color Variants -->
            <div>
              <div style="font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-medium);margin-bottom:12px;">
                🎨 Color Variants &amp; Images <span class="required">*</span>
                <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:0.74rem;color:var(--text-light);margin-left:8px;">(at least 1 color with 1 image required)</span>
              </div>
              <div id="color-variants-wrap" style="display:flex;flex-direction:column;gap:16px;">
                ${colorVariants.map((cv,i)=>renderColorVariantBlock(cv,i,availSizes)).join('')}
              </div>
              <button type="button" id="add-color-variant-btn" class="btn btn-outline btn-sm" style="margin-top:12px;">
                + Add Another Color
              </button>
            </div>

          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="product">Cancel</button>
        <button class="btn btn-gold" id="save-product-btn">✦ &nbsp; ${editing?'Save Changes':'Add Product'}</button>
      </div>
    </div>
  </div>`;
}
function renderStockModal(pid) {
  const p=DB.getProducts().find(pr=>pr.id===pid); if(!p) return '';
  return `<div class="modal-overlay" id="stock-modal-overlay">
    <div class="modal animate-slideUp" style="max-width:380px;">
      <div class="modal-header"><div class="modal-title">Update Stock</div>
        <button class="modal-close" data-close-modal="stock">✕</button></div>
      <div class="modal-body">
        <p style="margin-bottom:16px;color:var(--text-medium);"><strong>${esc(p.name)}</strong><br/>
          <span style="font-size:0.8rem;color:var(--text-light);">Current: ${p.quantity} units</span></p>
        <div class="form-group"><label class="form-label">New Quantity</label>
          <input type="number" class="form-control" id="stock-qty-input" value="${p.quantity}" min="0"/></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="stock">Cancel</button>
        <button class="btn btn-gold" id="save-stock-btn" data-pid="${esc(p.id)}">Update</button>
      </div>
    </div>
  </div>`;
}

function renderAdminCategories() {
  const prods = DB.getProducts();
  // Auto-detect categories from products only
  const autoCats = [...new Set(prods.map(p=>p.category).filter(Boolean))].sort();
  const catIcons = { 'Men':'👔','Women':'👗','Kids':'🧒','Newborn':'🍼' };
  function catIcon(c) { return catIcons[c] || '🏷️'; }

  const sections = autoCats.map(cat => {
    const catProds   = prods.filter(p => p.category === cat);
    const subCatList = [...new Set(catProds.map(p=>p.subcategory).filter(Boolean))];
    const totalCount = catProds.length;
    const subRows = subCatList.map(sub => {
      const cnt = catProds.filter(p => p.subcategory === sub).length;
      return `<div class="cat-sub-row">
        <span class="cat-sub-name">${esc(sub)}</span>
        <span class="cat-sub-count">${cnt} product${cnt!==1?'s':''}</span>
      </div>`;
    }).join('');
    return `<div class="cat-accordion open">
      <div class="cat-accordion-header" style="cursor:default;">
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="font-size:2rem;">${catIcon(cat)}</span>
          <div>
            <div class="cat-accordion-title">${esc(cat)}</div>
            <div class="cat-accordion-meta">${subCatList.length} subcategories · ${totalCount} product${totalCount!==1?'s':''}</div>
          </div>
        </div>
        <span class="td-badge badge-green">Auto-detected</span>
      </div>
      <div class="cat-accordion-body">
        ${subRows||`<div style="padding:12px 24px;color:var(--text-light);font-size:0.84rem;">No subcategories yet.</div>`}
      </div>
    </div>`;
  }).join('');

  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Categories</div>
    <div class="dash-page-subtitle">Categories are auto-detected from your product data. Manage products to change categories.</div>
    ${autoCats.length===0
      ? `<div class="empty-state"><div class="empty-state-icon">◻</div><div class="empty-state-title">No categories yet</div><p class="text-muted">Add products with categories — they will appear here automatically.</p></div>`
      : `<div class="cat-accordion-wrap">${sections}</div>`}
  </div>`;
}

function renderAdminEmployees() {
  const emps=DB.getEmployees();
  const allOrders=DB.getOrders();
  const allAttendance=DB.getAttendance();
  const q=state.searchQuery.toLowerCase();
  const filtered=emps.filter(e=>!q||e.name.toLowerCase().includes(q)||(e.phone||'').includes(q));
  const perfPeriod = state.empPerfPeriod || 'all';
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0,10);
  const weekAgo = now - 7*86400000;
  const monthAgo = now - 30*86400000;
  const periodMs = { today: 86400000, week: 7*86400000, month: 30*86400000 };
  const orders = perfPeriod === 'all' ? allOrders : allOrders.filter(o => now - (o.date||0) <= periodMs[perfPeriod]);
  // Build performance maps: empId → {handled, completed}
  const empStats={};
  orders.forEach(o=>{
    if(o.employeeId){
      if(!empStats[o.employeeId]) empStats[o.employeeId]={handled:0,completed:0};
      empStats[o.employeeId].handled++;
      if(o.status==='ready'||o.status==='completed') empStats[o.employeeId].completed++;
    }
  });
  // Build attendance maps: empId → {today, week, month, total}
  // Source 1: order-based attendance records
  const attStats={};
  allAttendance.forEach(a=>{
    if(!a.employeeId) return;
    if(!attStats[a.employeeId]) attStats[a.employeeId]={today:0,week:0,month:0,total:0};
    attStats[a.employeeId].total++;
    if(a.date===todayStr) attStats[a.employeeId].today++;
    if(a.ts && a.ts>=weekAgo) attStats[a.employeeId].week++;
    if(a.ts && a.ts>=monthAgo) attStats[a.employeeId].month++;
  });
  // Source 2: customers who entered employee name in "Attended By" field during login/register
  DB.getCustomers().forEach(c=>{
    if(!c.attendedBy) return;
    const emp=emps.find(e=>e.name.trim().toLowerCase()===c.attendedBy.trim().toLowerCase());
    if(!emp) return;
    if(!attStats[emp.id]) attStats[emp.id]={today:0,week:0,month:0,total:0};
    attStats[emp.id].total++;
    if(c.attendedDate===todayStr) attStats[emp.id].today++;
    if(c.attendedDate){
      const ts=new Date(c.attendedDate).getTime();
      if(ts>=weekAgo) attStats[emp.id].week++;
      if(ts>=monthAgo) attStats[emp.id].month++;
    }
  });
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Team Members</div>
    <div class="dash-page-subtitle">Manage staff &amp; track performance</div>

    <div class="dash-toolbar">
      <div class="dash-search" style="flex:1;"><span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search employees…" id="emp-search" value="${esc(state.searchQuery)}"/></div>
      <button class="btn btn-gold" id="add-emp-btn">+ Add Employee</button>
    </div>
    ${filtered.length===0?`<div class="empty-state"><div class="empty-state-icon">◉</div><div class="empty-state-title">No employees added</div></div>`:
    `<div class="table-wrap" style="overflow-x:auto;"><table>
      <thead><tr>
        <th>Employee Name</th><th>Phone Number</th><th>Join Date</th>
        <th>Today Handled</th><th>This Week Handled</th><th>This Month Handled</th>
        <th>Salary</th><th>Actions</th>
      </tr></thead>
      <tbody>${filtered.map(e=>{
        const att=attStats[e.id]||{today:0,week:0,month:0,total:0};
        return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);border:1px solid var(--gold-light);display:flex;align-items:center;justify-content:center;">${e.gender==='Female'?'👩':'👨'}</div>
          <div><div class="td-name">${esc(e.name)}</div>
            <div style="font-size:0.72rem;color:var(--text-light);">${esc(e.username)}</div></div></div></td>
        <td>${esc(e.phone||'—')}</td>
        <td style="font-size:0.82rem;color:var(--text-light);">${e.joinDate?fmtDate(e.joinDate):'—'}</td>
        <td style="text-align:center;"><span style="font-weight:700;font-size:1.1rem;color:${att.today>0?'var(--gold-dark)':'var(--text-light)'};">${att.today}</span></td>
        <td style="text-align:center;"><span style="font-weight:700;font-size:1.1rem;color:${att.week>0?'var(--gold-dark)':'var(--text-light)'};">${att.week}</span></td>
        <td style="text-align:center;"><span style="font-weight:700;font-size:1.1rem;color:${att.month>0?'var(--gold-dark)':'var(--text-light)'};">${att.month}</span></td>
        <td>
          ${e.salary
            ? `<span style="font-family:var(--font-serif);font-weight:700;color:var(--gold-dark);font-size:1rem;">${fmt(e.salary)}</span>
               <div style="font-size:0.7rem;color:var(--text-light);">per month</div>`
            : `<span style="color:var(--text-xlight);font-size:0.82rem;">Not set</span>`}
        </td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-gold btn-sm" data-salary-emp="${esc(e.id)}">💰 Salary</button>
          <button class="btn btn-outline btn-sm" data-edit-emp="${esc(e.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-delete-emp="${esc(e.id)}">Remove</button>
        </div></td></tr>`;}).join('')}
      </tbody></table></div>`}

    ${state.modalOpen==='employee'?renderEmployeeModal():''}
    ${state.modalOpen==='salary'?renderAdminSalaryModal(state.salaryEmpId):''}
  </div>`;
}

/* Attendance log removed per admin cleanup */
function renderAttendanceLog() { return ''; }

function renderAdminSalaryModal(empId) {
  const emp = DB.getEmployees().find(e=>e.id===empId); if(!emp) return '';
  const history = emp.salaryHistory || [];
  const today = new Date().toISOString().slice(0,10);
  const startSal = history.length ? history[0].amount : 0;
  const curSal = emp.salary || 0;
  const totalInc = curSal - startSal;
  const totalPct = startSal > 0 ? ((totalInc/startSal)*100).toFixed(1) : 0;

  // Build history rows with calculated % per entry
  const histRows = [...history].reverse().map((h, ri) => {
    const origIdx = history.length - 1 - ri;
    const prev = origIdx > 0 ? history[origIdx - 1].amount : null;
    const pct = prev ? (((h.amount - prev) / prev) * 100).toFixed(1) : null;
    return `<tr>
      <td>${fmtDate(h.date)}</td>
      <td style="font-family:var(--font-serif);font-weight:700;color:var(--gold-dark);">${fmt(h.amount)}</td>
      <td>${pct!==null
        ? `<span class="increment-badge ${+pct>=0?'inc-up':'inc-down'}">
            ${+pct>=0?'▲':'▼'} ${Math.abs(+pct)}%</span>`
        : '<span style="color:var(--text-xlight);font-size:0.78rem;">Starting</span>'}</td>
      <td style="color:var(--text-light);font-size:0.82rem;">${esc(h.note||'—')}</td>
    </tr>`;
  }).join('');

  return `<div class="modal-overlay" id="salary-modal-overlay">
    <div class="modal modal-lg animate-slideUp">
      <div class="modal-header">
        <div>
          <div class="login-role-badge">💰 &nbsp; Salary Management</div>
          <div class="modal-title">${esc(emp.name)}</div>
        </div>
        <button class="modal-close" data-close-modal="salary">✕</button>
      </div>
      <div class="modal-body">
        <div class="grid-4" style="margin-bottom:20px;">
          <div class="stat-card"><div class="stat-icon">🏁</div><div class="stat-info">
            <div class="stat-value">${fmt(startSal)}</div>
            <div class="stat-label">Starting Salary</div></div></div>
          <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-info">
            <div class="stat-value">${fmt(curSal)}</div>
            <div class="stat-label">Current Salary</div></div></div>
          <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-info">
            <div class="stat-value">${fmt(totalInc)}</div>
            <div class="stat-label">Total Increment</div></div></div>
          <div class="stat-card"><div class="stat-icon">🎯</div><div class="stat-info">
            <div class="stat-value" style="color:var(--gold-dark);">${totalPct}%</div>
            <div class="stat-label">% Growth</div></div></div>
        </div>
        <div style="background:var(--cream-2);border:1px solid var(--border-light);border-radius:var(--radius-md);padding:18px;margin-bottom:20px;">
          <div style="font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-medium);margin-bottom:14px;">
            ${emp.salary ? `Update Salary &nbsp;<span style="font-weight:400;color:var(--text-light);">(Current: ${fmt(curSal)})</span>` : 'Set Salary'}
          </div>
          <form id="salary-form">
            <div class="form-row" style="align-items:flex-end;">
              <div class="form-group"><label class="form-label">New Monthly Salary (₹) <span class="required">*</span></label>
                <input type="number" class="form-control" id="new-salary-input" name="newSalary"
                  value="${esc(emp.salary||'')}" min="0" placeholder="e.g. 20000" required
                  data-current="${curSal}"/></div>
              <div class="form-group"><label class="form-label">Increment % <span style="font-size:0.7rem;color:var(--text-light);">(auto-calculated)</span></label>
                <div style="position:relative;">
                  <input type="number" class="form-control" id="increment-pct-input" name="incrementPct"
                    step="0.1" placeholder="e.g. 10"
                    style="padding-right:36px;"
                    ${!curSal?'disabled title="Set a current salary first"':''}/>
                  <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text-light);font-size:0.85rem;">%</span>
                </div>
              </div>
              <div class="form-group"><label class="form-label">Effective Date</label>
                <input type="date" class="form-control" name="salaryDate" value="${today}"/></div>
            </div>
            <div class="form-group"><label class="form-label">Note / Reason <span class="required">*</span></label>
              <input type="text" class="form-control" name="salaryNote"
                placeholder="e.g. Annual increment, Promotion, Joining salary" required/></div>
          </form>
        </div>
        ${history.length>0?`
        <h4 style="font-family:var(--font-serif);margin-bottom:12px;">Salary History</h4>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Amount</th><th>Increment</th><th>Note</th></tr></thead>
          <tbody>${histRows}</tbody>
        </table></div>`:''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="salary">Cancel</button>
        <button class="btn btn-gold" id="save-salary-btn" data-eid="${esc(emp.id)}">💰 &nbsp; Save Salary</button>
      </div>
    </div>
  </div>`;
}
function renderEmployeeModal() {
  const emp=state.editingId?DB.getEmployees().find(e=>e.id===state.editingId):null, v=emp||{};
  return `<div class="modal-overlay" id="emp-modal-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-header"><div><div class="login-role-badge">◉ &nbsp; ${emp?'Edit Employee':'Add Employee'}</div>
        <div class="modal-title">${emp?esc(emp.name):'New Team Member'}</div></div>
        <button class="modal-close" data-close-modal="employee">✕</button></div>
      <div class="modal-body"><form id="emp-form"><div style="display:flex;flex-direction:column;gap:14px;">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Full Name <span class="required">*</span></label>
            <input type="text" class="form-control" name="name" value="${esc(v.name||'')}" required/></div>
          <div class="form-group"><label class="form-label">Phone <span class="required">*</span></label>
            <input type="tel" class="form-control" name="phone" value="${esc(v.phone||'')}" required/></div>
        </div>
        <div class="form-group"><label class="form-label">Gender <span class="required">*</span></label>
          <div class="radio-group">${['Female','Male','Other'].map(g=>
            `<label class="radio-item"><input type="radio" name="gender" value="${g}"${v.gender===g?' checked':''}/> ${g}</label>`).join('')}</div></div>
        <div class="form-group"><label class="form-label">Address <span class="optional-tag">(Optional)</span></label>
          <textarea class="form-control" name="address">${esc(v.address||'')}</textarea></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Monthly Salary (₹) <span class="required">*</span></label>
            <input type="number" class="form-control" name="salary" value="${esc(v.salary||'')}" min="0" placeholder="e.g. 15000" required/></div>
          <div class="form-group"><label class="form-label">Join Date <span class="required">*</span></label>
            <input type="date" class="form-control" name="joinDate" value="${v.joinDate?new Date(v.joinDate).toISOString().slice(0,10):''}" required/></div>
        </div>
        <div class="form-group"><label class="form-label">Employment Type <span class="required">*</span></label>
          <div class="radio-group">${['Full-Time','Part-Time'].map(t=>
            `<label class="radio-item"><input type="radio" name="employmentType" value="${t}"${(v.employmentType||'Full-Time')===t?' checked':''}/> ${t}</label>`).join('')}</div></div>
        ${emp?`<div class="form-group"><label class="form-label">Salary Increment Note <span class="optional-tag">(Optional)</span></label>
          <input type="text" class="form-control" name="salaryNote" placeholder="e.g. Annual increment, Promotion"/></div>`:''}
        ${!emp?`<div style="background:var(--cream-2);border-radius:var(--radius-md);padding:14px;border:1px solid var(--border-light);">
          <div style="font-size:0.78rem;color:var(--text-medium);font-weight:600;margin-bottom:12px;">Login Credentials</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Username <span class="required">*</span></label>
              <input type="text" class="form-control" name="username" required autocomplete="new-password"/></div>
            <div class="form-group"><label class="form-label">Password <span class="required">*</span></label>
              <div class="password-input-wrap">
                <input type="password" class="form-control" name="password" id="emp-pwd" required autocomplete="new-password"/>
                <button type="button" class="password-toggle-btn" data-target="emp-pwd">👁</button>
              </div></div>
          </div></div>`:''}
      </div></form></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="employee">Cancel</button>
        <button class="btn btn-gold" id="save-emp-btn">✦ &nbsp; ${emp?'Save Changes':'Add Employee'}</button>
      </div>
    </div>
  </div>`;
}

function renderAdminCustomers() {
  const custs=DB.getCustomers();
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Customer List</div><div class="dash-page-subtitle">${custs.length} registered customer${custs.length!==1?'s':''}</div>
    ${custs.length===0?`<div class="empty-state"><div class="empty-state-icon">◎</div><div class="empty-state-title">No customers yet</div></div>`:
    `<div class="table-wrap"><table>
      <thead><tr><th>Customer Name</th><th>WhatsApp Number</th><th>Gender</th><th>Preference Location</th><th>Size</th><th>Attended By</th></tr></thead>
      <tbody>${custs.map(c=>`<tr>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);display:flex;align-items:center;justify-content:center;">${c.gender==='Female'?'👩':'👨'}</div>
          <div class="td-name">${esc(c.name)}</div></div></td>
        <td>${esc(c.whatsapp||'—')}</td>
        <td>${esc(c.gender||'—')}</td>
        <td style="font-size:0.82rem;color:var(--text-medium);">${esc(c.address||'—')}</td>
        <td><span class="td-badge badge-gold">${esc(c.size||'—')}</span></td>
        <td>${c.attendedBy?`<div style="font-size:0.82rem;"><span style="font-weight:600;color:var(--gold-dark);">${esc(c.attendedBy)}</span>${c.attendedDate?`<div style="font-size:0.7rem;color:var(--text-xlight);">${esc(c.attendedDate)}</div>`:''}</div>`:'<span style="color:var(--text-xlight);">—</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`}
  </div>`;
}

function renderAdminOrders() {
  const ords=DB.getOrders().slice().reverse(), custs=DB.getCustomers();
  const statusColors={
    'pending':'#4caf50','order-placed':'#4caf50',
    'accepted':'#3b82f6','processing':'#3b82f6','packing':'#7b1fa2',
    'payment-pending':'#f59e0b','payment-completed':'#059669',
    'bill-generated':'#7c3aed','ready':'#10b981','completed':'#6b7280'
  };
  const pmIcon={GPay:'📱',PhonePe:'💜',Cash:'💵'};
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Orders</div><div class="dash-page-subtitle">${ords.length} order${ords.length!==1?'s':''} total</div>
    ${ords.length===0?`<div class="empty-state"><div class="empty-state-icon">◊</div><div class="empty-state-title">No orders yet</div></div>`:
    `<div class="table-wrap"><table>
      <thead><tr><th>Order ID</th><th>Customer</th><th>Date</th><th>Items</th><th>Payment</th><th>Handled By</th><th>Total</th><th>Action</th></tr></thead>
      <tbody>${ords.map(o=>{
        const c=custs.find(x=>x.id===o.customerId);
        const custName=o.customerName||c?.name||'Guest';
        return `<tr>
          <td><code style="font-size:0.75rem;background:var(--cream-2);padding:2px 8px;border-radius:4px;">#${o.id.slice(-6).toUpperCase()}</code></td>
          <td class="td-name">${esc(custName)}</td>
          <td style="font-size:0.82rem;color:var(--text-light);">${fmtDate(o.date)}</td>
          <td>${(o.items||[]).length} item${(o.items||[]).length!==1?'s':''}</td>
          <td>${pmIcon[o.paymentMode]||'💵'} ${esc(o.paymentMode||'Cash')}</td>
          <td style="font-size:0.8rem;color:var(--text-medium);">${esc(o.employeeName||'—')}</td>
          <td style="font-family:var(--font-serif);font-weight:700;color:var(--gold-dark);">${fmt(o.total)}</td>
          <td><button class="btn btn-outline btn-sm" data-view-order="${esc(o.id)}">View Bill</button></td>
        </tr>`;}).join('')}
      </tbody></table></div>`}
    ${state.modalOpen==='order-bill'?renderOrderBillModal(state.viewingOrderId):''}
  </div>`;
}
function renderOrderBillModal(orderId) {
  const order=DB.getOrders().find(o=>o.id===orderId); if(!order) return '';
  const shop=DB.getShop(), cust=DB.getCustomers().find(c=>c.id===order.customerId);
  return `<div class="modal-overlay" id="order-bill-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-header"><div class="modal-title">Order Receipt</div>
        <button class="modal-close" data-close-modal="order-bill">✕</button></div>
      <div class="modal-body">${renderBillHTML(order,shop,cust)}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="order-bill">Close</button>
        <button class="btn btn-gold" onclick="window.print()">Print Bill</button>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   14b. ADMIN ANALYTICS
═══════════════════════════════════════════════════ */
function getAnalyticsData(period) {
  const orders = DB.getOrders();
  const now = new Date();
  if (period === 'weekly') {
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7); weeks.push(d);
    }
    const labels = weeks.map((d,i) => i===weeks.length-1?'This Week':'Wk '+fmtDate(d));
    const revenue = weeks.map((d,i) => {
      const s=d.getTime(), e=i<weeks.length-1?weeks[i+1].getTime():Date.now();
      return orders.filter(o=>o.date>=s&&o.date<e).reduce((acc,o)=>acc+(+o.total||0),0);
    });
    const ords = weeks.map((d,i) => {
      const s=d.getTime(), e=i<weeks.length-1?weeks[i+1].getTime():Date.now();
      return orders.filter(o=>o.date>=s&&o.date<e).length;
    });
    return { labels, revenue, orders: ords };
  }
  if (period === 'yearly') {
    const years = [now.getFullYear()-2, now.getFullYear()-1, now.getFullYear()];
    const labels = years.map(y => String(y));
    const revenue = years.map(y => orders.filter(o=>new Date(o.date).getFullYear()===y).reduce((s,o)=>s+(+o.total||0),0));
    const ords = years.map(y => orders.filter(o=>new Date(o.date).getFullYear()===y).length);
    return { labels, revenue, orders: ords };
  }
  // Default: monthly (last 6 months)
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth()-i, 1));
  const labels = months.map(d => d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}));
  const revenue = months.map((d,i) => {
    const s=d.getTime(), e=i<months.length-1?months[i+1].getTime():Date.now();
    return orders.filter(o=>o.date>=s&&o.date<e).reduce((acc,o)=>acc+(+o.total||0),0);
  });
  const ords = months.map((d,i) => {
    const s=d.getTime(), e=i<months.length-1?months[i+1].getTime():Date.now();
    return orders.filter(o=>o.date>=s&&o.date<e).length;
  });
  return { labels, revenue, orders: ords };
}

function renderAdminAnalytics() {
  const orders=DB.getOrders(), custs=DB.getCustomers();
  const period = state.analyticsPeriod || 'monthly';
  const totalRev = orders.reduce((s,o)=>s+(+o.total||0),0);
  const now = new Date();
  const monthOrds = orders.filter(o=>{ const d=new Date(o.date); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); });
  const monthRev = monthOrds.reduce((s,o)=>s+(+o.total||0),0);
  const avgOrder = orders.length ? Math.round(totalRev/orders.length) : 0;
  const data = getAnalyticsData(period);
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Shop Analytics</div>
    <div class="dash-page-subtitle">Track your boutique's performance</div>
    <div class="grid-4" style="margin-bottom:28px;">
      ${statCard('◊','Total Revenue',fmt(totalRev),`${orders.length} orders`)}
      ${statCard('📈','This Month',fmt(monthRev),`${monthOrds.length} orders`)}
      ${statCard('◎','Total Customers',custs.length,'registered')}
      ${statCard('◈','Avg Order Value',fmt(avgOrder),'per order')}
    </div>
    <div class="analytics-filter-bar">
      ${['weekly','monthly','yearly'].map(p=>`<button class="analytics-filter-btn${period===p?' active':''}" data-analytics-period="${p}">${p.charAt(0).toUpperCase()+p.slice(1)}</button>`).join('')}
    </div>
    <div class="grid-2" style="margin-bottom:24px;">
      <div class="card">
        <h4 style="font-family:var(--font-serif);margin-bottom:16px;">Revenue Trend</h4>
        <div class="chart-container"><canvas id="chart-revenue"></canvas></div>
      </div>
      <div class="card">
        <h4 style="font-family:var(--font-serif);margin-bottom:16px;">Orders Trend</h4>
        <div class="chart-container"><canvas id="chart-orders"></canvas></div>
      </div>
    </div>
    <div class="card">
      <h4 style="font-family:var(--font-serif);margin-bottom:14px;">Period Summary</h4>
      ${orders.length===0?`<p class="text-muted">No orders yet.</p>`:`
      <div class="table-wrap"><table>
        <thead><tr><th>Period</th><th>Orders</th><th>Revenue</th></tr></thead>
        <tbody>${data.labels.map((lbl,i)=>`<tr>
          <td>${lbl}</td>
          <td>${data.orders[i]}</td>
          <td style="font-family:var(--font-serif);font-weight:600;color:var(--gold-dark);">${fmt(data.revenue[i])}</td>
        </tr>`).join('')}</tbody>
      </table></div>`}
    </div>
    ${(()=>{
      const emps=DB.getEmployees();
      const empMap={};
      orders.forEach(o=>{if(o.employeeId){if(!empMap[o.employeeId])empMap[o.employeeId]={count:0,rev:0,name:o.employeeName};empMap[o.employeeId].count++;empMap[o.employeeId].rev+=+o.total||0;}});
      const empRows=Object.entries(empMap).sort((a,b)=>b[1].count-a[1].count).slice(0,10);
      if(!empRows.length) return '';
      const maxCount=empRows[0][1].count;
      return `<div class="card" style="margin-top:20px;">
        <h4 style="font-family:var(--font-serif);margin-bottom:14px;">🏆 Employee Performance</h4>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${empRows.map(([eid,stat],idx)=>{
            const e=emps.find(x=>x.id===eid);
            const pct=Math.round((stat.count/maxCount)*100);
            return `<div style="display:flex;align-items:center;gap:12px;">
              <div style="width:24px;text-align:center;font-weight:700;color:${idx===0?'#f59e0b':idx===1?'#9ca3af':idx===2?'#cd7f32':'var(--text-light)'};">${idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':idx+1}</div>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-weight:600;">${esc(e?.name||stat.name||'Employee')}</span>
                  <span style="font-size:0.8rem;color:var(--text-medium);">${stat.count} orders · ${fmt(stat.rev)}</span>
                </div>
                <div style="height:8px;background:var(--cream-2);border-radius:4px;overflow:hidden;">
                  <div style="height:8px;background:${idx===0?'var(--gold)':'var(--gold-light)'};border-radius:4px;width:${pct}%;transition:width 0.6s;"></div>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    })()}
    ${(()=>{
      // Payment mode breakdown
      const pmCounts={Cash:0,GPay:0,PhonePe:0};
      orders.forEach(o=>{const pm=o.paymentMode||'Cash';if(pmCounts[pm]!==undefined)pmCounts[pm]++;else pmCounts[pm]=1;});
      const total=Object.values(pmCounts).reduce((a,b)=>a+b,0)||1;
      return `<div class="card" style="margin-top:20px;">
        <h4 style="font-family:var(--font-serif);margin-bottom:14px;">💳 Payment Methods</h4>
        <div class="grid-3">
          ${Object.entries(pmCounts).map(([pm,cnt])=>`<div class="stat-card">
            <div class="stat-icon">${pm==='GPay'?'📱':pm==='PhonePe'?'💜':'💵'}</div>
            <div class="stat-info"><div class="stat-value">${cnt}</div>
              <div class="stat-label">${pm}</div>
              <div class="stat-badge">${Math.round(cnt/total*100)}%</div>
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    })()}
  </div>`;
}

/* ═══════════════════════════════════════════════════
   15. EMPLOYEE DASHBOARD
═══════════════════════════════════════════════════ */
function renderEmpOrderCard(o) {
  const custs = DB.getCustomers();
  const cust = custs.find(c=>c.id===o.customerId);
  const custName = cust?.name || o.customerName || 'Guest';
  const total = o.total || o.items?.reduce((s,i)=>s+i.qty*i.price,0) || 0;
  const session = DB.getSession();
  const isPending = o.status==='pending';
  return `
  <div class="emp-order-card ${isPending?'pending':'accepted'}">
    <div class="emp-order-top">
      <div>
        <div class="emp-order-id">#${o.id.slice(-6).toUpperCase()}</div>
        <div class="emp-order-customer">👤 ${esc(custName)}</div>
      </div>
      <div style="text-align:right;">
        <div class="emp-order-total">${fmt(total)}</div>
        <div class="emp-order-payment ${(o.paymentMode||'cash').toLowerCase()}">
          ${o.paymentMode==='GPay'?'📱 GPay':o.paymentMode==='PhonePe'?'💜 PhonePe':'💵 Cash'}
        </div>
      </div>
    </div>
    <div class="emp-order-items">
      ${(o.items||[]).map(i=>`<div class="emp-order-item">• ${esc(i.name)}${i.size?' ('+esc(i.size)+')':''} × ${i.qty}</div>`).join('')}
    </div>
    ${isPending ? `
    <div class="emp-order-actions">
      <button class="emp-accept-btn btn btn-gold btn-sm" data-oid="${esc(o.id)}" data-time="0">✔ Accept Order</button>
    </div>` : `
    <div class="emp-order-accepted">
      ✅ Accepted · By: ${esc(o.employeeName||'—')}
      <button class="btn btn-sm btn-gold" data-mark-ready="${o.id}" style="margin-left:8px;">Mark Ready</button>
    </div>`}
  </div>`;
}

function renderEmpOrdersNotification() {
  const pendingOrders = DB.getOrders().filter(o => o.status === 'pending');
  const acceptedOrders = DB.getOrders().filter(o => o.status === 'accepted');
  if (!pendingOrders.length && !acceptedOrders.length) return '';
  return `
  <div class="emp-orders-panel">
    ${pendingOrders.length ? `<div class="emp-orders-header new-orders-header">
      🔔 ${pendingOrders.length} New Order${pendingOrders.length>1?'s':''} Waiting!
    </div>
    <div class="emp-orders-list">
      ${pendingOrders.map(o => renderEmpOrderCard(o)).join('')}
    </div>` : ''}
    ${acceptedOrders.length ? `<div class="emp-orders-header accepted-header" style="${pendingOrders.length?'border-top:none;':''}">
      ⏳ ${acceptedOrders.length} Order${acceptedOrders.length>1?'s':''} Being Packed
    </div>
    <div class="emp-orders-list" style="border-color:#81c784;">
      ${acceptedOrders.map(o => renderEmpOrderCard(o)).join('')}
    </div>` : ''}
  </div>`;
}

function renderEmployeeDash() {
  const session=DB.getSession(), shop=DB.getShop();
  const allOrders=DB.getOrders();
  const pendingOrders=allOrders.filter(o=>o.status==='pending'||!o.status);
  const todayStr=new Date().toISOString().slice(0,10);
  // Stats for this employee
  const myOrders=allOrders.filter(o=>o.employeeId===session?.id);
  const myTodayCompleted=myOrders.filter(o=>(o.status==='ready'||o.status==='completed')&&new Date(o.date||o.acceptedAt||0).toISOString().slice(0,10)===todayStr).length;
  // Customers added today (all shop customers with addedDate today)
  const customersAddedToday=DB.getCustomers().filter(c=>{
    const d=c.addedDate||c.registeredAt||0;
    return d && new Date(d).toISOString().slice(0,10)===todayStr;
  }).length;
  const myTotalHandled=new Set(myOrders.filter(o=>o.customerId).map(o=>o.customerId)).size;

  const mainView = state.subRoute==='stock'     ? renderEmpStock()
                 : state.subRoute==='salary'    ? renderEmpSalary()
                 : state.subRoute==='categories'? renderEmpCategories()
                 : renderEmpProducts();
  return `<div>${renderAppHeader({ shopName:shop?.name, userName:session?.name })}
    <!-- Employee stats bar — orders attended today only -->
    <div style="background:var(--white);border-bottom:1px solid var(--border-light);padding:10px 20px;display:flex;gap:20px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;">
        <span style="font-size:1.1rem;">✅</span>
        <span style="color:var(--text-medium);">Orders Attended Today:</span>
        <strong style="color:var(--gold-dark);">${myTodayCompleted}</strong>
      </div>
    </div>
    <div class="dash-layout">${renderSidebar('employee')}
      <main class="dash-main">${mainView}</main>
    </div></div>`;
}
function renderEmpOrderNotifications() {
  const orders = DB.getOrders().filter(o=>o.status==='pending'||!o.status).slice().reverse();
  if(!orders.length) return `<div style="text-align:center;padding:48px;color:var(--text-light);">✓ No pending orders right now</div>`;
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">🔔 Pending Orders</div>
    <div class="dash-page-subtitle">${orders.length} order${orders.length!==1?'s':''} waiting</div>
    <div style="display:flex;flex-direction:column;gap:16px;margin-top:16px;">
    ${orders.map(o=>{
      const cust=DB.getCustomers().find(c=>c.id===o.customerId);
      const custName=o.guestName||cust?.name||'Walk-in Customer';
      const payIcon=o.paymentMode==='GPay'||o.paymentMode==='PhonePe'?'📱':'💵';
      return `<div class="emp-order-card">
        <div class="emp-order-header">
          <span class="emp-order-id">#${o.id.slice(-6).toUpperCase()}</span>
          <span class="emp-order-customer">👤 ${esc(custName)}</span>
          <span class="emp-order-pay pay-${(o.paymentMode||'cash').toLowerCase()}">${payIcon} ${o.paymentMode||'Cash'}</span>
          <span class="emp-order-total">${fmt(o.total)}</span>
        </div>
        <div class="emp-order-items">
          ${(o.items||[]).map(i=>`<div class="emp-order-item">
            ${i.image?`<img src="${i.image}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0;">`:``}
            <span>${esc(i.name)}${i.size?` — <strong>Size: ${esc(i.size)}</strong>`:''} × ${i.qty} = ${fmt(i.qty*i.price)}</span>
          </div>`).join('')}
        </div>
        ${o.status==='accepted'?
          `<div class="emp-order-accepted">✅ Accepted — Being packed (by ${esc(o.employeeName||'you')})</div>`:
          `<div class="emp-order-actions">
            <button class="emp-accept-btn btn btn-gold btn-sm" data-oid="${esc(o.id)}" data-time="0">✔ Accept Order</button>
          </div>`
        }
      </div>`;
    }).join('')}
    </div>
  </div>`;
}

function renderEmpProducts() {
  const q=state.searchQuery.toLowerCase();
  const allProds=DB.getProducts();
  const activeCat=state.productCategoryTab||'all';
  const prods=allProds.filter(p=>{
    const matchQ=!q||p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q);
    const matchCat=activeCat==='all'||p.category===activeCat;
    return matchQ&&matchCat;
  });
  const catIcons={'Men':'👔','Women':'👗','Kids':'🧒','Newborn':'🍼'};
  // Dynamic categories: combine getMainCategories + any extra cats already in products
  const allProdCats=[...new Set(allProds.map(p=>p.category).filter(Boolean))];
  const empCatList=[...new Set([...getMainCategories(),...allProdCats])];
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Product Catalogue</div><div class="dash-page-subtitle">Manage clothing stock</div>
    <div class="dash-toolbar">
      <div class="dash-search" style="flex:1;"><span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search products…" id="product-search" value="${esc(state.searchQuery)}"/></div>
      <button class="btn btn-gold" id="add-product-btn">+ Add Product</button>
    </div>
    <!-- Category Tabs — dynamic from product data + configured categories -->
    <div class="prod-cat-tabs">
      <button class="prod-cat-tab${activeCat==='all'?' active':''}" data-prod-cat="all">
        ✦ All <span class="prod-cat-count">${allProds.length}</span>
      </button>
      ${empCatList.map(c=>`<button class="prod-cat-tab${activeCat===c?' active':''}" data-prod-cat="${esc(c)}">
        ${catIcons[c]||'👕'} ${esc(c)} <span class="prod-cat-count">${allProds.filter(p=>p.category===c).length}</span>
      </button>`).join('')}
    </div>
    ${prods.length===0
      ?`<div class="empty-state"><div class="empty-state-icon">${catIcons[activeCat]||'👗'}</div>
          <div class="empty-state-title">No ${activeCat==='all'?'products':activeCat+' products'} found</div>
          <button class="btn btn-gold" id="add-product-btn" style="margin-top:16px;">+ Add Product</button>
        </div>`
      :`<div class="grid-3">${prods.map(renderProductCard).join('')}</div>`}
    ${state.modalOpen==='product'?renderProductModal():''}
    ${state.modalOpen==='stock'?renderStockModal(state.stockProductId):''}
  </div>`;
}
function renderEmpCategories() {
  const prods = DB.getProducts();
  const openCat = state.openCategoryAccordion || null;
  const catIcons = {'Men':'👔','Women':'👗','Kids':'🧒','Newborn':'🍼'};
  function catIcon(c) { return catIcons[c] || '🏷️'; }
  const mainCats = getMainCategories();

  const sections = mainCats.map(cat => {
    const catProds   = prods.filter(p => p.category === cat);
    const subCatList = getSubCategories(cat);
    const isOpen     = openCat === cat;
    const totalCount = catProds.length;

    const subRows = subCatList.map(sub => {
      const cnt = catProds.filter(p => p.subcategory === sub).length;
      return `<div class="cat-sub-row">
        <span class="cat-sub-name">${esc(sub)}</span>
        <span class="cat-sub-count ${cnt===0?'empty':''}">${cnt} product${cnt!==1?'s':''}</span>
        <button class="btn-icon btn-danger-icon" data-delete-subcat="${esc(sub)}" data-subcat-parent="${esc(cat)}" title="Delete subcategory">✕</button>
      </div>`;
    }).join('');

    const knownSubs  = new Set(subCatList);
    const otherProds = catProds.filter(p => p.subcategory && !knownSubs.has(p.subcategory));
    const otherRow   = otherProds.length ? `<div class="cat-sub-row">
      <span class="cat-sub-name" style="font-style:italic;color:var(--text-light);">Other / Unassigned</span>
      <span class="cat-sub-count">${otherProds.length} product${otherProds.length!==1?'s':''}</span>
    </div>` : '';

    return `<div class="cat-accordion ${isOpen?'open':''}" data-cat-accordion="${esc(cat)}">
      <div class="cat-accordion-header" data-toggle-cat="${esc(cat)}">
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="font-size:2rem;">${catIcon(cat)}</span>
          <div>
            <div class="cat-accordion-title">${esc(cat)}</div>
            <div class="cat-accordion-meta">${subCatList.length} subcategories · ${totalCount} product${totalCount!==1?'s':''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="cat-accordion-arrow">${isOpen?'▲':'▼'}</span>
          <button class="btn-icon btn-danger-icon" data-delete-maincat="${esc(cat)}" title="Delete category" style="font-size:0.78rem;">✕ Delete</button>
        </div>
      </div>
      ${isOpen ? `<div class="cat-accordion-body">
        ${subRows}
        ${otherRow}
        ${!subCatList.length&&!otherProds.length ? `<div style="padding:12px 24px;color:var(--text-light);font-size:0.84rem;">No subcategories yet. Add one below.</div>` : ''}
        <div class="cat-add-sub-row">
          <input type="text" class="form-control cat-add-sub-input" data-parent-cat="${esc(cat)}" placeholder="Add subcategory (e.g. T-Shirts)" style="flex:1;padding:8px 12px;font-size:0.84rem;"/>
          <button class="btn btn-gold btn-sm cat-add-sub-btn" data-parent-cat="${esc(cat)}">+ Add</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Categories</div>
    <div class="dash-page-subtitle">Add, delete and manage product categories for this shop</div>
    <div class="card" style="padding:20px 24px;max-width:500px;margin-bottom:24px;">
      <div style="font-weight:700;font-size:0.9rem;margin-bottom:12px;">➕ Add New Category</div>
      <form id="add-maincat-form" style="display:flex;gap:10px;">
        <input type="text" class="form-control" name="mainCatName" placeholder="e.g. Accessories, Footwear, Sportswear…" required style="flex:1;"/>
        <button type="submit" class="btn btn-gold">Add</button>
      </form>
    </div>
    <div class="cat-accordion-wrap">
      ${sections.length ? sections : `<div class="empty-state"><div class="empty-state-icon">◻</div><div class="empty-state-title">No categories yet</div><p class="text-muted">Add your first category above.</p></div>`}
    </div>
  </div>`;
}
function renderEmpStock() {
  const prods=DB.getProducts(), low=prods.filter(p=>+p.quantity<=5);
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Stock Management</div><div class="dash-page-subtitle">Monitor and update stock levels</div>
    ${low.length?`<div class="alert alert-warning" style="margin-bottom:20px;">⚠ &nbsp; ${low.length} product${low.length!==1?'s':''} with low or zero stock</div>`:''}
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Category</th><th>Sizes</th><th>Price Range</th><th>Stock</th><th>Update</th></tr></thead>
      <tbody>${prods.map(p=>{const szs=getProductSizes(p);const minP=szs.length?Math.min(...szs.map(s=>+s.price)):+(p.price||0);const maxP=szs.length?Math.max(...szs.map(s=>+s.price)):+(p.price||0);
      return `<tr>
        <td class="td-name">${esc(p.name)}</td><td>${esc(p.category)}</td>
        <td style="font-size:0.78rem;">${szs.map(s=>`<span class="product-tag size-tag-sm" style="margin:1px;">${esc(s.size)}</span>`).join('')||'—'}</td>
        <td style="font-family:var(--font-serif);font-weight:600;color:var(--gold-dark);">${minP===maxP?fmt(minP):fmt(minP)+' – '+fmt(maxP)}</td>
        <td><span class="td-badge ${+p.quantity===0?'badge-red':+p.quantity<=5?'badge-gold':'badge-green'}">${+p.quantity===0?'Out of Stock':p.quantity+' units'}</span></td>
        <td><button class="btn btn-outline btn-sm" data-stock-product="${esc(p.id)}">Update</button></td>
      </tr>`}).join('')}</tbody></table></div>
    ${state.modalOpen==='stock'?renderStockModal(state.stockProductId):''}
  </div>`;
}

function renderEmpSalary() {
  const session=DB.getSession();
  const emp=DB.getEmployees().find(e=>e.id===session?.id);
  if (!emp) return `<div class="animate-fadeIn"><div class="empty-state"><div class="empty-state-icon">💰</div>
    <div class="empty-state-title">No salary data</div>
    <p class="text-muted" style="margin-top:8px;">Contact your admin to set up your salary information.</p>
  </div></div>`;
  const history = emp.salaryHistory || [];
  if (history.length===0 && emp.salary)
    history.push({ date: emp.joinDate||emp.addedDate||Date.now(), amount: emp.salary, note: 'Starting salary' });
  const current = emp.salary || (history.length ? history[history.length-1].amount : 0);
  const start   = history.length ? history[0].amount : 0;
  const totalInc = current - start;
  const totalPct = start > 0 ? ((totalInc / start) * 100).toFixed(1) : 0;
  const raises   = Math.max(0, history.length - 1);
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">My Salary Progress</div>
    <div class="dash-page-subtitle">Your salary growth since joining${emp.joinDate?` · Joined ${fmtDate(emp.joinDate)}`:''}</div>
    <div class="grid-4" style="margin-bottom:28px;">
      ${statCard('🏁','Starting Salary',fmt(start),'on joining')}
      ${statCard('📈','Total Increment',fmt(totalInc),`${raises} raise${raises!==1?'s':''}`)}
      ${statCard('💰','Current Salary',fmt(current),'monthly')}
      ${statCard('🎯','Total % Growth',totalPct+'%',start>0?`from ${fmt(start)}`:'since joining')}
    </div>
    ${history.length===0 ? `<div class="card" style="text-align:center;padding:40px;">
        <p class="text-muted">No salary history yet. Please contact your admin.</p></div>` : `
    <div class="card" style="margin-bottom:24px;">
      <h4 style="font-family:var(--font-serif);margin-bottom:16px;">Salary Growth Chart</h4>
      <div class="chart-container"><canvas id="chart-salary"></canvas></div>
    </div>
    <div class="card">
      <h4 style="font-family:var(--font-serif);margin-bottom:14px;">Salary History</h4>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Amount</th><th>Increment</th><th>Note</th></tr></thead>
        <tbody>${history.map((h,i)=>{
          const prev = i>0?history[i-1].amount:null;
          const pct  = prev?((( h.amount-prev)/prev)*100).toFixed(1):null;
          const amt  = prev?(h.amount-prev):null;
          return `<tr>
            <td>${fmtDate(h.date)}</td>
            <td style="font-family:var(--font-serif);font-weight:600;color:var(--gold-dark);">${fmt(h.amount)}</td>
            <td>${pct!==null
              ? `<div style="display:flex;align-items:center;gap:6px;">
                   <span class="increment-badge ${+pct>=0?'inc-up':'inc-down'}">${+pct>=0?'▲':'▼'} ${Math.abs(+pct)}%</span>
                   <span style="font-size:0.78rem;color:var(--text-light);">+${fmt(amt)}</span>
                 </div>`
              : '<span style="color:var(--text-xlight);font-size:0.78rem;">Starting</span>'}</td>
            <td style="color:var(--text-light);">${esc(h.note||(i===0?'Starting salary':'Increment'))}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`}
  </div>`;
}

/* ═══════════════════════════════════════════════════
   16. CUSTOMER SHOP
═══════════════════════════════════════════════════ */
function renderCustomerOrderHistory() {
  const session = DB.getSession();
  const myOrders = DB.getOrders()
    .filter(o => o.customerId === session?.id)
    .slice().sort((a,b) => b.date - a.date);
  const shop = DB.getShop();
  if (!myOrders.length) return `
    <div class="shop-hero"><div class="shop-hero-content">
      <div class="shop-hero-name gold-text">${esc(shop?.name||'Zara Aura')}</div>
    </div></div>
    <div style="text-align:center;padding:60px 20px;">
      <div style="font-size:3rem;">📦</div>
      <div style="font-size:1.1rem;font-weight:700;margin:12px 0 8px;">No orders yet</div>
      <p class="text-muted">Start shopping to see your order history here!</p>
      <button class="btn btn-gold" id="go-shop-btn" style="margin-top:16px;">Browse Products</button>
    </div>`;
  const statusColor={
    'pending':'#4caf50','order-placed':'#4caf50',
    'accepted':'#1976d2','processing':'#1976d2','packing':'#7b1fa2',
    'payment-pending':'#f59e0b','payment-completed':'#059669',
    'bill-generated':'#7c3aed','ready':'#2e7d32','completed':'#388e3c'
  };
  const statusLabel={
    'pending':'📋 Order Placed','order-placed':'📋 Order Placed',
    'accepted':'⚙️ Processing','processing':'⚙️ Processing','packing':'⚙️ Processing',
    'payment-pending':'💳 Payment Pending','payment-completed':'✅ Payment Completed',
    'bill-generated':'🧾 Bill Generated','ready':'✅ Ready','completed':'✓ Completed'
  };
  return `
    <div class="shop-hero"><div class="shop-hero-content">
      <div class="shop-hero-name gold-text">${esc(shop?.name||'Zara Aura')}</div>
      <div class="shop-hero-sub">My Order History</div>
    </div></div>
    <div style="padding:16px;max-width:700px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">
      ${myOrders.map(o=>{
        return `<div class="card" style="padding:18px;border-left:4px solid var(--gold-light);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-weight:700;font-size:1rem;">#${o.id.slice(-6).toUpperCase()}</div>
              <div style="font-size:0.8rem;color:var(--text-light);">${fmtDate(o.date)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700;color:var(--gold-dark);">${fmt(o.total)}</div>
            </div>
          </div>
          <div style="margin:10px 0;border-top:1px solid var(--border-light);padding-top:10px;font-size:0.85rem;">
            ${(o.items||[]).map(i=>`<div style="padding:3px 0;">• ${esc(i.name)}${i.size?' ('+esc(i.size)+')':''} × ${i.qty} — ${fmt(i.price*i.qty)}</div>`).join('')}
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:0.8rem;color:var(--text-medium);">
            <span>${o.paymentMode==='Cash'?'💵 Cash':o.paymentMode==='Card'?'💳 Card':'📱 '+(o.paymentMode||'UPI')}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderCustomerShop() {
  if (state.subRoute === 'feedback') return renderCustomerFeedbackPage();
  if (state.subRoute === 'orders') {
    const session=DB.getSession(), shop=DB.getShop();
    const cartCount=state.cart.reduce((s,i)=>s+i.qty,0);
    return `<div>
      <header class="app-header">
        <div class="app-logo"><span class="gold-text">ZARA</span><span class="app-logo-lite">Aura</span></div>
        <div class="header-actions">
          ${firebaseReady?`<span class="live-indicator">● LIVE</span>`:''}
          <div class="cart-btn" id="open-cart-btn">🛍${cartCount>0?`<span class="cart-count">${cartCount}</span>`:''}</div>
          <button class="btn btn-ghost btn-sm" id="logout-btn">Sign Out</button>
        </div>
      </header>
      <div class="cust-bottom-nav">
        <button class="cust-nav-btn" data-cust-nav="products">🛍 Shop</button>
        <button class="cust-nav-btn active" data-cust-nav="orders">📦 My Orders</button>
        <button class="cust-nav-btn" data-cust-nav="feedback">⭐ Feedback</button>
      </div>
      ${renderCustomerOrderHistory()}
    </div>`;
  }
  const shop=DB.getShop(), session=DB.getSession();
  const cust=DB.getCustomers().find(c=>c.id===session?.id);
  const prods=DB.getProducts().filter(p=>+p.quantity>0);
  const activeOrders=DB.getOrders().filter(o=>o.customerId===session?.id&&!['completed','cancelled'].includes(o.status));
  const cats=['all',...new Set(prods.map(p=>p.category).filter(Boolean))];
  const _catIconMap={'Men':'👔','Women':'👗','Kids':'🧒','Newborn':'🍼','Accessories':'👜','Footwear':'👟','Sports':'⚽','Ethnic':'🥻','Western':'👔'};
  function dynCatIcon(c){return _catIconMap[c]||'👕';}
  const af=state.activeFilter||'all', q=(state.searchQuery||'').toLowerCase();
  const asf = state.activeSubFilter || 'all';
  let filtered=prods.filter(p=>(af==='all'||p.category===af)&&(asf==='all'||p.subcategory===asf));
  if(q) filtered=filtered.filter(p=>p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)||(p.color||'').toLowerCase().includes(q));
  // Recommendations: based on subcategory context when filtering
  const recPool = af==='all' ? prods : prods.filter(p=>p.category===af&&(asf==='all'||p.subcategory===asf));
  const recs = cust ? getRecommendations(recPool, cust, asf!=='all'?asf:null).slice(0,6) : [];
  const recIds = new Set(recs.map(p=>p.id));
  // Non-recommended available products (shown below recs)
  const available = filtered.filter(p=>!recIds.has(p.id));
  const cartCount=state.cart.reduce((s,i)=>s+i.qty,0);
  const activeBanner = '';
  return `<div>
    <header class="app-header">
      <div class="app-logo"><span class="gold-text">ZARA</span><span class="app-logo-lite">Aura</span></div>
      <div class="header-actions">
        ${firebaseReady?`<span class="live-indicator" title="Live sync">● LIVE</span>`:''}
        <div class="dash-search" style="min-width:190px;"><span class="dash-search-icon">⌕</span>
          <input type="text" placeholder="Search…" id="shop-search" value="${esc(state.searchQuery)}" style="padding:8px 14px 8px 34px;border-radius:20px;"/></div>
        <div class="cart-btn" id="open-cart-btn">🛍${cartCount>0?`<span class="cart-count">${cartCount}</span>`:''}</div>
        <button class="btn btn-ghost btn-sm" id="logout-btn">Sign Out</button>
      </div>
    </header>
    ${activeBanner}
    <!-- Bottom Navigation -->
    <div class="cust-bottom-nav">
      <button class="cust-nav-btn${state.subRoute!=='orders'&&state.subRoute!=='feedback'?' active':''}" data-cust-nav="products">🛍 Shop</button>
      <button class="cust-nav-btn${state.subRoute==='orders'?' active':''}" data-cust-nav="orders">📦 Orders${activeOrders.length?`<span class="cart-count" style="position:static;transform:none;margin-left:4px;">${activeOrders.length}</span>`:''}</button>
      <button class="cust-nav-btn${state.subRoute==='feedback'?' active':''}" data-cust-nav="feedback">⭐ Feedback</button>
    </div>
    <div class="shop-hero"><div class="shop-hero-content">
      ${cust?`<div class="shop-hero-greeting">✦ &nbsp; Welcome back, ${esc(cust.name)} &nbsp; ✦</div>`:''}
      <div class="shop-hero-name gold-text">${esc(shop?.name||'Zara Aura')}</div>
      <div class="shop-hero-sub">${esc(shop?.address||'Luxury Fashion Boutique')}</div>
      ${shop?.phone?`<div style="font-size:0.78rem;color:#000;margin-top:4px;">📞 ${esc(shop.phone)}</div>`:''}
    </div></div>
    <!-- Category Sections — fully dynamic from products -->
    <div class="category-nav-bar">
      <button class="cat-nav-btn${af==='all'?' active':''}" data-filter="all">
        <span class="cat-nav-icon">✦</span>
        <span class="cat-nav-label">All</span>
        <span class="cat-nav-count">${prods.length}</span>
      </button>
      ${cats.filter(c=>c!=='all').map(c=>`<button class="cat-nav-btn${af===c?' active':''}" data-filter="${esc(c)}">
        <span class="cat-nav-icon">${dynCatIcon(c)}</span>
        <span class="cat-nav-label">${esc(c)}</span>
        <span class="cat-nav-count">${prods.filter(p=>p.category===c).length}</span>
      </button>`).join('')}
    </div>
    ${(()=>{
      const catIcons={'Men':'👔','Women':'👗','Kids':'🧒','Newborn':'🍼'};

      /* ── ALL view: recommended + category tiles + ALL products ── */
      if(af==='all') {
        const recSection=recs.length?`<div class="shop-section" style="background:var(--cream);border-bottom:1px solid var(--border-light);">
          <div class="shop-section-header"><div>
            <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">✨ Curated For You</div>
            <div class="shop-section-title">Recommended</div></div><div class="shop-section-line"></div></div>
          <div class="shop-grid">${recs.map(renderShopCard).join('')}</div></div>`:'';

        // Dynamic category tiles from products
        const dynCats=[...new Set(prods.map(p=>p.category).filter(Boolean))];
        const catGrid=dynCats.length?`<div class="shop-section">
          <div class="shop-section-header"><div>
            <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:4px;">Browse by Category</div>
            <div class="shop-section-title">Shop Collections</div></div><div class="shop-section-line"></div></div>
          <div class="main-cat-grid">
            ${dynCats.map(cat=>{
              const cnt=prods.filter(p=>p.category===cat).length;
              const subcats=[...new Set(prods.filter(p=>p.category===cat&&p.subcategory).map(p=>p.subcategory))].slice(0,3);
              return `<div class="main-cat-tile" data-filter="${esc(cat)}">
                <div class="main-cat-tile-icon">${catIcons[cat]||'👕'}</div>
                <div class="main-cat-tile-name">${esc(cat)}</div>
                <div class="main-cat-tile-sub">${subcats.length?subcats.map(esc).join(' · '):'Fashion Collection'}</div>
                <div class="main-cat-tile-count">${cnt} item${cnt!==1?'s':''}</div>
              </div>`;
            }).join('')}
          </div></div>`:'';

        // All products grid (below category tiles)
        const recIdsAll = new Set(recs.map(p=>p.id));
        const nonRecProds = prods.filter(p=>!recIdsAll.has(p.id));
        const allProdsSection=prods.length?`<div class="shop-section">
          <div class="shop-section-header"><div>
            <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:4px;">All Products</div>
            <div class="shop-section-title">${prods.length} item${prods.length!==1?'s':''} available</div></div><div class="shop-section-line"></div></div>
          <div class="shop-grid">${nonRecProds.map(renderShopCard).join('')}</div></div>`:'';

        return recSection+catGrid+allProdsSection;
      }

      /* ── CATEGORY selected, NO subcategory: show subcategory grid ── */
      if(af!=='all' && asf==='all') {
        // Subcategories derived entirely from product data (dynamic, no hardcoded list)
        const allSubs = [...new Set(prods.filter(p=>p.category===af&&p.subcategory).map(p=>p.subcategory))];
        const allCatProds    = prods.filter(p=>p.category===af);

        return `<div class="shop-section">
          <div class="shop-section-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <button class="btn btn-ghost btn-sm" data-filter="all" style="margin-right:4px;">← Back</button>
              <span style="font-size:1.4rem;">${catIcons[af]||'👕'}</span>
              <div>
                <div style="font-size:0.7rem;text-transform:uppercase;color:var(--text-light);font-weight:600;">Choose Category</div>
                <div class="shop-section-title">${af} — ${allCatProds.length} item${allCatProds.length!==1?'s':''}</div>
              </div>
            </div><div class="shop-section-line"></div>
            <button class="btn btn-outline btn-sm" data-subfilter="all" data-show-all="${af}" style="white-space:nowrap;">View All →</button>
          </div>
          ${allSubs.length?`<div class="subcat-grid">
            ${allSubs.map(sub=>{
              const cnt=allCatProds.filter(p=>p.subcategory===sub).length;
              return `<div class="subcat-tile" data-subfilter="${esc(sub)}">
                <div class="subcat-tile-icon">${catIcons[af]||'👕'}</div>
                <div class="subcat-tile-name">${esc(sub)}</div>
                <div class="subcat-tile-count">${cnt} item${cnt!==1?'s':''}</div>
              </div>`;
            }).join('')}
          </div>`:''}
        </div>
        ${recs.length?`<div class="shop-section" style="background:var(--cream);">
          <div class="shop-section-header"><div>
            <div style="font-size:0.7rem;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">✨ Recommended for You</div>
            <div class="shop-section-title">${esc(af)} — Best Picks</div></div><div class="shop-section-line"></div></div>
          <div class="shop-grid" data-ml-reco="1">${recs.map(renderShopCard).join('')}</div></div>`:''}
        <div class="shop-section">
          <div class="shop-section-header"><div>
            <div style="font-size:0.7rem;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:4px;">All Products</div>
            <div class="shop-section-title">${esc(af)} — ${allCatProds.length} item${allCatProds.length!==1?'s':''}</div></div><div class="shop-section-line"></div></div>
          ${allCatProds.length?`<div class="shop-grid">${allCatProds.map(renderShopCard).join('')}</div>`:`<div style="padding:24px;text-align:center;color:var(--text-light);">No products yet in this category.</div>`}
        </div>`;
      }

      /* ── SUBCATEGORY selected: show products ── */
      return `<div class="shop-section">
        <div class="shop-section-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-ghost btn-sm" data-subfilter="all" style="white-space:nowrap;">← ${af}</button>
            <div>
              <div style="font-size:0.7rem;text-transform:uppercase;color:var(--text-light);font-weight:600;">${af}</div>
              <div class="shop-section-title">${asf}</div>
            </div>
          </div><div class="shop-section-line"></div>
          <span style="font-size:0.82rem;color:var(--text-light);">${available.length+recs.length} item${available.length+recs.length!==1?'s':''}</span>
        </div>
        ${recs.length?`<div style="margin-bottom:8px;">
          <div style="font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;padding:0 4px 10px;">✨ Recommended for You</div>
          <div class="shop-grid" data-ml-reco="1">${recs.map(renderShopCard).join('')}</div>
        </div>`:''}
        ${available.length>0?`<div>
          ${recs.length?`<div style="font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-light);font-weight:600;padding:0 4px 10px;">All Products</div>`:''}
          <div class="shop-grid">${available.map(renderShopCard).join('')}</div>
        </div>`:''}
        ${available.length===0&&recs.length===0?`<div class="empty-state"><div class="empty-state-icon">✦</div><div class="empty-state-title">No products in ${asf} yet</div></div>`:''}
      </div>`;
    })()}
    ${state.modalOpen==='product-detail'?renderProductDetailModal(state.viewingProductId):''}
    <!-- Floating Feedback Button -->
    <div class="feedback-float-btn" id="float-feedback-btn" title="Share your experience">
      <span class="feedback-float-icon">⭐</span>
      <span class="feedback-float-label">Rate Us</span>
    </div>
  </div>`;
}
function renderShopCard(p) {
  const sizes=getProductSizes(p);
  const minPrice=sizes.length?Math.min(...sizes.map(s=>+s.price)):+(p.price||0);
  const maxPrice=sizes.length?Math.max(...sizes.map(s=>+s.price)):+(p.price||0);
  const priceStr=minPrice===maxPrice?`₹${minPrice.toLocaleString('en-IN')}`:`₹${minPrice.toLocaleString('en-IN')} – ₹${maxPrice.toLocaleString('en-IN')}`;
  const inCart=state.cart.some(i=>i.id===p.id);
  return `<div class="shop-card" data-product-detail="${esc(p.id)}" data-prod-card="${esc(p.id)}">
    <div class="shop-card-img">
      ${p.image?`<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>`:
        `<div class="no-img" style="font-size:2.5rem;">👗</div>`}
      <span class="shop-card-badge">${esc(p.category)}</span>
      ${p._recReason?`<span class="rec-reason-badge">✨ ${esc(p._recReason)}</span>`:''}
    </div>
    <div class="shop-card-body">
      <div class="shop-card-category">${esc(p.category)}${p.subcategory?` · ${esc(p.subcategory)}`:''}${p.material?` · ${esc(p.material)}`:''}</div>
      <div class="shop-card-name">${esc(p.name)}</div>
      ${p.hasSizes && p.sizePrices?.length ? `<div class="size-selector" data-prod-id="${esc(p.id)}">${p.sizePrices.filter(sp=>sp.stock>0).map(sp=>`<button class="size-btn" data-prod="${esc(p.id)}" data-size="${esc(sp.size)}" data-price="${sp.price}" data-stock="${sp.stock}">${esc(sp.size)}</button>`).join('')}</div>` : ''}
      <!-- Color swatches — prominent & visible -->
      ${(()=>{
        const colorList=p.colors&&p.colors.length?p.colors:[{name:p.color||'',image:p.image||''}];
        const shown=colorList.filter(c=>c.name);
        if(!shown.length) return '';
        return `<div class="shop-card-colors">
          <span style="font-size:0.7rem;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Color${shown.length>1?'s':''}:</span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
            ${shown.slice(0,6).map(c=>`<span class="color-swatch-chip" title="${esc(c.name)}" style="background:${esc((c.name||'#ccc').toLowerCase())};" data-product-detail="${esc(p.id)}"></span>`).join('')}
            ${shown.length>6?`<span style="font-size:0.72rem;color:var(--text-light);align-self:center;">+${shown.length-6}</span>`:''}
            ${shown.length===1?`<span style="font-size:0.78rem;color:var(--text-medium);align-self:center;">${esc(shown[0].name)}</span>`:''}
          </div>
        </div>`;
      })()}
      <div class="shop-card-tags" style="flex-wrap:wrap;gap:4px;margin-top:6px;">
        ${sizes.slice(0,4).map(s=>`<span class="product-tag size-tag-sm">${esc(s.size)}</span>`).join('')}
        ${sizes.length>4?`<span class="product-tag" style="color:var(--text-light);">+${sizes.length-4} sizes</span>`:''}
      </div>
      <div class="shop-card-footer">
        <div class="shop-card-price">${priceStr}</div>
        ${+p.quantity<=5&&+p.quantity>0?`<span class="stock-badge low">Only ${p.quantity} left</span>`:+p.quantity===0?`<span class="stock-badge" style="background:#fee;color:#c00;">Out of Stock</span>`:`<span class="stock-badge">In Stock</span>`}
      </div>
      <button class="btn ${inCart?'btn-outline':'btn-gold'} btn-sm btn-block" style="margin-top:12px;" data-product-detail="${esc(p.id)}">
        ${inCart?'✓ View &amp; Size':'Select Size &amp; Add'}</button>
    </div>
  </div>`;
}
function renderProductDetailModal(pid) {
  const p = DB.getProducts().find(pr=>pr.id===pid); if(!p) return '';
  const colors = (p.colors && p.colors.length) ? p.colors : [{ id:'c0', name:p.color||'', image:p.image||'', sizes:getProductSizes(p) }];
  const cidx = Math.min(state.selectedColorIdx||0, colors.length-1);
  const selColor = colors[cidx];
  const sizes = selColor.sizes || [];
  const sidx = Math.min(state.selectedSizeIdx||0, Math.max(0,sizes.length-1));
  const selSize = sizes[sidx] || null;
  const outOfStock = +p.quantity === 0;

  return `<div class="modal-overlay" id="product-detail-overlay">
    <div class="modal modal-lg animate-slideUp">
      <div class="modal-header">
        <div class="modal-title">${esc(p.name)}</div>
        <button class="modal-close" data-close-modal="product-detail">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:24px;flex-wrap:wrap;">
          <!-- Image -->
          <div style="flex:0 0 220px;">
            ${selColor.image
              ?`<div style="position:relative;cursor:zoom-in;" class="zoomable-img-wrap" data-zoom-src="${esc(selColor.image)}" data-zoom-name="${esc(p.name)}">
                  <img src="${esc(selColor.image)}" style="width:100%;border-radius:var(--radius-lg);object-fit:cover;aspect-ratio:3/4;display:block;" id="detail-main-img"/>
                  <div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.5);color:#fff;border-radius:20px;padding:4px 10px;font-size:0.72rem;pointer-events:none;">🔍 Tap to zoom</div>
                </div>`
              :`<div style="width:100%;aspect-ratio:3/4;background:var(--cream-2);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;font-size:4rem;">👗</div>`}
          </div>
          <!-- Details -->
          <div style="flex:1;min-width:200px;">
            <div style="font-size:0.72rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">
              ${esc(p.category)}${p.subcategory?' · '+esc(p.subcategory):''}${p.material?' · '+esc(p.material):''}
            </div>
            <h2 style="font-family:var(--font-serif);margin-bottom:10px;">${esc(p.name)}</h2>
            ${p.description?`<p style="font-size:0.85rem;color:var(--text-medium);margin-bottom:14px;line-height:1.6;">${esc(p.description)}</p>`:''}

            <!-- Color Selection -->
            <div style="margin-bottom:16px;">
              <div style="font-size:0.78rem;font-weight:700;color:var(--text-medium);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">
                Color: <span style="font-weight:400;text-transform:none;">${esc(selColor.name)}</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${colors.map((c,i)=>`<button type="button" class="color-select-btn${i===cidx?' active':''}" data-color-idx="${i}" data-pid="${esc(pid)}" style="padding:6px 14px;border-radius:20px;border:2px solid ${i===cidx?'var(--gold-dark)':'var(--border-light)'};background:${i===cidx?'var(--gold-lighter)':'var(--cream-2)'};font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                  <span style="width:12px;height:12px;border-radius:50%;background:${esc((c.name||'#ccc').toLowerCase())};display:inline-block;"></span>${esc(c.name)}
                </button>`).join('')}
              </div>
            </div>

            <!-- Stock -->
            <div style="margin-bottom:14px;font-size:0.85rem;">
              <span style="color:var(--text-light);margin-right:8px;">Stock</span>
              <span class="td-badge ${outOfStock?'badge-red':+p.quantity<=5?'badge-gold':'badge-green'}">${outOfStock?'Out of Stock':+p.quantity<=5?`Only ${p.quantity} left`:'In Stock'}</span>
            </div>

            <!-- Size Selection -->
            ${sizes.length?`
            <div style="margin-bottom:20px;">
              <div style="font-size:0.78rem;font-weight:700;color:var(--text-medium);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Select Size</div>
              <div class="detail-size-btns" style="display:flex;flex-wrap:wrap;gap:8px;">
                ${sizes.map((s,i)=>`<button type="button" class="detail-size-btn${i===sidx?' active':''}" data-sz="${esc(s.size)}" data-price="${s.price}" data-size-idx="${i}" data-pid="${esc(pid)}" ${outOfStock?'disabled':''}>
                  ${esc(s.size)}<span class="size-price-tag">₹${(+s.price).toLocaleString('en-IN')}</span>
                </button>`).join('')}
              </div>
            </div>
            <div id="detail-price-display" style="font-family:var(--font-serif);font-size:2rem;font-weight:700;color:var(--gold-dark);margin-bottom:20px;">
              ${selSize?fmt(selSize.price):fmt(p.price||0)}
            </div>`:`
            <div id="detail-price-display" style="font-family:var(--font-serif);font-size:2rem;font-weight:700;color:var(--gold-dark);margin-bottom:20px;">${fmt(p.price||0)}</div>`}

            <button class="btn ${outOfStock?'btn-ghost':'btn-gold'} btn-block btn-lg" id="detail-add-cart-btn"
              data-pid="${esc(p.id)}"
              data-sz="${esc(selSize?.size||p.size||'')}"
              data-price="${selSize?.price||p.price||0}"
              data-color="${esc(selColor.name)}"
              data-img="${esc(selColor.image||p.image||'')}"
              ${outOfStock?'disabled':''}>
              ${outOfStock?'Out of Stock':'+ Add to Cart'}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   17. CART SIDEBAR
═══════════════════════════════════════════════════ */
function renderCartSidebar() {
  const cart=state.cart, total=cart.reduce((s,i)=>s+i.qty*i.price,0);
  return `
  <div class="cart-overlay" id="cart-overlay-bg"></div>
  <div class="cart-sidebar">
    <div class="cart-header">
      <div class="cart-title">Shopping Cart <span style="font-family:var(--font-sans);font-size:0.82rem;font-weight:400;color:var(--text-light);">(${cart.reduce((s,i)=>s+i.qty,0)} items)</span></div>
      <button class="modal-close" id="close-cart-btn">✕</button>
    </div>
    ${cart.length===0?`<div class="cart-empty"><div class="cart-empty-icon">🛍</div>
      <div style="font-family:var(--font-serif);font-size:1.2rem;color:var(--text-medium);margin-bottom:8px;">Your cart is empty</div>
      <p class="text-muted">Add items to begin shopping</p></div>`:`
    <div class="cart-items">${cart.map(item=>`
      <div class="cart-item">
        ${item.image?`<img src="${item.image}" class="cart-item-img" alt="${esc(item.name)}"/>`:
          `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;">👗</div>`}
        <div class="cart-item-info">
          <div class="cart-item-name">${esc(item.name)}</div>
          <div class="cart-item-meta">${esc(item.size)} · ${esc(item.color)} · ${fmt(item.price)}</div>
          <div class="cart-item-controls"><div class="qty-control">
            <button class="qty-btn" data-cart-dec="${esc(item.cartKey||item.id)}">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-cart-inc="${esc(item.cartKey||item.id)}">+</button>
          </div></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <div class="cart-item-price">${fmt(item.qty*item.price)}</div>
          <span class="cart-item-remove" data-cart-remove="${esc(item.cartKey||item.id)}">✕ Remove</span>
        </div>
      </div>`).join('')}
    </div>
    <div class="cart-footer">
      <div class="cart-summary-row"><span>Subtotal</span><span>${fmt(total)}</span></div>
      <div class="cart-total-row"><span>Total</span><span class="cart-total-amount">${fmt(total)}</span></div>
      <div style="margin:12px 0 4px;">
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-medium);margin-bottom:8px;">Payment Mode <span style="color:red;">*</span></div>
        <div class="pay-mode-select">
          ${[{v:'Cash',l:'Cash',i:'💵'},{v:'UPI',l:'UPI / GPay / PhonePe',i:'📱'},{v:'Card',l:'Card',i:'💳'}].map(({v,l,i})=>`<label class="pay-mode-btn${state.paymentMode===v?' selected':''}">
            <input type="radio" name="cartPayMode" value="${v}" ${state.paymentMode===v?'checked':''} style="display:none;"/>
            ${i} ${l}
          </label>`).join('')}
        </div>
      </div>
      ${state.paymentMode ? `
      <div style="margin-top:14px;border-top:1px dashed var(--border-light);padding-top:12px;">
        <div style="font-size:0.75rem;font-weight:700;color:var(--gold-dark);margin-bottom:8px;text-align:center;letter-spacing:0.07em;text-transform:uppercase;">📄 Your Bill</div>
        <div style="border:1px solid var(--border-light);border-radius:8px;overflow:hidden;max-height:360px;overflow-y:auto;">
          ${renderGSTInvoice(cartToInvoiceBill(cart, DB.getShop(), state.paymentMode), DB.getShop())}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-gold btn-block" id="cart-whatsapp-btn" style="font-size:0.82rem;padding:10px 8px;">📱 WhatsApp</button>
          <button class="btn btn-outline btn-block" id="cart-print-btn" style="font-size:0.82rem;padding:10px 8px;">🖨️ Print</button>
        </div>
        <button class="btn btn-outline btn-block" id="cart-both-btn" style="margin-top:8px;font-size:0.82rem;padding:9px 8px;">⚡ Both (WhatsApp + Print)</button>
      </div>
      ` : `
      <button class="btn btn-ghost btn-block btn-lg" style="margin-top:10px;opacity:0.5;cursor:default;" disabled>✦ &nbsp; Select payment to continue</button>
      `}
    </div>`}
  </div>`;
}

/* ═══════════════════════════════════════════════════
   17b. ADMIN BILLING (GST Invoice System)
═══════════════════════════════════════════════════ */
function generateBillNo() {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const r = Math.random().toString(36).slice(2,6).toUpperCase();
  return `BILL-${d}-${r}`;
}

function renderAdminBilling() {
  const bills = DB.getBills().slice().reverse();
  const shop = DB.getShop() || {};
  const statusColor = {
    'order-placed':'#4caf50','processing':'#1976d2',
    'payment-pending':'#f59e0b','payment-completed':'#059669',
    'bill-generated':'#7c3aed','completed':'#6b7280'
  };
  const statusLabel = {
    'order-placed':'Order Placed','processing':'Processing',
    'payment-pending':'Payment Pending','payment-completed':'Payment Completed',
    'bill-generated':'Bill Generated','completed':'Completed'
  };
  return `<div class="animate-fadeIn">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <div class="dash-page-title">Billing &amp; GST Invoices</div>
        <div class="dash-page-subtitle">${bills.length} bill${bills.length!==1?'s':''} generated</div>
      </div>
      <button class="btn btn-gold" id="new-bill-btn">🧾 &nbsp; Generate New Bill</button>
    </div>

    <!-- ⚙️ BILLING SETTINGS PANEL -->
    <div class="card" style="margin-bottom:24px;border-left:4px solid var(--gold-light);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
        <div>
          <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;">⚙️ Billing Settings</div>
          <div style="font-size:0.75rem;color:var(--text-light);margin-top:2px;">These values are auto-applied to all invoices &amp; customer bills</div>
        </div>
      </div>
      <!-- MANDATORY FIELDS -->
      <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#c62828;font-weight:700;margin-bottom:8px;">✔ Mandatory Fields</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:14px;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Shop Name <span class="required">*</span></label>
          <input type="text" class="form-control form-control-sm" id="bs-name" value="${esc(shop.name||'')}"/>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Phone <span class="required">*</span></label>
          <input type="tel" class="form-control form-control-sm" id="bs-phone" value="${esc(shop.phone||'')}" maxlength="10"/>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:14px;">
        <label class="form-label">Shop Address <span class="required">*</span></label>
        <textarea class="form-control form-control-sm" id="bs-address" style="min-height:48px;resize:vertical;">${esc(shop.address||'')}</textarea>
      </div>

      <!-- OPTIONAL FIELDS -->
      <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-medium);font-weight:700;margin-bottom:8px;padding-top:10px;border-top:1px dashed var(--border-light);">⚪ Optional Fields — shown on invoice only when filled</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Email</label>
          <input type="email" class="form-control form-control-sm" id="bs-email" value="${esc(shop.email||'')}" placeholder="shop@email.com"/>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">GST Number (GSTIN)</label>
          <input type="text" class="form-control form-control-sm" id="bs-gst" value="${esc(shop.gst||'')}" maxlength="15" style="text-transform:uppercase;" placeholder="15-char GSTIN"/>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">GST Rate % <span style="font-size:0.68rem;color:var(--text-light);">(total)</span></label>
          <input type="number" class="form-control form-control-sm" id="bs-gst-rate" value="${shop.gstRate||''}" min="0" max="28" placeholder="e.g. 18"/>
          <small class="form-hint">Used if SGST/CGST not set</small>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">SGST Rate %</label>
          <input type="number" class="form-control form-control-sm" id="bs-sgst-rate" value="${shop.sgstRate||''}" min="0" max="14" placeholder="e.g. 9"/>
          <small class="form-hint">Half of total GST</small>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">CGST Rate %</label>
          <input type="number" class="form-control form-control-sm" id="bs-cgst-rate" value="${shop.cgstRate||''}" min="0" max="14" placeholder="e.g. 9"/>
          <small class="form-hint">Half of total GST</small>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">UPI / GPay ID</label>
          <input type="text" class="form-control form-control-sm" id="bs-upi-id" value="${esc(shop.upiId||'')}" placeholder="yourshop@upi"/>
        </div>
      </div>
      <div class="form-group" style="margin-top:12px;margin-bottom:0;">
        <label class="form-label">Invoice Footer Message</label>
        <input type="text" class="form-control form-control-sm" id="bs-bill-footer" value="${esc(shop.billFooter||'Thank you for visiting again')}" placeholder="Thank you for visiting again"/>
      </div>
      <div style="margin-top:14px;text-align:right;">
        <button class="btn btn-gold btn-sm" id="save-billing-settings-btn">💾 &nbsp; Save Settings</button>
      </div>
    </div>
    ${bills.length===0?`<div class="empty-state"><div class="empty-state-icon">🧾</div>
      <div class="empty-state-title">No bills yet</div>
      <div class="empty-state-text">Click "Generate New Bill" to create your first GST invoice.</div></div>`
    :`<div class="table-wrap"><table>
      <thead><tr><th>Bill No</th><th>Date</th><th>Customer</th><th>Phone</th><th>Items</th><th>Grand Total</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${bills.map(b=>{
        const st = b.status||'completed';
        const color = statusColor[st]||'#6b7280';
        return `<tr>
          <td><code style="font-size:0.75rem;background:var(--cream-2);padding:2px 8px;border-radius:4px;">${esc(b.billNo||b.id.slice(-8).toUpperCase())}</code></td>
          <td style="font-size:0.82rem;color:var(--text-light);">${fmtDate(b.date)}</td>
          <td class="td-name">${esc(b.customerName||'Guest')}</td>
          <td style="font-size:0.82rem;">${esc(b.customerPhone||'—')}</td>
          <td>${(b.items||[]).length} item${(b.items||[]).length!==1?'s':''}</td>
          <td style="font-family:var(--font-serif);font-weight:700;color:var(--gold-dark);">${fmt(b.grandTotal||0)}</td>
          <td><span style="font-size:0.82rem;">${esc(b.paymentMode||'—')}</span></td>
          <td><span style="padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:600;background:${color}20;color:${color};">${statusLabel[st]||st}</span></td>
          <td style="white-space:nowrap;">
            <button class="btn btn-outline btn-sm" data-view-bill="${esc(b.id)}" style="margin-right:4px;">View</button>
            <button class="btn btn-ghost btn-sm" onclick="window._printBill('${esc(b.id)}')">Print</button>
          </td>
        </tr>`;}).join('')}
      </tbody></table></div>`}
    ${state.modalOpen==='billing'?renderBillingModal():''}
    ${state.modalOpen==='view-bill'&&state.currentBillId?renderViewBillModal(state.currentBillId):''}
  </div>`;
}

function renderBillingModal() {
  const shop = DB.getShop();
  const custs = DB.getCustomers();
  const prods = DB.getProducts();
  return `<div class="modal-overlay" id="billing-modal-overlay">
    <div class="modal modal-lg animate-slideUp" style="max-width:820px;width:95vw;">
      <div class="modal-header">
        <div class="modal-title">🧾 Generate New GST Invoice</div>
        <button class="modal-close" data-close-modal="billing">✕</button>
      </div>
      <div class="modal-body" style="max-height:78vh;overflow-y:auto;padding:20px;">
        <!-- Shop Details Preview -->
        <div style="background:var(--cream-2);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:20px;border:1px solid var(--border-light);">
          <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:8px;">Shop Details (shown on invoice)</div>
          <div style="font-weight:700;font-size:1rem;">${esc(shop?.name||'Your Shop')}</div>
          <div style="font-size:0.82rem;color:var(--text-medium);">${esc(shop?.address||'—')}</div>
          <div style="font-size:0.82rem;color:var(--text-medium);">${shop?.phone?'📞 '+esc(shop.phone):''}</div>
          ${shop?.gst?`<div style="font-size:0.78rem;color:var(--text-light);">GSTIN: ${esc(shop.gst)}</div>`:''}
        </div>

        <!-- Customer Details -->
        <div class="grid-2" style="margin-bottom:20px;gap:16px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Customer Name</label>
            <input type="text" class="form-control" id="bill-cust-name" list="bill-custs-dl" placeholder="Enter customer name" autocomplete="off"/>
            <datalist id="bill-custs-dl">${custs.map(c=>`<option value="${esc(c.name)}" data-phone="${esc(c.whatsapp||'')}"/>`).join('')}</datalist>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Customer Phone (WhatsApp)</label>
            <input type="tel" class="form-control" id="bill-cust-phone" maxlength="10" placeholder="10-digit number"/>
          </div>
        </div>

        <!-- Items Table -->
        <div style="margin-bottom:20px;">
          <div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-medium);font-weight:700;margin-bottom:10px;">Items Purchased</div>
          <div style="overflow-x:auto;">
            <table style="width:100%;min-width:500px;border-collapse:collapse;">
              <thead>
                <tr style="background:var(--cream-2);">
                  <th style="padding:8px 6px;text-align:center;width:36px;font-size:0.78rem;font-weight:600;color:var(--text-medium);">Sr.</th>
                  <th style="padding:8px 6px;text-align:left;font-size:0.78rem;font-weight:600;color:var(--text-medium);">Product Name</th>
                  <th style="padding:8px 6px;text-align:center;width:72px;font-size:0.78rem;font-weight:600;color:var(--text-medium);">Qty</th>
                  <th style="padding:8px 6px;text-align:right;width:110px;font-size:0.78rem;font-weight:600;color:var(--text-medium);">Price/Unit (₹)</th>
                  <th style="padding:8px 6px;text-align:right;width:110px;font-size:0.78rem;font-weight:600;color:var(--text-medium);">Total (₹)</th>
                  <th style="padding:8px 6px;width:36px;"></th>
                </tr>
              </thead>
              <tbody id="bill-items-tbody">
                <tr class="bill-item-row" style="border-bottom:1px solid var(--border-light);">
                  <td style="padding:8px 6px;text-align:center;color:var(--text-light);font-size:0.82rem;">1</td>
                  <td style="padding:6px;"><input type="text" class="form-control form-control-sm bill-item-name" list="bill-prods-dl" placeholder="Product name" autocomplete="off"/></td>
                  <td style="padding:6px;"><input type="number" class="form-control form-control-sm bill-item-qty" min="1" value="1" placeholder="1" style="text-align:center;"/></td>
                  <td style="padding:6px;"><input type="number" class="form-control form-control-sm bill-item-price" min="0" placeholder="0" style="text-align:right;"/></td>
                  <td style="padding:6px;"><input type="number" class="form-control form-control-sm bill-item-total" readonly placeholder="0" style="text-align:right;background:var(--cream-2);"/></td>
                  <td style="padding:6px;text-align:center;"><button type="button" class="btn-icon remove-bill-row" title="Remove" style="color:#c62828;width:28px;height:28px;font-size:0.9rem;">✕</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <datalist id="bill-prods-dl">${prods.map(p=>`<option value="${esc(p.name)}" data-price="${getProductBasePrice(p)}"/>`).join('')}</datalist>
          <button type="button" class="btn btn-outline btn-sm" id="add-bill-item-btn" style="margin-top:10px;">+ Add Item</button>
        </div>

        <!-- Pricing Summary -->
        <div class="card" style="margin-bottom:20px;padding:18px;">
          <div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-medium);font-weight:700;margin-bottom:14px;">Pricing Summary</div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.9rem;color:var(--text-medium);">Subtotal</span>
              <span id="bill-subtotal" style="font-weight:600;font-size:0.9rem;">₹0</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <span style="font-size:0.9rem;color:var(--text-medium);">Discount (Optional)</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <select class="form-control form-control-sm" id="bill-discount-type" style="width:70px;">
                  <option value="amount">₹</option>
                  <option value="percent">%</option>
                </select>
                <input type="number" class="form-control form-control-sm" id="bill-discount-val" min="0" placeholder="0" style="width:90px;text-align:right;"/>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.9rem;color:var(--text-medium);">Taxable Amount</span>
              <span id="bill-taxable" style="font-weight:600;font-size:0.9rem;">₹0</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <span style="font-size:0.9rem;color:var(--text-medium);">GST (%)</span>
              <input type="number" class="form-control form-control-sm" id="bill-gst-rate" min="0" max="28" placeholder="0" value="${DB.getShop()?.gstRate||0}" style="width:90px;text-align:right;"/>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.9rem;color:var(--text-medium);">GST Amount</span>
              <span id="bill-gst-amount" style="font-weight:600;font-size:0.9rem;">₹0</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:2px solid var(--gold-light);">
              <span style="font-size:1rem;font-weight:700;">Grand Total</span>
              <span id="bill-grand-total" style="font-size:1.3rem;font-weight:700;color:var(--gold-dark);font-family:var(--font-serif);">₹0</span>
            </div>
          </div>
        </div>

        <!-- Payment Details -->
        <div class="card" style="margin-bottom:8px;padding:18px;">
          <div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-medium);font-weight:700;margin-bottom:14px;">Payment Details <span style="color:#c62828;">*</span> Required</div>
          <div class="pay-mode-select" style="margin-bottom:14px;flex-wrap:wrap;">
            ${['Cash','GPay / UPI / PhonePe','Card'].map(pm=>`<label class="pay-mode-btn" id="bill-pay-${pm.replace(/[^a-z0-9]/gi,'-').toLowerCase()}">
              <input type="radio" name="billPayMode" value="${pm}" style="display:none;"/>${pm==='Cash'?'💵':pm==='Card'?'💳':'📱'} ${pm}
            </label>`).join('')}
          </div>
          <div class="grid-2" style="gap:14px;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Amount Paid (₹)</label>
              <input type="number" class="form-control" id="bill-amount-paid" min="0" placeholder="0"/>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Balance Amount (₹)</label>
              <input type="number" class="form-control" id="bill-balance" readonly placeholder="0" style="background:var(--cream-2);"/>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="justify-content:flex-end;gap:10px;">
        <button class="btn btn-ghost" data-close-modal="billing">Cancel</button>
        <button class="btn btn-gold btn-lg" id="generate-invoice-btn">🧾 &nbsp; Generate Invoice</button>
      </div>
    </div>
  </div>`;
}

function renderViewBillModal(billId) {
  const bill = DB.getBills().find(b => b.id === billId);
  if (!bill) return '';
  const shop = DB.getShop();
  return `<div class="modal-overlay" id="view-bill-overlay">
    <div class="modal animate-slideUp" style="max-width:580px;width:95vw;">
      <div class="modal-header no-print" style="background:var(--gold-lighter);border-bottom:2px solid var(--gold-light);">
        <div class="modal-title" style="font-family:var(--font-serif);color:var(--gold-dark);">✦ &nbsp; GST Invoice Generated</div>
        <button class="modal-close" data-close-modal="view-bill">✕</button>
      </div>
      <div class="modal-body" style="max-height:72vh;overflow-y:auto;padding:0;">
        ${renderGSTInvoice(bill, shop)}
        <div id="billing-action-result" style="padding:0 16px 12px;"></div>
      </div>
      <div class="modal-footer no-print" style="flex-direction:column;gap:10px;align-items:stretch;padding:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button class="btn btn-outline btn-lg" id="print-bill-btn" data-bill-id="${esc(bill.id)}" style="display:flex;align-items:center;justify-content:center;gap:8px;">
            🖨️ &nbsp; Print Bill
          </button>
          <button class="btn btn-outline btn-lg" id="wa-bill-btn" data-bill-id="${esc(bill.id)}" style="display:flex;align-items:center;justify-content:center;gap:8px;">
            💬 &nbsp; WhatsApp
          </button>
        </div>
        <button class="btn btn-gold btn-lg" id="parallel-action-btn" data-bill-id="${esc(bill.id)}" style="display:flex;align-items:center;justify-content:center;gap:10px;font-size:1rem;">
          ⚡ &nbsp; Print &amp; Send WhatsApp Simultaneously
        </button>
        <button class="btn btn-ghost" data-close-modal="view-bill" style="font-size:0.85rem;">Close</button>
      </div>
    </div>
  </div>`;
}

function renderGSTInvoice(bill, shop) {
  const items    = bill.items || [];
  const sub      = bill.subtotal      || items.reduce((s,i) => s + i.qty * i.price, 0);
  const discAmt  = bill.discountAmount || 0;
  const taxable  = bill.taxableAmount  || (sub - discAmt);
  const sgstAmt  = bill.sgstAmount     || 0;
  const cgstAmt  = bill.cgstAmount     || 0;
  const gstAmt   = bill.gstAmount      || 0;
  const grand    = bill.grandTotal     || (taxable + gstAmt);
  const amtPaid  = bill.amountPaid     || 0;
  const balance  = bill.balance        || 0;
  const pmIcon   = bill.paymentMode==='Cash'?'💵':bill.paymentMode==='Card'?'💳':'📱';
  const useSplit = (sgstAmt > 0 || cgstAmt > 0); // show SGST/CGST separately

  return `<div class="gst-invoice">
    <!-- ── SHOP HEADER ── -->
    <div class="invoice-header">
      <div class="invoice-shop-name">${esc(shop?.name||'Shop')}</div>
      ${shop?.address?`<div class="invoice-shop-sub">${esc(shop.address)}</div>`:''}
      ${shop?.phone?`<div class="invoice-shop-sub">📞 ${esc(shop.phone)}</div>`:''}
      ${shop?.email?`<div class="invoice-shop-sub">✉ ${esc(shop.email)}</div>`:''}
      ${shop?.gst?`<div class="invoice-gst-tag">GSTIN: ${esc(shop.gst)}</div>`:''}
    </div>

    <div class="invoice-center-divider">── GST TAX INVOICE ──</div>

    <!-- ── BILL META ── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin:10px 0;font-size:0.83rem;">
      <div><span class="invoice-lbl">Bill No</span><br/><strong style="font-size:0.9rem;">${esc(bill.billNo||bill.id.slice(-8).toUpperCase())}</strong></div>
      <div><span class="invoice-lbl">Date</span><br/><strong>${fmtDate(bill.date)}</strong></div>
      <div style="margin-top:8px;"><span class="invoice-lbl">Customer</span><br/><strong>${esc(bill.customerName||'Guest')}</strong></div>
      ${bill.customerPhone?`<div style="margin-top:8px;"><span class="invoice-lbl">Phone</span><br/><strong>${esc(bill.customerPhone)}</strong></div>`:'<div></div>'}
    </div>

    <div class="invoice-dashed-line"></div>

    <!-- ── ITEMS TABLE ── -->
    <table class="invoice-items-table">
      <thead>
        <tr>
          <th style="width:28px;text-align:center;">Sr.</th>
          <th>Product Name</th>
          <th style="text-align:center;width:40px;">Qty</th>
          <th style="text-align:right;width:80px;">Rate (₹)</th>
          <th style="text-align:right;width:90px;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item,i)=>`<tr>
          <td style="text-align:center;color:#888;">${i+1}</td>
          <td style="font-weight:500;">${esc(item.name)}</td>
          <td style="text-align:center;">${item.qty}</td>
          <td style="text-align:right;">${Number(item.price).toLocaleString('en-IN')}</td>
          <td style="text-align:right;font-weight:600;">${Number(item.qty*item.price).toLocaleString('en-IN')}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="invoice-dashed-line"></div>

    <!-- ── PRICING TOTALS ── -->
    <div class="invoice-totals-block">
      <div class="invoice-total-line">
        <span style="color:#666;">Subtotal</span>
        <span>₹${sub.toLocaleString('en-IN')}</span>
      </div>
      ${discAmt>0?`<div class="invoice-total-line" style="color:#2e7d32;">
        <span>Discount${bill.discountType==='percent'?` (${bill.discountValue}%)`:''}  </span>
        <span>− ₹${discAmt.toLocaleString('en-IN')}</span>
      </div>`:''}
      <div class="invoice-total-line">
        <span style="color:#666;">Taxable Amount</span>
        <span>₹${taxable.toLocaleString('en-IN')}</span>
      </div>
      ${useSplit?`
        ${sgstAmt>0?`<div class="invoice-total-line">
          <span style="color:#666;">SGST @ ${bill.sgstRate||0}%</span>
          <span>₹${sgstAmt.toLocaleString('en-IN')}</span>
        </div>`:''}
        ${cgstAmt>0?`<div class="invoice-total-line">
          <span style="color:#666;">CGST @ ${bill.cgstRate||0}%</span>
          <span>₹${cgstAmt.toLocaleString('en-IN')}</span>
        </div>`:''}`
      :(gstAmt>0?`<div class="invoice-total-line">
        <span style="color:#666;">GST @ ${bill.gstRate||0}%</span>
        <span>₹${gstAmt.toLocaleString('en-IN')}</span>
      </div>`:'')}
      <div class="invoice-total-line invoice-grand-total-line">
        <span>Grand Total</span>
        <span>₹${grand.toLocaleString('en-IN')}</span>
      </div>
    </div>

    <div class="invoice-dashed-line"></div>

    <!-- ── PAYMENT ── -->
    <div class="invoice-payment-block">
      <div class="invoice-total-line">
        <span style="color:#666;">Payment Mode</span>
        <span style="font-weight:700;">${pmIcon} ${esc(bill.paymentMode||'—')}</span>
      </div>
      <div class="invoice-total-line">
        <span style="color:#666;">Amount Paid</span>
        <span>₹${amtPaid.toLocaleString('en-IN')}</span>
      </div>
      ${balance>0
        ?`<div class="invoice-total-line" style="color:#c62828;font-weight:600;">
            <span>Balance Due</span><span>₹${balance.toLocaleString('en-IN')}</span>
          </div>`
        :`<div class="invoice-total-line" style="color:#2e7d32;">
            <span>Balance</span><span>✅ Nil</span>
          </div>`}
    </div>

    ${shop?.upiId?`<div class="invoice-payment-block" style="border-top:none;padding-top:0;">
      <div class="invoice-total-line">
        <span style="color:#666;">UPI / GPay / PhonePe</span>
        <span style="font-weight:600;">📱 ${esc(shop.upiId)}</span>
      </div>
    </div>`:''}
    <div class="invoice-dashed-line"></div>
    <div class="invoice-footer-msg">${esc(shop?.billFooter||'Thank you for visiting again')}</div>
    <div class="invoice-footer-shop">${esc(shop?.name||'')}${shop?.phone?' · 📞 '+esc(shop.phone):''}</div>
  </div>`;
}

function buildWhatsAppGSTBill(bill, shop) {
  const items = bill.items || [];
  let m = `🧾 *${shop?.name||'Zara Aura'} — GST Invoice*\n`;
  if (shop?.address) m += `_${shop.address}_\n`;
  if (shop?.gst) m += `GSTIN: ${shop.gst}\n`;
  m += `\n*Bill No:* ${esc(bill.billNo||bill.id.slice(-8).toUpperCase())}\n`;
  m += `*Date:* ${fmtDate(bill.date)}\n`;
  m += `*Customer:* ${bill.customerName||'Guest'}\n\n`;
  m += `*Items:*\n`;
  items.forEach((item, idx) => { m += `${idx+1}. ${item.name} × ${item.qty} = ₹${(item.qty*item.price).toLocaleString('en-IN')}\n`; });
  const sub = bill.subtotal || items.reduce((s,i) => s + i.qty*i.price, 0);
  m += `\n`;
  if (bill.discountAmount > 0) m += `Discount: −₹${bill.discountAmount.toLocaleString('en-IN')}\n`;
  if (bill.gstAmount > 0) m += `GST (${bill.gstRate}%): ₹${bill.gstAmount.toLocaleString('en-IN')}\n`;
  m += `\n*💰 Grand Total: ₹${Number(bill.grandTotal||0).toLocaleString('en-IN')}*\n`;
  m += `*Payment: ${bill.paymentMode||'—'}*\n`;
  if (shop?.upiId) m += `📱 UPI: ${shop.upiId}\n`;
  m += `\n${shop?.billFooter||'Thank you for shopping with us! 🛍✨'}\n`;
  if (shop?.name) m += `— ${shop.name}`;
  return m;
}

function sendWhatsAppBill(billId) {
  const bill = DB.getBills().find(b => b.id === billId);
  const shop = DB.getShop();
  if (!bill) { showToast('Bill not found', 'error'); return; }
  if (!bill.customerPhone) { showToast('No customer phone number — WhatsApp not sent', 'warning'); return; }
  const msg = buildWhatsAppGSTBill(bill, shop);
  const phone = bill.customerPhone.replace(/\D/g, '');
  window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

window._printBill = function(billId) {
  const bill = DB.getBills().find(b => b.id === billId);
  const shop = DB.getShop();
  if (!bill) return;
  const items = bill.items || [];
  const printWin = window.open('', '_blank', 'width=420,height=680,scrollbars=yes');
  if (!printWin) { showToast('Allow popups to print the bill', 'warning'); return; }
  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Invoice ${bill.billNo||bill.id.slice(-8).toUpperCase()}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Courier New',monospace;font-size:12px;width:80mm;margin:0 auto;padding:10px 8px;color:#000;}
  .center{text-align:center;}
  .right{text-align:right;}
  .shop-name{font-size:15px;font-weight:bold;text-align:center;margin-bottom:3px;}
  .shop-sub{font-size:10.5px;text-align:center;color:#333;line-height:1.5;}
  .divider{border-top:1px dashed #000;margin:7px 0;text-align:center;font-size:10.5px;padding-top:4px;font-weight:bold;}
  .meta{margin:4px 0;font-size:11px;}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:6px 0;}
  th{border-bottom:1px solid #000;padding:3px 2px;font-weight:bold;}
  td{padding:3px 2px;vertical-align:top;}
  .total-block{margin:6px 0;}
  .total-row{display:flex;justify-content:space-between;font-size:11px;padding:2px 0;}
  .grand-row{display:flex;justify-content:space-between;font-size:14px;font-weight:bold;border-top:1px solid #000;padding-top:5px;margin-top:4px;}
  .footer{text-align:center;font-size:10.5px;margin-top:10px;color:#555;}
  .print-btn{display:block;margin:14px auto 0;padding:7px 20px;cursor:pointer;font-size:13px;background:#C9A84C;color:#fff;border:none;border-radius:4px;}
  @media print{.print-btn,.no-print{display:none!important;}body{padding:4px;}}
</style>
</head>
<body>
<div class="shop-name">${esc(shop?.name||'Shop')}</div>
${shop?.address?`<div class="shop-sub">${esc(shop.address)}</div>`:''}
${shop?.phone?`<div class="shop-sub">Tel: ${esc(shop.phone)}</div>`:''}
${shop?.gst?`<div class="shop-sub">GSTIN: ${esc(shop.gst)}</div>`:''}
<div class="divider">GST INVOICE</div>
<div class="meta"><strong>Bill No:</strong> ${esc(bill.billNo||bill.id.slice(-8).toUpperCase())}</div>
<div class="meta"><strong>Date:</strong> ${fmtDate(bill.date)}</div>
<div class="meta"><strong>Customer:</strong> ${esc(bill.customerName||'Guest')}</div>
${bill.customerPhone?`<div class="meta"><strong>Phone:</strong> ${esc(bill.customerPhone)}</div>`:''}
<div class="divider" style="font-size:0;border-top:1px dashed #000;padding-top:0;"></div>
<table>
<thead><tr><th>Sr</th><th>Item</th><th class="center">Qty</th><th class="right">Rate</th><th class="right">Amt</th></tr></thead>
<tbody>${items.map((item,i)=>`<tr><td class="center">${i+1}</td><td>${esc(item.name)}</td><td class="center">${item.qty}</td><td class="right">₹${Number(item.price).toLocaleString('en-IN')}</td><td class="right">₹${Number(item.qty*item.price).toLocaleString('en-IN')}</td></tr>`).join('')}</tbody>
</table>
<div class="divider" style="font-size:0;border-top:1px dashed #000;padding-top:0;"></div>
<div class="total-block">
<div class="total-row"><span>Subtotal</span><span>₹${Number(bill.subtotal||0).toLocaleString('en-IN')}</span></div>
${bill.discountAmount>0?`<div class="total-row"><span>Discount${bill.discountType==='percent'?' ('+bill.discountValue+'%)':''}</span><span>-₹${Number(bill.discountAmount).toLocaleString('en-IN')}</span></div>`:''}
<div class="total-row"><span>Taxable Amt</span><span>₹${Number(bill.taxableAmount||0).toLocaleString('en-IN')}</span></div>
${bill.gstAmount>0?`<div class="total-row"><span>GST (${bill.gstRate||0}%)</span><span>₹${Number(bill.gstAmount).toLocaleString('en-IN')}</span></div>`:''}
<div class="grand-row"><span>TOTAL</span><span>₹${Number(bill.grandTotal||0).toLocaleString('en-IN')}</span></div>
</div>
<div class="divider" style="font-size:0;border-top:1px dashed #000;padding-top:0;"></div>
<div class="total-block">
<div class="total-row"><strong>Payment:</strong><span>${esc(bill.paymentMode||'—')}</span></div>
<div class="total-row"><span>Amount Paid</span><span>₹${Number(bill.amountPaid||0).toLocaleString('en-IN')}</span></div>
${bill.balance>0?`<div class="total-row"><span>Balance</span><span>₹${Number(bill.balance).toLocaleString('en-IN')}</span></div>`:'<div class="total-row"><span>Balance</span><span>NIL</span></div>'}
</div>
<div class="footer">Thank you for shopping with us! ✦</div>
<div class="footer">${esc(shop?.name||'')}</div>
<button class="print-btn no-print" onclick="window.print();setTimeout(()=>window.close(),500);">🖨 Print Bill</button>
</body></html>`);
  printWin.document.close();
  setTimeout(() => { try { printWin.print(); } catch(_) {} }, 400);
};

async function executeBillingActions(billId) {
  const resultEl = document.getElementById('billing-action-result');
  if (resultEl) {
    resultEl.innerHTML = `<div style="padding:14px;background:var(--cream-2);border-radius:var(--radius-md);margin-top:14px;">
      <div style="font-size:0.88rem;font-weight:600;margin-bottom:8px;">⚡ Executing both actions simultaneously…</div>
      <div id="ba-print-status" style="color:var(--text-medium);font-size:0.82rem;">🖨️ Opening print window…</div>
      <div id="ba-wa-status" style="color:var(--text-medium);font-size:0.82rem;margin-top:4px;">💬 Preparing WhatsApp…</div>
    </div>`;
  }

  const [printRes, waRes] = await Promise.all([
    new Promise(resolve => {
      try { window._printBill(billId); resolve({ ok:true }); }
      catch(e) { resolve({ ok:false, error:e.message }); }
    }),
    new Promise(resolve => {
      try { sendWhatsAppBill(billId); resolve({ ok:true }); }
      catch(e) { resolve({ ok:false, error:e.message }); }
    })
  ]);

  DB.updateBill(billId, { status:'completed' });

  if (resultEl) {
    resultEl.innerHTML = `<div style="padding:16px;background:#e8f5e9;border-radius:var(--radius-md);border:1px solid #a5d6a7;margin-top:14px;">
      <div style="font-weight:700;color:#2e7d32;font-size:1rem;margin-bottom:8px;">✦ All Done!</div>
      <div style="font-size:0.88rem;color:#2e7d32;line-height:2;">
        ✔ Bill Printed Successfully<br/>
        ✔ Bill Sent via WhatsApp Successfully<br/>
        ✔ Order Completed
      </div>
    </div>`;
  }

  render();
}

function calcBillingTotals() {
  const rows = document.querySelectorAll('#bill-items-tbody .bill-item-row');
  let sub = 0;
  rows.forEach((row, i) => {
    const qty  = Math.max(1, +row.querySelector('.bill-item-qty')?.value||0);
    const price = +row.querySelector('.bill-item-price')?.value||0;
    const total = qty * price;
    const totalInp = row.querySelector('.bill-item-total');
    if (totalInp) totalInp.value = total || '';
    const srEl = row.querySelector('td:first-child');
    if (srEl) srEl.textContent = i+1;
    sub += total;
  });

  const discType = document.getElementById('bill-discount-type')?.value||'amount';
  const discVal  = +document.getElementById('bill-discount-val')?.value||0;
  const discAmt  = discType==='percent' ? Math.round(sub * discVal / 100) : discVal;
  const taxable  = Math.max(0, sub - discAmt);
  const gstRate  = +document.getElementById('bill-gst-rate')?.value||0;
  const gstAmt   = Math.round(taxable * gstRate / 100);
  const grand    = taxable + gstAmt;

  const fmt2 = n => `₹${Number(n).toLocaleString('en-IN')}`;
  const el = id => document.getElementById(id);
  if (el('bill-subtotal'))   el('bill-subtotal').textContent   = fmt2(sub);
  if (el('bill-taxable'))    el('bill-taxable').textContent    = fmt2(taxable);
  if (el('bill-gst-amount')) el('bill-gst-amount').textContent = fmt2(gstAmt);
  if (el('bill-grand-total')) el('bill-grand-total').textContent = fmt2(grand);

  // Balance
  const paid = +el('bill-amount-paid')?.value||0;
  const bal  = Math.max(0, grand - paid);
  if (el('bill-balance')) el('bill-balance').value = bal || '';

  return { sub, discAmt, taxable, gstAmt, grand, discType, discVal, gstRate };
}

/* ═══════════════════════════════════════════════════
   17c. ORDER → GST INVOICE HELPERS
═══════════════════════════════════════════════════ */
/* Convert a cart order into a bill-like object applying shop GST / SGST / CGST */
function orderToInvoiceBill(order, shop) {
  const gstRate  = +(shop?.gstRate  || 0);
  const sgstRate = +(shop?.sgstRate || 0);
  const cgstRate = +(shop?.cgstRate || 0);
  const items    = order.items || [];
  const sub      = items.reduce((s,i) => s + i.qty * i.price, 0);
  // If SGST+CGST configured separately, use them; else use total gstRate
  const sgstAmt  = sgstRate > 0 ? Math.round(sub * sgstRate / 100) : 0;
  const cgstAmt  = cgstRate > 0 ? Math.round(sub * cgstRate / 100) : 0;
  const gstAmt   = (sgstAmt + cgstAmt) || Math.round(sub * gstRate / 100);
  const grand    = sub + gstAmt;
  return {
    id: order.id,
    billNo: '#' + order.id.slice(-8).toUpperCase(),
    date: order.date,
    customerName: order.customerName || order.guestName || 'Guest',
    customerPhone: order.customerPhone || '',
    items,
    subtotal: sub,
    discountType: 'amount', discountValue: 0, discountAmount: 0,
    taxableAmount: sub,
    gstRate, gstAmount: gstAmt,
    sgstRate, sgstAmount: sgstAmt,
    cgstRate, cgstAmount: cgstAmt,
    grandTotal: grand,
    paymentMode: order.paymentMode || 'Cash',
    amountPaid: grand, balance: 0,
  };
}

/* Convert current cart array into a preview bill object (before order is created) */
function cartToInvoiceBill(cart, shop, paymentMode) {
  const gstRate  = +(shop?.gstRate  || 0);
  const sgstRate = +(shop?.sgstRate || 0);
  const cgstRate = +(shop?.cgstRate || 0);
  const sub      = cart.reduce((s,i) => s + i.qty * i.price, 0);
  const sgstAmt  = sgstRate > 0 ? Math.round(sub * sgstRate / 100) : 0;
  const cgstAmt  = cgstRate > 0 ? Math.round(sub * cgstRate / 100) : 0;
  const gstAmt   = (sgstAmt + cgstAmt) || Math.round(sub * gstRate / 100);
  const grand    = sub + gstAmt;
  const session  = DB.getSession();
  return {
    id: 'PREVIEW',
    billNo: 'PREVIEW',
    date: Date.now(),
    customerName: session?.name || 'Guest',
    customerPhone: session?.phone || '',
    items: cart.map(i => ({id:i.id, name:i.name, size:i.size||'', color:i.color||'', price:i.price, qty:i.qty})),
    subtotal: sub,
    discountType: 'amount', discountValue: 0, discountAmount: 0,
    taxableAmount: sub,
    gstRate, gstAmount: gstAmt,
    sgstRate, sgstAmount: sgstAmt,
    cgstRate, cgstAmount: cgstAmt,
    grandTotal: grand,
    paymentMode: paymentMode || 'Cash',
    amountPaid: grand, balance: 0,
  };
}

/* Well-formatted WhatsApp text invoice for cart orders */
function buildOrderWhatsAppText(order, shop, cust) {
  const bill = orderToInvoiceBill(order, shop);
  const items = bill.items;
  let m  = `🧾 *${shop?.name||'Zara Aura'} — GST Invoice*\n`;
  if (shop?.address) m += `📍 ${shop.address}\n`;
  if (shop?.phone)   m += `📞 ${shop.phone}\n`;
  if (shop?.email)   m += `✉ ${shop.email}\n`;
  if (shop?.gst)     m += `GSTIN: ${shop.gst}\n`;
  m += `\n*Bill No:* ${bill.billNo}\n`;
  m += `*Date:* ${new Date(bill.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}\n`;
  m += `*Customer:* ${cust?.name||bill.customerName}\n\n`;
  m += `*Items Purchased:*\n`;
  items.forEach((it,i) => {
    m += `${i+1}. ${it.name}${it.size?' ('+it.size+')':''} × ${it.qty} = ₹${(it.qty*it.price).toLocaleString('en-IN')}\n`;
  });
  m += `\nSubtotal: ₹${bill.subtotal.toLocaleString('en-IN')}\n`;
  if (bill.gstAmount > 0) m += `GST (${bill.gstRate}%): ₹${bill.gstAmount.toLocaleString('en-IN')}\n`;
  m += `\n*💰 Grand Total: ₹${bill.grandTotal.toLocaleString('en-IN')}*\n`;
  m += `*Payment: ${bill.paymentMode}*\n`;
  if (shop?.upiId) m += `📱 UPI: ${shop.upiId}\n`;
  m += `\n${shop?.billFooter||'Thank you for shopping with us! 🛍✨'}\n`;
  if (shop?.name) m += `— ${shop.name}`;
  return m;
}

/* Thermal print for cart orders */
window._printOrderBill = function(orderId) {
  const order = DB.getOrders().find(o => o.id === orderId);
  const shop  = DB.getShop();
  const cust  = DB.getCustomers().find(c => c.id === order?.customerId);
  if (!order) { showToast('Order not found','error'); return; }
  const bill = orderToInvoiceBill(order, shop);
  const pmIcon = bill.paymentMode==='Cash'?'💵':bill.paymentMode==='Card'?'💳':'📱';
  const win = window.open('','_blank','width=420,height=720');
  if (!win) { showToast('Please allow popups to print','warning'); return; }
  win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${bill.billNo}</title>
<meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:monospace;font-size:12px;padding:10px;max-width:380px;margin:0 auto;}
  .shop-name{font-size:16px;font-weight:bold;text-align:center;margin-bottom:3px;}
  .center{text-align:center;}.right{text-align:right;font-size:11px;}
  .dashed{border-top:1px dashed #000;margin:6px 0;}
  table{width:100%;border-collapse:collapse;}
  th,td{padding:2px 4px;font-size:11px;}
  th{text-align:left;font-weight:600;}
  .total-row{display:flex;justify-content:space-between;padding:2px 0;font-size:12px;}
  .grand{font-size:14px;font-weight:bold;border-top:1px solid #000;padding-top:4px;margin-top:4px;}
  .footer{text-align:center;margin-top:8px;font-size:11px;font-style:italic;}
  @media print{@page{margin:2mm 5mm;}body{padding:0;}}
</style>
</head><body>
<div class="shop-name">${esc(shop?.name||'Zara Aura')}</div>
${shop?.address?`<div class="center" style="font-size:10px;">${esc(shop.address)}</div>`:''}
${shop?.phone?`<div class="center" style="font-size:10px;">📞 ${esc(shop.phone)}</div>`:''}
${shop?.email?`<div class="center" style="font-size:10px;">✉ ${esc(shop.email)}</div>`:''}
${shop?.gst?`<div class="center" style="font-size:10px;font-weight:bold;">GSTIN: ${esc(shop.gst)}</div>`:''}
<div class="dashed"></div>
<div class="center" style="font-weight:bold;font-size:12px;letter-spacing:1px;">GST TAX INVOICE</div>
<div class="dashed"></div>
<div style="display:flex;justify-content:space-between;font-size:10px;">
  <span>Bill: ${esc(bill.billNo)}</span>
  <span>${new Date(bill.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span>
</div>
<div style="font-size:10px;">Customer: ${esc(cust?.name||bill.customerName)}</div>
<div class="dashed"></div>
<table>
  <thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th class="right">Rate</th><th class="right">Amt</th></tr></thead>
  <tbody>${bill.items.map(it=>`<tr>
    <td>${esc(it.name)}${it.size?' ('+esc(it.size)+')':''}</td>
    <td style="text-align:center;">${it.qty}</td>
    <td class="right">₹${it.price.toLocaleString('en-IN')}</td>
    <td class="right">₹${(it.qty*it.price).toLocaleString('en-IN')}</td>
  </tr>`).join('')}</tbody>
</table>
<div class="dashed"></div>
<div class="total-row"><span>Subtotal</span><span>₹${bill.subtotal.toLocaleString('en-IN')}</span></div>
${bill.discountAmount>0?`<div class="total-row" style="color:#2e7d32;"><span>Discount</span><span>−₹${bill.discountAmount.toLocaleString('en-IN')}</span></div>`:''}
${(bill.sgstAmount>0)?`<div class="total-row"><span>SGST (${bill.sgstRate}%)</span><span>₹${bill.sgstAmount.toLocaleString('en-IN')}</span></div>`:''}
${(bill.cgstAmount>0)?`<div class="total-row"><span>CGST (${bill.cgstRate}%)</span><span>₹${bill.cgstAmount.toLocaleString('en-IN')}</span></div>`:''}
${(!bill.sgstAmount&&!bill.cgstAmount&&bill.gstAmount>0)?`<div class="total-row"><span>GST (${bill.gstRate}%)</span><span>₹${bill.gstAmount.toLocaleString('en-IN')}</span></div>`:''}
<div class="total-row grand"><span>GRAND TOTAL</span><span>₹${bill.grandTotal.toLocaleString('en-IN')}</span></div>
<div class="dashed"></div>
<div class="total-row"><span>Amount Paid</span><span>₹${bill.grandTotal.toLocaleString('en-IN')}</span></div>
<div class="total-row"><span>Balance</span><span>₹0 — Nil</span></div>
<div class="total-row" style="margin-top:4px;"><span>${pmIcon} ${esc(bill.paymentMode)} — PAID ✔</span></div>
${shop?.upiId?`<div class="center" style="font-size:10px;margin-top:4px;">📱 UPI: ${esc(shop.upiId)}</div>`:''}
<div class="dashed"></div>
<div class="footer">${esc(shop?.billFooter||'Thank you for visiting again')}</div>
<div class="footer" style="font-style:normal;font-weight:bold;margin-top:2px;">— ${esc(shop?.name||'')}</div>
</body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
};

/* ── Generate invoice as canvas image (requires html2canvas CDN) ── */
async function generateInvoiceImage(order, shop) {
  if (typeof html2canvas === 'undefined') throw new Error('html2canvas not loaded');
  const bill = orderToInvoiceBill(order, shop);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;background:#fff;padding:8px;z-index:-9999;';
  wrap.innerHTML = renderGSTInvoice(bill, shop);
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(wrap, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, width: 400
    });
    return canvas;
  } finally {
    document.body.removeChild(wrap);
  }
}

/* ── Share invoice IMAGE via WhatsApp ── */
async function shareInvoiceWhatsApp(order, shop) {
  const cust  = DB.getCustomers().find(c => c.id === order?.customerId);
  const phone = (cust?.whatsapp || cust?.phone || order?.customerPhone || '').replace(/\D/g,'');

  try {
    // Generate bill as image
    const canvas   = await generateInvoiceImage(order, shop);
    const blob     = await new Promise(res => canvas.toBlob(res, 'image/png', 0.95));
    const fileName = `invoice-${(order.id||'').slice(-6).toUpperCase()}.png`;
    const file     = new File([blob], fileName, {type: 'image/png'});

    // Mobile: native share with image file — show toast so user knows to pick WhatsApp
    if (navigator.share && navigator.canShare && navigator.canShare({files: [file]})) {
      showToast('📲 Please select WhatsApp to send the bill', 'info');
      await navigator.share({ files: [file], title: `Invoice — ${shop?.name || 'Zara Aura'}` });
      return true;
    }

    // Desktop: download the image then open WhatsApp
    const url = URL.createObjectURL(blob);
    const dl  = document.createElement('a');
    dl.href = url; dl.download = fileName;
    document.body.appendChild(dl); dl.click();
    setTimeout(() => { URL.revokeObjectURL(url); dl.remove(); }, 500);

    if (phone) {
      const note = `Hi ${cust?.name||''}! 🛍 Your bill from *${shop?.name||'our store'}* is ready. Please find the invoice image just downloaded — attach it here.`;
      setTimeout(() => {
        const wa = document.createElement('a');
        wa.href = `https://wa.me/91${phone}?text=${encodeURIComponent(note)}`;
        wa.target = '_blank'; wa.rel = 'noopener';
        document.body.appendChild(wa); wa.click(); setTimeout(() => wa.remove(), 300);
      }, 900);
    }
    return true;
  } catch(e) {
    // Image generation failed — send formatted text bill via WhatsApp
    if (phone) {
      const msg = buildOrderWhatsAppText(order, shop, cust);
      const a   = document.createElement('a');
      a.href = `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
      a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 300);
      return true;
    }
    return false;
  }
}

/* Parallel delivery: print AND/OR WhatsApp */
async function executeOrderDelivery(orderId, pref) {
  const order    = DB.getOrders().find(o => o.id === orderId);
  const shop     = DB.getShop();
  const statusEl = document.getElementById('delivery-status-box');
  if (statusEl) statusEl.innerHTML = `<div style="padding:10px;text-align:center;color:var(--text-medium);font-size:0.85rem;">⏳ Processing invoice…</div>`;

  const doWhatsApp = pref === 'whatsapp' || pref === 'both';
  const doPrint    = pref === 'print'    || pref === 'both';

  const [waRes, printRes] = await Promise.all([
    doWhatsApp
      ? shareInvoiceWhatsApp(order, shop).catch(() => false)
      : Promise.resolve(null),
    new Promise(res => {
      if (!doPrint) return res(null);
      try { window._printOrderBill(orderId); res(true); } catch(e) { res(false); }
    }),
  ]);

  const lines = [
    '✔ Payment Successful',
    '✔ Invoice Generated',
    ...(doWhatsApp ? [waRes !== false ? '✔ WhatsApp Sent Successfully' : '⚠ WhatsApp: add phone number to your profile'] : []),
    ...(doPrint    ? [printRes === true ? '✔ Bill Printed Successfully' : '⚠ Print popup blocked — please allow popups'] : []),
    '✔ Order Completed',
  ];

  if (statusEl) {
    statusEl.innerHTML = `<div style="padding:14px;background:#e8f5e9;border-radius:8px;border:1px solid #a5d6a7;">
      <div style="font-weight:700;color:#2e7d32;font-size:0.95rem;margin-bottom:8px;">✦ All Done!</div>
      <div style="font-size:0.84rem;color:#2e7d32;line-height:2.1;">${lines.join('<br/>')}</div>
    </div>`;
  }
}

/* ═══════════════════════════════════════════════════
   18. BILL & WHATSAPP
═══════════════════════════════════════════════════ */
function renderBillHTML(order, shop, cust) {
  const items=order?.items||[], sub=items.reduce((s,i)=>s+i.qty*i.price,0);
  const discount=order?.discount||0, total=sub-discount;
  return `<div class="bill-receipt">
    <div class="bill-header">
      <div class="bill-shop-name gold-text">${esc(shop?.name||'Zara Aura')}</div>
      <div class="bill-shop-address">${esc(shop?.address||'')}</div>
      ${shop?.gst?`<div style="font-size:0.72rem;color:var(--text-light);">GST: ${esc(shop.gst)}</div>`:''}
    </div>
    <div class="bill-meta"><span>Bill #${order.id.slice(-8).toUpperCase()}</span><span>${fmtDate(order.date)}</span></div>
    <div style="font-size:0.82rem;margin-bottom:10px;line-height:1.7;">
      <strong>Customer:</strong> ${esc(cust?.name||order?.guestName||'Guest')}<br/>
      <strong>Payment:</strong> ${order?.paymentMode==='GPay'?'📱 GPay':order?.paymentMode==='PhonePe'?'📱 PhonePe':order?.paymentMode==='Cash'?'💵 Cash':'—'}
      ${order?.employeeName?`<br/><strong>Served by:</strong> ${esc(order.employeeName)}`:''}
    </div>
    <table class="bill-table">
      <thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead>
      <tbody>
        ${items.map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.size||'—')}</td><td>${i.qty}</td><td>${fmt(i.price)}</td><td>${fmt(i.qty*i.price)}</td></tr>`).join('')}
        ${discount>0?`<tr style="color:#2e7d32;"><td colspan="4">Discount (${esc(order.couponCode||'')})</td><td>-${fmt(discount)}</td></tr>`:''}
        <tr class="bill-total-row"><td colspan="4">Total</td><td>${fmt(total)}</td></tr>
      </tbody>
    </table>
    <div class="bill-footer-msg">Thank you for shopping with us! ✦</div>
  </div>`;
}
function buildWhatsAppBill(order, shop, cust) {
  const items=order?.items||[], total=items.reduce((s,i)=>s+i.qty*i.price,0);
  let m=`*${shop?.name||'Zara Aura'} – Receipt*\n_${shop?.address||''}_\n`;
  if(shop?.gst) m+=`GST: ${shop.gst}\n`;
  m+=`\n*Bill No:* #${order?.id?.slice(-8)?.toUpperCase()}\n*Date:* ${fmtDate(order?.date)}\n*Customer:* ${cust?.name||'Guest'}\n\n*Items Purchased:*\n`;
  items.forEach(i=>{ m+=`• ${i.name} (${i.size}) × ${i.qty} = ₹${(i.qty*i.price).toLocaleString('en-IN')}\n`; });
  m+=`\n*Total: ₹${total.toLocaleString('en-IN')}*\n\nThank you for shopping with us! 🛍✨`;
  return m;
}
function renderOrderSuccess(orderId) {
  const order=DB.getOrders().find(o=>o.id===orderId), shop=DB.getShop(), session=DB.getSession();
  const cust=DB.getCustomers().find(c=>c.id===session?.id);
  const shopId=DB.getShopId();
  const feedbackUrl=`${window.location.origin}${window.location.pathname}#feedback?oid=${orderId}&sid=${shopId}`;
  return `<div class="modal-overlay" id="success-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-body" style="text-align:center;padding:36px 28px;">
        <div class="order-status-card" id="order-status-card-${order.id}">
          <div class="order-status-icon">✦</div>
          <h2 style="font-family:var(--font-serif);margin-bottom:8px;color:var(--gold-dark);">Order Placed Successfully!</h2>
          <p style="font-size:0.82rem;color:var(--text-medium);">Order #${order.id.slice(-6).toUpperCase()}</p>
          <div class="order-status-steps" style="margin:16px 0 8px;">
            <div class="status-step done">📋 Order Placed</div>
            <div class="status-step ${['accepted','processing','packing','payment-pending','payment-completed','bill-generated','ready','completed'].includes(order.status)?'done':'waiting'}">⚙️ Processing</div>
            <div class="status-step ${['payment-pending','payment-completed','bill-generated','ready','completed'].includes(order.status)?'done':'waiting'}">💳 Payment</div>
            <div class="status-step ${['bill-generated','ready','completed'].includes(order.status)?'done':'waiting'}">🧾 Bill Generated</div>
            <div class="status-step ${order.status==='completed'?'done':'waiting'}">✓ Completed</div>
          </div>
          <div style="font-size:0.8rem;color:var(--gold-dark);margin-top:8px;">
            Payment: ${order.paymentMode==='Cash'?'💵 Cash':order.paymentMode==='Card'?'💳 Card':'📱 '+(order.paymentMode||'UPI')}
          </div>
        </div>
        <!-- GST Invoice -->
        <div style="margin-top:16px;border:1px solid var(--border-light);border-radius:var(--radius-md);overflow:hidden;">
          ${renderGSTInvoice(orderToInvoiceBill(order, shop), shop)}
        </div>

        <!-- 📬 Delivery Preference -->
        <div style="margin-top:16px;background:var(--cream-2);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border-light);">
          <div style="font-weight:700;font-size:0.9rem;margin-bottom:12px;font-family:var(--font-serif);color:var(--gold-dark);">📬 How would you like to receive your invoice?</div>
          <div class="payment-mode-options" style="margin-bottom:14px;">
            <label class="payment-mode-opt selected">
              <input type="radio" name="deliveryPref" value="whatsapp" checked/>
              <span class="pm-icon">📱</span><span>WhatsApp</span>
            </label>
            <label class="payment-mode-opt">
              <input type="radio" name="deliveryPref" value="print"/>
              <span class="pm-icon">🖨️</span><span>Print</span>
            </label>
            <label class="payment-mode-opt">
              <input type="radio" name="deliveryPref" value="both"/>
              <span class="pm-icon">📲</span><span>Both</span>
            </label>
          </div>
          <button class="btn btn-gold btn-block btn-lg" id="send-invoice-btn" data-order-id="${esc(order.id)}">📤 &nbsp; Send Invoice</button>
          <div id="delivery-status-box" style="margin-top:12px;"></div>
        </div>

        <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">
          <button class="btn btn-gold btn-lg btn-block" id="go-feedback-btn" data-feedback-url="${esc(feedbackUrl)}">⭐ &nbsp; Share Your Feedback</button>
          <button class="btn btn-ghost btn-block" id="close-success-btn">Continue Shopping</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   19. SUPER ADMIN DASHBOARD
═══════════════════════════════════════════════════ */
function renderSuperAdminDash() {
  const session=DB.getSession();
  return `<div>
    <header class="app-header sa-header no-print">
      <div class="app-logo">
        <span class="gold-text">ZARA</span><span class="app-logo-lite">Aura</span>
        <span class="sa-badge">⚡ Super Admin</span>
      </div>
      <div class="header-actions">
        <span class="header-user">⚡ ${esc(session?.name||'')}</span>
        <button class="btn btn-ghost btn-sm" id="logout-btn">Sign Out</button>
      </div>
    </header>
    <div class="sa-page">
      <div class="sa-page-inner">
        <div class="mb-3">
          <div class="dash-page-title">Super Admin Dashboard</div>
          <div class="dash-page-subtitle">Overview of all registered shops on the Zara Aura platform</div>
        </div>
        <div id="sa-shops-container"><div class="page-loading"><div class="loading-spinner"></div></div></div>
      </div>
    </div>
  </div>`;
}

async function loadSuperAdminShops() {
  const container = document.getElementById('sa-shops-container');
  if (!container) return;
  if (!firebaseReady) {
    container.innerHTML = `<div class="alert alert-info">⚡ &nbsp; Firebase is not configured.
      Super Admin shop listing requires Firebase. Please set up <strong>firebase-config.js</strong>.</div>`;
    return;
  }
  try {
    const snap = await db.collection('shops').get();
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">◈</div>
        <div class="empty-state-title">No shops registered yet</div>
        <div class="empty-state-text">Shops will appear here once admins register their boutiques.</div></div>`;
      return;
    }
    const shops = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    const deviceCounts = await Promise.all(
      shops.map(s => db.collection('shops').doc(s.id).collection('devices').get().then(d => d.size).catch(()=>0))
    );
    container.innerHTML = `
      <div class="grid-4 mb-3">
        ${statCard('◈','Total Shops',shops.length,'registered')}
        ${statCard('✦','Platform','Zara Aura','Cloud Synced')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Shop Name</th><th>Owner</th><th>Phone</th><th>Address</th><th>GST</th><th>Registered</th><th>Devices</th><th>Action</th></tr></thead>
        <tbody>${shops.map((shop,i) => {
          const info = shop.shopInfo || shop;
          return `<tr>
            <td class="td-num">${i+1}</td>
            <td><div class="td-shop-cell">
              <div class="td-shop-avatar">🏪</div>
              <div class="td-name">${esc(info.name||'—')}</div></div></td>
            <td>${esc(info.ownerName||'—')}</td>
            <td>${esc(info.phone||'—')}</td>
            <td class="td-address">${esc(info.address||'—')}</td>
            <td>${info.gst?`<code class="td-gst-code">${esc(info.gst)}</code>`:'<span class="td-dash">—</span>'}</td>
            <td class="td-date">${info.createdAt?fmtDate(info.createdAt):'—'}</td>
            <td class="td-num">${deviceCounts[i]}</td>
            <td><button class="btn btn-sm btn-danger sa-delete-btn" data-shopid="${esc(shop.id)}">🗑 Delete</button></td>
          </tr>`;}).join('')}
        </tbody></table></div>`;
    container.querySelectorAll('.sa-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteShop(btn.dataset.shopid));
    });
  } catch (e) {
    console.error('SA shops:', e);
    container.innerHTML = `<div class="alert alert-danger">✕ &nbsp; Failed to load shops: ${e.message}</div>`;
  }
}

/* Push ALL local customers to Firebase — covers customers registered before Firebase was set up */
function syncLocalCustomersToFirebase(shopId) {
  if (!firebaseReady || !shopId) return;
  DB.getCustomers().forEach(c => {
    if (!c.username || !c.id) return;
    db.collection('shops').doc(shopId).collection('customers').doc(c.id).set(c, {merge:true}).catch(()=>{});
    db.collection('users').doc(c.username).set({
      role:'customer', id:c.id, name:c.name, username:c.username,
      password:c.password||'', whatsapp:c.whatsapp||'', shopId
    }, {merge:true}).catch(()=>{});
    db.collection('customerIndex').doc(c.username).set({
      shopId, id:c.id, name:c.name, whatsapp:c.whatsapp||''
    }, {merge:true}).catch(()=>{});
  });
}

async function repairOrphanedCustomers(shopId) {
  if (!firebaseReady || !shopId) return;
  try {
    const usersSnap = await db.collection('users')
      .where('role','==','customer').where('shopId','==',shopId).get();
    for (const doc of usersSnap.docs) {
      const u = doc.data();
      const custId = u.id || doc.id;
      const custRef = db.collection('shops').doc(shopId).collection('customers').doc(custId);
      const exists = await custRef.get().then(s=>s.exists).catch(()=>true);
      if (!exists) {
        await custRef.set({ id:custId, name:u.name||'', username:doc.id,
          password:u.password||'', whatsapp:u.whatsapp||'',
          gender:u.gender||'', size:u.size||'', address:u.address||'' }).catch(()=>{});
      }
    }
  } catch(e) { console.warn('repairOrphanedCustomers:', e); }
}

async function deleteShop(shopId) {
  if (!confirm('Delete this shop permanently? This cannot be undone.')) return;
  try {
    await db.collection('shops').doc(shopId).delete();
    const usersSnap = await db.collection('users').where('shopId','==',shopId).get();
    usersSnap.forEach(u => u.ref.delete());
    showToast('Shop deleted', 'success');
    loadSuperAdminShops();
  } catch (e) {
    console.error('delete shop:', e);
    showToast('Failed to delete shop: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════
   20. RECOMMENDATIONS
═══════════════════════════════════════════════════ */
/* Skin tone → ideal color families */
const SKIN_TONE_COLORS = {
  'Fair':   ['white','cream','pastel','pink','lavender','light blue','peach','mint','rose','ivory','powder'],
  'Light':  ['white','cream','pastel','blue','green','pink','yellow','coral','peach','sky'],
  'Medium': ['earthy','orange','coral','rust','olive','teal','mustard','brown','camel','terracotta'],
  'Warm':   ['gold','orange','red','coral','olive','burgundy','mustard','terracotta','camel'],
  'Dark':   ['bright','red','cobalt','royal blue','magenta','yellow','white','orange','electric','hot pink'],
  'Deep':   ['bold','bright','jewel','magenta','fuchsia','cobalt','royal','electric','white','gold'],
};
function getRecommendations(products, cust, filterSubcat) {
  if (!cust) return [];
  const skinToneColors = cust.skinTone ? (SKIN_TONE_COLORS[cust.skinTone] || []) : [];
  const prefColor = (cust.preferredColor||'').toLowerCase();
  const scoreAndReason = p => {
    let s = 0; const reasons = [];
    const allColors = (p.colors||[{name:p.color||''}]).map(c=>(c.name||'').toLowerCase());
    if (prefColor && allColors.some(c=>c.includes(prefColor))) { s+=4; reasons.push(`Matches your preferred color (${cust.preferredColor})`); }
    if (skinToneColors.length) {
      const matchedColor = allColors.find(c=>skinToneColors.some(sk=>c.includes(sk)||sk.includes(c)));
      if (matchedColor) { s+=3; reasons.push(`Suits your ${cust.skinTone} skin tone`); }
    }
    const allSizes=(p.sizes||[]).map(sz=>sz.size);
    if (cust.size && allSizes.includes(cust.size)) { s+=2; reasons.push(`Available in your size (${cust.size})`); }
    if (cust.gender==='Female'&&p.category==='Women') { s+=2; }
    if (cust.gender==='Male'&&p.category==='Men') { s+=2; }
    if (filterSubcat&&p.subcategory===filterSubcat) s+=2;
    if (cust.occasion&&(p.description||'').toLowerCase().includes(cust.occasion.toLowerCase())) { s+=1; reasons.push(`Good for ${cust.occasion}`); }
    return { score:s, reason: reasons[0]||'Recommended for you' };
  };
  return products
    .map(p=>({ p, ...scoreAndReason(p) }))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score)
    .map(x=>({ ...x.p, _recReason: x.reason }));
}

/* ═══════════════════════════════════════════════════
   20b. IMAGE LIGHTBOX
═══════════════════════════════════════════════════ */
function renderImageLightbox(src, name) {
  return `<div class="img-lightbox-overlay" id="img-lightbox">
    <div class="img-lightbox-toolbar">
      <span style="color:#fff;font-weight:600;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="lb-btn" id="lb-zoom-in" title="Zoom In">＋</button>
        <button class="lb-btn" id="lb-zoom-reset" title="Reset">⟳</button>
        <button class="lb-btn" id="lb-zoom-out" title="Zoom Out">－</button>
        <button class="lb-btn lb-close-btn" id="lb-close-btn" title="Close">✕</button>
      </div>
    </div>
    <div class="img-lightbox-stage" id="lb-stage">
      <img src="${esc(src)}" alt="${esc(name)}" id="lb-main-img" class="lb-img" draggable="false"/>
    </div>
    <div class="img-lightbox-hint">Scroll to zoom · Click outside image to close</div>
  </div>`;
}
window._lbScale = 1;
window.lbSetZoom = function(factor) {
  const img = document.getElementById('lb-main-img');
  if (!img) return;
  if (factor === 0) { window._lbScale = 1; }
  else { window._lbScale = Math.min(5, Math.max(0.5, window._lbScale * factor)); }
  img.style.transform = `scale(${window._lbScale})`;
};
function openLightbox(src, name) {
  document.getElementById('img-lightbox')?.remove();
  window._lbScale = 1;
  document.body.insertAdjacentHTML('beforeend', renderImageLightbox(src, name));
  const overlay = document.getElementById('img-lightbox');
  const stage   = document.getElementById('lb-stage');
  document.getElementById('lb-close-btn')?.addEventListener('click', () => overlay.remove());
  document.getElementById('lb-zoom-in')?.addEventListener('click', () => window.lbSetZoom(1.3));
  document.getElementById('lb-zoom-out')?.addEventListener('click', () => window.lbSetZoom(0.77));
  document.getElementById('lb-zoom-reset')?.addEventListener('click', () => window.lbSetZoom(0));
  stage?.addEventListener('click', e => { if (e.target === stage) overlay.remove(); });
  stage?.addEventListener('wheel', e => {
    e.preventDefault();
    window.lbSetZoom(e.deltaY < 0 ? 1.15 : 0.87);
  }, { passive: false });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove(); });
  overlay.setAttribute('tabindex','0'); overlay.focus();
}

/* ═══════════════════════════════════════════════════
   21. CART LOGIC
═══════════════════════════════════════════════════ */
function addToCart(productId, selectedSize, selectedPrice) {
  const p=DB.getProducts().find(pr=>pr.id===productId); if(!p) return;
  if(+p.quantity===0){showToast('Out of stock','error');return;}
  const sizes=getProductSizes(p);
  const sz = selectedSize || (sizes.length?sizes[0].size:p.size||'');
  const pr = selectedPrice!==undefined?+selectedPrice:(sizes.length?sizes[0].price:+(p.price||0));
  const cartKey = p.id + '|' + sz;
  const existing = state.cart.find(i=>i.cartKey===cartKey);
  if(existing){
    if(existing.qty>=+p.quantity){showToast(`Only ${p.quantity} units available`,'error');return;}
    existing.qty++;
  } else {
    const colorName = arguments[3] !== undefined ? arguments[3] : p.color;
    const colorImg  = arguments[4] !== undefined ? arguments[4] : (p.image||'');
    state.cart.push({cartKey,id:p.id,name:p.name,size:sz,color:colorName,price:pr,image:colorImg,qty:1});
  }
  showToast(`${p.name} (${sz}) added to cart`,'success'); render();
}
function updateCartQty(cartKey, delta) {
  const item=state.cart.find(i=>(i.cartKey||i.id)===cartKey); if(!item) return;
  const p=DB.getProducts().find(pr=>pr.id===item.id), newQty=item.qty+delta;
  if(newQty<=0){removeFromCart(cartKey);return;}
  if(p&&newQty>+p.quantity){showToast('Not enough stock','error');return;}
  item.qty=newQty; render();
}
function removeFromCart(cartKey) { state.cart=state.cart.filter(i=>(i.cartKey||i.id)!==cartKey); render(); }

/* ═══════════════════════════════════════════════════
   22. CHECKOUT
═══════════════════════════════════════════════════ */
function renderCheckoutModal() {
  const session=DB.getSession(), cust=DB.getCustomers().find(c=>c.id===session?.id);
  const cart=state.cart, total=cart.reduce((s,i)=>s+i.qty*i.price,0);
  return `<div class="modal-overlay" id="checkout-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-header"><div><div class="login-role-badge">✦ &nbsp; Checkout</div><div class="modal-title">Confirm Order</div></div>
        <button class="modal-close" data-close-modal="checkout">✕</button></div>
      <div class="modal-body">
        <div style="margin-bottom:18px;">
          ${cart.map(i=>`<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:8px 0;border-bottom:1px solid var(--border-light);">
            <span>${esc(i.name)} × ${i.qty}</span><span style="font-weight:600;">${fmt(i.qty*i.price)}</span></div>`).join('')}
          <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:700;padding-top:12px;color:var(--gold-dark);">
            <span style="font-family:var(--font-serif);">Total</span><span style="font-family:var(--font-serif);">${fmt(total)}</span></div>
        </div>
        <div style="background:var(--gold-lighter);border:1px solid var(--gold-light);border-radius:var(--radius-md);padding:14px;font-size:0.82rem;color:var(--gold-dark);">
          📲 &nbsp; WhatsApp order confirmation will be sent automatically to <strong>${esc(cust?.whatsapp||'your WhatsApp')}</strong>.
        </div>
        <!-- Payment Mode -->
        <div class="payment-mode-section">
          <div class="payment-mode-title">💳 Select Payment Method</div>
          <div class="payment-mode-options">
            ${[{v:'Cash',l:'Cash',i:'💵'},{v:'UPI',l:'UPI / GPay / PhonePe',i:'📱'},{v:'Card',l:'Card',i:'💳'}].map(({v,l,i})=>`
            <label class="payment-mode-opt${(state.selectedPaymentMode||state.paymentMode||'Cash')===v?' selected':''}">
              <input type="radio" name="payMode" value="${v}" ${(state.selectedPaymentMode||state.paymentMode||'Cash')===v?'checked':''}/>
              <span class="pm-icon">${i}</span><span>${l}</span>
            </label>`).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="checkout">Back</button>
        <button class="btn btn-gold btn-lg" id="confirm-order-btn">✦ &nbsp; Confirm &amp; Pay ${fmt(total)}</button>
      </div>
    </div>
  </div>`;
}
function confirmOrder() {
  const session=DB.getSession(), cart=state.cart;
  if(!cart.length){showToast('Cart is empty','error');return;}
  if(!state.paymentMode){showToast('Please select a payment mode','error');document.getElementById('checkout-overlay')?.remove();return;}
  const sub=cart.reduce((s,i)=>s+i.qty*i.price,0);
  const total=sub;
  // Reduce stock per item (size-aware)
  cart.forEach(item=>{
    const p=DB.getProducts().find(pr=>pr.id===item.id);
    if(!p) return;
    if((p.hasSizes||p.sizeStock?.length)&&item.size){
      const newSS=(p.sizeStock||[]).map(s=>s.size===item.size?{...s,stock:Math.max(0,s.stock-item.qty)}:s);
      DB.updateProduct(item.id,{sizeStock:newSS,quantity:newSS.reduce((s,x)=>s+x.stock,0)});
    } else {
      DB.updateProduct(item.id,{quantity:Math.max(0,+p.quantity-item.qty)});
    }
  });
  const order={
    id:uid(), customerId:session?.id,
    customerName:session?.name||'Guest',
    guestName:session?.isGuest?session?.name:null,
    items:cart.map(i=>({id:i.id,name:i.name,size:i.size||'',color:i.color||'',price:i.price,qty:i.qty,image:i.image||''})),
    total, paymentMode:state.paymentMode,
    status:'pending', date:Date.now()
  };
  DB.addOrder(order);
  state.cart=[]; state.paymentMode=''; state.selectedPaymentMode='Cash'; state.cartOpen=false;
  document.getElementById('checkout-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', renderOrderSuccess(order.id));
  // Close success overlay
  document.getElementById('close-success-btn')?.addEventListener('click',()=>{document.getElementById('success-overlay')?.remove();render();});
  // Delivery preference radio — highlight selected
  document.querySelectorAll('input[name="deliveryPref"]').forEach(r=>{
    r.addEventListener('change',()=>{
      document.querySelectorAll('.payment-mode-opt').forEach(l=>l.classList.toggle('selected',l.querySelector('input[name="deliveryPref"]')?.checked));
    });
  });
  // Send Invoice button
  document.getElementById('send-invoice-btn')?.addEventListener('click', e=>{
    const oid = e.currentTarget.dataset.orderId;
    const pref = document.querySelector('input[name="deliveryPref"]:checked')?.value || 'whatsapp';
    executeOrderDelivery(oid, pref);
  });
  showToast('✅ Order placed! Select delivery method below.','success');
}

/* confirmAndDeliver — creates order from cart then immediately WhatsApps or prints */
async function confirmAndDeliver(pref) {
  const session = DB.getSession(), cart = state.cart;
  if (!cart.length) { showToast('Cart is empty','error'); return; }
  if (!state.paymentMode) { showToast('Please select a payment mode','error'); return; }
  const shop = DB.getShop();
  const sub  = cart.reduce((s,i) => s + i.qty * i.price, 0);

  // Reduce stock per item (size-aware)
  cart.forEach(item => {
    const p = DB.getProducts().find(pr => pr.id === item.id);
    if (!p) return;
    if ((p.hasSizes || p.sizeStock?.length) && item.size) {
      const newSS = (p.sizeStock||[]).map(s => s.size===item.size ? {...s, stock: Math.max(0, s.stock-item.qty)} : s);
      DB.updateProduct(item.id, {sizeStock: newSS, quantity: newSS.reduce((s,x)=>s+x.stock,0)});
    } else {
      DB.updateProduct(item.id, {quantity: Math.max(0, +p.quantity - item.qty)});
    }
  });

  const order = {
    id: uid(), customerId: session?.id,
    customerName: session?.name || 'Guest',
    guestName: session?.isGuest ? session?.name : null,
    customerPhone: session?.phone || '',
    items: cart.map(i => ({id:i.id, name:i.name, size:i.size||'', color:i.color||'', price:i.price, qty:i.qty, image:i.image||''})),
    total: sub, paymentMode: state.paymentMode,
    status: 'pending', date: Date.now()
  };
  DB.addOrder(order);
  state.cart = []; state.paymentMode = ''; state.selectedPaymentMode = ''; state.cartOpen = false;
  render();

  // Show full success overlay (GST invoice + status box + re-send option)
  document.body.insertAdjacentHTML('beforeend', renderOrderSuccess(order.id));

  // Wire up buttons inside success overlay
  document.getElementById('close-success-btn')?.addEventListener('click', () => {
    document.getElementById('success-overlay')?.remove(); render();
  });
  document.getElementById('go-feedback-btn')?.addEventListener('click', e => {
    const url = e.currentTarget.dataset.feedbackUrl; if (url) window.location.href = url;
  });
  document.querySelectorAll('input[name="deliveryPref"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.payment-mode-opt').forEach(l =>
        l.classList.toggle('selected', !!l.querySelector('input[name="deliveryPref"]')?.checked));
    });
  });
  document.getElementById('send-invoice-btn')?.addEventListener('click', e => {
    const oid  = e.currentTarget.dataset.orderId;
    const pref2 = document.querySelector('input[name="deliveryPref"]:checked')?.value || 'whatsapp';
    executeOrderDelivery(oid, pref2);
  });

  // Execute the delivery choice immediately and show all status steps
  await executeOrderDelivery(order.id, pref);
}

/* ═══════════════════════════════════════════════════
   22a. ADMIN COUPONS
═══════════════════════════════════════════════════ */
function renderAdminCoupons() {
  const coupons=DB.getCoupons();
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">🎟 Coupon Codes</div>
    <div class="dash-page-subtitle">Create discount coupons for customers</div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">Create New Coupon</div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Code *</label>
            <input class="form-control" id="cp-code" placeholder="e.g. SAVE20" style="text-transform:uppercase;"/></div>
          <div class="form-group"><label class="form-label">Type</label>
            <select class="form-control" id="cp-type">
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed (₹)</option>
            </select></div>
          <div class="form-group"><label class="form-label">Value *</label>
            <input type="number" class="form-control" id="cp-value" placeholder="e.g. 10" min="1"/></div>
          <div class="form-group"><label class="form-label">Min. Order (₹)</label>
            <input type="number" class="form-control" id="cp-min" placeholder="0 = no min" min="0"/></div>
        </div>
        <button class="btn btn-gold" id="create-coupon-btn">+ Create Coupon</button>
      </div>
    </div>
    ${coupons.length?`<div class="table-wrap"><table>
      <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Min Order</th><th>Used</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${coupons.map(c=>`<tr>
        <td><strong><code style="background:var(--cream-2);padding:2px 6px;border-radius:4px;">${esc(c.code)}</code></strong></td>
        <td>${c.type==='percent'?'%':'₹ Fixed'}</td>
        <td style="font-weight:700;color:var(--gold-dark);">${c.type==='percent'?c.discount+'% off':'₹'+c.discount+' off'}</td>
        <td style="color:var(--text-light);">${c.minOrder>0?'₹'+c.minOrder:'—'}</td>
        <td style="color:var(--text-medium);">${c.usedCount||0}×</td>
        <td><span class="badge ${c.active?'badge-success':'badge-danger'}">${c.active?'Active':'Inactive'}</span></td>
        <td style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-outline coupon-toggle-btn" data-cid="${esc(c.id)}">${c.active?'Deactivate':'Activate'}</button>
          <button class="btn btn-sm btn-danger-icon coupon-delete-btn" data-cid="${esc(c.id)}">✕</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`:'<div class="empty-state"><div class="empty-state-icon">🎟</div><div class="empty-state-title">No coupons yet</div></div>'}
  </div>`;
}

/* ═══════════════════════════════════════════════════
   22b. ADMIN SMS OFFERS
═══════════════════════════════════════════════════ */
function renderAdminSms() {
  const customers = DB.getCustomers();
  const shop = DB.getShop();
  const hasBackend = !!BACKEND_URL;

  return `
  <div class="section-header">
    <h2 class="section-title">📣 Send Offers via SMS</h2>
    <p class="text-muted" style="margin-top:4px;">Send promotional SMS directly to your customers via Twilio</p>
  </div>

  <div class="grid-3" style="margin-bottom:24px;max-width:640px;">
    <div class="stat-card">
      <div class="stat-value">${customers.length}</div>
      <div class="stat-label">Total Customers</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:var(--gold)">${customers.filter(c=>c.whatsapp).length}</div>
      <div class="stat-label">With Phone</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:${hasBackend?'#2E7D32':'#f59e0b'}">${hasBackend?'Twilio SMS':'WhatsApp'}</div>
      <div class="stat-label">Send Method</div>
    </div>
  </div>

  ${!hasBackend?`<div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:var(--radius-md);padding:12px 16px;margin-bottom:20px;font-size:0.84rem;color:#7B6200;">
    💬 Sending via <strong>WhatsApp</strong> — messages will open pre-filled for each customer. To switch to auto SMS, configure your Twilio backend.
  </div>`:''}

  <div class="card" style="padding:28px;max-width:680px;">
    <h3 style="font-family:var(--font-serif);margin-bottom:20px;">Compose &amp; Send ${hasBackend?'SMS':'WhatsApp Message'}</h3>

    <div class="form-group" style="margin-bottom:18px;">
      <label class="form-label">Send To <span class="required">*</span></label>
      <div class="radio-group" style="margin-bottom:14px;">
        <label class="radio-item"><input type="radio" name="sms-target" value="all" id="sms-target-all" checked/> All Customers (${customers.length})</label>
        <label class="radio-item"><input type="radio" name="sms-target" value="specific" id="sms-target-specific"/> Specific Customers</label>
      </div>
      <div id="sms-customer-list" style="display:none;max-height:220px;overflow-y:auto;border:1px solid var(--border-light);border-radius:var(--radius-md);padding:10px;background:var(--cream-2);">
        ${customers.length===0
          ?`<p class="text-muted" style="text-align:center;padding:16px;">No customers yet.</p>`
          :customers.map(c=>`
          <label style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border-light);cursor:pointer;">
            <input type="checkbox" class="sms-cust-check" value="${esc(c.whatsapp||'')}" data-name="${esc(c.name)}" ${c.whatsapp?'':'disabled'}/>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:0.88rem;">${esc(c.name)}</div>
              <div style="font-size:0.76rem;color:var(--text-light);">${c.whatsapp?`📱 ${esc(c.whatsapp)}`:'No phone number'}</div>
            </div>
          </label>`).join('')}
      </div>
    </div>

    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">Message <span class="required">*</span></label>
      <textarea class="form-control" id="sms-offer-msg"
        placeholder="e.g. 🎉 Big Sale at ${esc(shop?.name||'our store')}! Up to 50% off. Visit us today!"
        rows="4" maxlength="320" style="resize:vertical;"></textarea>
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <small class="form-hint">Max 320 characters</small>
        <small class="form-hint" id="sms-char-count">0 / 320</small>
      </div>
    </div>

    <div style="background:var(--cream-2);border:1px solid var(--border-light);border-radius:var(--radius-md);padding:14px;margin-bottom:18px;">
      <div style="font-size:0.76rem;color:var(--text-medium);font-weight:700;margin-bottom:6px;">📱 Preview</div>
      <div id="sms-preview" style="font-size:0.88rem;color:var(--text-light);white-space:pre-wrap;min-height:36px;line-height:1.6;">Your message will appear here…</div>
    </div>

    <button class="btn btn-gold btn-lg" id="sms-offer-btn" ${customers.length===0?'disabled':''}>
      ${hasBackend?'📤':'💬'} &nbsp; ${hasBackend?'Send SMS to Customers':'Send via WhatsApp'}
    </button>
    ${customers.length===0?`<p class="form-hint" style="margin-top:8px;">No customers registered yet.</p>`:''}

    <div id="sms-result" style="margin-top:16px;display:none;"></div>
  </div>

  <!-- WhatsApp Send Queue (shown when backend not configured) -->
  <div id="wa-send-queue" style="display:none;margin-top:24px;max-width:680px;">
    <div class="card" style="padding:24px;">
      <h4 style="font-family:var(--font-serif);margin-bottom:6px;">💬 WhatsApp Send Queue</h4>
      <p class="text-muted" style="margin-bottom:16px;font-size:0.84rem;">Click each button to open WhatsApp with your message pre-filled, then press Send inside WhatsApp.</p>
      <div id="wa-queue-list"></div>
      <div id="wa-queue-summary" style="margin-top:14px;font-size:0.84rem;font-weight:600;color:var(--text-medium);"></div>
    </div>
  </div>

  <!-- SMS Delivery Logs (shown when backend configured) -->
  ${hasBackend?`<div style="margin-top:32px;max-width:680px;">
    <h3 style="font-family:var(--font-serif);margin-bottom:14px;">📋 SMS Delivery Logs</h3>
    <div id="sms-logs-list"><div class="text-muted" style="padding:20px 0;text-align:center;font-size:0.85rem;">Loading logs…</div></div>
  </div>`:''}
`;
}

/* ═══════════════════════════════════════════════════
   22b. FEEDBACK — CUSTOMER FORM
═══════════════════════════════════════════════════ */
function renderCustomerFeedbackForm() {
  const session = DB.getSession();
  const shopId  = DB.getShopId();
  return `
  <div class="section-header">
    <h2 class="section-title">⭐ Share Your Feedback</h2>
    <p class="text-muted" style="margin-top:4px;">We'd love to hear about your experience!</p>
  </div>
  <div class="card" style="padding:28px;max-width:560px;">
    <form id="customer-feedback-form">
      <div style="display:flex;flex-direction:column;gap:18px;">
        <div class="form-group">
          <label class="form-label">Your Rating <span class="required">*</span></label>
          <div class="star-rating" id="star-rating-widget">
            ${[1,2,3,4,5].map(n=>`
              <button type="button" class="star-btn${state.feedbackRating>=n?' active':''}" data-star="${n}" title="${n} star${n>1?'s':''}">★</button>`).join('')}
          </div>
          <input type="hidden" id="feedback-rating-hidden" name="rating" value="${state.feedbackRating||''}"/>
          <small class="form-hint">${['','Poor','Fair','Good','Very Good','Excellent'][state.feedbackRating]||'Click to rate'}</small>
        </div>

        <div class="form-group">
          <label class="form-label">Your Experience <span class="optional-tag">(Optional)</span></label>
          <textarea class="form-control" name="message" placeholder="Tell us what you liked or how we can improve…"
            rows="3" maxlength="500" style="resize:vertical;"></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Would you recommend us?</label>
          <div style="display:flex;gap:12px;margin-top:8px;">
            <label class="radio-chip"><input type="radio" name="recommend" value="yes"/> 👍 Yes, definitely!</label>
            <label class="radio-chip"><input type="radio" name="recommend" value="no"/> 👎 Not right now</label>
          </div>
        </div>

        <button type="submit" class="btn btn-gold btn-lg" id="feedback-submit-btn">
          ✉️ &nbsp; Submit Feedback
        </button>
      </div>
    </form>
    <div id="feedback-success" style="display:none;text-align:center;padding:24px 0;">
      <div style="font-size:3rem;">🙏</div>
      <h3 style="font-family:var(--font-serif);margin:12px 0 8px;">Thank You!</h3>
      <p class="text-muted">Your feedback means a lot to us. We'll keep improving!</p>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   22c. ADMIN FEEDBACK VIEW
═══════════════════════════════════════════════════ */
function renderAdminFeedback() {
  return `
  <div class="section-header">
    <h2 class="section-title">⭐ Ratings &amp; Reviews</h2>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <select class="form-control" id="feedback-filter-rating" style="width:auto;padding:6px 14px;font-size:0.84rem;border-radius:20px;">
        <option value="">All Stars</option>
        <option value="5">★★★★★ 5 Stars</option>
        <option value="4">★★★★☆ 4 Stars</option>
        <option value="3">★★★☆☆ 3 Stars</option>
        <option value="2">★★☆☆☆ 2 Stars</option>
        <option value="1">★☆☆☆☆ 1 Star</option>
      </select>
      <button class="btn btn-sm btn-outline" id="feedback-refresh-btn">🔄 Refresh</button>
    </div>
  </div>

  <!-- Summary row -->
  <div class="feedback-summary-row" id="feedback-summary-row" style="display:none;margin-bottom:22px;">
    <div class="feedback-summary-card">
      <div class="fscard-val" id="fb-total">0</div>
      <div class="fscard-lbl">Total Reviews</div>
    </div>
    <div class="feedback-summary-card">
      <div class="fscard-val gold" id="fb-avg">—</div>
      <div class="fscard-lbl">Avg. Rating</div>
      <div class="fscard-stars" id="fb-avg-stars"></div>
    </div>
    <div class="feedback-summary-card">
      <div class="fscard-val green" id="fb-positive">0</div>
      <div class="fscard-lbl">😊 Happy (4-5★)</div>
    </div>
    <div class="feedback-summary-card">
      <div class="fscard-val red" id="fb-negative">0</div>
      <div class="fscard-lbl">😟 Needs Care (≤2★)</div>
    </div>
  </div>

  <!-- Reviews list -->
  <div id="feedback-list">
    <div class="feedback-loading">
      <div style="font-size:2rem;">⭐</div>
      <div style="margin-top:10px;color:var(--text-light);font-size:0.9rem;">Loading reviews…</div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════
   22d. CHART INITIALIZATION
═══════════════════════════════════════════════════ */
let _charts = {};
function postRender() {
  // Destroy old chart instances before creating new ones
  Object.values(_charts).forEach(c => { try { c.destroy(); } catch(_) {} });
  _charts = {};

  // Auto-load admin feedback when on feedback tab
  if (state.route === 'admin' && state.subRoute === 'feedback') {
    setTimeout(() => loadAdminFeedback(), 100);
  }
  // Auto-load SMS logs when on sms tab
  if (state.route === 'admin' && state.subRoute === 'sms') {
    setTimeout(() => loadSmsLogs(), 200);
  }

  // ── ML enhancements (dormant unless backendConfig.mlUrl is set) ──
  if (window.AuraML && AuraML.ready()) {
    if (state.route === 'customer') setTimeout(() => AuraML.enhanceRecommendations(), 50);
    if (state.route === 'admin' && state.subRoute === 'analytics') setTimeout(() => AuraML.enhanceForecast(), 50);
  }

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false } },
  };

  // Admin Analytics – Revenue chart
  const revenueCanvas = document.getElementById('chart-revenue');
  if (revenueCanvas && typeof Chart !== 'undefined') {
    const d = getAnalyticsData(state.analyticsPeriod || 'monthly');
    _charts.revenue = new Chart(revenueCanvas, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [{ label:'Revenue (₹)', data: d.revenue,
          backgroundColor: 'rgba(201,168,76,0.45)', borderColor:'#C9A84C',
          borderWidth: 2, borderRadius: 6 }]
      },
      options: { ...chartDefaults, scales: { y: { beginAtZero:true,
        ticks:{ callback: v=>'₹'+Number(v).toLocaleString('en-IN') } } } }
    });
  }

  // Admin Analytics – Orders chart
  const ordersCanvas = document.getElementById('chart-orders');
  if (ordersCanvas && typeof Chart !== 'undefined') {
    const d = getAnalyticsData(state.analyticsPeriod || 'monthly');
    _charts.orders = new Chart(ordersCanvas, {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [{ label:'Orders', data: d.orders,
          borderColor:'#6B8CAE', backgroundColor:'rgba(107,140,174,0.12)',
          borderWidth: 2.5, tension: 0.4, fill: true,
          pointBackgroundColor:'#6B8CAE', pointRadius: 5 }]
      },
      options: { ...chartDefaults, scales: { y: { beginAtZero:true, ticks:{stepSize:1} } } }
    });
  }

  // Employee Salary chart
  const salaryCanvas = document.getElementById('chart-salary');
  if (salaryCanvas && typeof Chart !== 'undefined') {
    const session = DB.getSession();
    const emp = DB.getEmployees().find(e => e.id === session?.id);
    let history = emp ? [...(emp.salaryHistory || [])] : [];
    if (history.length === 0 && emp?.salary)
      history.push({ date: emp.joinDate||emp.addedDate||Date.now(), amount: emp.salary, note:'Starting salary' });
    const labels  = history.map(h => fmtDate(h.date));
    const amounts = history.map(h => h.amount);
    _charts.salary = new Chart(salaryCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label:'Salary (₹)', data: amounts,
          borderColor:'#C9A84C', backgroundColor:'rgba(201,168,76,0.12)',
          borderWidth: 2.5, tension: 0.4, fill: true,
          pointBackgroundColor:'#C9A84C', pointRadius: 7, pointHoverRadius: 9 }]
      },
      options: { ...chartDefaults,
        plugins: { ...chartDefaults.plugins,
          tooltip: { callbacks: { label: ctx=>'₹'+Number(ctx.parsed.y).toLocaleString('en-IN') } } },
        scales: { y: { beginAtZero:false,
          ticks:{ callback: v=>'₹'+Number(v).toLocaleString('en-IN') } } } }
    });
  }
}

/* ── Live Bill Preview (shop registration form) ── */
function updateBillPreview() {
  const f = id => document.getElementById(id)?.value || '';
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const name    = f('reg-name')    || 'Your Shop Name';
  const address = f('reg-address') || 'Shop address will appear here';
  const phone   = f('reg-phone');
  const gst     = f('reg-gst');
  const upi     = f('reg-upi');
  const footer  = f('reg-footer')  || 'Thank you for shopping with us! ✦';
  set('prev-shop-name', esc(name));
  set('prev-shop-addr', esc(address));
  set('prev-shop-phone', phone ? '📞 ' + esc(phone) : '');
  set('prev-shop-gst', gst ? 'GSTIN: ' + esc(gst.toUpperCase()) : '');
  set('prev-upi', upi ? '📱 UPI: ' + esc(upi) : '');
  set('prev-footer', esc(footer));
  set('prev-shop-footer-name', name ? '— ' + esc(name) : '');
}

/* ═══════════════════════════════════════════════════
   23. EVENT LISTENERS
═══════════════════════════════════════════════════ */
function attachListeners() {
  const on    = (sel, evt, fn) => document.querySelector(sel)?.addEventListener(evt, fn);
  const onAll = (sel, evt, fn) => document.querySelectorAll(sel).forEach(el => el.addEventListener(evt, fn));

  /* Landing */
  onAll('.login-option-card','click', e => {
    const role=e.currentTarget.dataset.role;
    if(role==='admin'&&!DB.getShop()&&!firebaseReady){navigate('register-shop');return;}
    state.loginRole=role;
    if(role==='customer'){ navigate('customer-login-choose'); return; }
    navigate('login');
  });

  /* Customer login choose screen */
  on('#cust-existing-btn','click', ()=>{ state.loginRole='customer'; navigate('login'); });
  on('#cust-new-btn','click', ()=>navigate('register-customer'));
  on('#setup-shop-link','click', ()=>navigate('register-shop'));
  on('#sa-link','click', ()=>{state.loginRole='super-admin';navigate('login');});

  /* Login */
  on('#login-submit-btn','click', async ()=>{
    const form=document.getElementById('login-form');
    if(!form) return;
    const btn=document.getElementById('login-submit-btn');
    const username=(form.querySelector('[name="username"]')?.value||'').trim();
    const password=(form.querySelector('[name="password"]')?.value||'').trim();
    const mobile=(form.querySelector('[name="mobile"]')?.value||'').trim();
    const attendedBy=(form.querySelector('[name="attendedBy"]')?.value||'').trim();
    if(!username){ showToast('Please enter your username','error'); return; }
    if(state.loginRole==='customer'&&!password&&!mobile){ showToast('Please enter your password or mobile number','error'); return; }
    if(state.loginRole!=='customer'&&state.loginRole!=='super-admin'&&!password){ showToast('Please enter your password','error'); return; }
    if(btn){btn.disabled=true;btn.textContent='Signing in…';}
    const credential = password || mobile || '';
    const ok=await login(state.loginRole, username, credential, mobile);
    if(btn){btn.disabled=false;btn.textContent='Sign In';}
    if(ok){
      if(state.loginRole==='customer' && attendedBy){
        const session=DB.getSession();
        if(session?.id) DB.updateCustomer(session.id,{attendedBy, attendedDate:new Date().toISOString().slice(0,10)});
      }
      if(state.loginRole==='admin') navigate('admin');
      else if(state.loginRole==='employee') navigate('employee');
      else if(state.loginRole==='super-admin'){navigate('super-admin');loadSuperAdminShops();}
      else navigate('customer');
    }
  });
  on('#go-register-customer','click', ()=>navigate('register-customer'));
  on('#back-to-landing','click', ()=>navigate('landing'));
  on('#back-to-login-customer','click', ()=>{state.loginRole='customer';navigate('login');});

  /* Forgot Password — link in login form */
  on('#forgot-password-link','click', ()=>{
    state.fpStep=1; state.fpVerifiedUser=null; state.fpOtp=null;
    state.fpOtpExpiry=null; state.fpFoundUser=null;
    navigate('forgot-password');
  });

  /* ── Helper: look up user by username, return {name,phone,type,id,shopId,username} or null ── */
  async function fpLookupUser(username, role) {
    // Try Firebase first
    if (firebaseReady) {
      try {
        const userDoc = await db.collection('users').doc(username).get();
        if (userDoc.exists) {
          const u = userDoc.data();
          if (u.role !== role) return null;
          let phone = '';
          if (role === 'admin') {
            const shopSnap = await db.collection('shops').doc(u.shopId).get();
            phone = shopSnap.exists ? (shopSnap.data().shopInfo?.phone || '') : '';
          } else if (role === 'employee') {
            const empSnap = await db.collection('shops').doc(u.shopId).collection('employees').doc(u.id).get();
            phone = empSnap.exists ? (empSnap.data().phone || '') : '';
          } else if (role === 'customer') {
            const custSnap = await db.collection('shops').doc(u.shopId).collection('customers').doc(u.id).get();
            phone = custSnap.exists ? (custSnap.data().whatsapp || '') : '';
          }
          if (!phone) return null;
          return { name:u.name, phone, type:role, id:u.id, shopId:u.shopId, username };
        }
      } catch(err){ console.error('FP lookup Firebase:',err); }
    }
    // Fallback: localStorage
    if (role === 'admin') {
      const shop = DB.getShop();
      if (shop && shop.adminUsername === username && shop.phone)
        return { name:shop.ownerName, phone:shop.phone, type:'admin', username };
    } else if (role === 'employee') {
      const emp = DB.getEmployees().find(e => e.username === username);
      if (emp && emp.phone) return { name:emp.name, phone:emp.phone, type:'employee', id:emp.id, username };
    } else if (role === 'customer') {
      const cust = DB.getCustomers().find(c => c.username === username);
      if (cust && cust.whatsapp) return { name:cust.name, phone:cust.whatsapp, type:'customer', id:cust.id, username };
    }
    return null;
  }

  /* ── Helper: send OTP via backend (Twilio SMS) ── */
  async function fpSendOtp(phone) {
    if (BACKEND_URL) {
      try {
        const r = await apiPost('/api/otp/send', { phone });
        if (r.success) return { ok: true, via: 'sms' };
        return { ok: false, error: r.error };
      } catch(err) { console.warn('Backend OTP send failed, falling back to WhatsApp:', err); }
    }
    // Fallback: local OTP + WhatsApp (when backend not configured)
    const otp = generateOtp();
    state.fpOtp = otp;
    state.fpOtpExpiry = Date.now() + 5 * 60 * 1000;
    const shop = DB.getShop();
    const msg = `🔐 *${shop?.name||'Zara Aura'} — Password Reset OTP*\n\nYour OTP: *${otp}*\n\nValid for 5 minutes. Do not share.`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    return { ok: true, via: 'whatsapp' };
  }

  /* ── Helper: verify OTP via backend (Twilio Verify) ── */
  async function fpVerifyOtp(phone, code) {
    if (BACKEND_URL && !state.fpOtp) {
      // Using Twilio Verify — backend checks the code
      try {
        const r = await apiPost('/api/otp/verify', { phone, code });
        return r.success;
      } catch(err) { console.warn('Backend OTP verify failed:', err); return false; }
    }
    // Fallback: local check
    if (!state.fpOtp || !state.fpOtpExpiry) return false;
    if (Date.now() > state.fpOtpExpiry) return false;
    return code === state.fpOtp;
  }

  /* Forgot Password — Step 1: Send OTP */
  on('#fp-step1-form','submit', async e=>{
    e.preventDefault();
    const username = document.getElementById('fp-username-input')?.value.trim();
    if (!username) return;
    const role = state.loginRole;
    const btn = document.getElementById('fp-send-otp-btn');
    if(btn){btn.disabled=true;btn.textContent='Looking up account…';}

    const found = await fpLookupUser(username, role);
    if (!found) {
      if(btn){btn.disabled=false;btn.textContent='📱  Send OTP';}
      showToast('No account found for this username. Please check and try again.', 'error');
      return;
    }

    if(btn){btn.textContent='Sending OTP…';}
    const result = await fpSendOtp(found.phone);
    if(btn){btn.disabled=false;btn.textContent='📱  Send OTP';}

    if (!result.ok) {
      showToast(result.error || 'Failed to send OTP. Please try again.', 'error');
      return;
    }
    state.fpFoundUser = found;
    state.fpStep = 2;
    const via = result.via === 'sms' ? 'SMS' : 'WhatsApp';
    showToast(`OTP sent via ${via} to number ending in ${maskPhone(found.phone)}`, 'success');
    render(); postRender();
  });

  /* Forgot Password — Step 2: Verify OTP */
  on('#fp-otp-form','submit', async e=>{
    e.preventDefault();
    const entered = document.getElementById('fp-otp-input')?.value.trim();
    const btn = document.getElementById('fp-verify-otp-btn');
    if(btn){btn.disabled=true;btn.textContent='Verifying…';}

    const ok = await fpVerifyOtp(state.fpFoundUser?.phone, entered);
    if(btn){btn.disabled=false;btn.textContent='✅  Verify OTP';}

    if (!ok) {
      showToast('Incorrect or expired OTP. Please try again.', 'error'); return;
    }
    state.fpStep = 3;
    state.fpOtp = null;
    showToast('OTP verified! Set your new password.', 'success');
    render(); postRender();
  });

  /* Forgot Password — Resend OTP */
  on('#fp-resend-otp-btn','click', async ()=>{
    if (!state.fpFoundUser) { state.fpStep=1; render(); return; }
    const btn = document.getElementById('fp-resend-otp-btn');
    if(btn){btn.disabled=true;btn.textContent='Sending…';}
    const result = await fpSendOtp(state.fpFoundUser.phone);
    if(btn){btn.disabled=false;btn.textContent='🔄 Resend OTP';}
    if (result.ok) showToast('New OTP sent!', 'success');
    else showToast(result.error || 'Failed to resend OTP.', 'error');
  });

  /* Forgot Password — Step 3: Save new password */
  on('#fp-step3-form','submit', async e=>{
    e.preventDefault();
    const newPass = document.getElementById('fp-newpass')?.value;
    const confirmPass = document.getElementById('fp-confirmpass')?.value;
    if (newPass !== confirmPass) { showToast('Passwords do not match','error'); return; }
    if (newPass.length < 4) { showToast('Password must be at least 4 characters','error'); return; }
    const user = state.fpFoundUser;
    const role = state.loginRole;
    const btn = document.getElementById('fp-save-btn');
    if(btn){btn.disabled=true;btn.textContent='Saving…';}
    try {
      if (role === 'admin') {
        const shop = DB.getShop();
        if (shop) { shop.adminPassword = newPass; _ls(KEYS.shop, shop); }
        if (firebaseReady && user.shopId) {
          await db.collection('shops').doc(user.shopId).update({'shopInfo.adminPassword':newPass}).catch(()=>{});
          await db.collection('users').doc(user.username).update({password:newPass}).catch(()=>{});
        }
      } else if (role === 'employee') {
        const emps = DB.getEmployees();
        const idx = emps.findIndex(e => e.username === user.username);
        if (idx >= 0) { emps[idx].password = newPass; _ls(KEYS.employees, emps); }
        if (firebaseReady) {
          await db.collection('users').doc(user.username).update({password:newPass}).catch(()=>{});
          if (user.shopId && user.id)
            await db.collection('shops').doc(user.shopId).collection('employees').doc(user.id).update({password:newPass}).catch(()=>{});
        }
      } else if (role === 'customer') {
        const custs = DB.getCustomers();
        const idx = custs.findIndex(c => c.username === user.username);
        if (idx >= 0) { custs[idx].password = newPass; _ls(KEYS.customers, custs); }
        if (firebaseReady) {
          await db.collection('users').doc(user.username).update({password:newPass}).catch(()=>{});
          if (user.shopId && user.id)
            await db.collection('shops').doc(user.shopId).collection('customers').doc(user.id).update({password:newPass}).catch(()=>{});
        }
      }
      showToast('✅ Password reset successfully! Please login with your new password.','success');
      state.fpStep=1; state.fpVerifiedUser=null; state.fpOtp=null;
      state.fpOtpExpiry=null; state.fpFoundUser=null;
      navigate('login');
    } catch(err) {
      console.error('FP reset error:',err);
      showToast('Error resetting password. Please try again.','error');
      if(btn){btn.disabled=false;btn.textContent='🔐  Reset Password';}
    }
  });

  /* Forgot Password — Show/hide password toggle */
  onAll('.password-toggle-btn','click', e=>{
    const targetId = e.currentTarget.dataset.target;
    const input = document.getElementById(targetId);
    if (input) {
      input.type = input.type==='password' ? 'text' : 'password';
      e.currentTarget.textContent = input.type==='password' ? '👁' : '🙈';
    }
  });

  /* Forgot Password — Back to login */
  on('#back-to-login-fp','click', ()=>{
    state.fpStep=1; state.fpVerifiedUser=null; state.fpOtp=null;
    state.fpOtpExpiry=null; state.fpFoundUser=null;
    navigate('login');
  });

  /* Shop registration */
  on('#shop-register-form','submit', async e=>{
    e.preventDefault();
    const fd=new FormData(e.target), btn=document.getElementById('shop-register-btn');
    const shop={
      name:fd.get('name'), ownerName:fd.get('ownerName'), address:fd.get('address'),
      phone:fd.get('phone'), gst:fd.get('gst')||'',
      upiId:fd.get('upiId')||'',
      billFooter:fd.get('billFooter')||'Thank you for shopping with us! ✦',
      adminUsername:fd.get('adminUsername'), adminPassword:fd.get('adminPassword'),
      createdAt:Date.now()
    };
    if(!shop.name||!shop.ownerName||!shop.address||!shop.phone||!shop.adminUsername||!shop.adminPassword){showToast('Fill all required fields','error');return;}
    if(!/^[0-9]{10}$/.test(shop.phone)){showToast('Phone number must be exactly 10 digits','error');return;}
    if(shop.gst && !/^[A-Z0-9]{15}$/.test(shop.gst.toUpperCase())){showToast('GST number must be exactly 15 alphanumeric characters','error');return;}
    if(shop.gst) shop.gst=shop.gst.toUpperCase();
    if(btn){btn.disabled=true;btn.textContent='Setting up…';}
    if(firebaseReady){
      try{
        const ex=await db.collection('users').doc(shop.adminUsername).get();
        if(ex.exists){showToast('Username already taken. Choose another.','error');if(btn){btn.disabled=false;btn.textContent='✦ Launch My Boutique';}return;}
        const shopId=uid();
        await db.collection('shops').doc(shopId).set({shopInfo:shop,categories:[],createdAt:Date.now()});
        await db.collection('users').doc(shop.adminUsername).set({role:'admin',shopId,name:shop.ownerName,id:shopId,password:shop.adminPassword});
        _ls(KEYS.shopId,shopId); state.shopId=shopId; Sync.start(shopId);
      }catch(err){console.error('Shop register:',err);showToast('Could not save to cloud. Saved locally.','warning');}
    }
    DB.setShop(shop,_ls(KEYS.shopId));
    DB.setSession({role:'admin',name:shop.ownerName,username:shop.adminUsername});
    showToast(`Welcome to Zara Aura, ${shop.name}!`,'success');
    navigate('admin');
  });

  /* Customer registration */
  on('#customer-register-form','submit', async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const regShopId = DB.getShopId();
    if(!regShopId){ showToast('No shop found on this device. Please register on the shop\'s device.','error'); return; }
    // Only check THIS shop's customer list — not the global users collection
    if(DB.getCustomers().find(c=>c.username===fd.get('username'))){showToast('Username already taken','error');return;}
    if(firebaseReady){
      try{
        const custSnap=await db.collection('shops').doc(regShopId).collection('customers')
          .where('username','==',fd.get('username')).get();
        if(!custSnap.empty){showToast('Username already taken','error');return;}
      }catch(_){}
    }
    const cust={id:uid(),name:fd.get('name'),whatsapp:fd.get('whatsapp')||'',gender:fd.get('gender')||'',size:fd.get('size')||'',
      address:fd.get('address')||'',skinTone:fd.get('skinTone')||'',preferredColor:fd.get('preferredColor')||'',
      occasion:fd.get('occasion')||'',username:fd.get('username'),password:fd.get('password')||'',
      attendedBy:fd.get('attendedBy')?.trim()||'', attendedDate:new Date().toISOString().slice(0,10),
      smsConsent: fd.get('smsConsent') === 'yes'};
    if(!cust.name||!cust.username){showToast('Name and Username are required','error');return;}
    if(cust.whatsapp && !/^[0-9]{10}$/.test(cust.whatsapp)){showToast('Phone number must be exactly 10 digits','error');return;}
    DB.addCustomer(cust);
    const custShopId = DB.getShopId();
    DB.setSession({role:'customer',name:cust.name,username:cust.username,id:cust.id,shopId:custShopId||undefined});
    if(firebaseReady && custShopId){
      state.shopId = custShopId;
      // Write to both shop customers sub-collection AND users/{username} for cross-device login
      db.collection('shops').doc(custShopId).collection('customers').doc(cust.id).set(cust).catch(console.error);
      db.collection('users').doc(cust.username).set({
        role:'customer', id:cust.id, name:cust.name, username:cust.username,
        password:cust.password||'', whatsapp:cust.whatsapp||'', shopId:custShopId
      }).catch(console.error);
      // Global index: lets this customer log in from ANY device (fresh install) without needing shopId in localStorage
      db.collection('customerIndex').doc(cust.username).set({
        shopId:custShopId, id:cust.id, name:cust.name, whatsapp:cust.whatsapp||''
      }).catch(console.error);
      Sync.start(custShopId);
    }
    showToast(`Welcome, ${cust.name}!`,'success'); navigate('customer');
  });

  /* Logout */
  on('#logout-btn','click', logout);
  on('#logout-btn-sidebar','click', logout);

  /* Role switching (Admin can switch view without logout) */
  onAll('[data-switch-role]','click', e=>{
    const role=e.currentTarget.dataset.switchRole;
    state.subRoute='overview'; state.searchQuery=''; state.modalOpen=null;
    navigate(role);
  });

  /* Analytics period filter */
  onAll('[data-analytics-period]','click', e=>{
    state.analyticsPeriod=e.currentTarget.dataset.analyticsPeriod;
    render(); postRender();
  });

  /* Employee performance period filter */
  onAll('[data-emp-perf-period]','click', e=>{
    state.empPerfPeriod = e.currentTarget.dataset.empPerfPeriod;
    render(); postRender();
  });

  /* Sidebar nav */
  onAll('.sidebar-nav-item','click', e=>{
    state.subRoute=e.currentTarget.dataset.sub;
    state.searchQuery='';state.modalOpen=null;
    if(state.subRoute==='feedback') { state.feedbackRating=0; }
    render(); postRender();
    // If admin navigates to feedback tab, auto-load from backend
    if(state.subRoute==='feedback' && state.route==='admin') loadAdminFeedback();
  });

  /* ── SMS Offer ── */
  on('#sms-offer-msg','input', e=>{
    const msg=e.target.value;
    const preview=document.getElementById('sms-preview');
    const counter=document.getElementById('sms-char-count');
    if(preview) preview.textContent=msg||'Your message will appear here…';
    if(preview) preview.style.color=msg?'var(--text-dark)':'var(--text-light)';
    if(counter) counter.textContent=`${msg.length} / 320`;
  });
  // Toggle specific customer list
  onAll('input[name="sms-target"]','change', e=>{
    const list=document.getElementById('sms-customer-list');
    if(list) list.style.display=e.target.value==='specific'?'block':'none';
  });
  /* Send Offers via WhatsApp — matches renderAdminSms() IDs */
  on('#sms-offer-btn','click', ()=>{
    const msg=(document.getElementById('sms-offer-msg')?.value||'').trim();
    if(!msg){showToast('Please enter a message','error');return;}
    const targetAll=document.querySelector('input[name="sms-target"]:checked')?.value==='all';
    let customers=[];
    if(targetAll){
      customers=DB.getCustomers().filter(c=>c.whatsapp);
    } else {
      const checked=[...document.querySelectorAll('.sms-cust-check:checked')].map(cb=>cb.value);
      customers=DB.getCustomers().filter(c=>c.whatsapp&&checked.includes(c.whatsapp));
    }
    if(!customers.length){showToast('No customers with WhatsApp numbers found','error');return;}

    const queueWrap=document.getElementById('wa-send-queue');
    if(queueWrap){
      queueWrap.style.display='block';
      queueWrap.scrollIntoView({behavior:'smooth',block:'nearest'});
      const queueEl=document.getElementById('wa-queue-list');
      const summary=document.getElementById('wa-queue-summary');
      let sentCount=0;
      if(queueEl) queueEl.innerHTML=customers.map((c,i)=>{
        const phone=c.whatsapp.replace(/\D/g,'');
        const waUrl=`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <div style="width:38px;height:38px;border-radius:50%;background:var(--gold-lighter);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">
            ${c.gender==='Female'?'👩':'👨'}
          </div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.9rem;">${esc(c.name)}</div>
            <div style="font-size:0.76rem;color:var(--text-light);">📱 +91 ${esc(c.whatsapp)}</div>
          </div>
          <a href="${waUrl}" target="_blank" class="btn btn-gold btn-sm wa-send-link" data-idx="${i}" style="text-decoration:none;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;">
            <span>💬</span> Send
          </a>
          <span id="wa-sent-${i}" style="display:none;font-size:0.8rem;font-weight:700;color:#2E7D32;">✅ Sent</span>
        </div>`;
      }).join('');
      if(summary) summary.innerHTML=`<strong>${customers.length}</strong> customer${customers.length!==1?'s':''} — Click 💬 Send for each to open WhatsApp with message pre-filled.`;
      document.querySelectorAll('.wa-send-link').forEach(link=>{
        link.addEventListener('click', ()=>{
          const idx=link.dataset.idx;
          document.getElementById(`wa-sent-${idx}`)?.style.setProperty('display','inline');
          link.innerHTML='✓ Done'; link.style.opacity='0.5'; link.style.pointerEvents='none';
          sentCount++;
          if(summary) summary.innerHTML=`✅ <strong>${sentCount}</strong> of <strong>${customers.length}</strong> sent via WhatsApp.`;
          if(sentCount===customers.length) showToast('All messages sent! ✅','success');
        });
      });
    }
    showToast(`WhatsApp opened for ${customers.length} customer${customers.length!==1?'s':''}!`,'success');
  });

  /* ── Image Lightbox ── */
  onAll('.zoomable-img-wrap','click', e=>{
    const wrap=e.currentTarget;
    openLightbox(wrap.dataset.zoomSrc, wrap.dataset.zoomName||'Product Image');
  });
  // Close lightbox on Escape key
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape') document.getElementById('img-lightbox')?.remove();
  });

  /* ── Feedback button on order success ── */
  on('#go-feedback-btn','click', e=>{
    document.getElementById('success-overlay')?.remove();
    const url=e.currentTarget.dataset.feedbackUrl||'';
    // Navigate to customer feedback sub-route
    state.subRoute='feedback'; render(); postRender();
  });

  /* ── Feedback: star rating widget ── */
  onAll('.star-btn','click', e=>{
    const n=+e.currentTarget.dataset.star;
    state.feedbackRating=n;
    document.getElementById('feedback-rating-hidden')?.setAttribute('value',n);
    // Update star visuals
    document.querySelectorAll('.star-btn').forEach((btn,i)=>{
      btn.classList.toggle('active', i<n);
    });
    // Update hint
    const hint = document.querySelector('#star-rating-widget + input + small.form-hint');
    if(hint) hint.textContent=['','Poor','Fair','Good','Very Good','Excellent'][n]||'';
  });

  /* ── Feedback: submit (customer) ── */
  on('#customer-feedback-form','submit', async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const rating=state.feedbackRating;
    if(!rating){showToast('Please select a rating (1-5 stars).','error');return;}
    const session=DB.getSession();
    const cust=DB.getCustomers().find(c=>c.id===session?.id);
    const shopId=DB.getShopId();
    const btn=document.getElementById('feedback-submit-btn');
    if(btn){btn.disabled=true;btn.textContent='Submitting…';}

    const payload={
      shopId, customerId:session?.id, customerName:session?.name||'Customer',
      phone:cust?.whatsapp||null, rating,
      message:fd.get('message')||'',
      recommend: fd.get('recommend')||null
    };

    let saved=false;
    // Try backend first
    if(BACKEND_URL){
      try{
        const r=await apiPost('/api/feedback',payload);
        if(r.success) saved=true;
      }catch(_){}
    }
    // Fallback: save directly to Firestore
    if(!saved && firebaseReady && shopId){
      try{
        await db.collection('shops').doc(shopId).collection('feedback').add({
          ...payload, createdAt:Date.now(),
          timestamp:firebase.firestore.FieldValue.serverTimestamp()
        });
        saved=true;
      }catch(_){}
    }
    // Last resort: localStorage
    if(!saved){
      const key=`aura_feedback_${shopId}`;
      const list=JSON.parse(localStorage.getItem(key)||'[]');
      list.push({...payload, id:`local_${Date.now()}`, createdAt:Date.now()});
      localStorage.setItem(key, JSON.stringify(list));
      saved=true;
    }

    if(btn){btn.disabled=false;btn.textContent='✉️  Submit Feedback';}
    if(saved){
      document.getElementById('customer-feedback-form').style.display='none';
      document.getElementById('feedback-success').style.display='block';
      showToast('Thank you for your feedback!','success');
    } else {
      showToast('Failed to submit feedback. Please try again.','error');
    }
  });

  /* ── Admin SMS: load delivery logs ── */
  async function loadSmsLogs() {
    const el=document.getElementById('sms-logs-list');
    if(!el) return;
    const shopId=DB.getShopId();
    if(!firebaseReady||!shopId){
      el.innerHTML='<p class="text-muted" style="padding:12px 0;text-align:center;">Firebase not connected — no logs available.</p>';
      return;
    }
    try {
      const snap=await db.collection('shops').doc(shopId).collection('smsLogs').orderBy('timestamp','desc').limit(25).get();
      if(snap.empty){el.innerHTML='<p class="text-muted" style="padding:20px 0;text-align:center;">No SMS logs yet. Send an offer to see logs here.</p>';return;}
      el.innerHTML=`<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Date</th><th>Type</th><th>Sent</th><th>Failed</th><th>Total</th><th>Message</th></tr></thead>
        <tbody>${snap.docs.map(d=>{
          const log=d.data();
          const ts=log.timestamp?.toDate?log.timestamp.toDate().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
          return `<tr>
            <td style="white-space:nowrap;font-size:0.8rem;">${ts}</td>
            <td><span class="td-badge badge-gold">${esc(log.type||'offer')}</span></td>
            <td><span class="td-badge badge-green">${log.sent||0} ✓</span></td>
            <td>${(log.failed||0)>0?`<span class="td-badge badge-red">${log.failed} ✗</span>`:'<span style="color:var(--text-xlight);">—</span>'}</td>
            <td style="font-size:0.82rem;">${log.total||0}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.82rem;">${esc(log.message||'')}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    } catch(err){
      console.error('SMS logs error:',err);
      el.innerHTML='<p class="text-muted">Failed to load logs.</p>';
    }
  }

  /* ── Admin feedback: load reviews ── */
  async function loadAdminFeedback(filterRating='') {
    const shopId=DB.getShopId();
    const container=document.getElementById('feedback-list');
    if(!container) return;

    container.innerHTML=`<div class="feedback-loading"><div style="font-size:2rem;">⭐</div><div style="margin-top:10px;color:var(--text-light);font-size:0.9rem;">Loading reviews…</div></div>`;

    let items=[];

    // Try Firestore first
    if(firebaseReady && shopId){
      try{
        const snap=await db.collection('shops').doc(shopId).collection('feedback').orderBy('createdAt','desc').limit(200).get();
        items=snap.docs.map(d=>({id:d.id,...d.data()}));
      }catch(_){}
    }
    // Fallback: localStorage
    if(!items.length && shopId){
      const key=`aura_feedback_${shopId}`;
      items=JSON.parse(localStorage.getItem(key)||'[]');
    }

    // Apply star filter
    if(filterRating) items=items.filter(f=>f.rating===+filterRating);

    // Update summary
    const summaryRow=document.getElementById('feedback-summary-row');
    if(summaryRow && items.length){
      summaryRow.style.display='flex';
      const all=filterRating?JSON.parse(localStorage.getItem(`aura_feedback_${shopId}`)||'[]'):items;
      const avgVal=items.length?(items.reduce((s,f)=>s+f.rating,0)/items.length):0;
      document.getElementById('fb-total').textContent=items.length;
      document.getElementById('fb-avg').textContent=avgVal.toFixed(1)+'★';
      document.getElementById('fb-avg-stars').textContent='★'.repeat(Math.round(avgVal))+'☆'.repeat(5-Math.round(avgVal));
      document.getElementById('fb-positive').textContent=items.filter(f=>f.rating>=4).length;
      document.getElementById('fb-negative').textContent=items.filter(f=>f.rating<=2).length;
    }

    if(!items.length){
      container.innerHTML=`
        <div style="text-align:center;padding:60px 20px;">
          <div style="font-size:3rem;margin-bottom:12px;">📭</div>
          <div style="font-size:1rem;font-weight:600;color:var(--text-medium);margin-bottom:6px;">No reviews yet</div>
          <div style="color:var(--text-light);font-size:0.85rem;">Encourage customers to share their experience!</div>
        </div>`;
      return;
    }

    // Render review cards — only star rating + review text
    const starsHtml=(n,low)=>`<span style="color:${low?'#e53935':'#C9A84C'};font-size:1.15rem;letter-spacing:2px;">${'★'.repeat(n)}${'☆'.repeat(5-n)}</span>`;
    const ratingLabel=['','😤 Poor','😕 Fair','🙂 Good','😊 Very Good','🤩 Excellent'];

    container.innerHTML=`<div class="review-list">
      ${items.map(f=>{
        const low=f.rating<=2;
        const date=f.createdAt?new Date(f.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'';
        return `<div class="review-card${low?' review-negative':''}">
          <div class="review-top">
            <div class="review-left">
              <div class="review-avatar">${(f.customerName||'?')[0].toUpperCase()}</div>
              <div>
                <div class="review-name">${esc(f.customerName||'Customer')}</div>
                <div class="review-date">${date}</div>
              </div>
            </div>
            <div class="review-right">
              ${starsHtml(f.rating,low)}
              <div class="review-rating-label" style="color:${low?'#e53935':'var(--text-light)'}">${ratingLabel[f.rating]||''}</div>
            </div>
          </div>
          ${f.message?`<p class="review-message">${esc(f.message)}</p>`:'<p class="review-message" style="color:var(--text-xlight);font-style:italic;">No written review</p>'}
          ${f.recommend!=null?`<div class="review-recommend">${f.recommend==='yes'?'👍 Would recommend':'👎 Would not recommend'}</div>`:''}
        </div>`;
      }).join('')}
    </div>`;
  }

  on('#feedback-refresh-btn','click', ()=>{
    const filter=document.getElementById('feedback-filter-rating')?.value||'';
    loadAdminFeedback(filter);
  });
  on('#feedback-filter-rating','change', e=>loadAdminFeedback(e.target.value));

  /* Feedback nav — header button + floating button in customer shop */
  on('#customer-feedback-nav-btn','click', ()=>{ state.subRoute='feedback'; state.feedbackRating=0; render(); postRender(); });
  on('#float-feedback-btn','click', ()=>{ state.subRoute='feedback'; state.feedbackRating=0; render(); postRender(); });

  /* Customer bottom nav tabs */
  onAll('[data-cust-nav]','click', e=>{
    const tab = e.currentTarget.dataset.custNav;
    state.subRoute = tab==='products' ? 'shop' : tab;
    if(tab==='feedback') state.feedbackRating=0;
    render(); postRender();
  });

  /* "Go to Shop" from empty orders page */
  on('#go-shop-btn','click', ()=>{ state.subRoute='products'; render(); postRender(); });

  /* Back to shop btn in customer feedback page */
  on('#back-to-shop-btn','click', ()=>{state.subRoute='products';render();postRender();});

  /* Login type toggle (Username ↔ Phone) */
  on('#login-by-username-btn','click',()=>{
    document.getElementById('login-by-username-btn')?.classList.add('active');
    document.getElementById('login-by-phone-btn')?.classList.remove('active');
    const id=document.getElementById('login-identifier');
    if(id){id.placeholder='Enter username or phone';id.type='text';}
    const lbl=document.querySelector('#login-username-field label');
    if(lbl) lbl.innerHTML='Username / Phone <span class="required">*</span>';
  });
  on('#login-by-phone-btn','click',()=>{
    document.getElementById('login-by-phone-btn')?.classList.add('active');
    document.getElementById('login-by-username-btn')?.classList.remove('active');
    const id=document.getElementById('login-identifier');
    if(id){id.placeholder='Enter 10-digit phone number';id.type='tel';id.maxLength=10;}
    const lbl=document.querySelector('#login-username-field label');
    if(lbl) lbl.innerHTML='Phone Number <span class="required">*</span>';
    const hint=document.querySelector('#login-username-field small');
    if(hint) hint.textContent='Enter the phone number you registered with';
  });

  /* Search */
  on('#product-search','input', e=>{state.searchQuery=e.target.value;render();});
  on('#emp-search','input', e=>{state.searchQuery=e.target.value;render();});
  on('#shop-search','input', e=>{state.searchQuery=e.target.value;render();});

  /* Category filter */
  onAll('.filter-chip','click', e=>{state.activeFilter=e.currentTarget.dataset.filter;state.activeSubFilter='all';render();});
  onAll('.cat-nav-btn','click', e=>{state.activeFilter=e.currentTarget.dataset.filter;state.activeSubFilter='all';render();postRender();});
  /* Main category tile click (All view → category) */
  onAll('.main-cat-tile','click', e=>{
    const cat=e.currentTarget.dataset.filter;
    state.activeFilter=cat; state.activeSubFilter='all'; render(); postRender();
    document.querySelector('.category-nav-bar')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  /* Subcategory tile click */
  onAll('.subcat-tile','click', e=>{
    state.activeSubFilter=e.currentTarget.dataset.subfilter; render(); postRender();
  });
  onAll('[data-subfilter]','click', e=>{state.activeSubFilter=e.currentTarget.dataset.subfilter;render();postRender();});

  /* Product category tabs (Admin & Employee) */
  onAll('[data-prod-cat]','click', e=>{
    state.productCategoryTab=e.currentTarget.dataset.prodCat;
    state.searchQuery=''; render();
  });

  /* Products */
  on('#add-product-btn','click', ()=>{state.modalOpen='product';state.editingId=null;render();});
  onAll('[data-edit-product]','click', e=>{state.editingId=e.currentTarget.dataset.editProduct;state.modalOpen='product';render();});
  onAll('[data-delete-product]','click', e=>{
    const id=e.currentTarget.dataset.deleteProduct, p=DB.getProducts().find(pr=>pr.id===id);
    if(confirm(`Delete "${p?.name}"?`)){DB.deleteProduct(id);showToast('Product deleted','info');render();}
  });
  onAll('[data-stock-product]','click', e=>{state.stockProductId=e.currentTarget.dataset.stockProduct;state.modalOpen='stock';render();});
  on('#save-stock-btn','click', e=>{
    const pid=e.target.dataset.pid, qty=+document.getElementById('stock-qty-input').value;
    if(isNaN(qty)||qty<0){showToast('Invalid quantity','error');return;}
    DB.updateProduct(pid,{quantity:qty});showToast('Stock updated','success');state.modalOpen=null;render();
  });
  /* Category input → refresh subcategory datalist + size options */
  function onCategoryChange(cat) {
    // Refresh subcategory datalist
    const dl=document.getElementById('prod-subcat-list');
    if(dl) {
      const subs=[...new Set([...getSubCategories(cat),...DB.getProducts().filter(p=>p.category===cat&&p.subcategory).map(p=>p.subcategory)])];
      dl.innerHTML=subs.map(s=>`<option value="${esc(s)}">`).join('');
    }
    // Update size selects to match new category
    const sizes=getSizesForCategory(cat);
    document.querySelectorAll('.sizes-tbody .size-size-sel').forEach(sel=>{
      const cur=sel.value;
      sel.innerHTML=sizes.map(s=>`<option value="${s}"${s===cur?' selected':''}>${s}</option>`).join('');
    });
  }
  on('#prod-category-inp','input', e=>onCategoryChange(e.target.value.trim()));

  /* Base price change → auto-fill all empty size price inputs */
  on('#prod-base-price','input', e=>{
    const price=e.target.value;
    if(!price) return;
    document.querySelectorAll('.size-price-inp').forEach(inp=>{
      if(!inp.value) inp.value=price;
    });
  });

  /* Product form — Add Color Variant */
  on('#add-color-variant-btn','click',()=>{
    const cat=document.getElementById('prod-category-inp')?.value||'Men';
    const sizes=getSizesForCategory(cat);
    const idx=document.querySelectorAll('.color-variant-block').length;
    const html=renderColorVariantBlock({id:uid(),name:'',image:'',sizes:[]},idx,sizes);
    document.getElementById('color-variants-wrap')?.insertAdjacentHTML('beforeend',html);
  });

  /* Product form — Remove Color Variant + Add/Remove size rows (delegated once) */
  if(window._AL_colClick) document.removeEventListener('click', window._AL_colClick);
  window._AL_colClick = function(e){
    /* Remove a specific size row */
    if(e.target.closest('.remove-size-row')){
      e.preventDefault(); e.stopPropagation();
      const btn=e.target.closest('.remove-size-row');
      const row=btn.closest('tr.size-row') || btn.parentElement?.closest('tr');
      const tbody=row?.closest('.sizes-tbody');
      if(tbody && tbody.querySelectorAll('tr.size-row').length > 1){
        row.remove();
      } else {
        showToast('At least one size per color is required','error');
      }
      return;
    }
    /* Remove an entire color variant block */
    if(e.target.closest('.remove-color-variant')){
      e.preventDefault(); e.stopPropagation();
      const block=e.target.closest('.color-variant-block');
      if(document.querySelectorAll('.color-variant-block').length<=1){
        showToast('At least one color variant is required','error'); return;
      }
      block?.remove();
      document.querySelectorAll('.color-variant-block .color-variant-title').forEach((el,i)=>{
        el.textContent=`🎨 Color Variant ${i+1}`;
      });
      return;
    }
    /* Add ONE new size row inside the clicked variant */
    if(e.target.closest('.add-size-row-btn')){
      e.preventDefault(); e.stopPropagation();
      const btn=e.target.closest('.add-size-row-btn');
      const tbody=btn.closest('.size-price-wrap')?.querySelector('.sizes-tbody');
      const dlId=btn.dataset.dlId||tbody?.dataset?.dlId||'';
      if(tbody){
        const row=document.createElement('tr'); row.className='size-row';
        row.innerHTML=`<td><input type="text" class="form-control form-control-sm size-size-sel" list="${dlId}" placeholder="e.g. S, M, L, XL…"/></td>
        <td><input type="number" class="form-control form-control-sm size-price-inp" min="0" placeholder="0"/></td>
        <td><input type="number" class="form-control form-control-sm size-stock-col" min="0" placeholder="0"/></td>
        <td><button type="button" class="btn-icon" onclick="window._removeColorSizeRow(this)" style="width:28px;height:28px;font-size:0.8rem;">✕</button></td>`;
        tbody.appendChild(row);
        row.querySelector('input')?.focus();
      }
      return;
    }
  };
  document.addEventListener('click', window._AL_colClick);

  /* Color image upload (delegated via input change — attached once) */
  if(window._AL_colChange) document.removeEventListener('change', window._AL_colChange);
  window._AL_colChange = function(e){
    const fileInput=e.target.closest('.color-img-file');
    if(!fileInput) return;
    const file=fileInput.files[0]; if(!file) return;
    const block=fileInput.closest('.color-variant-block');
    compressImage(file).then(compressed=>{
      if(block){
        const dataInput=block.querySelector('.color-img-data');
        const uploadArea=block.querySelector('.color-img-upload');
        if(dataInput) dataInput.value=compressed;
        if(uploadArea){
          const existingImg=uploadArea.querySelector('.color-img-preview');
          if(existingImg){ existingImg.src=compressed; }
          else {
            const img=document.createElement('img');
            img.src=compressed;img.className='img-preview color-img-preview';
            img.style.cssText='width:100%;height:130px;object-fit:cover;border-radius:var(--radius-md);';
            uploadArea.querySelector('.img-upload-icon')?.remove();
            uploadArea.querySelector('.img-upload-text')?.remove();
            uploadArea.insertBefore(img, uploadArea.querySelector('input'));
          }
        }
      }
    });
  };
  document.addEventListener('change', window._AL_colChange);

  /* Save Product — multi-color */
  on('#save-product-btn','click',()=>{
    const form=document.getElementById('product-form'); if(!form) return;
    const fd=new FormData(form);
    const name        = fd.get('name')?.trim();
    const category    = fd.get('category')?.trim();
    const subcategory = (fd.get('subcategory')||'').trim();
    const material    = fd.get('material')?.trim()||'';
    const description = fd.get('description')?.trim()||'';

    let price = 0, quantity = 0;

    // Validation
    if(!name)        { showToast('Product name is required','error'); return; }
    if(!category)    { showToast('Please enter or select a category','error'); return; }
    if(!subcategory) { showToast('Please enter or select a subcategory','error'); return; }

    // Auto-save new category/subcategory into DB so they appear in future suggestions
    if(!getMainCategories().includes(category)) {
      DB.addMainCategory(category);
    }
    if(subcategory && !getSubCategories(category).includes(subcategory)) {
      DB.addSubCategory(category, subcategory);
    }

    // Read all color variants
    const colorBlocks = document.querySelectorAll('.color-variant-block');
    const colors = [];
    colorBlocks.forEach(block => {
      const colorName  = block.querySelector('.color-name-input')?.value.trim();
      if(!colorName) return;
      const imageData  = block.querySelector('.color-img-data')?.value||'';
      const sizeRows   = block.querySelectorAll('.sizes-tbody .size-row');
      const sizes = [];
      sizeRows.forEach(row => {
        const sz = row.querySelector('.size-size-sel')?.value?.trim();
        const pr = +row.querySelector('.size-price-inp')?.value||0;
        const st = +row.querySelector('.size-stock-col')?.value||0;
        if(sz) sizes.push({ size:sz, price:isNaN(pr)||pr<=0?price:pr, stock:st });
      });
      colors.push({ id:uid(), name:colorName, image:imageData, sizes });
    });

    if(colors.length===0)  { showToast('Add at least one color variant','error'); return; }
    if(!colors[0].image)   { showToast('Please upload an image for the first color variant','error'); return; }

    const firstColor = colors[0];
    const allSizes   = firstColor.sizes;
    const allColorSizes = colors.flatMap(c=>c.sizes||[]);
    if(!price && allColorSizes.length) price = Math.min(...allColorSizes.map(s=>+(s.price||0)).filter(p=>p>0))||0;
    quantity = allColorSizes.reduce((s,x)=>s+(+(x.stock||0)),0);
    const prod = {
      name, category, subcategory, material, description,
      quantity, basePrice: price, price, colors,
      color: firstColor.name, image: firstColor.image,
      sizes: allSizes, size: allSizes[0]?.size||'',
      hasSizes: true,
      addedBy: DB.getSession()?.role||'admin',
    };
    if(state.editingId) {
      DB.updateProduct(state.editingId, prod);
      showToast('Product updated successfully','success');
    } else {
      prod.id = uid(); prod.addedDate = Date.now();
      DB.addProduct(prod);
      showToast(`✅ "${name}" added to ${category} → ${subcategory}`,'success');
    }
    state.modalOpen=null; state.editingId=null; render();
  });

  /* Close modals */
  onAll('[data-close-modal]','click', ()=>{state.modalOpen=null;state.editingId=null;render();});
  ['product-modal-overlay','emp-modal-overlay','stock-modal-overlay','order-bill-overlay','product-detail-overlay','salary-modal-overlay','billing-modal-overlay','view-bill-overlay','edit-shop-overlay'].forEach(id=>{
    on(`#${id}`,'click', e=>{if(e.target.id===id){state.modalOpen=null;state.currentBillId=null;render();}});
  });

  /* Categories */
  on('#add-category-form','submit', e=>{
    e.preventDefault();const fd=new FormData(e.target),name=fd.get('catName')?.trim();
    if(!name) return;DB.addCategory(name);showToast(`Category "${name}" added`,'success');e.target.reset();render();
  });
  onAll('[data-delete-cat]','click', e=>{
    const cat=e.currentTarget.dataset.deleteCat;
    if(confirm(`Delete category "${cat}"?`)){DB.deleteCategory(cat);showToast('Category deleted','info');render();}
  });

  /* ── Main category CRUD ── */
  on('#add-maincat-form','submit', e=>{
    e.preventDefault();
    const name=new FormData(e.target).get('mainCatName')?.trim();
    if(!name) return;
    if(getMainCategories().includes(name)){showToast('Category already exists','error');return;}
    DB.addMainCategory(name); showToast(`"${name}" added!`,'success'); e.target.reset(); render();
  });
  onAll('[data-delete-maincat]','click', e=>{
    e.stopPropagation();
    const cat=e.currentTarget.dataset.deleteMaincat;
    const cnt=DB.getProducts().filter(p=>p.category===cat).length;
    const msg=cnt>0?`Delete "${cat}" category? This will NOT delete the ${cnt} products in it, but they will have no category.`:`Delete "${cat}" category?`;
    if(confirm(msg)){DB.deleteMainCategory(cat);showToast(`"${cat}" deleted`,'info');state.openCategoryAccordion=null;render();}
  });

  /* ── Subcategory CRUD ── */
  onAll('.cat-add-sub-btn','click', e=>{
    const parentCat=e.currentTarget.dataset.parentCat;
    const input=document.querySelector(`.cat-add-sub-input[data-parent-cat="${parentCat}"]`);
    const name=input?.value?.trim();
    if(!name){showToast('Enter subcategory name','error');return;}
    if(getSubCategories(parentCat).includes(name)){showToast('Subcategory already exists','error');return;}
    DB.addSubCategory(parentCat,name); showToast(`"${name}" added to ${parentCat}`,'success');
    if(input) input.value=''; render();
  });
  onAll('[data-delete-subcat]','click', e=>{
    e.stopPropagation();
    const sub=e.currentTarget.dataset.deleteSubcat;
    const parent=e.currentTarget.dataset.subcatParent;
    if(confirm(`Delete subcategory "${sub}" from ${parent}?`)){
      DB.deleteSubCategory(parent,sub); showToast(`"${sub}" deleted`,'info'); render();
    }
  });

  /* Category accordion toggle */
  onAll('[data-toggle-cat]','click', e=>{
    const cat=e.currentTarget.dataset.toggleCat;
    state.openCategoryAccordion=(state.openCategoryAccordion===cat?null:cat);
    render();
  });

  /* Employees */
  on('#add-emp-btn','click', ()=>{state.modalOpen='employee';state.editingId=null;render();});

  /* Salary modal (admin sets salary for employee) */
  onAll('[data-salary-emp]','click', e=>{
    state.salaryEmpId=e.currentTarget.dataset.salaryEmp;
    state.modalOpen='salary'; render();
  });
  /* Salary modal — live auto-calculation between amount ↔ percentage */
  on('#new-salary-input','input', ()=>{
    const salIn=document.getElementById('new-salary-input');
    const pctIn=document.getElementById('increment-pct-input');
    if(!salIn||!pctIn) return;
    const cur=+salIn.dataset.current, newSal=+salIn.value;
    if(cur>0 && newSal>0) pctIn.value=(((newSal-cur)/cur)*100).toFixed(2);
    else pctIn.value='';
  });
  on('#increment-pct-input','input', ()=>{
    const salIn=document.getElementById('new-salary-input');
    const pctIn=document.getElementById('increment-pct-input');
    if(!salIn||!pctIn) return;
    const cur=+salIn.dataset.current, pct=+pctIn.value;
    if(cur>0 && !isNaN(pct)) salIn.value=Math.round(cur*(1+pct/100));
  });

  on('#save-salary-btn','click', e=>{
    const form=document.getElementById('salary-form'); if(!form) return;
    const fd=new FormData(form);
    const newSalary=+fd.get('newSalary');
    const note=fd.get('salaryNote')?.trim();
    const dateVal=fd.get('salaryDate');
    const effectiveDate=dateVal?new Date(dateVal).getTime():Date.now();
    if(!newSalary||newSalary<=0){showToast('Enter a valid salary amount','error');return;}
    if(!note){showToast('Please enter a reason/note for this salary change','error');return;}
    const emp=DB.getEmployees().find(en=>en.id===e.target.dataset.eid);
    if(!emp) return;
    const hist=[...(emp.salaryHistory||[])];
    if(!hist.length||emp.salary!==newSalary){
      const prev=emp.salary||0;
      const incrementPct=prev>0?+((((newSalary-prev)/prev)*100).toFixed(2)):0;
      hist.push({date:effectiveDate,amount:newSalary,note,incrementPct});
    }
    DB.updateEmployee(emp.id,{salary:newSalary,salaryHistory:hist,joinDate:emp.joinDate||effectiveDate});
    showToast(`Salary updated to ${fmt(newSalary)} for ${emp.name}`,'success');
    state.modalOpen=null; state.salaryEmpId=null; render();
  });
  onAll('[data-edit-emp]','click', e=>{state.editingId=e.currentTarget.dataset.editEmp;state.modalOpen='employee';render();});
  onAll('[data-delete-emp]','click', e=>{
    const id=e.currentTarget.dataset.deleteEmp, emp=DB.getEmployees().find(em=>em.id===id);
    if(confirm(`Remove "${emp?.name}"?`)){DB.deleteEmployee(id);showToast('Employee removed','info');render();}
  });
  on('#save-emp-btn','click', ()=>{
    const form=document.getElementById('emp-form');if(!form) return;
    const fd=new FormData(form);
    const gender=form.querySelector('input[name="gender"]:checked')?.value;
    const empType=form.querySelector('input[name="employmentType"]:checked')?.value||'Full-Time';
    if(state.editingId){
      const existing=DB.getEmployees().find(e=>e.id===state.editingId);
      const newSalary=fd.get('salary')?+fd.get('salary'):undefined;
      const joinDateVal=fd.get('joinDate');
      const data={name:fd.get('name')?.trim(),phone:fd.get('phone')?.trim(),gender,address:fd.get('address')?.trim(),employmentType:empType};
      if(!data.name||!data.phone||!gender){showToast('Fill required fields','error');return;}
      if(!joinDateVal){showToast('Join Date is required','error');return;}
      data.joinDate=new Date(joinDateVal).getTime();
      if(newSalary!==undefined){
        if(!newSalary||newSalary<=0){showToast('Enter a valid salary','error');return;}
        data.salary=newSalary;
        if(existing&&existing.salary!==newSalary){
          const hist=[...(existing.salaryHistory||[])];
          hist.push({date:Date.now(),amount:newSalary,note:fd.get('salaryNote')?.trim()||'Salary update'});
          data.salaryHistory=hist;
        }
      }
      DB.updateEmployee(state.editingId,data);showToast('Employee updated','success');
    }else{
      if(DB.getEmployees().find(e=>e.username===fd.get('username'))){showToast('Username taken','error');return;}
      const joinDateVal=fd.get('joinDate');
      if(!joinDateVal){showToast('Join Date is required','error');return;}
      const salary=fd.get('salary')?+fd.get('salary'):0;
      if(!salary||salary<=0){showToast('Monthly Salary is required','error');return;}
      const joinDate=new Date(joinDateVal).getTime();
      const salaryHistory=[{date:joinDate,amount:salary,note:'Starting salary'}];
      const emp={id:uid(),name:fd.get('name')?.trim(),phone:fd.get('phone')?.trim(),gender,address:fd.get('address')?.trim(),
        employmentType:empType,username:fd.get('username')?.trim(),password:fd.get('password'),
        salary,joinDate,salaryHistory,addedDate:Date.now()};
      if(!emp.name||!emp.phone||!emp.gender||!emp.username||!emp.password){showToast('Fill required fields','error');return;}
      DB.addEmployee(emp);showToast(`Employee ${emp.name} added. Username: ${emp.username}`,'success');
    }
    state.modalOpen=null;state.editingId=null;render();
  });

  /* Product detail */
  onAll('[data-product-detail]','click', e=>{
    state.viewingProductId=e.currentTarget.dataset.productDetail;state.modalOpen='product-detail';render();postRender();
  });
  on('#product-detail-overlay','click', e=>{if(e.target.id==='product-detail-overlay'){state.modalOpen=null;render();}});

  /* Product Detail — color selection */
  onAll('.color-select-btn','click', e=>{
    state.selectedColorIdx=+e.currentTarget.dataset.colorIdx;
    state.selectedSizeIdx=0;
    render(); postRender();
  });
  /* Product Detail — size selection */
  onAll('[data-size-idx]','click', e=>{
    const btn=e.currentTarget;
    state.selectedSizeIdx=+btn.dataset.sizeIdx;
    const price=+btn.dataset.price;
    const sz=btn.dataset.sz;
    document.querySelectorAll('[data-size-idx]').forEach(b=>b.classList.toggle('active',b===btn));
    const priceEl=document.getElementById('detail-price-display');
    if(priceEl) priceEl.textContent=fmt(price);
    const addBtn=document.getElementById('detail-add-cart-btn');
    if(addBtn){addBtn.dataset.sz=sz;addBtn.dataset.price=price;}
  });

  /* Detail modal — add to cart */
  on('#detail-add-cart-btn','click', e=>{
    const btn=e.currentTarget||e.target;
    if(!btn.dataset.sz){showToast('Please select a size','error');return;}
    addToCart(btn.dataset.pid, btn.dataset.sz, +btn.dataset.price, btn.dataset.color, btn.dataset.img);
  });

  /* Attendance filter buttons */
  onAll('[data-att-filter]','click', e=>{
    state.attendanceFilter=e.currentTarget.dataset.attFilter;
    render();
  });
  on('#att-date-apply-btn','click',()=>{
    state.attendanceDateFrom=document.getElementById('att-date-from')?.value||'';
    state.attendanceDateTo=document.getElementById('att-date-to')?.value||'';
    render();
  });

  /* Cart */
  onAll('[data-add-cart]','click', e=>{e.stopPropagation();addToCart(e.currentTarget.dataset.addCart);});
  on('#open-cart-btn','click', ()=>{state.cartOpen=true;render();});
  on('#close-cart-btn','click', ()=>{state.cartOpen=false;render();});
  on('#cart-overlay-bg','click', ()=>{state.cartOpen=false;render();});
  onAll('[data-cart-inc]','click', e=>updateCartQty(e.currentTarget.dataset.cartInc,1));
  onAll('[data-cart-dec]','click', e=>updateCartQty(e.currentTarget.dataset.cartDec,-1));
  onAll('[data-cart-remove]','click', e=>removeFromCart(e.currentTarget.dataset.cartRemove));

  /* Cart bill delivery buttons (shown after payment mode selected) */
  on('#cart-whatsapp-btn','click', () => confirmAndDeliver('whatsapp'));
  on('#cart-print-btn',   'click', () => confirmAndDeliver('print'));
  on('#cart-both-btn',    'click', () => confirmAndDeliver('both'));

  /* Checkout (legacy modal — still wired up as fallback) */
  on('#checkout-btn','click', ()=>{
    state.cartOpen=false;
    document.body.insertAdjacentHTML('beforeend', renderCheckoutModal());
    document.querySelector('[data-close-modal="checkout"]')?.addEventListener('click',()=>{document.getElementById('checkout-overlay')?.remove();state.cartOpen=true;render();});
    document.getElementById('checkout-overlay')?.addEventListener('click',e=>{if(e.target.id==='checkout-overlay'){e.currentTarget.remove();state.cartOpen=true;render();}});
    document.getElementById('confirm-order-btn')?.addEventListener('click', confirmOrder);
  });

  /* Orders */
  onAll('[data-view-order]','click', e=>{state.viewingOrderId=e.currentTarget.dataset.viewOrder;state.modalOpen='order-bill';render();});

  /* ── Billing ── */
  /* Save Billing Settings (Admin Billing page) */
  on('#save-billing-settings-btn','click', ()=>{
    const existing = DB.getShop() || {};
    const sgstRateVal = +(document.getElementById('bs-sgst-rate')?.value||0);
    const cgstRateVal = +(document.getElementById('bs-cgst-rate')?.value||0);
    const gstRateVal  = +(document.getElementById('bs-gst-rate')?.value||0);
    const updated = {
      ...existing,
      name:       document.getElementById('bs-name')?.value.trim()        || existing.name,
      phone:      document.getElementById('bs-phone')?.value.trim()       || existing.phone,
      address:    document.getElementById('bs-address')?.value.trim()     || existing.address,
      email:      document.getElementById('bs-email')?.value.trim()       || '',
      gst:        (document.getElementById('bs-gst')?.value.trim()||'').toUpperCase(),
      gstRate:    gstRateVal,
      sgstRate:   sgstRateVal,
      cgstRate:   cgstRateVal,
      upiId:      document.getElementById('bs-upi-id')?.value.trim()      || '',
      billFooter: document.getElementById('bs-bill-footer')?.value.trim() || 'Thank you for visiting again',
    };
    if (!updated.name)    { showToast('Shop name is required','error'); return; }
    if (!updated.phone)   { showToast('Phone number is required','error'); return; }
    if (!updated.address) { showToast('Shop address is required','error'); return; }
    DB.setShop(updated, DB.getShopId());
    const shopId = DB.getShopId();
    if (firebaseReady && shopId) {
      db.collection('shops').doc(shopId).update({ shopInfo: updated }).catch(console.error);
    }
    showToast('✅ Billing settings saved! Invoice will update dynamically.','success');
    render();
  });

  /* Edit Shop Details */
  on('#edit-shop-btn','click', ()=>{ state.modalOpen='edit-shop'; render(); });
  on('#save-shop-details-btn','click', ()=>{
    const fd = new FormData(document.getElementById('edit-shop-form'));
    const existing = DB.getShop() || {};
    const updated = {
      ...existing,
      name:       fd.get('name')?.trim()       || existing.name,
      ownerName:  fd.get('ownerName')?.trim()  || existing.ownerName,
      address:    fd.get('address')?.trim()    || existing.address,
      phone:      fd.get('phone')?.trim()      || existing.phone,
      gst:        (fd.get('gst')?.trim()||'').toUpperCase() || existing.gst,
      upiId:      fd.get('upiId')?.trim()      || '',
      billFooter: fd.get('billFooter')?.trim() || 'Thank you for shopping with us! ✦',
    };
    if (!updated.name) { showToast('Shop name is required','error'); return; }
    DB.setShop(updated, DB.getShopId());
    // Sync to Firebase
    const shopId = DB.getShopId();
    if (firebaseReady && shopId) {
      db.collection('shops').doc(shopId).update({ shopInfo: updated }).catch(console.error);
    }
    state.modalOpen = null;
    showToast('✅ Shop details updated! Changes appear on bills & customer view.', 'success');
    render();
  });

  on('#new-bill-btn','click', ()=>{ state.modalOpen='billing'; render(); });

  /* View bill */
  onAll('[data-view-bill]','click', e=>{
    state.currentBillId=e.currentTarget.dataset.viewBill;
    state.modalOpen='view-bill';
    render();
  });

  /* Close billing/view-bill overlays by clicking outside */
  on('#billing-modal-overlay','click', e=>{ if(e.target.id==='billing-modal-overlay'){state.modalOpen=null;render();} });
  on('#view-bill-overlay','click', e=>{ if(e.target.id==='view-bill-overlay'){state.modalOpen=null;state.currentBillId=null;render();} });

  /* Auto-fill phone when customer selected from datalist */
  on('#bill-cust-name','input', e=>{
    const name = e.target.value.trim();
    const cust = DB.getCustomers().find(c=>c.name===name);
    const phoneEl = document.getElementById('bill-cust-phone');
    if (cust && phoneEl && !phoneEl.value) phoneEl.value = cust.whatsapp||'';
  });

  /* Auto-fill price when product selected from datalist */
  document.addEventListener('input', function(e){
    if (!e.target.classList.contains('bill-item-name')) return;
    const name = e.target.value.trim();
    const prod = DB.getProducts().find(p=>p.name===name);
    if (!prod) return;
    const row = e.target.closest('.bill-item-row');
    if (!row) return;
    const priceInp = row.querySelector('.bill-item-price');
    if (priceInp && !priceInp.value) {
      priceInp.value = getProductBasePrice(prod) || '';
    }
    calcBillingTotals();
  });

  /* Live totals — delegated for bill items */
  document.addEventListener('input', function(e){
    const el = e.target;
    if (el.matches('.bill-item-qty,.bill-item-price,#bill-discount-val,#bill-gst-rate,#bill-discount-type,#bill-amount-paid')) {
      calcBillingTotals();
    }
  });
  document.addEventListener('change', function(e){
    if (e.target.matches('#bill-discount-type,input[name="billPayMode"]')) {
      calcBillingTotals();
    }
    if (e.target.matches('input[name="billPayMode"]')) {
      document.querySelectorAll('.pay-mode-btn').forEach(lbl=>{
        lbl.classList.toggle('selected', lbl.querySelector('input')?.value===e.target.value);
      });
    }
  });

  /* Add bill item row */
  on('#add-bill-item-btn','click', ()=>{
    const tbody = document.getElementById('bill-items-tbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('.bill-item-row');
    const row = document.createElement('tr');
    row.className = 'bill-item-row';
    row.style.borderBottom = '1px solid var(--border-light)';
    row.innerHTML = `
      <td style="padding:8px 6px;text-align:center;color:var(--text-light);font-size:0.82rem;">${rows.length+1}</td>
      <td style="padding:6px;"><input type="text" class="form-control form-control-sm bill-item-name" list="bill-prods-dl" placeholder="Product name" autocomplete="off"/></td>
      <td style="padding:6px;"><input type="number" class="form-control form-control-sm bill-item-qty" min="1" value="1" style="text-align:center;"/></td>
      <td style="padding:6px;"><input type="number" class="form-control form-control-sm bill-item-price" min="0" placeholder="0" style="text-align:right;"/></td>
      <td style="padding:6px;"><input type="number" class="form-control form-control-sm bill-item-total" readonly placeholder="0" style="text-align:right;background:var(--cream-2);"/></td>
      <td style="padding:6px;text-align:center;"><button type="button" class="btn-icon remove-bill-row" title="Remove" style="color:#c62828;width:28px;height:28px;font-size:0.9rem;">✕</button></td>`;
    tbody.appendChild(row);
    row.querySelector('.bill-item-name')?.focus();
  });

  /* Remove bill item row (delegated) */
  document.addEventListener('click', function(e){
    if (!e.target.closest('.remove-bill-row')) return;
    const row = e.target.closest('.bill-item-row');
    const tbody = document.getElementById('bill-items-tbody');
    if (!tbody) return;
    if (tbody.querySelectorAll('.bill-item-row').length > 1) {
      row?.remove();
      calcBillingTotals();
    } else {
      showToast('At least one item is required', 'error');
    }
  });

  /* Generate Invoice */
  on('#generate-invoice-btn','click', ()=>{
    const custName  = document.getElementById('bill-cust-name')?.value.trim()||'';
    const custPhone = document.getElementById('bill-cust-phone')?.value.trim()||'';
    const payMode   = document.querySelector('input[name="billPayMode"]:checked')?.value||'';

    if (!payMode) { showToast('Please select a payment method', 'error'); return; }

    const rows = document.querySelectorAll('#bill-items-tbody .bill-item-row');
    const items = [];
    let hasItem = false;
    rows.forEach((row, i) => {
      const name  = row.querySelector('.bill-item-name')?.value.trim();
      const qty   = Math.max(1, +row.querySelector('.bill-item-qty')?.value||1);
      const price = +row.querySelector('.bill-item-price')?.value||0;
      if (name && price > 0) { items.push({ name, qty, price, total: qty*price }); hasItem = true; }
    });
    if (!hasItem) { showToast('Add at least one item with name and price', 'error'); return; }

    const totals = calcBillingTotals();
    const amtPaid = +document.getElementById('bill-amount-paid')?.value||totals.grand;
    const balance = Math.max(0, totals.grand - amtPaid);

    const bill = {
      id:          uid(),
      billNo:      generateBillNo(),
      date:        Date.now(),
      customerName: custName||'Guest',
      customerPhone: custPhone,
      items,
      subtotal:      totals.sub,
      discountType:  totals.discType,
      discountValue: totals.discVal,
      discountAmount: totals.discAmt,
      taxableAmount: totals.taxable,
      gstRate:       totals.gstRate,
      gstAmount:     totals.gstAmt,
      grandTotal:    totals.grand,
      paymentMode:   payMode,
      amountPaid:    amtPaid,
      balance,
      status:        'bill-generated',
    };

    DB.addBill(bill);
    showToast(`✅ Invoice ${bill.billNo} generated!`, 'success');

    // Show full invoice on screen first, then auto-print + auto-WhatsApp
    state.modalOpen = 'view-bill';
    state.currentBillId = bill.id;
    render();

    // Auto-print after invoice is visible (800ms), then auto-WhatsApp (1600ms)
    setTimeout(() => { window._printBill(bill.id); }, 800);
    setTimeout(() => { sendWhatsAppBill(bill.id); }, 1600);
  });

  /* WhatsApp bill from view modal */
  on('#wa-bill-btn','click', e=>{
    const billId = e.currentTarget.dataset.billId;
    sendWhatsAppBill(billId);
  });

  /* Print bill from view modal */
  on('#print-bill-btn','click', e=>{
    window._printBill(e.currentTarget.dataset.billId);
  });

  /* Print + WhatsApp parallel */
  on('#parallel-action-btn','click', e=>{
    executeBillingActions(e.currentTarget.dataset.billId);
  });

  /* hasSizes toggle removed — sizes always shown */

  /* Add size row (new id) */
  on('#add-size-row-btn','click',()=>{
    const tbody=document.getElementById('size-stock-tbody');
    if(!tbody) return;
    const row=document.createElement('tr'); row.className='size-stock-row';
    row.innerHTML=`<td><input class="form-control form-control-sm ss-size" placeholder="e.g. XL" list="preset-sizes-dl"/></td>
      <td><input type="number" class="form-control form-control-sm ss-price" min="0" placeholder="₹"/></td>
      <td><input type="number" class="form-control form-control-sm ss-stock" min="0" placeholder="Qty"/></td>
      <td><button type="button" class="btn-icon remove-ss-row" style="color:#c62828;">✕</button></td>`;
    tbody.appendChild(row);
    // Ensure datalist exists
    if(!document.getElementById('preset-sizes-dl')){
      const dl=document.createElement('datalist'); dl.id='preset-sizes-dl';
      ['S','M','L','XL','XXL','XXXL','Free Size','XS','XXS','2XL','3XL'].forEach(s=>{const o=document.createElement('option');o.value=s;dl.appendChild(o);});
      document.body.appendChild(dl);
    }
  });

  /* Preset size chip click — adds a row with the preset size pre-filled */
  /* Preset size chip + remove size row + size btn on shop cards — all attached once */
  if(window._AL_sizeClick) document.removeEventListener('click', window._AL_sizeClick);
  window._AL_sizeClick = function(e){
    /* Preset size chip */
    const chip = e.target.closest('.preset-size-chip');
    if(chip){
      const sz = chip.dataset.presetSize;
      const tbody = document.getElementById('size-stock-tbody');
      if(!tbody) return;
      const existing = [...tbody.querySelectorAll('.ss-size')].find(i=>i.value.trim()===sz);
      if(existing){ existing.closest('tr').querySelector('.ss-price')?.focus(); showToast(`Size ${sz} already added — edit price/stock below`,'warning'); return; }
      const row=document.createElement('tr'); row.className='size-stock-row';
      row.innerHTML=`<td><input class="form-control form-control-sm ss-size" value="${sz}"/></td>
        <td><input type="number" class="form-control form-control-sm ss-price" min="0" placeholder="₹"/></td>
        <td><input type="number" class="form-control form-control-sm ss-stock" min="0" placeholder="Qty"/></td>
        <td><button type="button" class="btn-icon remove-ss-row" style="color:#c62828;">✕</button></td>`;
      tbody.appendChild(row);
      row.querySelector('.ss-price')?.focus();
      return;
    }
    /* Remove size row */
    if(e.target.closest('.remove-size-stock-row')||e.target.closest('.remove-ss-row')){
      const row=e.target.closest('.size-stock-row');
      if(document.querySelectorAll('.size-stock-row').length>1) row?.remove();
      else showToast('At least one size required','error');
      return;
    }
    /* Size btn on shop cards */
    const btn=e.target.closest('.size-btn');
    if(btn){
      const prodId=btn.dataset.prod;
      document.querySelectorAll(`.size-btn[data-prod="${prodId}"]`).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const card=btn.closest('[data-prod-card]');
      const priceEl=card?.querySelector('.shop-card-price');
      if(priceEl) priceEl.textContent='₹'+Number(btn.dataset.price).toLocaleString('en-IN');
    }
  };
  document.addEventListener('click', window._AL_sizeClick);

  /* Quick fill sizes */
  on('#quick-fill-sizes','click',()=>{
    const tbody=document.getElementById('size-stock-tbody');
    if(!tbody) return;
    tbody.innerHTML=['XS','S','M','L','XL','XXL'].map(sz=>`<tr class="size-stock-row">
      <td><input class="form-control form-control-sm ss-size" value="${sz}" style="width:70px;"/></td>
      <td><input type="number" class="form-control form-control-sm ss-price" placeholder="0" min="0"/></td>
      <td><input type="number" class="form-control form-control-sm ss-stock" placeholder="0" min="0"/></td>
      <td><button type="button" class="btn-icon remove-ss-row" style="color:#c62828;width:26px;height:26px;font-size:0.75rem;">✕</button></td>
    </tr>`).join('');
  });

  /* Employee pack time (delegated — packing time UI removed, kept for compat) */
  onAll('.pack-time-btn','click', e=>{
    const ordId = e.currentTarget.dataset.orderId;
    const session = DB.getSession();
    DB.updateOrder(ordId, {status:'accepted', employeeId:session?.id, employeeName:session?.name});
    showToast('✅ Order accepted!','success');
    render();
  });

  /* Mark Ready (delegated) */
  onAll('[data-mark-ready]','click', e=>{
    DB.updateOrder(e.currentTarget.dataset.markReady,{status:'ready'});
    showToast('Order marked as ready!','success');
    render();
  });

  /* Payment mode in checkout (delegated) — sync BOTH state vars */
  onAll('input[name="payMode"]','change', e=>{
    state.selectedPaymentMode = e.target.value;
    state.paymentMode = e.target.value;
    document.querySelectorAll('.payment-mode-opt').forEach(l=>l.classList.toggle('selected',l.querySelector('input')?.value===e.target.value));
  });

  /* Payment mode in cart — re-render to show live bill preview below */
  onAll('input[name="cartPayMode"]','change',e=>{
    state.paymentMode = e.target.value;
    render(); // re-render so bill preview appears below payment buttons
  });

  /* Coupon section removed */

  /* Employee accept order */
  onAll('.emp-accept-btn','click',e=>{
    const oid = e.currentTarget.dataset.oid;
    const session = DB.getSession();
    DB.updateOrder(oid, {status:'accepted', employeeId:session?.id, employeeName:session?.name, acceptedAt:Date.now()});
    showToast('✅ Order accepted!','success');
    render();
  });

  /* View orders btn in notif bar */
  on('#emp-view-orders-btn','click',()=>{state.subRoute='orders';render();});

  /* Coupon management (admin) */
  /* Coupon handlers removed */

}

/* ═══════════════════════════════════════════════════
   24. INIT
═══════════════════════════════════════════════════ */
async function init() {
  // If a shopId is stored locally, verify it still exists in Firebase.
  // If not (shop was deleted), wipe local data so device shows clean landing page.
  if (firebaseReady) {
    const localShopId = _ls(KEYS.shopId) || state.shopId;
    const allKeys = [KEYS.shop, KEYS.employees, KEYS.customers, KEYS.products,
                     KEYS.categories, KEYS.orders, KEYS.shopId, KEYS.session];
    if (localShopId) {
      // Has a shopId — verify it still exists in Firebase
      try {
        const shopSnap = await db.collection('shops').doc(localShopId).get();
        if (!shopSnap.exists) {
          allKeys.forEach(k => localStorage.removeItem(k));
          navigate('landing');
          showToast('This shop is no longer registered. Please set up again.', 'warning');
          return;
        }
      } catch(_) { /* offline – continue with cached data */ }
    } else if (_ls(KEYS.shop)) {
      // Has shop data but no shopId = old pre-Firebase data, clear it
      allKeys.forEach(k => localStorage.removeItem(k));
      navigate('landing');
      return;
    }
  }

  const session=DB.getSession();
  if(session){
    state.session=session; state.shopId=DB.getShopId();
    if(firebaseReady&&state.shopId&&session.role!=='super-admin') Sync.start(state.shopId);
    // Admin can restore their last view from URL hash
    const hash = window.location.hash.slice(1);
    const switchable = ['admin','employee','customer'];
    if(session.role==='admin' && hash && switchable.includes(hash)){
      navigate(hash);
    } else if(session.role==='admin') navigate('admin');
    else if(session.role==='employee') navigate('employee');
    else if(session.role==='super-admin'){navigate('super-admin');loadSuperAdminShops();}
    else navigate('customer');
  }else{
    navigate('landing');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  Promise.resolve().then(init).catch(function(err) {
    console.error('App init failed:', err);
    try { navigate('landing'); } catch(e) {
      const app = document.getElementById('app');
      if (app) app.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf8f4;font-family:Georgia,serif;color:#c8a97e;text-align:center;"><div><div style="font-size:2rem;font-weight:600;letter-spacing:2px;">ZARA Aura</div><div style="font-size:0.8rem;color:#9e8c76;margin-top:10px;">Please refresh the page (Ctrl+Shift+R)</div></div></div>';
    }
  });
});
