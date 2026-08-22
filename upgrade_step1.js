const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'styles.css');
const htmlPath = path.join(__dirname, 'index.html');

// 1. Update HTML Micro-copy
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace('กำลังเชื่อมต่อ...', 'Curating live prices...');
html = html.replace('📋 ก็อปราคารุ่นนี้', '📋 Copy Price');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ Updated HTML Micro-copy');

// 2. Update CSS Root Variables & Physics
let css = fs.readFileSync(cssPath, 'utf8');

// Replace :root block completely
const newRoot = `:root {
  --bg: #07050A;
  --bg-gradient: radial-gradient(circle at top right, #1a1016 0%, #07050A 70%);
  --surface: rgba(18, 13, 21, 0.5);
  --surface-solid: #0D090F;
  --surface2: rgba(26, 19, 32, 0.75);
  --surface3: rgba(36, 25, 44, 0.9);
  --surface4: #352830;
  --border: rgba(255,255,255,0.04);
  --border-hover: rgba(255,255,255,0.12);
  --border-accent: rgba(216,160,140,0.35);
  --accent: #d8a08c;
  --accent-glow: rgba(216,160,140,0.15);
  --accent-bright: #e8b8a4;
  --text: #F8F4F0;
  --text2: #C8B8B0;
  --text3: #6A5A54;
  --muted: #6A5A54;
  --profit: #7DD8A0;
  --warning: #e8b060;
  --danger: #d45a5a;
  --blue: #8ab4d8;
  --purple: #b89cd8;
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  /* Ultra-Luxury 6-Layer Ambient Shadow */
  --shadow: 0 1px 1px rgba(0,0,0,0.08), 
            0 2px 2px rgba(0,0,0,0.12), 
            0 4px 4px rgba(0,0,0,0.16), 
            0 8px 8px rgba(0,0,0,0.20), 
            0 16px 16px rgba(0,0,0,0.24), 
            0 32px 32px rgba(0,0,0,0.32);
  --shadow-lg: 0 10px 40px rgba(0,0,0,0.6);
  --shadow-glow: 0 0 30px rgba(216,160,140,0.15);
  
  /* Apple Fluid & Bouncy Springs */
  --transition: 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  --transition-smooth: 0.4s cubic-bezier(0.32, 0.72, 0, 1);
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --spring-fast: cubic-bezier(0.32, 0.72, 0, 1);
}`;

css = css.replace(/:root\s*\{[\s\S]*?\}/, newRoot);

// Ensure Tabular Numerals on prices
if (!css.includes('font-variant-numeric: tabular-nums;')) {
    css += `\n\n/* ── Ultra-Luxury Micro Typography ── */\n.product-price, .profit-val, .panel-price, input[type="number"], .vi-prices { font-variant-numeric: tabular-nums; font-family: 'IBM Plex Mono', monospace; }\n`;
}

// Enhance product card styling (Glassmorphism & Transforms for Gyro)
css = css.replace(/\.product-card\s*\{([\s\S]*?)\}/, (match, inner) => {
    // Remove existing background, backdrop, shadow to override cleanly
    let cleanInner = inner.replace(/background:.*?;/g, '')
                          .replace(/backdrop-filter:.*?;/g, '')
                          .replace(/box-shadow:.*?;/g, '')
                          .replace(/border:.*?;/g, '')
                          .replace(/transform:.*?;/g, '');
                          
    return `.product-card {
  ${cleanInner}
  background: var(--surface);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--border);
  border-top: 1px solid rgba(255,255,255,0.12); /* Rim light */
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), var(--shadow);
  
  /* Prep for 3D Tilt */
  --rx: 0deg;
  --ry: 0deg;
  --tz: 0px;
  transform: perspective(1200px) rotateX(var(--rx)) rotateY(var(--ry)) translateZ(var(--tz));
  transition: transform var(--spring), border-color var(--transition), box-shadow var(--transition);
  transform-style: preserve-3d;
}`;
});

// Update card hover state to use 3D lift
css = css.replace(/\.product-card:hover\s*\{([\s\S]*?)\}/, `.product-card:hover {
  --tz: 8px; /* Lift up in Z space */
  border-color: var(--border-accent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), var(--shadow-lg), 0 0 0 1px rgba(216,160,140,0.1);
}`);

fs.writeFileSync(cssPath, css, 'utf8');
console.log('✅ Updated CSS with Luxury Variables & Physics');
