/* ===================================================
   AURA LITE – Complete Application Logic
   =================================================== */

'use strict';

/* ── 1. State & Constants ────────────────────────── */
const APP_KEY = 'aura_lite';
const KEYS = {
  shop:      `${APP_KEY}_shop`,
  employees: `${APP_KEY}_employees`,
  customers: `${APP_KEY}_customers`,
  products:  `${APP_KEY}_products`,
  categories:`${APP_KEY}_categories`,
  orders:    `${APP_KEY}_orders`,
  session:   `${APP_KEY}_session`,
};

let state = {
  route:       'landing',
  subRoute:    'overview',
  session:     null,
  cart:        [],
  cartOpen:    false,
  activeFilter:'all',
  searchQuery: '',
  modalOpen:   null,
  editingId:   null,
};

/* ── 2. LocalStorage DB ──────────────────────────── */
const DB = {
  get:    key => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } },
  set:    (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  remove: key => localStorage.removeItem(key),

  getShop:       ()       => DB.get(KEYS.shop),
  setShop:       (data)   => DB.set(KEYS.shop, data),
  getEmployees:  ()       => DB.get(KEYS.employees) || [],
  setEmployees:  (data)   => DB.set(KEYS.employees, data),
  getCustomers:  ()       => DB.get(KEYS.customers) || [],
  setCustomers:  (data)   => DB.set(KEYS.customers, data),
  getProducts:   ()       => DB.get(KEYS.products) || [],
  setProducts:   (data)   => DB.set(KEYS.products, data),
  getCategories: ()       => DB.get(KEYS.categories) || [],
  setCategories: (data)   => DB.set(KEYS.categories, data),
  getOrders:     ()       => DB.get(KEYS.orders) || [],
  setOrders:     (data)   => DB.set(KEYS.orders, data),
  getSession:    ()       => DB.get(KEYS.session),
  setSession:    (data)   => DB.set(KEYS.session, data),
  clearSession:  ()       => DB.remove(KEYS.session),

  addEmployee:   (emp)    => { const list = DB.getEmployees(); list.push(emp); DB.setEmployees(list); },
  addCustomer:   (cust)   => { const list = DB.getCustomers(); list.push(cust); DB.setCustomers(list); },
  addProduct:    (prod)   => { const list = DB.getProducts(); list.push(prod); DB.setProducts(list); },
  addOrder:      (ord)    => { const list = DB.getOrders(); list.push(ord); DB.setOrders(list); },
  addCategory:   (cat)    => {
    const list = DB.getCategories();
    if (!list.includes(cat)) { list.push(cat); DB.setCategories(list); }
  },

  updateProduct: (id, data) => {
    const list = DB.getProducts().map(p => p.id === id ? { ...p, ...data } : p);
    DB.setProducts(list);
  },
  deleteProduct: (id) => DB.setProducts(DB.getProducts().filter(p => p.id !== id)),
  updateEmployee:(id, data) => {
    const list = DB.getEmployees().map(e => e.id === id ? { ...e, ...data } : e);
    DB.setEmployees(list);
  },
  deleteEmployee:(id) => DB.setEmployees(DB.getEmployees().filter(e => e.id !== id)),
};

/* ── 3. Utilities ────────────────────────────────── */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const esc = str => String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = num => `₹${Number(num||0).toLocaleString('en-IN')}`;
const fmtDate = ts => new Date(ts).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
}

