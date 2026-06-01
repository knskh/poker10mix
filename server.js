// server.js - Multiplayer Poker Server (HTTP + WebSocket)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

// Set up globals needed by game.js (same as browser script loading order)
const _deckMod = require('./js/deck');
const _evalMod = require('./js/evaluator');
global.Deck = _deckMod.Deck;
global.SUITS = _deckMod.SUITS;
global.RANKS = _deckMod.RANKS;
global.RANK_CHARS = _deckMod.RANK_CHARS;
global.RANK_NAMES = _deckMod.RANK_NAMES;
global.SUIT_SYMBOLS = _deckMod.SUIT_SYMBOLS;
global.evaluateHand = _evalMod.evaluateHand;
global.compareHands = _evalMod.compareHands;
global.compareArrays = _evalMod.compareArrays;
global.bestHighHand = _evalMod.bestHighHand;

const { GAME_LIST, GameState } = require('./js/game');
const { StatsTracker } = require('./js/stats');

// ============================================
// Data directory (footprints etc.)
// ============================================
const DATA_DIR = path.join(__dirname, 'data');

// ============================================
// Footprints (profile view tracking)
// ============================================
const FOOTPRINTS_FILE = path.join(DATA_DIR, 'footprints.json');
const footprintsMap = new Map(); // viewedName -> [{viewer, viewerAvatar, timestamp}]

function loadFootprints() {
    try {
        if (!fs.existsSync(FOOTPRINTS_FILE)) return;
        const data = JSON.parse(fs.readFileSync(FOOTPRINTS_FILE, 'utf8'));
        for (const [viewed, list] of Object.entries(data)) {
            footprintsMap.set(viewed, Array.isArray(list) ? list : []);
        }
        console.log(`Loaded footprints for ${footprintsMap.size} users`);
    } catch (e) {
        console.warn('Failed to load footprints.json:', e.message);
    }
}

let saveFootprintsTimer = null;
function saveFootprintsDebounced() {
    if (saveFootprintsTimer) return;
    saveFootprintsTimer = setTimeout(() => {
        saveFootprintsTimer = null;
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            const obj = {};
            for (const [k, v] of footprintsMap) obj[k] = v;
            fs.writeFileSync(FOOTPRINTS_FILE, JSON.stringify(obj, null, 2), 'utf8');
        } catch (e) {
            console.warn('Failed to save footprints.json:', e.message);
        }
    }, 1000);
}

function addFootprint(viewedName, viewerName, viewerAvatar) {
    if (!viewedName || !viewerName || viewedName === viewerName) return;
    let list = footprintsMap.get(viewedName);
    if (!list) { list = []; footprintsMap.set(viewedName, list); }
    // Remove previous entry from same viewer (dedupe to latest)
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].viewer === viewerName) list.splice(i, 1);
    }
    list.unshift({ viewer: viewerName, viewerAvatar: viewerAvatar || null, timestamp: Date.now() });
    if (list.length > 30) list.length = 30;
    saveFootprintsDebounced();
}

function getFootprints(name) {
    return footprintsMap.get(name) || [];
}

loadFootprints();


// ============================================
// Account System (Supabase with local JSON fallback)
// ============================================
const crypto = require('crypto');
let createClient = null;
try { ({ createClient } = require('@supabase/supabase-js')); } catch (e) { /* optional */ }

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// This project's Supabase URL points directly to PostgREST (not the standard
// Kong API gateway), so the SDK's hard-coded "/rest/v1/" prefix produces
// 404 PGRST125 "Invalid path specified in request URL". We patch the fetch
// path to drop that prefix when present.
function makeSupabaseClient(url, key) {
    if (!createClient || !url || !key) return null;
    const customFetch = (input, init) => {
        let target = typeof input === 'string' ? input : (input && input.url) || '';
        // Strip /rest/v1 segment so requests land at PostgREST root path.
        target = target.replace('/rest/v1/', '/').replace(/\/rest\/v1$/, '');
        return fetch(target, init);
    };
    return createClient(url, key, { global: { fetch: customFetch } });
}
const supabase = makeSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// Player Stats (for Player Cloud visualization)
// ============================================
// In-memory cache: { [name]: { total_profit, session_count, total_diversity, total_hands } }
// Note: total_hands is stored in the comment_likes column of player_stats (repurposed)
const playerStatsMap = {};

// Local JSON persistence — works without Supabase, and acts as a safety net
// when Supabase IS configured (so a Supabase outage doesn't lose data).
const PLAYER_STATS_FILE = path.join(__dirname, 'player_stats.json');

function loadLocalPlayerStats() {
    try {
        if (!fs.existsSync(PLAYER_STATS_FILE)) return;
        const data = JSON.parse(fs.readFileSync(PLAYER_STATS_FILE, 'utf8')) || {};
        for (const [name, s] of Object.entries(data)) {
            playerStatsMap[name] = {
                total_profit:    (s && s.total_profit)    || 0,
                session_count:   (s && s.session_count)   || 0,
                total_diversity: (s && s.total_diversity) || 0,
                total_hands:     (s && s.total_hands)     || 0,
            };
        }
        console.log(`player_stats loaded from local JSON: ${Object.keys(data).length} records`);
    } catch (e) {
        console.warn('Failed to load player_stats.json:', e && e.message);
    }
}

let savePlayerStatsTimer = null;
function savePlayerStatsDebounced() {
    if (savePlayerStatsTimer) return;
    savePlayerStatsTimer = setTimeout(() => {
        savePlayerStatsTimer = null;
        try {
            fs.writeFileSync(PLAYER_STATS_FILE, JSON.stringify(playerStatsMap, null, 2), 'utf8');
        } catch (e) {
            console.warn('Failed to save player_stats.json:', e && e.message);
        }
    }, 500);
}

async function upsertPlayerStats(name, delta) {
    if (!name) return;
    if (!playerStatsMap[name]) {
        playerStatsMap[name] = { total_profit: 0, session_count: 0, total_diversity: 0, total_hands: 0 };
    }
    const s = playerStatsMap[name];
    if (delta.profitDelta    !== undefined) s.total_profit    += delta.profitDelta;
    if (delta.sessionDelta   !== undefined) s.session_count   += delta.sessionDelta;
    if (delta.diversityDelta !== undefined) s.total_diversity += delta.diversityDelta;
    if (delta.handsDelta     !== undefined) s.total_hands     += delta.handsDelta;

    // Always persist locally — works without Supabase and protects against
    // a Supabase outage. Debounced so rapid updates batch into one write.
    savePlayerStatsDebounced();

    if (supabase) {
        try {
            await supabase.from('player_stats').upsert({
                name,
                total_profit:    s.total_profit,
                session_count:   s.session_count,
                total_diversity: s.total_diversity,
                comment_likes:   s.total_hands,   // reuse comment_likes column for total_hands
                updated_at: new Date().toISOString(),
            }, { onConflict: 'name' });
        } catch (e) {
            console.warn('player_stats upsert error:', e && e.message);
        }
    }
}

// ============================================
// Session Records (per-table, per-session profit log used by 成績 modal)
// In-memory: array of records sorted newest-first.
//   { roomId, timestamp(ISO), handsPlayed, gameTypes, participants:[{name, profit, invested, endChips, handsPlayed}] }
// ============================================
const SESSION_RECORDS_FILE = path.join(__dirname, 'session_records.json');
const SESSION_RECORDS_MAX = 2000;            // メモリ/ローカルJSONの保持上限
// Supabase 側の保持上限。実際に使うのは最新 SESSION_RECORDS_MAX 件のみなので
// 余裕を持って 5000 件だけ残し、古い行は自動削除する。これにより
// session_records テーブルは無制限に増えず、~5MB 前後で頭打ちになる
// (無料枠 500MB に対して十分小さい)。
const SUPABASE_SESSION_RECORDS_KEEP = 5000;
const SESSION_RECORDS_PRUNE_EVERY = 50;      // 何件 insert ごとに prune するか
let sessionRecordInsertCount = 0;
const sessionRecords = [];

function loadLocalSessionRecords() {
    try {
        if (!fs.existsSync(SESSION_RECORDS_FILE)) return;
        const data = JSON.parse(fs.readFileSync(SESSION_RECORDS_FILE, 'utf8'));
        if (Array.isArray(data)) {
            sessionRecords.push(...data);
            console.log(`session_records loaded from local JSON: ${data.length} records`);
        }
    } catch (e) { console.warn('Failed to load session_records.json:', e && e.message); }
}

let saveSessionRecordsTimer = null;
function saveSessionRecordsDebounced() {
    if (saveSessionRecordsTimer) return;
    saveSessionRecordsTimer = setTimeout(() => {
        saveSessionRecordsTimer = null;
        try {
            fs.writeFileSync(SESSION_RECORDS_FILE, JSON.stringify(sessionRecords.slice(0, SESSION_RECORDS_MAX), null, 2), 'utf8');
        } catch (e) {
            console.warn('Failed to save session_records.json:', e && e.message);
        }
    }, 500);
}

async function loadSessionRecordsFromSupabase() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('session_records')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(SESSION_RECORDS_MAX);
        if (!error && Array.isArray(data)) {
            sessionRecords.length = 0;
            for (const row of data) {
                sessionRecords.push({
                    roomId: row.room_id,
                    timestamp: row.timestamp,
                    handsPlayed: row.hands_played,
                    gameTypes: row.game_types || [],
                    participants: row.participants || [],
                });
            }
            console.log(`session_records loaded from Supabase: ${data.length} records`);
        }
    } catch (e) {
        console.warn('session_records load error:', e && e.message);
    }
}

// Supabase の session_records を最新 SUPABASE_SESSION_RECORDS_KEEP 件に保つ。
// KEEP 件目(0-based)の timestamp を基準に、それより古い行をまとめて削除する。
// timestamp DESC のインデックスがあるため低負荷。
async function pruneSupabaseSessionRecords() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('session_records')
            .select('timestamp')
            .order('timestamp', { ascending: false })
            .range(SUPABASE_SESSION_RECORDS_KEEP, SUPABASE_SESSION_RECORDS_KEEP);
        // KEEP 件以下しか無ければ data は空 → 削除不要
        if (error || !data || data.length === 0) return;
        const cutoff = data[0].timestamp;
        const { error: delErr } = await supabase
            .from('session_records')
            .delete()
            .lt('timestamp', cutoff);
        if (delErr) console.warn('session_records prune delete error:', delErr.message);
        else console.log(`session_records pruned: removed rows older than ${cutoff}`);
    } catch (e) {
        console.warn('session_records prune error:', e && e.message);
    }
}

async function persistSessionRecord(record) {
    // Newest first.
    sessionRecords.unshift(record);
    if (sessionRecords.length > SESSION_RECORDS_MAX) sessionRecords.length = SESSION_RECORDS_MAX;
    saveSessionRecordsDebounced();
    if (supabase) {
        try {
            await supabase.from('session_records').insert({
                room_id: record.roomId,
                timestamp: record.timestamp,
                hands_played: record.handsPlayed,
                game_types: record.gameTypes,
                participants: record.participants,
            });
            // 一定件数ごとに古い行を間引く (毎回ではなく低頻度で実行)
            sessionRecordInsertCount++;
            if (sessionRecordInsertCount % SESSION_RECORDS_PRUNE_EVERY === 0) {
                pruneSupabaseSessionRecords().catch(() => {});
            }
        } catch (e) {
            console.warn('session_records insert error:', e && e.message);
        }
    }
}

loadLocalSessionRecords();
loadSessionRecordsFromSupabase();
// 起動時に一度だけ既存のバックログを間引く (過去に溜まった分の掃除)
if (supabase) setTimeout(() => pruneSupabaseSessionRecords().catch(() => {}), 8000);

// ============================================
// Lobby Chat (永続的なロビーチャットと、卓終了時の自動投稿)
// In-memory: newest-last (chat-style append order).
//   { id, type:'user'|'system', name, avatar, text, timestamp(ms),
//     sessionResult?: { roomId, handsPlayed, participants:[{name, profit}] } }
// ============================================
const LOBBY_CHAT_FILE = path.join(__dirname, 'lobby_chat.json');
const LOBBY_CHAT_MAX = 200;
const lobbyChat = [];

function loadLocalLobbyChat() {
    try {
        if (!fs.existsSync(LOBBY_CHAT_FILE)) return;
        const data = JSON.parse(fs.readFileSync(LOBBY_CHAT_FILE, 'utf8'));
        if (Array.isArray(data)) {
            lobbyChat.push(...data);
            console.log(`lobby_chat loaded from local JSON: ${data.length} messages`);
        }
    } catch (e) { console.warn('Failed to load lobby_chat.json:', e && e.message); }
}

let saveLobbyChatTimer = null;
function saveLobbyChatDebounced() {
    if (saveLobbyChatTimer) return;
    saveLobbyChatTimer = setTimeout(() => {
        saveLobbyChatTimer = null;
        try {
            fs.writeFileSync(LOBBY_CHAT_FILE, JSON.stringify(lobbyChat.slice(-LOBBY_CHAT_MAX), null, 2), 'utf8');
        } catch (e) {
            console.warn('Failed to save lobby_chat.json:', e && e.message);
        }
    }, 500);
}

function appendLobbyChat(message) {
    if (!message || !message.text || !message.text.trim()) return null;
    const entry = {
        id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: message.type || 'user',
        name: (message.name || '').slice(0, 24),
        avatar: message.avatar || null,
        text: String(message.text).slice(0, 500),
        timestamp: Date.now(),
    };
    if (message.sessionResult) entry.sessionResult = message.sessionResult;
    lobbyChat.push(entry);
    if (lobbyChat.length > LOBBY_CHAT_MAX) lobbyChat.splice(0, lobbyChat.length - LOBBY_CHAT_MAX);
    saveLobbyChatDebounced();
    return entry;
}

function broadcastLobbyChat(entry) {
    if (!entry) return;
    const payload = { type: 'lobby_chat_new', message: entry };
    for (const [, c] of clients) {
        if (c && c.ws) send(c.ws, payload);
    }
}

loadLocalLobbyChat();

async function loadAllPlayerStats() {
    // Always load local JSON first as the baseline.
    loadLocalPlayerStats();

    // If Supabase is configured, overlay its data (it's the source of truth
    // when present). Local entries that don't exist in Supabase are kept.
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('player_stats').select('*');
        if (!error && data) {
            for (const row of data) {
                playerStatsMap[row.name] = {
                    total_profit:    row.total_profit    || 0,
                    session_count:   row.session_count   || 0,
                    total_diversity: row.total_diversity || 0,
                    total_hands:     row.comment_likes   || 0,  // stored in comment_likes column
                };
            }
            // Re-save the merged view to local JSON for safety.
            savePlayerStatsDebounced();
            console.log(`player_stats loaded from Supabase: ${data.length} records`);
        }
    } catch (e) {
        console.warn('player_stats load error:', e && e.message);
    }
}
loadAllPlayerStats();

// Local JSON fallback (used when Supabase is not configured). This restores
// login on local / unconfigured deployments where the env vars are missing,
// instead of failing every request with "データベース未設定です".
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
let localAccounts = {};
const ACCOUNTS_BACKUP_FILE = ACCOUNTS_FILE + '.backup';

