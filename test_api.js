const axios = require('axios');

(async () => {
  try {
    // Try fetching with take=200 to get all at once
    const resp = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
      category: 'search',
      category_sub: '',
      product: '',
      keyword: 'iphone',
      take: 200,
      skip: 0,
      refSearch: '',
      page: 'product',
      arr_filter_brand: [],
      arr_filter_ict: [],
      arr_filter_price_ict: [],
      arr_filter_cate: [],
      addView: false
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.advice.co.th',
        'Referer': 'https://www.advice.co.th/'
      }
    });

    const data = resp.data;
    console.log('Status:', resp.status);
    console.log('Keys:', Object.keys(data));
    
    if (data.data) {
      console.log('Data keys:', Object.keys(data.data));
      if (data.data.products) {
        console.log('Products count:', data.data.products.length);
        if (data.data.products.length > 0) {
          const p = data.data.products[0];
          console.log('\nFirst product keys:', Object.keys(p));
          console.log('Sample:', JSON.stringify(p, null, 2).substring(0, 1000));
        }
      }
      if (data.data.total !== undefined) {
        console.log('Total available:', data.data.total);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
    if (e.response) {
      console.error('Status:', e.response.status);
      console.error('Data:', JSON.stringify(e.response.data).substring(0, 500));
    }
  }
})();
