const axios = require('axios');
const fs = require('fs');

async function extractToken() {
  try {
    const { data: html } = await axios.get('https://www.advice.co.th/product/search?keyword=iphone', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    fs.writeFileSync('advice_html.txt', html);
    console.log("HTML saved. Length:", html.length);
    
    // Extract the JWT token directly from the HTML source
    const match = html.match(/"(eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_.-]+)"/);
    if (match) {
      console.log("FOUND TOKEN:", match[1].substring(0, 50) + "...");
    } else {
      console.log("No token found in HTML text.");
    }
  } catch(e) {
    console.error("Error:", e.message);
  }
}
extractToken();