function loadLocalAccounts() {
    // Primary load.
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                localAccounts = parsed;
                console.log(`Accounts loaded: ${Object.keys(localAccounts).length} entries`);
                return;
            }
        }
    } catch (e) {
        console.error('Failed to load accounts.json (will try backup):', e.message);
    }
    // Fallback: try the backup file (catches the rare case where the main
    // file was truncated by a power loss between write and rename).
    try {
        if (fs.existsSync(ACCOUNTS_BACKUP_FILE)) {
            const raw = fs.readFileSync(ACCOUNTS_BACKUP_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                localAccounts = parsed;
                console.warn(`Accounts recovered from backup: ${Object.keys(localAccounts).length} entries`);
                return;
            }
        }
    } catch (e) {
        console.error('Failed to load accounts.json.backup:', e.message);
    }
    localAccounts = {};
}

// Atomic, verified save:
//   1. Write to a temp file (.tmp)
//   2. Read it back and compare to source-of-truth → catches disk corruption
//   3. Copy current accounts.json to .backup
//   4. Rename .tmp → accounts.json (atomic on most filesystems)
// Returns true on success, false on failure. On failure the caller can roll
// back the in-memory mutation so client and disk stay consistent.
function saveLocalAccounts() {
    const tmp = ACCOUNTS_FILE + '.tmp';
    const data = JSON.stringify(localAccounts, null, 2);
    try {
        fs.writeFileSync(tmp, data, 'utf8');
        // Verification: confirm the temp file actually contains what we wrote.
        const readBack = fs.readFileSync(tmp, 'utf8');
        if (readBack !== data) {
            try { fs.unlinkSync(tmp); } catch {}
            throw new Error('temp file content mismatch');
        }
        // Snapshot the existing file as a backup before overwriting it.
        if (fs.existsSync(ACCOUNTS_FILE)) {
            try { fs.copyFileSync(ACCOUNTS_FILE, ACCOUNTS_BACKUP_FILE); } catch (be) {
                console.warn('Backup copy failed (continuing):', be.message);
            }
        }
        // Atomic rename (replaces the existing file).
        fs.renameSync(tmp, ACCOUNTS_FILE);
        return true;
    } catch (e) {
        console.error('Failed to save accounts.json:', e.message);
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
        return false;
    }
}
loadLocalAccounts();

if (supabase) {
    console.log('Auth: using Supabase backend.');
} else {
    console.warn('Auth: Supabase not configured → using local accounts.json fallback.');
}

function hashPassword(password, salt) {
    if (!salt) salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

// ============================================
// Auth Session Tokens (persistent login)
// Tokens let the browser re-authenticate across page reloads / reconnects
// without the user re-entering credentials. Stored on disk as a fallback
// to survive server restarts.
// ============================================
const AUTH_TOKENS_FILE = path.join(__dirname, 'auth_tokens.json');
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
let authTokens = {}; // token -> { email, name, expiresAt }

function loadAuthTokens() {
    try {
        if (fs.existsSync(AUTH_TOKENS_FILE)) {
            authTokens = JSON.parse(fs.readFileSync(AUTH_TOKENS_FILE, 'utf8')) || {};
            const now = Date.now();
            let pruned = 0;
            for (const t of Object.keys(authTokens)) {
                const info = authTokens[t];
                if (!info || !info.expiresAt || info.expiresAt < now) {
                    delete authTokens[t];
                    pruned++;
                }
            }
            if (pruned) console.log(`Auth: pruned ${pruned} expired token(s).`);
        }
    } catch (e) { console.error('Failed to load auth_tokens.json:', e && e.message); }
}

let saveTokensTimer = null;
function saveAuthTokensDebounced() {
    if (saveTokensTimer) return;
    saveTokensTimer = setTimeout(() => {
        saveTokensTimer = null;
        try {
            fs.writeFileSync(AUTH_TOKENS_FILE, JSON.stringify(authTokens, null, 2), 'utf8');
        } catch (e) { console.error('Failed to save auth_tokens.json:', e && e.message); }
    }, 500);
}

function issueAuthToken(email, name) {
    const token = crypto.randomBytes(32).toString('hex');
    authTokens[token] = { email, name, expiresAt: Date.now() + TOKEN_TTL_MS };
    saveAuthTokensDebounced();
    return token;
}

function consumeAuthToken(token) {
    if (!token || typeof token !== 'string') return null;
    const info = authTokens[token];
    if (!info) return null;
    if (!info.expiresAt || info.expiresAt < Date.now()) {
        delete authTokens[token];
        saveAuthTokensDebounced();
        return null;
    }
    return info;
}

function revokeAuthToken(token) {
    if (token && authTokens[token]) {
        delete authTokens[token];
        saveAuthTokensDebounced();
    }
}

loadAuthTokens();

// ============================================
// Auth Handlers (async; Supabase preferred, local JSON fallback)
// ============================================
// Look up an account by email. Tries Supabase first if configured, then falls
// back to the local JSON store. Returns { name, salt, hash } or null.
async function lookupAccount(email) {
    if (supabase) {
        try {
            const { data, error } = await supabase.from('accounts').select('*').eq('email', email).limit(1);
            if (!error && data && data.length > 0) {
                const row = data[0];
                // Guard: if salt or password_hash is missing the schema is wrong.
                // Fall through to local JSON so login still works.
                if (row.salt && row.password_hash) {
                    return { name: row.name, salt: row.salt, hash: row.password_hash };
                }
                console.warn(`lookupAccount: Supabase row for ${email} is missing salt/password_hash — falling back to local JSON`);
            }
            if (error) console.warn('Supabase lookup error (falling back to local):', error.message);
        } catch (e) {
            console.warn('Supabase lookup exception (falling back to local):', e && e.message);
        }
    }
    const acc = localAccounts[email];
    if (acc) {
        if (!acc.salt || !acc.passwordHash) {
            console.warn(`lookupAccount: local entry for ${email} is missing salt/passwordHash`);
            return null;
        }
        return { name: acc.name, salt: acc.salt, hash: acc.passwordHash };
    }
    return null;
}

// Look up an account by name. Tries Supabase first, then local JSON.
// Returns true if the name is already taken, false otherwise.
async function isNameTaken(name) {
    const normalizedName = name.trim().toLowerCase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('accounts')
                .select('name')
                .ilike('name', normalizedName)
                .limit(1);
            if (!error && data && data.length > 0) return true;
            if (error) console.warn('Supabase name lookup error:', error.message);
        } catch (e) {
            console.warn('Supabase name lookup exception:', e && e.message);
        }
    }
    // Fallback: check local accounts
    return Object.values(localAccounts).some(
        acc => (acc.name || '').toLowerCase() === normalizedName
    );
}

// Basic email shape check — not RFC-compliant, just to reject obviously
// wrong inputs like "abc" or "@@". Combined with a length cap to keep DB
// rows bounded.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Display-name allow-list: ASCII alphanumerics, underscore/hyphen/space,
// hiragana / katakana / CJK / Latin diacritics. Blocks angle brackets,
// quotes, ampersands and other HTML-significant characters at registration
// time so display names can never smuggle markup downstream (chat, stats,
// reactions, profile views, etc.).
const NAME_RE = /^[A-Za-z0-9_\- \u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u00c0-\u024f]{1,20}$/;

async function handleRegister(ws, client, msg) {
    const email = (msg.email || '').trim().toLowerCase();
    const name = (msg.name || '').trim().slice(0, 20);
    const password = msg.password || '';

    if (!email || !name || password.length < 4) {
        send(ws, { type: 'auth_result', success: false, message: '入力内容を確認してください (メール/名前/4文字以上のパスワード)' });
        return;
    }
    if (!EMAIL_RE.test(email) || email.length > 120) {
        send(ws, { type: 'auth_result', success: false, message: '正しいメールアドレスを入力してください' });
        return;
    }
    if (!NAME_RE.test(name)) {
        send(ws, { type: 'auth_result', success: false, message: '名前は英数字・日本語・ハイフン・アンダースコアのみ使用できます' });
        return;
    }

    try {
        // Refuse if the email is already registered in either store.
        const existing = await lookupAccount(email);
        if (existing) {
            send(ws, { type: 'auth_result', success: false, message: 'このメールアドレスは既に登録されています' });
            return;
        }

        // Refuse if the name is already taken (case-insensitive).
        const nameTaken = await isNameTaken(name);
        if (nameTaken) {
            send(ws, { type: 'auth_result', success: false, message: 'このアカウント名は既に使用されています' });
            return;
        }

        const { hash, salt } = hashPassword(password);
        let supabaseSaved = false;

        if (supabase) {
            try {
                const { error } = await supabase.from('accounts').insert({ email, name, password_hash: hash, salt });
                if (!error) supabaseSaved = true;
                else console.warn('Supabase register error (falling back to local):', error.message);
            } catch (e) {
                console.warn('Supabase register exception (falling back to local):', e && e.message);
            }
        }

        // Always mirror to local JSON as a safety net (works offline / mis-configured
        // envs, and lets login fall back if Supabase becomes unreachable later).
        // Record the creation timestamp so admins can audit / sort by signup time.
        const createdAt = new Date().toISOString();
        localAccounts[email] = { email, name, passwordHash: hash, salt, createdAt };
        const localSaved = saveLocalAccounts();
        if (!localSaved) {
            // Roll back the in-memory mutation so the client and disk stay in
            // sync. (If Supabase succeeded the row still exists there, but
            // local fallback won't know about it until next Supabase load.)
            delete localAccounts[email];
            if (!supabaseSaved) {
                send(ws, { type: 'auth_result', success: false, message: 'アカウントの保存に失敗しました。ディスクの空き容量とパーミッションをご確認ください。' });
                return;
            }
        }

        // Confirm by reading back from disk so the success log is meaningful.
        let onDisk = false;
        try {
            const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            onDisk = !!(parsed && parsed[email] && parsed[email].passwordHash === hash);
        } catch {}

        client.name = name;
        client.email = email;
        client.authenticated = true;
        const token = issueAuthToken(email, name);
        console.log(`Register: ${name} <${email}>  saved={local:${localSaved}/onDisk:${onDisk}, supabase:${supabaseSaved}}`);
        send(ws, { type: 'auth_result', success: true, name, email, token });
    } catch (e) {
        console.error('Register error:', e && e.message);
        send(ws, { type: 'auth_result', success: false, message: 'エラーが発生しました' });
    }
}

async function handleLogin(ws, client, msg) {
    const email = (msg.email || '').trim().toLowerCase();
    const password = msg.password || '';

    if (!email || !password) {
        send(ws, { type: 'auth_result', success: false, message: 'メールアドレスとパスワードを入力してください' });
        return;
    }

    try {
        console.log(`Login attempt: ${email}`);
        const acc = await lookupAccount(email);
        if (!acc) {
            console.log(`Login failed: account not found for ${email}`);
            // Distinguish "no such account" from "wrong password" so the
            // client can guide the user to the register tab.
            send(ws, {
                type: 'auth_result', success: false,
                errorCode: 'account_not_found',
                message: 'このメールアドレスのアカウントは登録されていません。新規登録してください。'
            });
            return;
        }
        const accountName = acc.name;
        const accountSalt = acc.salt;
        const storedHash = acc.hash;

        const { hash } = hashPassword(password, accountSalt);
        if (hash !== storedHash) {
            console.log(`Login failed: wrong password for ${email}`);
            send(ws, {
                type: 'auth_result', success: false,
                errorCode: 'wrong_password',
                message: 'パスワードが正しくありません。'
            });
            return;
        }

        client.name = accountName;
        client.email = email;
        client.authenticated = true;
        const token = issueAuthToken(email, accountName);
        console.log(`Login OK: ${accountName} (${email})`);
        send(ws, { type: 'auth_result', success: true, name: accountName, email, token });
    } catch (e) {
        console.error('Login error:', e && e.message);
        send(ws, { type: 'auth_result', success: false, message: 'エラーが発生しました' });
    }
}

// Resume an existing session via a previously-issued token (page reload /
// reconnect). Mirrors the success shape of handleLogin so the client can
// reuse onAuthResult.
async function handleAuthResume(ws, client, msg) {
    const token = (msg && typeof msg.token === 'string') ? msg.token : '';
    const info = consumeAuthToken(token);
    if (!info) {
        console.log(`Auth resume: token invalid/expired`);
        send(ws, { type: 'auth_result', success: false, resumed: true, message: 'セッションが期限切れです。再ログインしてください。' });
        return;
    }
    try {
        // Confirm the account still exists — an admin could have removed it.
        const acc = await lookupAccount(info.email);
        if (!acc) {
            revokeAuthToken(token);
            send(ws, { type: 'auth_result', success: false, resumed: true, message: 'アカウントが見つかりません。再ログインしてください。' });
            return;
        }
        client.name = acc.name;
        client.email = info.email;
        client.authenticated = true;
        console.log(`Resume: ${acc.name} (${info.email})`);
        send(ws, { type: 'auth_result', success: true, resumed: true, name: acc.name, email: info.email, token });
    } catch (e) {
        console.error('Resume error:', e && e.message);
        send(ws, { type: 'auth_result', success: false, resumed: true, message: 'エラーが発生しました' });
    }
}

function handleLogout(ws, client, msg) {
    const token = (msg && typeof msg.token === 'string') ? msg.token : '';
    if (token) revokeAuthToken(token);
    client.authenticated = false;
    client.email = null;
}

// ============================================
// HTTP Server
// ============================================
const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const httpServer = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';
    const filePath = path.join(__dirname, url);
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': (MIME[ext] || 'text/plain') + '; charset=utf-8' });
        res.end(data);
    });
});

// ============================================
// WebSocket Server
// ============================================
const wss = new WebSocketServer({ server: httpServer });
const clients = new Map(); // ws -> client data
const rooms = new Map();   // roomId -> Room
let nextClientId = 1;

// ============================================
// Room
// ============================================
class Room {
    constructor(id, hostId, hostName) {
        this.id = id;
        this.hostId = hostId;
        this.hostName = hostName || '';  // Preserved even when room is temporarily empty (for lobby display)
        this.members = []; // [{ clientId, name, ws }]
        this.playerGames = {}; // clientId -> [gameIndex, ...] (per-player selection)
        this.settings = {
            selectedGames: GAME_LIST.map((_, i) => i),
            startingChips: 10000,
        };
        this.game = null;
        this.playing = false;
        this.pending = null; // { type, playerId, resolve, timer }
        this.seatMap = {};   // clientId -> seatIndex
        this.stats = new StatsTracker();
        this.locked = false; // 承認制テーブル
        this.pendingJoins = []; // [{ clientId, name, avatar, ws }]
    }

    // Intersection of all members' selected games (only games everyone wants)
    getMergedGames() {
        let result = new Set(GAME_LIST.map((_, i) => i));
        for (const m of this.members) {
            const sel = this.playerGames[m.clientId];
            if (sel && sel.length > 0) {
                result = new Set([...result].filter(i => sel.includes(i)));
            }
            // No selection = all games OK, no filtering needed
        }
        // Fallback: if intersection is empty, use all games
        if (result.size === 0) result = new Set(GAME_LIST.map((_, i) => i));
        return [...result].sort((a, b) => a - b);
    }

