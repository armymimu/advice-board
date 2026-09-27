const fs = require('fs');
let css = fs.readFileSync('styles.css', 'utf8');

const newRoot = `:root {
    /* Colors - Brown Pink Theme */
    --bg-canvas: #FCF9F9;
    --bg-surface: #FFFFFF;
    --bg-surface-subtle: #FAF3F2;
    
    --text-primary: #5A423C;
    --text-secondary: #987A74;
    --text-tertiary: #C9B8B5;
    
    --accent: #D78A86;
    --accent-tint: #FDF5F4;
    --accent-hover: #C5716C;
    --danger: #FF6B6B;
    --warning: #F5A623;
    
    --border-divider: rgba(90, 66, 60, 0.08);
    --border-light: rgba(90, 66, 60, 0.04);
  
    /* Shadows - Ultra Soft & Floating */
    --shadow-input: 0 1px 2px rgba(90, 66, 60, 0.02);
    --shadow-card: 0 4px 24px rgba(90, 66, 60, 0.04), 0 1px 4px rgba(90, 66, 60, 0.02);
    --shadow-hover: 0 12px 32px rgba(90, 66, 60, 0.08), 0 4px 12px rgba(90, 66, 60, 0.04);
    --shadow-focus: 0 0 0 3px rgba(215, 138, 134, 0.25);
    --shadow-toast: 0 16px 48px rgba(90,66,60,0.08), 0 4px 12px rgba(90,66,60,0.05);
  
    /* Border Radius - Hierarchical */
    --radius-card: 24px;
    --radius-input: 14px;
    --radius-pill: 99px;
  
    /* Typography */
    --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    
    /* Animation (Spring & Fade) */
    --spring: cubic-bezier(0.32, 0.72, 0, 1);
    --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
    --duration-fast: 180ms;
    --duration-base: 280ms;
    --duration-panel: 380ms;
  }`;

const rootIdx = css.indexOf(':root {');
const rootEndIdx = css.indexOf('}', rootIdx);
css = css.substring(0, rootIdx) + newRoot + css.substring(rootEndIdx + 1);

// Add styling for copy buttons
const copyStyle = `
.product-actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}
.btn-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--bg-surface-subtle);
  border: 1px solid var(--border-divider);
  color: var(--text-secondary);
  border-radius: var(--radius-input);
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.btn-copy:hover {
  background: var(--bg-surface);
  border-color: var(--accent);
  color: var(--accent);
}
.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.btn-copy-all {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 10px 16px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  box-shadow: 0 4px 12px rgba(215, 138, 134, 0.3);
}
.btn-copy-all:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(215, 138, 134, 0.4);
}
`;
if (!css.includes('.btn-copy')) {
  css += copyStyle;
}

fs.writeFileSync('styles.css', css);
console.log('Done CSS');
