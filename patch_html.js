const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

if (!html.includes('btn-copy-all')) {
  const searchBarHTML = `<div class="search-bar">`;
  const replaceHTML = `<div class="header-actions">
          <button id="btn-copy-all" class="btn-copy-all">
            <i class="fas fa-copy"></i> ก็อปปี้ราคาทั้งหมด
          </button>
        </div>
        <div class="search-bar">`;
  
  html = html.replace(searchBarHTML, replaceHTML);
  fs.writeFileSync('index.html', html);
  console.log('Done HTML');
}