    getMember(clientId) {
        return this.members.find(m => m.clientId === clientId);
    }

    getClientBySeat(seatIdx) {
        for (const [cid, seat] of Object.entries(this.seatMap)) {
            if (seat === seatIdx) {
                return this.members.find(m => m.clientId === parseInt(cid));
            }
        }
        return null;
    }

    toJSON() {
        return {
            id: this.id,
            hostId: this.hostId,
            members: this.members.map(m => ({ clientId: m.clientId, name: m.name, avatar: m.avatar })),
            settings: this.settings,
            playerGames: this.playerGames,
            mergedGames: this.getMergedGames(),
            playing: this.playing,
            playerCount: this.members.length,
            locked: this.locked,
            pendingJoins: this.pendingJoins.map(p => ({ clientId: p.clientId, name: p.name, avatar: p.avatar })),
        };
    }
}

function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id;
    do {
        id = '';
        for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
    } while (rooms.has(id));
    return id;
}

// ============================================
// Utility
// ============================================
function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcastToRoom(room, data) {
    const tagged = { ...data, roomId: room.id };
    for (const m of room.members) send(m.ws, tagged);
}

function broadcastRoomList() {
    const list = [...rooms.values()].map(r => ({
        id: r.id,
        hostName: r.members[0]?.name || r.hostName || '???',
        hostAvatar: r.members[0]?.avatar || null,
        playerCount: r.members.length, playing: r.playing,
        gameName: r.game?.gameConfig?.name || '',
        mergedGames: r.getMergedGames(),
        locked: r.locked,
        pendingCount: r.pendingJoins.length,
        // Small member preview — avatars/names only, capped by table size.
        members: r.members.slice(0, 6).map(m => ({ name: m.name, avatar: m.avatar || null }))
    }));
    for (const [ws] of clients) {
        send(ws, { type: 'room_list', rooms: list, zoomCount: zoomPlayers.size });
    }
}

function broadcastOnlineUsers() {
    const users = [];
    for (const [, c] of clients) {
        if (c.name.startsWith('Player') && !c.avatar) continue; // skip unnamed clients
        let status = 'lobby';
        if (c.inZoom) status = 'zoom';
        else if (c.roomIds.length > 0) status = 'playing';
        users.push({ name: c.name, avatar: c.avatar || null, status, isGuest: !!c.isGuest });
    }
    for (const [ws] of clients) {
        send(ws, { type: 'online_users', users });
    }
}

function broadcastRoomUpdate(room) {
    broadcastToRoom(room, { type: 'room_updated', room: room.toJSON() });
}

function broadcastLog(room, msg, cls) {
    broadcastToRoom(room, { type: 'log', message: msg, cls });
}

// ============================================
// Broadcast Stats Update (after each hand)
// ============================================
function broadcastStatsUpdate(room) {
    if (!room.game || !room.stats) return;
    const playerStats = {};
    for (let i = 0; i < room.game.playerCount; i++) {
        const pd = room.stats.getPlayer(i);
        const calc = room.stats.calc(pd.total);
        // Include per-game stats
        const byGame = {};
        for (const [gid, raw] of Object.entries(pd.byGame)) {
            byGame[gid] = room.stats.calc(raw);
        }
        // Include per-position stats (with per-game breakdown)
        const byPos = {};
        if (pd.byPosition) {
            for (const [pos, posData] of Object.entries(pd.byPosition)) {
                const posTotal = posData.total ? room.stats.calc(posData.total) : room.stats.calc(posData);
                const posByGame = {};
                if (posData.byGame) {
                    for (const [gid2, raw2] of Object.entries(posData.byGame)) {
                        posByGame[gid2] = room.stats.calc(raw2);
                    }
                }
                byPos[pos] = { ...posTotal, byGame: posByGame };
            }
        }
        // Include raw stats for accumulation on client
        const rawByGame = {};
        for (const [gid, raw] of Object.entries(pd.byGame)) {
            rawByGame[gid] = { ...raw };
        }
        const rawByPos = {};
        if (pd.byPosition) {
            for (const [pos, posData] of Object.entries(pd.byPosition)) {
                const posTotal = posData.total ? { ...posData.total } : { ...posData };
                const posByGame = {};
                if (posData.byGame) {
                    for (const [gid2, raw2] of Object.entries(posData.byGame)) {
                        posByGame[gid2] = { ...raw2 };
                    }
                }
                rawByPos[pos] = { total: posTotal, byGame: posByGame };
            }
        }
        playerStats[room.game.players[i].name] = {
            ...calc, byGame, byPosition: byPos,
            raw: { ...pd.total }, rawByGame, rawByPos,
        };
    }
    const gc = room.game.gameConfig;
    broadcastToRoom(room, {
        type: 'stats_update', stats: playerStats,
        gameId: gc.id, gameName: gc.name, zoom: false, roomId: room.id,
    });
}

// ============================================
// Game State Serialization (per-player view)
// ============================================
function getStateForPlayer(game, room, playerSeat) {
    const gc = game.gameConfig;
    return {
        players: game.players.map((p, i) => {
            const isMe = i === playerSeat;
            const showCards = isMe || game.isShowdown;
            const member = room.members.find(m => m.clientId === p.id);
            return {
                id: p.id, name: p.name, avatar: member?.avatar || null, chips: p.chips,
                folded: p.folded, allIn: p.allIn,
                seatBet: p.seatBet, lastAction: p.lastAction,
                connected: p.connected, sitout: !!(room.sitout && room.sitout[i]),
                sitoutRemaining: (room.sitout && room.sitout[i] && room.sitoutTime && room.sitoutTime[i])
                    ? Math.max(0, Math.ceil((10 * 60 * 1000 - (Date.now() - room.sitoutTime[i])) / 1000))
                    : null,
                busted: !!(room.bustedAt && room.bustedAt[i]),
                bustedRemaining: (room.bustedAt && room.bustedAt[i])
                    ? Math.max(0, Math.ceil((10 * 60 * 1000 - (Date.now() - room.bustedAt[i])) / 1000))
                    : null,
                pendingRejoin: !!(room.pendingRejoin && room.pendingRejoin[i]),
                hand: showCards ? p.hand : [],
                upCards: gc.type === 'stud' ? p.upCards : [],
                downCards: (isMe && gc.type === 'stud') ? p.downCards : [],
                cardCount: p.hand.length,
                downCount: p.downCards ? p.downCards.length : 0,
            };
        }),
        pot: game.pot,
        currentBet: game.currentBet,
        bigBlind: gc.bigBlind || gc.bigBet || 100,
        smallBlind: gc.smallBlind || 0,
        ante: gc.ante || 0,
        bringIn: gc.bringIn || 0,
        isFirstRound: game.isFirstRound,
        communityCards: game.communityCards,
        gameName: gc.name, gameId: gc.id, gameType: gc.type, gameRules: gc.rules,
        totalGames: game.filteredGames.length,
        currentGameIndex: game.currentGameIndex,
        handsInCurrentGame: game.handsInCurrentGame,
        playerCount: game.playerCount,
        currentPlayer: game.currentPlayerIndex,
        dealerSeat: game.dealerSeat,
        isShowdown: game.isShowdown,
        mySeatIndex: playerSeat,
        mySitout: !!(room.sitout && room.sitout[playerSeat]),
        myBusted: !!(room.bustedAt && room.bustedAt[playerSeat]),
        // Solo-wait: the viewer is the last chip-holding player, waiting for
        // others to join or for the 10-min window to expire. The client uses
        // this to render the "テーブルに他プレイヤーがいません" modal.
        mySoloWait: (() => {
            if (!room.soloWaitSince) return false;
            const myPlayer = game.players[playerSeat];
            return !!(myPlayer && myPlayer.connected && myPlayer.chips > 0);
        })(),
        soloWaitRemaining: room.soloWaitSince
            ? Math.max(0, Math.ceil((10 * 60 * 1000 - (Date.now() - room.soloWaitSince)) / 1000))
            : null,
        turnRemaining: (room.turnStartTime && room.turnTimeLimit)
            ? Math.max(0, room.turnTimeLimit - (Date.now() - room.turnStartTime) / 1000)
            : null,
        turnTimeLimit: room.turnTimeLimit || null,
    };
}

function broadcastGameState(room) {
    if (!room.game) return;
    for (const m of room.members) {
        const seat = room.seatMap[m.clientId];
        if (seat !== undefined) {
            send(m.ws, { type: 'game_state', state: getStateForPlayer(room.game, room, seat), roomId: room.id });
        }
    }
}

// ============================================
// WebSocket Connection
// ============================================
wss.on('connection', (ws) => {
    const clientId = nextClientId++;
    const client = { id: clientId, name: 'Player' + clientId, roomId: null, roomIds: [], inZoom: false, ws };
    clients.set(ws, client);

    send(ws, { type: 'welcome', clientId });
    broadcastRoomList();
    broadcastOnlineUsers();

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
        handleMessage(ws, client, msg);
    });

    ws.on('close', () => {
        handleDisconnect(client);
        clients.delete(ws);
        broadcastRoomList();
        broadcastOnlineUsers();
    });
});

