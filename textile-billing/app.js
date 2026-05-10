'use strict';

/* ===== CONSTANTS & UTILS ===== */
const APP_KEY = 'tbp_v1';
const APP_URL = 'https://nandhinibkbabu21-boop.github.io/aura-lite/textile-billing/';
const KEYS = {
  company: `${APP_KEY}_company`,
  products: `${APP_KEY}_products`,
  invoices: `${APP_KEY}_invoices`,
};
const TAX_RATE = 0.05;
const HSN_CODE = '5208';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _ls(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function _lsSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ===== NUM TO WORDS (Indian System) ===== */
function numToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertBelow100(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
  }

  function convertBelow1000(n) {
    if (n < 100) return convertBelow100(n);
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertBelow100(n % 100) : '');
  }

  function convertIndian(n) {
    if (n === 0) return 'Zero';
    let result = '';
    const crore = Math.floor(n / 10000000);
    n = n % 10000000;
    const lakh = Math.floor(n / 100000);
    n = n % 100000;
    const thousand = Math.floor(n / 1000);
    n = n % 1000;
    const remainder = n;

    if (crore > 0) result += convertBelow1000(crore) + ' Crore ';
    if (lakh > 0) result += convertBelow1000(lakh) + ' Lakh ';
    if (thousand > 0) result += convertBelow1000(thousand) + ' Thousand ';
    if (remainder > 0) result += convertBelow1000(remainder);
    return result.trim();
  }

  const n = Math.round(num);
  const paise = Math.round((num - n) * 100);
  const wholePart = convertIndian(n);
  let result = (wholePart || 'Zero') + ' Rupees';
  if (paise > 0) result += ' and ' + convertBelow100(paise) + ' Paise';
  result += ' Only';
  return result;
}

/* ===== DATABASE ===== */
const DB = {
  getCompany() { return _ls(KEYS.company); },
  setCompany(data) { _lsSet(KEYS.company, data); },

  getProducts() { return _ls(KEYS.products) || []; },
  addProduct(p) {
    const arr = DB.getProducts();
    arr.push(p);
    _lsSet(KEYS.products, arr);
  },
  updateProduct(id, data) {
    const arr = DB.getProducts().map(p => p.id === id ? { ...p, ...data } : p);
    _lsSet(KEYS.products, arr);
  },
  deleteProduct(id) {
    _lsSet(KEYS.products, DB.getProducts().filter(p => p.id !== id));
  },
  reduceStock(productId, sizeName, qty) {
    const arr = DB.getProducts().map(p => {
      if (p.id !== productId) return p;
      return {
        ...p, sizes: p.sizes.map(s =>
          s.size === sizeName ? { ...s, stock: Math.max(0, (s.stock || 0) - qty) } : s
        )
      };
    });
    _lsSet(KEYS.products, arr);
  },

  getInvoices() { return _ls(KEYS.invoices) || []; },
  addInvoice(inv) {
    const arr = DB.getInvoices();
    arr.unshift(inv);
    _lsSet(KEYS.invoices, arr);
  },
  getInvoice(id) { return DB.getInvoices().find(i => i.id === id); },
  getNextInvoiceNo() {
    const invs = DB.getInvoices();
    if (!invs.length) return 'INV-001';
    const last = invs[0].invoiceNo || 'INV-000';
    const num = parseInt(last.split('-')[1] || 0) + 1;
    return 'INV-' + String(num).padStart(3, '0');
  },
};

/* ===== STATE ===== */
const state = {
  view: 'home',
  modalOpen: null,
  editingProductId: null,
  viewingInvoiceId: null,
  billItems: [],
  billCustomer: {},
  currentProductSizes: [],
};

/* ===== TOAST ===== */
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

/* ===== MAIN RENDER ===== */
function render() {
  const app = document.getElementById('app');
  const company = DB.getCompany();

  if (!company && state.view !== 'setup') {
    state.view = 'setup';
  }

  let html = renderNav(company);

  switch (state.view) {
    case 'home': html += renderHome(); break;
    case 'setup': html += renderSetup(company); break;
    case 'products': html += renderProducts(); break;
    case 'new-bill': html += renderNewBill(); break;
    case 'invoice-history': html += renderInvoiceHistory(); break;
    case 'view-invoice': html += renderInvoiceView(state.viewingInvoiceId); break;
    default: html += renderHome();
  }

  if (state.modalOpen === 'add-product' || state.modalOpen === 'edit-product') {
    html += renderProductModal();
  }

  app.innerHTML = html;
  attachListeners();
}

/* ===== NAV ===== */
function renderNav(company) {
  const links = [
    { view: 'home', label: '🏠 Home' },
    { view: 'products', label: '📦 Products' },
    { view: 'new-bill', label: '📝 New Bill' },
    { view: 'invoice-history', label: '📋 History' },
  ];

  const navLinks = links.map(l => `
    <li>
      <button class="nav-link-btn ${state.view === l.view ? 'active' : ''}" data-view="${l.view}">
        ${l.label}
      </button>
    </li>
  `).join('');

  return `
    <nav class="app-nav">
      <div class="nav-inner">
        <span class="nav-logo" id="nav-logo-btn">
          <span class="icon">🧵</span> TEXTILE BILLING PRO
        </span>
        <ul class="nav-links">
          ${navLinks}
        </ul>
      </div>
    </nav>
  `;
}

