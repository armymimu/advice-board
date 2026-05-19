@echo off
chcp 65001 >nul
echo ====================================
echo   🔑 Advice Token Refresher
echo ====================================
echo.

cd /d "%~dp0"

echo กำลังดึง Token ใหม่จาก Advice...
echo.

node -e "const puppeteer=require('puppeteer-extra');const S=require('puppeteer-extra-plugin-stealth');puppeteer.use(S());(async()=>{const b=await puppeteer.launch({headless:true,args:['--no-sandbox']});const p=await b.newPage();let t='';p.on('request',r=>{if(r.url().includes('prodbackadvice')&&r.url().includes('product/get')&&r.method()==='POST'){const h=r.headers();if(h.authorization&&!t){t=h.authorization}}});await p.goto('https://www.advice.co.th/product/iphone',{waitUntil:'networkidle2'});try{await p.waitForSelector('.list-product',{timeout:15000})}catch(e){}await b.close();if(t){console.log('TOKEN:'+t);const axios=require('axios');const r=await axios.post('https://advice-board.onrender.com/api/set-token',{token:t,secret:'armymimu2024'});console.log('RESULT:'+JSON.stringify(r.data))}else{console.log('ERROR:ไม่สามารถดึง Token ได้')}})()"

echo.
echo ====================================
echo   เสร็จแล้ว! Token จะใช้ได้ ~90 นาที
echo ====================================
pause
