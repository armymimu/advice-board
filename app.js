// ==========================================
// State Management
// ==========================================
let products = [];
let currentCategory = 'iphone';
let searchQuery = '';
let sortBy = 'price_desc';
let categoryProfits = {
  iphone: 1000,
  ipad: 1000,
  macbook: 1000,
  android: 1000
};
let lastUpdateDate = null;
let isFetching = false;
let isStale = false;

const formatMoney = (amount) => new Intl.NumberFormat('th-TH').format(amount);

// ==========================================
// Initialization & LocalStorage
// ==========================================
function init() {
  const savedProfits = localStorage.getItem('advice_board_profits_v5');
  if (savedProfits) {
    try {
      categoryProfits = { ...categoryProfits, ...JSON.parse(savedProfits) };
    } catch(e) {}
  }

  setupEventListeners();
  requestAnimationFrame(() => updateTabIndicator());
  updateProfitUI();
  
  // Fetch initial data
  fetchData(currentCategory);
}

function updateProfitUI() {
  const labels = { iphone: 'iPhone', ipad: 'iPad', macbook: 'Mac', android: 'Android' };
  document.getElementById('profit-label').textContent = `กำไรตั้งต้น (${labels[currentCategory] || currentCategory})`;
  document.getElementById('global-profit').value = categoryProfits[currentCategory] || 1000;
}

