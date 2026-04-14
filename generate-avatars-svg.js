// Generate 30 SVG avatar files for the poker app
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'avatars');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

const SIZE = 256;
const C = SIZE / 2; // center

function svgWrap(bg, content) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<defs><clipPath id="clip"><circle cx="${C}" cy="${C}" r="${C}"/></clipPath></defs>
<circle cx="${C}" cy="${C}" r="${C}" fill="${bg}"/>
<g clip-path="url(#clip)">${content}</g>
</svg>`;
}

const avatars = [
    // === PEOPLE (10) ===
    { name: 'samurai', label: '侍', bg: '#1a1040', draw() {
        return `
        <circle cx="${C}" cy="${C+10}" r="45" fill="#deb887"/>
        <line x1="${C-18}" y1="${C+2}" x2="${C-8}" y2="${C+2}" stroke="#222" stroke-width="3" stroke-linecap="round"/>
        <line x1="${C+8}" y1="${C+2}" x2="${C+18}" y2="${C+2}" stroke="#222" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="${C}" cy="${C-20}" rx="55" ry="35" fill="#8B0000"/>
        <rect x="${C-55}" y="${C-20}" width="110" height="35" fill="#1a1040"/>
        <polygon points="${C},${C-75} ${C-15},${C-45} ${C+15},${C-45}" fill="#FFD700"/>
        <polygon points="${C},${C-55} ${C-8},${C-20} ${C+8},${C-20}" fill="#FFD700"/>
        <rect x="${C-30}" y="${C+20}" width="60" height="25" rx="5" fill="#444"/>`;
    }},
    { name: 'ninja', label: '忍者', bg: '#0a1a0a', draw() {
        return `
        <circle cx="${C}" cy="${C}" r="50" fill="#222"/>
        <rect x="${C-50}" y="${C-10}" width="100" height="25" fill="#333"/>
        <line x1="${C-20}" y1="${C}" x2="${C-8}" y2="${C}" stroke="#aaa" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="${C+8}" y1="${C}" x2="${C+20}" y2="${C}" stroke="#aaa" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="${C+40}" y1="${C-25}" x2="${C+70}" y2="${C-60}" stroke="#888" stroke-width="2"/>
        <polygon points="${C+65},${C-65} ${C+75},${C-55} ${C+60},${C-55}" fill="#888"/>`;
    }},
    { name: 'wizard', label: '魔法使い', bg: '#1a0a30', draw() {
        return `
        <circle cx="${C}" cy="${C+15}" r="42" fill="#deb887"/>
        <polygon points="${C},${C-80} ${C-40},${C-10} ${C+40},${C-10}" fill="#4a0e8f"/>
        <circle cx="${C}" cy="${C-45}" r="6" fill="#FFD700"/>
        <circle cx="${C-8}" cy="${C-30}" r="3" fill="#FFD700" opacity="0.6"/>
        <circle cx="${C+12}" cy="${C-38}" r="2" fill="#FFD700" opacity="0.4"/>
        <path d="M${C-35} ${C+25} Q${C-40} ${C+55} ${C-25} ${C+65} Q${C} ${C+75} ${C+25} ${C+65} Q${C+40} ${C+55} ${C+35} ${C+25}" fill="#bbb"/>
        <circle cx="${C-12}" cy="${C+8}" r="4" fill="#222"/>
        <circle cx="${C+12}" cy="${C+8}" r="4" fill="#222"/>`;
    }},
    { name: 'king', label: '王', bg: '#2a1a00', draw() {
        return `
        <circle cx="${C}" cy="${C+15}" r="45" fill="#deb887"/>
        <rect x="${C-35}" y="${C-30}" width="70" height="30" rx="3" fill="#FFD700"/>
        <polygon points="${C-35},${C-30} ${C-35},${C-55} ${C-20},${C-30}" fill="#FFD700"/>
        <polygon points="${C},${C-30} ${C},${C-60} ${C+0},${C-30}" fill="#FFD700"/>
        <polygon points="${C+35},${C-30} ${C+35},${C-55} ${C+20},${C-30}" fill="#FFD700"/>
        <circle cx="${C-25}" cy="${C-50}" r="5" fill="#e53935"/>
        <circle cx="${C}" cy="${C-55}" r="6" fill="#1e88e5"/>
        <circle cx="${C+25}" cy="${C-50}" r="5" fill="#43a047"/>
        <circle cx="${C-12}" cy="${C+8}" r="4" fill="#222"/>
        <circle cx="${C+12}" cy="${C+8}" r="4" fill="#222"/>
        <path d="M${C-10} ${C+22} Q${C} ${C+30} ${C+10} ${C+22}" fill="none" stroke="#222" stroke-width="2"/>`;
    }},
    { name: 'queen', label: '女王', bg: '#2a0020', draw() {
        return `
        <circle cx="${C}" cy="${C+15}" r="45" fill="#deb887"/>
        <ellipse cx="${C}" cy="${C-20}" rx="42" ry="20" fill="#e91e63"/>
        <polygon points="${C-30},${C-30} ${C-25},${C-60} ${C-15},${C-30}" fill="#e91e63"/>
        <polygon points="${C},${C-30} ${C},${C-65} ${C},${C-30}" fill="#e91e63"/>
        <polygon points="${C+30},${C-30} ${C+25},${C-60} ${C+15},${C-30}" fill="#e91e63"/>
        <circle cx="${C-22}" cy="${C-55}" r="4" fill="#FFD700"/>
        <circle cx="${C}" cy="${C-60}" r="5" fill="#FFD700"/>
        <circle cx="${C+22}" cy="${C-55}" r="4" fill="#FFD700"/>
        <circle cx="${C-12}" cy="${C+8}" r="3.5" fill="#222"/>
        <circle cx="${C+12}" cy="${C+8}" r="3.5" fill="#222"/>
        <ellipse cx="${C}" cy="${C+20}" rx="8" ry="4" fill="#e57373"/>`;
    }},
    { name: 'knight', label: '騎士', bg: '#1a1a2a', draw() {
        return `
        <circle cx="${C}" cy="${C+10}" r="45" fill="#deb887"/>
        <path d="M${C-45} ${C+10} Q${C-50} ${C-40} ${C} ${C-50} Q${C+50} ${C-40} ${C+45} ${C+10}" fill="#777"/>
        <rect x="${C-4}" y="${C-50}" width="8" height="25" fill="#aaa"/>
        <rect x="${C-15}" y="${C-55}" width="30" height="8" rx="2" fill="#aaa"/>
        <rect x="${C-40}" y="${C+5}" width="80" height="8" rx="2" fill="#777"/>
        <rect x="${C-25}" y="${C+5}" width="50" height="8" rx="2" fill="rgba(0,0,0,0.2)"/>
        <circle cx="${C-12}" cy="${C}" r="3" fill="#2196f3"/>
        <circle cx="${C+12}" cy="${C}" r="3" fill="#2196f3"/>`;
    }},
    { name: 'pirate', label: '海賊', bg: '#1a1008', draw() {
        return `
        <circle cx="${C}" cy="${C+10}" r="45" fill="#deb887"/>
        <ellipse cx="${C}" cy="${C-25}" rx="50" ry="20" fill="#222"/>
        <rect x="${C-50}" y="${C-25}" width="100" height="20" fill="#222"/>
        <rect x="${C-45}" y="${C-25}" width="90" height="3" fill="#FFD700"/>
        <circle cx="${C+15}" cy="${C+5}" r="12" fill="#222"/>
        <line x1="${C+3}" y1="${C+5}" x2="${C+27}" y2="${C+5}" stroke="#222" stroke-width="2"/>
        <circle cx="${C-15}" cy="${C+5}" r="4" fill="#222"/>
        <path d="M${C-15} ${C+25} Q${C} ${C+35} ${C+15} ${C+25}" fill="none" stroke="#222" stroke-width="2"/>
        <polygon points="${C+20},${C-35} ${C+30},${C-55} ${C+25},${C-35}" fill="#fff"/>
        <polygon points="${C+22},${C-55} ${C+38},${C-55} ${C+30},${C-45}" fill="#fff"/>`;
    }},
    { name: 'cowboy', label: 'カウボーイ', bg: '#201810', draw() {
        return `
        <circle cx="${C}" cy="${C+15}" r="42" fill="#deb887"/>
        <ellipse cx="${C}" cy="${C-15}" rx="65" ry="10" fill="#8B4513"/>
        <path d="M${C-40} ${C-15} Q${C-35} ${C-50} ${C} ${C-55} Q${C+35} ${C-50} ${C+40} ${C-15}" fill="#8B4513"/>
        <ellipse cx="${C}" cy="${C-30}" rx="35" ry="18" fill="#A0522D"/>
        <rect x="${C-25}" y="${C-30}" width="50" height="3" fill="#FFD700"/>
        <circle cx="${C-12}" cy="${C+8}" r="4" fill="#222"/>
        <circle cx="${C+12}" cy="${C+8}" r="4" fill="#222"/>
        <path d="M${C-8} ${C+25} Q${C} ${C+30} ${C+8} ${C+25}" fill="none" stroke="#222" stroke-width="2"/>`;
    }},
    { name: 'astronaut', label: '宇宙飛行士', bg: '#0a0a20', draw() {
        return `
        <circle cx="${C}" cy="${C}" r="55" fill="#ddd"/>
        <circle cx="${C}" cy="${C}" r="42" fill="#1a2a4a"/>
        <circle cx="${C}" cy="${C+5}" r="35" fill="#87CEEB" opacity="0.3"/>
        <circle cx="${C-10}" cy="${C}" r="4" fill="#fff"/>
        <circle cx="${C+10}" cy="${C}" r="4" fill="#fff"/>
        <path d="M${C-8} ${C+12} Q${C} ${C+18} ${C+8} ${C+12}" fill="none" stroke="#fff" stroke-width="2"/>
        <circle cx="${C-20}" cy="${C-15}" r="6" fill="rgba(255,255,255,0.2)"/>
        <rect x="${C-8}" y="${C-60}" width="16" height="10" rx="3" fill="#e53935"/>`;
    }},
    { name: 'detective', label: '探偵', bg: '#181818', draw() {
        return `
        <circle cx="${C}" cy="${C+10}" r="45" fill="#deb887"/>
        <ellipse cx="${C}" cy="${C-18}" rx="52" ry="14" fill="#3e2723"/>
        <path d="M${C-40} ${C-18} Q${C-35} ${C-55} ${C} ${C-50} Q${C+35} ${C-55} ${C+40} ${C-18}" fill="#3e2723"/>
        <circle cx="${C-15}" cy="${C+5}" r="4" fill="#222"/>
        <circle cx="${C+15}" cy="${C+5}" r="4" fill="#222"/>
        <circle cx="${C+15}" cy="${C+5}" r="10" fill="none" stroke="#FFD700" stroke-width="1.5"/>
        <line x1="${C+22}" y1="${C+12}" x2="${C+32}" y2="${C+22}" stroke="#FFD700" stroke-width="2"/>
        <path d="M${C-25} ${C+30} L${C-15} ${C+50} L${C} ${C+45}" fill="#5D4037"/>`;
    }},

    // === ANIMALS (10) ===
    { name: 'wolf', label: 'オオカミ', bg: '#141828', draw() {
        return `
        <ellipse cx="${C}" cy="${C+15}" rx="45" ry="50" fill="#607d8b"/>
        <polygon points="${C-40},${C-15} ${C-25},${C-65} ${C-10},${C-15}" fill="#546e7a"/>
        <polygon points="${C+40},${C-15} ${C+25},${C-65} ${C+10},${C-15}" fill="#546e7a"/>
        <polygon points="${C-35},${C-15} ${C-22},${C-55} ${C-12},${C-15}" fill="#78909c"/>
        <polygon points="${C+35},${C-15} ${C+22},${C-55} ${C+12},${C-15}" fill="#78909c"/>
        <circle cx="${C-15}" cy="${C}" r="5" fill="#FFD700"/>
        <circle cx="${C+15}" cy="${C}" r="5" fill="#FFD700"/>
        <circle cx="${C-15}" cy="${C}" r="2.5" fill="#222"/>
        <circle cx="${C+15}" cy="${C}" r="2.5" fill="#222"/>
        <ellipse cx="${C}" cy="${C+22}" rx="12" ry="8" fill="#455a64"/>
        <ellipse cx="${C}" cy="${C+18}" rx="5" ry="3" fill="#222"/>`;
    }},
    { name: 'eagle', label: 'ワシ', bg: '#1a1408', draw() {
        return `
        <ellipse cx="${C}" cy="${C+10}" rx="40" ry="45" fill="#5D4037"/>
        <ellipse cx="${C}" cy="${C-5}" rx="35" ry="28" fill="#fff"/>
        <circle cx="${C-14}" cy="${C-8}" r="6" fill="#FFD700"/>
        <circle cx="${C+14}" cy="${C-8}" r="6" fill="#FFD700"/>
        <circle cx="${C-14}" cy="${C-8}" r="3" fill="#222"/>
        <circle cx="${C+14}" cy="${C-8}" r="3" fill="#222"/>
        <polygon points="${C},${C+5} ${C-8},${C+20} ${C+8},${C+20}" fill="#FF8F00"/>
        <polygon points="${C},${C+2} ${C-6},${C+15} ${C+6},${C+15}" fill="#FFB300"/>
        <path d="M${C-30} ${C-30} Q${C-15} ${C-50} ${C} ${C-45} Q${C+15} ${C-50} ${C+30} ${C-30}" fill="#3E2723"/>`;
    }},
    { name: 'lion', label: 'ライオン', bg: '#201800', draw() {
        return `
        <circle cx="${C}" cy="${C}" r="60" fill="#BF7413"/>
        <circle cx="${C}" cy="${C+5}" r="42" fill="#F4A82A"/>
        <circle cx="${C-14}" cy="${C-5}" r="5" fill="#222"/>
        <circle cx="${C+14}" cy="${C-5}" r="5" fill="#222"/>
        <ellipse cx="${C}" cy="${C+12}" rx="10" ry="6" fill="#8B4513"/>
        <path d="M${C-15} ${C+22} Q${C} ${C+32} ${C+15} ${C+22}" fill="none" stroke="#222" stroke-width="2"/>
        <line x1="${C-8}" y1="${C+15}" x2="${C-25}" y2="${C+10}" stroke="#222" stroke-width="1.5"/>
        <line x1="${C-8}" y1="${C+17}" x2="${C-25}" y2="${C+17}" stroke="#222" stroke-width="1.5"/>
        <line x1="${C+8}" y1="${C+15}" x2="${C+25}" y2="${C+10}" stroke="#222" stroke-width="1.5"/>
        <line x1="${C+8}" y1="${C+17}" x2="${C+25}" y2="${C+17}" stroke="#222" stroke-width="1.5"/>`;
    }},
    { name: 'fox', label: 'キツネ', bg: '#1a0c00', draw() {
        return `
        <ellipse cx="${C}" cy="${C+10}" rx="40" ry="45" fill="#e65100"/>
        <polygon points="${C-35},${C-10} ${C-20},${C-65} ${C-5},${C-10}" fill="#e65100"/>
        <polygon points="${C+35},${C-10} ${C+20},${C-65} ${C+5},${C-10}" fill="#e65100"/>
        <polygon points="${C-30},${C-10} ${C-18},${C-50} ${C-8},${C-10}" fill="#ff8a65"/>
        <polygon points="${C+30},${C-10} ${C+18},${C-50} ${C+8},${C-10}" fill="#ff8a65"/>
        <ellipse cx="${C}" cy="${C+25}" rx="22" ry="20" fill="#fff3e0"/>
        <circle cx="${C-14}" cy="${C}" r="4" fill="#222"/>
        <circle cx="${C+14}" cy="${C}" r="4" fill="#222"/>
        <ellipse cx="${C}" cy="${C+15}" rx="5" ry="3" fill="#222"/>`;
    }},
    { name: 'owl', label: 'フクロウ', bg: '#0e1020', draw() {
        return `
        <ellipse cx="${C}" cy="${C+10}" rx="45" ry="50" fill="#5D4037"/>
        <polygon points="${C-35},${C-15} ${C-25},${C-55} ${C-10},${C-20}" fill="#4E342E"/>
        <polygon points="${C+35},${C-15} ${C+25},${C-55} ${C+10},${C-20}" fill="#4E342E"/>
        <circle cx="${C-18}" cy="${C}" r="18" fill="#FFF8E1"/>
        <circle cx="${C+18}" cy="${C}" r="18" fill="#FFF8E1"/>
        <circle cx="${C-18}" cy="${C}" r="9" fill="#FF8F00"/>
        <circle cx="${C+18}" cy="${C}" r="9" fill="#FF8F00"/>
        <circle cx="${C-18}" cy="${C}" r="5" fill="#222"/>
        <circle cx="${C+18}" cy="${C}" r="5" fill="#222"/>
        <polygon points="${C},${C+12} ${C-6},${C+22} ${C+6},${C+22}" fill="#FF8F00"/>
        <ellipse cx="${C}" cy="${C+40}" rx="25" ry="15" fill="#6D4C41"/>`;
    }},
    { name: 'dragon', label: 'ドラゴン', bg: '#1a0008', draw() {
        return `
        <ellipse cx="${C}" cy="${C+5}" rx="42" ry="48" fill="#388e3c"/>
        <polygon points="${C-30},${C-20} ${C-20},${C-60} ${C-10},${C-20}" fill="#2e7d32"/>
        <polygon points="${C},${C-25} ${C},${C-70} ${C+10},${C-25}" fill="#2e7d32"/>
        <polygon points="${C+30},${C-20} ${C+20},${C-60} ${C+10},${C-20}" fill="#2e7d32"/>
        <circle cx="${C-16}" cy="${C-5}" r="6" fill="#f44336"/>
        <circle cx="${C+16}" cy="${C-5}" r="6" fill="#f44336"/>
        <circle cx="${C-16}" cy="${C-5}" r="3" fill="#222"/>
        <circle cx="${C+16}" cy="${C-5}" r="3" fill="#222"/>
        <ellipse cx="${C}" cy="${C+15}" rx="15" ry="8" fill="#2e7d32"/>
        <ellipse cx="${C-6}" cy="${C+13}" rx="2" ry="3" fill="#1b5e20"/>
        <ellipse cx="${C+6}" cy="${C+13}" rx="2" ry="3" fill="#1b5e20"/>`;
    }},
    { name: 'shark', label: 'サメ', bg: '#081828', draw() {
        return `
        <ellipse cx="${C}" cy="${C+5}" rx="50" ry="40" fill="#546e7a"/>
        <polygon points="${C},${C-35} ${C-15},${C-5} ${C+15},${C-5}" fill="#546e7a"/>
        <ellipse cx="${C}" cy="${C+15}" rx="35" ry="20" fill="#cfd8dc"/>
        <circle cx="${C-20}" cy="${C-5}" r="5" fill="#fff"/>
        <circle cx="${C+20}" cy="${C-5}" r="5" fill="#fff"/>
        <circle cx="${C-20}" cy="${C-5}" r="2.5" fill="#222"/>
        <circle cx="${C+20}" cy="${C-5}" r="2.5" fill="#222"/>
        <path d="M${C-20} ${C+20} L${C-15} ${C+28} L${C-10} ${C+20} L${C-5} ${C+28} L${C} ${C+20} L${C+5} ${C+28} L${C+10} ${C+20} L${C+15} ${C+28} L${C+20} ${C+20}" fill="#fff" stroke="#fff" stroke-width="1"/>`;
    }},
    { name: 'cat', label: 'ネコ', bg: '#1a1020', draw() {
        return `
        <ellipse cx="${C}" cy="${C+10}" rx="42" ry="45" fill="#8d6e63"/>
        <polygon points="${C-35},${C-10} ${C-25},${C-60} ${C-8},${C-15}" fill="#8d6e63"/>
        <polygon points="${C+35},${C-10} ${C+25},${C-60} ${C+8},${C-15}" fill="#8d6e63"/>
        <polygon points="${C-30},${C-10} ${C-22},${C-50} ${C-10},${C-15}" fill="#a1887f"/>
        <polygon points="${C+30},${C-10} ${C+22},${C-50} ${C+10},${C-15}" fill="#a1887f"/>
        <circle cx="${C-15}" cy="${C}" r="7" fill="#66bb6a"/>
        <circle cx="${C+15}" cy="${C}" r="7" fill="#66bb6a"/>
        <circle cx="${C-15}" cy="${C}" r="3" fill="#222"/>
        <circle cx="${C+15}" cy="${C}" r="3" fill="#222"/>
        <ellipse cx="${C}" cy="${C+15}" rx="4" ry="3" fill="#e91e63"/>
        <line x1="${C-4}" y1="${C+15}" x2="${C-25}" y2="${C+10}" stroke="#bbb" stroke-width="1.2"/>
        <line x1="${C-4}" y1="${C+17}" x2="${C-25}" y2="${C+20}" stroke="#bbb" stroke-width="1.2"/>
        <line x1="${C+4}" y1="${C+15}" x2="${C+25}" y2="${C+10}" stroke="#bbb" stroke-width="1.2"/>
        <line x1="${C+4}" y1="${C+17}" x2="${C+25}" y2="${C+20}" stroke="#bbb" stroke-width="1.2"/>`;
    }},
    { name: 'bear', label: 'クマ', bg: '#181210', draw() {
        return `
        <circle cx="${C-30}" cy="${C-30}" r="18" fill="#5D4037"/>
        <circle cx="${C+30}" cy="${C-30}" r="18" fill="#5D4037"/>
        <circle cx="${C-30}" cy="${C-30}" r="10" fill="#795548"/>
        <circle cx="${C+30}" cy="${C-30}" r="10" fill="#795548"/>
        <circle cx="${C}" cy="${C+5}" r="50" fill="#6D4C41"/>
        <circle cx="${C-16}" cy="${C-8}" r="5" fill="#222"/>
        <circle cx="${C+16}" cy="${C-8}" r="5" fill="#222"/>
        <ellipse cx="${C}" cy="${C+12}" rx="14" ry="10" fill="#8D6E63"/>
        <ellipse cx="${C}" cy="${C+9}" rx="5" ry="4" fill="#222"/>
        <path d="M${C-8} ${C+18} Q${C} ${C+25} ${C+8} ${C+18}" fill="none" stroke="#222" stroke-width="2"/>`;
    }},
    { name: 'phoenix', label: 'フェニックス', bg: '#200808', draw() {
        return `
        <ellipse cx="${C}" cy="${C+10}" rx="38" ry="42" fill="#e65100"/>
        <polygon points="${C-10},${C-25} ${C},${C-70} ${C+10},${C-25}" fill="#f44336"/>
        <polygon points="${C-25},${C-15} ${C-15},${C-55} ${C-5},${C-20}" fill="#ff9800"/>
        <polygon points="${C+25},${C-15} ${C+15},${C-55} ${C+5},${C-20}" fill="#ff9800"/>
        <polygon points="${C-5},${C-20} ${C+5},${C-65} ${C+15},${C-20}" fill="#ffeb3b"/>
        <circle cx="${C-12}" cy="${C}" r="5" fill="#fff"/>
        <circle cx="${C+12}" cy="${C}" r="5" fill="#fff"/>
        <circle cx="${C-12}" cy="${C}" r="2.5" fill="#222"/>
        <circle cx="${C+12}" cy="${C}" r="2.5" fill="#222"/>
        <polygon points="${C},${C+12} ${C-6},${C+22} ${C+6},${C+22}" fill="#FFD700"/>
        <path d="M${C-35} ${C+20} Q${C-55} ${C+50} ${C-30} ${C+70}" fill="none" stroke="#ff9800" stroke-width="3"/>
        <path d="M${C+35} ${C+20} Q${C+55} ${C+50} ${C+30} ${C+70}" fill="none" stroke="#ff9800" stroke-width="3"/>`;
    }},

    // === ZODIAC / CELESTIAL (10) ===
    { name: 'aries', label: '牡羊座', bg: '#200c0c', draw() {
        return `
        <circle cx="${C}" cy="${C+10}" r="40" fill="#fff3e0"/>
        <path d="M${C-30} ${C-10} Q${C-35} ${C-50} ${C-15} ${C-45} Q${C} ${C-40} ${C-5} ${C-20}" fill="none" stroke="#8d6e63" stroke-width="6" stroke-linecap="round"/>
        <path d="M${C+30} ${C-10} Q${C+35} ${C-50} ${C+15} ${C-45} Q${C} ${C-40} ${C+5} ${C-20}" fill="none" stroke="#8d6e63" stroke-width="6" stroke-linecap="round"/>
        <circle cx="${C-12}" cy="${C+5}" r="4" fill="#222"/>
        <circle cx="${C+12}" cy="${C+5}" r="4" fill="#222"/>
        <ellipse cx="${C}" cy="${C+18}" rx="5" ry="3" fill="#e91e63"/>`;
    }},
    { name: 'taurus', label: '牡牛座', bg: '#0c1a0c', draw() {
        return `
        <circle cx="${C}" cy="${C+10}" r="45" fill="#8d6e63"/>
        <path d="M${C-40} ${C-15} Q${C-55} ${C-45} ${C-30} ${C-40}" fill="none" stroke="#5D4037" stroke-width="7" stroke-linecap="round"/>
        <path d="M${C+40} ${C-15} Q${C+55} ${C-45} ${C+30} ${C-40}" fill="none" stroke="#5D4037" stroke-width="7" stroke-linecap="round"/>
        <circle cx="${C-15}" cy="${C}" r="5" fill="#222"/>
        <circle cx="${C+15}" cy="${C}" r="5" fill="#222"/>
        <ellipse cx="${C}" cy="${C+18}" rx="18" ry="12" fill="#795548"/>
        <circle cx="${C-6}" cy="${C+16}" r="3" fill="#6D4C41"/>
        <circle cx="${C+6}" cy="${C+16}" r="3" fill="#6D4C41"/>`;
    }},
    { name: 'gemini', label: '双子座', bg: '#0c0c20', draw() {
        return `
        <circle cx="${C-28}" cy="${C}" r="30" fill="#7986cb"/>
        <circle cx="${C+28}" cy="${C}" r="30" fill="#9fa8da"/>
        <circle cx="${C-35}" cy="${C-5}" r="3" fill="#222"/>
        <circle cx="${C-22}" cy="${C-5}" r="3" fill="#222"/>
        <path d="M${C-35} ${C+8} Q${C-28} ${C+14} ${C-22} ${C+8}" fill="none" stroke="#222" stroke-width="1.5"/>
        <circle cx="${C+22}" cy="${C-5}" r="3" fill="#222"/>
        <circle cx="${C+35}" cy="${C-5}" r="3" fill="#222"/>
        <path d="M${C+22} ${C+8} Q${C+28} ${C+14} ${C+35} ${C+8}" fill="none" stroke="#222" stroke-width="1.5"/>
        <line x1="${C-10}" y1="${C-15}" x2="${C+10}" y2="${C-15}" stroke="#c5cae9" stroke-width="3"/>
        <line x1="${C-10}" y1="${C+15}" x2="${C+10}" y2="${C+15}" stroke="#c5cae9" stroke-width="3"/>`;
    }},
    { name: 'leo', label: '獅子座', bg: '#201400', draw() {
        return `
        <circle cx="${C}" cy="${C}" r="62" fill="#E65100"/>
        <circle cx="${C}" cy="${C+5}" r="44" fill="#FF8F00"/>
        <circle cx="${C-14}" cy="${C-5}" r="5" fill="#222"/>
        <circle cx="${C+14}" cy="${C-5}" r="5" fill="#222"/>
        <ellipse cx="${C}" cy="${C+10}" rx="8" ry="5" fill="#BF360C"/>
        <path d="M${C-18} ${C+18} Q${C} ${C+32} ${C+18} ${C+18}" fill="none" stroke="#222" stroke-width="2.5"/>
        <text x="${C}" y="${C+55}" text-anchor="middle" fill="#FFD700" font-size="18" font-weight="bold">♌</text>`;
    }},
    { name: 'scorpio', label: '蠍座', bg: '#1a0018', draw() {
        return `
        <ellipse cx="${C}" cy="${C+10}" rx="48" ry="35" fill="#6a1b9a"/>
        <circle cx="${C-15}" cy="${C}" r="5" fill="#ce93d8"/>
        <circle cx="${C+15}" cy="${C}" r="5" fill="#ce93d8"/>
        <circle cx="${C-15}" cy="${C}" r="2.5" fill="#222"/>
        <circle cx="${C+15}" cy="${C}" r="2.5" fill="#222"/>
        <path d="M${C+35} ${C+5} Q${C+55} ${C-20} ${C+45} ${C-40} Q${C+38} ${C-55} ${C+30} ${C-45}" fill="none" stroke="#6a1b9a" stroke-width="5" stroke-linecap="round"/>
        <polygon points="${C+25},${C-50} ${C+35},${C-40} ${C+30},${C-55}" fill="#f44336"/>
        <path d="M${C-35} ${C+25} Q${C-50} ${C+50} ${C-30} ${C+60}" fill="none" stroke="#6a1b9a" stroke-width="4"/>
        <path d="M${C+30} ${C+25} Q${C+45} ${C+50} ${C+25} ${C+60}" fill="none" stroke="#6a1b9a" stroke-width="4"/>`;
    }},
    { name: 'sagittarius', label: '射手座', bg: '#141018', draw() {
        return `
        <circle cx="${C}" cy="${C}" r="50" fill="#283593"/>
        <line x1="${C-30}" y1="${C+30}" x2="${C+25}" y2="${C-25}" stroke="#FFD700" stroke-width="3"/>
        <polygon points="${C+25},${C-25} ${C+35},${C-35} ${C+20},${C-35} ${C+35},${C-20}" fill="#FFD700"/>
        <path d="M${C-25} ${C+40} Q${C-10} ${C+15} ${C} ${C+5} Q${C+10} ${C-5} ${C+20} ${C-15}" fill="none" stroke="#7986cb" stroke-width="4" stroke-linecap="round"/>
        <text x="${C}" y="${C+65}" text-anchor="middle" fill="#9fa8da" font-size="18" font-weight="bold">♐</text>`;
    }},
    { name: 'star', label: '星', bg: '#0a0a1a', draw() {
        let points = '';
        for (let i = 0; i < 5; i++) {
            const outerAngle = (i * 72 - 90) * Math.PI / 180;
            const innerAngle = ((i * 72) + 36 - 90) * Math.PI / 180;
            points += `${C + 55 * Math.cos(outerAngle)},${C + 55 * Math.sin(outerAngle)} `;
            points += `${C + 22 * Math.cos(innerAngle)},${C + 22 * Math.sin(innerAngle)} `;
        }
        return `
        <polygon points="${points.trim()}" fill="#FFD700"/>
        <circle cx="${C}" cy="${C}" r="18" fill="#FFF8E1"/>
        <circle cx="${C-6}" cy="${C-3}" r="2.5" fill="#333"/>
        <circle cx="${C+6}" cy="${C-3}" r="2.5" fill="#333"/>
        <path d="M${C-5} ${C+5} Q${C} ${C+10} ${C+5} ${C+5}" fill="none" stroke="#333" stroke-width="1.5"/>`;
    }},
    { name: 'moon', label: '月', bg: '#0a0c1a', draw() {
        return `
        <circle cx="${C}" cy="${C}" r="55" fill="#FDD835"/>
        <circle cx="${C+25}" cy="${C-15}" r="45" fill="#0a0c1a"/>
        <circle cx="${C-20}" cy="${C-10}" r="3" fill="#333"/>
        <circle cx="${C-10}" cy="${C+15}" r="2" fill="#333"/>
        <circle cx="${C-30}" cy="${C+5}" r="2.5" fill="#333"/>
        <circle cx="${C-5}" cy="${C-25}" r="1.5" fill="#FBC02D" opacity="0.5"/>
        <circle cx="${C-35}" cy="${C-15}" r="2" fill="#FBC02D" opacity="0.5"/>`;
    }},
    { name: 'sun', label: '太陽', bg: '#1a1000', draw() {
        let rays = '';
        for (let i = 0; i < 12; i++) {
            const angle = (i * 30) * Math.PI / 180;
            const x1 = C + 45 * Math.cos(angle);
            const y1 = C + 45 * Math.sin(angle);
            const x2 = C + 65 * Math.cos(angle);
            const y2 = C + 65 * Math.sin(angle);
            rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#FFD700" stroke-width="4" stroke-linecap="round"/>`;
        }
        return `
        ${rays}
        <circle cx="${C}" cy="${C}" r="42" fill="#FF8F00"/>
        <circle cx="${C}" cy="${C}" r="35" fill="#FFA000"/>
        <circle cx="${C-12}" cy="${C-8}" r="4" fill="#222"/>
        <circle cx="${C+12}" cy="${C-8}" r="4" fill="#222"/>
        <path d="M${C-15} ${C+10} Q${C} ${C+22} ${C+15} ${C+10}" fill="none" stroke="#222" stroke-width="2.5"/>`;
    }},
    { name: 'comet', label: '彗星', bg: '#08081a', draw() {
        return `
        <path d="M${C+20} ${C} Q${C-20} ${C+10} ${C-80} ${C+15}" fill="none" stroke="#64b5f6" stroke-width="8" opacity="0.3"/>
        <path d="M${C+20} ${C} Q${C-10} ${C+5} ${C-60} ${C+8}" fill="none" stroke="#90caf9" stroke-width="5" opacity="0.5"/>
        <path d="M${C+20} ${C} Q${C} ${C+2} ${C-40} ${C+3}" fill="none" stroke="#bbdefb" stroke-width="3" opacity="0.7"/>
        <circle cx="${C+20}" cy="${C}" r="22" fill="#e3f2fd"/>
        <circle cx="${C+20}" cy="${C}" r="15" fill="#bbdefb"/>
        <circle cx="${C+20}" cy="${C}" r="8" fill="#fff"/>
        <circle cx="${C+15}" cy="${C-5}" r="2" fill="#90caf9"/>
        <circle cx="${C+28}" cy="${C+3}" r="1.5" fill="#90caf9"/>`;
    }},
];

// Generate all SVG files
let count = 0;
for (const a of avatars) {
    const content = a.draw();
    const svg = svgWrap(a.bg, content);
    const filePath = path.join(dir, `${a.name}.svg`);
    fs.writeFileSync(filePath, svg, 'utf8');
    count++;
    console.log(`  ✓ ${a.name}.svg (${a.label})`);
}
console.log(`\nDone! Generated ${count} avatar SVG files in avatars/`);
