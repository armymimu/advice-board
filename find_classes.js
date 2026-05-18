const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 8000)); // wait longer
  
  const results = await page.evaluate(() => {
    const arr = [];
    const elements = document.querySelectorAll('*');
    for (let el of elements) {
      if (el.innerText && el.innerText.includes('Apple iPhone 16')) {
        let parent = el.parentElement;
        while(parent && parent.className && parent.className.includes(' ')) {
          parent = parent.parentElement;
        }
        arr.push({
          tag: el.tagName,
          className: el.className,
          text: el.innerText.substring(0, 50),
          parentClass: el.parentElement ? el.parentElement.className : '',
          grandParentClass: el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement.className : ''
        });
      }
    }
    return arr;
  });
  
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
