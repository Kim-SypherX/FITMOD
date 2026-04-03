const fs = require('fs');
const path = require('path');

const cssDir = path.join(__dirname, 'frontend/src/styles');
const componentsDir = path.join(__dirname, 'frontend/src/components');
const rootDir = path.join(__dirname, 'frontend/src');

// 1. REWRITE INDEX.CSS
const indexCssPath = path.join(rootDir, 'index.css');
const indexCssContent = `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Syne:wght@400;500;600;700;800&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  /* Fonts */
  --font-body: 'Outfit', 'Inter', sans-serif;
  --font-heading: 'Syne', sans-serif;

  /* Earthy Color Palette (Presentation Style) */
  --color-bg-base: #dfd5b9;        /* Deep sand/beige */
  --color-bg-card: #f9f1e1;        /* Light cream */
  --color-text-main: #2a1f18;      /* Deep dark brown */
  --color-text-muted: #6b5344;     /* Medium brown */
  
  --color-accent-rust: #b25d25;    /* Rust Orange */
  --color-accent-olive: #8a9675;   /* Olive Green */
  --color-accent-mustard: #e0ac43; /* Mustard Yellow */
  
  --color-border: #2a1f18;         /* Solid dark brown for borders */
  --color-border-light: rgba(42, 31, 24, 0.2);
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--color-bg-base);
  color: var(--color-text-main);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* Hard Blob Backgrounds */
.fitmod-app {
  position: relative;
  min-height: 100vh;
  background-color: var(--color-bg-base);
  overflow-x: hidden;
}

/* CSS Blobs */
.fitmod-app::before {
  content: '';
  position: fixed;
  top: -10vw;
  left: -10vw;
  width: 50vw;
  height: 50vw;
  background-color: var(--color-accent-rust);
  border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
  opacity: 0.8;
  z-index: 0;
  pointer-events: none;
}

.fitmod-app::after {
  content: '';
  position: fixed;
  bottom: -20vw;
  right: -10vw;
  width: 60vw;
  height: 50vw;
  background-color: var(--color-accent-mustard);
  border-radius: 60% 40% 30% 70% / 50% 40% 60% 50%;
  opacity: 0.6;
  z-index: 0;
  pointer-events: none;
}

.blob-olive {
  position: fixed;
  top: 40%;
  right: -10vw;
  width: 30vw;
  height: 40vw;
  background-color: var(--color-accent-olive);
  border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
  opacity: 0.7;
  z-index: 0;
  pointer-events: none;
}
`;
fs.writeFileSync(indexCssPath, indexCssContent);

// 2. REWRITE APP.CSS (Nav)
const appCssPath = path.join(rootDir, 'App.css');
const appCssContent = `/* App Shell Styles */
.fitmod-nav {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 32px;
  height: 72px;
  background: var(--color-bg-card);
  border-bottom: 3px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0px 4px 0px var(--color-border);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  margin-right: 24px;
}

.nav-logo {
  font-family: var(--font-heading);
  font-size: 28px;
  font-weight: 800;
  color: var(--color-accent-rust);
  letter-spacing: -1px;
}

.nav-links {
  display: flex;
  gap: 12px;
  flex: 1;
  overflow-x: auto;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-heading);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 3px solid transparent;
  border-radius: 30px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-link:hover {
  background: rgba(42, 31, 24, 0.05);
  color: var(--color-text-main);
}

.nav-link.active {
  background: var(--color-accent-mustard);
  color: var(--color-text-main);
  border-color: var(--color-border);
  box-shadow: 3px 3px 0px var(--color-border);
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.nav-user-name {
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-heading);
}

.nav-user-type {
  font-size: 11px;
  padding: 4px 10px;
  background: var(--color-accent-olive);
  color: #fff;
  border: 2px solid var(--color-border);
  border-radius: 20px;
  font-weight: 800;
  box-shadow: 2px 2px 0px var(--color-border);
}

.nav-logout {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 3px solid var(--color-border);
  background: var(--color-bg-card);
  font-weight: bold;
  cursor: pointer;
  box-shadow: 2px 2px 0px var(--color-border);
  transition: all 0.1s;
}

.nav-logout:active {
  transform: translate(2px, 2px);
  box-shadow: 0px 0px 0px var(--color-border);
}

.fitmod-main {
  position: relative;
  z-index: 10;
}
`;
fs.writeFileSync(appCssPath, appCssContent);

