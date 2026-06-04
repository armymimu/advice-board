const axios = require('axios');

async function test() {
  try {
    const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
      keyword: 'iphone', sort: '', limit: 50, offset: 0
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.advice.co.th',
        'Referer': 'https://www.advice.co.th/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log("SUCCESS:", r.data.data.total);
  } catch (e) {
    console.error("FAIL:", e.response ? e.response.status : e.message);
  }
}
test();
