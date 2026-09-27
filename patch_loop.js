const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldCheck = `      let itemsAddedThisPage = 0;
      
      groups.forEach(group => {
        if (group.product && Array.isArray(group.product)) {
          group.product.forEach(p => {`;

const newCheck = `      let itemsAddedThisPage = 0;
      let itemsReturnedThisPage = 0;
      
      groups.forEach(group => {
        if (group.product && Array.isArray(group.product)) {
          itemsReturnedThisPage += group.product.length;
          group.product.forEach(p => {`;

if (code.includes(oldCheck)) {
  code = code.replace(oldCheck, newCheck);
}

const oldBreak = `      if (itemsAddedThisPage === 0) break; // End of pagination
      if (itemsAddedThisPage < 100 && skip !== 0) break; // Reached last page`;

const newBreak = `      if (itemsReturnedThisPage === 0) break; // End of pagination
      if (itemsReturnedThisPage < 100 && skip !== 0) break; // Reached last page`;

if (code.includes(oldBreak)) {
  code = code.replace(oldBreak, newBreak);
}

fs.writeFileSync('server.js', code);
console.log('Patched');