// ============================================
// Message Handlers
// ============================================
function handleMessage(ws, client, msg) {
    switch (msg.type) {
        case 'set_name':
            client.name = (msg.name || '').trim().slice(0, 20) || 'Player' + client.id;
            if (msg.avatar && typeof msg.avatar === 'string') {
                // Avatar is rendered via <img src="avatars/<avatar>.svg">. Restrict
                // to safe filename characters so it can't break out of the attribute.
                const a = msg.avatar.slice(0, 30);
                client.avatar = /^[A-Za-z0-9_\-]+$/.test(a) ? a : null;
            }
            client.isGuest = !!msg.isGuest;
            send(ws, { type: 'name_set', name: client.name });
            broadcastOnlineUsers();
            if (client.roomId) {
                const room = rooms.get(client.roomId);
                if (room) {
                    const m = room.getMember(client.id);
                    if (m) { m.name = client.name; m.avatar = client.avatar; }
                    broadcastRoomUpdate(room);
                }
            }
            // Auto-rejoin: check if this player was disconnected from active games
            for (const [roomId, room] of rooms) {
                if (client.roomIds.length >= 3) break;
                if (room.playing && room.disconnectedPlayers && room.disconnectedPlayers[client.name]) {
                    const dp = room.disconnectedPlayers[client.name];
                    const seat = dp.seat;
                    client.roomId = roomId;
                    if (!client.roomIds.includes(roomId)) client.roomIds.push(roomId);
                    // 席へ再アタッチ (古いソケットの残骸掃除 + sitout/timeout 解除)
                    reattachPlayerToSeat(room, client, ws, seat);
                    broadcastLog(room, `${client.name} が再接続しました`, 'important');
                    send(ws, { type: 'room_joined', room: room.toJSON(), roomId: room.id });
                    send(ws, { type: 'game_started', roomId: room.id });
                    broadcastGameState(room);
                }
            }
            break;

        case 'register': {
            handleRegister(ws, client, msg);
            break;
        }

        case 'login': {
            handleLogin(ws, client, msg);
            break;
        }

        case 'auth_resume': {
            handleAuthResume(ws, client, msg);
            break;
        }

        case 'logout': {
            handleLogout(ws, client, msg);
            break;
        }

        case 'create_room': {
            if (client.roomIds.length >= 3) { send(ws, { type: 'error', message: '最大3テーブルまでです' }); return; }
            if (client.inZoom) leaveZoom(client);
            const roomId = generateRoomId();
            const room = new Room(roomId, client.id, client.name);
            room.members.push({ clientId: client.id, name: client.name, avatar: client.avatar, ws });
            rooms.set(roomId, room);
            client.roomId = roomId;
            if (!client.roomIds.includes(roomId)) client.roomIds.push(roomId);
            send(ws, { type: 'room_joined', room: room.toJSON(), roomId });
            broadcastRoomList();
            broadcastOnlineUsers();
            break;
        }

        case 'join_room': {
            // Defense-in-depth: if our bookkeeping says the client is in the
            // room but the room's members list disagrees (e.g., an earlier
            // auto-kick forgot to call leaveRoom), treat our bookkeeping as
            // stale and continue the join instead of returning an error.
            if (client.roomIds.includes(msg.roomId)) {
                const staleRoom = rooms.get(msg.roomId);
                const stillMember = !!(staleRoom && staleRoom.members.some(m => m.clientId === client.id));
                if (stillMember) {
                    send(ws, { type: 'error', message: 'すでに参加しています' }); return;
                }
                // Clean up the stale entry and fall through to a fresh join.
                client.roomIds = client.roomIds.filter(id => id !== msg.roomId);
                if (client.roomId === msg.roomId) {
                    client.roomId = client.roomIds.length > 0 ? client.roomIds[client.roomIds.length - 1] : null;
                }
            }
            if (client.roomIds.length >= 3) { send(ws, { type: 'error', message: '最大3テーブルまでです' }); return; }
            const room = rooms.get(msg.roomId);
            if (!room) { send(ws, { type: 'error', message: 'ルームが見つかりません' }); return; }
            if (room.members.length >= 6) { send(ws, { type: 'error', message: 'ルームが満員です' }); return; }

            // 承認制テーブル: ホスト承認待ちキューに追加
            if (room.locked && room.hostId !== client.id) {
                // Already pending?
                if (room.pendingJoins.some(p => p.clientId === client.id)) {
                    send(ws, { type: 'error', message: 'すでに参加リクエスト送信済みです' }); return;
                }
                room.pendingJoins.push({ clientId: client.id, name: client.name, avatar: client.avatar, ws });
                send(ws, { type: 'join_pending', roomId: room.id, roomName: room.id });
                // ホストに通知
                const hostMember = room.members.find(m => m.clientId === room.hostId);
                if (hostMember) {
                    send(hostMember.ws, {
                        type: 'join_request',
                        roomId: room.id,
                        clientId: client.id,
                        name: client.name,
                        avatar: client.avatar,
                        pendingCount: room.pendingJoins.length
                    });
                }
                break;
            }

            // Cancel any pending idle-close timer — this table is active again.
            cancelIdleCloseRoom(room);
            // If this is the first member returning to an empty room, transfer
            // the host to them so the room has a valid host again.
            if (room.members.length === 0) {
                room.hostId = client.id;
                room.hostName = client.name || room.hostName;
            }

            room.members.push({ clientId: client.id, name: client.name, avatar: client.avatar, ws });
            client.roomId = room.id;
            if (!client.roomIds.includes(room.id)) client.roomIds.push(room.id);

            let midJoinSeat = undefined;
            if (room.playing && room.game) {
                // Check if this is a returning disconnected player
                let seatIdx = -1;
                let isReturning = false;
                if (room.disconnectedPlayers && room.disconnectedPlayers[client.name]) {
                    seatIdx = room.disconnectedPlayers[client.name].seat;
                    delete room.disconnectedPlayers[client.name];
                    isReturning = true;
                }
                if (seatIdx < 0) seatIdx = room.game.players.findIndex(p => !p.connected && p.chips <= 0);
                if (seatIdx < 0) seatIdx = room.game.players.findIndex(p => !p.connected);

                if (seatIdx >= 0) {
                    let p = room.game.players[seatIdx];
                    p.name = client.name;
                    if (!isReturning) p.chips = MID_JOIN_CHIPS;
                    p.connected = true;
                    p.folded = true;
                    p.id = seatIdx;
                    if (isReturning) {
                        // 再接続: 切断時の離席/タイムアウト状態を解除し、即プレイ
                        // 再開可能にする。また旧ソケットが同じ席に残っていれば除去。
                        if (room.sitout) delete room.sitout[seatIdx];
                        if (room.sitoutTime) delete room.sitoutTime[seatIdx];
                        if (room.consecutiveTimeouts) delete room.consecutiveTimeouts[seatIdx];
                        for (const [cid, s] of Object.entries(room.seatMap)) {
                            const cidNum = parseInt(cid);
                            if (s === seatIdx && cidNum !== client.id) {
                                delete room.seatMap[cid];
                                room.members = room.members.filter(m => m.clientId !== cidNum);
                            }
                        }
                    }
                } else {
                    seatIdx = room.game.players.length;
                    room.game.players.push({
                        id: seatIdx,
                        name: client.name,
                        chips: MID_JOIN_CHIPS,
                        isHuman: true,
                        connected: true,
                        hand: [],
                        folded: true,
                        allIn: false,
                        currentBet: 0,
                        seatBet: 0,
                        upCards: [],
                        downCards: [],
                        lastAction: '',
                    });
                    room.game.playerCount = room.game.players.length;
                }
                // Record initial chips for end-of-game ranking
                if (!room.initialChips) room.initialChips = {};
                room.initialChips[client.name] = MID_JOIN_CHIPS;
                if (!room.totalRebuys) room.totalRebuys = {};
                room.totalRebuys[client.name] = 0;
                room.seatMap[client.id] = seatIdx;
                midJoinSeat = seatIdx;
            }

            // Recompute merged games only when not playing (game list is locked during play)
            if (!room.playing) {
                room.settings.selectedGames = room.getMergedGames();
            }

            // Send room_joined first so client can switch to game screen
            send(ws, { type: 'room_joined', room: room.toJSON(), roomId: room.id });

            if (midJoinSeat !== undefined) {
                // Send current game state to new joiner after room_joined
                send(ws, { type: 'game_state', state: getStateForPlayer(room.game, room, midJoinSeat), roomId: room.id });
                // Broadcast to others (excluding new joiner)
                for (const m of room.members) {
                    if (m.clientId !== client.id && room.seatMap[m.clientId] !== undefined) {
                        send(m.ws, { type: 'game_state', state: getStateForPlayer(room.game, room, room.seatMap[m.clientId]), roomId: room.id });
                    }
                }
                send(ws, { type: 'log', message: `${client.name} が途中参加しました（${MID_JOIN_CHIPS}チップ）`, cls: 'important', roomId: room.id });
                broadcastToRoom(room, { type: 'log', message: `${client.name} が途中参加しました`, cls: 'important' });
            }

            broadcastRoomUpdate(room);
            broadcastRoomList();
            broadcastOnlineUsers();
            break;
        }

        case 'leave_room': {
            const targetRoomId = msg.roomId || client.roomId;
            const room = rooms.get(targetRoomId);
            if (!room) {
                send(ws, { type: 'room_left', roomId: targetRoomId });
                break;
            }
            // Defer leave only when the player is actively in the current hand.
            const seat = room.seatMap[client.id];
            const player = (seat !== undefined && room.game) ? room.game.players[seat] : null;
            const canLeaveNow = !room.playing
                || seat === undefined
                || !player
                || player.folded
                || (room.sitout && room.sitout[seat]);
            if (canLeaveNow) {
                leaveRoom(client, targetRoomId);
                send(ws, { type: 'room_left', roomId: targetRoomId });
            } else {
                // Reserve for after the current hand ends.
                if (room.pendingLeaveRequest && room.pendingLeaveRequest[client.id]) {
                    // Already reserved
                } else {
                    if (!room.pendingLeaveRequest) room.pendingLeaveRequest = {};
                    room.pendingLeaveRequest[client.id] = true;
                    broadcastLog(room, `${client.name} が退出予約しました（ハンド終了後に適用）`, 'important');
                }
                send(ws, { type: 'leave_reserved', roomId: targetRoomId });
                broadcastGameState(room);
            }
            broadcastRoomList();
            broadcastOnlineUsers();
            break;
        }

        case 'update_settings': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room || room.playing) return;
            if (msg.settings) {
                // startingChips is fixed at 10000
            }
            broadcastRoomUpdate(room);
            break;
        }

        case 'toggle_lock': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room) return;
            if (room.hostId !== client.id) { send(ws, { type: 'error', message: 'ホストのみ変更できます' }); return; }
            if (client.isGuest) { send(ws, { type: 'error', message: 'ゲストアカウントではこの機能は使用できません' }); return; }
            room.locked = !!msg.locked;
            // If unlocking, auto-approve all pending joins
            if (!room.locked && room.pendingJoins.length > 0) {
                for (const pj of room.pendingJoins) {
                    send(pj.ws, { type: 'join_rejected', roomId: room.id, reason: 'ロックが解除されました。再度参加してください。' });
                }
                room.pendingJoins = [];
            }
            broadcastRoomUpdate(room);
            broadcastRoomList();
            break;
        }

        case 'approve_join': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room) return;
            if (room.hostId !== client.id) return;
            const idx = room.pendingJoins.findIndex(p => p.clientId === msg.targetId);
            if (idx < 0) { send(ws, { type: 'error', message: 'リクエストが見つかりません' }); return; }
            const pj = room.pendingJoins.splice(idx, 1)[0];
            if (room.members.length >= 6) {
                send(pj.ws, { type: 'join_rejected', roomId: room.id, reason: 'ルームが満員です' });
                broadcastRoomUpdate(room);
                break;
            }
            // Find the pending client data
            const pjClient = clients.get(pj.ws);
            if (!pjClient) { broadcastRoomUpdate(room); break; }
            // Add to room
            room.members.push({ clientId: pj.clientId, name: pj.name, avatar: pj.avatar, ws: pj.ws });
            pjClient.roomId = room.id;
            if (!pjClient.roomIds.includes(room.id)) pjClient.roomIds.push(room.id);

            // Handle mid-join if game is in progress
            let midJoinSeat = undefined;
            if (room.playing && room.game) {
                let seatIdx = -1;
                let isReturning = false;
                if (room.disconnectedPlayers && room.disconnectedPlayers[pj.name]) {
                    seatIdx = room.disconnectedPlayers[pj.name].seat;
                    delete room.disconnectedPlayers[pj.name];
                    isReturning = true;
                }
                if (seatIdx < 0) seatIdx = room.game.players.findIndex(p => !p.connected && p.chips <= 0);
                if (seatIdx < 0) seatIdx = room.game.players.findIndex(p => !p.connected);

                if (seatIdx >= 0) {
                    let p = room.game.players[seatIdx];
                    p.name = pj.name;
                    if (!isReturning) p.chips = MID_JOIN_CHIPS;
                    p.connected = true;
                    p.folded = true;
                    p.id = seatIdx;
                } else {
                    seatIdx = room.game.players.length;
                    room.game.players.push({
                        id: seatIdx, name: pj.name, chips: MID_JOIN_CHIPS,
                        isHuman: true, connected: true, hand: [], folded: true,
                        allIn: false, currentBet: 0, seatBet: 0, upCards: [], downCards: [],
                        lastAction: '',
                    });
                    room.game.playerCount = room.game.players.length;
                }
                if (!room.initialChips) room.initialChips = {};
                room.initialChips[pj.name] = MID_JOIN_CHIPS;
                if (!room.totalRebuys) room.totalRebuys = {};
                room.totalRebuys[pj.name] = 0;
                room.seatMap[pj.clientId] = seatIdx;
                midJoinSeat = seatIdx;
            }

            if (!room.playing) {
                room.settings.selectedGames = room.getMergedGames();
            }

            send(pj.ws, { type: 'room_joined', room: room.toJSON(), roomId: room.id });

            if (midJoinSeat !== undefined) {
                send(pj.ws, { type: 'game_state', state: getStateForPlayer(room.game, room, midJoinSeat), roomId: room.id });
                for (const m of room.members) {
                    if (m.clientId !== pj.clientId && room.seatMap[m.clientId] !== undefined) {
                        send(m.ws, { type: 'game_state', state: getStateForPlayer(room.game, room, room.seatMap[m.clientId]), roomId: room.id });
                    }
                }
                broadcastToRoom(room, { type: 'log', message: `${pj.name} が途中参加しました`, cls: 'important' });
            }

            broadcastRoomUpdate(room);
            broadcastRoomList();
            broadcastOnlineUsers();
            break;
        }

        case 'reject_join': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room) return;
            if (room.hostId !== client.id) return;
            const idx = room.pendingJoins.findIndex(p => p.clientId === msg.targetId);
            if (idx < 0) return;
            const pj = room.pendingJoins.splice(idx, 1)[0];
            send(pj.ws, { type: 'join_rejected', roomId: room.id, reason: 'ホストにより拒否されました' });
            broadcastRoomUpdate(room);
            break;
        }

        case 'cancel_join': {
            const room = rooms.get(msg.roomId);
            if (!room) return;
            room.pendingJoins = room.pendingJoins.filter(p => p.clientId !== client.id);
            send(ws, { type: 'join_cancelled', roomId: room.id });
            // Notify host
            const hostMember = room.members.find(m => m.clientId === room.hostId);
            if (hostMember) {
                send(hostMember.ws, { type: 'join_request_cancelled', roomId: room.id, clientId: client.id, name: client.name });
            }
            broadcastRoomUpdate(room);
            break;
        }

        case 'update_game_selection': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room) return;
            room.playerGames[client.id] = msg.selectedGames || [];
            // Update merged game list only when not playing (game list is locked during play)
            if (!room.playing) {
                room.settings.selectedGames = room.getMergedGames();
            }
            broadcastRoomUpdate(room);
            break;
        }

        case 'start_game': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room || room.hostId !== client.id) return;
            if (room.members.length < 2) { send(ws, { type: 'error', message: '2人以上必要です' }); return; }
            if (room.settings.selectedGames.length < 1) { send(ws, { type: 'error', message: '1つ以上のゲームを選択してください' }); return; }
            if (room.playing) return;
            startGame(room);
            break;
        }

        case 'action': {
            if (client.inZoom) { handleZoomAction(client, msg); break; }
            const actionRoomId = msg.roomId || client.roomId;
            const room = rooms.get(actionRoomId);
            if (!room || !room.pending) return;
            const seat = room.seatMap[client.id];
            if (room.pending.type !== 'action' || room.pending.playerId !== seat) return;
            clearTimeout(room.pending.timer);
            // Reset timeout counter on manual action
            if (room.consecutiveTimeouts) room.consecutiveTimeouts[seat] = 0;
            const p = room.pending;
            room.pending = null;
            p.resolve(msg.action);
            break;
        }

        case 'draw': {
            if (client.inZoom) { handleZoomDraw(client, msg); break; }
            const drawRoomId = msg.roomId || client.roomId;
            const room = rooms.get(drawRoomId);
            if (!room || !room.pending) return;
            const seat = room.seatMap[client.id];
            if (room.pending.type !== 'draw' || room.pending.playerId !== seat) return;
            clearTimeout(room.pending.timer);
            // Reset timeout counter on manual action
            if (room.consecutiveTimeouts) room.consecutiveTimeouts[seat] = 0;
            const p = room.pending;
            room.pending = null;
            p.resolve(msg.discards || []);
            break;
        }

        case 'join_zoom':
            handleJoinZoom(ws, client);
            break;

        case 'leave_zoom':
            handleLeaveZoom(ws, client);
            break;

        case 'zoom_sitout':
            handleZoomSitout(ws, client);
            break;

        case 'zoom_rejoin':
            handleZoomRejoin(ws, client);
            break;

        case 'emote': {
            const emote = (msg.emote || '').slice(0, 4);
            const room = rooms.get(msg.roomId || client.roomId);
            if (room) {
                const seat = room.seatMap[client.id];
                broadcastToRoom(room, { type: 'emote', seat, emote, from: client.name });
            } else if (client.inZoom) {
                // Zoom emote — broadcast to zoom table members
                for (const [ws2, c2] of clients) {
                    if (c2.inZoom) send(ws2, { type: 'emote', seat: -1, emote, from: client.name });
                }
            }
            break;
        }

        case 'reaction': {
            const emote = (msg.emote || '').slice(0, 4);
            const room = rooms.get(msg.roomId || client.roomId);
            if (room) {
                broadcastToRoom(room, { type: 'reaction', emote, from: client.name });
            } else if (client.inZoom) {
                for (const [ws2, c2] of clients) {
                    if (c2.inZoom) send(ws2, { type: 'reaction', emote, from: client.name });
                }
            }
            break;
        }

        case 'rebuy_chips': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room || !room.game) break;
            const seat = room.seatMap[client.id];
            if (seat === undefined) break;
            const p = room.game.players[seat];
            // Only allow rebuy when folded (between hands)
            if (!p.folded) break;
            const rebuyAmount = 10000;
            if (p.chips >= rebuyAmount) break;
            const addedChips = rebuyAmount - p.chips;
            p.chips = rebuyAmount;
            if (!room.totalRebuys) room.totalRebuys = {};
            room.totalRebuys[client.name] = (room.totalRebuys[client.name] || 0) + addedChips;
            broadcastLog(room, `${client.name} がチップを補充しました (+${addedChips.toLocaleString()})`, 'important');
            broadcastGameState(room);
            break;
        }

        case 'rebuy_from_bust': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room || !room.game) break;
            const seat = room.seatMap[client.id];
            if (seat === undefined) break;
            if (!room.bustedAt || !room.bustedAt[seat]) break; // not in bust window
            const p = room.game.players[seat];
            const REBUY = 10000;
            const added = REBUY - p.chips;
            p.chips = REBUY;
            if (!room.totalRebuys) room.totalRebuys = {};
            room.totalRebuys[client.name] = (room.totalRebuys[client.name] || 0) + added;
            // Clear bust + sitout so they're eligible for the next hand.
            clearBustState(room, seat);
            if (room.sitout) room.sitout[seat] = false;
            if (room.sitoutTime) delete room.sitoutTime[seat];
            if (room.consecutiveTimeouts) room.consecutiveTimeouts[seat] = 0;
            if (!room.pendingRejoin) room.pendingRejoin = {};
            room.pendingRejoin[seat] = true;
            broadcastLog(room, `${client.name} がチップを補充して復帰します (+${added.toLocaleString()})`, 'important');
            broadcastGameState(room);
            break;
        }

        case 'end_table_now': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room || !room.game) break;
            const seat = room.seatMap[client.id];
            if (seat === undefined) break;
            // Only allow when we're actually in a solo-wait state AND the
            // sender is the solo player. Anyone else spamming this is a no-op.
            const playable = room.game.players.filter(p => p.connected && p.chips > 0);
            if (playable.length !== 1) break;
            const soloPlayer = playable[0];
            if (soloPlayer.id !== seat) break;
            broadcastLog(room, `${client.name} がテーブル終了を選択しました`, 'important');
            if (room.soloWaitSince) delete room.soloWaitSince;
            room.game.gameOver = true;
            // The game loop is await-sleeping up to 2s; it'll pick up the
            // gameOver flag on its next iteration and broadcast game_over.
            break;
        }

        case 'leave_from_bust': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room) break;
            const seat = room.seatMap[client.id];
            if (seat === undefined) break;
            if (!room.bustedAt || !room.bustedAt[seat]) break;
            clearBustState(room, seat);
            broadcastLog(room, `${client.name} が退室を選択しました`, 'important');
            leaveRoom(client, room.id);
            try { send(ws, { type: 'room_left', roomId: room.id }); } catch {}
            break;
        }

        case 'rejoin_game': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room || !room.sitout) break;
            const seat = room.seatMap[client.id];
            if (seat !== undefined && room.sitout[seat]) {
                room.sitout[seat] = false;
                delete room.sitoutTime[seat];
                room.consecutiveTimeouts[seat] = 0;
                if (!room.pendingRejoin) room.pendingRejoin = {};
                room.pendingRejoin[seat] = true;
                broadcastLog(room, `${client.name} が次のハンドから復帰します`, 'important');
                broadcastGameState(room);
            }
            break;
        }

        case 'sitout_request': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room) break;
            const seat = room.seatMap[client.id];
            if (seat === undefined) break;
            if (room.sitout && room.sitout[seat]) break; // already sitting out
            if (room.pendingSitoutRequest && room.pendingSitoutRequest[seat]) break; // already reserved

            // A hand is in progress when room.playing is true and the game hasn't
            // reached gameOver yet. (Note: game has no .running flag — older code
            // referenced it by mistake, which silently disabled the sitout button.)
            const handInProgress = !!(room.playing && room.game && !room.game.gameOver);
            const player = (room.game && room.game.players) ? room.game.players[seat] : null;
            const alreadyFolded = player && player.folded;

            if (handInProgress && !alreadyFolded) {
                // Reserve sitout for after the current hand ends.
                if (!room.pendingSitoutRequest) room.pendingSitoutRequest = {};
                room.pendingSitoutRequest[seat] = true;
                broadcastLog(room, `${client.name} が離席予約しました（ハンド終了後に適用）`, 'important');
            } else {
                // No active hand, or player is already folded → apply sitout now.
                if (!room.sitout) room.sitout = {};
                if (!room.sitoutTime) room.sitoutTime = {};
                room.sitout[seat] = true;
                room.sitoutTime[seat] = Date.now();
                broadcastLog(room, `${client.name} が離席しました`, 'important');
            }
            broadcastGameState(room);
            // Auto-close only applies when sitout is actually set (not pending),
            // so this is a no-op during reservation but useful for the immediate case.
            maybeAutoCloseRoom(room);
            break;
        }

        case 'chat': {
            // In-game chat only (room / zoom). Lobby chat has been removed.
            if (client.isGuest) { send(ws, { type: 'error', message: 'ゲストアカウントではチャットを送信できません' }); break; }
            const text = (msg.message || '').slice(0, 200);
            const chatRoomId = msg.roomId || client.roomId;
            if (!chatRoomId) break; // no lobby fallback
            const room = rooms.get(chatRoomId);
            if (room) {
                broadcastToRoom(room, { type: 'chat', from: client.name, message: text });
            }
            break;
        }


        case 'view_profile': {
            if (!client.name) break;
            const target = (msg.target || '').trim();
            if (!target) break;
            addFootprint(target, client.name, client.avatar);
            // Gather profile info
            const profile = {
                name: target,
                isOnline: false,
                avatar: null,
                status: 'offline',
            };
            for (const [, c] of clients) {
                if (c.name === target) {
                    profile.isOnline = true;
                    profile.avatar = c.avatar || null;
                    if (c.inZoom) profile.status = 'zoom';
                    else if (c.roomIds.length > 0) profile.status = 'playing';
                    else profile.status = 'lobby';
                    break;
                }
            }
            send(ws, { type: 'profile_data', profile });
            // Notify target of footprint (if online)
            for (const [tws, tc] of clients) {
                if (tc.name === target) {
                    send(tws, { type: 'new_footprint', viewer: client.name, viewerAvatar: client.avatar });
                }
            }
            break;
        }

        case 'get_footprints': {
            if (!client.name) break;
            send(ws, { type: 'footprints', footprints: getFootprints(client.name) });
            break;
        }

        // 'dm' removed — DM feature removed

        case 'get_stats': {
            const room = rooms.get(msg.roomId || client.roomId);
            if (!room || !room.stats) return;
            const seat = room.seatMap[client.id];
            const allStats = {};
            for (let i = 0; i < (room.game ? room.game.playerCount : room.members.length); i++) {
                const raw = room.stats.getPlayer(i).total;
                allStats[i] = room.stats.calc(raw);
                allStats[i].raw = raw;
            }
            send(ws, { type: 'stats_data', stats: allStats, mySeat: seat, roomId: room.id });
            break;
        }

        case 'get_rooms':
            broadcastRoomList();
            break;

        case 'get_lobby_chat': {
            send(ws, { type: 'lobby_chat_history', messages: lobbyChat.slice(-LOBBY_CHAT_MAX) });
            break;
        }

        case 'lobby_chat_send': {
            // Registered users only — guests are play-only.
            if (!client.authenticated || !client.name) {
                send(ws, { type: 'error', message: 'ロビーチャットは登録ユーザーのみ投稿できます' });
                break;
            }
            const text = (msg.text || '').trim();
            if (!text) break;
            // Light rate-limit: ~1 message per second per client.
            const now = Date.now();
            if (client._lastLobbyChat && now - client._lastLobbyChat < 1000) break;
            client._lastLobbyChat = now;
            const entry = appendLobbyChat({
                type: 'user',
                name: client.name,
                avatar: client.avatar,
                text,
            });
            broadcastLobbyChat(entry);
            break;
        }

        case 'get_session_records': {
            // Return per-session records used by the 成績 modal.
            //   msg.roomId      → filter to a single table
            //   msg.playerName  → return only sessions that include this player
            //   msg.limit       → cap how many records to return (default 200)
            const roomFilter   = msg.roomId   ? String(msg.roomId)   : null;
            const playerFilter = msg.playerName ? String(msg.playerName) : null;
            const limit = Math.min(Math.max(parseInt(msg.limit) || 200, 1), SESSION_RECORDS_MAX);
            let records = sessionRecords;
            if (roomFilter) records = records.filter(r => r.roomId === roomFilter);
            if (playerFilter) records = records.filter(r =>
                Array.isArray(r.participants) && r.participants.some(p => p.name === playerFilter));
            send(ws, { type: 'session_records', records: records.slice(0, limit) });
            break;
        }

        case 'get_player_stats': {
            // Build a roster of REGISTERED accounts only (guests excluded).
            // Players who registered but never played are included with zero
            // stats so the Player Cloud still shows their name.
            const registeredNames = new Set();
            for (const acc of Object.values(localAccounts)) {
                if (acc && acc.name) registeredNames.add(acc.name);
            }
            // 登録ユーザーのアバター情報 (オンラインクライアントから取得)
            const avatarByName = {};
            for (const [, c] of clients) {
                if (c && c.name && !c.isGuest && registeredNames.has(c.name)) {
                    avatarByName[c.name] = c.avatar || null;
                }
            }

            const statsArray = [];
            for (const name of registeredNames) {
                const s = playerStatsMap[name] || {};
                statsArray.push({
                    name,
                    avatar: avatarByName[name] || null,
                    total_profit:    s.total_profit    || 0,
                    session_count:   s.session_count   || 0,
                    total_diversity: s.total_diversity || 0,
                    total_hands:     s.total_hands     || 0,
                });
            }
            send(ws, { type: 'player_stats', stats: statsArray });
            break;
        }
    }
}

