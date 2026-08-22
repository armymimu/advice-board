/**
 * PHASE 2 — Test: ดึง Authorization token จาก user_token cookie
 * ลองวิธีต่างๆ เพื่อแปลง cookie → API token
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

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function test(name, headers) {
  process.stdout.write(`\n🧪 [${name}]... `);
  try {
    const r = await axios.post(API_URL, BODY, { headers, timeout: 15000 });
    const status = r.data?.status;
    if (status === 'SUCCESS') {
      const count = r.data?.data?.count_product;
      console.log(`✅ SUCCESS! count_product: ${count}`);
      console.log(`   ✨ Headers ที่ใช้ได้: ${JSON.stringify(headers)}`);
      return true;
    } else {
      console.log(`⚠️  status: ${status} — ${JSON.stringify(r.data).slice(0,200)}`);
      return false;
    }
  } catch(e) {
    console.log(`❌ HTTP ${e.response?.status}: ${JSON.stringify(e.response?.data || e.message).slice(0,150)}`);
    return false;
  }
}

async function getPageCookiesAndToken() {
  console.log('\n📡 Step 1: GET advice.co.th เพื่อดึง cookies...');
  const r = await axios.get(ADVICE_HOME, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    timeout: 20000,
    maxRedirects: 5,
  });

  const setCookies = r.headers['set-cookie'] || [];
  const cookies = {};
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const [key, val] = pair.split('=');
    cookies[key.trim()] = val?.trim();
  }
  console.log('   Cookies received:', Object.keys(cookies).join(', '));
  console.log('   user_token:', cookies['user_token'] ? cookies['user_token'].slice(0, 60) + '...' : 'NOT FOUND');
  console.log('   user_refreshToken:', cookies['user_refreshToken'] ? 'found' : 'NOT FOUND');
  return { cookies, cookieStr: setCookies.map(c => c.split(';')[0]).join('; ') };
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('PHASE 2: HTTP Token Extraction Test');
  console.log('═══════════════════════════════════════');

  const { cookies, cookieStr } = await getPageCookiesAndToken();
  const userToken = cookies['user_token'];

  if (!userToken) {
    console.log('\n❌ ไม่ได้ user_token จาก cookie — ไม่สามารถดำเนินการต่อได้');
    return;
  }

  const baseHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'th-TH,th;q=0.9',
    'Origin': 'https://www.advice.co.th',
    'Referer': 'https://www.advice.co.th/product/search?keyword=iphone',
    'User-Agent': UA,
  };

  console.log('\n─── ทดสอบวิธีต่างๆ ───');

  // วิธี 1: user_token เป็น Bearer โดยตรง
  await test('user_token as Bearer', {
    ...baseHeaders,
    'Authorization': `Bearer ${userToken}`,
  });

  // วิธี 2: user_token ไม่มี Bearer prefix
  await test('user_token raw', {
    ...baseHeaders,
    'Authorization': userToken,
  });

  // วิธี 3: ส่งผ่าน cookie header
  await test('Cookie header', {
    ...baseHeaders,
    'Cookie': cookieStr,
  });

  // วิธี 4: Cookie + Authorization ด้วย Bearer user_token
  await test('Cookie + Bearer', {
    ...baseHeaders,
    'Cookie': cookieStr,
    'Authorization': `Bearer ${userToken}`,
  });

  // วิธี 5: ดู API backend ว่ามี refresh endpoint ไหม
  console.log('\n📡 Step 2: ลองหา refresh token endpoint...');
  const refreshEndpoints = [
    'https://prodbackadvice.advice.in.th/api/v1.0.0/auth/refresh',
    'https://prodbackadvice.advice.in.th/api/v1.0.0/user/refresh',
    'https://prodbackadvice.advice.in.th/api/v1.0.0/token/refresh',
    'https://www.advice.co.th/api/auth/refresh',
    'https://www.advice.co.th/api/v1.0.0/auth/refresh',
  ];

  const refreshToken = cookies['user_refreshToken'];
  for (const endpoint of refreshEndpoints) {
    try {
      process.stdout.write(`   GET ${endpoint}... `);
      const r = await axios.post(endpoint,
        { refreshToken },
        { headers: { ...baseHeaders, 'Cookie': cookieStr }, timeout: 5000, validateStatus: () => true }
      );
      console.log(`status: ${r.status} — ${JSON.stringify(r.data).slice(0,100)}`);
    } catch(e) {
      console.log(`error: ${e.message.slice(0,50)}`);
    }
  }

  // วิธี 6: ลองเรียก API ด้วย next.js auth endpoint
  console.log('\n📡 Step 3: ลอง Next.js auth API...');
  try {
    const nextAuth = await axios.get('https://www.advice.co.th/api/auth/session', {
      headers: { ...baseHeaders, 'Cookie': cookieStr },
      timeout: 10000,
      validateStatus: () => true
    });
    console.log('   /api/auth/session:', JSON.stringify(nextAuth.data).slice(0,200));
  } catch(e) {
    console.log('   error:', e.message);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('Phase 2 เสร็จแล้ว');
  console.log('═══════════════════════════════════════');
}

main().catch(console.error);