// 3. ENHANCE PAGES.CSS
let pagesCssContent = fs.readFileSync(path.join(cssDir, 'Pages.css'), 'utf8');

// Header Typography
pagesCssContent = pagesCssContent.replace(/\.page-header h1 \{[\s\S]*?\}/, `.page-header h1 {\n    font-size: 48px;\n    font-family: var(--font-heading);\n    font-weight: 800;\n    margin: 0 0 12px;\n    color: var(--color-text-main);\n    line-height: 1.1;\n}`);

// Primary Button
pagesCssContent = pagesCssContent.replace(/\.page-btn-primary \{[\s\S]*?\}/, `.page-btn-primary {\n    background: var(--color-accent-rust);\n    color: #fff;\n    border: 3px solid var(--color-border);\n    border-radius: 30px;\n    padding: 12px 24px;\n    font-size: 16px;\n    font-weight: 700;\n    font-family: var(--font-heading);\n    box-shadow: 4px 4px 0px var(--color-border);\n    cursor: pointer;\n    transition: all 0.1s;\n    text-transform: uppercase;\n    letter-spacing: 0.5px;\n}`);
pagesCssContent = pagesCssContent.replace(/\.page-btn-primary:hover \{[\s\S]*?\}/, `.page-btn-primary:hover {\n    transform: translate(2px, 2px);\n    box-shadow: 2px 2px 0px var(--color-border);\n}`);

// Cards (tailleurs-card, modele-card, etc)
pagesCssContent = pagesCssContent.replace(/\.tailleur-card \{[\s\S]*?\}/, `.tailleur-card {\n    background: var(--color-bg-card);\n    border: 3px solid var(--color-border);\n    border-radius: 20px;\n    padding: 24px;\n    cursor: pointer;\n    box-shadow: 6px 6px 0px var(--color-border);\n    transition: transform 0.1s, box-shadow 0.1s;\n}`);
pagesCssContent = pagesCssContent.replace(/\.tailleur-card:hover \{[\s\S]*?\}/, `.tailleur-card:hover {\n    transform: translate(-4px, -4px);\n    box-shadow: 10px 10px 0px var(--color-border);\n}`);

pagesCssContent = pagesCssContent.replace(/\.modele-card \{[\s\S]*?\}/, `.modele-card {\n    background: var(--color-bg-card);\n    border: 3px solid var(--color-border);\n    border-radius: 20px;\n    overflow: hidden;\n    cursor: pointer;\n    box-shadow: 6px 6px 0px var(--color-border);\n    transition: all 0.1s;\n    display: flex;\n    flex-direction: column;\n}`);
pagesCssContent = pagesCssContent.replace(/\.modele-card:hover \{[\s\S]*?\}/, `.modele-card:hover {\n    transform: translate(-4px, -4px);\n    box-shadow: 10px 10px 0px var(--color-border);\n}`);

// Modele Photo Box
pagesCssContent = pagesCssContent.replace(/\.modele-card-photo \{[\s\S]*?\}/, `.modele-card-photo {\n    height: 180px;\n    background: rgba(42, 31, 24, 0.05);\n    border-bottom: 3px solid var(--color-border);\n}`);

// Commande card
pagesCssContent = pagesCssContent.replace(/\.commande-card \{[\s\S]*?\}/, `.commande-card {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    background: var(--color-bg-card);\n    border: 3px solid var(--color-border);\n    border-radius: 20px;\n    padding: 24px;\n    cursor: pointer;\n    box-shadow: 6px 6px 0px var(--color-border);\n}`);