/* ===== HOME ===== */
function renderHome() {
  const invoices = DB.getInvoices();
  const products = DB.getProducts();
  const totalRevenue = invoices.reduce((s, i) => s + (i.total || 0), 0);

  // Count products with any size having stock < 5
  const lowStockCount = products.filter(p =>
    p.sizes && p.sizes.some(s => (s.stock || 0) < 5)
  ).length;

  const recentInvoices = invoices.slice(0, 5);

  const statsHtml = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${invoices.length}</div>
        <div class="stat-label">Total Invoices</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-value">${formatCurrency(totalRevenue)}</div>
        <div class="stat-label">Total Revenue</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${products.length}</div>
        <div class="stat-label">Total Products</div>
      </div>
      <div class="stat-card ${lowStockCount > 0 ? 'danger' : ''}">
        <div class="stat-value">${lowStockCount}</div>
        <div class="stat-label">Low Stock Products</div>
      </div>
    </div>
  `;

  const qrHtml = `
    <div class="card">
      <div class="card-header"><h3>📱 Quick Access</h3></div>
      <div class="card-body">
        <div class="qr-section">
          <img class="qr-img"
            src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(APP_URL)}&bgcolor=ffffff&color=1a237e&qzone=2"
            alt="QR Code" width="180" height="180" loading="lazy">
          <div class="qr-url">${APP_URL}</div>
          <p style="color:var(--text-light);font-size:0.8rem;margin-top:8px;">Scan to open billing app on mobile</p>
        </div>
      </div>
    </div>
  `;

  let recentHtml = '';
  if (recentInvoices.length === 0) {
    recentHtml = `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <h4>No invoices yet</h4>
        <p>Create your first invoice to get started</p>
        <button class="btn btn-primary" data-view="new-bill">+ New Bill</button>
      </div>
    `;
  } else {
    recentHtml = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${recentInvoices.map(inv => `
              <tr>
                <td><span class="badge badge-info">${esc(inv.invoiceNo)}</span></td>
                <td>${formatDate(inv.date)}</td>
                <td><strong>${esc(inv.customer.name)}</strong></td>
                <td>${(inv.items || []).length} item(s)</td>
                <td><strong>${formatCurrency(inv.total)}</strong></td>
                <td>
                  <button class="btn btn-sm btn-secondary view-invoice-btn" data-id="${inv.id}">👁 View</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const company = DB.getCompany();
  const companyGreeting = company ? `
    <div class="page-subtitle">Welcome back! Manage your textile billing with ease.</div>
  ` : '';

  return `
    <div class="main-content">
      <div class="page-title">Dashboard</div>
      ${companyGreeting}
      ${lowStockCount > 0 ? `<div class="alert alert-warning">⚠️ ${lowStockCount} product(s) have low stock (below 5 units). <button class="btn btn-sm btn-secondary no-print" data-view="products" style="margin-left:8px;">View Products</button></div>` : ''}
      ${statsHtml}
      <div style="display:grid;grid-template-columns:1fr 260px;gap:20px;">
        <div>
          <div class="card">
            <div class="card-header">
              <h3>📄 Recent Invoices</h3>
              <button class="btn btn-sm btn-secondary" data-view="invoice-history">View All</button>
            </div>
            <div class="card-body" style="padding:0;">
              ${recentHtml}
            </div>
          </div>
          <div class="quick-actions no-print">
            <button class="btn btn-primary btn-lg" data-view="new-bill">📝 New Bill</button>
            <button class="btn btn-secondary btn-lg" data-view="products">📦 Add Product</button>
            ${company ? `<button class="btn btn-gold btn-lg" id="edit-company-btn">⚙️ Company Settings</button>` : ''}
          </div>
        </div>
        ${qrHtml}
      </div>
    </div>
  `;
}

/* ===== SETUP ===== */
function renderSetup(company) {
  const isFirstTime = !company;
  const c = company || {};

  return `
    <div class="main-content">
      <div class="setup-card card">
        ${isFirstTime ? '<div class="setup-icon">🏭</div>' : ''}
        <div class="card-header">
          <h3>${isFirstTime ? '🚀 First-Time Setup — Company Details' : '⚙️ Edit Company Settings'}</h3>
        </div>
        <div class="card-body">
          ${isFirstTime ? '<div class="alert alert-info">👋 Welcome! Please set up your company details to get started with Textile Billing Pro.</div>' : ''}
          <form id="company-form">
            <div class="form-group">
              <label class="form-label">Company Name <span class="required">*</span></label>
              <input type="text" class="form-control" id="c-name" placeholder="e.g. Sri Murugan Textiles" value="${esc(c.name || '')}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Company Address <span class="required">*</span></label>
              <textarea class="form-control" id="c-address" rows="2" placeholder="Full business address" required>${esc(c.address || '')}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Phone <span class="required">*</span></label>
                <input type="tel" class="form-control" id="c-phone" placeholder="e.g. +91 98765 43210" value="${esc(c.phone || '')}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Email <span class="required">*</span></label>
                <input type="email" class="form-control" id="c-email" placeholder="billing@company.com" value="${esc(c.email || '')}" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">GSTIN <span class="required">*</span></label>
              <input type="text" class="form-control" id="c-gstin" placeholder="e.g. 33ABCDE1234F1Z5" value="${esc(c.gstin || '')}" maxlength="15" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block btn-lg" style="margin-top:8px;">
              💾 Save Company Details
            </button>
          </form>
        </div>
      </div>
    </div>
  `;
}

