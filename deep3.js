/**
 * ดึง HTML ของ advice.co.th/product/iphone แล้วหา API endpoint ที่ถูกเรียก
 * รวมถึง inspect JS chunk files เพื่อหา API pattern
 */
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
    if (idx >= 0 && pair.slice(0, idx).trim() === 'user_token') token = `Bearer ${pair.slice(idx + 1).trim()}`;
  }
  return { token, html: r.data };
}

async function main() {
  const { token, html } = await getToken();
  console.log('Token OK, HTML length:', html.length);

  // หา __NUXT__ state ใน Nuxt 3
  const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*([\s\S]*?);\s*<\/script>/);
  if (nuxtMatch) {
    console.log('\n=== Found __NUXT__ data ===');
    try {
      // ใน Nuxt 3 อาจเป็น function call ไม่ใช่ JSON
      const raw = nuxtMatch[1].slice(0, 3000);
      console.log(raw.slice(0, 1000));
    } catch(e) { console.log('parse err:', e.message); }
  }

  // หา SSR payload (Nuxt 3 ใช้ inline <script> พร้อม payload)
  const payloadMatch = html.match(/<script type="application\/json" id="__NUXT_DATA__">([\s\S]*?)<\/script>/);
  if (payloadMatch) {
    console.log('\n=== Found __NUXT_DATA__ ===');
    try {
      const data = JSON.parse(payloadMatch[1]);
      console.log('Type:', typeof data, Array.isArray(data) ? 'array len='+data.length : '');
      // หา API URLs
      const str = JSON.stringify(data);
      const apiMatches = [...str.matchAll(/prodbackadvice[^"\\]*/g)].map(m=>m[0]).slice(0,10);
      console.log('API calls found:', apiMatches);
      // หา category/product info
      const catMatches = [...str.matchAll(/"category[^"]*":"([^"]{2,30})"/g)].map(m=>m[0]).slice(0,20);
      console.log('Category values:', catMatches.join(' | '));
      const countMatches = [...str.matchAll(/"count_product":(\d+)/g)].map(m=>m[0]).slice(0,5);
      console.log('count_product values:', countMatches.join(', '));
    } catch(e) { console.log('parse err:', e.message); console.log('raw:', payloadMatch[1].slice(0,500)); }
  }
  
  // หา inline API data จาก SSR
  const inlineMatches = [...html.matchAll(/"count_product"\s*:\s*(\d+)/g)].map(m=>m[0]);
  console.log('\n=== count_product in HTML:', inlineMatches.join(', ') || '(none)');

  const brandMatches = [...html.matchAll(/"brand"\s*:\s*"([^"]{1,20})"/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,10);
  console.log('Brands in HTML:', brandMatches.join(', ') || '(none)');
  
  // ดู API endpoints ทั้งหมดที่อยู่ใน HTML
  const allApis = [...html.matchAll(/api\/v[\d.]+\/[a-z/]+/g)].map(m=>m[0]).filter((v,i,a)=>a.indexOf(v)===i);
  console.log('\nAll API patterns:', allApis.join(', ') || '(none)');
  
  // หา globalapi.advice.co.th calls
  const globalApi = [...html.matchAll(/globalapi[^"'\s]*/g)].map(m=>m[0]).slice(0,5);
  console.log('GlobalAPI calls:', globalApi.join(', ') || '(none)');

  // ลอง globalapi endpoint
  if (token) {
    console.log('\n=== ลอง globalapi.advice.co.th ===');
    const globalEndpoints = [
      'https://globalapi.advice.co.th/api/v1.0.0/product/get',
      'https://globalapi.advice.co.th/api/product/get',
      'https://globalapi.advice.co.th/product/iphone',
    ];
    const body = { category:'iphone', category_sub:'', product:'', keyword:'', take:5, skip:0, refSearch:'', page:'product', arr_filter_brand:[], arr_filter_ict:[], arr_filter_price_ict:[], arr_filter_cate:[], addView:false };
    for (const ep of globalEndpoints) {
      try {
        const r = await axios.post(ep, body, {
          headers: { 'Content-Type':'application/json', 'Accept':'application/json', 'Origin':'https://www.advice.co.th', 'User-Agent':UA, 'Authorization':token },
          timeout: 8000, validateStatus:()=>true,
        });
        console.log(`${ep.replace('https://globalapi.advice.co.th','')}: ${r.status} ${JSON.stringify(r.data).slice(0,150)}`);
      } catch(e) { console.log(`${ep}: ERR ${e.message.slice(0,50)}`); }
    }
  }

  // ดู JS chunk ที่น่าสนใจ
  const jsMatches = [...html.matchAll(/src="([^"]*\/_nuxt\/[^"]+\.js)"/g)].map(m=>m[1]).slice(0,5);
  console.log('\n=== JS Chunks ===');
  console.log(jsMatches.join('\n'));
  
  if (jsMatches[0]) {
    try {
      const jsUrl = jsMatches[0].startsWith('http') ? jsMatches[0] : `https://www.advice.co.th${jsMatches[0]}`;
      const jsR = await axios.get(jsUrl, { headers: {'User-Agent':UA}, timeout:15000 });
      const js = jsR.data;
      // หา API pattern
      const apiCalls = [...js.matchAll(/\/api\/v[\d.]+\/[a-z/]+/g)].map(m=>m[0]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,20);
      console.log('\nAPI paths in JS:', apiCalls.join(', '));
      // หา category keywords
      const catKws = [...js.matchAll(/"iphone"|"ipad"|"smartphone"|"notebook"|"apple"/g)].map(m=>m[0]).filter((v,i,a)=>a.indexOf(v)===i);
      console.log('Category keywords:', catKws.join(', '));
    } catch(e) { console.log('JS fetch err:', e.message.slice(0,50)); }
  }
}

main().catch(console.error);
