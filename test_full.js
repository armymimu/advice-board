const fs = require('fs');
const axios = require('axios');

(async () => {
  const tokenData = JSON.parse(fs.readFileSync('.token_cache.json', 'utf8'));
  const token = tokenData.token;

  const headers = { 'Content-Type': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'Authorization': token };
  
  const categories = ['iphone', 'ipad', 'macbook', 'smart-phone'];

  for (const cat of categories) {
    console.log(`\n========== ${cat.toUpperCase()} ==========`);
    let allProducts = [];
    let skip = 0;
    let total = Infinity;
    
    while (skip < total) {
      const resp = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
        category: cat, category_sub: '', product: '', keyword: '',
        take: 100, skip: skip, refSearch: '', page: 'product',
        arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
      }, { headers });

      const d = resp.data.data;
      
      if (total === Infinity && d.count_product) {
        total = d.count_product;
        console.log(`Total available: ${total}`);
      }
      
      // Category responses have a flat product array or grouped
      let products = [];
      if (d.product && Array.isArray(d.product)) {
        // Could be flat array of products or grouped
        if (d.product.length > 0 && d.product[0].code) {
          // Flat array
          products = d.product;
        } else if (d.product.length > 0 && d.product[0].product) {
          // Grouped
          d.product.forEach(g => {
            if (Array.isArray(g.product)) products.push(...g.product);
          });
        }
      }
      
      if (products.length === 0) break;
      allProducts.push(...products);
      skip += 100;
      
      console.log(`  Fetched: ${allProducts.length} / ${total} (skip=${skip})`);
      
      if (allProducts.length >= total) break;
    }
    
    console.log(`  FINAL: ${allProducts.length} products`);
    if (allProducts.length > 0) {
      console.log(`  First: ${allProducts[0].product}`);
      console.log(`  Last: ${allProducts[allProducts.length-1].product}`);
    }
  }
})();
