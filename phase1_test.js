/**
 * PHASE 1 — Diagnostic: รู้จัก Advice API ก่อน
 * ทดสอบ 4 วิธี แล้วดูว่าอันไหนได้ผล
 */
const axios = require('axios');

const API_URL = 'https://prodbackadvice.advice.in.th/api/v1.0.0/product/get';
const ADVICE_HOME = 'https://www.advice.co.th/product/search?keyword=iphone';

const BODY = {
  category: 'iphone', category_sub: '', product: '', keyword: '',
  take: 3, skip: 0, refSearch: '', page: 'product',
  arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [],
  arr_filter_cate: [], addView: false
};

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
  'Origin': 'https://www.advice.co.th',
  'Referer': 'https://www.advice.co.th/product/search?keyword=iphone',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

async function test(name, headers) {
  process.stdout.write(`\n🧪 [${name}]... `);
  try {
    const r = await axios.post(API_URL, BODY, { headers, timeout: 15000 });
    const status = r.data?.status;
    const count = r.data?.data?.count_product;
    const products = r.data?.data?.product;
    let productCount = 0;
    if (products && typeof products === 'object') {
      for (const p of Object.values(products)) {
        if (p.product) productCount += p.product.length;
      }
    }
    if (status === 'SUCCESS') {
      console.log(`✅ SUCCESS — count_product: ${count}, got: ${productCount} items`);
      return { ok: true, count };
    } else {
      console.log(`⚠️  status: ${status}`);
      console.log('   data preview:', JSON.stringify(r.data).slice(0, 200));
      return { ok: false };
    }
  } catch(e) {
    const code = e.response?.status;
    const msg = e.response?.data ? JSON.stringify(e.response.data).slice(0,200) : e.message;
    console.log(`❌ HTTP ${code || 'ERR'}: ${msg}`);
    return { ok: false, code };
  }
}

async function tryGetTokenFromPage() {
  console.log('\n🌐 ลองดึง token จากหน้าเว็บ Advice ด้วย HTTP...');
  try {
    const r = await axios.get(ADVICE_HOME, {
      headers: {
        'User-Agent': BASE_HEADERS['User-Agent'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9',
      },
      timeout: 15000,
      maxRedirects: 5,
    });
    
    // หา token ใน response headers
    const setCookie = r.headers['set-cookie'] || [];
    console.log('   Response headers:', Object.keys(r.headers).join(', '));
    console.log('   Cookies:', setCookie.map(c => c.split(';')[0]).join(' | ') || '(none)');
    
    // หา token pattern ใน HTML
    const html = r.data || '';
    const patterns = [
      /authorization["\s:]+(['"](Bearer\s+)?[A-Za-z0-9._\-]{20,}['"])/gi,
      /token["\s:]+['"]([A-Za-z0-9._\-]{20,})['"]/gi,
      /"accessToken"["\s:]+['"]([^'"]{20,})['"]/gi,
      /Bearer\s+([A-Za-z0-9._\-]{20,})/gi,
      /x-api-key["\s:]+['"]([A-Za-z0-9._\-]{10,})['"]/gi,
    ];
    
    let found = [];
    for (const p of patterns) {
      const matches = [...html.matchAll(p)];
      for (const m of matches) {
        found.push(m[0].slice(0, 100));
      }
    }
    
    if (found.length) {
      console.log('   🔑 พบ token-like patterns:');
      found.slice(0, 5).forEach(f => console.log('     ', f));
    } else {
      console.log('   (ไม่พบ token ใน HTML)');
    }
    
    console.log('   HTML length:', html.length, 'chars');
    return { cookies: setCookie, headers: r.headers };
  } catch(e) {
    console.log('   ❌ ดึงหน้าเว็บไม่ได้:', e.message);
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('PHASE 1: Advice API Diagnostic');
  console.log('═══════════════════════════════════════');

  // Test 1: ไม่มี token เลย
  await test('No Auth', { ...BASE_HEADERS });

  // Test 2: ใส่ token ปลอมดู response
  await test('Fake Bearer', { ...BASE_HEADERS, 'Authorization': 'Bearer fake_token_12345' });

  // Test 3: ใส่ cookie จากหน้าเว็บ
  const pageData = await tryGetTokenFromPage();
  if (pageData?.cookies?.length) {
    const cookieStr = pageData.cookies.map(c => c.split(';')[0]).join('; ');
    await test('With Cookies', { ...BASE_HEADERS, 'Cookie': cookieStr });
  }

  // Test 4: header แบบ mobile app
  await test('Mobile headers', {
    ...BASE_HEADERS,
    'User-Agent': 'AdviceApp/1.0 iOS/17',
    'x-platform': 'ios',
  });

  // Test 5: ดู headers ที่ server ส่งกลับมาเมื่อไม่มี auth
  console.log('\n📋 ดู response headers เมื่อ call ไม่มี auth:');
  try {
    const r = await axios.post(API_URL, BODY, {
      headers: BASE_HEADERS,
      timeout: 10000,
      validateStatus: () => true // ไม่ throw
    });
    console.log('   Status:', r.status);
    console.log('   Response headers:', JSON.stringify(r.headers, null, 2).slice(0, 500));
    console.log('   Body preview:', JSON.stringify(r.data).slice(0, 400));
  } catch(e) {
    console.log('   Error:', e.message);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('Phase 1 เสร็จแล้ว');
  console.log('═══════════════════════════════════════');
}

main();
