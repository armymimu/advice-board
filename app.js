// ─── SPLASH + PRELOAD SYSTEM ───
// ─── PIN LOCK SYSTEM ───
const CORRECT_PIN = '091247';
let enteredPin = '';
let serverReady = false;   // ตั้งเป็น true เมื่อ server ตอบสนอง
let preloadDone = false;   // ตั้งเป็น true เมื่อ preload เสร็จ

// ── Global state — must be before runSplash ──
const categoryData = {};
const fetchedAt = {};
let studio7Prices = [];

function setSplashProgress(pct, text) {
  const bar = document.getElementById('splash-bar');
  const txt = document.getElementById('splash-text');
  if (bar) bar.style.width = pct + '%';
  if (txt && text) txt.textContent = text;
}

function hideSplash(callback) {
  const splash = document.getElementById('splash-screen');
  if (!splash) { if (callback) callback(); return; }
  splash.classList.add('splash-exit');
  setTimeout(() => {
    splash.style.display = 'none';
    if (callback) callback();
  }, 650);
}

// ── Wake-up ping: ทำ request เพื่อปลุก server และวัดว่า ready หรือยัง ──
async function wakeUpServer(maxWait = 30000) {
  const start = Date.now();
  let attempt = 0;
  setSplashProgress(10, 'กำลังปลุก server...');
  while (Date.now() - start < maxWait) {
    attempt++;
    try {
      const r = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        setSplashProgress(40, 'Server พร้อมแล้ว ✓');
        serverReady = true;
        return true;
      }
    } catch (e) { /* still waking up */ }
    const elapsed = Date.now() - start;
    const pct = Math.min(10 + (elapsed / maxWait) * 30, 38);
    setSplashProgress(pct, `กำลังปลุก server... (${attempt})`);
    await new Promise(r => setTimeout(r, 1800));
  }
  setSplashProgress(40, 'Server ช้า — ลองต่อ...');
  serverReady = true; // ยังคงดำเนินต่อแม้ timeout
  return false;
}

// ── Preload iphone data in background ──
async function preloadIphoneData() {
  setSplashProgress(55, 'กำลังโหลดราคา iPhone...');
  try {
    const [resp, s7Resp] = await Promise.all([
      fetch('/api/prices/iphone', { signal: AbortSignal.timeout(20000) }),
      fetch('/api/prices-studio7', { signal: AbortSignal.timeout(10000) }).catch(() => null)
    ]);
    if (resp.ok) {
      const data = await resp.json();
      const s7Data = s7Resp && s7Resp.ok ? await s7Resp.json() : { items: [] };
      categoryData['iphone'] = data.items || [];
      studio7Prices = s7Data.items || [];
      fetchedAt['iphone'] = new Date();
      setSplashProgress(90, `โหลดแล้ว ${data.items?.length || 0} รุ่น ✓`);
      preloadDone = true;
    } else {
      setSplashProgress(85, 'ไม่สามารถโหลดได้ตอนนี้');
    }
  } catch (e) {
    setSplashProgress(85, 'จะโหลดหลังเข้าแอป...');
  }
}

// ── Main splash flow ──
async function runSplash() {
  setSplashProgress(5, 'เริ่มต้น...');
  const isUnlocked = localStorage.getItem('armymimu_unlocked') === 'true';

  if (isUnlocked) {
    // ผู้ใช้ unlock แล้ว: ปลุก server + preload ข้อมูลทันที
    await wakeUpServer(25000);
    await preloadIphoneData();
    setSplashProgress(100, 'พร้อมแล้ว! ✨');
    await new Promise(r => setTimeout(r, 300));
    hideSplash(() => {
      document.getElementById('app-content').style.display = 'block';
      document.getElementById('app-content').classList.add('app-enter');
      checkTokenStatus();
      if (preloadDone) renderCategory('iphone');
      updateFabBar();
    });
  } else {
    // ยังไม่ unlock: ปลุก server ก่อน แล้วค่อยโชว์ PIN
    await wakeUpServer(20000);
    setSplashProgress(100, 'พร้อมแล้ว! ✨');
    await new Promise(r => setTimeout(r, 250));
    hideSplash(() => {
      const pinScreen = document.getElementById('pin-lock-screen');
      pinScreen.style.display = 'flex';
      pinScreen.classList.add('pin-enter');
      initPinLock();
    });
  }
}

// Start splash immediately
runSplash();