// ============================================
// Room activity / auto-close helpers
// ============================================
// Returns true if the room has at least one member who is NOT on sitout.
// Members without an assigned seat (pre-game lobby) are always considered active.
// Record session stats (profit, session count, game diversity) on room close.
function recordSessionStats(room) {
    if (!room || !room.handsPlayed) return;
    // 1セッション(=1ゲーム)につき1回だけ記録する。game_over と部屋削除の
    // 両方から呼ばれるため、二重で生涯スタッツが加算されないようガードする。
    if (room.statsRecorded) return;
    room.statsRecorded = true;
    const startingChips = (room.settings && room.settings.startingChips) || 10000;
    const rebuys = room.totalRebuys || {};
    const participants = room.sessionParticipants || {};
    const finalByName = {};
    if (room.game && room.game.players) {
        for (const p of room.game.players) {
            if (p.name) finalByName[p.name] = p.chips;
        }
    }
    const gameCount = room.sessionGameIds ? room.sessionGameIds.size : 1;
    const handsPlayed = room.handsPlayed || 0;
    // Build a detailed session record for the 成績 (Results) modal, in
    // addition to bumping each player's lifetime aggregate.
    const sessionRecord = {
        roomId: room.id,
        timestamp: new Date().toISOString(),
        handsPlayed,
        gameTypes: room.sessionGameIds ? Array.from(room.sessionGameIds) : [],
        participants: [],
    };
    for (const name of Object.keys(participants)) {
        const rebuyAmount = rebuys[name] || 0;
        const invested = startingChips + rebuyAmount;
        const endChips = (name in finalByName) ? finalByName[name] : 0;
        const diff = endChips - invested;
        sessionRecord.participants.push({
            name, profit: diff, invested, endChips, handsPlayed,
        });
        upsertPlayerStats(name, { profitDelta: diff, sessionDelta: 1, diversityDelta: gameCount, handsDelta: handsPlayed });
    }
    if (sessionRecord.participants.length > 0) {
        persistSessionRecord(sessionRecord).catch(() => {});
        // ロビーチャットに「テーブル終了」のシステムメッセージを自動投稿。
        // テキストは内訳形式で書いておくと、対応していないクライアントでも
        // そのまま読める。リッチ描画用には sessionResult フィールドも添える。
        const sorted = [...sessionRecord.participants].sort((a, b) => b.profit - a.profit);
        const breakdown = sorted.map(p => {
            const sign = p.profit >= 0 ? '+' : '';
            return `${p.name}: ${sign}${p.profit.toLocaleString()}`;
        }).join(' / ');
        const text = `📊 テーブル ${room.id} 終了 — ${handsPlayed} ハンド / ${sorted.length} 人\n${breakdown}`;
        const entry = appendLobbyChat({
            type: 'system',
            name: 'システム',
            text,
            sessionResult: {
                roomId: room.id,
                handsPlayed,
                participants: sorted.map(p => ({ name: p.name, profit: p.profit })),
            },
        });
        broadcastLobbyChat(entry);
    }
}

// あるプレイヤーの、その卓セッションでの収支を計算して返す。
// 収支 = 現在チップ - (開始チップ + リバイ累計)。participant でなければ null。
function playerSessionProfit(room, name) {
    if (!room || !name) return null;
    const startingChips = (room.settings && room.settings.startingChips) || 10000;
    const rebuyAmount = (room.totalRebuys && room.totalRebuys[name]) || 0;
    const invested = startingChips + rebuyAmount;
    let endChips = null;
    if (room.game && room.game.players) {
        const p = room.game.players.find(pl => pl && pl.name === name);
        if (p) endChips = p.chips;
    }
    const participated = !!(room.sessionParticipants && room.sessionParticipants[name]) || endChips !== null;
    if (!participated) return null;
    if (endChips === null) endChips = startingChips; // 着席のみでゲーム未開始
    return {
        roomId: room.id,
        profit: endChips - invested,
        invested,
        endChips,
        handsPlayed: room.handsPlayed || 0,
    };
}

// 退室するクライアントへ、その卓セッションの自分の収支を通知する。
// ハンドが1回も消化されていない場合は表示しない (収支が意味を持たないため)。
function sendSessionResult(client, room) {
    if (!client || !client.ws || !room) return;
    const r = playerSessionProfit(room, client.name);
    if (!r || !(r.handsPlayed > 0)) return;
    send(client.ws, { type: 'session_result', result: r });
}

// Delete a room: clear timers, evict remaining members, remove from map,
// broadcast lobby update. Also records player stats if hands were played.
function deleteRoomAndEvict(room, reason) {
    if (!room) return;
    // Record session stats before tearing down so we still have room state.
    try { recordSessionStats(room); } catch (e) { console.warn('recordSessionStats failed:', e && e.message); }
    if (room.pending) { try { clearTimeout(room.pending.timer); } catch {} room.pending = null; }
    if (room.idleCloseTimer) { try { clearTimeout(room.idleCloseTimer); } catch {} room.idleCloseTimer = null; }
    // Notify + detach any remaining members (sitout players stay in room until this runs)
    for (const m of [...(room.members || [])]) {
        const c = clients.get(m.ws);
        // 残っているメンバーにも、卓終了時に自分のセッション収支を通知する。
        if (c) sendSessionResult(c, room);
        try { send(m.ws, { type: 'room_left', roomId: room.id, reason: reason || 'closed' }); } catch {}
        if (c) {
            c.roomIds = (c.roomIds || []).filter(id => id !== room.id);
            c.roomId = c.roomIds.length > 0 ? c.roomIds[c.roomIds.length - 1] : null;
        }
    }
    room.members = [];
    rooms.delete(room.id);
    broadcastRoomList();
}

// Apply any pending sitout/leave reservations. Called from onHandEnd hooks,
// so deferred actions take effect right before the next hand starts.
// After each hand: any player whose chips reached 0 enters a 10-minute
// decision window (rebuy to 10000 or leave). While at least one player is
// in this window, runGameLoop pauses instead of ending the game, so HU-bust
// doesn't instantly close the table.
const BUST_WINDOW_MS = 10 * 60 * 1000;
function detectBust(room) {
    if (!room || !room.game || !rooms.has(room.id)) return;
    const game = room.game;
    for (let seat = 0; seat < game.players.length; seat++) {
        const p = game.players[seat];
        if (!p || !p.name) continue;
        if (p.chips !== 0) continue;
        if (room.bustedAt[seat]) continue; // already in window
        // Put them in sitout so they are skipped by the game engine, and
        // stamp the bust time so the client can render a countdown.
        if (!room.sitout[seat]) {
            room.sitout[seat] = true;
            room.sitoutTime[seat] = Date.now();
        }
        room.bustedAt[seat] = Date.now();
        broadcastLog(room, `${p.name} のチップが 0 になりました（10分以内に補充または退室を選んでください）`, 'important');
        // Schedule a hard kick if the player doesn't resolve within 10 min.
        if (room.bustTimers[seat]) clearTimeout(room.bustTimers[seat]);
        room.bustTimers[seat] = setTimeout(() => {
            // Re-check: did they rebuy or leave? If so, this timer was already cleared.
            if (!rooms.has(room.id)) return;
            if (!room.bustedAt[seat]) return;
            const member = room.getClientBySeat(seat);
            const name = member ? member.name : (game.players[seat] && game.players[seat].name) || '';
            broadcastLog(room, `${name} が10分間チップ補充を選択しなかったため退室しました`, 'important');
            delete room.bustedAt[seat];
            delete room.bustTimers[seat];
            if (member && member.ws) {
                try { send(member.ws, { type: 'auto_kicked' }); } catch {}
                // Resolve clientId → client for leaveRoom.
                let targetClient = null;
                for (const [, c] of clients) {
                    if (c.id === member.clientId) { targetClient = c; break; }
                }
                if (targetClient) leaveRoom(targetClient, room.id);
            }
            broadcastGameState(room);
        }, BUST_WINDOW_MS);
    }
}

