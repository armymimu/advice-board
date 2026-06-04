const axios = require('axios');
async function test() {
  try {
    const r = await axios.get('https://advice-board.onrender.com/api/prices/iphone');
    console.log(r.data);
  } catch (e) {
    console.log('STATUS:', e.response?.status);
    console.log('DATA:', JSON.stringify(e.response?.data, null, 2));
    console.log('MSG:', e.message);
  }
}
test();
