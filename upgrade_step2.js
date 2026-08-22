const fs = require('fs');
const path = require('path');

const effectsPath = path.join(__dirname, 'effects.js');
let effectsJS = fs.readFileSync(effectsPath, 'utf8');

// Inject Ultra-Luxury Engine into effects.js
const luxuryEngine = `
/* ========================================================
   ULTRA-LUXURY INTERACTION ENGINE (The 1% Details)
   ======================================================== */

// 1. Haptic Syntax (Vibration patterns for physical feel)
window.haptics = {
  light: () => { if (navigator.vibrate) navigator.vibrate(5); },
  medium: () => { if (navigator.vibrate) navigator.vibrate(15); },
  success: () => { if (navigator.vibrate) navigator.vibrate([10, 30, 10]); },
  error: () => { if (navigator.vibrate) navigator.vibrate([20, 40, 20]); },
  tick: () => { if (navigator.vibrate) navigator.vibrate(2); }
};

// Override default tab switch to add Haptics & Smooth Flip
const originalSwitchTab = window.switchTab;
if (originalSwitchTab && !window.switchTabLuxurified) {
  window.switchTab = function(tabId) {
    window.haptics.light();
    originalSwitchTab(tabId);
  };
  window.switchTabLuxurified = true;
}

// 2. Gyroscope Sensor Lighting (3D Tilt on mobile)
if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', (e) => {
    // Only apply if beta and gamma are available (real device)
    if (e.beta === null || e.gamma === null) return;
    
    // Normalize angles (-45 to 45 degrees usually)
    const beta = Math.max(-45, Math.min(45, e.beta)); // Front/Back tilt
    const gamma = Math.max(-45, Math.min(45, e.gamma)); // Left/Right tilt
    
    // Convert to subtle CSS rotation (-4deg to 4deg max)
    const rx = (beta / 45) * 4;
    const ry = (gamma / 45) * 4;
    
    // Apply globally to CSS variables (Cards will pick this up)
    document.documentElement.style.setProperty('--global-rx', \`\${rx}deg\`);
    document.documentElement.style.setProperty('--global-ry', \`\${ry}deg\`);
  });
}

// 3. Staggered Entry Animation Observer (Cards fall into place)
window.setupLuxuryCards = function() {
  const cards = document.querySelectorAll('.product-card');
  if (!cards.length) return;
  
  // Apply global gyro tilt to individual cards if not hovered
  cards.forEach(card => {
    // Link local rx/ry to global gyro unless hovered
    card.style.setProperty('--rx', 'var(--global-rx, 0deg)');
    card.style.setProperty('--ry', 'var(--global-ry, 0deg)');
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Add class that triggers the spring up animation
        entry.target.classList.add('reveal');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  
  cards.forEach(card => observer.observe(card));
};

// 4. Overwrite copy Viewer to add Haptics
const originalCopyViewer = window.copyViewerProduct;
if (originalCopyViewer && !window.copyViewerLuxurified) {
  window.copyViewerProduct = function() {
    window.haptics.success();
    originalCopyViewer();
    // Extra visual flare
    const btn = document.querySelector('.vi-actions .primary');
    if (btn) {
      btn.style.transform = 'scale(0.92)';
      setTimeout(() => { btn.style.transform = 'scale(1)'; }, 100);
    }
  };
  window.copyViewerLuxurified = true;
}
`;

if (!effectsJS.includes('ULTRA-LUXURY INTERACTION ENGINE')) {
    fs.writeFileSync(effectsPath, effectsJS + '\n' + luxuryEngine, 'utf8');
    console.log('✅ Injected Luxury Engine into effects.js');
} else {
    console.log('⚠️ Luxury Engine already exists in effects.js');
}

// Ensure app.js calls setupLuxuryCards after rendering
const appPath = path.join(__dirname, 'app.js');
let appJS = fs.readFileSync(appPath, 'utf8');

if (!appJS.includes('window.setupLuxuryCards()')) {
    // Inject it at the end of renderProducts function
    appJS = appJS.replace(/(function renderProducts[\s\S]*? container\.innerHTML = html;[\s\S]*?)(})/m, "$1\n  if (window.setupLuxuryCards) window.setupLuxuryCards();\n$2");
    fs.writeFileSync(appPath, appJS, 'utf8');
    console.log('✅ Linked setupLuxuryCards into app.js render function');
}

// Add CSS for the reveal animation
const cssPath = path.join(__dirname, 'styles.css');
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('.product-card.reveal')) {
    css += `\n/* ── Luxury Card Reveal Animation ── */
.product-card {
  opacity: 0;
  transform: perspective(1200px) translateY(40px) scale(0.96);
}
.product-card.reveal {
  opacity: 1;
  transform: perspective(1200px) rotateX(var(--rx)) rotateY(var(--ry)) translateZ(var(--tz));
  transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease-out;
}\n`;
    fs.writeFileSync(cssPath, css, 'utf8');
    console.log('✅ Added reveal animation CSS');
}
