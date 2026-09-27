const axios = require('axios');

async function testToken() {
  try {
    const res1 = await axios.get('https://www.advice.co.th/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    let token = '';
    if (res1.headers['set-cookie']) {
      const tokenCookie = res1.headers['set-cookie'].find(c => c.startsWith('user_token='));
      if (tokenCookie) {
        token = tokenCookie.split(';')[0].split('=')[1];
      }
    }
    console.log('Extracted Token:', token.substring(0, 30));

    const res2 = await axios.post('https://www.advice.co.th/_advice-api/api/v1.0.0/product/get', {
      category: 'iphone', take: 10, skip: 0, page: 'product', group_end: false
    }, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status:', res2.status);
    console.log('Count:', res2.data.data.count_product);
    
  } catch(e) {
    console.log('Error:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  }
}
testToken();
