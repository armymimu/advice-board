const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

const SECRET = 'armymimu2024';
const SERVER_URL = 'https://advice-board.onrender.com';

(async () => {
    console.log('====================================');
    console.log('  Advice & Studio7 Auto-Updater');
    console.log('====================================\n');

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        // 1. Get Advice Token
        console.log('[1/2] 🔑 ดึง Token จาก Advice...');
        let adviceToken = '';
        page.on('request', r => {
            if (r.url().includes('prodbackadvice') && r.url().includes('product/get') && r.method() === 'POST') {
                const h = r.headers();
                if (h.authorization && !adviceToken) {
                    adviceToken = h.authorization;
                }
            }
        });

        await page.goto('https://www.advice.co.th/product/search?keyword=iphone', { waitUntil: 'networkidle2' });
        try { await page.waitForSelector('.list-product', { timeout: 15000 }); } catch (e) { }

        if (adviceToken) {
            console.log('    -> ได้ Token แล้ว! ส่งไปเซิร์ฟเวอร์...');
            await axios.post(`${SERVER_URL}/api/set-token`, { token: adviceToken, secret: SECRET });
            console.log('    -> อัพเดท Token สำเร็จ!');
        } else {
            console.log('    -> ❌ ไม่สามารถดึง Token ได้');
        }

        // 2. Get Studio7 Prices
        console.log('\n[2/2] 🛍️ ดึงราคาจาก Studio7...');
        // We will fetch the categories: iPhone, iPad, MacBook
        const urls = [
            'https://www.studio7thailand.com/th/view-all/apple-iphone-series',
            'https://www.studio7thailand.com/th/view-all/apple-ipad-series',
            'https://www.studio7thailand.com/th/view-all/apple-mac-series'
        ];

        let allStudio7Products = [];

        for (const url of urls) {
            console.log(`    -> กำลังสแกน ${url.split('/').pop()}...`);
            await page.goto(url, { waitUntil: 'networkidle2' });
            
            // Auto scroll
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 500;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if(totalHeight >= scrollHeight - window.innerHeight){
                            clearInterval(timer);
                            resolve();
                        }
                    }, 200);
                    setTimeout(() => { clearInterval(timer); resolve(); }, 5000);
                });
            });

            const products = await page.evaluate(() => {
                const items = [];
                document.querySelectorAll('a').forEach(el => {
                    const titleEl = el.querySelector('h3, .product-title, [class*="title"], [class*="name"]');
                    const priceEl = el.querySelector('.price, [class*="price"]');
                    if (titleEl && priceEl) {
                        const title = titleEl.innerText.trim();
                        const price = priceEl.innerText.trim().replace(/[^0-9]/g, '');
                        if (title && price && price.length > 3) {
                            items.push({ title, price: parseInt(price) });
                        }
                    }
                });
                return items;
            });
            allStudio7Products.push(...products);
        }

        // Deduplicate and clean up
        const uniqueProducts = [];
        const seen = new Set();
        for (const p of allStudio7Products) {
            if (!seen.has(p.title) && p.title.length > 3) {
                seen.add(p.title);
                uniqueProducts.push(p);
            }
        }

        console.log(`    -> ได้สินค้า Studio7 ทั้งหมด ${uniqueProducts.length} รายการ ส่งไปเซิร์ฟเวอร์...`);
        if (uniqueProducts.length > 0) {
            await axios.post(`${SERVER_URL}/api/set-studio7`, { products: uniqueProducts, secret: SECRET });
            console.log('    -> อัพเดทข้อมูล Studio7 สำเร็จ!');
        }

    } catch (e) {
        console.error('❌ เกิดข้อผิดพลาด:', e.message);
    } finally {
        await browser.close();
        console.log('\n====================================');
        console.log('  ทำงานเสร็จสิ้นแล้ว!');
        console.log('====================================');
    }
})();
