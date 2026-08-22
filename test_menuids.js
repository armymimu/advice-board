const axios = require('axios');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function getToken() {
  const r = await axios.get('https://www.advice.co.th/product/iphone', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, timeout: 20000, maxRedirects: 5,
  });
  for (const c of (r.headers['set-cookie'] || [])) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx >= 0 && pair.slice(0, idx).trim() === 'user_token')
      return `Bearer ${pair.slice(idx + 1).trim()}`;
  }
}

function countAndSample(data) {
  const prod = data?.data?.product;
  if (!prod) return { n: 0, sample: null };
  let n = 0, sample = null;
  if (typeof prod === 'object' && !Array.isArray(prod)) {
    for (const v of Object.values(prod)) {
      const arr = Array.isArray(v?.product) ? v.product : (Array.isArray(v) ? v : []);
      n += arr.length;
      if (!sample && arr[0]) sample = arr[0];
    }
  }
  return { n, sample };
}

async function tryBody(token, body, label) {
  try {
    const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', body, {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/product/iphone', 'User-Agent': UA, 'Authorization': token },
      timeout: 10000, validateStatus: () => true,
    });
    const { n, sample } = countAndSample(r.data);
    const count = r.data?.data?.count_product;
    const status = r.data?.status;
    const mark = n > 0 ? '✅' : status === 'SUCCESS' ? '(empty)' : '❌';
    console.log(`${mark} [${label}] status=${status} count=${count} items=${n}${sample ? ' brand='+sample.brand : ''}`);
    if (n > 0 && sample) console.log(`   sample: ${(sample.product||'').slice(0,60)} price=${sample.price_sale}`);
  } catch(e) { console.log(`❌ [${label}] ERROR: ${e.message.slice(0,50)}`); }
}

async function main() {
  const token = await getToken();
  const base = { category_sub:'', product:'', keyword:'', take:10, skip:0, refSearch:'', page:'product', arr_filter_brand:[], arr_filter_ict:[], arr_filter_price_ict:[], arr_filter_cate:[], addView:false };

  console.log('=== iPhone (menu_list_id=344, group_id=33) ===');
  await tryBody(token, { ...base, category:'iphone', menu_list_id: 344 }, 'iphone+menu_list_id=344');
  await tryBody(token, { ...base, category:'iphone', group_id: 33 }, 'iphone+group_id=33');
  await tryBody(token, { ...base, category:'iphone', menu_list_id: 344, group_id: 33 }, 'iphone+both');
  await tryBody(token, { ...base, category:'iphone', menu_list_id: '344' }, 'iphone+menu_list_id="344"');

  // ลองหา iPad menu_list_id
  console.log('\n=== ดึง iPad page เพื่อหา menu_list_id ===');
  const ipadPage = await axios.get('https://www.advice.co.th/product/ipad', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, timeout: 20000, maxRedirects: 5,
  });
  const ipadHtml = ipadPage.data;
  const ipadMenuIds = [...ipadHtml.matchAll(/menu_list_id['":\s]+['""]?(\d+)/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,5);
  const ipadGroupIds = [...ipadHtml.matchAll(/group_id['":\s]+['""]?(\d+)/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,5);
  console.log('iPad menu_list_ids:', ipadMenuIds);
  console.log('iPad group_ids:', ipadGroupIds);
  
  for (const mid of ipadMenuIds.slice(0,3)) {
    await tryBody(token, { ...base, category:'ipad', menu_list_id: parseInt(mid) }, `ipad+menu_list_id=${mid}`);
  }

  // ลองสำหรับ iPhone กับ menu_list_ids ที่ได้
  const iphonePage = await axios.get('https://www.advice.co.th/product/iphone', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, timeout: 20000, maxRedirects: 5,
  });
  const iphoneHtml = iphonePage.data;
  const allMenuIds = [...iphoneHtml.matchAll(/menu_list_id['":\s]+['""]?(\d+)/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i);
  console.log('\niPhone menu_list_ids all:', allMenuIds);
  
  // ลองแต่ละ menu_list_id
  console.log('\n=== ลองทุก menu_list_id สำหรับ iPhone ===');
  for (const mid of allMenuIds.slice(0,10)) {
    await tryBody(token, { ...base, category:'iphone', menu_list_id: parseInt(mid) }, `iphone+mid=${mid}`);
  }
}

main().catch(console.error);
