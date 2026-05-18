const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');
content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('index.html', content);
