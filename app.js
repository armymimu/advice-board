const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

let products = [];
let currentCategory = 'iphone';
let searchQuery = '';
let globalProfit = 1000;
let lastUpdateDate = null;
let isFetching = false;
let allCategoriesCache = {}; // category -> data

// DOM Elements
const categoryTabs = document.querySelectorAll('.tab-btn');
const searchInput = document.getElementById('search-input');
const profitInput = document.getElementById('global-profit');
const productsGrid = document.getElementById('products-grid');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const statusBar = document.getElementById('status-bar');
const btnCopyVisible = document.getElementById('btn-copy-visible');
const btnCopyAll = document.getElementById('btn-copy-all');

const formatMoney = (amount) => new Intl.NumberFormat('th-TH').format(amount);

// ==========================================
// Initialization
// ==========================================
function init() {
  const savedProfit = localStorage.getItem('advice_board_global_profit');
  if (savedProfit) {
    globalProfit = parseInt(savedProfit, 10);
    profitInput.value = globalProfit;
  }

  categoryTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      categoryTabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentCategory = e.target.dataset.cat;
      fetchData(currentCategory);
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderProducts();
  });

  profitInput.addEventListener('input', (e) => {
    globalProfit = parseInt(e.target.value, 10) || 0;
    localStorage.setItem('advice_board_global_profit', globalProfit);
    renderProducts();
  });

  btnCopyVisible.addEventListener('click', copyVisibleProducts);
  btnCopyAll.addEventListener('click', copyAllProducts);

  fetchData(currentCategory);
}

// ==========================================
// Parsing & Grouping
// ==========================================
function parseProduct(p) {
  let name = p.model;
  let cleanName = name.replace(/^Apple\s+/i, '');
  cleanName = cleanName.replace(/Smartphone\s+/i, '');
  cleanName = cleanName.replace(/\s*\([^)]+\)$/, ''); 
  
  let capacity = 'N/A';
  const capRegex = /\\b(\\d+(GB|TB))\\b|\\b(\\d+\\/\\d+(GB|TB))\\b|\\(\\d+\\+\\d+(GB|TB)\\)/i;
  const capMatch = cleanName.match(capRegex);
  
  let color = 'Standard';
  
  if (capMatch) {
    capacity = capMatch[0].toUpperCase();
    cleanName = cleanName.replace(capMatch[0], '');
    
    const originalCapMatch = name.match(capRegex);
    if (originalCapMatch) {
       const index = originalCapMatch.index + originalCapMatch[0].length;
       const afterCap = name.substring(index).replace(/\\s*\\([^)]+\\)$/, '').replace(/^\\s*-\\s*/, '').trim();
       if (afterCap.length > 0 && !afterCap.includes(')')) {
         color = afterCap;
         cleanName = cleanName.replace(afterCap, '');
       }
    }
  } else if (cleanName.includes(' - ')) {
    const parts = cleanName.split(' - ');
    color = parts.pop().trim();
    cleanName = parts.join(' - ');
  }
  
  let series = cleanName.trim().replace(/\\s*[-/]+\\s*$/, '').replace(/\\s+/g, ' ');
  return { series, capacity, color, price: p.price, origPrice: p.price, modelCode: p.modelCode };
}

function groupProducts(items) {
  const grouped = {};
  items.forEach(item => {
    const p = parseProduct(item);
    if (!grouped[p.series]) grouped[p.series] = {};
    if (!grouped[p.series][p.capacity]) grouped[p.series][p.capacity] = [];
    grouped[p.series][p.capacity].push(p);
  });
  
  // Sort and deduplicate
  const result = [];
  Object.keys(grouped).sort().forEach(series => {
    const capacities = [];
    Object.keys(grouped[series]).sort(sortCapacities).forEach(cap => {
      const colors = grouped[series][cap];
      // Check if all colors have same price
      const prices = [...new Set(colors.map(c => c.price))];
      
      if (prices.length === 1) {
        capacities.push({
          capacity: cap,
          price: prices[0],
          colors: colors.map(c => c.color).join(', '),
          multiplePrices: false,
          items: colors
        });
      } else {
        // Group by price
        const priceGroups = {};
        colors.forEach(c => {
          if(!priceGroups[c.price]) priceGroups[c.price] = [];
          priceGroups[c.price].push(c.color);
        });
        
        Object.keys(priceGroups).sort((a,b)=>a-b).forEach(pr => {
          capacities.push({
            capacity: cap,
            price: parseInt(pr),
            colors: priceGroups[pr].join(', '),
            multiplePrices: true,
            items: colors.filter(c => c.price == pr)
          });
        });
      }
    });
    result.push({ series, capacities });
  });
  return result;
}

