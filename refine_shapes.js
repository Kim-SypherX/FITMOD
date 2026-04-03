const fs = require('fs');
const path = require('path');

const cssFile = path.join(__dirname, 'frontend/src/styles/Pages.css');

if (fs.existsSync(cssFile)) {
    let content = fs.readFileSync(cssFile, 'utf8');

    // Replace standard glassmorphism borders with solid presentation-style borders
    content = content.replace(/border: 1px solid var\(--color-border-light\);/g, 'border: 3px solid var(--color-border);');
    content = content.replace(/border-radius: 12px;/g, 'border-radius: 20px;');
    content = content.replace(/border-radius: 14px;/g, 'border-radius: 24px;');
    content = content.replace(/border-radius: 10px;/g, 'border-radius: 16px;');

    // Update primary button
    content = content.replace(/\.page-btn-primary \{[\s\S]*?\}/, `.page-btn-primary {\n    background: var(--color-accent-rust);\n    color: #fff;\n    border: 2px solid var(--color-accent-rust);\n    border-radius: 30px;\n}`);
    content = content.replace(/\.page-btn-primary:hover \{[\s\S]*?\}/, `.page-btn-primary:hover {\n    background: var(--color-bg-card);\n    color: var(--color-accent-rust);\n    transform: translateY(-2px);\n}`);

    // Update tags
    content = content.replace(/background: rgba\(212, 163, 69, 0\.2\);/g, 'background: var(--color-accent-mustard); color: #fff;');

    fs.writeFileSync(cssFile, content, 'utf8');
    console.log('Pages.css refined');
}

const authCssFile = path.join(__dirname, 'frontend/src/styles/AuthPage.css');
if (fs.existsSync(authCssFile)) {
    let content = fs.readFileSync(authCssFile, 'utf8');
    content = content.replace(/border: 1px solid var\(--color-border-light\)/g, 'border: 3px solid var(--color-border)');
    content = content.replace(/border-radius: 16px/g, 'border-radius: 30px');
    content = content.replace(/(?<=box-shadow: )[^;]+/g, '8px 8px 0px rgba(128, 96, 69, 0.4)');
    fs.writeFileSync(authCssFile, content, 'utf8');
    console.log('AuthPage.css refined');
}
