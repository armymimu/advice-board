const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', {waitUntil: 'networkidle2'});
  await page.waitForSelector('.list-product');
  const html = await page.evaluate(() => document.body.innerHTML);
  const match = html.match(/class="[^"]*page[^"]*"/g);
  console.log('Matches:', [...new Set(match)]);
  await browser.close();
})();
