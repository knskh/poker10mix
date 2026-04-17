// js/utils.js — Shared pure helpers used across the client.
// Loaded after constants.js; exposes helpers on the global scope.

// ==========================================
// HTML escaping / text linkification
// ==========================================
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Escape + convert newlines to <br>
function linkifyBody(s) {
    return escapeHtml(s || '').replace(/\n/g, '<br>');
}

// Escape + highlight @mentions + newlines
function linkifyMentions(raw) {
    const escaped = escapeHtml(String(raw == null ? '' : raw));
    return escaped
        .replace(/@([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)/g, '<span class="mx-mention">@$1</span>')
        .replace(/\n/g, '<br>');
}

// ==========================================
// Time / date formatting
// ==========================================
function formatDateJP(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${day}日 ${hh}:${mm}`;
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000)    return 'たった今';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}分前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;
    return `${Math.floor(diff / 86400000)}日前`;
}

// ==========================================
// Chip / BB formatting
// ==========================================
// Format chip amount with thousands separators.
function fmtChips(n) {
    return (n == null ? 0 : Number(n)).toLocaleString();
}

// Create a BB-formatter bound to a given big blind.
function makeBBFormatter(bb) {
    const base = bb || 100;
    return (n) => {
        if (!n) return '0bb';
        const v = n / base;
        return (Number.isInteger(v) ? v : parseFloat(v.toFixed(1))) + 'bb';
    };
}

// ==========================================
// Card normalization
// ==========================================
// Accepts both {rank, suit} (server/timeline) and {r, s} (stored hand history).
// Returns a canonical {rank, suit} object, or null if invalid.
function normalizeCard(c) {
    if (!c) return null;
    const rank = c.rank != null ? c.rank : c.r;
    const suit = c.suit != null ? c.suit : c.s;
    if (rank == null || suit == null) return null;
    return { rank, suit };
}

// Normalize an array of cards; filters out invalid entries.
function normalizeCards(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeCard).filter(Boolean);
}

// Render a numeric rank (2-14) or string rank as its display label.
function rankLabel(rank) {
    const letters = (window.APP_CONSTANTS && window.APP_CONSTANTS.RANK_LETTER) || { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
    return letters[rank] || String(rank);
}

// Render a suit letter (s/h/d/c) as its ♠♥♦♣ symbol.
function suitSymbol(suit) {
    const map = (window.APP_CONSTANTS && window.APP_CONSTANTS.SUIT_SYMBOL) || { s: '♠', h: '♥', d: '♦', c: '♣' };
    return map[suit] || suit || '?';
}

// ==========================================
// Misc
// ==========================================
function isMobileViewport() {
    const bp = (window.APP_CONSTANTS && window.APP_CONSTANTS.MOBILE_MAX_WIDTH_PX) || 600;
    return window.innerWidth <= bp;
}

function isPCViewport() {
    const bp = (window.APP_CONSTANTS && window.APP_CONSTANTS.PC_MIN_WIDTH_PX) || 768;
    return window.innerWidth >= bp;
}
