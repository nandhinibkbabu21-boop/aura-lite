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
  shop:       `${APP_KEY}_shop`,
  employees:  `${APP_KEY}_employees`,
  customers:  `${APP_KEY}_customers`,
  products:   `${APP_KEY}_products`,
  categories: `${APP_KEY}_categories`,
  orders:     `${APP_KEY}_orders`,
  session:    `${APP_KEY}_session`,
  shopId:     `${APP_KEY}_shopId`,
};

const SUPER_ADMIN_CREDS = { username: 'superadmin', password: '1234567890@' };

/* ── Product category & size system ─────────────── */
const PRODUCT_CATEGORIES = ['Men','Women','Kids','Newborn'];
const CATEGORY_SIZES = {
  'Men':     ['XXS','XS','S','M','L','XL','XXL','2XL','3XL'],
  'Women':   ['XXS','XS','S','M','L','XL','XXL','2XL','3XL'],
  'Kids':    ['0-1Y','1-2Y','2-3Y','3-4Y','4-5Y','5-6Y','6-7Y','7-8Y','8-9Y','9-10Y','10-11Y','11-12Y'],
  'Newborn': ['0-3M','3-6M','6-9M','9-12M'],
};
function getSizesForCategory(cat) { return CATEGORY_SIZES[cat] || CATEGORY_SIZES['Men']; }
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
  analyticsPeriod: 'monthly', salaryEmpId: null,
  fpStep: 1, fpVerifiedUser: null, fpOtp: null, fpOtpExpiry: null, fpFoundUser: null,
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

    ['products','employees','customers','orders'].forEach(col => {
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
    if (firebaseReady)
      db.collection('users').doc(c.username).set({ role:'customer', shopId:DB.getShopId(), name:c.name, id:c.id, password:c.password }).catch(console.error);
  },

  addOrder(o) {
    const list = DB.getOrders(); list.push(o); _ls(KEYS.orders, list);
    DB._col('orders')?.doc(o.id).set(o).catch(console.error);
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
    'landing':           renderLanding,
    'login':             () => renderLogin(state.loginRole),
    'forgot-password':   () => renderForgotPassword(state.loginRole),
    'register-shop':     renderRegisterShop,
    'register-customer': renderRegisterCustomer,
    'admin':             renderAdminDash,
    'employee':          renderEmployeeDash,
    'customer':          renderCustomerShop,
    'super-admin':       renderSuperAdminDash,
  };
  app.innerHTML = (views[state.route] || renderLanding)();

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

async function login(role, username, password) {
  if (role === 'super-admin') return loginSuperAdmin(username, password);

  if (firebaseReady) {
    try {
      const userDoc = await db.collection('users').doc(username).get();
      if (userDoc.exists) {
        const u = userDoc.data();
        if (u.password !== password) { showToast('Incorrect password', 'error'); return false; }
        if (u.role !== role) { showToast(`This is a ${u.role} account`, 'error'); return false; }
        // Use shopId from user doc, or fall back to the device's stored shopId
        const resolvedShopId = u.shopId || _ls(KEYS.shopId) || state.shopId;
        if (resolvedShopId) {
          const shopSnap = await db.collection('shops').doc(resolvedShopId).get();
          if (shopSnap.exists) {
            const sd = shopSnap.data();
            if (sd.shopInfo)   _ls(KEYS.shop, sd.shopInfo);
            if (sd.categories) _ls(KEYS.categories, sd.categories);
          }
          _ls(KEYS.shopId, resolvedShopId); state.shopId = resolvedShopId;
          // If user doc had null shopId, fix it in Firebase now
          if (!u.shopId) db.collection('users').doc(username).update({ shopId: resolvedShopId }).catch(()=>{});
          // If customer not in shop's customers sub-collection, add them
          if (role === 'customer') {
            const custRef = db.collection('shops').doc(resolvedShopId).collection('customers').doc(u.id);
            const custSnap = await custRef.get().catch(()=>null);
            if (custSnap && !custSnap.exists) {
              custRef.set({ id:u.id, name:u.name, username, password:u.password, whatsapp:u.whatsapp||'', gender:u.gender||'', size:u.size||'' }).catch(()=>{});
            }
          }
        }
        DB.setSession({ role, name:u.name, username, id:u.id, shopId:resolvedShopId||undefined });
        recordDeviceLogin(resolvedShopId, { role, name:u.name });
        Sync.start(resolvedShopId);
        if (role==='admin') repairOrphanedCustomers(resolvedShopId);
        return true;
      }
      // Not found in Firebase — fall through to local check
    } catch (e) {
      console.error('login error:', e);
      showToast('Connection error – trying offline…', 'warning');
    }
  }

  /* Local fallback */
  const shop = DB.getShop();
  if (!shop) { showToast('No shop found. Please set up your shop first.', 'error'); return false; }
  if (role === 'admin') {
    if (shop.adminUsername === username && shop.adminPassword === password) {
      // Auto-sync old localStorage shop to Firebase if not already there
      let shopId = DB.getShopId();
      if (firebaseReady && !shopId) {
        shopId = uid();
        _ls(KEYS.shopId, shopId);
        state.shopId = shopId;
        const cats = DB.getCategories();
        db.collection('shops').doc(shopId).set({ shopInfo: shop, categories: cats, createdAt: Date.now() }).catch(console.error);
        db.collection('users').doc(username).set({ role:'admin', shopId, name:shop.ownerName, id:shopId, password }).catch(console.error);
        // Sync existing employees, customers, products, orders
        DB.getEmployees().forEach(e => db.collection('shops').doc(shopId).collection('employees').doc(e.id).set(e).catch(console.error));
        DB.getCustomers().forEach(c => db.collection('shops').doc(shopId).collection('customers').doc(c.id).set(c).catch(console.error));
        DB.getProducts().forEach(p => db.collection('shops').doc(shopId).collection('products').doc(p.id).set(p).catch(console.error));
        DB.getOrders().forEach(o => db.collection('shops').doc(shopId).collection('orders').doc(o.id).set(o).catch(console.error));
        showToast('Shop synced to cloud ☁️', 'success');
      }
      DB.setSession({ role:'admin', name:shop.ownerName, username, shopId: shopId||undefined });
      if (shopId) { state.shopId = shopId; Sync.start(shopId); recordDeviceLogin(shopId, { role:'admin', name:shop.ownerName }); repairOrphanedCustomers(shopId); }
      return true;
    }
    showToast('Invalid admin credentials', 'error'); return false;
  }
  if (role === 'employee') {
    const emp = DB.getEmployees().find(e => e.username===username && e.password===password);
    if (emp) { DB.setSession({ role:'employee', name:emp.name, username, id:emp.id }); recordDeviceLogin(DB.getShopId(), { role:'employee', name:emp.name }); return true; }
    showToast('Invalid employee credentials', 'error'); return false;
  }
  if (role === 'customer') {
    const cust = DB.getCustomers().find(c => c.username===username && c.password===password);
    if (cust) { DB.setSession({ role:'customer', name:cust.name, username, id:cust.id }); recordDeviceLogin(DB.getShopId(), { role:'customer', name:cust.name }); return true; }
    showToast('Invalid customer credentials', 'error'); return false;
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
          ${firebaseReady ? `<br/><a id="sa-link" style="font-size:0.68rem;color:var(--text-xlight);margin-top:6px;display:inline-block;cursor:pointer;">Super Admin ↗</a>` : ''}
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
          <p class="text-muted" style="margin-bottom:24px;">Sign in to access your dashboard</p>
          <form id="login-form">
            <div style="display:flex;flex-direction:column;gap:16px;">
              <div class="form-group"><label class="form-label">Username <span class="required">*</span></label>
                <input type="text" class="form-control" name="username" placeholder="Enter your username" required autocomplete="username"/></div>
              <div class="form-group"><label class="form-label">Password <span class="required">*</span></label>
                <div class="password-input-wrap">
                  <input type="password" class="form-control" name="password" id="login-password" placeholder="Enter your password" required autocomplete="current-password"/>
                  <button type="button" class="password-toggle-btn" data-target="login-password">👁</button>
                </div>
                <div style="text-align:right;margin-top:6px;">
                  ${role !== 'super-admin' ? `<button type="button" class="btn-forgot-link" id="forgot-password-link">Forgot Password?</button>` : ''}
                </div>
              </div>
              <button type="submit" class="btn btn-gold btn-block btn-lg" id="login-submit-btn">Sign In</button>
            </div>
          </form>
          ${role === 'customer' ? `<div class="divider">or</div>
            <button class="btn btn-outline btn-block" id="go-register-customer">Create Customer Account</button>` : ''}
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
  <div class="register-page">
    <div class="register-card animate-slideUp" style="max-width:680px;">
      <div class="register-header">
        <div class="badge">✦ &nbsp; First Time Setup</div>
        <h2 style="font-family:var(--font-serif);font-size:2rem;">Set Up Your <span class="gold-text">Boutique</span></h2>
        <p class="text-muted" style="margin-top:6px;">Tell us about your shop to get started</p>
      </div>
      <form id="shop-register-form">
        <div style="display:flex;flex-direction:column;gap:18px;">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Shop Name <span class="required">*</span></label>
              <input type="text" class="form-control" name="name" placeholder="e.g. Radiant Collections" required/></div>
            <div class="form-group"><label class="form-label">Owner Name <span class="required">*</span></label>
              <input type="text" class="form-control" name="ownerName" placeholder="e.g. Priya Sharma" required/></div>
          </div>
          <div class="form-group"><label class="form-label">Shop Address <span class="required">*</span></label>
            <textarea class="form-control" name="address" placeholder="Full address…" required style="min-height:72px;"></textarea></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Phone Number <span class="required">*</span></label>
              <input type="tel" class="form-control" name="phone" placeholder="10-digit number" required maxlength="10" pattern="[0-9]{10}" title="Enter exactly 10 digits"/></div>
            <div class="form-group"><label class="form-label">GST Number <span class="required">*</span></label>
              <input type="text" class="form-control" name="gst" placeholder="e.g. 29ABCDE1234F1Z5" maxlength="15" minlength="15" pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}" title="Enter valid 15-character GST number (e.g. 29ABCDE1234F1Z5)" style="text-transform:uppercase" required/>
              <small class="form-hint">Format: 2 digits + 5 letters + 4 digits + letter + digit + Z + alphanumeric</small></div>
          </div>
          <div style="border-top:1px solid var(--border-light);padding-top:18px;">
            <h4 style="font-family:var(--font-serif);margin-bottom:12px;">Admin Login Credentials</h4>
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
            <div class="form-group"><label class="form-label">WhatsApp Number <span class="required">*</span></label>
              <input type="tel" class="form-control" name="whatsapp" required maxlength="10" pattern="[0-9]{10}" title="Enter exactly 10 digits" placeholder="10-digit number"/></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Gender <span class="required">*</span></label>
              <select class="form-control" name="gender" required>
                <option value="">Select</option>
                <option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other</option>
              </select></div>
            <div class="form-group"><label class="form-label">Clothing Size <span class="required">*</span></label>
              <select class="form-control" name="size" required>
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
                <input type="text" class="form-control" name="username" required placeholder="Choose username" autocomplete="new-password"/></div>
              <div class="form-group"><label class="form-label">Password <span class="required">*</span></label>
                <div class="password-input-wrap">
                  <input type="password" class="form-control" name="password" id="cust-reg-pwd" required placeholder="Choose password" autocomplete="new-password"/>
                  <button type="button" class="password-toggle-btn" data-target="cust-reg-pwd">👁</button>
                </div></div>
            </div>
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
      <span class="gold-text">AURA</span><span class="app-logo-lite">Lite</span>
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
       ['analytics','📊','Analytics'],['sms','📣','Send Offers'],['feedback','⭐','Feedback']]
    : role === 'employee'
    ? [['products','✦','Products'],['stock','◻','Stock'],['salary','💰','My Salary']]
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
  const low=prods.filter(p=>+p.quantity>0&&+p.quantity<=5), oos=prods.filter(p=>+p.quantity===0);
  const rev=ords.reduce((s,o)=>s+(+o.total||0),0);
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
    ${(oos.length||low.length)?`<div style="margin-bottom:24px;">
      ${oos.slice(0,3).map(p=>`<div class="alert alert-danger">✕ &nbsp; <strong>${esc(p.name)}</strong> is out of stock</div>`).join('')}
      ${low.slice(0,5).map(p=>`<div class="alert alert-warning">⚠ &nbsp; <strong>${esc(p.name)}</strong> – only ${p.quantity} left</div>`).join('')}
    </div>`:''}
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
function statCard(icon,label,value,sub){
  return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-info">
    <div class="stat-value">${value}</div><div class="stat-label">${label}</div>
    ${sub?`<div class="stat-badge">${sub}</div>`:''}</div></div>`;
}

function renderAdminProducts() {
  const q=state.searchQuery.toLowerCase();
  const prods=DB.getProducts().filter(p=>!q||p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)||p.color.toLowerCase().includes(q));
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Product Catalogue</div><div class="dash-page-subtitle">Manage your clothing inventory</div>
    <div class="dash-toolbar">
      <div class="dash-search"><span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search products…" id="product-search" value="${esc(state.searchQuery)}"/></div>
      <button class="btn btn-gold" id="add-product-btn">+ Add Product</button>
    </div>
    ${prods.length===0?`<div class="empty-state"><div class="empty-state-icon">👗</div><div class="empty-state-title">No products found</div></div>`:
      `<div class="grid-3">${prods.map(renderProductCard).join('')}</div>`}
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
        <span class="product-tag" style="display:flex;align-items:center;gap:4px;">
          <span class="color-dot" style="background:${esc((p.color||'#ccc').toLowerCase())};"></span>${esc(p.color||'')}</span>
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
function renderProductModal() {
  const editing=state.editingId?DB.getProducts().find(p=>p.id===state.editingId):null, v=editing||{};
  const curCat = v.category || 'Men';
  const availSizes = getSizesForCategory(curCat);
  const existingSizes = getProductSizes(v);

  const sizeRows = existingSizes.length
    ? existingSizes.map(s=>`<tr class="size-row">
        <td><select class="form-control form-control-sm size-size-sel">
          ${availSizes.map(sz=>`<option value="${sz}"${sz===s.size?' selected':''}>${sz}</option>`).join('')}
        </select></td>
        <td><input type="number" class="form-control form-control-sm size-price-inp" min="0" value="${s.price}" placeholder="0"/></td>
        <td><button type="button" class="btn-icon remove-size-row" style="width:28px;height:28px;font-size:0.8rem;">✕</button></td>
      </tr>`).join('')
    : `<tr class="size-row">
        <td><select class="form-control form-control-sm size-size-sel">
          ${availSizes.map(sz=>`<option value="${sz}">${sz}</option>`).join('')}
        </select></td>
        <td><input type="number" class="form-control form-control-sm size-price-inp" min="0" placeholder="0"/></td>
        <td><button type="button" class="btn-icon remove-size-row" style="width:28px;height:28px;font-size:0.8rem;">✕</button></td>
      </tr>`;

  return `<div class="modal-overlay" id="product-modal-overlay">
    <div class="modal modal-lg animate-slideUp">
      <div class="modal-header"><div><div class="login-role-badge">✦ &nbsp; ${editing?'Edit Product':'Add Product'}</div>
        <div class="modal-title">${editing?esc(editing.name):'New Product'}</div></div>
        <button class="modal-close" data-close-modal="product">✕</button></div>
      <div class="modal-body"><form id="product-form"><div style="display:flex;gap:22px;flex-wrap:wrap;">
        <div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:14px;">
          <div class="form-group"><label class="form-label">Product Name <span class="required">*</span></label>
            <input type="text" class="form-control" name="name" id="prod-name" value="${esc(v.name||'')}" placeholder="e.g. Silk Anarkali Kurta" required/></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Category <span class="required">*</span></label>
              <select class="form-control" name="category" id="prod-category-sel" required>
                <option value="">Select category</option>
                ${PRODUCT_CATEGORIES.map(c=>`<option value="${c}"${c===curCat?' selected':''}>${c}</option>`).join('')}
              </select></div>
            <div class="form-group"><label class="form-label">Color <span class="required">*</span></label>
              <input type="text" class="form-control" name="color" value="${esc(v.color||'')}" placeholder="e.g. Royal Blue" required/></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Material / Type <span class="optional-tag">(Optional)</span></label>
              <input type="text" class="form-control" name="material" value="${esc(v.material||'')}" placeholder="e.g. Cotton, Silk"/></div>
            <div class="form-group"><label class="form-label">Available Quantity <span class="required">*</span></label>
              <input type="number" class="form-control" name="quantity" value="${esc(v.quantity||'')}" min="0" required/></div>
          </div>
          <div class="form-group"><label class="form-label">Description <span class="optional-tag">(Optional)</span></label>
            <textarea class="form-control" name="description" placeholder="Product description, features…" style="min-height:58px;">${esc(v.description||'')}</textarea></div>
          <!-- Sizes & Prices -->
          <div class="form-group">
            <label class="form-label">Sizes &amp; Prices <span class="required">*</span></label>
            <div class="size-price-wrap">
              <table class="size-price-table">
                <thead><tr><th>Size</th><th>Price (₹)</th><th></th></tr></thead>
                <tbody id="sizes-tbody">${sizeRows}</tbody>
              </table>
              <button type="button" id="add-size-row-btn" class="btn btn-outline btn-sm" style="margin-top:8px;">+ Add Size</button>
            </div>
          </div>
        </div>
        <div style="width:190px;flex-shrink:0;">
          <label class="form-label" style="display:block;margin-bottom:8px;">Image <span class="optional-tag">(Optional)</span></label>
          <div class="img-upload-area" id="img-upload-area">
            <input type="file" name="image" accept="image/*" id="img-file-input"/>
            ${v.image?`<img src="${v.image}" class="img-preview" id="img-preview"/><p class="img-upload-text" style="margin-top:6px;">Click to change</p>`:
              `<div class="img-upload-icon">📷</div><p class="img-upload-text">Click to upload</p>`}
          </div>
          <input type="hidden" name="imageData" id="image-data-input" value="${esc(v.image||'')}"/>
        </div>
      </div></form></div>
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
  const cats=DB.getCategories(), prods=DB.getProducts();
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Categories</div><div class="dash-page-subtitle">Organise your product catalogue</div>
    <div class="dash-toolbar"><form id="add-category-form" style="display:flex;gap:12px;flex:1;">
      <input type="text" class="form-control" name="catName" placeholder="New category name…" style="flex:1;" required/>
      <button type="submit" class="btn btn-gold">+ Add</button></form></div>
    ${cats.length===0?`<div class="empty-state"><div class="empty-state-icon">◻</div><div class="empty-state-title">No categories yet</div></div>`:
    `<div class="grid-3">${cats.map(cat=>{const cnt=prods.filter(p=>p.category===cat).length;
      return `<div class="card card-gold" style="display:flex;align-items:center;justify-content:space-between;">
        <div><div style="font-family:var(--font-serif);font-size:1.1rem;font-weight:600;">${esc(cat)}</div>
          <div style="font-size:0.75rem;color:var(--text-light);margin-top:3px;">${cnt} product${cnt!==1?'s':''}</div></div>
        <button class="btn-icon" data-delete-cat="${esc(cat)}">✕</button></div>`;}).join('')}</div>`}
  </div>`;
}

function renderAdminEmployees() {
  const emps=DB.getEmployees();
  const q=state.searchQuery.toLowerCase();
  const filtered=emps.filter(e=>!q||e.name.toLowerCase().includes(q)||e.phone.includes(q));
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Team Members</div><div class="dash-page-subtitle">Manage your shop staff</div>
    <div class="dash-toolbar">
      <div class="dash-search" style="flex:1;"><span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search employees…" id="emp-search" value="${esc(state.searchQuery)}"/></div>
      <button class="btn btn-gold" id="add-emp-btn">+ Add Employee</button>
    </div>
    ${filtered.length===0?`<div class="empty-state"><div class="empty-state-icon">◉</div><div class="empty-state-title">No employees added</div></div>`:
    `<div class="table-wrap"><table>
      <thead><tr><th>Employee</th><th>Phone</th><th>Join Date</th><th>Current Salary</th><th>Actions</th></tr></thead>
      <tbody>${filtered.map(e=>`<tr>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);border:1px solid var(--gold-light);display:flex;align-items:center;justify-content:center;">${e.gender==='Female'?'👩':'👨'}</div>
          <div><div class="td-name">${esc(e.name)}</div>
            <div style="font-size:0.72rem;color:var(--text-light);">${esc(e.username)}</div></div></div></td>
        <td>${esc(e.phone)}</td>
        <td style="font-size:0.82rem;color:var(--text-light);">${e.joinDate?fmtDate(e.joinDate):'—'}</td>
        <td>
          ${e.salary
            ? `<span style="font-family:var(--font-serif);font-weight:700;color:var(--gold-dark);font-size:1rem;">${fmt(e.salary)}</span>
               <div style="font-size:0.7rem;color:var(--text-light);">per month · ${(e.salaryHistory||[]).length} entr${(e.salaryHistory||[]).length===1?'y':'ies'}</div>`
            : `<span style="color:var(--text-xlight);font-size:0.82rem;">Not set</span>`}
        </td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-gold btn-sm" data-salary-emp="${esc(e.id)}">💰 Salary</button>
          <button class="btn btn-outline btn-sm" data-edit-emp="${esc(e.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-delete-emp="${esc(e.id)}">Remove</button>
        </div></td></tr>`).join('')}
      </tbody></table></div>`}
    ${state.modalOpen==='employee'?renderEmployeeModal():''}
    ${state.modalOpen==='salary'?renderAdminSalaryModal(state.salaryEmpId):''}
  </div>`;
}

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
      <thead><tr><th>Customer</th><th>WhatsApp</th><th>Gender</th><th>Size</th><th>Preferred Color</th><th>Occasion</th></tr></thead>
      <tbody>${custs.map(c=>`<tr>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);display:flex;align-items:center;justify-content:center;">${c.gender==='Female'?'👩':'👨'}</div>
          <div class="td-name">${esc(c.name)}</div></div></td>
        <td>${esc(c.whatsapp)}</td><td>${esc(c.gender)}</td>
        <td><span class="td-badge badge-gold">${esc(c.size)}</span></td>
        <td>${c.preferredColor?`<div style="display:flex;align-items:center;gap:6px;">
          <span class="color-dot" style="background:${esc(c.preferredColor.toLowerCase())};"></span>${esc(c.preferredColor)}</div>`:'<span style="color:var(--text-xlight);">—</span>'}</td>
        <td>${c.occasion?`<span class="td-badge badge-gray">${esc(c.occasion)}</span>`:'<span style="color:var(--text-xlight);">—</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`}
  </div>`;
}

function renderAdminOrders() {
  const ords=DB.getOrders().slice().reverse(), custs=DB.getCustomers();
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Orders</div><div class="dash-page-subtitle">${ords.length} order${ords.length!==1?'s':''} total</div>
    ${ords.length===0?`<div class="empty-state"><div class="empty-state-icon">◊</div><div class="empty-state-title">No orders yet</div></div>`:
    `<div class="table-wrap"><table>
      <thead><tr><th>Order ID</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Action</th></tr></thead>
      <tbody>${ords.map(o=>{const c=custs.find(x=>x.id===o.customerId);
        return `<tr>
          <td><code style="font-size:0.75rem;background:var(--cream-2);padding:2px 8px;border-radius:4px;">#${o.id.slice(-6).toUpperCase()}</code></td>
          <td class="td-name">${esc(c?.name||'Guest')}</td>
          <td style="font-size:0.82rem;color:var(--text-light);">${fmtDate(o.date)}</td>
          <td>${o.items.length} item${o.items.length!==1?'s':''}</td>
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
  </div>`;
}

/* ═══════════════════════════════════════════════════
   15. EMPLOYEE DASHBOARD
═══════════════════════════════════════════════════ */
function renderEmployeeDash() {
  const session=DB.getSession(), shop=DB.getShop();
  const mainView = state.subRoute==='stock' ? renderEmpStock()
                 : state.subRoute==='salary' ? renderEmpSalary()
                 : renderEmpProducts();
  return `<div>${renderAppHeader({ shopName:shop?.name, userName:session?.name })}
    <div class="dash-layout">${renderSidebar('employee')}
      <main class="dash-main">${mainView}</main>
    </div></div>`;
}
function renderEmpProducts() {
  const q=state.searchQuery.toLowerCase();
  const prods=DB.getProducts().filter(p=>!q||p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q));
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Product Catalogue</div><div class="dash-page-subtitle">Manage clothing stock</div>
    <div class="dash-toolbar">
      <div class="dash-search" style="flex:1;"><span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search products…" id="product-search" value="${esc(state.searchQuery)}"/></div>
      <button class="btn btn-gold" id="add-product-btn">+ Add Product</button>
    </div>
    ${prods.length===0?`<div class="empty-state"><div class="empty-state-icon">👗</div><div class="empty-state-title">No products found</div></div>`:
      `<div class="grid-3">${prods.map(renderProductCard).join('')}</div>`}
    ${state.modalOpen==='product'?renderProductModal():''}
    ${state.modalOpen==='stock'?renderStockModal(state.stockProductId):''}
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
function renderCustomerShop() {
  if (state.subRoute === 'feedback') return renderCustomerFeedbackPage();
  const shop=DB.getShop(), session=DB.getSession();
  const cust=DB.getCustomers().find(c=>c.id===session?.id);
  const prods=DB.getProducts().filter(p=>+p.quantity>0);
  const cats=['all',...new Set(prods.map(p=>p.category))];
  const af=state.activeFilter||'all', q=(state.searchQuery||'').toLowerCase();
  let filtered=af==='all'?prods:prods.filter(p=>p.category===af);
  if(q) filtered=filtered.filter(p=>p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)||p.color.toLowerCase().includes(q));
  const recs=cust?getRecommendations(prods,cust).slice(0,4):[];
  const cartCount=state.cart.reduce((s,i)=>s+i.qty,0);
  return `<div>
    <header class="app-header">
      <div class="app-logo"><span class="gold-text">ZARA</span><span class="app-logo-lite">Aura</span></div>
      <div class="header-actions">
        ${firebaseReady?`<span class="live-indicator" title="Live sync">● LIVE</span>`:''}
        <div class="dash-search" style="min-width:190px;"><span class="dash-search-icon">⌕</span>
          <input type="text" placeholder="Search…" id="shop-search" value="${esc(state.searchQuery)}" style="padding:8px 14px 8px 34px;border-radius:20px;"/></div>
        <div class="cart-btn" id="open-cart-btn">🛍${cartCount>0?`<span class="cart-count">${cartCount}</span>`:''}</div>
        <button class="btn btn-feedback-header" id="customer-feedback-nav-btn" title="Leave Feedback">⭐ Feedback</button>
        <button class="btn btn-ghost btn-sm" id="logout-btn">Sign Out</button>
      </div>
    </header>
    <div class="shop-hero"><div class="shop-hero-content">
      ${cust?`<div class="shop-hero-greeting">✦ &nbsp; Welcome back, ${esc(cust.name)} &nbsp; ✦</div>`:''}
      <div class="shop-hero-name gold-text">${esc(shop?.name||'Zara Aura')}</div>
      <div class="shop-hero-sub">${esc(shop?.address||'Luxury Fashion Boutique')}</div>
    </div></div>
    <div class="shop-filter-bar">
      ${cats.map(cat=>`<div class="filter-chip${af===cat?' active':''}" data-filter="${esc(cat)}">${cat==='all'?'✦ All':esc(cat)}</div>`).join('')}
    </div>
    ${recs.length?`<div class="shop-section" style="background:var(--cream);border-bottom:1px solid var(--border-light);">
      <div class="shop-section-header"><div>
        <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">✦ Curated For You</div>
        <div class="shop-section-title">Recommended</div></div><div class="shop-section-line"></div></div>
      <div class="shop-grid">${recs.map(renderShopCard).join('')}</div>
    </div>`:''}
    <div class="shop-section">
      <div class="shop-section-header"><div>
        <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:4px;">${af==='all'?'Complete Collection':esc(af)}</div>
        <div class="shop-section-title">${filtered.length} Item${filtered.length!==1?'s':''}</div></div><div class="shop-section-line"></div></div>
      ${filtered.length===0?`<div class="empty-state"><div class="empty-state-icon">✦</div><div class="empty-state-title">No products found</div></div>`:
        `<div class="shop-grid">${filtered.map(renderShopCard).join('')}</div>`}
    </div>
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
  return `<div class="shop-card" data-product-detail="${esc(p.id)}">
    <div class="shop-card-img">
      ${p.image?`<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>`:
        `<div class="no-img" style="font-size:2.5rem;">👗</div>`}
      <span class="shop-card-badge">${esc(p.category)}</span>
    </div>
    <div class="shop-card-body">
      <div class="shop-card-category">${esc(p.category)}${p.material?` · ${esc(p.material)}`:''}</div>
      <div class="shop-card-name">${esc(p.name)}</div>
      <div class="shop-card-tags" style="flex-wrap:wrap;gap:4px;">
        ${sizes.slice(0,5).map(s=>`<span class="product-tag size-tag-sm">${esc(s.size)}</span>`).join('')}
        ${sizes.length>5?`<span class="product-tag" style="color:var(--text-light);">+${sizes.length-5}</span>`:''}
        <span class="product-tag" style="display:flex;align-items:center;gap:4px;">
          <span class="color-dot" style="background:${esc((p.color||'#ccc').toLowerCase())};"></span>${esc(p.color||'')}</span>
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
  const p=DB.getProducts().find(pr=>pr.id===pid); if(!p) return '';
  const sizes=getProductSizes(p);
  const firstSize=sizes[0]||null;
  const outOfStock=+p.quantity===0;
  return `<div class="modal-overlay" id="product-detail-overlay">
    <div class="modal modal-lg animate-slideUp">
      <div class="modal-header"><div class="modal-title">${esc(p.name)}</div>
        <button class="modal-close" data-close-modal="product-detail">✕</button></div>
      <div class="modal-body"><div style="display:flex;gap:24px;flex-wrap:wrap;">
        <!-- Image -->
        <div style="flex:0 0 220px;">
          ${p.image
            ?`<img src="${p.image}" id="detail-zoom-img" style="width:100%;border-radius:var(--radius-lg);object-fit:cover;aspect-ratio:3/4;cursor:zoom-in;transition:transform 0.2s;" onclick="this.style.transform=this.style.transform?'':'scale(1.5)';"/>`
            :`<div style="width:100%;aspect-ratio:3/4;background:var(--cream-2);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;font-size:4rem;">👗</div>`}
          ${p.image?`<p style="font-size:0.72rem;color:var(--text-xlight);text-align:center;margin-top:6px;">Tap image to zoom</p>`:''}
        </div>
        <!-- Details -->
        <div style="flex:1;min-width:200px;">
          <div style="font-size:0.72rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">${esc(p.category)}${p.material?' · '+esc(p.material):''}</div>
          <h2 style="font-family:var(--font-serif);margin-bottom:10px;">${esc(p.name)}</h2>
          ${p.description?`<p style="font-size:0.85rem;color:var(--text-medium);margin-bottom:14px;line-height:1.6;">${esc(p.description)}</p>`:''}
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;font-size:0.85rem;">
            <span style="color:var(--text-light);width:60px;">Color</span>
            <span style="display:flex;align-items:center;gap:6px;"><span class="color-dot" style="background:${esc((p.color||'#ccc').toLowerCase())};width:14px;height:14px;"></span>${esc(p.color||'')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;font-size:0.85rem;">
            <span style="color:var(--text-light);width:60px;">Stock</span>
            <span class="td-badge ${outOfStock?'badge-red':+p.quantity<=5?'badge-gold':'badge-green'}">${outOfStock?'Out of Stock':+p.quantity<=5?`Only ${p.quantity} left`:'In Stock'}</span>
          </div>
          ${sizes.length?`
          <div style="margin-bottom:20px;">
            <div style="font-size:0.78rem;font-weight:700;color:var(--text-medium);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Select Size</div>
            <div class="detail-size-btns" style="display:flex;flex-wrap:wrap;gap:8px;">
              ${sizes.map((s,i)=>`<button type="button" class="detail-size-btn${i===0?' active':''}" data-sz="${esc(s.size)}" data-price="${s.price}" ${outOfStock?'disabled':''}>
                ${esc(s.size)}<span class="size-price-tag">₹${(+s.price).toLocaleString('en-IN')}</span>
              </button>`).join('')}
            </div>
          </div>
          <div id="detail-price-display" style="font-family:var(--font-serif);font-size:2rem;font-weight:700;color:var(--gold-dark);margin-bottom:20px;">
            ${firstSize?fmt(firstSize.price):fmt(p.price||0)}
          </div>`:`
          <div id="detail-price-display" style="font-family:var(--font-serif);font-size:2rem;font-weight:700;color:var(--gold-dark);margin-bottom:20px;">${fmt(p.price||0)}</div>`}
          <button class="btn ${outOfStock?'btn-ghost':'btn-gold'} btn-block btn-lg" id="detail-add-cart-btn"
            data-pid="${esc(p.id)}"
            data-sz="${esc(firstSize?.size||p.size||'')}"
            data-price="${firstSize?.price||p.price||0}"
            ${outOfStock?'disabled':''}>
            ${outOfStock?'Out of Stock':'+ Add to Cart'}
          </button>
        </div>
      </div></div>
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
      <button class="btn btn-gold btn-block btn-lg" style="margin-top:14px;" id="checkout-btn">✦ &nbsp; Checkout</button>
    </div>`}
  </div>`;
}

/* ═══════════════════════════════════════════════════
   18. BILL & WHATSAPP
═══════════════════════════════════════════════════ */
function renderBillHTML(order, shop, cust) {
  const items=order?.items||[], sub=items.reduce((s,i)=>s+i.qty*i.price,0);
  return `<div class="bill-receipt">
    <div class="bill-header">
      <div class="bill-shop-name gold-text">${esc(shop?.name||'Zara Aura')}</div>
      <div class="bill-shop-address">${esc(shop?.address||'')}</div>
      ${shop?.gst?`<div style="font-size:0.72rem;color:var(--text-light);margin-top:4px;">GST: ${esc(shop.gst)}</div>`:''}
    </div>
    <div class="bill-meta"><span>Bill No: #${order.id.slice(-8).toUpperCase()}</span><span>${fmtDate(order.date)}</span></div>
    <div style="margin-bottom:14px;font-size:0.82rem;"><strong>Customer:</strong> ${esc(cust?.name||'Guest')}<br/>
      <span style="color:var(--text-light);">WhatsApp: ${esc(cust?.whatsapp||'—')}</span></div>
    <table class="bill-table">
      <thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>
        ${items.map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.size||'')}</td><td>${i.qty}</td><td>${fmt(i.price)}</td><td>${fmt(i.qty*i.price)}</td></tr>`).join('')}
        <tr class="bill-total-row"><td colspan="4">Total Amount</td><td>${fmt(sub)}</td></tr>
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
  const waLink=`https://wa.me/91${cust?.whatsapp}?text=${encodeURIComponent(buildWhatsAppBill(order,shop,cust))}`;
  return `<div class="modal-overlay" id="success-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-body" style="text-align:center;padding:36px 28px;">
        <div style="font-size:3rem;margin-bottom:14px;">✦</div>
        <h2 style="font-family:var(--font-serif);margin-bottom:8px;color:var(--gold-dark);">Order Confirmed!</h2>
        <p class="text-muted" style="margin-bottom:24px;">Your purchase has been processed successfully.</p>
        ${renderBillHTML(order,shop,cust)}
        <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;">
          <a href="${waLink}" target="_blank" class="btn btn-gold btn-lg btn-block">📱 &nbsp; Send Bill to WhatsApp</a>
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
        <span class="gold-text">AURA</span><span class="app-logo-lite">Lite</span>
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
function getRecommendations(products, cust) {
  if (!cust) return [];
  const score = p => {
    let s=0;
    if (cust.size && p.size===cust.size) s+=3;
    if (cust.preferredColor && p.color.toLowerCase().includes(cust.preferredColor.toLowerCase())) s+=2;
    if (cust.occasion && p.category.toLowerCase().includes(cust.occasion.toLowerCase())) s+=2;
    if (cust.gender==='Female' && ['kurta','saree','lehenga','dress','salwar'].some(k=>p.category.toLowerCase().includes(k))) s+=1;
    if (cust.gender==='Male' && ['shirt','trouser','kurta','suit','sherwani'].some(k=>p.category.toLowerCase().includes(k))) s+=1;
    return s;
  };
  return products.filter(p=>score(p)>0).sort((a,b)=>score(b)-score(a));
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
    state.cart.push({cartKey,id:p.id,name:p.name,size:sz,color:p.color,price:pr,image:p.image,qty:1});
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
          📱 &nbsp; Bill will be sent to <strong>${esc(cust?.whatsapp||'your WhatsApp')}</strong> after confirming.
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
  const total=cart.reduce((s,i)=>s+i.qty*i.price,0);
  cart.forEach(item=>{const p=DB.getProducts().find(pr=>pr.id===item.id);if(p) DB.updateProduct(item.id,{quantity:Math.max(0,+p.quantity-item.qty)});});
  const order={id:uid(),customerId:session?.id,items:cart.map(i=>({id:i.id,name:i.name,size:i.size,color:i.color,price:i.price,qty:i.qty})),total,date:Date.now()};
  DB.addOrder(order); state.cart=[];
  document.getElementById('checkout-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', renderOrderSuccess(order.id));
  document.getElementById('close-success-btn')?.addEventListener('click', ()=>{document.getElementById('success-overlay')?.remove();render();});

  // Send thank-you SMS via backend (falls back to WhatsApp if backend not set up)
  const cust=DB.getCustomers().find(c=>c.id===session?.id);
  const shop=DB.getShop();
  if(cust?.whatsapp) {
    const phone = cust.whatsapp.replace(/\D/g,'');
    if (BACKEND_URL) {
      // Auto-send via backend Twilio SMS (silent, no popup)
      apiPost('/api/sms/send-thankyou', {
        phone,
        customerName: cust.name,
        shopName: shop?.name || 'Zara Aura',
        orderId: order.id,
        total,
        items: order.items.map(i => ({ name: i.name, qty: i.qty }))
      }).then(r => {
        if (r.success) showToast('Thank you SMS sent to your phone!', 'success');
      }).catch(() => {});
    } else {
      // Fallback: WhatsApp deep link
      const itemLines = order.items.map(i=>`  • ${i.name} (${i.size}, ${i.color}) × ${i.qty} — ${fmt(i.qty*i.price)}`).join('\n');
      const msg = `🛍️ *${shop?.name||'Zara Aura'} — Order Receipt*\nOrder ID: #${order.id.slice(-6).toUpperCase()}\nDate: ${fmtDate(order.date)}\n\n*Items:*\n${itemLines}\n\n*Total: ${fmt(total)}*\n\nThank you for shopping! 🙏`;
      setTimeout(()=>{ window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`,'_blank'); }, 800);
      showToast('Bill sent via WhatsApp!','success');
    }
  }
}

/* ═══════════════════════════════════════════════════
   22a. ADMIN SMS — SEND OFFERS
═══════════════════════════════════════════════════ */
function renderAdminSms() {
  const shop = DB.getShop();
  const customers = DB.getCustomers();
  const optedIn = customers.filter(c => c.smsConsent).length;
  const backendOk = !!BACKEND_URL;

  return `
  <div class="section-header">
    <h2 class="section-title">📣 Send Offers via SMS</h2>
    <p class="text-muted" style="margin-top:4px;">Send promotional SMS directly to opted-in customers</p>
  </div>

  ${!backendOk ? `<div class="alert-banner alert-warning">
    ⚠️ Backend not configured. Set up the backend server and add <code>backendConfig</code> to your app to enable real SMS sending.
    <a href="#" style="color:inherit;font-weight:700;display:block;margin-top:4px;">See setup guide →</a>
  </div>` : ''}

  <div class="grid-3" style="margin-bottom:24px;">
    <div class="stat-card">
      <div class="stat-value">${customers.length}</div>
      <div class="stat-label">Total Customers</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:var(--gold)">${optedIn}</div>
      <div class="stat-label">SMS Opted-In</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:#2E7D32">${backendOk ? 'Active' : 'Inactive'}</div>
      <div class="stat-label">SMS Service</div>
    </div>
  </div>

  <div class="card" style="padding:28px;max-width:600px;">
    <h3 style="font-family:var(--font-serif);margin-bottom:18px;">Compose Offer Message</h3>
    <form id="sms-offer-form">
      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label">Message <span class="required">*</span></label>
        <textarea class="form-control" id="sms-offer-msg" name="message"
          placeholder="e.g. 🎉 Big Sale! Up to 50% off on all kurtas. Visit us today!"
          rows="4" maxlength="320" required
          style="resize:vertical;"></textarea>
        <div style="display:flex;justify-content:space-between;margin-top:6px;">
          <small class="form-hint">Will be sent to <strong>${optedIn} opted-in</strong> customer${optedIn!==1?'s':''}</small>
          <small class="form-hint" id="sms-char-count">0 / 320</small>
        </div>
      </div>

      <div style="background:var(--cream-2);border:1px solid var(--border-light);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;">
        <div style="font-size:0.78rem;color:var(--text-medium);font-weight:600;margin-bottom:6px;">📱 Preview (as seen on phone)</div>
        <div id="sms-preview" style="font-size:0.88rem;color:var(--text-dark);white-space:pre-wrap;min-height:40px;"></div>
      </div>

      <button type="submit" class="btn btn-gold btn-lg" id="sms-offer-btn" ${!backendOk||optedIn===0?'disabled':''}>
        📣 &nbsp; Send to ${optedIn} Customer${optedIn!==1?'s':''}
      </button>
      ${optedIn===0?`<p class="form-hint" style="margin-top:8px;color:var(--text-light);">No opted-in customers yet. Customers can opt-in during registration.</p>`:''}
    </form>
    <div id="sms-result" style="margin-top:16px;display:none;"></div>
  </div>`;
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
    state.loginRole=role; navigate('login');
  });
  on('#setup-shop-link','click', ()=>navigate('register-shop'));
  on('#sa-link','click', ()=>{state.loginRole='super-admin';navigate('login');});

  /* Login */
  on('#login-form','submit', async e=>{
    e.preventDefault();
    const fd=new FormData(e.target), btn=document.getElementById('login-submit-btn');
    if(btn){btn.disabled=true;btn.textContent='Signing in…';}
    const ok=await login(state.loginRole,fd.get('username'),fd.get('password'));
    if(btn){btn.disabled=false;btn.textContent='Sign In';}
    if(ok){
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
    const shop={name:fd.get('name'),ownerName:fd.get('ownerName'),address:fd.get('address'),phone:fd.get('phone'),gst:fd.get('gst'),
      adminUsername:fd.get('adminUsername'),adminPassword:fd.get('adminPassword'),createdAt:Date.now()};
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
    const cust={id:uid(),name:fd.get('name'),whatsapp:fd.get('whatsapp'),gender:fd.get('gender'),size:fd.get('size'),
      address:fd.get('address'),skinTone:fd.get('skinTone'),preferredColor:fd.get('preferredColor'),
      occasion:fd.get('occasion'),username:fd.get('username'),password:fd.get('password'),
      smsConsent: fd.get('smsConsent') === 'yes'};
    if(!cust.name||!cust.whatsapp||!cust.gender||!cust.size||!cust.username||!cust.password){showToast('Fill all required fields','error');return;}
    if(!/^[0-9]{10}$/.test(cust.whatsapp)){showToast('WhatsApp number must be exactly 10 digits','error');return;}
    DB.addCustomer(cust);
    const custShopId = DB.getShopId();
    DB.setSession({role:'customer',name:cust.name,username:cust.username,id:cust.id,shopId:custShopId||undefined});
    if(firebaseReady && custShopId){ state.shopId = custShopId; Sync.start(custShopId); }
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
    if(preview) preview.textContent=msg;
    if(counter) counter.textContent=`${msg.length} / 320`;
  });
  on('#sms-offer-form','submit', async e=>{
    e.preventDefault();
    const msg = document.getElementById('sms-offer-msg')?.value.trim();
    const btn = document.getElementById('sms-offer-btn');
    const result = document.getElementById('sms-result');
    if(!msg) return;
    if(btn){btn.disabled=true;btn.textContent='Sending…';}
    const shopId = DB.getShopId();
    try {
      const r = await apiPost('/api/sms/send-offer', { shopId, message: msg }, true);
      if(btn){btn.disabled=false;btn.textContent='📣  Send Offer';}
      if(result){
        result.style.display='block';
        if(r.success){
          result.innerHTML=`<div class="alert-banner alert-success">✅ Sent <strong>${r.sent}</strong> messages. Failed: ${r.failed}.</div>`;
          showToast(`SMS sent to ${r.sent} customers!`,'success');
        } else {
          result.innerHTML=`<div class="alert-banner alert-error">❌ ${r.error||'Failed to send SMS.'}</div>`;
          showToast(r.error||'SMS sending failed.','error');
        }
      }
    } catch(err){
      if(btn){btn.disabled=false;btn.textContent='📣  Send Offer';}
      showToast('Network error. Check backend connection.','error');
    }
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

  /* Back to shop btn in customer feedback page */
  on('#back-to-shop-btn','click', ()=>{state.subRoute='products';render();postRender();});

  /* Search */
  on('#product-search','input', e=>{state.searchQuery=e.target.value;render();});
  on('#emp-search','input', e=>{state.searchQuery=e.target.value;render();});
  on('#shop-search','input', e=>{state.searchQuery=e.target.value;render();});

  /* Category filter */
  onAll('.filter-chip','click', e=>{state.activeFilter=e.currentTarget.dataset.filter;render();});

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
  /* Product form — category change updates size options */
  on('#prod-category-sel','change', e=>{
    const cat=e.target.value;
    const sizes=getSizesForCategory(cat);
    document.querySelectorAll('#sizes-tbody .size-size-sel').forEach(sel=>{
      const cur=sel.value;
      sel.innerHTML=sizes.map(s=>`<option value="${s}"${s===cur?' selected':''}>${s}</option>`).join('');
    });
  });

  /* Product form — add size row */
  on('#add-size-row-btn','click', ()=>{
    const cat=document.getElementById('prod-category-sel')?.value||'Men';
    const sizes=getSizesForCategory(cat);
    const tbody=document.getElementById('sizes-tbody'); if(!tbody) return;
    const row=document.createElement('tr');row.className='size-row';
    row.innerHTML=`<td><select class="form-control form-control-sm size-size-sel">
      ${sizes.map(s=>`<option value="${s}">${s}</option>`).join('')}
    </select></td>
    <td><input type="number" class="form-control form-control-sm size-price-inp" min="0" placeholder="0"/></td>
    <td><button type="button" class="btn-icon remove-size-row" style="width:28px;height:28px;font-size:0.8rem;">✕</button></td>`;
    tbody.appendChild(row);
    row.querySelector('.remove-size-row').addEventListener('click',()=>row.remove());
  });

  /* Product form — remove size row (delegated) */
  document.addEventListener('click', e=>{
    if(e.target.closest('.remove-size-row')){
      const row=e.target.closest('.size-row');
      const tbody=document.getElementById('sizes-tbody');
      if(tbody&&tbody.querySelectorAll('.size-row').length>1) row?.remove();
      else showToast('At least one size is required','error');
    }
  },{capture:false});

  on('#img-file-input','change', async e=>{
    const file=e.target.files[0]; if(!file) return;
    const compressed=await compressImage(file);
    document.getElementById('image-data-input').value=compressed;
    const area=document.getElementById('img-upload-area');
    area.querySelector('.img-preview')?.remove();
    const img=document.createElement('img');img.src=compressed;img.className='img-preview';area.appendChild(img);
  });
  on('#save-product-btn','click', ()=>{
    const form=document.getElementById('product-form');if(!form) return;
    const fd=new FormData(form), imageData=document.getElementById('image-data-input')?.value||'';
    // Collect sizes from table
    const sizesData=[];
    document.querySelectorAll('#sizes-tbody .size-row').forEach(row=>{
      const sz=row.querySelector('.size-size-sel')?.value;
      const pr=+row.querySelector('.size-price-inp')?.value;
      if(sz && !isNaN(pr) && pr>=0) sizesData.push({size:sz,price:pr});
    });
    if(sizesData.length===0){showToast('Add at least one size with a price','error');return;}
    const prod={
      name:fd.get('name')?.trim(),
      category:fd.get('category')?.trim(),
      material:fd.get('material')?.trim()||'',
      description:fd.get('description')?.trim()||'',
      color:fd.get('color')?.trim(),
      quantity:+fd.get('quantity'),
      sizes:sizesData,
      // Keep legacy fields for backward compat
      size:sizesData[0].size, price:sizesData[0].price,
      image:imageData
    };
    if(!prod.name||!prod.category||!prod.color||isNaN(prod.quantity)){showToast('Fill all required fields','error');return;}
    if(state.editingId){DB.updateProduct(state.editingId,prod);showToast('Product updated','success');}
    else{prod.id=uid();prod.addedDate=Date.now();DB.addProduct(prod);DB.addCategory(prod.category);showToast('Product added','success');}
    state.modalOpen=null;state.editingId=null;render();
  });

  /* Close modals */
  onAll('[data-close-modal]','click', ()=>{state.modalOpen=null;state.editingId=null;render();});
  ['product-modal-overlay','emp-modal-overlay','stock-modal-overlay','order-bill-overlay','product-detail-overlay','salary-modal-overlay'].forEach(id=>{
    on(`#${id}`,'click', e=>{if(e.target.id===id){state.modalOpen=null;render();}});
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

  /* Detail modal — size btn selection + price update */
  onAll('.detail-size-btn','click', e=>{
    document.querySelectorAll('.detail-size-btn').forEach(b=>b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    const sz=e.currentTarget.dataset.sz, pr=+e.currentTarget.dataset.price;
    const priceEl=document.getElementById('detail-price-display');
    if(priceEl) priceEl.textContent='₹'+pr.toLocaleString('en-IN');
    const addBtn=document.getElementById('detail-add-cart-btn');
    if(addBtn){addBtn.dataset.sz=sz;addBtn.dataset.price=pr;}
  });

  /* Detail modal — add to cart */
  on('#detail-add-cart-btn','click', e=>{
    const pid=e.currentTarget.dataset.pid, sz=e.currentTarget.dataset.sz, pr=+e.currentTarget.dataset.price;
    if(!sz){showToast('Please select a size','error');return;}
    addToCart(pid,sz,pr);
  });

  /* Cart */
  onAll('[data-add-cart]','click', e=>{e.stopPropagation();addToCart(e.currentTarget.dataset.addCart);});
  on('#open-cart-btn','click', ()=>{state.cartOpen=true;render();});
  on('#close-cart-btn','click', ()=>{state.cartOpen=false;render();});
  on('#cart-overlay-bg','click', ()=>{state.cartOpen=false;render();});
  onAll('[data-cart-inc]','click', e=>updateCartQty(e.currentTarget.dataset.cartInc,1));
  onAll('[data-cart-dec]','click', e=>updateCartQty(e.currentTarget.dataset.cartDec,-1));
  onAll('[data-cart-remove]','click', e=>removeFromCart(e.currentTarget.dataset.cartRemove));

  /* Checkout */
  on('#checkout-btn','click', ()=>{
    state.cartOpen=false;
    document.body.insertAdjacentHTML('beforeend', renderCheckoutModal());
    document.querySelector('[data-close-modal="checkout"]')?.addEventListener('click',()=>{document.getElementById('checkout-overlay')?.remove();state.cartOpen=true;render();});
    document.getElementById('checkout-overlay')?.addEventListener('click',e=>{if(e.target.id==='checkout-overlay'){e.currentTarget.remove();state.cartOpen=true;render();}});
    document.getElementById('confirm-order-btn')?.addEventListener('click', confirmOrder);
  });

  /* Orders */
  onAll('[data-view-order]','click', e=>{state.viewingOrderId=e.currentTarget.dataset.viewOrder;state.modalOpen='order-bill';render();});
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

document.addEventListener('DOMContentLoaded', init);
