'use strict';

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
  requestAnimationFrame(() => { _renderPending = false; render(); });
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
  render(); window.scrollTo(0, 0);
}

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
                <input type="password" class="form-control" name="password" placeholder="Enter your password" required autocomplete="current-password"/></div>
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
            <div class="form-group"><label class="form-label">GST Number <span class="optional-tag">(Optional)</span></label>
              <input type="text" class="form-control" name="gst" placeholder="e.g. 29ABCDE1234F1Z5" maxlength="15" pattern="[A-Z0-9]{15}" title="GST must be exactly 15 alphanumeric characters" style="text-transform:uppercase"/></div>
          </div>
          <div style="border-top:1px solid var(--border-light);padding-top:18px;">
            <h4 style="font-family:var(--font-serif);margin-bottom:12px;">Admin Login Credentials</h4>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Admin Username <span class="required">*</span></label>
                <input type="text" class="form-control" name="adminUsername" placeholder="Choose a username" required autocomplete="new-password"/></div>
              <div class="form-group"><label class="form-label">Admin Password <span class="required">*</span></label>
                <input type="password" class="form-control" name="adminPassword" placeholder="Choose a password" required autocomplete="new-password"/></div>
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
                <input type="password" class="form-control" name="password" required placeholder="Choose password" autocomplete="new-password"/></div>
            </div>
          </div>
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
  return `
  <header class="app-header no-print">
    <div class="app-logo">
      <span class="gold-text">AURA</span><span class="app-logo-lite">Lite</span>
      ${shopName ? `<span class="header-shop-name">· ${esc(shopName)}</span>` : ''}
    </div>
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
       ['employees','◉','Employees'],['customers','◎','Customers'],['orders','◊','Orders']]
    : [['products','✦','Products'],['stock','◻','Stock']];
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
    customers:renderAdminCustomers, orders:renderAdminOrders };
  return `<div>${renderAppHeader({ shopName:shop?.name, userName:session?.name })}
    <div class="dash-layout">${renderSidebar('admin')}
      <main class="dash-main">${(subViews[state.subRoute]||renderAdminOverview)()}</main>
    </div></div>`;
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
  return `<div class="product-card">
    <div class="product-card-img">${p.image?`<img src="${p.image}" alt="${esc(p.name)}"/>`:
      `<div class="no-img"><span style="font-size:2.5rem;">👗</span><span style="font-size:0.72rem;">No Image</span></div>`}</div>
    <div class="product-card-body">
      <div class="product-card-name">${esc(p.name)}</div>
      <div class="product-card-meta">
        <span class="product-tag gold">${esc(p.category)}</span><span class="product-tag">${esc(p.size)}</span>
        <span class="product-tag" style="display:flex;align-items:center;gap:4px;">
          <span class="color-dot" style="background:${esc(p.color.toLowerCase())};"></span>${esc(p.color)}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="product-card-price">${fmt(p.price)}</div><span class="td-badge ${sc}">${sl}</span></div>
      <div class="product-card-actions">
        <button class="btn btn-outline btn-sm" data-edit-product="${esc(p.id)}" style="flex:1;">Edit</button>
        <button class="btn btn-ghost btn-sm" data-stock-product="${esc(p.id)}">Stock</button>
        <button class="btn-icon" data-delete-product="${esc(p.id)}" style="width:34px;height:34px;font-size:0.85rem;">✕</button>
      </div>
    </div>
  </div>`;
}
function renderProductModal() {
  const cats=DB.getCategories(), editing=state.editingId?DB.getProducts().find(p=>p.id===state.editingId):null, v=editing||{};
  return `<div class="modal-overlay" id="product-modal-overlay">
    <div class="modal modal-lg animate-slideUp">
      <div class="modal-header"><div><div class="login-role-badge">✦ &nbsp; ${editing?'Edit Product':'Add Product'}</div>
        <div class="modal-title">${editing?esc(editing.name):'New Product'}</div></div>
        <button class="modal-close" data-close-modal="product">✕</button></div>
      <div class="modal-body"><form id="product-form"><div style="display:flex;gap:22px;">
        <div style="flex:1;display:flex;flex-direction:column;gap:14px;">
          <div class="form-group"><label class="form-label">Product Name <span class="required">*</span></label>
            <input type="text" class="form-control" name="name" value="${esc(v.name||'')}" placeholder="e.g. Silk Anarkali Kurta" required/></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Category <span class="required">*</span></label>
              <input type="text" class="form-control" name="category" value="${esc(v.category||'')}" placeholder="e.g. Kurta, Saree" list="cat-list" required/>
              <datalist id="cat-list">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
            <div class="form-group"><label class="form-label">Size <span class="required">*</span></label>
              <select class="form-control" name="size" required><option value="">Select</option>
                ${['XS','S','M','L','XL','XXL','3XL','Free Size'].map(s=>`<option value="${s}"${v.size===s?' selected':''}>${s}</option>`).join('')}</select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Color <span class="required">*</span></label>
              <input type="text" class="form-control" name="color" value="${esc(v.color||'')}" placeholder="e.g. Royal Blue" required/></div>
            <div class="form-group"><label class="form-label">Price (₹) <span class="required">*</span></label>
              <input type="number" class="form-control" name="price" value="${esc(v.price||'')}" min="0" required/></div>
          </div>
          <div class="form-group"><label class="form-label">Available Quantity <span class="required">*</span></label>
            <input type="number" class="form-control" name="quantity" value="${esc(v.quantity||'')}" min="0" required/></div>
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
  return `<div class="animate-fadeIn">
    <div class="dash-page-title">Team Members</div><div class="dash-page-subtitle">Manage your shop staff</div>
    <div class="dash-toolbar">
      <div class="dash-search" style="flex:1;"><span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search employees…" id="emp-search" value="${esc(state.searchQuery)}"/></div>
      <button class="btn btn-gold" id="add-emp-btn">+ Add Employee</button>
    </div>
    ${emps.length===0?`<div class="empty-state"><div class="empty-state-icon">◉</div><div class="empty-state-title">No employees added</div></div>`:
    `<div class="table-wrap"><table>
      <thead><tr><th>Employee</th><th>Phone</th><th>Gender</th><th>Username</th><th>Address</th><th>Actions</th></tr></thead>
      <tbody>${emps.map(e=>`<tr>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);border:1px solid var(--gold-light);display:flex;align-items:center;justify-content:center;">${e.gender==='Female'?'👩':'👨'}</div>
          <div class="td-name">${esc(e.name)}</div></div></td>
        <td>${esc(e.phone)}</td><td>${esc(e.gender)}</td>
        <td><code style="font-size:0.8rem;background:var(--cream-2);padding:2px 8px;border-radius:4px;">${esc(e.username)}</code></td>
        <td style="color:var(--text-light);font-size:0.82rem;">${esc(e.address||'—')}</td>
        <td><div style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" data-edit-emp="${esc(e.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-delete-emp="${esc(e.id)}">Remove</button>
        </div></td></tr>`).join('')}
      </tbody></table></div>`}
    ${state.modalOpen==='employee'?renderEmployeeModal():''}
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
        ${!emp?`<div style="background:var(--cream-2);border-radius:var(--radius-md);padding:14px;border:1px solid var(--border-light);">
          <div style="font-size:0.78rem;color:var(--text-medium);font-weight:600;margin-bottom:12px;">Login Credentials</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Username <span class="required">*</span></label>
              <input type="text" class="form-control" name="username" required autocomplete="new-password"/></div>
            <div class="form-group"><label class="form-label">Password <span class="required">*</span></label>
              <input type="password" class="form-control" name="password" required autocomplete="new-password"/></div>
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
   15. EMPLOYEE DASHBOARD
