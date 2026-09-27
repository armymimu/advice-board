const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const oldFetch = `    const url = \`\${baseUrl}/api/prices/\${category}\`;
    const response = await fetch(url);
    const data = await response.json();`;

const newFetch = `    const url = \`\${baseUrl}/api/prices/\${category}\`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
    
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch(err) {
      if (err.name === 'AbortError') {
        throw new Error('เซิร์ฟเวอร์ไม่ตอบสนอง (Timeout) กรุณาลองใหม่อีกครั้ง');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      throw new Error('เซิร์ฟเวอร์ตอบกลับผิดพลาด: ' + text.substring(0, 100));
    }`;

if (code.includes('const response = await fetch(url);')) {
  code = code.replace(oldFetch, newFetch);
  fs.writeFileSync('app.js', code);
  console.log('App.js fetch patched');
}
