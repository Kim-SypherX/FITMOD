const fs = require('fs');
const path = require('path');

const cssFiles = [
    path.join(__dirname, 'frontend/src/App.css'),
    path.join(__dirname, 'frontend/src/styles/Pages.css'),
    path.join(__dirname, 'frontend/src/styles/AuthPage.css'),
    path.join(__dirname, 'frontend/src/styles/CabineEssayage.css'),
    path.join(__dirname, 'frontend/src/styles/MesuresCapture.css')
];

let styleMapping = {
    // Backgrounds & Containers -> Light Cream / Sand
    '#0a0f1a': 'var(--color-bg-base)',
    '#0a0e1a': 'var(--color-bg-base)',
    '#0f172a': 'var(--color-bg-base)',
    '#1a1040': 'var(--color-bg-base)',
    'rgba(10, 15, 26, 0.95)': 'rgba(253, 246, 230, 0.95)',
    'rgba(15, 23, 42, 0.6)': 'var(--color-bg-card)',
    'rgba(15, 23, 42, 0.5)': 'var(--color-bg-card)',
    'rgba(30, 41, 59, 0.6)': 'var(--color-bg-alt)',
    'rgba(30, 41, 59, 0.5)': 'var(--color-bg-alt)',
    'rgba(30, 41, 59, 0.4)': 'var(--color-bg-alt)',
    '#1e293b': 'var(--color-bg-alt)',
    '#334155': 'var(--color-border)',

    // Text Colors -> Dark Browns
    '#e2e8f0': 'var(--color-text-main)',
    '#94a3b8': 'var(--color-text-muted)',
    '#64748b': 'var(--color-text-muted)',
    '#475569': 'var(--color-border)',

    // Border Colors -> Muted Brown Transparent
    'rgba(100, 116, 139, 0.15)': 'var(--color-border-light)',
    'rgba(100, 116, 139, 0.12)': 'var(--color-border-light)',
    'rgba(100, 116, 139, 0.2)': 'var(--color-border-light)',
    'rgba(100, 116, 139, 0.3)': 'var(--color-border)',

    // Primary Accents (Teal/Cyan) -> Rust / Olive
    '#00e6b8': 'var(--color-accent-rust)',
    '#06b6d4': 'var(--color-accent-olive)',
    'rgba(0, 230, 184, 0.08)': 'rgba(168, 92, 50, 0.1)',
    'rgba(0, 230, 184, 0.12)': 'rgba(168, 92, 50, 0.15)',
    'rgba(0, 230, 184, 0.15)': 'rgba(168, 92, 50, 0.2)',
    'rgba(0, 230, 184, 0.2)': 'rgba(168, 92, 50, 0.25)',
    'rgba(0, 230, 184, 0.3)': 'rgba(168, 92, 50, 0.4)',
    'rgba(0, 230, 184, 0.4)': 'rgba(168, 92, 50, 0.5)',

    // Secondary Accents (Purple) -> Mustard
    '#8b5cf6': 'var(--color-accent-mustard)',
    '#c4b5fd': 'var(--color-text-main)',
    'rgba(139, 92, 246, 0.15)': 'rgba(212, 163, 69, 0.2)',
    'rgba(139, 92, 246, 0.12)': 'rgba(212, 163, 69, 0.15)',
    'rgba(139, 92, 246, 0.06)': 'rgba(212, 163, 69, 0.1)',
};

cssFiles.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');

    // Replace hex and rgba precisely based on dictionary
    for (const [oldVal, newVal] of Object.entries(styleMapping)) {
        // use regex to replace all occurrences literally
        const regex = new RegExp(oldVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        content = content.replace(regex, newVal);
    }

    // specific hack for text-gradients
    content = content.replace(/-webkit-text-fill-color: transparent;/g, '');
    content = content.replace(/background: linear-gradient\(135deg, var\(--color-accent-rust\), var\(--color-accent-olive\)\);/g, 'color: var(--color-accent-rust);');

    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated: ' + path.basename(file));
});
