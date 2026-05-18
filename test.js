const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  
  await page.goto('https://www.advice.co.th/search?keyword=iphone', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 5000));
  
  const html = await page.content();
  fs.writeFileSync('advice_html.txt', html);
  
  await browser.close();
})();
