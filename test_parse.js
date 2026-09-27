const axios = require('axios');
async function test() {
  const res = await axios.get('https://www.advice.co.th/', { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const tokenCookie = res.headers['set-cookie'].find(c => c.startsWith('user_token='));
  if (!tokenCookie) { console.log('no token'); return; }
  const token = tokenCookie.split(';')[0].split('=')[1];
  
  const res2 = await axios.post('https://www.advice.co.th/_advice-api/api/v1.0.0/product/get', {
    category: 'iphone', take: 100, skip: 0, page: 'product', group_end: false
  }, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  
  const d = res2.data.data;
  const products = [];
  
  // Recursively find all objects that look like a product
  function findProducts(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.name && obj.price_sale !== undefined && obj.code) {
      products.push(obj);
    } else {
      Object.values(obj).forEach(val => findProducts(val));
    }
  }
  
  findProducts(d);
  
  console.log('Found products:', products.length);
  if (products.length > 0) {
    console.log('Sample name:', products[0].name);
    console.log('Sample code:', products[0].code);
    console.log('Sample price:', products[0].price_sale);
  }
}
test();