// ==========================================
// Data Fetching (Real-time Advice API)
// ==========================================
async function fetchData(category, forceRefresh = false) {
  if (isFetching) return;
  isFetching = true;
  
  const container = document.getElementById('product-container');
  const syncTimeEl = document.getElementById('sync-time');
  const syncBadgeEl = document.getElementById('sync-badge');
  const noticeBar = document.querySelector('.notice-bar');
  
  // Only show full spinner if no data exists yet
  if (products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="spinner" viewBox="0 0 50 50" width="32" height="32" stroke="var(--accent)" stroke-width="4" fill="none" stroke-linecap="round">
          <circle cx="25" cy="25" r="20"></circle>
        </svg>
        <p style="margin-top: 16px;">กำลังตรวจสอบราคาล่าสุดจาก Advice...</p>
      </div>
    `;
  }
  
  syncTimeEl.textContent = 'กำลังดึงข้อมูล...';
  syncBadgeEl.textContent = 'กำลังอัปเดต';
  noticeBar.classList.remove('stale');
  
  try {
    // URL relative to the same host
    const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
    const url = `${baseUrl}/api/prices/${category}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) throw new Error(data.error);
    
    products = data.items || [];
    isStale = data.stale === true;
    lastUpdateDate = new Date();
    
    updateSyncStatus(true);
    render();
    
    if (forceRefresh) showToast('อัปเดตข้อมูลจาก Advice สำเร็จ');
    
  } catch (error) {
    console.error('Fetch error:', error);
    isStale = true; // Mark as stale since we failed to fetch fresh data
    updateSyncStatus(false, error.message);
    
    if (products.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="32" height="32" stroke="var(--text-tertiary)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <p style="margin-top: 16px;">เชื่อมต่อ Advice ไม่สำเร็จ: ${error.message}</p>
        </div>
      `;
    } else {
      render(); // Render whatever old data we might have with a stale warning
      showToast('ไม่สามารถเชื่อมต่อ Advice ได้ ใช้ข้อมูลเก่า');
    }
  } finally {
    isFetching = false;
  }
}

function updateSyncStatus(success, errorMsg = '') {
  const syncTimeEl = document.getElementById('sync-time');
  const syncBadgeEl = document.getElementById('sync-badge');
  const noticeBar = document.querySelector('.notice-bar');
  
  if (isStale) {
    noticeBar.classList.add('stale');
    syncBadgeEl.textContent = 'ข้อมูลเก่า';
    syncBadgeEl.style.backgroundColor = 'var(--warning)';
    syncBadgeEl.style.color = '#FFF';
    
    let timeStr = lastUpdateDate ? `ตรวจสอบล่าสุด ${lastUpdateDate.toLocaleTimeString('th-TH')}` : 'ไม่มีข้อมูลอ้างอิง';
    syncTimeEl.textContent = errorMsg ? `${timeStr} (Error: ${errorMsg})` : `${timeStr} - ตรวจสอบราคาก่อนขาย`;
  } else {
    noticeBar.classList.remove('stale');
    syncBadgeEl.textContent = 'ข้อมูลสด';
    syncBadgeEl.style.backgroundColor = 'var(--accent-tint)';
    syncBadgeEl.style.color = 'var(--accent)';
    syncTimeEl.textContent = lastUpdateDate ? `อัปเดตล่าสุด ${lastUpdateDate.toLocaleTimeString('th-TH')}` : '';
  }
}

// ==========================================
// Toast Notification
// ==========================================
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400); 
  }, 2500);
}

// ==========================================
// Calculation Logic
// ==========================================
function calculatePrice(product) {
  const advicePrice = parseInt(product.price) || 0;
  const currentProfit = categoryProfits[currentCategory] || 0;
  const sellingPrice = advicePrice + currentProfit;
  
  return { 
    advicePrice, 
    profit: currentProfit, 
    sellingPrice
  };
}

// ==========================================
// Rendering Logic
// ==========================================
function render() {
  const container = document.getElementById('product-container');
  if (products.length === 0 && isFetching) return; // Let the spinner spin
  
  // 1. Filter
  let filtered = products;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p => 
      (p.model || '').toLowerCase().includes(q) || 
      (p.spec || '').toLowerCase().includes(q) || 
      (p.modelCode || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">ไม่พบข้อมูลที่ตรงกับการค้นหา</div>`;
    return;
  }

  // 2. Group
  const groups = {};
  filtered.forEach(p => {
    // If no model provided, fallback
    const groupName = p.model || 'อื่นๆ';
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(p);
  });

  // 3. Sort Items in Groups
  Object.keys(groups).forEach(groupName => {
    groups[groupName].sort((a, b) => {
      if (sortBy === 'name') return (a.spec || '').localeCompare(b.spec || '');
      const priceA = calculatePrice(a).sellingPrice;
      const priceB = calculatePrice(b).sellingPrice;
      return sortBy === 'price_asc' ? priceA - priceB : priceB - priceA;
    });
  });

  // 4. Sort Groups
  const sortedGroupKeys = Object.keys(groups).sort((gA, gB) => {
    if (sortBy === 'name') return gA.localeCompare(gB);
    const pA = calculatePrice(groups[gA][0]).sellingPrice;
    const pB = calculatePrice(groups[gB][0]).sellingPrice;
    return sortBy === 'price_asc' ? pA - pB : pB - pA;
  });

  // 5. Render HTML
  let html = '';
  sortedGroupKeys.forEach((groupName, index) => {
    const items = groups[groupName];
    const paddingStyle = items.length === 1 ? 'padding-bottom: 16px;' : '';
    
    html += `
      <div class="accordion open" style="animation-delay: ${index * 0.05}s">
        <button class="accordion-summary" onclick="toggleAccordion(this)" aria-expanded="true" aria-label="กลุ่ม ${escapeHTML(groupName)}">
          <div class="group-info">
            <span class="group-title">${escapeHTML(groupName)}</span>
            <span class="group-count">${items.length} รายการ</span>
          </div>
          <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 9l-7 7-7-7"></path></svg>
        </button>
        <div class="accordion-divider"></div>
        <div class="accordion-content-wrapper">
          <div class="accordion-content">
            <div class="table-wrapper" style="${paddingStyle}">
              <table class="data-table">
                <colgroup>
                  <col class="col-product">
                  <col class="col-code">
                  <col class="col-advice-price">
                  <col class="col-profit">
                  <col class="col-selling-price">
                </colgroup>
                <thead>
                  <tr>
                    <th>รุ่น / สเปก</th>
                    <th>รหัสสินค้า</th>
                    <th class="text-right" title="ราคาอ้างอิงจากเว็บ Advice ปัจจุบัน">ราคา Advice</th>
                    <th class="text-right">กำไรต่อเครื่อง</th>
                    <th class="text-right">ราคาขายสุทธิ</th>
                  </tr>
                </thead>
                <tbody>
    `;

    items.forEach(item => {
      const calc = calculatePrice(item);
      
      let priceDisplay = `฿${formatMoney(calc.sellingPrice)}`;
      
      if (!item.inStock) {
        priceDisplay = `<span class="out-of-stock">หมดสินค้า</span>`;
      }

      html += `
        <tr>
          <td>
            <div class="cell-product">
              <span class="fw-500">
                ${item.url 
                  ? `<a href="${escapeHTML(item.url)}" target="_blank" class="btn-link" style="padding:0;" title="เปิดดูสินค้าบนเว็บ Advice">
                       ${escapeHTML(item.model)}
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path></svg>
                     </a>`
                  : escapeHTML(item.model)
                }
              </span>
              <span class="text-sm text-muted">${escapeHTML(item.spec)}</span>
            </div>
          </td>
          <td class="text-muted"><span class="mobile-label">รหัส: </span>${escapeHTML(item.modelCode || '-')}</td>
          <td class="cell-price text-right">
            <span class="mobile-label">ราคา Advice: </span>
            ฿${formatMoney(calc.advicePrice)}
          </td>
          <td class="cell-price text-right">
            <span class="mobile-label">กำไร: </span>
            <span class="status-badge" title="บวกกำไรแล้ว"></span>฿${formatMoney(calc.profit)}
          </td>
          <td class="cell-price text-right">
            <span class="mobile-label">ราคาขาย: </span>
            <span class="price-highlight">${priceDisplay}</span>
          </td>
        </tr>
      `;
    });

    html += `
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])
  );
}

// ==========================================
// Event Listeners & Interactions
// ==========================================
function setupEventListeners() {
  // Category-based Profit Setup
  const globalProfitInput = document.getElementById('global-profit');
  globalProfitInput.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 0) val = 0;
    categoryProfits[currentCategory] = val;
    localStorage.setItem('advice_board_profits_v5', JSON.stringify(categoryProfits));
    
    // Render without delay for instant feedback
    render();
  });

  // Segmented Control (Tabs)
  const tabs = document.querySelectorAll('.segment');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      
      const newCategory = tab.dataset.category;
      updateTabIndicator();
      
      if (newCategory !== currentCategory) {
        currentCategory = newCategory;
        updateProfitUI();
        products = []; // Clear for loading state
        render();
        // Fetch new category data
        fetchData(currentCategory);
      }
    });
  });

  // Sync Button
  document.getElementById('btn-sync').addEventListener('click', () => {
    fetchData(currentCategory, true);
  });

  // Search
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search');
  
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    clearBtn.hidden = searchQuery.length === 0;
    render();
  });
  
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearBtn.hidden = true;
    searchInput.focus();
    render();
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', (e) => {
    sortBy = e.target.value;
    render();
  });

  // Reset Profit
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('ล้างค่าการตั้งค่ากำไรและคืนค่ากลับเป็น 1,000 บาทในทุกหมวดหมู่?')) {
      localStorage.removeItem('advice_board_profits_v5');
      categoryProfits = { iphone: 1000, ipad: 1000, macbook: 1000, android: 1000 };
      updateProfitUI();
      render();
      showToast('คืนค่าเริ่มต้นสำเร็จ');
    }
  });

  window.addEventListener('resize', () => {
    requestAnimationFrame(updateTabIndicator);
  });
}

function updateTabIndicator() {
  const activeTab = document.querySelector('.segment.active');
  const indicator = document.getElementById('tab-indicator');
  if (activeTab && indicator) {
    indicator.style.width = `${activeTab.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeTab.offsetLeft - 4}px)`; 
  }
}

// ==========================================
// UI Helpers
// ==========================================
window.toggleAccordion = function(btn) {
  const accordion = btn.closest('.accordion');
  const isOpen = accordion.classList.contains('open');
  
  if (isOpen) {
    accordion.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  } else {
    accordion.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
};

// Start app
init();


// ==========================================
// Copy Functionality
// ==========================================
window.copyIndividualPrice = function(model, price) {
  const text = `${model}\nราคา: ฿${formatMoney(price)}`;
  navigator.clipboard.writeText(text).then(() => {
    alert('คัดลอกราคาเรียบร้อยแล้ว');
  }).catch(err => {
    console.error('Failed to copy', err);
    alert('ไม่สามารถคัดลอกได้');
  });
};

document.getElementById('btn-copy-all')?.addEventListener('click', () => {
  if (products.length === 0) {
    alert('ไม่มีข้อมูลให้คัดลอก');
    return;
  }
  
  // Filter products matching current search & sort
  let textToCopy = 'รายการราคา ' + document.getElementById('profit-label').innerText.replace(' (บาท):', '') + '\n\n';
  
  const filteredProducts = products.filter(p => {
    const q = searchQuery.toLowerCase();
    return p.model.toLowerCase().includes(q) || (p.spec && p.spec.toLowerCase().includes(q));
  });
  
  filteredProducts.forEach(p => {
    const profit = categoryProfits[currentCategory] || 0;
    const finalPrice = p.price + profit;
    textToCopy += `- ${p.model}\n  ราคา: ฿${formatMoney(finalPrice)}\n`;
  });
  
  navigator.clipboard.writeText(textToCopy).then(() => {
    alert('คัดลอกราคาทั้งหมด (' + filteredProducts.length + ' รายการ) เรียบร้อยแล้ว');
  }).catch(err => {
    console.error('Failed to copy', err);
    alert('ไม่สามารถคัดลอกได้');
  });
});