function hasPendingBust(room) {
    if (!room || !room.bustedAt) return false;
    const now = Date.now();
    for (const key of Object.keys(room.bustedAt)) {
        const t = room.bustedAt[key];
        if (t && now - t < BUST_WINDOW_MS) return true;
    }
    return false;
}

function clearBustState(room, seat) {
    if (!room) return;
    if (room.bustTimers && room.bustTimers[seat]) {
        clearTimeout(room.bustTimers[seat]);
        delete room.bustTimers[seat];
    }
    if (room.bustedAt) delete room.bustedAt[seat];
}

function applyPendingReservations(room) {
    if (!room || !rooms.has(room.id)) return;

    // Pending sitouts: flip the sitout flag for each reserved seat.
    if (room.pendingSitoutRequest) {
        for (const key of Object.keys(room.pendingSitoutRequest)) {
            const seat = Number(key);
            if (!room.pendingSitoutRequest[key]) continue;
            if (!room.sitout) room.sitout = {};
            if (!room.sitoutTime) room.sitoutTime = {};
            if (!room.sitout[seat]) {
                room.sitout[seat] = true;
                room.sitoutTime[seat] = Date.now();
                const member = room.getClientBySeat(seat);
                if (member) broadcastLog(room, `${member.name} が離席しました`, 'important');
            }
        }
        room.pendingSitoutRequest = {};
    }

    // Pending leaves: resolve clientIds → client objects and call leaveRoom.
    if (room.pendingLeaveRequest) {
        const clientIds = Object.keys(room.pendingLeaveRequest).map(Number);
        for (const cid of clientIds) {
            if (!room.pendingLeaveRequest[cid]) continue;
            let targetClient = null;
            for (const [, c] of clients) {
                if (c.id === cid) { targetClient = c; break; }
            }
            if (!targetClient) continue;
            const member = room.members.find(m => m.clientId === cid);
            broadcastLog(room, `${targetClient.name} が退出しました`, 'important');
            leaveRoom(targetClient, room.id);
            if (member && member.ws) {
                try { send(member.ws, { type: 'room_left', roomId: room.id }); } catch {}
            }
        }
        room.pendingLeaveRequest = {};
    }
}

// ============================================
// Idle-close timer (delayed close for empty rooms)
// ============================================
// Rooms stay alive even when empty or when every member is on sitout, so that
// players who stepped away can rejoin the same table from the lobby. Empty
// rooms are cleaned up after IDLE_CLOSE_MS of inactivity.
const IDLE_CLOSE_MS = 10 * 60 * 1000; // 10 minutes

function scheduleIdleCloseRoom(room) {
    if (!room || !rooms.has(room.id)) return;
    if (room.idleCloseTimer) return; // already scheduled
    room.idleCloseTimer = setTimeout(() => {
        room.idleCloseTimer = null;
        // Re-verify emptiness at fire time (member may have rejoined)
        if (!rooms.has(room.id)) return;
        if (room.members && room.members.length > 0) return;
        deleteRoomAndEvict(room, 'idle');
    }, IDLE_CLOSE_MS);
}

function cancelIdleCloseRoom(room) {
    if (!room || !room.idleCloseTimer) return;
    clearTimeout(room.idleCloseTimer);
    room.idleCloseTimer = null;
}

// If the room has no members but a game is still running, end it gracefully so
// the background loop doesn't keep cycling through hands without players.
function endGameIfAbandoned(room) {
    if (!room || !room.game) return;
    if (room.members && room.members.length > 0) return;
    if (room.game.gameOver) return;
    try { room.game.gameOver = true; } catch {}
    if (room.pending) {
        try { clearTimeout(room.pending.timer); } catch {}
        const p = room.pending;
        room.pending = null;
        // Resolve any waiting action as a fold so the betting round can finish.
        try {
            if (p.type === 'draw') p.resolve([]);
            else p.resolve({ type: 'fold' });
        } catch {}
    }
    room.playing = false;
}

// Previously this function deleted the room when nobody was actively playing.
// That forced solo play to disband the table and prevented a player from
// leaving to the lobby and rejoining. Now rooms stay alive while they have
// any member (even if everyone is on sitout); empty rooms get a 10-minute
// idle-close grace period so the lobby can be used to rejoin.
function maybeAutoCloseRoom(room) {
    if (!room || !rooms.has(room.id)) return false;
    if (room.members && room.members.length > 0) {
        // Keep room alive. Make sure no stale idle-close timer is pending.
        cancelIdleCloseRoom(room);
        return false;
    }
    // Empty room: schedule delayed cleanup instead of deleting immediately so
    // a player who briefly returned to the lobby can come back to the table.
    endGameIfAbandoned(room);
    scheduleIdleCloseRoom(room);
    return false;
}

// ============================================
// Leave Room
// ============================================
function leaveRoom(client, targetRoomId) {
    const rid = targetRoomId || client.roomId;
    const room = rooms.get(rid);
    if (!room) { return; }

    // 退室時に、この卓での自分のセッション収支を通知する (チップ等を
    // 変更する前に計算する)。手動退室・バスト退室・自動キックなど、退室は
    // すべて leaveRoom を通るのでここで一括対応できる。
    sendSessionResult(client, room);

    // If they were in a bust-decision window, cancel the pending kick timer.
    const leavingSeat = room.seatMap ? room.seatMap[client.id] : undefined;
    if (leavingSeat !== undefined) clearBustState(room, leavingSeat);

    room.members = room.members.filter(m => m.clientId !== client.id);
    delete room.playerGames[client.id];
    // Remove from roomIds array
    client.roomIds = client.roomIds.filter(id => id !== rid);
    // Update roomId to most recent remaining room, or null
    client.roomId = client.roomIds.length > 0 ? client.roomIds[client.roomIds.length - 1] : null;

    // Recompute merged games after player leaves
    // During an active game, keep filteredGames unchanged so the rotation continues as-is
    if (room.members.length > 0 && !room.playing) {
        room.settings.selectedGames = room.getMergedGames();
    }

    // Mark player as disconnected in active game
    if (room.playing) {
        const seat = room.seatMap[client.id];
        if (seat !== undefined && room.game) {
            room.game.players[seat].connected = false;
            room.game.players[seat].folded = true;
            if (room.missedHands) room.missedHands[seat] = 0;
            // Clean up reconnection entry (player left intentionally)
            if (room.disconnectedPlayers) delete room.disconnectedPlayers[client.name];
            // If it was this player's turn, auto-resolve
            if (room.pending && room.pending.playerId === seat) {
                clearTimeout(room.pending.timer);
                const p = room.pending;
                room.pending = null;
                // Auto-fold
                p.resolve({ type: 'fold' });
            }
        }
        delete room.seatMap[client.id];
    }

    // Transfer host if necessary (game not active)
    if (room.members.length > 0 && room.hostId === client.id && !room.playing) {
        room.hostId = room.members[0].clientId;
        room.hostName = room.members[0].name || room.hostName;
    }
    // Keep-alive: empty rooms get a grace period (idle-close timer); non-empty
    // rooms stay alive even if everyone is on sitout.
    if (!maybeAutoCloseRoom(room) && room.members.length > 0) {
        broadcastRoomUpdate(room);
    }
}

// プレイヤーを指定席へ再アタッチする (再接続時の共通処理)。
// - ネットワーク断で旧ソケットの close がまだ発火していない場合に備え、
//   同じ席を占有する古いメンバー/seatMap エントリを除去 (重複防止)。
// - 切断時に付与された離席(sitout)/連続タイムアウト状態を解除し、
//   すぐにプレイ再開できるようにする (再接続後に自動フォールドされ続ける
//   バグの修正)。
function reattachPlayerToSeat(room, client, ws, seat) {
    if (!room || seat === undefined || seat < 0) return;
    // 同じ席を占有している別clientId(=切断前の自分)の残骸を掃除
    for (const [cid, s] of Object.entries(room.seatMap)) {
        const cidNum = parseInt(cid);
        if (s === seat && cidNum !== client.id) {
            delete room.seatMap[cid];
            room.members = room.members.filter(m => m.clientId !== cidNum);
        }
    }
    // このクライアントをメンバー登録 (重複なく) し、席を割り当て
    const existing = room.getMember(client.id);
    if (existing) existing.ws = ws;
    else room.members.push({ clientId: client.id, name: client.name, avatar: client.avatar, ws });
    room.seatMap[client.id] = seat;
    // 切断時に付いた離席/タイムアウト状態を解除
    if (room.sitout) delete room.sitout[seat];
    if (room.sitoutTime) delete room.sitoutTime[seat];
    if (room.consecutiveTimeouts) delete room.consecutiveTimeouts[seat];
    if (room.game && room.game.players[seat]) room.game.players[seat].connected = true;
    if (room.disconnectedPlayers) delete room.disconnectedPlayers[client.name];
}

function handleDisconnect(client) {
    if (client.inZoom) leaveZoom(client);
    // Clean up pending join requests from this client
    for (const [, room] of rooms) {
        const before = room.pendingJoins.length;
        room.pendingJoins = room.pendingJoins.filter(p => p.clientId !== client.id);
        if (room.pendingJoins.length !== before) {
            const hostMember = room.members.find(m => m.clientId === room.hostId);
            if (hostMember) {
                send(hostMember.ws, { type: 'join_request_cancelled', roomId: room.id, clientId: client.id, name: client.name });
            }
        }
    }
    // Handle all rooms the client is in
    const roomIdsCopy = [...client.roomIds];
    for (const rid of roomIdsCopy) {
        const room = rooms.get(rid);
        if (!room) continue;
        // During active game: mark as disconnected + sitout, but keep seat recoverable
        if (room.playing && room.game) {
            const seat = room.seatMap[client.id];
            if (seat !== undefined) {
                // 既に別の接続(=再接続)が同じ席を占有している場合、この close は
                // ネットワーク断で遅れて届いた「古いソケット」のもの。プレイヤーを
                // 切断扱いにせず、古いエントリだけ掃除して終える (再接続が
                // 巻き戻されて固まる/再開できないバグの防止)。
                const replacedByNewConn = room.members.some(
                    m => m.clientId !== client.id && room.seatMap[m.clientId] === seat
                );
                room.members = room.members.filter(m => m.clientId !== client.id);
                delete room.seatMap[client.id];
                if (replacedByNewConn) {
                    continue;
                }
                const dp = room.game.players[seat];
                dp.connected = false;
                // 切断保護: オールイン済みのプレイヤーはもう判断の余地が無いので
                // 降ろさず、ショーダウンまでのポット権利を維持する。まだアクション
                // が必要な(非オールインの)プレイヤーのみ自動フォールドする。
                if (!dp.allIn) dp.folded = true;
                if (!room.sitout) room.sitout = {};
                room.sitout[seat] = true;
                if (!room.sitoutTime) room.sitoutTime = {};
                room.sitoutTime[seat] = Date.now();
                if (!room.disconnectedPlayers) room.disconnectedPlayers = {};
                room.disconnectedPlayers[client.name] = { seat, clientId: client.id };
                if (room.pending && room.pending.playerId === seat) {
                    clearTimeout(room.pending.timer);
                    const p = room.pending;
                    room.pending = null;
                    p.resolve({ type: 'fold' });
                }
                broadcastLog(room, `${client.name} が切断されました`, 'dim');
                broadcastGameState(room);
                // If the disconnect emptied the room, start idle-close timer so
                // the table doesn't run hands forever with no live players.
                maybeAutoCloseRoom(room);
                continue;
            }
        }
        leaveRoom(client, rid);
    }
    client.roomId = null;
    client.roomIds = [];
}

// ============================================
// Start Game
// ============================================
const MID_JOIN_CHIPS = 10000; // 100BB of NLHE (BB=100)

