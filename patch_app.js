const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// 1. Update the loading text to be more reassuring about cold starts
const oldLoadingText = `<h3>กำลังเชื่อมต่อระบบ Advice...</h3>`;
const newLoadingText = `<h3>กำลังเชื่อมต่อระบบ Advice...</h3>
      <p style="color: var(--text-tertiary); font-size: 13px; margin-top: 8px;">(หากเข้าใช้งานครั้งแรกอาจใช้เวลาปลุกเซิร์ฟเวอร์ 30-50 วินาที)</p>`;
if (!code.includes('อาจใช้เวลาปลุกเซิร์ฟเวอร์')) {
  code = code.replace(oldLoadingText, newLoadingText);
}

// 2. Add individual copy button to the card HTML
const cardHtmlEnd = `              <div class="stat">
                <span class="stat-label">กำไร</span>
                <span class="stat-value profit">฿\${formatMoney(profit)}</span>
              </div>
            </div>
            <div class="card-footer">
              <div class="footer-status \${item.inStock ? 'status-in' : 'status-out'}">
                <i class="fas \${item.inStock ? 'fa-check-circle' : 'fa-times-circle'}"></i> 
                \${item.inStock ? 'มีสินค้า' : 'สินค้าหมด'}
              </div>
              <div class="footer-actions">
                \${item.url 
                  ? \`<a href="\${escapeHTML(item.url)}" target="_blank" class="btn-link" style="padding:0;" title="เปิดดูสินค้าบนเว็บ Advice">
                      <i class="fas fa-external-link-alt"></i>
                     </a>\` 
                  : ''}
              </div>
            </div>`;

const newCardHtmlEnd = `              <div class="stat">
                <span class="stat-label">กำไร</span>
                <span class="stat-value profit">฿\${formatMoney(profit)}</span>
              </div>
            </div>
            <div class="product-actions">
              <button class="btn-copy" onclick="copyIndividualPrice('\${escapeHTML(item.model.replace(/'/g, "\\'"))}', \${finalPrice})">
                <i class="fas fa-copy"></i> คัดลอกราคา
              </button>
            </div>
            <div class="card-footer">
              <div class="footer-status \${item.inStock ? 'status-in' : 'status-out'}">
                <i class="fas \${item.inStock ? 'fa-check-circle' : 'fa-times-circle'}"></i> 
                \${item.inStock ? 'มีสินค้า' : 'สินค้าหมด'}
              </div>
              <div class="footer-actions">
                \${item.url 
                  ? \`<a href="\${escapeHTML(item.url)}" target="_blank" class="btn-link" style="padding:0;" title="เปิดดูสินค้าบนเว็บ Advice">
                      <i class="fas fa-external-link-alt"></i>
                     </a>\` 
                  : ''}
              </div>
            </div>`;

if (!code.includes('copyIndividualPrice')) {
  code = code.replace(cardHtmlEnd, newCardHtmlEnd);
}

// 3. Add copy logic to app.js
const copyLogic = `

// ==========================================
// Copy Functionality
// ==========================================
window.copyIndividualPrice = function(model, price) {
  const text = \`\${model}\\nราคา: ฿\${formatMoney(price)}\`;
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
  let textToCopy = 'รายการราคา ' + document.getElementById('profit-label').innerText.replace(' (บาท):', '') + '\\n\\n';
  
  const filteredProducts = products.filter(p => {
    const q = searchQuery.toLowerCase();
    return p.model.toLowerCase().includes(q) || (p.spec && p.spec.toLowerCase().includes(q));
  });
  
  filteredProducts.forEach(p => {
    const profit = categoryProfits[currentCategory] || 0;
    const finalPrice = p.price + profit;
    textToCopy += \`- \${p.model}\\n  ราคา: ฿\${formatMoney(finalPrice)}\\n\`;
  });
  
  navigator.clipboard.writeText(textToCopy).then(() => {
    alert('คัดลอกราคาทั้งหมด (' + filteredProducts.length + ' รายการ) เรียบร้อยแล้ว');
  }).catch(err => {
    console.error('Failed to copy', err);
    alert('ไม่สามารถคัดลอกได้');
  });
});
`;

if (!code.includes('window.copyIndividualPrice')) {
  code += copyLogic;
}

fs.writeFileSync('app.js', code);
console.log('Done app.js');
