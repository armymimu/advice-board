const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldBlock = `            const nameLow = (p.name || p.product || '').toLowerCase();
            if (categoryKey === 'iphone' && !nameLow.includes('iphone')) return;
            if (categoryKey === 'ipad' && !nameLow.includes('ipad')) return;
            if (categoryKey === 'macbook' && !(nameLow.includes('macbook') || nameLow.includes('mac ') || nameLow.includes('imac') || nameLow.includes('mac mini') || nameLow.includes('mac studio'))) return;
            if (categoryKey === 'iphone' && (nameLow.includes('case') || nameLow.includes('magsafe') || nameLow.includes('cable') || nameLow.includes('adapter') || nameLow.includes('wallet') || nameLow.includes('film') || nameLow.includes('glass'))) return;
            if (categoryKey === 'ipad' && (nameLow.includes('case') || nameLow.includes('pencil') || nameLow.includes('keyboard') || nameLow.includes('folio') || nameLow.includes('film') || nameLow.includes('glass'))) return;`;

const newBlock = `            const nameLow = (p.name || p.product || '').toLowerCase();
            
            // Generic accessory exclusion
            const badWords = ['case', 'เคส', 'film', 'ฟิล์ม', 'glass', 'กระจก', 'magsafe', 'cable', 'สายชาร์จ', 'สาย', 'adapter', 'หัวชาร์จ', 'อะแดปเตอร์', 'อะแดปปเตอร์', 'wallet', 'pencil', 'ปากกา', 'keyboard', 'คีย์บอร์ด', 'folio', 'mouse', 'เมาส์', 'trackpad', 'แทร็คแพด', 'hub', 'dongle', 'dock', 'ซอง', 'กระเป๋า', 'bag', 'sleeve', 'airpods', 'earpods', 'watch', 'strap', 'สายนาฬิกา', 'apple tv', 'care+', 'applecare', 'ประกัน', 'warranty', 'smart tag', 'airtag', 'ซิม', 'sim', 'ลำโพง', 'speaker', 'ขาตั้ง', 'stand', 'ชาร์จไร้สาย', 'wireless charger', 'หูฟัง', 'headphone', 'earbud'];
            if (badWords.some(w => nameLow.includes(w))) return;

            // Enforce correct device matching
            if (categoryKey === 'iphone' && !nameLow.includes('iphone')) return;
            if (categoryKey === 'ipad' && !nameLow.includes('ipad')) return;
            if (categoryKey === 'macbook' && !(nameLow.includes('macbook') || nameLow.includes('mac ') || nameLow.includes('imac') || nameLow.includes('mac mini') || nameLow.includes('mac studio'))) return;`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  fs.writeFileSync('server.js', code);
  console.log('Replaced Thai filters');
} else {
  console.log('Failed to find block');
}