function startGame(room) {
    const names = room.members.map(m => m.name);
    const filteredGames = room.settings.selectedGames.map(i => GAME_LIST[i]);

    const game = new GameState(names, room.settings.startingChips);
    // Record each player's starting chips for end-of-game ranking
    room.initialChips = {};
    room.totalRebuys = {}; // Track total rebuy chips per player
    names.forEach(n => { room.initialChips[n] = room.settings.startingChips; room.totalRebuys[n] = 0; });
    game.filteredGames = filteredGames;
    game.delay = (ms) => new Promise(r => setTimeout(r, Math.min(ms, 800)));

    // Seat map: member index = seat index
    room.seatMap = {};
    room.members.forEach((m, i) => { room.seatMap[m.clientId] = i; });

    // Track consecutive missed hands per seat (for sit-out eviction)
    room.missedHands = {};

    // Track consecutive timeouts per seat (for auto-sitout)
    room.consecutiveTimeouts = {};
    room.sitout = {};        // seat -> true if sitting out
    room.sitoutTime = {};    // seat -> timestamp when sitout started
    // Busted: a player whose chips reached 0. They enter sitout and get a
    // 10-minute window to choose rebuy or leave. bustTimers[seat] holds the
    // setTimeout handle so rebuy/leave can cancel it. See detectBust().
    room.bustedAt = {};
    room.bustTimers = {};

    // Stats
    room.stats = new StatsTracker();

    // Callbacks
    game.onUpdate = () => broadcastGameState(room);
    // Accumulate logs for the current hand so we can embed them in auto-share replay.
    room.currentHandLogs = [];
    game.onLog = (msg, cls) => {
        if (typeof msg === 'string') room.currentHandLogs.push(msg);
        broadcastLog(room, msg, cls);
    };

    game.onGetPlayerAction = (actions, player) => {
        return new Promise((resolve) => {
            const seatIdx = player.id;
            const member = room.getClientBySeat(seatIdx);

            // Set timer values BEFORE broadcasting so clients get correct turnRemaining
            room.turnStartTime = Date.now();
            room.turnTimeLimit = 45;

            broadcastGameState(room);

            // Auto-fold sitout players
            if (room.sitout[seatIdx]) {
                const auto = actions.find(a => a.type === 'check') || actions.find(a => a.type === 'fold') || actions[0];
                resolve(auto);
                return;
            }

            if (!member || !member.ws || member.ws.readyState !== WebSocket.OPEN) {
                const auto = actions.find(a => a.type === 'check') || actions.find(a => a.type === 'fold') || actions[0];
                resolve(auto);
                return;
            }

            // Send action request
            const _gc = game.gameConfig;
            send(member.ws, {
                type: 'your_turn', actions, timeLimit: 45,
                pot: game.pot,
                currentBet: game.currentBet,
                isFirstRound: game.isFirstRound,
                bigBlind: _gc.bigBlind || _gc.bigBet || 100,
                roomId: room.id,
            });

            // Timer: 45 seconds
            const timer = setTimeout(() => {
                room.pending = null;
                const auto = actions.find(a => a.type === 'check') || actions.find(a => a.type === 'fold') || actions[0];
                broadcastLog(room, `${player.name}: タイムアウト`, 'action');
                // Track consecutive timeouts
                room.consecutiveTimeouts[seatIdx] = (room.consecutiveTimeouts[seatIdx] || 0) + 1;
                if (room.consecutiveTimeouts[seatIdx] >= 2 && !room.sitout[seatIdx]) {
                    room.sitout[seatIdx] = true;
                    room.sitoutTime[seatIdx] = Date.now();
                    broadcastLog(room, `${player.name} が2回連続タイムアウトのため離席状態になりました`, 'important');
                }
                resolve(auto);
            }, 45000);

            room.pending = { type: 'action', playerId: seatIdx, resolve, timer };
        });
    };

    game.onGetPlayerDraw = (player) => {
        return new Promise((resolve) => {
            const seatIdx = player.id;
            const member = room.getClientBySeat(seatIdx);

            // Set timer values BEFORE broadcasting so clients get correct turnRemaining
            room.turnStartTime = Date.now();
            room.turnTimeLimit = 45;

            broadcastGameState(room);

            // Auto-stand-pat for sitout players
            if (room.sitout[seatIdx]) {
                resolve([]);
                return;
            }

            if (!member || !member.ws || member.ws.readyState !== WebSocket.OPEN) {
                resolve([]); // Stand pat
                return;
            }

            send(member.ws, { type: 'your_draw', hand: player.hand, timeLimit: 45, roomId: room.id });

            const timer = setTimeout(() => {
                room.pending = null;
                broadcastLog(room, `${player.name}: タイムアウト（スタンドパット）`, 'action');
                // Track consecutive timeouts
                room.consecutiveTimeouts[seatIdx] = (room.consecutiveTimeouts[seatIdx] || 0) + 1;
                if (room.consecutiveTimeouts[seatIdx] >= 2 && !room.sitout[seatIdx]) {
                    room.sitout[seatIdx] = true;
                    room.sitoutTime[seatIdx] = Date.now();
                    broadcastLog(room, `${player.name} が2回連続タイムアウトのため離席状態になりました`, 'important');
                }
                resolve([]);
            }, 45000);

            room.pending = { type: 'draw', playerId: seatIdx, resolve, timer };
        });
    };

    // Stats hooks
    game.onHandStart = () => {
        // Reset per-hand log buffer (for auto-share replay embedding)
        room.currentHandLogs = [];
        // Clear pending rejoin flags
        room.pendingRejoin = {};

        // Evict players who have been absent for 3+ consecutive hands
        game.players.forEach((p, seat) => {
            if (!p.connected && p.chips > 0) {
                room.missedHands[seat] = (room.missedHands[seat] || 0) + 1;
                if (room.missedHands[seat] >= 3) {
                    p.chips = 0;
                    p.folded = true;
                    broadcastLog(room, `${p.name} が3ゲーム離席のため空席になりました`, 'important');
                }
            } else if (p.connected) {
                room.missedHands[seat] = 0; // reset on reconnect
            }
        });

        // Fold sitout players so they don't get dealt cards
        game.players.forEach((p, seat) => {
            if (room.sitout[seat] && p.chips > 0) {
                p.folded = true;
            }
        });

        // Auto-kick sitout players after 10 minutes
        const TEN_MINUTES = 10 * 60 * 1000;
        game.players.forEach((p, seat) => {
            if (room.sitout[seat] && room.sitoutTime[seat]) {
                if (Date.now() - room.sitoutTime[seat] >= TEN_MINUTES) {
                    p.chips = 0;
                    p.folded = true;
                    room.sitout[seat] = false;
                    delete room.sitoutTime[seat];
                    broadcastLog(room, `${p.name} が10分間離席のため退室しました`, 'important');
                    // Notify the player's client AND actually remove them from
                    // the room on the server. Without the leaveRoom call,
                    // client.roomIds stayed out of sync and join_room
                    // rejected a subsequent rejoin with "すでに参加しています".
                    const member = room.getClientBySeat(seat);
                    if (member && member.ws) {
                        send(member.ws, { type: 'auto_kicked' });
                        let targetClient = null;
                        for (const [, c] of clients) {
                            if (c.id === member.clientId) { targetClient = c; break; }
                        }
                        if (targetClient) leaveRoom(targetClient, room.id);
                    }
                }
            }
        });

        room.stats.beginHand(game.players, game.gameConfig, game.dealerSeat);
        broadcastToRoom(room, { type: 'hand_start' });
    };
    game.onFirstRoundEnd = () => room.stats.endFirstRound();
    game.onPlayerAction = (player, action, isBlinds) => {
        room.stats.recordAction(player, action, isBlinds);
    };
    game.onShowdown = (winnerIds) => room.stats.recordShowdown(winnerIds);
    game.onHandEnd = (hadShowdown) => {
        // Broadcast hand result with all players' cards
        const gc = game.gameConfig;
        const activeCount = game.players.filter(p => p.name).length;
        const handResult = {
            type: 'hand_result',
            gameName: gc.name, gameId: gc.id, gameType: gc.type,
            communityCards: game.communityCards || [],
            dealerSeat: game.dealerSeat,
            drawSnapshots: gc.type === 'draw' ? (game.drawSnapshots || []).map(snap =>
                snap.map(s => ({ name: s.name, folded: s.folded, hand: s.hand }))
            ) : [],
            players: game.players.map((p, i) => {
                const pos = StatsTracker.getPosition(i, game.dealerSeat, activeCount);
                const startC = room.stats.currentHand ? (room.stats.currentHand.startChips[i] || p.chips) : p.chips;
                let cards = [];
                if (gc.type === 'stud') cards = [...(p.downCards || []), ...(p.upCards || [])];
                else cards = p.hand || [];
                return {
                    name: p.name, position: pos, folded: p.folded,
                    chips: p.chips, startChips: startC,
                    cards: cards.map(c => ({ rank: c.rank, suit: c.suit })),
                    upCards: gc.type === 'stud' ? (p.upCards || []).map(c => ({ rank: c.rank, suit: c.suit })) : [],
                    downCards: gc.type === 'stud' ? (p.downCards || []).map(c => ({ rank: c.rank, suit: c.suit })) : [],
                };
            }),
        };
        broadcastToRoom(room, handResult);
        room.stats.endHand(game.players, hadShowdown);
        broadcastStatsUpdate(room);

        // Session tracking: increment hand count and refresh participant list.
        room.handsPlayed = (room.handsPlayed || 0) + 1;
        if (!room.sessionParticipants) room.sessionParticipants = {};
        for (const p of game.players) {
            if (p.name && !room.sessionParticipants[p.name]) {
                room.sessionParticipants[p.name] = { avatar: p.avatar || null };
            }
        }

        // player_stats: 収支を記録
        for (const p of handResult.players) {
            if (!p.name) continue;
            const diff = p.chips - p.startChips;
            upsertPlayerStats(p.name, { profitDelta: diff });
        }
        // player_stats: このセッションでプレイしたゲーム種類を記録
        if (!room.sessionGameIds) room.sessionGameIds = new Set();
        if (gc && gc.id) room.sessionGameIds.add(gc.id);

        // Big hand detection → broadcast to lobby
        const bigBlind = (gc && gc.bigBlind) || game.bigBlind || 100;
        const potThreshold = bigBlind * 50;
        // Calculate pot from chip changes
        let totalPot = 0;
        let winnerName = '';
        let maxGain = 0;
        for (const p of handResult.players) {
            if (!p.name) continue;
            const diff = p.chips - p.startChips;
            if (diff < 0) totalPot += Math.abs(diff);
            if (diff > maxGain) { maxGain = diff; winnerName = p.name; }
        }
        if (totalPot >= potThreshold && winnerName) {
            // Determine hand rank of winner
            let handRank = '';
            if (hadShowdown) {
                const winner = handResult.players.find(p => p.name === winnerName);
                if (winner && winner.cards && winner.cards.length > 0) {
                    try {
                        const evalCards = winner.cards.map(c => ({ rank: c.rank, suit: c.suit }));
                        const cc = (handResult.communityCards || []).map(c => ({ rank: c.rank, suit: c.suit }));
                        const allCards = [...evalCards, ...cc];
                        if (allCards.length >= 5) {
                            const result = bestHighHand(allCards);
                            if (result && result.desc) handRank = result.desc;
                        }
                    } catch (e) {}
                }
            }
            for (const [ws2, c2] of clients) {
                if (!c2.roomId && !c2.inZoom) {
                    send(ws2, { type: 'big_hand', roomId: room.id, winner: winnerName, pot: totalPot, handRank, gameName: gc.name });
                }
            }
        }

        // Close the table if every remaining member is on sitout (checked on next
        // tick so the hand's result broadcast settles first).
        // After the hand's result broadcast settles, apply any pending
        // sitout/leave reservations, then evaluate auto-close.
        setTimeout(() => {
            applyPendingReservations(room);
            // Convert any chips-0 players into a 10-minute rebuy/leave window.
            detectBust(room);
            broadcastGameState(room);
            maybeAutoCloseRoom(room);
        }, 50);
    };

    room.game = game;
    room.playing = true;
    // Session tracking: チップは startGame ごとにリセットされる (initialChips/
    // totalRebuys を上で初期化) ため、「セッション = 1ゲーム」として集計も
    // 毎回リセットする。これにより game_over 時点で当該ゲームの正確な収支を
    // 記録できる。
    room.sessionStart = Date.now();
    room.handsPlayed = 0;
    room.sessionGameIds = new Set();
    room.statsRecorded = false; // game_over / 部屋削除での二重記録防止フラグ
    // Snapshot initial participants (name → avatar) so we can show avatars even
    // if a player leaves before the session ends.
    room.sessionParticipants = {};
    for (const m of room.members) {
        if (m.name) {
            room.sessionParticipants[m.name] = { avatar: m.avatar || null };
        }
    }

    broadcastToRoom(room, { type: 'game_started' });
    broadcastRoomList();

    // Run game loop
    runGameLoop(room);
}

