const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');
const lines = code.split('\n');
const start = lines.findIndex(l => l.includes('async function fetchAdviceCategory'));
const end = lines.findIndex((l, i) => i > start && l.includes('return allProducts;'));
const endFn = lines.findIndex((l, i) => i > end && l.startsWith('}'));

const newFn = `async function fetchAdviceCategory(categoryKey) {
  let allProducts = [];
  const token = await getApiToken();
  if (!token) throw new Error('ไม่สามารถขอ Token จากระบบได้');

  let skip = 0;
  let retryCount = 0;
  const isSearchApi = ['iphone', 'ipad', 'macbook'].includes(categoryKey);

  while (true) {
    try {
      let endpoint = 'https://www.advice.co.th/_advice-api/api/v1.0.0/product/get';
      let reqPayload = {};
      
      if (isSearchApi) {
        endpoint = 'https://www.advice.co.th/_advice-api/api/v1.0.0/product/search';
        reqPayload = {
          keyword: categoryKey === 'macbook' ? 'macbook' : categoryKey,
          sort: 'desc',
          order: 'popular',
          take: 20,
          skip: skip
        };
      } else {
        reqPayload = {
          category: 'smartphone-tablet',
          category_sub: 'smartphone',
          group_end: true,
          take: 100,
          skip: skip,
          page: 'product'
        };
      }

      await new Promise(r => setTimeout(r, 1500));
      
      const res = await axios.post(endpoint, reqPayload, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const data = res.data;
      if (!data || !data.data || !data.data.product) break;
      
      const pObj = data.data.product;
      const groups = Object.values(pObj);
      if (groups.length === 0) break;
      
      let itemsAddedThisPage = 0;
      let itemsReturnedThisPage = 0;
      
      groups.forEach(group => {
        if (group.product && Array.isArray(group.product)) {
          itemsReturnedThisPage += group.product.length;
          group.product.forEach(p => {
            if (categoryKey === 'android' && (p.brand || '').toUpperCase() === 'APPLE') return;
            
            const modelCode = p.code || '-';
            if (allProducts.some(existing => existing.modelCode === modelCode && modelCode !== '-')) return;
            
            const nameLow = (p.name || p.product || '').toLowerCase();
            
            const badWords = ['case', 'เคส', 'film', 'ฟิล์ม', 'glass', 'กระจก', 'magsafe', 'cable', 'สายชาร์จ', 'สาย', 'adapter', 'หัวชาร์จ', 'อะแดปเตอร์', 'อะแดปปเตอร์', 'wallet', 'pencil', 'ปากกา', 'keyboard', 'คีย์บอร์ด', 'folio', 'mouse', 'เมาส์', 'trackpad', 'แทร็คแพด', 'hub', 'dongle', 'dock', 'ซอง', 'กระเป๋า', 'bag', 'sleeve', 'airpods', 'earpods', 'watch', 'strap', 'สายนาฬิกา', 'apple tv', 'care+', 'applecare', 'ประกัน', 'warranty', 'smart tag', 'airtag', 'ซิม', 'sim', 'ลำโพง', 'speaker', 'ขาตั้ง', 'stand', 'ชาร์จไร้สาย', 'wireless charger', 'หูฟัง', 'headphone', 'earbud'];
            if (badWords.some(w => nameLow.includes(w))) return;

            if (categoryKey === 'iphone' && !nameLow.includes('iphone')) return;
            if (categoryKey === 'ipad' && !nameLow.includes('ipad')) return;
            if (categoryKey === 'macbook' && !(nameLow.includes('macbook') || nameLow.includes('mac ') || nameLow.includes('imac') || nameLow.includes('mac mini') || nameLow.includes('mac studio'))) return;
            
            allProducts.push({
              model: p.name || p.product || '',
              spec: p.spec || '',
              price: p.price_sale || p.price || 0,
              modelCode: modelCode,
              brand: p.brand || '',
              image: p.image || p.pic_url || '',
              url: p.product_url ? 'https://www.advice.co.th/product/' + p.product_url : '',
              inStock: p.stock > 0 || p.type === 'instock'
            });
            itemsAddedThisPage++;
          });
        }
      });
      
      if (itemsReturnedThisPage === 0) break;
      if (itemsReturnedThisPage < (isSearchApi ? 20 : 100) && skip !== 0) break;
      
      skip += (isSearchApi ? 20 : 100);
      if (skip >= (isSearchApi ? 1000 : 2000)) break;
      
    } catch(err) {
      if (err.response && err.response.status === 401) {
        cachedApiToken = null; 
      }
      retryCount++;
      if (retryCount > 3) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return allProducts;
}`;

lines.splice(start, endFn - start + 1, newFn);
fs.writeFileSync('server.js', lines.join('\n'));
console.log('Replaced function');