function sortCapacities(a, b) {
  const parseVal = (str) => {
    if (str.includes('TB')) return parseFloat(str) * 1024;
    if (str.includes('GB')) return parseFloat(str.match(/\\d+/)[0]);
    return 0;
  };
  return parseVal(a) - parseVal(b);
}

// ==========================================
// Data Fetching
// ==========================================
async function fetchData(category) {
  try {
    isFetching = true;
    updateStatus('กำลังดึงข้อมูล...');
    productsGrid.style.display = 'none';
    loadingState.style.display = 'block';
    errorState.style.display = 'none';

    const url = \`\${baseUrl}/api/prices/\${category}\`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) throw new Error(data.error);

    products = data.items || [];
    allCategoriesCache[category] = products;
    
    lastUpdateDate = data.fetchedAt ? new Date(data.fetchedAt) : new Date();
    const stale = data.stale;
    
    if (stale) {
      updateStatus('ข้อมูลเก่า (' + formatTime(lastUpdateDate) + ')', 'warning');
    } else {
      updateStatus('ข้อมูลล่าสุด (' + formatTime(lastUpdateDate) + ')', 'success');
    }

    loadingState.style.display = 'none';
    productsGrid.style.display = 'block';
    renderProducts();

  } catch (error) {
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    errorState.innerHTML = \`
      <div style="font-size: 32px; margin-bottom: 16px;"><i class="fas fa-exclamation-triangle"></i></div>
      <h3>อัปเดตไม่สำเร็จ</h3>
      <p>\${error.message}</p>
      <button class="btn-primary" style="margin: 16px auto 0;" onclick="fetchData('\${category}')">ลองใหม่</button>
    \`;
    updateStatus('อัปเดตไม่สำเร็จ', 'error');
  } finally {
    isFetching = false;
  }
}

function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function updateStatus(text, type = '') {
  let icon = 'fa-sync fa-spin';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'warning') icon = 'fa-clock';
  if (type === 'error') icon = 'fa-exclamation-circle';
  
  statusBar.innerHTML = \`<div class="status-pill \${type}"><i class="fas \${icon}"></i> \${text}</div>\`;
}

// ==========================================
// Rendering
// ==========================================
function renderProducts() {
  productsGrid.innerHTML = '';
  
  if (products.length === 0) {
    productsGrid.innerHTML = \`
      <div class="state-view">
        <i class="fas fa-box-open" style="font-size: 32px; color: var(--text-tertiary); margin-bottom: 16px;"></i>
        <h3>ไม่มีสินค้า</h3>
        <p>ไม่พบสินค้าในหมวดหมู่นี้</p>
      </div>\`;
    return;
  }

  // Filter
  const filtered = products.filter(p => {
    const q = searchQuery.toLowerCase();
    return p.model.toLowerCase().includes(q) || (p.spec && p.spec.toLowerCase().includes(q));
  });

  if (filtered.length === 0) {
    productsGrid.innerHTML = \`<div class="state-view"><h3>ไม่พบสินค้าที่ค้นหา</h3></div>\`;
    return;
  }

  const grouped = groupProducts(filtered);

  grouped.forEach(group => {
    const card = document.createElement('div');
    card.className = 'series-card';
    
    // Header
    let html = \`
      <div class="series-header">
        <div class="series-title">
          <h2>\${escapeHTML(group.series)}</h2>
          <span class="series-badge">\${group.capacities.length} รุ่นย่อย</span>
        </div>
        <div class="toolbar-actions" style="padding:0">
          <button class="btn-secondary" onclick="copySeries('\${escapeHTML(group.series.replace(/'/g, "\\'"))}')">
            <i class="fas fa-copy"></i> คัดลอกรุ่นนี้
          </button>
        </div>
      </div>
    \`;
    
    // Capacities
    group.capacities.forEach(cap => {
      const finalPrice = cap.price + globalProfit;
      
      html += \`
        <div class="capacity-row">
          <div class="cap-info">
            <div class="cap-name">\${cap.capacity} \${cap.multiplePrices ? '<span style="font-size:12px;color:var(--text-tertiary);font-weight:400">(แยกตามสี)</span>' : ''}</div>
            <div class="cap-colors">
              \${cap.colors.split(', ').map(c => \`<span class="color-chip">\${escapeHTML(c)}</span>\`).join('')}
            </div>
          </div>
          <div class="cap-price-area">
            <div class="price-display">
              <div class="price-final">฿\${formatMoney(finalPrice)}</div>
              <div class="price-detail">ทุน ฿\${formatMoney(cap.price)} + กำไร ฿\${formatMoney(globalProfit)}</div>
            </div>
            <button class="btn-icon" title="คัดลอกราคาความจุนี้" onclick="copySingle(this, '\${escapeHTML(group.series.replace(/'/g, "\\'"))}', '\${cap.capacity}', \${finalPrice}, '\${escapeHTML(cap.multiplePrices ? cap.colors : '')}')">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
      \`;
    });
    
    card.innerHTML = html;
    productsGrid.appendChild(card);
  });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

// ==========================================
// Copy Actions
// ==========================================
async function doCopy(btnElement, text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    if (btnElement) {
      const icon = btnElement.querySelector('i');
      const originalClass = icon.className;
      icon.className = 'fas fa-check';
      btnElement.classList.add('success');
      setTimeout(() => {
        icon.className = originalClass;
        btnElement.classList.remove('success');
      }, 2000);
    } else {
      alert(successMsg);
    }
  } catch (err) {
    console.error('Copy failed', err);
    alert('ไม่สามารถคัดลอกได้');
  }
}

window.copySingle = function(btn, series, capacity, finalPrice, colors) {
  let text = \`\${series}\\n\${capacity} — ฿\${formatMoney(finalPrice)}\`;
  if (colors) text += \` (\${colors})\`;
  doCopy(btn, text, 'คัดลอกเรียบร้อย');
};

window.copySeries = function(seriesName) {
  const q = searchQuery.toLowerCase();
  const filtered = products.filter(p => p.model.toLowerCase().includes(q) || (p.spec && p.spec.toLowerCase().includes(q)));
  const grouped = groupProducts(filtered);
  const group = grouped.find(g => g.series === seriesName);
  
  if (!group) return;
  
  let text = \`\${group.series}\\n\`;
  group.capacities.forEach(cap => {
    const finalPrice = cap.price + globalProfit;
    text += \`\${cap.capacity} — ฿\${formatMoney(finalPrice)}\`;
    if (cap.multiplePrices) text += \` (\${cap.colors})\`;
    text += '\\n';
  });
  
  doCopy(null, text.trim(), \`คัดลอก \${group.series} เรียบร้อยแล้ว\`);
};

function buildTextFromGrouped(grouped) {
  let text = '';
  grouped.forEach(g => {
    text += \`\${g.series}\\n\`;
    g.capacities.forEach(cap => {
      const finalPrice = cap.price + globalProfit;
      text += \`\${cap.capacity} — ฿\${formatMoney(finalPrice)}\`;
      if (cap.multiplePrices) text += \` (\${cap.colors})\`;
      text += '\\n';
    });
    text += '\\n';
  });
  return text.trim();
}

function copyVisibleProducts() {
  const filtered = products.filter(p => {
    const q = searchQuery.toLowerCase();
    return p.model.toLowerCase().includes(q) || (p.spec && p.spec.toLowerCase().includes(q));
  });
  if (filtered.length === 0) return alert('ไม่มีข้อมูล');
  
  const grouped = groupProducts(filtered);
  const text = buildTextFromGrouped(grouped);
  doCopy(null, text, \`คัดลอกผลที่แสดง (\${grouped.length} รุ่น) เรียบร้อยแล้ว\`);
}

async function copyAllProducts() {
  // Try to fetch all if we don't have them in cache
  const cats = ['iphone', 'ipad', 'macbook', 'android'];
  let allItems = [];
  
  const btn = document.getElementById('btn-copy-all');
  const origText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเตรียมข้อมูล...';
  
  for (const cat of cats) {
    if (allCategoriesCache[cat]) {
      allItems.push(...allCategoriesCache[cat]);
    } else {
      try {
        const res = await fetch(\`\${baseUrl}/api/prices/\${cat}\`);
        const data = await res.json();
        if (data.items) {
          allCategoriesCache[cat] = data.items;
          allItems.push(...data.items);
        }
      } catch (e) {
        console.error('Failed fetching', cat);
      }
    }
  }
  
  if (allItems.length === 0) {
    btn.innerHTML = origText;
    return alert('ไม่พบข้อมูล');
  }
  
  const grouped = groupProducts(allItems);
  const text = buildTextFromGrouped(grouped);
  
  await doCopy(null, text, \`คัดลอกทุกรุ่น (\${grouped.length} ตระกูล) เรียบร้อยแล้ว\`);
  btn.innerHTML = origText;
}

init();