async function runGameLoop(room) {
    const game = room.game;

    while (!game.gameOver && room.playing && room.members.length > 0) {
        const playable = () => game.players.filter(p => p.connected && p.chips > 0);

        if (playable().length >= 2) {
            // Recovering from solo-wait (another player joined). Clear the state.
            if (room.soloWaitSince) {
                delete room.soloWaitSince;
                broadcastLog(room, 'プレイヤーが揃ったためゲームを再開します', 'important');
                broadcastGameState(room);
            }

            try {
                await game.playHand();
            } catch (e) {
                console.error('Hand error:', e);
                broadcastLog(room, 'エラーが発生しました。次のハンドに進みます。', 'important');
            }

            broadcastGameState(room);
            await new Promise(r => setTimeout(r, 2500));

            // Reset actions
            for (const p of game.players) p.lastAction = '';
        }

        // Not enough players to play a hand.
        if (playable().length <= 1) {
            // A busted player still within their 10-minute decision window takes
            // precedence — keep the table alive so they can rebuy without a
            // HU bust slamming the table shut instantly.
            if (hasPendingBust(room)) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            // Solo player: give them a 10-minute window to wait for another
            // player to join or to explicitly end the table. On timeout, auto
            // kick them and close the table.
            if (playable().length === 1) {
                if (!room.soloWaitSince) {
                    room.soloWaitSince = Date.now();
                    broadcastLog(room, '他プレイヤーがいないため待機状態です（10分以内に参加者が来ない場合はテーブル終了）', 'important');
                    broadcastGameState(room);
                }
                if (Date.now() - room.soloWaitSince >= BUST_WINDOW_MS) {
                    const soloSeat = game.players.findIndex(p => p.connected && p.chips > 0);
                    const member = soloSeat >= 0 ? room.getClientBySeat(soloSeat) : null;
                    if (member && member.ws) {
                        try { send(member.ws, { type: 'auto_kicked' }); } catch {}
                        // Also remove them from the server-side room state so
                        // client.roomIds stays consistent and a future join_room
                        // isn't rejected with "すでに参加しています".
                        let targetClient = null;
                        for (const [, c] of clients) {
                            if (c.id === member.clientId) { targetClient = c; break; }
                        }
                        if (targetClient) leaveRoom(targetClient, room.id);
                    }
                    broadcastLog(room, '10分間他プレイヤーが参加しなかったためテーブルを終了します', 'important');
                    delete room.soloWaitSince;
                    game.gameOver = true;
                    continue;
                }
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            // 0 playable players — nothing left to wait for.
            game.gameOver = true;
        }
    }
    // Clean up solo-wait state regardless of how the loop exited.
    if (room.soloWaitSince) delete room.soloWaitSince;

    // Game over
    room.playing = false;
    room.disconnectedPlayers = {};

    // Now that game ended, transfer host if original host left during play
    if (!room.members.find(m => m.clientId === room.hostId) && room.members.length > 0) {
        room.hostId = room.members[0].clientId;
        room.hostName = room.members[0].name || room.hostName;
    }
    // Recompute merged games with current members
    room.settings.selectedGames = room.getMergedGames();

    broadcastGameState(room);

    const initialChips = room.initialChips || {};
    const totalRebuys = room.totalRebuys || {};
    const ranking = game.players
        .filter(p => p.name)
        .map(p => {
            const init = initialChips[p.name] || room.settings.startingChips;
            const rebuys = totalRebuys[p.name] || 0;
            const netProfit = p.chips - init - rebuys;
            return {
                name: p.name,
                finalChips: p.chips,
                initialChips: init,
                totalRebuys: rebuys,
                netProfit,
                totalWin: netProfit, // net profit = pure game result
            };
        })
        .sort((a, b) => b.totalWin - a.totalWin);

    broadcastToRoom(room, {
        type: 'game_over',
        ranking,
    });
    broadcastRoomList();

    // プレイ終了直後にセッション収支を記録する (チップは確定済み)。
    // 以前は部屋が idle クローズする10分後にのみ記録していたため、
    // 再デプロイ/スリープで記録が失われたり、反映が遅かった。
    try { recordSessionStats(room); } catch (e) { console.warn('recordSessionStats (game_over) failed:', e && e.message); }
}

// ============================================
// Zoom Pool System (concurrent tables)
// ============================================
const zoomPool = [];           // [{clientId, name, ws}] waiting for table
const zoomTables = new Map();  // tableId -> ZoomTable
const zoomPlayers = new Map(); // clientId -> {name, ws, tableId}
let zoomNextTableId = 1;
let zoomMatchTimer = null;

function handleJoinZoom(ws, client) {
    if (client.roomId) leaveRoom(client);
    if (client.inZoom) return;

    client.inZoom = true;
    zoomPlayers.set(client.id, { name: client.name, avatar: client.avatar, ws, tableId: null });
    send(ws, { type: 'zoom_joined' });
    addToZoomPool(client.id);
    broadcastRoomList();
    broadcastOnlineUsers();
}

function handleLeaveZoom(ws, client) {
    if (!client.inZoom) return;
    leaveZoom(client);
    send(ws, { type: 'zoom_left' });
    broadcastRoomList();
    broadcastOnlineUsers();
}

function handleZoomSitout(ws, client) {
    if (!client.inZoom) return;

    // Remove from pool
    const poolIdx = zoomPool.findIndex(p => p.clientId === client.id);
    if (poolIdx >= 0) zoomPool.splice(poolIdx, 1);

    // Fold from active table
    const pd = zoomPlayers.get(client.id);
    if (pd && pd.tableId) {
        const table = zoomTables.get(pd.tableId);
        if (table) foldZoomPlayer(table, client.id);
        pd.tableId = null;
    }

    send(ws, { type: 'zoom_sitout' });
}

function handleZoomRejoin(ws, client) {
    if (!client.inZoom) return;
    const pd = zoomPlayers.get(client.id);
    if (!pd) return;

    // Re-add to pool
    addToZoomPool(client.id);
}

function leaveZoom(client) {
    if (!client.inZoom) return;
    client.inZoom = false;

    // Remove from pool
    const poolIdx = zoomPool.findIndex(p => p.clientId === client.id);
    if (poolIdx >= 0) zoomPool.splice(poolIdx, 1);

    // Remove from active table
    const pd = zoomPlayers.get(client.id);
    if (pd && pd.tableId) {
        const table = zoomTables.get(pd.tableId);
        if (table) foldZoomPlayer(table, client.id);
    }

    zoomPlayers.delete(client.id);
}

function addToZoomPool(clientId) {
    const pd = zoomPlayers.get(clientId);
    if (!pd || !pd.ws || pd.ws.readyState !== WebSocket.OPEN) return;

    pd.tableId = null;

    // Prevent duplicates
    if (zoomPool.some(p => p.clientId === clientId)) return;

    zoomPool.push({ clientId, name: pd.name, avatar: pd.avatar, ws: pd.ws });
    send(pd.ws, { type: 'zoom_waiting', poolSize: zoomPool.length });

    zoomMatchmake();
}

function zoomMatchmake() {
    // 6+ players ready: start immediately
    while (zoomPool.length >= 6) {
        const players = zoomPool.splice(0, 6);
        createZoomTable(players);
    }

    // 4-5 players: wait 3 seconds for more to join
    if (zoomPool.length >= 4 && !zoomMatchTimer) {
        zoomMatchTimer = setTimeout(() => {
            zoomMatchTimer = null;
            if (zoomPool.length >= 4) {
                const count = Math.min(zoomPool.length, 6);
                const players = zoomPool.splice(0, count);
                createZoomTable(players);
            }
            // Recurse if more players waiting
            if (zoomPool.length >= 4) zoomMatchmake();
        }, 3000);
    }
}

function createZoomTable(members) {
    const tableId = zoomNextTableId++;
    const names = members.map(m => m.name);

    const game = new GameState(names, 10000);
    game.filteredGames = [...GAME_LIST];
    game.zoomMode = true;
    game.currentGameIndex = Math.floor(Math.random() * GAME_LIST.length);
    game.delay = (ms) => new Promise(r => setTimeout(r, Math.min(ms, 500)));

    const seatMap = {};
    members.forEach((m, i) => {
        seatMap[m.clientId] = i;
        const pd = zoomPlayers.get(m.clientId);
        if (pd) pd.tableId = tableId;
    });

    const stats = new StatsTracker();

    const table = {
        id: tableId,
        game,
        members: [...members],
        activeMemberIds: new Set(members.map(m => m.clientId)),
        seatMap,
        pending: null,
        stats,
    };

    zoomTables.set(tableId, table);

    // --- Callbacks ---
    game.onUpdate = () => broadcastZoomTableState(table);
    // Accumulate per-hand logs for replay embedding
    table.currentHandLogs = [];
    game.onLog = (msg, cls) => {
        if (typeof msg === 'string') table.currentHandLogs.push(msg);
        for (const m of table.members) {
            if (table.activeMemberIds.has(m.clientId))
                send(m.ws, { type: 'log', message: msg, cls });
        }
    };
    game.onHandStart = () => {
        table.currentHandLogs = [];
        stats.beginHand(game.players, game.gameConfig, game.dealerSeat);
        for (const m of table.members) {
            if (table.activeMemberIds.has(m.clientId))
                send(m.ws, { type: 'hand_start' });
        }
    };
    game.onFirstRoundEnd = () => stats.endFirstRound();
    game.onPlayerAction = (player, action, isBlinds) => {
        stats.recordAction(player, action, isBlinds);
    };
    game.onShowdown = (winnerIds) => stats.recordShowdown(winnerIds);
    game.onHandEnd = (hadShowdown) => {
        const gc = game.gameConfig;
        const activeCount = game.players.filter(p => p.name).length;
        const handResult = {
            type: 'hand_result',
            gameName: gc.name, gameId: gc.id, gameType: gc.type,
            communityCards: game.communityCards || [],
            dealerSeat: game.dealerSeat,
            drawSnapshots: gc.type === 'draw' ? (game.drawSnapshots || []).map(snap =>
                snap.map(s => ({ name: s.name, folded: s.folded, hand: s.hand }))
            ) : [],
            players: game.players.map((p, i) => {
                const pos = StatsTracker.getPosition(i, game.dealerSeat, activeCount);
                const startC = stats.currentHand ? (stats.currentHand.startChips[i] || p.chips) : p.chips;
                let cards = [];
                if (gc.type === 'stud') cards = [...(p.downCards || []), ...(p.upCards || [])];
                else cards = p.hand || [];
                return {
                    name: p.name, position: pos, folded: p.folded,
                    chips: p.chips, startChips: startC,
                    cards: cards.map(c => ({ rank: c.rank, suit: c.suit })),
                    upCards: gc.type === 'stud' ? (p.upCards || []).map(c => ({ rank: c.rank, suit: c.suit })) : [],
                    downCards: gc.type === 'stud' ? (p.downCards || []).map(c => ({ rank: c.rank, suit: c.suit })) : [],
                };
            }),
        };
        for (const m of table.members) {
            if (table.activeMemberIds.has(m.clientId))
                send(m.ws, handResult);
        }
        stats.endHand(game.players, hadShowdown);
        broadcastZoomStatsUpdate(table);

        // Big hand detection → broadcast to lobby
        const bigBlind = (gc && gc.bigBlind) || game.bigBlind || 100;
        const potThreshold = bigBlind * 50;
        let totalPot = 0;
        let winnerName = '';
        let maxGain = 0;
        for (const p of handResult.players) {
            if (!p.name) continue;
            const diff = p.chips - p.startChips;
            if (diff < 0) totalPot += Math.abs(diff);
            if (diff > maxGain) { maxGain = diff; winnerName = p.name; }
        }
        if (totalPot >= potThreshold && winnerName) {
            let handRank = '';
            if (hadShowdown) {
                const winner = handResult.players.find(p => p.name === winnerName);
                if (winner && winner.cards && winner.cards.length > 0) {
                    try {
                        const evalCards = winner.cards.map(c => ({ rank: c.rank, suit: c.suit }));
                        const cc = (handResult.communityCards || []).map(c => ({ rank: c.rank, suit: c.suit }));
                        const allCards = [...evalCards, ...cc];
                        if (allCards.length >= 5) {
                            const result = bestHighHand(allCards);
                            if (result && result.desc) handRank = result.desc;
                        }
                    } catch (e) {}
                }
            }
            for (const [ws2, c2] of clients) {
                if (!c2.roomId && !c2.inZoom) {
                    send(ws2, { type: 'big_hand', roomId: 'ZOOM', winner: winnerName, pot: totalPot, handRank, gameName: gc.name });
                }
            }
        }

    };

    game.onGetPlayerAction = (actions, player) => {
        return new Promise((resolve) => {
            const seatIdx = player.id;
            const member = getZoomMemberBySeat(table, seatIdx);

            const timeLimit = table.game.isFirstRound ? 45 : 30;

            // Set timer values BEFORE broadcasting so clients get correct turnRemaining
            table.turnStartTime = Date.now();
            table.turnTimeLimit = timeLimit;

            broadcastZoomTableState(table);

            if (!member || !member.ws || member.ws.readyState !== WebSocket.OPEN
                || !table.activeMemberIds.has(member.clientId)) {
                const auto = actions.find(a => a.type === 'check')
                          || actions.find(a => a.type === 'fold') || actions[0];
                resolve(auto);
                return;
            }

            const gc = game.gameConfig;
            send(member.ws, {
                type: 'your_turn', actions, timeLimit,
                pot: game.pot,
                currentBet: game.currentBet,
                isFirstRound: game.isFirstRound,
                bigBlind: gc.bigBlind || gc.bigBet || 100,
            });

            const timer = setTimeout(() => {
                table.pending = null;
                const auto = actions.find(a => a.type === 'check')
                          || actions.find(a => a.type === 'fold') || actions[0];
                for (const m2 of table.members) {
                    if (table.activeMemberIds.has(m2.clientId))
                        send(m2.ws, { type: 'log', message: `${player.name}: タイムアウト`, cls: 'action' });
                }
                resolve(auto);
            }, timeLimit * 1000);

            table.pending = { type: 'action', playerId: seatIdx, resolve, timer };
        });
    };

    game.onGetPlayerDraw = (player) => {
        return new Promise((resolve) => {
            const seatIdx = player.id;
            const member = getZoomMemberBySeat(table, seatIdx);

            // Set timer values BEFORE broadcasting so clients get correct turnRemaining
            table.turnStartTime = Date.now();
            table.turnTimeLimit = 30;

            broadcastZoomTableState(table);

            if (!member || !member.ws || member.ws.readyState !== WebSocket.OPEN
                || !table.activeMemberIds.has(member.clientId)) {
                resolve([]);
                return;
            }

            send(member.ws, { type: 'your_draw', hand: player.hand, timeLimit: 30 });

            const timer = setTimeout(() => {
                table.pending = null;
                resolve([]);
            }, 30000);

            table.pending = { type: 'draw', playerId: seatIdx, resolve, timer };
        });
    };

    // When a player folds, return them to the pool immediately
    game.onPlayerFold = (player) => {
        const member = getZoomMemberBySeat(table, player.id);
        if (!member) return;

        table.activeMemberIds.delete(member.clientId);

        setTimeout(() => {
            const pd = zoomPlayers.get(member.clientId);
            if (pd && pd.tableId === tableId) {
                addToZoomPool(member.clientId);
            }
        }, 500);
    };

    // Notify all players
    for (const m of members) {
        send(m.ws, { type: 'game_started', zoom: true });
    }

    runZoomTable(table);
}

function getZoomMemberBySeat(table, seatIdx) {
    for (const [cid, seat] of Object.entries(table.seatMap)) {
        if (seat === seatIdx) {
            return table.members.find(m => m.clientId === parseInt(cid));
        }
    }
    return null;
}

function broadcastZoomStatsUpdate(table) {
    if (!table.game || !table.stats) return;
    const playerStats = {};
    for (let i = 0; i < table.game.playerCount; i++) {
        const pd = table.stats.getPlayer(i);
        const calc = table.stats.calc(pd.total);
        const byGame = {};
        for (const [gid, raw] of Object.entries(pd.byGame)) {
            byGame[gid] = table.stats.calc(raw);
        }
        const byPos = {};
        if (pd.byPosition) {
            for (const [pos, posData] of Object.entries(pd.byPosition)) {
                const posTotal = posData.total ? table.stats.calc(posData.total) : table.stats.calc(posData);
                const posByGame = {};
                if (posData.byGame) {
                    for (const [gid2, raw2] of Object.entries(posData.byGame)) {
                        posByGame[gid2] = table.stats.calc(raw2);
                    }
                }
                byPos[pos] = { ...posTotal, byGame: posByGame };
            }
        }
        const rawByGame = {};
        for (const [gid, raw] of Object.entries(pd.byGame)) {
            rawByGame[gid] = { ...raw };
        }
        const rawByPos = {};
        if (pd.byPosition) {
            for (const [pos, posData] of Object.entries(pd.byPosition)) {
                const posTotal = posData.total ? { ...posData.total } : { ...posData };
                const posByGame = {};
                if (posData.byGame) {
                    for (const [gid2, raw2] of Object.entries(posData.byGame)) {
                        posByGame[gid2] = { ...raw2 };
                    }
                }
                rawByPos[pos] = { total: posTotal, byGame: posByGame };
            }
        }
        playerStats[table.game.players[i].name] = {
            ...calc, byGame, byPosition: byPos,
            raw: { ...pd.total }, rawByGame, rawByPos,
        };
    }
    const gc = table.game.gameConfig;
    for (const m of table.members) {
        if (table.activeMemberIds.has(m.clientId)) {
            send(m.ws, { type: 'stats_update', stats: playerStats,
                gameId: gc.id, gameName: gc.name, zoom: true, roomId: 'zoom',
            });
        }
    }
}

function broadcastZoomTableState(table) {
    if (!table.game) return;
    for (const m of table.members) {
        if (!table.activeMemberIds.has(m.clientId)) continue;
        const seat = table.seatMap[m.clientId];
        if (seat !== undefined) {
            const state = getStateForPlayer(table.game, table, seat);
            state.zoom = true;
            send(m.ws, { type: 'game_state', state });
        }
    }
}

function foldZoomPlayer(table, clientId) {
    const seat = table.seatMap[clientId];
    if (seat === undefined) return;

    if (table.game && table.game.players[seat]) {
        table.game.players[seat].folded = true;
        table.game.players[seat].connected = false;
    }

    if (table.pending && table.pending.playerId === seat) {
        clearTimeout(table.pending.timer);
        const p = table.pending;
        table.pending = null;
        p.resolve({ type: 'fold' });
    }

    table.activeMemberIds.delete(clientId);
}

async function runZoomTable(table) {
    try {
        await table.game.playHand();
    } catch (e) {
        console.error('Zoom hand error:', e);
    }

    await new Promise(r => setTimeout(r, 1000));

    // Return remaining active members to pool
    for (const cid of table.activeMemberIds) {
        if (zoomPlayers.has(cid)) {
            addToZoomPool(cid);
        }
    }

    // Clean up
    if (table.pending) clearTimeout(table.pending.timer);
    zoomTables.delete(table.id);
}

function handleZoomAction(client, msg) {
    const pd = zoomPlayers.get(client.id);
    if (!pd || !pd.tableId) return;
    const table = zoomTables.get(pd.tableId);
    if (!table || !table.pending) return;
    const seat = table.seatMap[client.id];
    if (table.pending.type !== 'action' || table.pending.playerId !== seat) return;
    clearTimeout(table.pending.timer);
    const p = table.pending;
    table.pending = null;
    p.resolve(msg.action);
}

function handleZoomDraw(client, msg) {
    const pd = zoomPlayers.get(client.id);
    if (!pd || !pd.tableId) return;
    const table = zoomTables.get(pd.tableId);
    if (!table || !table.pending) return;
    const seat = table.seatMap[client.id];
    if (table.pending.type !== 'draw' || table.pending.playerId !== seat) return;
    clearTimeout(table.pending.timer);
    const p = table.pending;
    table.pending = null;
    p.resolve(msg.discards || []);
}

// ============================================
// Start Server
// ============================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Poker server: http://localhost:${PORT}`);
});