// Input / Filters
pagesCssContent = pagesCssContent.replace(/\.filter-search \{[\s\S]*?\}/, `.filter-search {\n    flex: 1;\n    min-width: 200px;\n    padding: 12px 20px;\n    background: var(--color-bg-card);\n    border: 3px solid var(--color-border);\n    border-radius: 30px;\n    color: var(--color-text-main);\n    font-size: 15px;\n    font-weight: 600;\n    font-family: var(--font-body);\n    outline: none;\n    box-shadow: 4px 4px 0px var(--color-border);\n}`);
pagesCssContent = pagesCssContent.replace(/\.filter-select \{[\s\S]*?\}/, `.filter-select {\n    padding: 12px 20px;\n    background: var(--color-bg-card);\n    border: 3px solid var(--color-border);\n    border-radius: 30px;\n    color: var(--color-text-main);\n    font-size: 15px;\n    font-weight: 600;\n    font-family: var(--font-body);\n    outline: none;\n    cursor: pointer;\n    box-shadow: 4px 4px 0px var(--color-border);\n}`);

fs.writeFileSync(path.join(cssDir, 'Pages.css'), pagesCssContent);

// 4. STRIP EMOJIS FROM JSX
const stripEmojis = (str) => {
    // Basic regex to remove common emojis
    return str.replace(/[\\u1F600-\\u1F64F]/g, '') // Emoticons
        .replace(/[\\u1F300-\\u1F5FF]/g, '') // Misc Symbols and Pictographs
        .replace(/[\\u1F680-\\u1F6FF]/g, '') // Transport and Map
        .replace(/[\\u1F700-\\u1F77F]/g, '') // Alchemical Symbols
        .replace(/[\\u1F780-\\u1F7FF]/g, '') // Geometric Shapes Extended
        .replace(/[\\u1F800-\\u1F8FF]/g, '') // Supplemental Arrows-C
        .replace(/[\\u1F900-\\u1F9FF]/g, '') // Supplemental Symbols and Pictographs
        .replace(/[\\u1FA00-\\u1FA6F]/g, '') // Chess Symbols
        .replace(/[\\u1FA70-\\u1FAFF]/g, '') // Symbols and Pictographs Extended-A
        .replace(/[\\u2600-\\u26FF]/g, '') // Misc symbols
        .replace(/[\\u2700-\\u27BF]/g, '') // Dingbats
        .replace(/[\\u2B50]/g, '') // Star
        .replace(/<span><\/span>/g, ''); // empty spans left over
};

const components = fs.readdirSync(componentsDir).filter(f => f.endsWith('.jsx'));
components.push('../App.jsx'); // Add App.jsx to list

components.forEach(file => {
    const fullPath = path.join(componentsDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');

    // Explicitly target spans with emojis to remove the container completely if it's just an emoji wrapper
    content = content.replace(/<span>[^<]*?[\\u1F300-\\u1FAFF\\u2600-\\u27BF]+[^<]*?<\/span>/g, '');
    content = content.replace(/<span className="nav-icon">[^<]*?<\/span>/g, '');
    content = content.replace(/<span className="ce-title-icon">[^<]*?<\/span>/g, '');
    content = content.replace(/<span className="empty-icon">[^<]*?<\/span>/g, '');
    // Strip inline emojis anywhere else
    content = stripEmojis(content);

    // specifically handle AuthPage where it had <div className="auth-logo">FITMOD</div> before. The emoji was stripped so it might just be empty.
    content = content.replace(/<div className="auth-logo"><\/div>/g, '<div className="auth-logo">FITMOD</div>');

    fs.writeFileSync(fullPath, content);
});

// App.jsx needs the blob olive inserted manually to match index.css strategy
let appJsx = fs.readFileSync(path.join(rootDir, 'App.jsx'), 'utf8');
if (!appJsx.includes('blob-olive')) {
    appJsx = appJsx.replace(/<div className="fitmod-app">/, '<div className="fitmod-app">\n      <div className="blob-olive"></div>');
    fs.writeFileSync(path.join(rootDir, 'App.jsx'), appJsx);
}

console.log('Hyper-stylization complete. Emojis stripped.');
