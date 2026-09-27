const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldCode = `      if (items && items.length > 0) {
        productCache[category] = { items, fetchedAt: Date.now() };
        saveProductCache();
        console.log('✅ อัปเดต ' + config.label + ' เบื้องหลังสำเร็จ: ' + items.length + ' รุ่น');
      }
    } catch (error) {
      console.error('❌ Background fetch error for ' + category + ':', error.message);
    }`;

const newCode = `      if (items && items.length > 0) {
        productCache[category] = { items, fetchedAt: Date.now(), lastError: null };
        saveProductCache();
        console.log('✅ อัปเดต ' + config.label + ' เบื้องหลังสำเร็จ: ' + items.length + ' รุ่น');
      } else {
        productCache[category] = { items: [], fetchedAt: Date.now(), lastError: 'API returned 0 items' };
      }
    } catch (error) {
      console.error('❌ Background fetch error for ' + category + ':', error.message);
      productCache[category] = { items: [], fetchedAt: Date.now(), lastError: error.message };
    }`;

if (code.includes(oldCode)) {
  code = code.replace(oldCode, newCode);
}

const oldCode2 = `    const newCache = productCache[category];
    if (newCache && newCache.items && newCache.items.length > 0) {
      res.json({ items: newCache.items, total: newCache.items.length, cached: false, stale: false, fetchedAt: newCache.fetchedAt });
    } else {
      res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ' });
    }`;

const newCode2 = `    const newCache = productCache[category];
    if (newCache && newCache.items && newCache.items.length > 0) {
      res.json({ items: newCache.items, total: newCache.items.length, cached: false, stale: false, fetchedAt: newCache.fetchedAt });
    } else {
      res.status(500).json({ error: newCache && newCache.lastError ? newCache.lastError : 'ดึงข้อมูลไม่สำเร็จ' });
    }`;

if (code.includes(oldCode2)) {
  code = code.replace(oldCode2, newCode2);
}

fs.writeFileSync('server.js', code);