function initPinLock() {
  const lockScreen = document.getElementById('pin-lock-screen');
  const appContent = document.getElementById('app-content');

  const keys = document.querySelectorAll('.pin-keypad .key[data-num]');
  const deleteKey = document.getElementById('pin-delete');
  const dots = document.querySelectorAll('.pin-dots .dot');
  const dotsContainer = document.querySelector('.pin-dots');

  function updateDots() {
    dots.forEach((dot, index) => {
      if (index < enteredPin.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });
  }

  function handleInput(num) {
    if (enteredPin.length < 6) {
      enteredPin += num;
      updateDots();
      
      if (enteredPin.length === 6) {
        checkPin();
      }
    }
  }

  function handleDelete() {
    if (enteredPin.length > 0) {
      enteredPin = enteredPin.slice(0, -1);
      updateDots();
      dotsContainer.classList.remove('error');
    }
  }

  function checkPin() {
    if (enteredPin === CORRECT_PIN) {
      // Success
      localStorage.setItem('armymimu_unlocked', 'true');
      lockScreen.classList.add('hidden');
      // Preload ข้อมูลทันทีหลัง unlock สำเร็จ
      setTimeout(async () => {
        lockScreen.style.display = 'none';
        appContent.style.display = 'block';
        appContent.classList.add('app-enter');
        checkTokenStatus();
        // preload iPhone data ถ้า server ready แล้ว
        if (serverReady && !preloadDone) {
          await preloadIphoneData();
          if (preloadDone) renderCategory('iphone');
          updateFabBar();
        }
      }, 500);
    } else {
      // Error
      dotsContainer.classList.add('error');
      setTimeout(() => {
        enteredPin = '';
        updateDots();
        dotsContainer.classList.remove('error');
      }, 500);
    }
  }

  keys.forEach(key => {
    key.addEventListener('click', (e) => {
      const num = e.target.getAttribute('data-num');
      handleInput(num);
    });
  });

  deleteKey.addEventListener('click', handleDelete);
}

// Run immediately
initPinLock();

// ─── Token Status ───
async function checkTokenStatus() {
  const el = document.getElementById('token-status');
  if (!el) return;
  el.className = 'token-status loading';
  el.textContent = '⏳ ตรวจสอบ...';
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    if (d.tokenValid) {
      const mins = d.tokenMinutesLeft || Math.max(0, Math.round((new Date(d.tokenExpires) - Date.now()) / 60000));
      el.className = 'token-status ' + (mins > 20 ? 'ok' : 'warn');
      el.textContent = mins > 20 ? `🔑 Token OK (${mins}m)` : `⚠️ หมดใน ${mins}m`;
      el.title = d.autoRefresh ? 'จะรีเฟรชอัตโนมัติ' : 'ไม่มีระบบรีเฟรชอัตโนมัติ';
    } else {
      el.className = 'token-status error';
      el.textContent = '🔑 ไม่มี Token';
      el.style.cursor = 'pointer';
      el.onclick = refreshTokenFromUI;
    }
  } catch {
    el.className = 'token-status error';
    el.textContent = '⚠️ เชื่อมต่อ server ไม่ได้';
  }
}

async function refreshTokenFromUI() {
  const el = document.getElementById('token-status');
  if (el) {
    el.className = 'token-status loading';
    el.textContent = '🔄 กำลังรีเฟรช...';
  }
  showToast('🔄 กำลังรีเฟรช Token อัตโนมัติ... กรุณารอ 15-30 วินาที');
  try {
    const r = await fetch('/api/refresh-token', { method: 'POST' });
    const d = await r.json();
    if (d.success) {
      showToast('✅ Token รีเฟรชสำเร็จแล้ว!');
      checkTokenStatus();
    } else {
      showToast('❌ ' + (d.error || 'ไม่สามารถรีเฟรชได้'), true);
      checkTokenStatus();
    }
  } catch (e) {
    showToast('❌ เชื่อมต่อ server ไม่ได้', true);
    checkTokenStatus();
  }
}

async function refreshTokenThenFetch(cat) {
  showToast('🔄 กำลังรีเฟรช Token อัตโนมัติ... รอ 15-30 วินาที');
  document.getElementById('submodels-' + cat).innerHTML =
    `<div class="empty-state">
      <div class="empty-icon">🔄</div>
      <div class="empty-title">กำลังรีเฟรช Token...</div>
      <div class="empty-sub">ระบบกำลังเปิดเบราว์เซอร์ดึง Token ใหม่อัตโนมัติ กรุณารอสักครู่</div>
    </div>`;
  document.getElementById('dot-' + cat).className = 'status-dot loading';
  try {
    const r = await fetch('/api/refresh-token', { method: 'POST' });
    const d = await r.json();
    if (d.success) {
      showToast('✅ Token รีเฟรชสำเร็จ! กำลังโหลดข้อมูล...');
      checkTokenStatus();
      fetchCategory(cat);
    } else {
      showToast('❌ ' + (d.error || 'ไม่สามารถรีเฟรชได้'), true);
      checkTokenStatus();
    }
  } catch (e) {
    showToast('❌ เชื่อมต่อ server ไม่ได้', true);
    checkTokenStatus();
  }
}

setInterval(checkTokenStatus, 60000);