═══════════════════════════════════════════════════ */
function renderEmployeeDash() {
  const session=DB.getSession(), shop=DB.getShop();
  return `<div>${renderAppHeader({ shopName:shop?.name, userName:session?.name })}
    <div class="dash-layout">${renderSidebar('employee')}
      <main class="dash-main">${state.subRoute==='stock'?renderEmpStock():renderEmpProducts()}</main>
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
      <thead><tr><th>Product</th><th>Category</th><th>Size</th><th>Price</th><th>Stock</th><th>Update</th></tr></thead>
      <tbody>${prods.map(p=>`<tr>
        <td class="td-name">${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc(p.size)}</td>
        <td style="font-family:var(--font-serif);font-weight:600;color:var(--gold-dark);">${fmt(p.price)}</td>
        <td><span class="td-badge ${+p.quantity===0?'badge-red':+p.quantity<=5?'badge-gold':'badge-green'}">${+p.quantity===0?'Out of Stock':p.quantity+' units'}</span></td>
        <td><button class="btn btn-outline btn-sm" data-stock-product="${esc(p.id)}">Update</button></td>
      </tr>`).join('')}</tbody></table></div>
    ${state.modalOpen==='stock'?renderStockModal(state.stockProductId):''}
  </div>`;
}

/* ═══════════════════════════════════════════════════
   16. CUSTOMER SHOP
═══════════════════════════════════════════════════ */
function renderCustomerShop() {
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
  </div>`;
}
function renderShopCard(p) {
  const inCart=state.cart.find(i=>i.id===p.id);
  return `<div class="shop-card" data-product-detail="${esc(p.id)}">
    <div class="shop-card-img">
      ${p.image?`<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>`:
        `<div class="no-img" style="font-size:2.5rem;">👗</div>`}
      <span class="shop-card-badge">${esc(p.category)}</span>
    </div>
    <div class="shop-card-body">
      <div class="shop-card-category">${esc(p.category)}</div>
      <div class="shop-card-name">${esc(p.name)}</div>
      <div class="shop-card-tags">
        <span class="product-tag">${esc(p.size)}</span>
        <span class="product-tag" style="display:flex;align-items:center;gap:4px;">
          <span class="color-dot" style="background:${esc(p.color.toLowerCase())};"></span>${esc(p.color)}</span>
      </div>
      <div class="shop-card-footer">
        <div class="shop-card-price"><span class="currency">₹</span>${(+p.price).toLocaleString('en-IN')}</div>
        ${+p.quantity<=5?`<span class="stock-badge low">Only ${p.quantity} left</span>`:`<span class="stock-badge">In Stock</span>`}
      </div>
      <button class="btn ${inCart?'btn-outline':'btn-gold'} btn-sm btn-block" style="margin-top:12px;" data-add-cart="${esc(p.id)}">
        ${inCart?`✓ Added (${inCart.qty})`:'+ Add to Cart'}</button>
    </div>
  </div>`;
}
function renderProductDetailModal(pid) {
  const p=DB.getProducts().find(pr=>pr.id===pid); if(!p) return '';
  const inCart=state.cart.find(i=>i.id===p.id);
  return `<div class="modal-overlay" id="product-detail-overlay">
    <div class="modal modal-lg animate-slideUp">
      <div class="modal-header"><div class="modal-title">${esc(p.name)}</div>
        <button class="modal-close" data-close-modal="product-detail">✕</button></div>
      <div class="modal-body"><div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div style="flex:0 0 200px;">
          ${p.image?`<img src="${p.image}" style="width:100%;border-radius:var(--radius-lg);object-fit:cover;aspect-ratio:3/4;">`:
            `<div style="width:100%;aspect-ratio:3/4;background:var(--cream-2);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;font-size:4rem;">👗</div>`}
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="font-size:0.72rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:8px;">${esc(p.category)}</div>
          <h2 style="font-family:var(--font-serif);margin-bottom:14px;">${esc(p.name)}</h2>
          <div style="font-family:var(--font-serif);font-size:1.8rem;font-weight:700;color:var(--gold-dark);margin-bottom:20px;">${fmt(p.price)}</div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;font-size:0.85rem;">
            <div style="display:flex;gap:12px;"><span style="color:var(--text-light);width:70px;">Size</span><span class="product-tag gold">${esc(p.size)}</span></div>
            <div style="display:flex;align-items:center;gap:12px;"><span style="color:var(--text-light);width:70px;">Color</span>
              <span style="display:flex;align-items:center;gap:6px;"><span class="color-dot" style="background:${esc(p.color.toLowerCase())};width:14px;height:14px;"></span>${esc(p.color)}</span></div>
            <div style="display:flex;align-items:center;gap:12px;"><span style="color:var(--text-light);width:70px;">Stock</span>
              <span class="td-badge ${+p.quantity===0?'badge-red':+p.quantity<=5?'badge-gold':'badge-green'}">${+p.quantity===0?'Out of Stock':+p.quantity<=5?`Only ${p.quantity} left`:'In Stock'}</span></div>
          </div>
          <button class="btn ${inCart?'btn-outline':'btn-gold'} btn-block btn-lg" data-add-cart="${esc(p.id)}" ${+p.quantity===0?'disabled':''}>
            ${+p.quantity===0?'Out of Stock':inCart?`✓ In Cart (${inCart.qty} added)`:'+ Add to Cart'}</button>
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
          <div class="cart-item-meta">${esc(item.size)} · ${esc(item.color)}</div>
          <div class="cart-item-controls"><div class="qty-control">
            <button class="qty-btn" data-cart-dec="${esc(item.id)}">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-cart-inc="${esc(item.id)}">+</button>
          </div></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <div class="cart-item-price">${fmt(item.qty*item.price)}</div>
          <span class="cart-item-remove" data-cart-remove="${esc(item.id)}">✕ Remove</span>
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
function addToCart(productId) {
  const p=DB.getProducts().find(pr=>pr.id===productId); if(!p) return;
  const existing=state.cart.find(i=>i.id===productId);
  if(existing){ if(existing.qty>=+p.quantity){showToast(`Only ${p.quantity} units available`,'error');return;} existing.qty++; }
  else { if(+p.quantity===0){showToast('Out of stock','error');return;} state.cart.push({id:p.id,name:p.name,size:p.size,color:p.color,price:+p.price,image:p.image,qty:1}); }
  showToast(`${p.name} added to cart`,'success'); render();
}
function updateCartQty(productId, delta) {
  const item=state.cart.find(i=>i.id===productId); if(!item) return;
  const p=DB.getProducts().find(pr=>pr.id===productId), newQty=item.qty+delta;
  if(newQty<=0){removeFromCart(productId);return;}
  if(p&&newQty>+p.quantity){showToast('Not enough stock','error');return;}
  item.qty=newQty; render();
}
function removeFromCart(productId) { state.cart=state.cart.filter(i=>i.id!==productId); render(); }

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
      occasion:fd.get('occasion'),username:fd.get('username'),password:fd.get('password')};
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

  /* Sidebar nav */
  onAll('.sidebar-nav-item','click', e=>{state.subRoute=e.currentTarget.dataset.sub;state.searchQuery='';state.modalOpen=null;render();});

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
    const prod={name:fd.get('name')?.trim(),category:fd.get('category')?.trim(),size:fd.get('size'),color:fd.get('color')?.trim(),price:+fd.get('price'),quantity:+fd.get('quantity'),image:imageData};
    if(!prod.name||!prod.category||!prod.size||!prod.color||isNaN(prod.price)){showToast('Fill all required fields','error');return;}
    if(state.editingId){DB.updateProduct(state.editingId,prod);showToast('Product updated','success');}
    else{prod.id=uid();prod.addedDate=Date.now();DB.addProduct(prod);DB.addCategory(prod.category);showToast('Product added','success');}
    state.modalOpen=null;state.editingId=null;render();
  });

  /* Close modals */
  onAll('[data-close-modal]','click', ()=>{state.modalOpen=null;state.editingId=null;render();});
  ['product-modal-overlay','emp-modal-overlay','stock-modal-overlay','order-bill-overlay','product-detail-overlay'].forEach(id=>{
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
  onAll('[data-edit-emp]','click', e=>{state.editingId=e.currentTarget.dataset.editEmp;state.modalOpen='employee';render();});
  onAll('[data-delete-emp]','click', e=>{
    const id=e.currentTarget.dataset.deleteEmp, emp=DB.getEmployees().find(em=>em.id===id);
    if(confirm(`Remove "${emp?.name}"?`)){DB.deleteEmployee(id);showToast('Employee removed','info');render();}
  });
  on('#save-emp-btn','click', ()=>{
    const form=document.getElementById('emp-form');if(!form) return;
    const fd=new FormData(form),gender=form.querySelector('input[name="gender"]:checked')?.value;
    if(state.editingId){
      const data={name:fd.get('name')?.trim(),phone:fd.get('phone')?.trim(),gender,address:fd.get('address')?.trim()};
      if(!data.name||!data.phone||!gender){showToast('Fill required fields','error');return;}
      DB.updateEmployee(state.editingId,data);showToast('Employee updated','success');
    }else{
      if(DB.getEmployees().find(e=>e.username===fd.get('username'))){showToast('Username taken','error');return;}
      const emp={id:uid(),name:fd.get('name')?.trim(),phone:fd.get('phone')?.trim(),gender,address:fd.get('address')?.trim(),username:fd.get('username')?.trim(),password:fd.get('password')};
      if(!emp.name||!emp.phone||!emp.gender||!emp.username||!emp.password){showToast('Fill required fields','error');return;}
      DB.addEmployee(emp);showToast(`Employee ${emp.name} added. Username: ${emp.username}`,'success');
    }
    state.modalOpen=null;state.editingId=null;render();
  });

  /* Product detail */
  onAll('[data-product-detail]','click', e=>{
    if(e.target.closest('[data-add-cart]')) return;
    state.viewingProductId=e.currentTarget.dataset.productDetail;state.modalOpen='product-detail';render();
  });
  on('#product-detail-overlay','click', e=>{if(e.target.id==='product-detail-overlay'){state.modalOpen=null;render();}});

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
    if(session.role==='admin') navigate('admin');
    else if(session.role==='employee') navigate('employee');
    else if(session.role==='super-admin'){navigate('super-admin');loadSuperAdminShops();}
    else navigate('customer');
  }else{
    navigate('landing');
  }
}

document.addEventListener('DOMContentLoaded', init);