function generateUsername(name, role) {
  const base = name.toLowerCase().trim().replace(/\s+/g, '').slice(0, 10);
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${base}${suffix}`;
}

/* ── 4. Toast Notifications ──────────────────────── */
function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: '◆', warning: '⚠' };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'◆'}</span><span class="toast-msg">${esc(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-fade'); setTimeout(() => toast.remove(), 300); }, 3200);
}

/* ── 5. Router ───────────────────────────────────── */
function navigate(route, subRoute = 'overview') {
  state.route = route;
  state.subRoute = subRoute;
  state.cartOpen = false;
  render();
  window.scrollTo(0, 0);
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  // Clean up any body-level overlays from previous renders
  ['cart-overlay-bg','cart-sidebar','checkout-overlay','success-overlay','product-detail-overlay','stock-modal-overlay'].forEach(id => {
    document.getElementById(id)?.remove();
  });
  document.querySelectorAll('.cart-overlay, .cart-sidebar').forEach(el => el.remove());

  const session = DB.getSession();
  state.session = session;

  let html = '';
  switch (state.route) {
    case 'landing':        html = renderLanding(); break;
    case 'login':          html = renderLogin(state.loginRole); break;
    case 'register-shop':  html = renderRegisterShop(); break;
    case 'register-customer': html = renderRegisterCustomer(); break;
    case 'admin':          html = renderAdminDash(); break;
    case 'employee':       html = renderEmployeeDash(); break;
    case 'customer':       html = renderCustomerShop(); break;
    default:               html = renderLanding();
  }

  app.innerHTML = html;

  if (state.cartOpen && state.route === 'customer') {
    document.body.insertAdjacentHTML('beforeend', renderCartSidebar());
  }

  attachListeners();
}

/* ── 6. Auth ─────────────────────────────────────── */
function login(role, username, password) {
  const shop = DB.getShop();
  if (!shop) { showToast('No shop registered. Please set up your shop.', 'error'); return false; }

  if (role === 'admin') {
    if (shop.adminUsername === username && shop.adminPassword === password) {
      DB.setSession({ role: 'admin', name: shop.ownerName, username });
      return true;
    }
    showToast('Invalid admin credentials', 'error');
    return false;
  }

  if (role === 'employee') {
    const emp = DB.getEmployees().find(e => e.username === username && e.password === password);
    if (emp) {
      DB.setSession({ role: 'employee', name: emp.name, username, id: emp.id });
      return true;
    }
    showToast('Invalid employee credentials', 'error');
    return false;
  }

  if (role === 'customer') {
    const cust = DB.getCustomers().find(c => c.username === username && c.password === password);
    if (cust) {
      DB.setSession({ role: 'customer', name: cust.name, username, id: cust.id });
      return true;
    }
    showToast('Invalid customer credentials', 'error');
    return false;
  }

  return false;
}

function logout() {
  DB.clearSession();
  state.cart = [];
  state.cartOpen = false;
  navigate('landing');
}

/* ── 7. Landing Page ─────────────────────────────── */
function renderLanding() {
  const shop = DB.getShop();
  return `
  <div class="landing">
    <div class="landing-bg-pattern"></div>
    <div class="landing-grid"></div>
    <div class="landing-content">
      <div class="landing-inner animate-fadeIn">
        <div class="landing-badge">
          ✦ &nbsp; Luxury Fashion Management &nbsp; ✦
        </div>
        <div class="landing-logo">
          <span class="gold-text">AURA</span>
          <span class="landing-logo-lite">Lite</span>
        </div>
        <div class="landing-divider">
          <span class="landing-divider-icon">◆</span>
        </div>
        <p class="landing-tagline">
          Elegance in every stitch,<br/>precision in every sale.
        </p>

        ${shop ? `
        <div class="shop-welcome-chip" style="
          display:inline-flex;align-items:center;gap:8px;
          background:var(--gold-lighter);border:1px solid var(--gold-light);
          border-radius:20px;padding:8px 20px;
          font-size:0.8rem;color:var(--gold-dark);font-weight:600;
          margin-bottom:24px;letter-spacing:0.06em;
        ">
          ✦ &nbsp; ${esc(shop.name)}
        </div>
        ` : ''}

        <div class="login-options">
          <div class="login-option-card" data-role="admin">
            <div class="login-option-icon">👑</div>
            <div class="login-option-text">
              <div class="login-option-title">Admin</div>
              <div class="login-option-desc">Manage shop, products &amp; team</div>
            </div>
            <span class="login-option-arrow">›</span>
          </div>
          <div class="login-option-card" data-role="employee">
            <div class="login-option-icon">🏷️</div>
            <div class="login-option-text">
              <div class="login-option-title">Employee</div>
              <div class="login-option-desc">Stock &amp; product management</div>
            </div>
            <span class="login-option-arrow">›</span>
          </div>
          <div class="login-option-card" data-role="customer">
            <div class="login-option-icon">🛍️</div>
            <div class="login-option-text">
              <div class="login-option-title">Customer</div>
              <div class="login-option-desc">Browse &amp; shop the collection</div>
            </div>
            <span class="login-option-arrow">›</span>
          </div>
        </div>

        <p class="landing-footer">
          ${!shop
            ? `New shop? <a id="setup-shop-link">Set up your boutique →</a>`
            : `<span style="color:var(--text-xlight);">© ${new Date().getFullYear()} Aura Lite &nbsp;·&nbsp; Luxury Fashion Platform</span>`
          }
        </p>
      </div>
    </div>
  </div>`;
}

/* ── 8. Login Modal ──────────────────────────────── */
function renderLogin(role) {
  const roleLabels = { admin: 'Admin', employee: 'Employee', customer: 'Customer' };
  const roleIcons  = { admin: '👑', employee: '🏷️', customer: '🛍️' };
  const label = roleLabels[role] || 'User';
  const icon  = roleIcons[role] || '🔐';

  return `
  <div class="landing">
    <div class="landing-bg-pattern"></div>
    <div class="landing-grid"></div>
    <div class="landing-content">
      <div style="width:100%;max-width:440px;" class="animate-slideUp">
        <div class="register-card">
          <div style="text-align:center;margin-bottom:32px;">
            <div class="landing-logo" style="font-size:2.5rem;">
              <span class="gold-text">AURA</span>
              <span class="landing-logo-lite" style="font-size:0.7rem;">Lite</span>
            </div>
          </div>

          <div class="login-role-badge">${icon} &nbsp; ${label} Login</div>
          <h2 style="font-family:var(--font-serif);margin-bottom:6px;">Welcome Back</h2>
          <p class="text-muted" style="margin-bottom:28px;">Sign in to access your dashboard</p>

          <form id="login-form">
            <div style="display:flex;flex-direction:column;gap:16px;">
              <div class="form-group">
                <label class="form-label">Username <span class="required">*</span></label>
                <input type="text" class="form-control" name="username" placeholder="Enter your username" required autocomplete="username" />
              </div>
              <div class="form-group">
                <label class="form-label">Password <span class="required">*</span></label>
                <input type="password" class="form-control" name="password" placeholder="Enter your password" required autocomplete="current-password" />
              </div>
              <button type="submit" class="btn btn-gold btn-block btn-lg">Sign In</button>
            </div>
          </form>

          ${role === 'customer' ? `
          <div class="divider">or</div>
          <button class="btn btn-outline btn-block" id="go-register-customer">Create Customer Account</button>
          ` : ''}

          <div style="text-align:center;margin-top:20px;">
            <button class="btn btn-ghost btn-sm" id="back-to-landing">← Back</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── 9. Shop Registration ────────────────────────── */
function renderRegisterShop() {
  return `
  <div class="register-page">
    <div class="register-card animate-slideUp" style="max-width:680px;">
      <div class="register-header">
        <div class="badge">✦ &nbsp; First Time Setup</div>
        <h2 style="font-family:var(--font-serif);font-size:2rem;">
          Set Up Your <span class="gold-text">Boutique</span>
        </h2>
        <p class="text-muted" style="margin-top:8px;">Tell us about your shop to get started</p>
      </div>

      <form id="shop-register-form">
        <div style="display:flex;flex-direction:column;gap:20px;">
          <div style="background:var(--gold-lighter);border:1px solid var(--gold-light);border-radius:var(--radius-md);padding:16px 20px;font-size:0.82rem;color:var(--gold-dark);">
            ✦ &nbsp; Fields marked with <span style="color:#c0392b;">*</span> are required
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Shop Name <span class="required">*</span></label>
              <input type="text" class="form-control" name="name" placeholder="e.g. Radiant Collections" required />
            </div>
            <div class="form-group">
              <label class="form-label">Owner Name <span class="required">*</span></label>
              <input type="text" class="form-control" name="ownerName" placeholder="e.g. Priya Sharma" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Shop Address <span class="required">*</span></label>
            <textarea class="form-control" name="address" placeholder="Full shop address including street, city, state..." required style="min-height:80px;"></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Phone Number <span class="required">*</span></label>
              <input type="tel" class="form-control" name="phone" placeholder="10-digit phone number" required maxlength="15" />
            </div>
            <div class="form-group">
              <label class="form-label">GST Number <span class="optional-tag">(Optional)</span></label>
              <input type="text" class="form-control" name="gst" placeholder="e.g. 29ABCDE1234F1Z5" />
            </div>
          </div>

          <div style="border-top:1px solid var(--border-light);padding-top:20px;">
            <h4 style="font-family:var(--font-serif);margin-bottom:4px;">Admin Credentials</h4>
            <p class="text-muted" style="margin-bottom:16px;font-size:0.78rem;">These will be used to log in as admin</p>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Admin Username <span class="required">*</span></label>
                <input type="text" class="form-control" name="adminUsername" placeholder="Choose a username" required autocomplete="new-password" />
              </div>
              <div class="form-group">
                <label class="form-label">Admin Password <span class="required">*</span></label>
                <input type="password" class="form-control" name="adminPassword" placeholder="Choose a strong password" required autocomplete="new-password" />
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-gold btn-block btn-lg" style="margin-top:8px;">
            ✦ &nbsp; Launch My Boutique
          </button>
        </div>
      </form>

      <div style="text-align:center;margin-top:20px;">
        <button class="btn btn-ghost btn-sm" id="back-to-landing">← Back</button>
      </div>
    </div>
  </div>`;
}

/* ── 10. Customer Registration ───────────────────── */
function renderRegisterCustomer() {
  return `
  <div class="register-page">
    <div class="register-card animate-slideUp" style="max-width:660px;">
      <div class="register-header">
        <div class="badge">✦ &nbsp; Customer Registration</div>
        <h2 style="font-family:var(--font-serif);font-size:2rem;">
          Join <span class="gold-text">Aura Lite</span>
        </h2>
        <p class="text-muted" style="margin-top:8px;">Create your account for personalized shopping</p>
      </div>

      <form id="customer-register-form">
        <div style="display:flex;flex-direction:column;gap:18px;">
          <div style="background:var(--gold-lighter);border:1px solid var(--gold-light);border-radius:var(--radius-md);padding:14px 18px;font-size:0.8rem;color:var(--gold-dark);">
            ✦ &nbsp; Fill optional fields for personalized recommendations
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Full Name <span class="required">*</span></label>
              <input type="text" class="form-control" name="name" placeholder="Your full name" required />
            </div>
            <div class="form-group">
              <label class="form-label">WhatsApp Number <span class="required">*</span></label>
              <input type="tel" class="form-control" name="whatsapp" placeholder="10-digit WhatsApp number" required maxlength="15" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Gender <span class="required">*</span></label>
              <select class="form-control" name="gender" required>
                <option value="">Select gender</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Clothing Size <span class="required">*</span></label>
              <select class="form-control" name="size" required>
                <option value="">Select size</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="XXL">XXL</option>
                <option value="3XL">3XL</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Address <span class="optional-tag">(Optional)</span></label>
            <textarea class="form-control" name="address" placeholder="Your delivery address..." style="min-height:70px;"></textarea>
          </div>

          <div class="form-row-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">Skin Tone <span class="optional-tag">(Optional)</span></label>
              <select class="form-control" name="skinTone">
                <option value="">Select</option>
                <option value="Fair">Fair</option>
                <option value="Wheatish">Wheatish</option>
                <option value="Medium">Medium</option>
                <option value="Dusky">Dusky</option>
                <option value="Dark">Dark</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Preferred Color <span class="optional-tag">(Optional)</span></label>
              <input type="text" class="form-control" name="preferredColor" placeholder="e.g. Blue, Pastel" />
            </div>
            <div class="form-group">
              <label class="form-label">Occasion <span class="optional-tag">(Optional)</span></label>
              <select class="form-control" name="occasion">
                <option value="">Select</option>
                <option value="Casual">Casual</option>
                <option value="Formal">Formal</option>
                <option value="Wedding">Wedding</option>
                <option value="Festival">Festival</option>
                <option value="Party">Party</option>
                <option value="Sports">Sports</option>
              </select>
            </div>
          </div>

          <div style="border-top:1px solid var(--border-light);padding-top:16px;">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Username <span class="required">*</span></label>
                <input type="text" class="form-control" name="username" placeholder="Choose a username" required autocomplete="new-password" />
              </div>
              <div class="form-group">
                <label class="form-label">Password <span class="required">*</span></label>
                <input type="password" class="form-control" name="password" placeholder="Choose a password" required autocomplete="new-password" />
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-gold btn-block btn-lg">
            ✦ &nbsp; Create My Account
          </button>
        </div>
      </form>

      <div style="text-align:center;margin-top:20px;">
        <button class="btn btn-ghost btn-sm" id="back-to-login-customer">← Back to Login</button>
      </div>
    </div>
  </div>`;
}

/* ── 11. Admin Dashboard ─────────────────────────── */
function renderAdminDash() {
  const session = DB.getSession();
  const shop = DB.getShop();
  const subViews = {
    overview:   renderAdminOverview,
    products:   renderAdminProducts,
    categories: renderAdminCategories,
    employees:  renderAdminEmployees,
    customers:  renderAdminCustomers,
    orders:     renderAdminOrders,
  };
  const content = (subViews[state.subRoute] || renderAdminOverview)();

  return `
  <div>
    ${renderAppHeader({ shopName: shop?.name, userName: session?.name, role: 'admin' })}
    <div class="dash-layout">
      ${renderSidebar('admin')}
      <main class="dash-main">${content}</main>
    </div>
  </div>`;
}

function renderAppHeader({ shopName, userName, role }) {
  return `
  <header class="app-header no-print">
    <div class="app-logo">
      <span class="gold-text">AURA</span>
      <span class="app-logo-lite">Lite</span>
      ${shopName ? `<span class="header-shop-name" style="font-family:var(--font-sans);">· ${esc(shopName)}</span>` : ''}
    </div>
    <div class="header-actions">
      <span style="font-size:0.75rem;color:var(--text-light);display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--gold);display:inline-block;"></span>
        ${esc(userName||'')}
      </span>
      <button class="btn btn-ghost btn-sm" id="logout-btn">Sign Out</button>
    </div>
  </header>`;
}

function renderSidebar(role) {
  const adminLinks = [
    { id:'overview',   icon:'◈', label:'Overview'   },
    { id:'products',   icon:'✦', label:'Products'   },
    { id:'categories', icon:'◻', label:'Categories' },
    { id:'employees',  icon:'◉', label:'Employees'  },
    { id:'customers',  icon:'◎', label:'Customers'  },
    { id:'orders',     icon:'◊', label:'Orders'     },
  ];
  const empLinks = [
    { id:'products',   icon:'✦', label:'Products'   },
    { id:'stock',      icon:'◻', label:'Stock'       },
  ];
  const links = role === 'admin' ? adminLinks : empLinks;
  const session = DB.getSession();

  return `
  <nav class="dash-sidebar no-print">
    <div class="sidebar-section">
      <div class="sidebar-section-label">Navigation</div>
      ${links.map(l => `
        <div class="sidebar-nav-item${state.subRoute === l.id ? ' active' : ''}" data-sub="${l.id}">
          <span class="sidebar-nav-icon">${l.icon}</span>
          <span>${l.label}</span>
        </div>`).join('')}
    </div>
    <div class="sidebar-user">
      <div class="sidebar-user-name">${esc(session?.name||'')}</div>
      <div class="sidebar-user-role">${role === 'admin' ? 'Administrator' : 'Employee'}</div>
      <div class="sidebar-logout" id="logout-btn-sidebar">
        ⎋ &nbsp; Sign Out
      </div>
    </div>
  </nav>`;
}

/* Admin: Overview ─── */
function renderAdminOverview() {
  const products   = DB.getProducts();
  const employees  = DB.getEmployees();
  const customers  = DB.getCustomers();
  const orders     = DB.getOrders();
  const lowStock   = products.filter(p => Number(p.quantity) <= 5 && Number(p.quantity) > 0);
  const outOfStock = products.filter(p => Number(p.quantity) === 0);
  const totalRev   = orders.reduce((s,o) => s + Number(o.total||0), 0);

  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Dashboard Overview</div>
    <div class="dash-page-subtitle">Welcome back. Here's what's happening in your boutique today.</div>

    <div class="grid-4" style="margin-bottom:32px;">
      ${statCard('✦', 'Total Products', products.length, 'catalogue items')}
      ${statCard('◉', 'Employees', employees.length, 'team members')}
      ${statCard('◎', 'Customers', customers.length, 'registered')}
      ${statCard('◊', 'Total Revenue', fmt(totalRev), `${orders.length} orders`)}
    </div>

    ${(lowStock.length || outOfStock.length) ? `
    <div style="margin-bottom:28px;">
      <h3 style="font-family:var(--font-serif);margin-bottom:14px;">Stock Alerts</h3>
      ${outOfStock.slice(0,3).map(p => `
        <div class="alert alert-danger">
          ✕ &nbsp; <strong>${esc(p.name)}</strong> is out of stock
        </div>`).join('')}
      ${lowStock.slice(0,5).map(p => `
        <div class="alert alert-warning">
          ⚠ &nbsp; <strong>${esc(p.name)}</strong> – only ${p.quantity} left
        </div>`).join('')}
    </div>` : ''}

    <div class="grid-2" style="gap:24px;">
      <div class="card">
        <h4 style="font-family:var(--font-serif);margin-bottom:16px;">Recent Products</h4>
        ${products.length === 0 ? `<p class="text-muted">No products added yet.</p>` :
          products.slice(-5).reverse().map(p => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light);">
            ${p.image
              ? `<img src="${p.image}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;" />`
              : `<div style="width:40px;height:40px;border-radius:6px;background:var(--cream-2);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">👗</div>`
            }
            <div style="flex:1;">
              <div style="font-weight:600;font-size:0.85rem;">${esc(p.name)}</div>
              <div style="font-size:0.72rem;color:var(--text-light);">${esc(p.category)} · ${esc(p.size)} · ${fmt(p.price)}</div>
            </div>
            <span class="td-badge ${Number(p.quantity)===0?'badge-red':Number(p.quantity)<=5?'badge-gold':'badge-green'}">${p.quantity} left</span>
          </div>`).join('')}
      </div>

      <div class="card">
        <h4 style="font-family:var(--font-serif);margin-bottom:16px;">Recent Orders</h4>
        ${orders.length === 0 ? `<p class="text-muted">No orders placed yet.</p>` :
          orders.slice(-5).reverse().map(o => {
            const cust = DB.getCustomers().find(c => c.id === o.customerId);
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light);">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);display:flex;align-items:center;justify-content:center;font-size:1rem;">🛍</div>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:0.85rem;">${esc(cust?.name||'Guest')}</div>
                <div style="font-size:0.72rem;color:var(--text-light);">${fmtDate(o.date)}</div>
              </div>
              <span style="font-family:var(--font-serif);font-size:1rem;font-weight:700;color:var(--gold-dark);">${fmt(o.total)}</span>
            </div>`;
          }).join('')}
      </div>
    </div>
  </div>`;
}

function statCard(icon, label, value, sub) {
  return `
  <div class="stat-card">
    <div class="stat-icon">${icon}</div>
    <div class="stat-info">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
      ${sub ? `<div class="stat-badge">${sub}</div>` : ''}
    </div>
  </div>`;
}

/* Admin: Products ─── */
function renderAdminProducts() {
  const products = DB.getProducts();
  const cats = DB.getCategories();
  const q = state.searchQuery.toLowerCase();
  const filtered = q ? products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    p.color.toLowerCase().includes(q)
  ) : products;

  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Product Catalogue</div>
    <div class="dash-page-subtitle">Manage your clothing inventory</div>

    <div class="dash-toolbar">
      <div class="dash-search">
        <span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search products…" id="product-search" value="${esc(state.searchQuery)}" />
      </div>
      <button class="btn btn-gold" id="add-product-btn">+ Add Product</button>
    </div>

    ${filtered.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">👗</div>
        <div class="empty-state-title">No products found</div>
        <div class="empty-state-text">Add your first product to get started with your catalogue.</div>
      </div>` : `
    <div class="grid-3" id="products-grid">
      ${filtered.map(p => renderAdminProductCard(p)).join('')}
    </div>`}
  </div>

  ${state.modalOpen === 'product' ? renderProductModal() : ''}`;
}

function renderAdminProductCard(p) {
  const qty = Number(p.quantity);
  const stockLabel = qty === 0 ? 'Out of Stock' : qty <= 5 ? `Low: ${qty}` : `In Stock: ${qty}`;
  const stockClass = qty === 0 ? 'badge-red' : qty <= 5 ? 'badge-gold' : 'badge-green';

  return `
  <div class="product-card">
    <div class="product-card-img">
      ${p.image
        ? `<img src="${p.image}" alt="${esc(p.name)}" />`
        : `<div class="no-img"><span style="font-size:2.5rem;">👗</span><span style="font-size:0.72rem;">No Image</span></div>`}
    </div>
    <div class="product-card-body">
      <div class="product-card-name">${esc(p.name)}</div>
      <div class="product-card-meta">
        <span class="product-tag gold">${esc(p.category)}</span>
        <span class="product-tag">${esc(p.size)}</span>
        <span class="product-tag" style="display:flex;align-items:center;gap:4px;">
          <span class="color-dot" style="background:${esc(p.color.toLowerCase())};"></span>
          ${esc(p.color)}
        </span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="product-card-price">${fmt(p.price)}</div>
        <span class="td-badge ${stockClass}">${stockLabel}</span>
      </div>
      <div class="product-card-actions">
        <button class="btn btn-outline btn-sm" data-edit-product="${esc(p.id)}" style="flex:1;">Edit</button>
        <button class="btn btn-ghost btn-sm" data-stock-product="${esc(p.id)}">Stock</button>
        <button class="btn-icon" data-delete-product="${esc(p.id)}" title="Delete" style="width:34px;height:34px;font-size:0.85rem;">✕</button>
      </div>
    </div>
  </div>`;
}

function renderProductModal() {
  const cats = DB.getCategories();
  const editing = state.editingId ? DB.getProducts().find(p => p.id === state.editingId) : null;
  const v = editing || {};

  return `
  <div class="modal-overlay" id="product-modal-overlay">
    <div class="modal modal-lg animate-slideUp">
      <div class="modal-header">
        <div>
          <div class="login-role-badge">✦ &nbsp; ${editing ? 'Edit Product' : 'Add New Product'}</div>
          <div class="modal-title">${editing ? esc(editing.name) : 'New Product'}</div>
        </div>
        <button class="modal-close" data-close-modal="product">✕</button>
      </div>
      <div class="modal-body">
        <form id="product-form">
          <div style="display:flex;gap:24px;">
            <div style="flex:1;display:flex;flex-direction:column;gap:16px;">
              <div class="form-group">
                <label class="form-label">Product Name <span class="required">*</span></label>
                <input type="text" class="form-control" name="name" value="${esc(v.name||'')}" placeholder="e.g. Silk Anarkali Kurta" required />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Category <span class="required">*</span></label>
                  <input type="text" class="form-control" name="category" value="${esc(v.category||'')}"
                    placeholder="e.g. Kurta, Saree, Dress"
                    list="category-list" required />
                  <datalist id="category-list">
                    ${cats.map(c => `<option value="${esc(c)}">`).join('')}
                  </datalist>
                </div>
                <div class="form-group">
                  <label class="form-label">Size <span class="required">*</span></label>
                  <select class="form-control" name="size" required>
                    <option value="">Select size</option>
                    ${['XS','S','M','L','XL','XXL','3XL','Free Size'].map(s =>
                      `<option value="${s}"${v.size===s?' selected':''}>${s}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Color <span class="required">*</span></label>
                  <input type="text" class="form-control" name="color" value="${esc(v.color||'')}" placeholder="e.g. Royal Blue" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Price (₹) <span class="required">*</span></label>
                  <input type="number" class="form-control" name="price" value="${esc(v.price||'')}" placeholder="0" min="0" required />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Available Quantity <span class="required">*</span></label>
                <input type="number" class="form-control" name="quantity" value="${esc(v.quantity||'')}" placeholder="0" min="0" required />
              </div>
            </div>
            <div style="width:200px;flex-shrink:0;">
              <label class="form-label" style="display:block;margin-bottom:8px;">Product Image <span class="optional-tag">(Optional)</span></label>
              <div class="img-upload-area" id="img-upload-area">
                <input type="file" name="image" accept="image/*" id="img-file-input" />
                ${v.image
                  ? `<img src="${v.image}" class="img-preview" id="img-preview" /><p class="img-upload-text" style="margin-top:8px;">Click to change</p>`
                  : `<div class="img-upload-icon">📷</div><p class="img-upload-text">Click to upload image</p><p class="img-upload-text" style="font-size:0.7rem;">JPG, PNG, WEBP</p>`
                }
              </div>
              <input type="hidden" name="imageData" id="image-data-input" value="${esc(v.image||'')}" />
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="product">Cancel</button>
        <button class="btn btn-gold" id="save-product-btn">✦ &nbsp; ${editing ? 'Save Changes' : 'Add Product'}</button>
      </div>
    </div>
  </div>`;
}

function renderStockModal(productId) {
  const p = DB.getProducts().find(pr => pr.id === productId);
  if (!p) return '';
  return `
  <div class="modal-overlay" id="stock-modal-overlay">
    <div class="modal animate-slideUp" style="max-width:400px;">
      <div class="modal-header">
        <div class="modal-title">Update Stock</div>
        <button class="modal-close" data-close-modal="stock">✕</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-medium);margin-bottom:20px;font-size:0.9rem;">
          <strong>${esc(p.name)}</strong><br/>
          <span style="font-size:0.8rem;color:var(--text-light);">Current stock: ${p.quantity} units</span>
        </p>
        <div class="form-group">
          <label class="form-label">New Quantity</label>
          <input type="number" class="form-control" id="stock-qty-input" value="${p.quantity}" min="0" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="stock">Cancel</button>
        <button class="btn btn-gold" id="save-stock-btn" data-pid="${esc(p.id)}">Update Stock</button>
      </div>
    </div>
  </div>`;
}

/* Admin: Categories ─── */
function renderAdminCategories() {
  const cats = DB.getCategories();
  const products = DB.getProducts();

  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Categories</div>
    <div class="dash-page-subtitle">Manage your product categories</div>

    <div class="dash-toolbar">
      <form id="add-category-form" style="display:flex;gap:12px;flex:1;">
        <input type="text" class="form-control" name="catName" placeholder="New category name (e.g. Saree, Lehenga, Kurta…)" style="flex:1;" required />
        <button type="submit" class="btn btn-gold">+ Add Category</button>
      </form>
    </div>

    ${cats.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">◻</div>
        <div class="empty-state-title">No categories yet</div>
        <div class="empty-state-text">Add categories to organize your products.</div>
      </div>` : `
    <div class="grid-3">
      ${cats.map(cat => {
        const count = products.filter(p => p.category === cat).length;
        return `
        <div class="card card-gold" style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-family:var(--font-serif);font-size:1.1rem;font-weight:600;">${esc(cat)}</div>
            <div style="font-size:0.75rem;color:var(--text-light);margin-top:4px;">${count} product${count!==1?'s':''}</div>
          </div>
          <button class="btn-icon" data-delete-cat="${esc(cat)}" title="Delete category">✕</button>
        </div>`;
      }).join('')}
    </div>`}
  </div>`;
}

/* Admin: Employees ─── */
function renderAdminEmployees() {
  const employees = DB.getEmployees();
  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Team Members</div>
    <div class="dash-page-subtitle">Manage your shop employees</div>

    <div class="dash-toolbar">
      <div class="dash-search" style="flex:1;">
        <span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search employees…" id="emp-search" value="${esc(state.searchQuery)}" />
      </div>
      <button class="btn btn-gold" id="add-emp-btn">+ Add Employee</button>
    </div>

    ${employees.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">◉</div>
        <div class="empty-state-title">No employees added</div>
        <div class="empty-state-text">Add team members to give them access to stock management.</div>
      </div>` : `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Employee</th><th>Phone</th><th>Gender</th><th>Username</th><th>Address</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${employees.map(e => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);border:1px solid var(--gold-light);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">
                  ${e.gender==='Female'?'👩':'👨'}
                </div>
                <div class="td-name">${esc(e.name)}</div>
              </div>
            </td>
            <td>${esc(e.phone)}</td>
            <td>${esc(e.gender)}</td>
            <td><code style="font-size:0.8rem;background:var(--cream-2);padding:2px 8px;border-radius:4px;">${esc(e.username)}</code></td>
            <td style="color:var(--text-light);font-size:0.82rem;">${esc(e.address||'—')}</td>
            <td>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-outline btn-sm" data-edit-emp="${esc(e.id)}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-delete-emp="${esc(e.id)}">Remove</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
    ${state.modalOpen === 'employee' ? renderEmployeeModal() : ''}
  </div>`;
}

function renderEmployeeModal() {
  const emp = state.editingId ? DB.getEmployees().find(e => e.id === state.editingId) : null;
  const v = emp || {};
  return `
  <div class="modal-overlay" id="emp-modal-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-header">
        <div>
          <div class="login-role-badge">◉ &nbsp; ${emp ? 'Edit Employee' : 'Add Employee'}</div>
          <div class="modal-title">${emp ? esc(emp.name) : 'New Team Member'}</div>
        </div>
        <button class="modal-close" data-close-modal="employee">✕</button>
      </div>
      <div class="modal-body">
        <form id="emp-form">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Full Name <span class="required">*</span></label>
                <input type="text" class="form-control" name="name" value="${esc(v.name||'')}" placeholder="Employee name" required />
              </div>
              <div class="form-group">
                <label class="form-label">Phone Number <span class="required">*</span></label>
                <input type="tel" class="form-control" name="phone" value="${esc(v.phone||'')}" placeholder="10-digit phone" required />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Gender <span class="required">*</span></label>
              <div class="radio-group">
                <label class="radio-item"><input type="radio" name="gender" value="Female"${v.gender==='Female'?' checked':''}/> Female</label>
                <label class="radio-item"><input type="radio" name="gender" value="Male"${v.gender==='Male'?' checked':''}/> Male</label>
                <label class="radio-item"><input type="radio" name="gender" value="Other"${v.gender==='Other'?' checked':''}/> Other</label>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Address <span class="optional-tag">(Optional)</span></label>
              <textarea class="form-control" name="address" placeholder="Employee address...">${esc(v.address||'')}</textarea>
            </div>
            ${!emp ? `
            <div style="background:var(--cream-2);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border-light);">
              <div style="font-size:0.8rem;color:var(--text-medium);margin-bottom:14px;font-weight:600;">Login Credentials</div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Username <span class="required">*</span></label>
                  <input type="text" class="form-control" name="username" placeholder="Employee username" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Password <span class="required">*</span></label>
                  <input type="password" class="form-control" name="password" placeholder="Set password" required />
                </div>
              </div>
            </div>` : ''}
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="employee">Cancel</button>
        <button class="btn btn-gold" id="save-emp-btn">✦ &nbsp; ${emp ? 'Save Changes' : 'Add Employee'}</button>
      </div>
    </div>
  </div>`;
}

/* Admin: Customers ─── */
function renderAdminCustomers() {
  const customers = DB.getCustomers();
  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Customer List</div>
    <div class="dash-page-subtitle">${customers.length} registered customer${customers.length!==1?'s':''}</div>
    ${customers.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">◎</div>
        <div class="empty-state-title">No customers yet</div>
        <div class="empty-state-text">Customers will appear here after they register.</div>
      </div>` : `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Customer</th><th>WhatsApp</th><th>Gender</th><th>Size</th><th>Preferred Color</th><th>Occasion</th></tr>
        </thead>
        <tbody>
          ${customers.map(c => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-lighter);border:1px solid var(--gold-light);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">${c.gender==='Female'?'👩':'👨'}</div>
                <div class="td-name">${esc(c.name)}</div>
              </div>
            </td>
            <td>${esc(c.whatsapp)}</td>
            <td>${esc(c.gender)}</td>
            <td><span class="td-badge badge-gold">${esc(c.size)}</span></td>
            <td>${c.preferredColor ? `<div style="display:flex;align-items:center;gap:6px;"><span class="color-dot" style="background:${esc(c.preferredColor.toLowerCase())};"></span>${esc(c.preferredColor)}</div>` : '<span style="color:var(--text-xlight);">—</span>'}</td>
            <td>${c.occasion ? `<span class="td-badge badge-gray">${esc(c.occasion)}</span>` : '<span style="color:var(--text-xlight);">—</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;
}

/* Admin: Orders ─── */
function renderAdminOrders() {
  const orders = DB.getOrders().slice().reverse();
  const customers = DB.getCustomers();
  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Orders</div>
    <div class="dash-page-subtitle">${orders.length} order${orders.length!==1?'s':''} total</div>
    ${orders.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">◊</div>
        <div class="empty-state-title">No orders yet</div>
        <div class="empty-state-text">Customer orders will appear here after checkout.</div>
      </div>` : `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Order ID</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${orders.map(o => {
            const cust = customers.find(c => c.id === o.customerId);
            return `
            <tr>
              <td><code style="font-size:0.75rem;background:var(--cream-2);padding:2px 8px;border-radius:4px;">#${o.id.slice(-6).toUpperCase()}</code></td>
              <td class="td-name">${esc(cust?.name||'Guest')}</td>
              <td style="color:var(--text-light);font-size:0.82rem;">${fmtDate(o.date)}</td>
              <td>${o.items.length} item${o.items.length!==1?'s':''}</td>
              <td style="font-family:var(--font-serif);font-size:1rem;font-weight:700;color:var(--gold-dark);">${fmt(o.total)}</td>
              <td><button class="btn btn-outline btn-sm" data-view-order="${esc(o.id)}">View Bill</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`}
    ${state.modalOpen === 'order-bill' ? renderOrderBillModal(state.viewingOrderId) : ''}
  </div>`;
}

function renderOrderBillModal(orderId) {
  const order = DB.getOrders().find(o => o.id === orderId);
  if (!order) return '';
  const shop = DB.getShop();
  const cust = DB.getCustomers().find(c => c.id === order.customerId);
  return `
  <div class="modal-overlay" id="order-bill-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-header">
        <div class="modal-title">Order Receipt</div>
        <button class="modal-close" data-close-modal="order-bill">✕</button>
      </div>
      <div class="modal-body">${renderBillHTML(order, shop, cust)}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="order-bill">Close</button>
        <button class="btn btn-gold" onclick="window.print()">Print Bill</button>
      </div>
    </div>
  </div>`;
}

function renderBillHTML(order, shop, cust) {
  const items = order.items || [];
  const subtotal = items.reduce((s,i) => s + i.qty * i.price, 0);
  return `
  <div class="bill-receipt">
    <div class="bill-header">
      <div class="bill-shop-name gold-text">${esc(shop?.name||'Aura Lite')}</div>
      <div class="bill-shop-address">${esc(shop?.address||'')}</div>
      ${shop?.gst ? `<div style="font-size:0.72rem;color:var(--text-light);margin-top:4px;">GST: ${esc(shop.gst)}</div>` : ''}
    </div>
    <div class="bill-meta">
      <span>Bill No: #${order.id.slice(-8).toUpperCase()}</span>
      <span>${fmtDate(order.date)}</span>
    </div>
    <div style="margin-bottom:16px;font-size:0.82rem;">
      <strong>Customer:</strong> ${esc(cust?.name||'Guest')}<br/>
      <span style="color:var(--text-light);">WhatsApp: ${esc(cust?.whatsapp||'—')}</span>
    </div>
    <table class="bill-table">
      <thead>
        <tr><th>Item</th><th>Size</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
      </thead>
      <tbody>
        ${items.map(i => `
        <tr>
          <td>${esc(i.name)}</td>
          <td>${esc(i.size||'')}</td>
          <td>${i.qty}</td>
          <td>${fmt(i.price)}</td>
          <td>${fmt(i.qty * i.price)}</td>
        </tr>`).join('')}
        <tr class="bill-total-row">
          <td colspan="4">Total Amount</td>
          <td>${fmt(subtotal)}</td>
        </tr>
      </tbody>
    </table>
    <div class="bill-footer-msg">Thank you for shopping with us! ✦</div>
  </div>`;
}

/* ── 12. Employee Dashboard ──────────────────────── */
function renderEmployeeDash() {
  const session = DB.getSession();
  const shop = DB.getShop();
  const content = state.subRoute === 'stock' ? renderEmpStock() : renderEmpProducts();
  return `
  <div>
    ${renderAppHeader({ shopName: shop?.name, userName: session?.name, role: 'employee' })}
    <div class="dash-layout">
      ${renderSidebar('employee')}
      <main class="dash-main">${content}</main>
    </div>
  </div>`;
}

function renderEmpProducts() {
  const products = DB.getProducts();
  const q = state.searchQuery.toLowerCase();
  const filtered = q ? products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) : products;

  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Product Catalogue</div>
    <div class="dash-page-subtitle">Browse and manage clothing stock</div>
    <div class="dash-toolbar">
      <div class="dash-search" style="flex:1;">
        <span class="dash-search-icon">⌕</span>
        <input type="text" placeholder="Search products…" id="product-search" value="${esc(state.searchQuery)}" />
      </div>
      <button class="btn btn-gold" id="add-product-btn">+ Add Product</button>
    </div>
    ${filtered.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">👗</div><div class="empty-state-title">No products found</div></div>` : `
    <div class="grid-3">${filtered.map(p => renderAdminProductCard(p)).join('')}</div>`}
    ${state.modalOpen === 'product' ? renderProductModal() : ''}
    ${state.modalOpen === 'stock' ? renderStockModal(state.stockProductId) : ''}
  </div>`;
}

function renderEmpStock() {
  const products = DB.getProducts();
  const low = products.filter(p => Number(p.quantity) <= 5);
  return `
  <div class="animate-fadeIn">
    <div class="dash-page-title">Stock Management</div>
    <div class="dash-page-subtitle">Monitor and update stock levels</div>
    ${low.length > 0 ? `
    <div style="margin-bottom:24px;">
      <div class="alert alert-warning">⚠ &nbsp; ${low.length} product${low.length!==1?'s':''} with low or zero stock</div>
    </div>` : ''}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Size</th><th>Price</th><th>Stock</th><th>Update</th></tr></thead>
        <tbody>
          ${products.map(p => `
          <tr>
            <td class="td-name">${esc(p.name)}</td>
            <td>${esc(p.category)}</td>
            <td>${esc(p.size)}</td>
            <td style="font-family:var(--font-serif);font-weight:600;color:var(--gold-dark);">${fmt(p.price)}</td>
            <td>
              <span class="td-badge ${Number(p.quantity)===0?'badge-red':Number(p.quantity)<=5?'badge-gold':'badge-green'}">
                ${Number(p.quantity)===0 ? 'Out of Stock' : p.quantity+' units'}
              </span>
            </td>
            <td><button class="btn btn-outline btn-sm" data-stock-product="${esc(p.id)}">Update</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${state.modalOpen === 'stock' ? renderStockModal(state.stockProductId) : ''}
  </div>`;
}

/* ── 13. Customer Shop ───────────────────────────── */
function renderCustomerShop() {
  const shop = DB.getShop();
  const session = DB.getSession();
  const cust = DB.getCustomers().find(c => c.id === session?.id);
  const products = DB.getProducts().filter(p => Number(p.quantity) > 0);
  const cats = ['all', ...new Set(products.map(p => p.category))];
  const activeFilter = state.activeFilter || 'all';
  const q = (state.searchQuery||'').toLowerCase();

  let filtered = activeFilter === 'all' ? products : products.filter(p => p.category === activeFilter);
  if (q) filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.color.toLowerCase().includes(q));

  const recommendations = cust ? getRecommendations(products, cust).slice(0, 4) : [];
  const cartCount = state.cart.reduce((s,i) => s + i.qty, 0);

  return `
  <div>
    <header class="app-header">
      <div class="app-logo"><span class="gold-text">AURA</span><span class="app-logo-lite">Lite</span></div>
      <div class="header-actions">
        <div class="dash-search" style="min-width:220px;">
          <span class="dash-search-icon">⌕</span>
          <input type="text" placeholder="Search collection…" id="shop-search" value="${esc(state.searchQuery)}" style="padding:8px 14px 8px 34px;border-radius:20px;" />
        </div>
        <div class="cart-btn" id="open-cart-btn">
          🛍
          ${cartCount > 0 ? `<span class="cart-count">${cartCount}</span>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" id="logout-btn">Sign Out</button>
      </div>
    </header>

    <div class="shop-hero">
      <div class="shop-hero-content">
        ${cust ? `<div class="shop-hero-greeting">✦ &nbsp; Welcome back, ${esc(cust.name)} &nbsp; ✦</div>` : ''}
        <div class="shop-hero-name gold-text">${esc(shop?.name||'Aura Lite')}</div>
        <div class="shop-hero-sub">${esc(shop?.address||'Luxury Fashion Boutique')}</div>
      </div>
    </div>

    <div class="shop-filter-bar">
      ${cats.map(cat => `
        <div class="filter-chip${activeFilter===cat?' active':''}" data-filter="${esc(cat)}">
          ${cat === 'all' ? '✦ All' : esc(cat)}
        </div>`).join('')}
    </div>

    ${recommendations.length > 0 ? `
    <div class="shop-section" style="background:var(--cream);border-bottom:1px solid var(--border-light);">
      <div class="shop-section-header">
        <div>
          <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:4px;">✦ Curated For You</div>
          <div class="shop-section-title">Recommended</div>
        </div>
        <div class="shop-section-line"></div>
      </div>
      <div class="shop-grid">
        ${recommendations.slice(0,4).map(p => renderShopCard(p)).join('')}
      </div>
    </div>` : ''}

    <div class="shop-section">
      <div class="shop-section-header">
        <div>
          <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-light);font-weight:600;margin-bottom:4px;">
            ${activeFilter==='all' ? 'Complete Collection' : esc(activeFilter)}
          </div>
          <div class="shop-section-title">${filtered.length} Item${filtered.length!==1?'s':''}</div>
        </div>
        <div class="shop-section-line"></div>
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">✦</div>
          <div class="empty-state-title">No products found</div>
          <div class="empty-state-text">Try a different search or category.</div>
        </div>` : `
      <div class="shop-grid">
        ${filtered.map(p => renderShopCard(p)).join('')}
      </div>`}
    </div>

    ${state.modalOpen === 'product-detail' ? renderProductDetailModal(state.viewingProductId) : ''}
  </div>`;
}

function renderShopCard(p) {
  const inCart = state.cart.find(i => i.id === p.id);
  return `
  <div class="shop-card" data-product-detail="${esc(p.id)}">
    <div class="shop-card-img">
      ${p.image
        ? `<img src="${p.image}" alt="${esc(p.name)}" loading="lazy" />`
        : `<div class="no-img">👗<span style="font-size:0.75rem;color:var(--text-xlight);">No Image</span></div>`}
      <span class="shop-card-badge">${esc(p.category)}</span>
      <div class="shop-card-wishlist">♡</div>
    </div>
    <div class="shop-card-body">
      <div class="shop-card-category">${esc(p.category)}</div>
      <div class="shop-card-name">${esc(p.name)}</div>
      <div class="shop-card-tags">
        <span class="product-tag">${esc(p.size)}</span>
        <span class="product-tag" style="display:flex;align-items:center;gap:4px;">
          <span class="color-dot" style="background:${esc(p.color.toLowerCase())};"></span>
          ${esc(p.color)}
        </span>
      </div>
      <div class="shop-card-footer">
        <div class="shop-card-price"><span class="currency">₹</span>${Number(p.price).toLocaleString('en-IN')}</div>
        ${Number(p.quantity) <= 5 ? `<span class="stock-badge low">Only ${p.quantity} left</span>` : `<span class="stock-badge">In Stock</span>`}
      </div>
      <button class="btn ${inCart?'btn-outline':'btn-gold'} btn-sm btn-block" style="margin-top:14px;" data-add-cart="${esc(p.id)}">
        ${inCart ? `✓ Added (${inCart.qty})` : '+ Add to Cart'}
      </button>
    </div>
  </div>`;
}

function renderProductDetailModal(productId) {
  const p = DB.getProducts().find(pr => pr.id === productId);
  if (!p) return '';
  const inCart = state.cart.find(i => i.id === p.id);
  return `
  <div class="modal-overlay" id="product-detail-overlay">
    <div class="modal modal-lg animate-slideUp">
      <div class="modal-header">
        <div class="modal-title">${esc(p.name)}</div>
        <button class="modal-close" data-close-modal="product-detail">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:28px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;max-width:280px;">
            ${p.image
              ? `<img src="${p.image}" alt="${esc(p.name)}" style="width:100%;border-radius:var(--radius-lg);object-fit:cover;aspect-ratio:3/4;" />`
              : `<div style="width:100%;aspect-ratio:3/4;background:var(--cream-2);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;font-size:4rem;">👗</div>`}
          </div>
          <div style="flex:2;min-width:240px;">
            <div style="font-size:0.75rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-dark);font-weight:700;margin-bottom:8px;">${esc(p.category)}</div>
            <h2 style="font-family:var(--font-serif);margin-bottom:16px;">${esc(p.name)}</h2>
            <div style="font-family:var(--font-serif);font-size:2rem;font-weight:700;color:var(--gold-dark);margin-bottom:24px;">${fmt(p.price)}</div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px;">
              <div style="display:flex;gap:12px;font-size:0.85rem;">
                <span style="color:var(--text-light);width:80px;">Size</span>
                <span class="product-tag gold">${esc(p.size)}</span>
              </div>
              <div style="display:flex;align-items:center;gap:12px;font-size:0.85rem;">
                <span style="color:var(--text-light);width:80px;">Color</span>
                <span style="display:flex;align-items:center;gap:8px;">
                  <span class="color-dot" style="background:${esc(p.color.toLowerCase())};width:16px;height:16px;"></span>
                  ${esc(p.color)}
                </span>
              </div>
              <div style="display:flex;align-items:center;gap:12px;font-size:0.85rem;">
                <span style="color:var(--text-light);width:80px;">Stock</span>
                <span class="td-badge ${Number(p.quantity)===0?'badge-red':Number(p.quantity)<=5?'badge-gold':'badge-green'}">
                  ${Number(p.quantity)===0 ? 'Out of Stock' : Number(p.quantity)<=5 ? `Only ${p.quantity} left` : 'In Stock'}
                </span>
              </div>
            </div>
            <button class="btn ${inCart?'btn-outline':'btn-gold'} btn-block btn-lg" data-add-cart="${esc(p.id)}" ${Number(p.quantity)===0?'disabled':''}>
              ${Number(p.quantity)===0 ? 'Out of Stock' : inCart ? `✓ In Cart (${inCart.qty} added)` : '+ Add to Cart'}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── 14. Cart Sidebar ────────────────────────────── */
function renderCartSidebar() {
  const cart = state.cart;
  const total = cart.reduce((s,i) => s + i.qty * i.price, 0);
  return `
  <div class="cart-overlay" id="cart-overlay-bg"></div>
  <div class="cart-sidebar">
    <div class="cart-header">
      <div class="cart-title">Shopping Cart <span style="font-family:var(--font-sans);font-size:0.85rem;font-weight:400;color:var(--text-light);">(${cart.reduce((s,i)=>s+i.qty,0)} items)</span></div>
      <button class="modal-close" id="close-cart-btn">✕</button>
    </div>
    ${cart.length === 0 ? `
    <div class="cart-empty">
      <div class="cart-empty-icon">🛍</div>
      <div style="font-family:var(--font-serif);font-size:1.2rem;color:var(--text-medium);margin-bottom:8px;">Your cart is empty</div>
      <p class="text-muted">Add items to your cart to begin shopping</p>
    </div>` : `
    <div class="cart-items">
      ${cart.map(item => `
      <div class="cart-item">
        ${item.image
          ? `<img src="${item.image}" class="cart-item-img" alt="${esc(item.name)}" />`
          : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;">👗</div>`}
        <div class="cart-item-info">
          <div class="cart-item-name">${esc(item.name)}</div>
          <div class="cart-item-meta">${esc(item.size)} · ${esc(item.color)}</div>
          <div class="cart-item-controls">
            <div class="qty-control">
              <button class="qty-btn" data-cart-dec="${esc(item.id)}">−</button>
              <span class="qty-value">${item.qty}</span>
              <button class="qty-btn" data-cart-inc="${esc(item.id)}">+</button>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <div class="cart-item-price">${fmt(item.qty * item.price)}</div>
          <span class="cart-item-remove" data-cart-remove="${esc(item.id)}">✕ Remove</span>
        </div>
      </div>`).join('')}
    </div>
    <div class="cart-footer">
      <div class="cart-summary-row"><span>Subtotal</span><span>${fmt(total)}</span></div>
      <div class="cart-total-row"><span>Total</span><span class="cart-total-amount">${fmt(total)}</span></div>
      <button class="btn btn-gold btn-block btn-lg" style="margin-top:16px;" id="checkout-btn">✦ &nbsp; Checkout</button>
    </div>`}
  </div>`;
}

/* ── 15. Checkout Modal ──────────────────────────── */
function renderCheckoutModal() {
  const session = DB.getSession();
  const cust = DB.getCustomers().find(c => c.id === session?.id);
  const cart = state.cart;
  const total = cart.reduce((s,i) => s + i.qty * i.price, 0);
  const shop = DB.getShop();

  return `
  <div class="modal-overlay" id="checkout-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-header">
        <div>
          <div class="login-role-badge">✦ &nbsp; Checkout</div>
          <div class="modal-title">Confirm Order</div>
        </div>
        <button class="modal-close" data-close-modal="checkout">✕</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:20px;">
          ${cart.map(i => `
          <div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:8px 0;border-bottom:1px solid var(--border-light);">
            <span>${esc(i.name)} × ${i.qty}</span>
            <span style="font-weight:600;">${fmt(i.qty * i.price)}</span>
          </div>`).join('')}
          <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:700;padding-top:14px;color:var(--gold-dark);">
            <span style="font-family:var(--font-serif);">Total Amount</span>
            <span style="font-family:var(--font-serif);">${fmt(total)}</span>
          </div>
        </div>

        <div style="background:var(--gold-lighter);border:1px solid var(--gold-light);border-radius:var(--radius-md);padding:16px;font-size:0.82rem;color:var(--gold-dark);">
          📱 &nbsp; A digital bill will be sent to <strong>${esc(cust?.whatsapp||'your WhatsApp')}</strong> after confirming.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close-modal="checkout">Back</button>
        <button class="btn btn-gold btn-lg" id="confirm-order-btn">✦ &nbsp; Confirm &amp; Pay ${fmt(total)}</button>
      </div>
    </div>
  </div>`;
}

/* ── 16. Order Success / Bill ────────────────────── */
function renderOrderSuccess(orderId) {
  const order = DB.getOrders().find(o => o.id === orderId);
  const shop = DB.getShop();
  const session = DB.getSession();
  const cust = DB.getCustomers().find(c => c.id === session?.id);

  const billText = buildWhatsAppBill(order, shop, cust);
  const waLink = `https://wa.me/91${cust?.whatsapp}?text=${encodeURIComponent(billText)}`;

  return `
  <div class="modal-overlay" id="success-overlay">
    <div class="modal animate-slideUp">
      <div class="modal-body" style="text-align:center;padding:40px 32px;">
        <div style="font-size:3.5rem;margin-bottom:16px;">✦</div>
        <h2 style="font-family:var(--font-serif);margin-bottom:8px;color:var(--gold-dark);">Order Confirmed!</h2>
        <p class="text-muted" style="margin-bottom:28px;">Your purchase has been processed successfully.</p>
        ${renderBillHTML(order, shop, cust)}
        <div style="margin-top:24px;display:flex;flex-direction:column;gap:12px;">
          <a href="${waLink}" target="_blank" class="btn btn-gold btn-lg btn-block">
            📱 &nbsp; Send Bill to WhatsApp
          </a>
          <button class="btn btn-ghost btn-block" id="close-success-btn">Continue Shopping</button>
        </div>
      </div>
    </div>
  </div>`;
}

function buildWhatsAppBill(order, shop, cust) {
  const items = order?.items || [];
  const total = items.reduce((s,i) => s + i.qty*i.price, 0);
  let msg = `*${shop?.name||'Aura Lite'} – Receipt*\n`;
  msg += `_${shop?.address||''}_\n`;
  if (shop?.gst) msg += `GST: ${shop.gst}\n`;
  msg += `\n*Bill No:* #${order?.id?.slice(-8)?.toUpperCase()}\n`;
  msg += `*Date:* ${fmtDate(order?.date)}\n`;
  msg += `*Customer:* ${cust?.name||'Guest'}\n\n`;
  msg += `*Items Purchased:*\n`;
  items.forEach(i => { msg += `• ${i.name} (${i.size}) × ${i.qty} = ₹${(i.qty*i.price).toLocaleString('en-IN')}\n`; });
  msg += `\n*Total: ₹${total.toLocaleString('en-IN')}*\n\n`;
  msg += `Thank you for shopping with us! 🛍✨`;
  return msg;
}

/* ── 17. Recommendations Engine ──────────────────── */
function getRecommendations(products, cust) {
  if (!cust) return [];
  return products.filter(p => {
    let score = 0;
    if (cust.size && p.size === cust.size) score += 3;
    if (cust.preferredColor && p.color.toLowerCase().includes(cust.preferredColor.toLowerCase())) score += 2;
    if (cust.occasion && p.category.toLowerCase().includes(cust.occasion.toLowerCase())) score += 2;
    if (cust.gender === 'Female' && ['kurta','saree','lehenga','dress','salwar'].some(k => p.category.toLowerCase().includes(k))) score += 1;
    if (cust.gender === 'Male' && ['shirt','trouser','kurta','suit','sherwani'].some(k => p.category.toLowerCase().includes(k))) score += 1;
    return score > 0;
  }).sort((a,b) => {
    const scoreOf = p => {
      let s = 0;
      if (cust.size && p.size === cust.size) s += 3;
      if (cust.preferredColor && p.color.toLowerCase().includes(cust.preferredColor.toLowerCase())) s += 2;
      return s;
    };
    return scoreOf(b) - scoreOf(a);
  });
}

/* ── 18. Event Listeners ─────────────────────────── */
function attachListeners() {
  const on = (sel, evt, fn) => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener(evt, fn);
  };
  const onAll = (sel, evt, fn) => {
    document.querySelectorAll(sel).forEach(el => el.addEventListener(evt, fn));
  };

  /* Landing */
  onAll('.login-option-card', 'click', e => {
    const role = e.currentTarget.dataset.role;
    const shop = DB.getShop();
    if (role === 'admin' && !shop) {
      navigate('register-shop');
    } else {
      state.loginRole = role;
      navigate('login');
    }
  });
  on('#setup-shop-link', 'click', () => navigate('register-shop'));

  /* Login form */
  on('#login-form', 'submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const role = state.loginRole;
    const ok = login(role, fd.get('username'), fd.get('password'));
    if (ok) {
      if (role === 'admin') navigate('admin');
      else if (role === 'employee') navigate('employee');
      else navigate('customer');
    }
  });

  on('#go-register-customer', 'click', () => navigate('register-customer'));
  on('#back-to-landing', 'click', () => navigate('landing'));
  on('#back-to-login-customer', 'click', () => { state.loginRole='customer'; navigate('login'); });

  /* Shop Register */
  on('#shop-register-form', 'submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const shop = {
      name:          fd.get('name'),
      ownerName:     fd.get('ownerName'),
      address:       fd.get('address'),
      phone:         fd.get('phone'),
      gst:           fd.get('gst'),
      adminUsername: fd.get('adminUsername'),
      adminPassword: fd.get('adminPassword'),
    };
    if (!shop.name||!shop.ownerName||!shop.address||!shop.phone||!shop.adminUsername||!shop.adminPassword) {
      showToast('Please fill all required fields', 'error'); return;
    }
    DB.setShop(shop);
    DB.setSession({ role:'admin', name: shop.ownerName, username: shop.adminUsername });
    showToast(`Welcome to Aura Lite, ${shop.name}!`, 'success');
    navigate('admin');
  });

  /* Customer Register */
  on('#customer-register-form', 'submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const existing = DB.getCustomers();
    if (existing.find(c => c.username === fd.get('username'))) {
      showToast('Username already taken. Try another.', 'error'); return;
    }
    const cust = {
      id: uid(),
      name:          fd.get('name'),
      whatsapp:      fd.get('whatsapp'),
      gender:        fd.get('gender'),
      size:          fd.get('size'),
      address:       fd.get('address'),
      skinTone:      fd.get('skinTone'),
      preferredColor:fd.get('preferredColor'),
      occasion:      fd.get('occasion'),
      username:      fd.get('username'),
      password:      fd.get('password'),
    };
    if (!cust.name||!cust.whatsapp||!cust.gender||!cust.size||!cust.username||!cust.password) {
      showToast('Please fill all required fields', 'error'); return;
    }
    DB.addCustomer(cust);
    DB.setSession({ role:'customer', name:cust.name, username:cust.username, id:cust.id });
    showToast(`Welcome, ${cust.name}!`, 'success');
    navigate('customer');
  });

  /* Logout */
  on('#logout-btn', 'click', logout);
  on('#logout-btn-sidebar', 'click', logout);

  /* Sidebar nav */
  onAll('.sidebar-nav-item', 'click', e => {
    state.subRoute = e.currentTarget.dataset.sub;
    state.searchQuery = '';
    state.modalOpen = null;
    render();
  });

  /* Product search */
  on('#product-search', 'input', e => { state.searchQuery = e.target.value; renderProducts(); });
  on('#emp-search', 'input', e => { state.searchQuery = e.target.value; render(); });
  on('#shop-search', 'input', e => { state.searchQuery = e.target.value; render(); });

  /* Category filter (customer shop) */
  onAll('.filter-chip', 'click', e => {
    state.activeFilter = e.currentTarget.dataset.filter;
    render();
  });

  /* Add product btn */
  on('#add-product-btn', 'click', () => { state.modalOpen='product'; state.editingId=null; render(); });

  /* Edit product */
  onAll('[data-edit-product]', 'click', e => {
    state.editingId = e.currentTarget.dataset.editProduct;
    state.modalOpen = 'product';
    render();
  });

  /* Delete product */
  onAll('[data-delete-product]', 'click', e => {
    const id = e.currentTarget.dataset.deleteProduct;
    const p = DB.getProducts().find(pr => pr.id === id);
    if (confirm(`Delete "${p?.name}"? This cannot be undone.`)) {
      DB.deleteProduct(id);
      showToast('Product deleted', 'info');
      render();
    }
  });

  /* Stock update */
  onAll('[data-stock-product]', 'click', e => {
    state.stockProductId = e.currentTarget.dataset.stockProduct;
    state.modalOpen = 'stock';
    render();
  });

  on('#save-stock-btn', 'click', e => {
    const pid = e.target.dataset.pid;
    const qty = Number(document.getElementById('stock-qty-input').value);
    if (isNaN(qty) || qty < 0) { showToast('Invalid quantity', 'error'); return; }
    DB.updateProduct(pid, { quantity: qty });
    showToast('Stock updated', 'success');
    state.modalOpen = null;
    render();
  });

  /* Image upload */
  on('#img-file-input', 'change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('image-data-input').value = ev.target.result;
      const area = document.getElementById('img-upload-area');
      const existing = area.querySelector('.img-preview');
      if (existing) existing.remove();
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.className = 'img-preview';
      area.appendChild(img);
    };
    reader.readAsDataURL(file);
  });

  /* Save product */
  on('#save-product-btn', 'click', () => {
    const form = document.getElementById('product-form');
    if (!form) return;
    const fd = new FormData(form);
    const imageData = document.getElementById('image-data-input')?.value || '';

    const prod = {
      name:     fd.get('name')?.trim(),
      category: fd.get('category')?.trim(),
      size:     fd.get('size'),
      color:    fd.get('color')?.trim(),
      price:    Number(fd.get('price')),
      quantity: Number(fd.get('quantity')),
      image:    imageData,
    };

    if (!prod.name||!prod.category||!prod.size||!prod.color||!prod.price) {
      showToast('Please fill all required fields', 'error'); return;
    }

    if (state.editingId) {
      DB.updateProduct(state.editingId, prod);
      showToast('Product updated successfully', 'success');
    } else {
      prod.id = uid();
      prod.addedDate = Date.now();
      DB.addProduct(prod);
      DB.addCategory(prod.category);
      showToast('Product added successfully', 'success');
    }
    state.modalOpen = null;
    state.editingId = null;
    render();
  });

  /* Close modal */
  onAll('[data-close-modal]', 'click', e => {
    state.modalOpen = null;
    state.editingId = null;
    render();
  });
  on('#product-modal-overlay', 'click', e => { if(e.target.id==='product-modal-overlay'){state.modalOpen=null;render();} });
  on('#emp-modal-overlay', 'click', e => { if(e.target.id==='emp-modal-overlay'){state.modalOpen=null;render();} });
  on('#stock-modal-overlay', 'click', e => { if(e.target.id==='stock-modal-overlay'){state.modalOpen=null;render();} });
  on('#order-bill-overlay', 'click', e => { if(e.target.id==='order-bill-overlay'){state.modalOpen=null;render();} });

  /* Category */
  on('#add-category-form', 'submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('catName')?.trim();
    if (!name) return;
    DB.addCategory(name);
    showToast(`Category "${name}" added`, 'success');
    e.target.reset();
    render();
  });
  onAll('[data-delete-cat]', 'click', e => {
    const cat = e.currentTarget.dataset.deleteCat;
    if (confirm(`Delete category "${cat}"?`)) {
      const cats = DB.getCategories().filter(c => c !== cat);
      DB.setCategories(cats);
      showToast('Category deleted', 'info');
      render();
    }
  });

  /* Employees */
  on('#add-emp-btn', 'click', () => { state.modalOpen='employee'; state.editingId=null; render(); });
  onAll('[data-edit-emp]', 'click', e => { state.editingId=e.currentTarget.dataset.editEmp; state.modalOpen='employee'; render(); });
  onAll('[data-delete-emp]', 'click', e => {
    const id = e.currentTarget.dataset.deleteEmp;
    const emp = DB.getEmployees().find(em => em.id === id);
    if (confirm(`Remove employee "${emp?.name}"?`)) {
      DB.deleteEmployee(id);
      showToast('Employee removed', 'info');
      render();
    }
  });
  on('#save-emp-btn', 'click', () => {
    const form = document.getElementById('emp-form');
    if (!form) return;
    const fd = new FormData(form);
    const gender = form.querySelector('input[name="gender"]:checked')?.value;

    if (state.editingId) {
      const data = { name: fd.get('name')?.trim(), phone: fd.get('phone')?.trim(), gender, address: fd.get('address')?.trim() };
      if (!data.name||!data.phone||!gender) { showToast('Fill required fields','error'); return; }
      DB.updateEmployee(state.editingId, data);
      showToast('Employee updated', 'success');
    } else {
      const existing = DB.getEmployees();
      if (existing.find(e => e.username===fd.get('username'))) { showToast('Username taken','error'); return; }
      const emp = {
        id:       uid(),
        name:     fd.get('name')?.trim(),
        phone:    fd.get('phone')?.trim(),
        gender,
        address:  fd.get('address')?.trim(),
        username: fd.get('username')?.trim(),
        password: fd.get('password'),
      };
      if (!emp.name||!emp.phone||!emp.gender||!emp.username||!emp.password) { showToast('Fill required fields','error'); return; }
      DB.addEmployee(emp);
      showToast(`Employee ${emp.name} added. Username: ${emp.username}`, 'success');
    }
    state.modalOpen = null;
    state.editingId = null;
    render();
  });

  /* Customer shop */
  onAll('[data-product-detail]', 'click', e => {
    if (e.target.closest('[data-add-cart]')) return;
    state.viewingProductId = e.currentTarget.dataset.productDetail;
    state.modalOpen = 'product-detail';
    render();
  });
  on('#product-detail-overlay', 'click', e => {
    if (e.target.id==='product-detail-overlay'){state.modalOpen=null;render();}
  });

  /* Cart */
  onAll('[data-add-cart]', 'click', e => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.addCart;
    addToCart(id);
  });
  on('#open-cart-btn', 'click', () => { state.cartOpen=true; render(); });
  on('#close-cart-btn', 'click', () => { state.cartOpen=false; render(); });
  on('#cart-overlay-bg', 'click', () => { state.cartOpen=false; render(); });

  onAll('[data-cart-inc]', 'click', e => { updateCartQty(e.currentTarget.dataset.cartInc, 1); });
  onAll('[data-cart-dec]', 'click', e => { updateCartQty(e.currentTarget.dataset.cartDec, -1); });
  onAll('[data-cart-remove]', 'click', e => { removeFromCart(e.currentTarget.dataset.cartRemove); });

  /* Checkout */
  on('#checkout-btn', 'click', () => {
    state.cartOpen = false;
    document.body.insertAdjacentHTML('beforeend', renderCheckoutModal());
    document.querySelector('[data-close-modal="checkout"]')?.addEventListener('click', () => {
      document.getElementById('checkout-overlay')?.remove();
      state.cartOpen = true;
      render();
    });
    document.getElementById('checkout-overlay')?.addEventListener('click', e => {
      if (e.target.id==='checkout-overlay') {
        e.currentTarget.remove();
        state.cartOpen = true;
        render();
      }
    });
    document.getElementById('confirm-order-btn')?.addEventListener('click', confirmOrder);
  });

  /* Orders (admin) */
  onAll('[data-view-order]', 'click', e => {
    state.viewingOrderId = e.currentTarget.dataset.viewOrder;
    state.modalOpen = 'order-bill';
    render();
  });
}