const SHOP_NAME = 'Armymimu';
// ── Note: categoryData, fetchedAt, studio7Prices are declared at top of file ──
const LABELS = { iphone: '📱 iPhone', ipad: '⬛ iPad', macbook: '💻 MacBook', android: '🤖 Android' };
const CATEGORIES = ['iphone', 'ipad', 'macbook', 'android'];
const COLOR_MAP = {
  'black': '#1a1a1a', 'white': '#f5f5f5', 'pink': '#f4a0b5', 'blue': '#4d94ff',
  'yellow': '#f5d442', 'green': '#4caf50', 'purple': '#8b5cf6', 'red': '#ef4444',
  'silver': '#c0c0c0', 'gold': '#d4a857', 'starlight': '#f5ead6', 'midnight': '#1c1f2e',
  'lavender': '#b4a7d6', 'sage': '#8fbc8f', 'ultramarine': '#3b4cc0', 'teal': '#009688',
  'natural': '#c8b89a', 'desert': '#c19a6b', 'graphite': '#5c5c5c',
  'space black': '#2d2d2d', 'space gray': '#5a5a5a', 'space grey': '#5a5a5a',
  'black titanium': '#3a3a3a', 'white titanium': '#e8e4df', 'natural titanium': '#b5a99a',
  'desert titanium': '#9a8a6e', 'cosmic orange': '#d4702a', 'deep blue': '#1a3a6e',
  'mist blue': '#8ab4d0', 'soft pink': '#f0c4c8', 'cloud white': '#f0ece8',
  'light gold': '#dbc8a0', 'sky blue': '#7ec8e3', 'rose gold': '#b76e79',
  'orange': '#e67e22', 'titanium': '#8a8a7a'
};

let currentSort = 'default';
let currentFilter = 'all';
let debounceTimer = null;

function renderProducts(products) {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '';
    
    if (products.length === 0) {
        grid.innerHTML = '<div class="no-data">ไม่พบข้อมูลสินค้า</div>';
        return;
    }
    
    const profitMargin = parseFloat(document.getElementById('profit-margin').value) / 100;
    
    products.forEach(product => {
        // Calculate best cost
        const adviceCost = product.price;
        const s7Cost = product.s7Price;
        let bestCost = adviceCost;
        let cheaperAt = 'advice'; // 'advice', 'studio7', or 'equal'
        
        if (s7Cost) {
            // Only compare if s7Cost is valid
            // Note: s7Cost is starting price. We consider it carefully.
            if (s7Cost < adviceCost) {
                bestCost = s7Cost;
                cheaperAt = 'studio7';
            } else if (adviceCost < s7Cost) {
                cheaperAt = 'advice';
            } else {
                cheaperAt = 'equal';
            }
        }
        
        const sellPrice = Math.ceil(bestCost * (1 + profitMargin));
        const profit = sellPrice - bestCost;
        
        const card = document.createElement('div');
        card.className = 'product-card';
        
        card.innerHTML = `
            <div class="product-brand">${product.brand}</div>
            <div class="product-name">${product.name}</div>
            
            <div class="price-comparison">
                <div class="price-box ${cheaperAt === 'advice' || cheaperAt === 'equal' ? 'best-price' : ''}">
                    <span class="price-label">Advice</span>
                    <span class="price-value">฿${adviceCost.toLocaleString()}</span>
                </div>
                <div class="price-box ${cheaperAt === 'studio7' ? 'best-price' : ''}">
                    <span class="price-label">Studio7</span>
                    <span class="price-value">${s7Cost ? '฿' + s7Cost.toLocaleString() + ' (เริ่มต้น)' : '-'}</span>
                </div>
            </div>

            <div class="price-result">
                <div class="price-row">
                    <span>ต้นทุนที่ดีที่สุด:</span>
                    <span class="cost-price">฿${bestCost.toLocaleString()}</span>
                </div>
                <div class="price-row">
                    <span>ราคาขาย (+${(profitMargin * 100).toFixed(0)}%):</span>
                    <span class="sell-price">฿${sellPrice.toLocaleString()}</span>
                </div>
                <div class="price-row profit-row">
                    <span>กำไรสุทธิ:</span>
                    <span class="profit">฿${profit.toLocaleString()}</span>
                </div>
            </div>
            
            <a href="${product.link}" target="_blank" class="buy-btn">ดูบนเว็บ Advice</a>
        `;
        
        grid.appendChild(card);
    });
}

