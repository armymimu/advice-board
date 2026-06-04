const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio'); // Might not be installed, we will use regex

(async () => {
    try {
        const res = await axios.get('https://www.studio7thailand.com/th/p/apple-iphone-series');
        const content = res.data;
        const prices = content.match(/<div class=\"price\">.*?<\/div>/g) || [];
        const titles = content.match(/<h[1-6][^>]*>.*?<\/h[1-6]>/g) || [];
        const nuxtMatch = content.match(/window\.__NUXT__=\((.*?)\);<\/script>/s);
        
        console.log('Got HTML, length:', content.length);
        if (nuxtMatch) {
            const data = eval('(' + nuxtMatch[1] + ')');
            fs.writeFileSync('studio7_state.json', JSON.stringify(data, null, 2));
            console.log('Saved Nuxt state to studio7_state.json');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
})();