/* ===== PRODUCTS ===== */
function renderProducts() {
  const products = DB.getProducts();

  const tableHtml = products.length === 0
    ? `<div class="empty-state">
        <div class="empty-icon">📦</div>
        <h4>No products yet</h4>
        <p>Add your first product to start creating bills.</p>
        <button class="btn btn-primary" id="add-product-btn">+ Add Product</button>
      </div>`
    : `<div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product Name</th>
              <th>Color</th>
              <th>Pattern</th>
              <th>Sizes & Stock</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${products.map((p, i) => {
              const sizeBadges = (p.sizes || []).map(s => {
                const stock = s.stock || 0;
                const cls = stock < 5 ? 'badge-danger' : stock < 10 ? 'badge-warning' : 'badge-success';
                return `<span class="badge ${cls}">${esc(s.size)}: ${stock}m</span>`;
              }).join(' ');
              return `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${esc(p.name)}</strong></td>
                  <td>${p.color ? esc(p.color) : '<span style="color:var(--text-light)">—</span>'}</td>
                  <td>${p.pattern ? esc(p.pattern) : '<span style="color:var(--text-light)">—</span>'}</td>
                  <td><div class="size-badges">${sizeBadges || '<span style="color:var(--text-light)">No sizes</span>'}</div></td>
                  <td>
                    <button class="btn btn-sm btn-secondary edit-product-btn" data-id="${p.id}" style="margin-right:6px;">✏️ Edit</button>
                    <button class="btn btn-sm btn-danger delete-product-btn" data-id="${p.id}">🗑 Delete</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>`;

  return `
    <div class="main-content">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div>
          <div class="page-title">Products</div>
          <div class="page-subtitle">Manage your fabric inventory</div>
        </div>
        <button class="btn btn-primary" id="add-product-btn">+ Add Product</button>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0;">
          ${tableHtml}
        </div>
      </div>
    </div>
  `;
}

/* ===== PRODUCT MODAL ===== */
function renderProductModal() {
  const isEdit = state.modalOpen === 'edit-product';
  const product = isEdit ? DB.getProducts().find(p => p.id === state.editingProductId) : null;
  const p = product || {};
  const sizes = p.sizes || [{ size: '', stock: '', rate: '' }];

  const sizeRows = sizes.map((s, i) => `
    <tr data-size-index="${i}">
      <td><input type="text" class="form-control size-name-input" placeholder="e.g. S / M / XL / Free" value="${esc(s.size || '')}"></td>
      <td><input type="number" class="form-control size-stock-input" placeholder="0" min="0" value="${s.stock !== undefined ? s.stock : ''}"></td>
      <td><input type="number" class="form-control size-rate-input" placeholder="0.00" min="0" step="0.01" value="${s.rate !== undefined ? s.rate : ''}"></td>
      <td><button type="button" class="btn btn-sm btn-danger delete-size-row-btn" data-index="${i}">✕</button></td>
    </tr>
  `).join('');

  return `
    <div class="modal-overlay" id="product-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>${isEdit ? '✏️ Edit Product' : '+ Add New Product'}</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <form id="product-form">
            <div class="form-group">
              <label class="form-label">Product Name <span class="required">*</span></label>
              <input type="text" class="form-control" id="p-name" placeholder="e.g. Cotton Saree, Silk Fabric" value="${esc(p.name || '')}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Color <span class="optional-tag">(optional)</span></label>
                <input type="text" class="form-control" id="p-color" placeholder="e.g. Red, Navy Blue" value="${esc(p.color || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Pattern <span class="optional-tag">(optional)</span></label>
                <input type="text" class="form-control" id="p-pattern" placeholder="e.g. Stripes, Floral, Plain" value="${esc(p.pattern || '')}">
              </div>
            </div>
            <div class="section-heading">Sizes, Stock & Rate</div>
            <div class="sizes-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Size Name <span class="required">*</span></th>
                    <th>Stock (meters)</th>
                    <th>Rate (₹/meter)</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody id="sizes-tbody">
                  ${sizeRows}
                </tbody>
              </table>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="add-size-row-btn" style="margin-top:10px;">+ Add Size</button>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="save-product-btn">💾 Save Product</button>
        </div>
      </div>
    </div>
  `;
}

/* ===== NEW BILL ===== */
function renderNewBill() {
  const products = DB.getProducts();
  const nextInvoiceNo = DB.getNextInvoiceNo();

  const productOptions = products.length === 0
    ? '<option value="">-- No products. Add products first --</option>'
    : '<option value="">-- Select Product --</option>' + products.map(p =>
      `<option value="${p.id}">${esc(p.name)}${p.color ? ' — ' + esc(p.color) : ''}${p.pattern ? ', ' + esc(p.pattern) : ''}</option>`
    ).join('');

  // Build items table
  let itemsTableHtml = '';
  if (state.billItems.length > 0) {
    const subtotal = state.billItems.reduce((s, i) => s + i.amount, 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;

    itemsTableHtml = `
      <div class="bill-items-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Size</th>
              <th>Qty (m)</th>
              <th>Rate (₹)</th>
              <th>Amount (₹)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.billItems.map((item, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(item.productName)}${item.color ? '<br><small style="color:var(--text-light)">' + esc(item.color) + (item.pattern ? ', ' + esc(item.pattern) : '') + '</small>' : ''}</td>
                <td>${esc(item.size)}</td>
                <td>${item.qty}</td>
                <td>${formatCurrency(item.rate)}</td>
                <td><strong>${formatCurrency(item.amount)}</strong></td>
                <td><button class="btn btn-sm btn-danger remove-item-btn" data-index="${i}">✕</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="bill-totals">
        <div class="bill-totals-inner">
          <table>
            <tr><td>Subtotal:</td><td>${formatCurrency(subtotal)}</td></tr>
            <tr><td>CGST (2.5%):</td><td>${formatCurrency(tax / 2)}</td></tr>
            <tr><td>SGST (2.5%):</td><td>${formatCurrency(tax / 2)}</td></tr>
            <tr class="total-line"><td><strong>Total:</strong></td><td><strong>${formatCurrency(total)}</strong></td></tr>
          </table>
        </div>
      </div>
    `;
  } else {
    itemsTableHtml = `<div class="empty-state" style="padding:24px;">
      <div style="font-size:2rem;opacity:0.4;">📋</div>
      <p style="margin:8px 0 0;">No items added yet. Select a product and add items above.</p>
    </div>`;
  }

  return `
    <div class="main-content">
      <div class="page-title">New Bill</div>
      <div class="page-subtitle">Create a new tax invoice</div>

      ${products.length === 0 ? '<div class="alert alert-warning">⚠️ You have no products. <button class="btn btn-sm btn-primary" data-view="products">Add Products First</button></div>' : ''}

      <div class="bill-layout">
        <!-- LEFT: Customer & Invoice Details -->
        <div>
          <div class="card">
            <div class="card-header"><h3>🧾 Invoice Details</h3></div>
            <div class="card-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Invoice No <span class="required">*</span></label>
                  <input type="text" class="form-control" id="bill-inv-no" value="${esc(nextInvoiceNo)}" placeholder="INV-001">
                </div>
                <div class="form-group">
                  <label class="form-label">Date <span class="required">*</span></label>
                  <input type="date" class="form-control" id="bill-date" value="${today()}">
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>👤 Customer Details</h3></div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">Customer Name <span class="required">*</span></label>
                <input type="text" class="form-control" id="cust-name" placeholder="Full name of customer" value="${esc(state.billCustomer.name || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Address <span class="optional-tag">(optional)</span></label>
                <textarea class="form-control" id="cust-address" rows="2" placeholder="Customer address">${esc(state.billCustomer.address || '')}</textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Phone <span class="optional-tag">(optional)</span></label>
                  <input type="tel" class="form-control" id="cust-phone" placeholder="Phone number" value="${esc(state.billCustomer.phone || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">GSTIN <span class="optional-tag">(optional)</span></label>
                  <input type="text" class="form-control" id="cust-gstin" placeholder="Customer GSTIN" value="${esc(state.billCustomer.gstin || '')}" maxlength="15">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Add Items -->
        <div>
          <div class="card">
            <div class="card-header"><h3>🛒 Add Items</h3></div>
            <div class="card-body">
              <div class="add-item-form">
                <div class="form-group">
                  <label class="form-label">Product <span class="required">*</span></label>
                  <select class="form-control" id="item-product-select">
                    ${productOptions}
                  </select>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Size <span class="required">*</span></label>
                    <select class="form-control" id="item-size-select">
                      <option value="">-- Select size --</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Quantity (meters) <span class="required">*</span></label>
                    <input type="number" class="form-control" id="item-qty" placeholder="0" min="0.01" step="0.01">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Rate (₹/meter) <span class="required">*</span></label>
                    <input type="number" class="form-control" id="item-rate" placeholder="0.00" min="0" step="0.01">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Amount (₹)</label>
                    <input type="text" class="form-control" id="item-amount" placeholder="0.00" readonly style="background:#f0f2fc;font-weight:600;color:var(--primary);">
                  </div>
                </div>
                <div id="stock-info" style="font-size:0.82rem;color:var(--text-medium);margin-bottom:10px;"></div>
                <button type="button" class="btn btn-primary btn-block" id="add-item-btn">+ Add Item to Bill</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bill Items -->
      <div class="card">
        <div class="card-header">
          <h3>📋 Bill Items (${state.billItems.length})</h3>
          ${state.billItems.length > 0 ? `<button class="btn btn-sm btn-danger" id="clear-items-btn">🗑 Clear All</button>` : ''}
        </div>
        <div class="card-body" style="padding: ${state.billItems.length > 0 ? '0' : '22px'};">
          ${itemsTableHtml}
        </div>
      </div>

      ${state.billItems.length > 0 ? `
        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:8px;">
          <button class="btn btn-secondary" data-view="home">Cancel</button>
          <button class="btn btn-gold btn-lg" id="generate-invoice-btn">🧾 Generate Invoice</button>
        </div>
      ` : ''}
    </div>
  `;
}

/* ===== INVOICE VIEW ===== */
function renderInvoiceView(invId) {
  const inv = DB.getInvoice(invId);
  if (!inv) {
    return `<div class="main-content"><div class="alert alert-danger">Invoice not found.</div></div>`;
  }

  const printHtml = generatePrintHTML(inv);
  document.getElementById('print-area').innerHTML = printHtml;

  const subtotal = inv.subtotal || inv.items.reduce((s, i) => s + i.amount, 0);
  const tax = inv.tax || subtotal * TAX_RATE;
  const total = inv.total || subtotal + tax;

  return `
    <div class="main-content">
      <div class="page-title">Invoice ${esc(inv.invoiceNo)}</div>
      <div class="page-subtitle">${formatDate(inv.date)} — ${esc(inv.customer.name)}</div>

      <div class="invoice-actions no-print">
        <button class="btn btn-gold btn-lg" id="print-invoice-btn">🖨️ Print Invoice</button>
        <button class="btn btn-primary" data-view="new-bill">📝 New Bill</button>
        <button class="btn btn-secondary" data-view="invoice-history">← Back to History</button>
      </div>

      <div class="card">
        <div class="card-header"><h3>🏢 Company & Invoice Details</h3></div>
        <div class="card-body">
          <div class="form-row">
            <div>
              <div class="section-heading">Bill To</div>
              <p><strong>${esc(inv.customer.name)}</strong></p>
              ${inv.customer.address ? `<p>${esc(inv.customer.address)}</p>` : ''}
              ${inv.customer.phone ? `<p>📞 ${esc(inv.customer.phone)}</p>` : ''}
              ${inv.customer.gstin ? `<p>GSTIN: ${esc(inv.customer.gstin)}</p>` : ''}
            </div>
            <div>
              <div class="section-heading">Invoice Details</div>
              <table style="font-size:0.9rem;">
                <tr><td style="color:var(--text-light);padding:3px 12px 3px 0;">Invoice No:</td><td><strong>${esc(inv.invoiceNo)}</strong></td></tr>
                <tr><td style="color:var(--text-light);padding:3px 12px 3px 0;">Date:</td><td>${formatDate(inv.date)}</td></tr>
                <tr><td style="color:var(--text-light);padding:3px 12px 3px 0;">HSN Code:</td><td>${HSN_CODE}</td></tr>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>📦 Items</h3></div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Size</th>
                  <th>Qty (m)</th>
                  <th>Rate (₹/m)</th>
                  <th>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${inv.items.map((item, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>
                      <strong>${esc(item.productName)}</strong>
                      ${item.color ? `<br><small style="color:var(--text-light)">${esc(item.color)}${item.pattern ? ', ' + esc(item.pattern) : ''}</small>` : ''}
                    </td>
                    <td>${esc(item.size)}</td>
                    <td>${item.qty}</td>
                    <td>${formatCurrency(item.rate)}</td>
                    <td><strong>${formatCurrency(item.amount)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="bill-totals" style="padding:16px;">
            <div class="bill-totals-inner">
              <table>
                <tr><td>Subtotal:</td><td>${formatCurrency(subtotal)}</td></tr>
                <tr><td>CGST (2.5%):</td><td>${formatCurrency(tax / 2)}</td></tr>
                <tr><td>SGST (2.5%):</td><td>${formatCurrency(tax / 2)}</td></tr>
                <tr class="total-line"><td><strong>Total:</strong></td><td><strong>${formatCurrency(total)}</strong></td></tr>
              </table>
            </div>
          </div>
          <div style="padding:0 22px 16px;">
            <div class="alert alert-info" style="margin-bottom:0;">
              <strong>Amount in Words:</strong> ${numToWords(total)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ===== INVOICE HISTORY ===== */
function renderInvoiceHistory() {
  const invoices = DB.getInvoices();

  const tableHtml = invoices.length === 0
    ? `<div class="empty-state">
        <div class="empty-icon">📋</div>
        <h4>No invoices found</h4>
        <p>Create your first bill to see invoice history.</p>
        <button class="btn btn-primary" data-view="new-bill">+ New Bill</button>
      </div>`
    : `<div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Subtotal</th>
              <th>Tax</th>
              <th>Total</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
              <tr>
                <td><span class="badge badge-info">${esc(inv.invoiceNo)}</span></td>
                <td>${formatDate(inv.date)}</td>
                <td><strong>${esc(inv.customer.name)}</strong>${inv.customer.phone ? '<br><small style="color:var(--text-light)">'+esc(inv.customer.phone)+'</small>' : ''}</td>
                <td>${(inv.items || []).length}</td>
                <td>${formatCurrency(inv.subtotal)}</td>
                <td>${formatCurrency(inv.tax)}</td>
                <td><strong>${formatCurrency(inv.total)}</strong></td>
                <td>
                  <button class="btn btn-sm btn-secondary view-invoice-btn" data-id="${inv.id}">👁 View</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

  const totalRevenue = invoices.reduce((s, i) => s + (i.total || 0), 0);

  return `
    <div class="main-content">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div>
          <div class="page-title">Invoice History</div>
          <div class="page-subtitle">All invoices — Total Revenue: <strong>${formatCurrency(totalRevenue)}</strong></div>
        </div>
        <button class="btn btn-primary" data-view="new-bill">+ New Bill</button>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0;">
          ${tableHtml}
        </div>
      </div>
    </div>
  `;
}

/* ===== PRINT HTML ===== */
function generatePrintHTML(inv) {
  const company = DB.getCompany();
  const subtotal = inv.subtotal || inv.items.reduce((s, i) => s + i.amount, 0);
  const tax = inv.tax || subtotal * TAX_RATE;
  const total = inv.total || subtotal + tax;

  return `
  <div class="invoice-print">
    <div class="invoice-header">
      <div class="company-name">${esc(company.name)}</div>
      <div class="company-address">${esc(company.address)}</div>
      <div>Phone: ${esc(company.phone)} | Email: ${esc(company.email)}</div>
      <div>GSTIN: ${esc(company.gstin)}</div>
    </div>
    <div class="invoice-title">TAX INVOICE</div>
    <div class="invoice-meta">
      <div class="meta-left">
        <strong>Bill To:</strong><br>
        ${esc(inv.customer.name)}<br>
        ${inv.customer.address ? esc(inv.customer.address) + '<br>' : ''}
        ${inv.customer.phone ? 'Ph: ' + esc(inv.customer.phone) + '<br>' : ''}
        ${inv.customer.gstin ? 'GSTIN: ' + esc(inv.customer.gstin) : ''}
      </div>
      <div class="meta-right">
        <table>
          <tr><td>Invoice No:</td><td><strong>${esc(inv.invoiceNo)}</strong></td></tr>
          <tr><td>Date:</td><td>${formatDate(inv.date)}</td></tr>
          <tr><td>HSN Code:</td><td>${HSN_CODE}</td></tr>
        </table>
      </div>
    </div>
    <table class="invoice-table">
      <thead>
        <tr>
          <th>S.No</th>
          <th>Description</th>
          <th>Size</th>
          <th>Qty (Mtrs)</th>
          <th>Rate (₹/Mtr)</th>
          <th>Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${inv.items.map((item, i) => `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${esc(item.productName)}${item.color ? ' &mdash; ' + esc(item.color) : ''}${item.pattern ? ', ' + esc(item.pattern) : ''}</td>
          <td style="text-align:center;">${esc(item.size)}</td>
          <td style="text-align:right;">${item.qty}</td>
          <td style="text-align:right;">${Number(item.rate).toFixed(2)}</td>
          <td style="text-align:right;">${Number(item.amount).toFixed(2)}</td>
        </tr>`).join('')}
        ${Array(Math.max(0, 8 - inv.items.length)).fill('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}
      </tbody>
    </table>
    <div class="invoice-summary">
      <table>
        <tr><td>Subtotal:</td><td>${formatCurrency(subtotal)}</td></tr>
        <tr><td>CGST (2.5%):</td><td>${formatCurrency(tax / 2)}</td></tr>
        <tr><td>SGST (2.5%):</td><td>${formatCurrency(tax / 2)}</td></tr>
        <tr class="total-row"><td><strong>Total:</strong></td><td><strong>${formatCurrency(total)}</strong></td></tr>
      </table>
    </div>
    <div class="amount-words-box">
      <strong>Amount in Words:</strong> ${numToWords(total)}
    </div>
    <div class="invoice-footer">
      <div class="terms">
        <strong>Terms &amp; Conditions:</strong><br>
        1. Goods once sold will not be taken back.<br>
        2. Interest @18% p.a. will be charged on overdue payments.<br>
        3. Subject to local jurisdiction.
      </div>
      <div class="signature">
        <div style="border-top:1.5px solid #000;margin-top:48px;padding-top:6px;text-align:center;">
          For ${esc(company.name)}<br><br>
          Authorized Signatory
        </div>
      </div>
    </div>
  </div>`;
}

/* ===== ADD SIZE ROW ===== */
function addSizeRow() {
  const tbody = document.getElementById('sizes-tbody');
  if (!tbody) return;
  const idx = tbody.querySelectorAll('tr').length;
  const tr = document.createElement('tr');
  tr.setAttribute('data-size-index', idx);
  tr.innerHTML = `
    <td><input type="text" class="form-control size-name-input" placeholder="e.g. S / M / XL / Free"></td>
    <td><input type="number" class="form-control size-stock-input" placeholder="0" min="0"></td>
    <td><input type="number" class="form-control size-rate-input" placeholder="0.00" min="0" step="0.01"></td>
    <td><button type="button" class="btn btn-sm btn-danger delete-size-row-btn" data-index="${idx}">✕</button></td>
  `;
  tbody.appendChild(tr);
}

/* ===== COLLECT SIZE DATA ===== */
function collectSizeData() {
  const rows = document.querySelectorAll('#sizes-tbody tr');
  const sizes = [];
  rows.forEach(row => {
    const name = row.querySelector('.size-name-input').value.trim();
    const stock = parseFloat(row.querySelector('.size-stock-input').value) || 0;
    const rate = parseFloat(row.querySelector('.size-rate-input').value) || 0;
    if (name) {
      sizes.push({ size: name, stock, rate });
    }
  });
  return sizes;
}

/* ===== SAVE BILL CUSTOMER STATE ===== */
function saveBillCustomerState() {
  const custName = document.getElementById('cust-name');
  const custAddr = document.getElementById('cust-address');
  const custPhone = document.getElementById('cust-phone');
  const custGstin = document.getElementById('cust-gstin');
  if (custName) state.billCustomer.name = custName.value;
  if (custAddr) state.billCustomer.address = custAddr.value;
  if (custPhone) state.billCustomer.phone = custPhone.value;
  if (custGstin) state.billCustomer.gstin = custGstin.value;
}

/* ===== POPULATE SIZE DROPDOWN ===== */
function populateSizeDropdown(productId) {
  const sizeSelect = document.getElementById('item-size-select');
  const rateInput = document.getElementById('item-rate');
  const stockInfo = document.getElementById('stock-info');
  if (!sizeSelect) return;

  sizeSelect.innerHTML = '<option value="">-- Select size --</option>';
  if (rateInput) rateInput.value = '';
  if (stockInfo) stockInfo.innerHTML = '';

  if (!productId) return;

  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product || !product.sizes || product.sizes.length === 0) {
    sizeSelect.innerHTML = '<option value="">-- No sizes defined --</option>';
    return;
  }

  state.currentProductSizes = product.sizes;

  product.sizes.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.size;
    opt.textContent = `${s.size} — Stock: ${s.stock || 0}m @ ₹${s.rate || 0}/m`;
    opt.dataset.rate = s.rate || 0;
    opt.dataset.stock = s.stock || 0;
    sizeSelect.appendChild(opt);
  });
}

/* ===== UPDATE AMOUNT ===== */
function updateItemAmount() {
  const qty = parseFloat(document.getElementById('item-qty')?.value) || 0;
  const rate = parseFloat(document.getElementById('item-rate')?.value) || 0;
  const amountEl = document.getElementById('item-amount');
  if (amountEl) {
    amountEl.value = qty > 0 && rate > 0 ? (qty * rate).toFixed(2) : '';
  }
}

/* ===== ATTACH LISTENERS ===== */
function attachListeners() {

  /* --- Nav Logo --- */
  const logo = document.getElementById('nav-logo-btn');
  if (logo) {
    logo.addEventListener('click', () => {
      state.view = 'home';
      render();
    });
  }

  /* --- Nav Links --- */
  document.querySelectorAll('.nav-link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'new-bill' && state.view !== 'new-bill') {
        // preserve billItems but reset customer
        state.billCustomer = {};
      }
      state.view = view;
      state.modalOpen = null;
      render();
    });
  });

  /* --- Data-view buttons (anywhere) --- */
  document.querySelectorAll('[data-view]').forEach(btn => {
    if (!btn.classList.contains('nav-link-btn')) {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'new-bill' && state.view !== 'new-bill') {
          state.billCustomer = {};
        }
        state.view = view;
        state.modalOpen = null;
        render();
      });
    }
  });

  /* --- Company Form --- */
  const companyForm = document.getElementById('company-form');
  if (companyForm) {
    companyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('c-name').value.trim();
      const address = document.getElementById('c-address').value.trim();
      const phone = document.getElementById('c-phone').value.trim();
      const email = document.getElementById('c-email').value.trim();
      const gstin = document.getElementById('c-gstin').value.trim();

      if (!name || !address || !phone || !email || !gstin) {
        showToast('All fields are required!', 'error');
        return;
      }

      DB.setCompany({ name, address, phone, email, gstin });
      showToast('Company details saved!', 'success');
      state.view = 'home';
      render();
    });
  }

  /* --- Edit Company Button --- */
  const editCompanyBtn = document.getElementById('edit-company-btn');
  if (editCompanyBtn) {
    editCompanyBtn.addEventListener('click', () => {
      state.view = 'setup';
      render();
    });
  }

  /* --- Add Product Button --- */
  const addProductBtn = document.getElementById('add-product-btn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
      state.modalOpen = 'add-product';
      state.editingProductId = null;
      render();
    });
  }

  /* --- Edit Product Buttons --- */
  document.querySelectorAll('.edit-product-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.modalOpen = 'edit-product';
      state.editingProductId = btn.dataset.id;
      render();
    });
  });

  /* --- Delete Product Buttons --- */
  document.querySelectorAll('.delete-product-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this product? This cannot be undone.')) {
        DB.deleteProduct(btn.dataset.id);
        showToast('Product deleted.', 'warning');
        render();
      }
    });
  });

  /* --- Modal Close/Cancel --- */
  const modalCloseBtn = document.getElementById('modal-close-btn');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
      state.modalOpen = null;
      render();
    });
  }

  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', () => {
      state.modalOpen = null;
      render();
    });
  }

  const modalOverlay = document.getElementById('product-modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        state.modalOpen = null;
        render();
      }
    });
  }

  /* --- Add Size Row --- */
  const addSizeRowBtn = document.getElementById('add-size-row-btn');
  if (addSizeRowBtn) {
    addSizeRowBtn.addEventListener('click', addSizeRow);
  }

  /* --- Delete Size Row --- */
  document.querySelectorAll('.delete-size-row-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      if (row) row.remove();
    });
  });

  /* --- Save Product Button --- */
  const saveProductBtn = document.getElementById('save-product-btn');
  if (saveProductBtn) {
    saveProductBtn.addEventListener('click', () => {
      const name = document.getElementById('p-name').value.trim();
      const color = document.getElementById('p-color').value.trim();
      const pattern = document.getElementById('p-pattern').value.trim();
      const sizes = collectSizeData();

      if (!name) {
        showToast('Product name is required!', 'error');
        return;
      }

      if (state.modalOpen === 'edit-product' && state.editingProductId) {
        DB.updateProduct(state.editingProductId, { name, color, pattern, sizes });
        showToast('Product updated!', 'success');
      } else {
        DB.addProduct({ id: uid(), name, color, pattern, sizes, createdAt: Date.now() });
        showToast('Product added!', 'success');
      }

      state.modalOpen = null;
      render();
    });
  }

  /* --- Bill: Product Select --- */
  const itemProductSelect = document.getElementById('item-product-select');
  if (itemProductSelect) {
    itemProductSelect.addEventListener('change', () => {
      const productId = itemProductSelect.value;
      populateSizeDropdown(productId);
      const rateInput = document.getElementById('item-rate');
      const amountInput = document.getElementById('item-amount');
      if (rateInput) rateInput.value = '';
      if (amountInput) amountInput.value = '';
    });
  }

  /* --- Bill: Size Select --- */
  const itemSizeSelect = document.getElementById('item-size-select');
  if (itemSizeSelect) {
    itemSizeSelect.addEventListener('change', () => {
      const opt = itemSizeSelect.options[itemSizeSelect.selectedIndex];
      const rateInput = document.getElementById('item-rate');
      const stockInfo = document.getElementById('stock-info');

      if (opt && opt.dataset.rate) {
        if (rateInput) rateInput.value = opt.dataset.rate;
        const stock = parseFloat(opt.dataset.stock) || 0;
        if (stockInfo) {
          if (stock < 5) {
            stockInfo.innerHTML = `<span class="badge badge-danger">⚠️ Low Stock: ${stock}m available</span>`;
          } else {
            stockInfo.innerHTML = `<span class="badge badge-success">✓ In Stock: ${stock}m available</span>`;
          }
        }
      } else {
        if (stockInfo) stockInfo.innerHTML = '';
        if (rateInput) rateInput.value = '';
      }

      updateItemAmount();
    });
  }

  /* --- Bill: Qty / Rate Input --- */
  const itemQty = document.getElementById('item-qty');
  const itemRate = document.getElementById('item-rate');
  if (itemQty) itemQty.addEventListener('input', updateItemAmount);
  if (itemRate) itemRate.addEventListener('input', updateItemAmount);

  /* --- Add Item to Bill --- */
  const addItemBtn = document.getElementById('add-item-btn');
  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
      saveBillCustomerState();

      const productSelect = document.getElementById('item-product-select');
      const sizeSelect = document.getElementById('item-size-select');
      const qtyEl = document.getElementById('item-qty');
      const rateEl = document.getElementById('item-rate');

      const productId = productSelect ? productSelect.value : '';
      const sizeName = sizeSelect ? sizeSelect.value : '';
      const qty = parseFloat(qtyEl ? qtyEl.value : '') || 0;
      const rate = parseFloat(rateEl ? rateEl.value : '') || 0;

      if (!productId) { showToast('Please select a product.', 'error'); return; }
      if (!sizeName) { showToast('Please select a size.', 'error'); return; }
      if (qty <= 0) { showToast('Please enter a valid quantity.', 'error'); return; }
      if (rate <= 0) { showToast('Please enter a valid rate.', 'error'); return; }

      const products = DB.getProducts();
      const product = products.find(p => p.id === productId);
      if (!product) { showToast('Product not found.', 'error'); return; }

      const sizeObj = product.sizes.find(s => s.size === sizeName);
      if (!sizeObj) { showToast('Size not found.', 'error'); return; }

      const availableStock = sizeObj.stock || 0;
      if (availableStock < qty) {
        showToast(`Insufficient stock! Only ${availableStock}m available for this size.`, 'error');
        return;
      }

      const amount = parseFloat((qty * rate).toFixed(2));

      state.billItems.push({
        id: uid(),
        productId: product.id,
        productName: product.name,
        color: product.color || '',
        pattern: product.pattern || '',
        size: sizeName,
        qty,
        rate,
        amount,
      });

      showToast('Item added to bill!', 'success');
      render();
    });
  }

  /* --- Remove Bill Item --- */
  document.querySelectorAll('.remove-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveBillCustomerState();
      const idx = parseInt(btn.dataset.index);
      state.billItems.splice(idx, 1);
      render();
    });
  });

  /* --- Clear All Items --- */
  const clearItemsBtn = document.getElementById('clear-items-btn');
  if (clearItemsBtn) {
    clearItemsBtn.addEventListener('click', () => {
      if (confirm('Clear all bill items?')) {
        state.billItems = [];
        render();
      }
    });
  }

  /* --- Generate Invoice --- */
  const generateInvoiceBtn = document.getElementById('generate-invoice-btn');
  if (generateInvoiceBtn) {
    generateInvoiceBtn.addEventListener('click', () => {
      // Save current customer fields
      const custName = document.getElementById('cust-name')?.value.trim() || '';
      const custAddress = document.getElementById('cust-address')?.value.trim() || '';
      const custPhone = document.getElementById('cust-phone')?.value.trim() || '';
      const custGstin = document.getElementById('cust-gstin')?.value.trim() || '';
      const invoiceNo = document.getElementById('bill-inv-no')?.value.trim() || DB.getNextInvoiceNo();
      const date = document.getElementById('bill-date')?.value || today();

      if (!custName) { showToast('Customer name is required!', 'error'); document.getElementById('cust-name')?.focus(); return; }
      if (state.billItems.length === 0) { showToast('Please add at least one item.', 'error'); return; }

      const subtotal = state.billItems.reduce((s, i) => s + i.amount, 0);
      const tax = parseFloat((subtotal * TAX_RATE).toFixed(2));
      const total = parseFloat((subtotal + tax).toFixed(2));

      const inv = {
        id: uid(),
        invoiceNo,
        date,
        customer: { name: custName, address: custAddress, phone: custPhone, gstin: custGstin },
        items: state.billItems.map(i => ({ ...i })),
        subtotal: parseFloat(subtotal.toFixed(2)),
        tax,
        total,
        createdAt: Date.now(),
      };

      // Save invoice
      DB.addInvoice(inv);

      // Reduce stock
      inv.items.forEach(item => {
        DB.reduceStock(item.productId, item.size, item.qty);
      });

      // Clear bill
      state.billItems = [];
      state.billCustomer = {};

      showToast('Invoice generated successfully!', 'success');

      state.viewingInvoiceId = inv.id;
      state.view = 'view-invoice';
      render();
    });
  }

  /* --- Print Invoice --- */
  const printInvoiceBtn = document.getElementById('print-invoice-btn');
  if (printInvoiceBtn) {
    printInvoiceBtn.addEventListener('click', () => {
      window.print();
    });
  }

  /* --- View Invoice from table --- */
  document.querySelectorAll('.view-invoice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewingInvoiceId = btn.dataset.id;
      state.view = 'view-invoice';
      render();
    });
  });
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  render();
});