/* ── 19. Cart Logic ──────────────────────────────── */
function addToCart(productId) {
  const p = DB.getProducts().find(pr => pr.id === productId);
  if (!p) return;
  const existing = state.cart.find(i => i.id === productId);
  const maxQty = Number(p.quantity);

  if (existing) {
    if (existing.qty >= maxQty) { showToast(`Only ${maxQty} units available`, 'error'); return; }
    existing.qty++;
  } else {
    if (maxQty === 0) { showToast('This item is out of stock', 'error'); return; }
    state.cart.push({ id:p.id, name:p.name, size:p.size, color:p.color, price:Number(p.price), image:p.image, qty:1 });
  }
  showToast(`${p.name} added to cart`, 'success');
  render();
}

function updateCartQty(productId, delta) {
  const item = state.cart.find(i => i.id === productId);
  if (!item) return;
  const p = DB.getProducts().find(pr => pr.id === productId);
  const newQty = item.qty + delta;
  if (newQty <= 0) { removeFromCart(productId); return; }
  if (p && newQty > Number(p.quantity)) { showToast('Not enough stock', 'error'); return; }
  item.qty = newQty;
  render();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i.id !== productId);
  render();
}

/* ── 20. Checkout Logic ──────────────────────────── */
function confirmOrder() {
  const session = DB.getSession();
  const cart = state.cart;
  if (cart.length === 0) { showToast('Cart is empty','error'); return; }

  const total = cart.reduce((s,i) => s + i.qty*i.price, 0);

  // Deduct stock
  cart.forEach(item => {
    const p = DB.getProducts().find(pr => pr.id === item.id);
    if (p) {
      const newQty = Math.max(0, Number(p.quantity) - item.qty);
      DB.updateProduct(item.id, { quantity: newQty });
    }
  });

  const order = {
    id:         uid(),
    customerId: session?.id,
    items:      cart.map(i => ({ id:i.id, name:i.name, size:i.size, color:i.color, price:i.price, qty:i.qty })),
    total,
    date:       Date.now(),
  };

  DB.addOrder(order);
  state.cart = [];

  // Remove checkout modal
  document.getElementById('checkout-overlay')?.remove();

  // Show success
  document.body.insertAdjacentHTML('beforeend', renderOrderSuccess(order.id));

  const closeSuccessBtn = document.getElementById('close-success-btn');
  if (closeSuccessBtn) {
    closeSuccessBtn.addEventListener('click', () => {
      document.getElementById('success-overlay')?.remove();
      render();
    });
  }
}

/* ── 21. Partial re-render for search ────────────── */
function renderProducts() {
  const products = DB.getProducts();
  const q = state.searchQuery.toLowerCase();
  const filtered = q ? products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    p.color.toLowerCase().includes(q)
  ) : products;

  const grid = document.getElementById('products-grid');
  if (grid) {
    grid.innerHTML = filtered.map(p => renderAdminProductCard(p)).join('');
    attachListeners();
  }
}

/* ── 22. App Init ────────────────────────────────── */
function init() {
  const session = DB.getSession();
  if (session) {
    if (session.role === 'admin') navigate('admin');
    else if (session.role === 'employee') navigate('employee');
    else navigate('customer');
  } else {
    navigate('landing');
  }
}

document.addEventListener('DOMContentLoaded', init);
