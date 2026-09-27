const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldPush = `            const modelCode = p.code || '-';
            if (allProducts.some(existing => existing.modelCode === modelCode && modelCode !== '-')) return;
            
            allProducts.push({`;
            
const newPush = `            const modelCode = p.code || '-';
            if (allProducts.some(existing => existing.modelCode === modelCode && modelCode !== '-')) return;
            
            const nameLow = (p.name || p.product || '').toLowerCase();
            if (categoryKey === 'iphone' && !nameLow.includes('iphone')) return;
            if (categoryKey === 'ipad' && !nameLow.includes('ipad')) return;
            if (categoryKey === 'macbook' && !(nameLow.includes('macbook') || nameLow.includes('mac ') || nameLow.includes('imac') || nameLow.includes('mac mini') || nameLow.includes('mac studio'))) return;
            if (categoryKey === 'iphone' && (nameLow.includes('case') || nameLow.includes('magsafe') || nameLow.includes('cable') || nameLow.includes('adapter') || nameLow.includes('wallet') || nameLow.includes('film') || nameLow.includes('glass'))) return;
            if (categoryKey === 'ipad' && (nameLow.includes('case') || nameLow.includes('pencil') || nameLow.includes('keyboard') || nameLow.includes('folio') || nameLow.includes('film') || nameLow.includes('glass'))) return;
            
            allProducts.push({`;

if(code.includes(oldPush)) {
  code = code.replace(oldPush, newPush);
  fs.writeFileSync('server.js', code);
  console.log('Replaced successfully');
} else {
  console.log('Could not find old push block');
}
