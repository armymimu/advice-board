const axios = require('axios');
async function test() {
  const res = await axios.get('https://www.advice.co.th/', { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const tokenCookie = res.headers['set-cookie'].find(c => c.startsWith('user_token='));
  const token = tokenCookie.split(';')[0].split('=')[1];
  
  const res2 = await axios.post('https://www.advice.co.th/_advice-api/api/v1.0.0/product/get', {
    category: 'iphone', take: 100, skip: 0, page: 'product', group_end: false
  }, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  
  const d = res2.data.data;
  
  const fs = require('fs');
  fs.writeFileSync('dump.json', JSON.stringify(d, null, 2));
  console.log('Dumped to dump.json');
}
test();