// ─── Init panels ───
const panelsContainer = document.getElementById('panels-container');
CATEGORIES.forEach((cat, i) => {
  const p = document.createElement('div');
  p.className = 'panel' + (i === 0 ? ' active' : '');
  p.id = 'panel-' + cat;
  p.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <div class="status-dot" id="dot-${cat}"></div>
        ${LABELS[cat]} ทุกรุ่น
        <span class="meta-badge" id="total-${cat}"></span>
        <span class="meta-badge" id="fetched-${cat}"></span>
      </div>
      <div class="section-actions">
        <button class="btn primary" onclick="copyAllCategory('${cat}')">📋 ก็อปทั้งหมวด</button>
        <button class="btn" onclick="fetchCategory('${cat}')">⟳ โหลดราคา</button>
      </div>
    </div>
    <div class="stats-bar" id="stats-${cat}"></div>
    <div class="toolbar" id="toolbar-${cat}">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="ค้นหารุ่น เช่น iPhone 16 Pro, iPad Air..." oninput="debounceSearch('${cat}', this.value)" />
      </div>
      <div class="filter-group">
        <button class="filter-btn active" onclick="setFilter('${cat}','all',this)">ทั้งหมด</button>
        <button class="filter-btn" onclick="setFilter('${cat}','instock',this)">มีของ</button>
        <button class="filter-btn" onclick="setFilter('${cat}','outstock',this)">หมด</button>
      </div>
      <select class="sort-select" onchange="setSort('${cat}',this.value)">
        <option value="default">เรียงตามชื่อ</option>
        <option value="price-asc">ราคาต่ำ → สูง</option>
        <option value="price-desc">ราคาสูง → ต่ำ</option>
        <option value="discount">ลดมากสุด</option>
      </select>
    </div>
    <div id="submodels-${cat}" class="submodel-grid">
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <div class="empty-title">ยังไม่มีข้อมูล</div>
        <div class="empty-sub">กด "โหลดราคา" เพื่อดึงข้อมูลสินค้าแบบ Real-time</div>
        <button class="btn primary" onclick="fetchCategory('${cat}')" style="margin-top:16px">⟳ โหลดราคา</button>
      </div>
    </div>`;
  panelsContainer.appendChild(p);
});

// ─── Utilities ───
function getProfit() { return parseInt(document.getElementById('profitInput').value) || 0; }

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDateTime(d) {
  if (!d) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showToast(text, isError) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.className = 'toast', 2800);
}

function copyToClipboard(text, msg) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast(msg)).catch(() => fbCopy(text, msg));
  } else fbCopy(text, msg);
}
function fbCopy(text, msg) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast(msg); } catch { showToast('ก็อปไม่สำเร็จ', true); }
  document.body.removeChild(ta);
}

function getColorDot(color) {
  const c = (color || '').toLowerCase();
  const hex = COLOR_MAP[c];
  return hex ? `<span class="color-dot" style="background:${hex}" title="${color}"></span>` : '';
}

// ─── Tab ───
function switchTab(cat) {
  CATEGORIES.forEach(c => {
    const tab = document.querySelector(`[data-tab="${c}"]`);
    if (tab) tab.classList.toggle('active', c === cat);
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + cat).classList.add('active');
  if (!categoryData[cat]) fetchCategory(cat);
}

// ─── Parse ───
function parseProduct(model) {
  let s = (model || '').replace(/^Apple\s+/i, '').trim().replace(/"/g, "''");
  s = s.replace(/\s*\([^)]+\)\s*nano-texture\s+glass\s*$/i, '').trim();
  s = s.replace(/\s+nano-texture\s+glass\s*$/i, '').trim();
  let color = '';
  const dm = s.match(/\s+-\s+([^-]+)$/);
  if (dm) { color = dm[1].trim(); s = s.substring(0, dm.index).trim(); }
  let capacity = '';
  const cm = s.match(/(\d+(?:GB|TB))\b/i);
  if (cm) { capacity = cm[1].toUpperCase(); s = (s.substring(0, cm.index) + s.substring(cm.index + cm[0].length)).trim(); }
  if (!color) {
    const cl = /\s+(Black Titanium|White Titanium|Natural Titanium|Desert Titanium|Space Gray|Space Grey|Space Black|Cosmic Orange|Deep Blue|Mist Blue|Soft Pink|Cloud White|Light Gold|Sky Blue|Rose Gold|Pacific Blue|Sierra Blue|Alpine Green|Black|White|Pink|Blue|Yellow|Green|Purple|Red|Silver|Gold|Starlight|Midnight|Lavender|Sage|Ultramarine|Teal|Natural|Desert|Titanium|Orange|Graphite)$/i;
    const m = s.match(cl);
    if (m) { color = m[1].trim(); s = s.substring(0, m.index).trim(); }
  }
  s = s.replace(/\s+/g, ' ').replace(/\s*-\s*$/, '').trim();
  return { submodel: s, capacity, color };
}

// ─── Fetch ───
function showLoadingCards(cat) {
  const w = document.getElementById('submodels-' + cat);
  let h = '';
  for (let i = 0; i < 5; i++) {
    h += `<div class="skeleton-card" style="animation-delay:${i*0.08}s">
      <div class="skeleton" style="width:180px;height:18px"></div>
      <div class="skeleton" style="width:92%"></div>
      <div class="skeleton" style="width:68%"></div>
      <div class="skeleton" style="width:80%"></div>
    </div>`;
  }
  w.innerHTML = h;
}

async function fetchCategory(cat, retry = 0) {
  const MAX_RETRIES = 8;
  document.getElementById('dot-' + cat).className = 'status-dot loading';
  showLoadingCards(cat);
  try {
    const [resp, s7Resp] = await Promise.all([
      fetch(`/api/prices/${cat}`),
      fetch(`/api/prices-studio7`).catch(() => null)
    ]);
    if (!resp.ok) {
      let serverMsg = '';
      try { serverMsg = (await resp.json()).error || ''; } catch (_) {}
      const err = new Error('HTTP ' + resp.status);
      err.serverMsg = serverMsg;
      err.httpStatus = resp.status;
      throw err;
    }
    const data = await resp.json();
    const s7Data = s7Resp && s7Resp.ok ? await s7Resp.json() : { items: [] };
    
    categoryData[cat] = data.items || [];
    studio7Prices = s7Data.items || [];
    fetchedAt[cat] = new Date();
    renderCategory(cat);
  } catch(e) {
    const httpStatus = e.httpStatus || 0;
    const isTokenErr = httpStatus === 401 || (e.serverMsg || '').toLowerCase().includes('token');
    const delay = Math.min(2000 + retry * 1500, 8000);

    if (retry >= MAX_RETRIES) {
      // ล้มเหลวจริงๆ — โชว์ปุ่มลองใหม่
      document.getElementById('submodels-' + cat).innerHTML =
        `<div class="empty-state">
          <div class="empty-icon">📡</div>
          <div class="empty-title">โหลดไม่สำเร็จ</div>
          <div class="empty-sub">เซิร์ฟเวอร์ไม่ตอบสนอง กรุณาลองอีกครั้ง</div>
          <button class="btn primary" onclick="fetchCategory('${cat}')" style="margin-top:16px">⟳ ลองใหม่</button>
        </div>`;
      document.getElementById('dot-' + cat).className = 'status-dot';
      return;
    }

    if (isTokenErr) {
      // Token หมด — server จะรีเฟรชเองอัตโนมัติ แสดงแค่ loading
      const retryIn = Math.round(delay / 1000);
      document.getElementById('submodels-' + cat).innerHTML =
        `<div class="empty-state">
          <div class="empty-icon" style="animation: spin 1s linear infinite">🔄</div>
          <div class="empty-title">กำลังรีเฟรช Token...</div>
          <div class="empty-sub">ระบบกำลังดึง Token ใหม่อัตโนมัติ<br>
            <span style="font-size:11px;opacity:0.6">จะลองใหม่ใน ${retryIn} วินาที (${retry+1}/${MAX_RETRIES})</span>
          </div>
        </div>`;
      showToast(`🔄 Token หมด — กำลังรีเฟรชอัตโนมัติ...`);
    } else {
      // Network error หรือ server ตื่น
      const retryIn = Math.round(delay / 1000);
      document.getElementById('submodels-' + cat).innerHTML =
        `<div class="empty-state">
          <div class="empty-icon" style="animation: spin 1s linear infinite">⏳</div>
          <div class="empty-title">กำลังเชื่อมต่อ...</div>
          <div class="empty-sub">กำลังเริ่มระบบ กรุณารอสักครู่<br>
            <span style="font-size:11px;opacity:0.6">ลองใหม่ใน ${retryIn} วินาที (${retry+1}/${MAX_RETRIES})</span>
          </div>
        </div>`;
    }

    setTimeout(() => fetchCategory(cat, retry + 1), delay);
  }
}


// ─── Filter/Sort/Search ───

function debounceSearch(cat, val) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => renderCategory(cat, val), 250);
}

function setFilter(cat, filter, el) {
  currentFilter = filter;
  el.closest('.filter-group').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const searchVal = document.querySelector(`#toolbar-${cat} input`)?.value || '';
  renderCategory(cat, searchVal);
}

function setSort(cat, sort) {
  currentSort = sort;
  const searchVal = document.querySelector(`#toolbar-${cat} input`)?.value || '';
  renderCategory(cat, searchVal);
}

// ─── Render ───
function renderCategory(cat, filterText = '') {
  const profit = getProfit();
  const allItems = categoryData[cat] || [];
  const wrap = document.getElementById('submodels-' + cat);

  if (!allItems.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">ไม่พบข้อมูล</div></div>`;
    return;
  }

  let items = allItems;
  if (filterText) {
    const f = filterText.toLowerCase();
    items = items.filter(it => (it.model||'').toLowerCase().includes(f) || (it.spec||'').toLowerCase().includes(f) || (it.modelCode||'').toLowerCase().includes(f));
  }
  if (currentFilter === 'instock') items = items.filter(it => it.inStock);
  else if (currentFilter === 'outstock') items = items.filter(it => !it.inStock);

  if (currentSort === 'price-asc') items = [...items].sort((a,b) => (a.price||0) - (b.price||0));
  else if (currentSort === 'price-desc') items = [...items].sort((a,b) => (b.price||0) - (a.price||0));
  else if (currentSort === 'discount') items = [...items].sort((a,b) => ((b.priceSrp||0)-(b.price||0)) - ((a.priceSrp||0)-(a.price||0)));

  document.getElementById('toolbar-' + cat).classList.add('show');

  // Stats
  renderStats(cat, items, allItems);

  const groups = new Map();
  const groupKeys = [];
  items.forEach(item => {
    item._parsed = parseProduct(item.model);
    const key = item._parsed.submodel || item.model;
    if (!groups.has(key)) { groups.set(key, []); groupKeys.push(key); }
    groups.get(key).push(item);
  });

  if (!groupKeys.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">ไม่พบรายการที่ค้นหา</div></div>`;
    updateBadges(cat, 0, allItems.length);
    return;
  }

  wrap.innerHTML = groupKeys.map((subName, idx) => {
    const list = groups.get(subName);
    const capGroups = new Map(); const capOrder = [];
    list.forEach(it => {
      const cap = it._parsed.capacity || '-';
      if (!capGroups.has(cap)) { capGroups.set(cap, []); capOrder.push(cap); }
      capGroups.get(cap).push(it);
    });
    const copyText = buildCopyText(subName, capOrder, capGroups, profit, cat);
    const sid = `${cat}-${idx}`;

    const rows = list.map(item => {
      // Find Studio7 match
      const baseNameLower = (item._parsed.submodel || item.model).toLowerCase();
      const s7Match = studio7Prices.find(s7 => baseNameLower.includes(s7.title.toLowerCase()) || s7.title.toLowerCase().includes(baseNameLower));
      const s7Price = s7Match ? s7Match.price : null;
      
      const advicePrice = item.price || 0;
      let bestCost = advicePrice;
      let isCheaperS7 = false;
      
      if (s7Price && s7Price < advicePrice) {
          bestCost = s7Price;
          isCheaperS7 = true;
      }
      
      const sell = bestCost + profit;
      const disc = item.priceSrp > advicePrice ? item.priceSrp - advicePrice : 0;
      const pct = item.priceSrp > 0 && disc > 0 ? Math.round(disc/item.priceSrp*100) : 0;
      const stCls = item.inStock ? 'instock' : 'outstock';
      const stTxt = item.inStock ? 'มีของ' : 'หมด';
      const promo = item.promotion ? `<span class="promo-badge">${escapeHtml(item.promotion)}</span>` : '';
      const colorDot = getColorDot(item._parsed.color);
      const imgHtml = item.image ? `<td class="td-img"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.style.display='none'" onclick="openViewerFromItem('${cat}','${escapeHtml(item.modelCode)}')" title="คลิกดู 3D"/></td>` : '<td class="td-img"></td>';
      return `<tr>
        ${imgHtml}
        <td class="td-model">${colorDot}${escapeHtml(item.model)}${promo}</td>
        <td class="td-spec">${escapeHtml(item.spec)}</td>
        <td class="td-code">${escapeHtml(item.modelCode)}</td>
        <td class="price-srp">฿${(item.priceSrp||0).toLocaleString()}</td>
        <td class="price-sale ${!isCheaperS7 && advicePrice > 0 ? 'best-cost' : ''}">฿${advicePrice.toLocaleString()}</td>
        <td class="price-sale ${isCheaperS7 ? 'best-cost' : ''}" style="${isCheaperS7 ? 'color: var(--success); font-weight: 600;' : 'color: var(--text3)'}">${s7Price ? '฿' + s7Price.toLocaleString() : '-'}</td>
        <td class="price-sell" style="color: var(--primary); font-weight: 700;">฿${sell.toLocaleString()}</td>
        <td>${disc > 0 ? `<span class="discount-badge">-${pct}%</span>` : '<span style="color:var(--muted)">—</span>'}</td>
        <td><span class="stock-badge ${stCls}">${stTxt}</span></td>
      </tr>`;
    }).join('');

    return `<div class="submodel-card" style="animation-delay:${idx*0.05}s">
      <div class="submodel-header" onclick="toggleCard(this)">
        <div class="submodel-title">
          <span class="chevron">▼</span>
          ${escapeHtml(subName)}
          <span class="badge-cnt">${list.length}</span>
        </div>
        <div class="submodel-actions" onclick="event.stopPropagation()">
          <button class="btn sm" onclick="togglePreview('${sid}')">👁 ดูข้อความ</button>
          <button class="btn sm primary" onclick="copySubmodel('${sid}')">📋 ก็อป</button>
        </div>
      </div>
      <pre class="submodel-preview" id="prev-${sid}">${escapeHtml(copyText)}</pre>
      <div class="table-wrap">
        <table>
          <thead><tr><th style="width:50px">รูป</th><th>รุ่น</th><th>สเปค</th><th>รหัส</th><th>SRP</th><th>Advice</th><th>Studio7</th><th>ราคาขาย</th><th>ลด</th><th>สถานะ</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  updateBadges(cat, items.length, allItems.length);
}

function renderStats(cat, items, allItems) {
  const bar = document.getElementById('stats-' + cat);
  if (!allItems.length) { bar.classList.remove('show'); return; }
  const inStock = items.filter(i => i.inStock).length;
  const prices = items.map(i => i.price || 0).filter(p => p > 0);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const avgDisc = items.length ? Math.round(items.reduce((s,i) => s + ((i.priceSrp||0) > (i.price||0) ? i.priceSrp - i.price : 0), 0) / items.length) : 0;
  bar.innerHTML = `
    <div class="stat-card"><div class="stat-label">สินค้าทั้งหมด</div><div class="stat-value blue">${items.length}</div></div>
    <div class="stat-card"><div class="stat-label">มีของ</div><div class="stat-value green">${inStock} <span style="font-size:11px;color:var(--text3)">(${items.length?Math.round(inStock/items.length*100):0}%)</span></div></div>
    <div class="stat-card"><div class="stat-label">ราคาต่ำสุด</div><div class="stat-value orange">฿${minP.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">ราคาสูงสุด</div><div class="stat-value purple">฿${maxP.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">ส่วนลดเฉลี่ย</div><div class="stat-value green">฿${avgDisc.toLocaleString()}</div></div>`;
  bar.classList.add('show');
}

function updateBadges(cat, shown, total) {
  const cnt = document.getElementById('cnt-' + cat);
  cnt.textContent = total; cnt.classList.add('show');
  document.getElementById('dot-' + cat).className = 'status-dot done';
  const tb = document.getElementById('total-' + cat);
  tb.textContent = shown !== total ? `${shown} / ${total} รุ่น` : `${total} รุ่น`;
  tb.classList.add('show');
  const fa = document.getElementById('fetched-' + cat);
  if (fetchedAt[cat]) { fa.textContent = '⏱ ' + formatDateTime(fetchedAt[cat]); fa.classList.add('show'); }
}

// ─── Copy text builders ───
function buildCopyText(subName, capOrder, capGroups, profit, cat) {
  const lines = [];
  const dt = fetchedAt[cat] ? formatDateTime(fetchedAt[cat]) : formatDateTime(new Date());
  lines.push(`📱 ${subName}`);
  lines.push(`🏪 ${SHOP_NAME}   ⏱ ${dt}`);
  lines.push('');
  capOrder.forEach(cap => {
    const byPrice = new Map(); const po = [];
    capGroups.get(cap).forEach(it => {
      const sp = (it.price||0) + profit;
      if (!byPrice.has(sp)) { byPrice.set(sp, []); po.push(sp); }
      byPrice.get(sp).push(it);
    });
    po.forEach(price => {
      const its = byPrice.get(price);
      const cols = [...new Set(its.map(i => i._parsed.color).filter(Boolean))];
      const colP = cols.length ? ` (${cols.join('/')})` : '';
      const capP = (cap && cap !== '-') ? ` ${cap}` : '';
      lines.push(`${subName}${capP}${colP} ราคา ${price.toLocaleString()}`);
    });
  });
  return lines.join('\n');
}

function buildCopyAll(cat) {
  const profit = getProfit();
  const all = categoryData[cat] || [];
  if (!all.length) return '';
  const groups = new Map(); const gk = [];
  all.forEach(item => {
    item._parsed = parseProduct(item.model);
    const key = item._parsed.submodel || item.model;
    if (!groups.has(key)) { groups.set(key, []); gk.push(key); }
    groups.get(key).push(item);
  });
  const dt = fetchedAt[cat] ? formatDateTime(fetchedAt[cat]) : formatDateTime(new Date());
  const out = [`═══════════════════════════════`, LABELS[cat], `🏪 ${SHOP_NAME}   ⏱ ${dt}`, `═══════════════════════════════`, ''];
  gk.forEach(subName => {
    const list = groups.get(subName);
    const cg = new Map(); const co = [];
    list.forEach(it => { const c = it._parsed.capacity||'-'; if(!cg.has(c)){cg.set(c,[]);co.push(c)} cg.get(c).push(it); });
    out.push(`▸ ${subName}`);
    co.forEach(cap => {
      const bp = new Map(); const po = [];
      cg.get(cap).forEach(it => { const sp=(it.price||0)+profit; if(!bp.has(sp)){bp.set(sp,[]);po.push(sp)} bp.get(sp).push(it); });
      po.forEach(price => {
        const cols = [...new Set(bp.get(price).map(i=>i._parsed.color).filter(Boolean))];
        const colP = cols.length ? ` (${cols.join('/')})` : '';
        const capP = (cap&&cap!=='-') ? ` ${cap}` : '';
        out.push(`${subName}${capP}${colP} ราคา ${price.toLocaleString()}`);
      });
    });
    out.push('');
  });
  return out.join('\n').trim();
}

// ─── Actions ───
function copySubmodel(sid) {
  const el = document.getElementById('prev-' + sid);
  if (!el) return;
  copyToClipboard(el.textContent, 'คัดลอกเรียบร้อย ✓');
}

function togglePreview(sid) {
  const el = document.getElementById('prev-' + sid);
  if (el) el.classList.toggle('show');
}

function toggleCard(header) {
  header.closest('.submodel-card').classList.toggle('collapsed');
}

function copyAllCategory(cat) {
  const text = buildCopyAll(cat);
  if (!text) { showToast('ยังไม่มีข้อมูล', true); return; }
  copyToClipboard(text, `คัดลอก ${LABELS[cat]} ทั้งหมวดแล้ว ✓`);
}

function rebuildAllTables() {
  CATEGORIES.forEach(cat => { if (categoryData[cat]?.length) renderCategory(cat); });
}

function adjustProfit(delta) {
  const inp = document.getElementById('profitInput');
  inp.value = Math.max(0, (parseInt(inp.value)||0) + delta);
  rebuildAllTables();
}

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    switchTab(CATEGORIES[parseInt(e.key)-1]);
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.submodel-preview.show').forEach(el => el.classList.remove('show'));
  }
});

// Profit input live update
document.getElementById('profitInput').addEventListener('input', rebuildAllTables);

// ─── Track active tab ───
let activeTab = 'iphone';

// Override switchTab to track active
const _origSwitch = switchTab;
switchTab = function(cat) {
  activeTab = cat;
  _origSwitch(cat);
};

// ─── Copy current category (from floating bar) ───
function copyCurrentCategory() {
  const text = buildCopyAll(activeTab);
  if (!text) { showToast('ยังไม่มีข้อมูลในหมวดนี้', true); return; }
  copyToClipboard(text, `คัดลอก ${LABELS[activeTab]} ทั้งหมวดแล้ว ✓`);
}

// ─── Copy ALL loaded categories at once ───
function copyAllLoaded() {
  const parts = [];
  CATEGORIES.forEach(cat => {
    const text = buildCopyAll(cat);
    if (text) parts.push(text);
  });
  if (!parts.length) { showToast('ยังไม่มีข้อมูลเลย กรุณาโหลดราคาก่อน', true); return; }
  const combined = parts.join('\n\n');
  const loadedCats = CATEGORIES.filter(c => categoryData[c]?.length).map(c => LABELS[c]).join(' + ');
  copyToClipboard(combined, `คัดลอก ${loadedCats} ทั้งหมดแล้ว ✓`);
}

// ─── Show floating bar when data is loaded ───
function updateFabBar() {
  const hasData = CATEGORIES.some(c => categoryData[c]?.length);
  const el = document.getElementById('fabBar');
  if (el) el.classList.toggle('show', hasData);
}

// Patch renderCategory to show fab bar
const _origRender = renderCategory;
renderCategory = function(cat, filterText) {
  _origRender(cat, filterText);
  updateFabBar();
};

// ═══════════════════════════════════
// 3D Product Viewer
// ═══════════════════════════════════
let viewerData = null;

function openViewerFromItem(cat, modelCode) {
  const items = categoryData[cat] || [];
  const item = items.find(i => i.modelCode === modelCode);
  if (!item) return;
  openViewer({
    m: item.model, s: item.spec, p: item.price, ps: item.priceSrp,
    img: item.image, u: item.url, st: item.inStock, pr: item.promotion,
    mc: item.modelCode, c: (item._parsed || {}).color
  });
}

function openViewer(d) {
  try {
    viewerData = d;
    document.getElementById('viewerImg').src = d.img || '';
    document.getElementById('viewerModel').textContent = d.m || '';
    document.getElementById('viewerSpec').textContent = d.s || '';
    document.getElementById('viewerLink').href = d.u || '#';

    const profit = getProfit();
    const sell = (d.p || 0) + profit;
    const disc = (d.ps || 0) - (d.p || 0);
    const pct = d.ps > 0 && disc > 0 ? Math.round(disc / d.ps * 100) : 0;

    document.getElementById('viewerPrices').innerHTML = `
      <div class="vi-price-row"><span class="vi-price-label">SRP</span><span class="vi-price-val srp">฿${(d.ps||0).toLocaleString()}</span></div>
      <div class="vi-price-row"><span class="vi-price-label">Advice</span><span class="vi-price-val sale">฿${(d.p||0).toLocaleString()}</span></div>
      <div class="vi-price-row"><span class="vi-price-label">ราคาขาย</span><span class="vi-price-val sell">฿${sell.toLocaleString()}</span></div>
      ${disc > 0 ? `<div class="vi-price-row"><span class="vi-price-label">ประหยัด</span><span class="vi-price-val save">-฿${disc.toLocaleString()} (-${pct}%)</span></div>` : ''}
    `;

    const badges = [];
    if (d.st) badges.push('<span class="stock-badge instock">มีของ</span>');
    else badges.push('<span class="stock-badge outstock">หมด</span>');
    if (d.pr) badges.push(`<span class="promo-badge">${escapeHtml(d.pr)}</span>`);
    if (d.mc) badges.push(`<span style="font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace">${escapeHtml(d.mc)}</span>`);
    document.getElementById('viewerBadges').innerHTML = badges.join('');

    const overlay = document.getElementById('viewer');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('show'));
    document.body.style.overflow = 'hidden';
  } catch(e) { console.error('Viewer error:', e); }
}

function closeViewer(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('viewer-close')) return;
  const overlay = document.getElementById('viewer');
  overlay.classList.remove('show');
  setTimeout(() => { overlay.style.display = 'none'; }, 350);
  document.body.style.overflow = '';
  viewerData = null;
}

function copyViewerProduct() {
  if (!viewerData) return;
  const profit = getProfit();
  const sell = (viewerData.p || 0) + profit;
  const text = `${viewerData.m}\nราคา ฿${sell.toLocaleString()}\n🏪 ${SHOP_NAME}`;
  copyToClipboard(text, 'คัดลอกราคารุ่นนี้แล้ว ✓');
}

// 3D tilt effect
const viewer3d = document.getElementById('viewer3d');
const viewerOverlay = document.getElementById('viewer');

viewerOverlay.addEventListener('mousemove', (e) => {
  if (!viewerOverlay.classList.contains('show')) return;
  const rect = viewer3d.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = (e.clientX - cx) / (rect.width / 2);
  const dy = (e.clientY - cy) / (rect.height / 2);
  const rotY = dx * 25;
  const rotX = -dy * 20;
  viewer3d.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.02)`;

  const shine = viewer3d.querySelector('.shine');
  if (shine) {
    const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 135;
    shine.style.background = `linear-gradient(${angle}deg, rgba(255,255,255,0.12) 0%, transparent 50%, transparent 70%, rgba(255,255,255,0.04) 100%)`;
  }
});

viewerOverlay.addEventListener('mouseleave', () => {
  viewer3d.style.transform = 'rotateX(0) rotateY(0) scale(1)';
});

// Close with Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('viewer').classList.contains('show')) {
    closeViewer();
  }
});
