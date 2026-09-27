const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldHeader = `'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'`;
const newHeader = `'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"'`;

code = code.replace(oldHeader, newHeader);

// In getApiToken, we also have oldHeader
const oldHeader2 = `'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'`;
const newHeader2 = `'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7'`;

code = code.replace(oldHeader2, newHeader2);

const loopStart = `      const res = await axios.post('https://www.advice.co.th/_advice-api/api/v1.0.0/product/get'`;
const loopStartWithDelay = `      // Sleep for 1.5 seconds to prevent rate limiting (Cloudflare block)
      await new Promise(r => setTimeout(r, 1500));
      
      const res = await axios.post('https://www.advice.co.th/_advice-api/api/v1.0.0/product/get'`;

code = code.replace(loopStart, loopStartWithDelay);

fs.writeFileSync('server.js', code);
console.log('Headers and delay patched');
