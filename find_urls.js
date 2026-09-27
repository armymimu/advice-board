const fs = require('fs');
const html = fs.readFileSync('iphone.html', 'utf8');
const urls = html.match(/\/_advice-api[^\"]+/g);
if(urls) {
  console.log([...new Set(urls)].join('\n'));
} else console.log('No URLs found');
