const axios = require('axios');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function getToken() {
  const r = await axios.get('https://www.advice.co.th/product/iphone', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, timeout: 20000, maxRedirects: 5,
  });
  let token = '';
  for (const c of (r.headers['set-cookie'] || [])) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx >= 0 && pair.slice(0, idx).trim() === 'user_token')
      token = `Bearer ${pair.slice(idx + 1).trim()}`;
  }

  // ดู HTML ว่ามี category ID/slug อะไรบ้าง
  const html = r.data || '';
  console.log('=== HTML length:', html.length);
  
  // หา category slug จาก Next.js __NEXT_DATA__ 
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const json = JSON.parse(m[1]);
      const pageProps = json?.props?.pageProps;
      console.log('\n=== pageProps keys:', Object.keys(pageProps || {}).join(', '));
      
      // ดู category info
      const cat = pageProps?.category || pageProps?.categoryData || pageProps?.menu;
      if (cat) console.log('category data:', JSON.stringify(cat).slice(0, 500));
      
      // ดู API call info
      const query = json?.query;
      console.log('query:', JSON.stringify(query));
      
      // ดู initial data
      const initData = pageProps?.initialData || pageProps?.data;
      if (initData) {
        console.log('\ninitialData keys:', Object.keys(initData).join(', '));
        // หา products
        const prod = initData?.product || initData?.products;
        if (prod) {
          if (typeof prod === 'object' && !Array.isArray(prod)) {
            const keys = Object.keys(prod);
            console.log('product obj keys:', keys.slice(0,5));
            if (keys[0]) {
              const firstItem = prod[keys[0]];
              console.log('product[0] type:', typeof firstItem, Array.isArray(firstItem) ? 'array' : '');
              if (firstItem?.product) {
                console.log('product[0].product sample:', JSON.stringify(firstItem.product[0]).slice(0,300));
              }
            }
          }
          console.log('count_product:', initData?.count_product);
        }
        
        // ดู API params ที่ใช้
        const apiParams = initData?.apiParams || pageProps?.apiParams;
        if (apiParams) console.log('\napiParams:', JSON.stringify(apiParams).slice(0,300));
      }

      // หา category slug
      const slug = json?.query?.category || json?.query?.slug || json?.query?.id;
      console.log('\nRoute query:', JSON.stringify(json?.query));
      console.log('Router:', JSON.stringify(json?.page));
      
    } catch(e) {
      console.log('Parse error:', e.message);
      console.log('__NEXT_DATA__ preview:', m[1].slice(0, 500));
    }
  } else {
    console.log('\nไม่พบ __NEXT_DATA__');
    // หา API call ใน HTML
    const apiMatches = [...html.matchAll(/prodbackadvice[^"'\s]*/g)].map(m => m[0]).slice(0,5);
    console.log('API URLs in HTML:', apiMatches);
  }
  
  return token;
}

async function tryWithMenuId(token, category, menuId) {
  try {
    const body = {
      category, category_sub: '', product: '', keyword: '',
      take: 5, skip: 0, refSearch: '', page: 'product',
      arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false,
    };
    if (menuId) body.menu_id = menuId;
    
    const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', body, {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'User-Agent': UA, 'Authorization': token },
      timeout: 10000, validateStatus: () => true,
    });
    const prod = r.data?.data?.product;
    let n = 0;
    if (prod && typeof prod === 'object' && !Array.isArray(prod)) {
      for (const v of Object.values(prod)) if (Array.isArray(v?.product)) n += v.product.length;
    }
    return { status: r.data?.status, items: n, count: r.data?.data?.count_product };
  } catch(e) { return { error: e.message }; }
}

async function main() {
  console.log('=== Inspecting advice.co.th/product/iphone ===\n');
  const token = await getToken();
  
  if (!token) { console.log('No token!'); return; }
  
  // ลอง menu_id / group_id ต่างๆ
  console.log('\n=== Try with menu_id params ===');
  const toTry = [
    ['iphone', null],
    ['iphone', '1'],
    ['iphone', '100'],
    ['iphone', '101'],
    ['iphone', '200'],
    // ลอง category_sub
    ['apple', null],
  ];
  
  for (const [cat, mid] of toTry) {
    const r = await tryWithMenuId(token, cat, mid);
    console.log(`category=${cat} menu_id=${mid}: status=${r.status} items=${r.items} count=${r.count} ${r.error||''}`);
  }
}

main().catch(console.error);
