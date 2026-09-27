const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const debugRoute = `
app.get('/api/debug', async (req, res) => {
  try {
    const r1 = await axios.get('https://www.advice.co.th/', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    res.json({ success: true, status: r1.status, headers: r1.headers['set-cookie'] ? 'Has Cookies' : 'No Cookies' });
  } catch (e) {
    res.json({ success: false, error: e.message, code: e.code, status: e.response ? e.response.status : null });
  }
});
`;

if (!code.includes('/api/debug')) {
  code = code.replace('app.listen(PORT,', debugRoute + '\napp.listen(PORT,');
  fs.writeFileSync('server.js', code);
}
