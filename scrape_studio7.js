const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    console.log('Loading Studio7 search page...');
    await page.goto('https://www.studio7thailand.com/th/search/iPhone', { waitUntil: 'networkidle2' });
    
    // Auto scroll to load more
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 800;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if(totalHeight >= scrollHeight - window.innerHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 300);
            setTimeout(() => { clearInterval(timer); resolve(); }, 8000); // 8 seconds max
        });
    });
    
    const products = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('a').forEach(el => {
            const titleEl = el.querySelector('h3, .product-title, [class*="title"], [class*="name"]');
            const priceEl = el.querySelector('.price, [class*="price"]');
            if (titleEl && priceEl && titleEl.innerText.toLowerCase().includes('iphone')) {
                items.push({
                    title: titleEl.innerText.trim(),
                    price: priceEl.innerText.trim().replace(/[^0-9]/g, '')
                });
            }
        });
        return items;
    });

    console.log('Found', products.length, 'products');
    console.log(products.filter(p => parseInt(p.price) > 5000).slice(0, 10));
    
    await browser.close();
})();
