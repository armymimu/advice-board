const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldFunc = `      const content = data.data.category_content;
      if (skip === 0) total = data.data.count_product || 0;
      if (content.length === 0) break;
      
      content.forEach(group => {
        if (group.product && Array.isArray(group.product)) {
          group.product.forEach(p => {
            if (categoryKey === 'android' && (p.brand || '').toUpperCase() === 'APPLE') return;
            
            allProducts.push({
              model: p.name || p.product || '',
              spec: p.description || p.spec || '-',
              modelCode: p.code || '-',
              price: p.price_sale || p.price || 0,
              priceSrp: p.price_srp || p.price || 0,
              brand: p.brand || '',
              image: p.image || p.pic_url || '',
              url: p.product_url ? 'https://www.advice.co.th/product/' + p.product_url : '',
              inStock: p.stock > 0 || p.type === 'instock'
            });
          });
        }
      });
      
      skip += 100;
      if (content.length < 100) break;`;

const newFunc = `      const productObj = data.data.product;
      if (skip === 0) total = data.data.count_product || 0;
      if (!productObj) break;
      
      const groups = Object.values(productObj);
      if (groups.length === 0) break;
      
      groups.forEach(group => {
        if (group.product && Array.isArray(group.product)) {
          group.product.forEach(p => {
            if (categoryKey === 'android' && (p.brand || '').toUpperCase() === 'APPLE') return;
            
            allProducts.push({
              model: p.name || p.product || '',
              spec: p.description || p.spec || '-',
              modelCode: p.code || '-',
              price: p.price_sale || p.price || 0,
              priceSrp: p.price_srp || p.price || 0,
              brand: p.brand || '',
              image: p.image || p.pic_url || '',
              url: p.product_url ? 'https://www.advice.co.th/product/' + p.product_url : '',
              inStock: p.stock > 0 || p.type === 'instock'
            });
          });
        }
      });
      
      skip += 100;
      if (groups.length < 100) break;`;

code = code.replace(oldFunc, newFunc);
fs.writeFileSync('server.js', code);
console.log('Replaced fetch logic.');
