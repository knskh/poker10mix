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
// Follow System (local JSON persistence)
// ============================================
const FOLLOWS_DIR = path.join(__dirname, 'data');
const FOLLOWS_FILE = path.join(FOLLOWS_DIR, 'follows.json');
const followsMap = new Map(); // followerName -> Set<followedName>

function loadFollows() {
    try {
        if (!fs.existsSync(FOLLOWS_FILE)) return;
        const data = JSON.parse(fs.readFileSync(FOLLOWS_FILE, 'utf8'));
        for (const [follower, list] of Object.entries(data)) {
            followsMap.set(follower, new Set(Array.isArray(list) ? list : []));
        }
        console.log(`Loaded follows for ${followsMap.size} users`);
    } catch (e) {
        console.warn('Failed to load follows.json:', e.message);
    }
}

let saveFollowsTimer = null;
function saveFollowsDebounced() {
    if (saveFollowsTimer) return;
    saveFollowsTimer = setTimeout(() => {
        saveFollowsTimer = null;
        try {
            if (!fs.existsSync(FOLLOWS_DIR)) fs.mkdirSync(FOLLOWS_DIR, { recursive: true });
            const obj = {};
            for (const [k, v] of followsMap) obj[k] = [...v];
            fs.writeFileSync(FOLLOWS_FILE, JSON.stringify(obj, null, 2), 'utf8');
        } catch (e) {
            console.warn('Failed to save follows.json:', e.message);
        }
    }, 500);
}

function getFollowing(name) {
    return [...(followsMap.get(name) || [])];
}

function getFollowers(name) {
    const out = [];
    for (const [follower, set] of followsMap) {
        if (set.has(name)) out.push(follower);
    }
    return out;
}

loadFollows();

// ============================================
// Timeline / Posts / Comments (SNS feed)
// ============================================
const TIMELINE_FILE = path.join(FOLLOWS_DIR, 'timeline.json');
const timelineList = []; // array of posts, newest first, capped at 200
// post = { id, authorName, authorAvatar, type, title, body, handData?, createdAt, comments: [] }
// comment = { id, authorName, authorAvatar, body, createdAt }
let nextPostId = 1;
let nextCommentId = 1;

function loadTimeline() {
    try {
        if (!fs.existsSync(TIMELINE_FILE)) return;
        const data = JSON.parse(fs.readFileSync(TIMELINE_FILE, 'utf8'));
        if (Array.isArray(data.posts)) {
            timelineList.push(...data.posts);
            nextPostId = (data.nextPostId || 1);
            nextCommentId = (data.nextCommentId || 1);
        }
        // Migration: ensure likes fields exist on posts and comments
        for (const p of timelineList) {
            if (!Array.isArray(p.likes)) p.likes = [];
            p.likeCount = p.likes.length;
            if (!Array.isArray(p.comments)) p.comments = [];
            for (const c of p.comments) {
                if (!Array.isArray(c.likes)) c.likes = [];
                c.likeCount = c.likes.length;
                if (!('parentCommentId' in c)) c.parentCommentId = null;
                if (!Array.isArray(c.mentions)) c.mentions = [];
            }
        }
        console.log(`Loaded ${timelineList.length} timeline posts`);
    } catch (e) {
        console.warn('Failed to load timeline.json:', e.message);
    }
}

let saveTimelineTimer = null;
function saveTimelineDebounced() {
    if (saveTimelineTimer) return;
    // 3000ms debounce: aggregates bursts of likes/comments into fewer writes.
    saveTimelineTimer = setTimeout(() => {
        saveTimelineTimer = null;
        try {
            if (!fs.existsSync(FOLLOWS_DIR)) fs.mkdirSync(FOLLOWS_DIR, { recursive: true });
            const obj = { posts: timelineList, nextPostId, nextCommentId };
            fs.writeFileSync(TIMELINE_FILE, JSON.stringify(obj, null, 2), 'utf8');
        } catch (e) {
            console.warn('Failed to save timeline.json:', e.message);
        }
    }, 3000);
}

function createPost(post) {
    const p = {
        id: nextPostId++,
        authorName: post.authorName || '',
        authorAvatar: post.authorAvatar || null,
        type: post.type || 'diary', // 'hand' | 'diary' | 'community' | 'session'
        title: (post.title || '').slice(0, 100),
        body: (post.body || '').slice(0, 2000),
        handData: post.handData || null,
        sessionData: post.sessionData || null,
        mood: post.mood || null,
        autoShared: !!post.autoShared,
        manualShared: !!post.manualShared,
        replayHash: post.replayHash || '',
        createdAt: Date.now(),
        comments: [],
        likes: [],
        likeCount: 0
    };
    timelineList.unshift(p);
    if (timelineList.length > 200) timelineList.length = 200;
    saveTimelineDebounced();
    return p;
}

function addCommentToPost(postId, comment) {
    const post = timelineList.find(p => p.id === postId);
    if (!post) return null;
    const c = {
        id: nextCommentId++,
        authorName: comment.authorName || '',
        authorAvatar: comment.authorAvatar || null,
        body: (comment.body || '').slice(0, 500),
        parentCommentId: (comment.parentCommentId != null) ? Number(comment.parentCommentId) : null,
        mentions: Array.isArray(comment.mentions) ? comment.mentions.slice(0, 10).map(s => String(s).slice(0, 40)) : [],
        likes: [],
        likeCount: 0,
        createdAt: Date.now()
    };
    post.comments.push(c);
    saveTimelineDebounced();
    return { post, comment: c };
}

function togglePostLike(postId, userName) {
    if (!userName) return null;
    const post = timelineList.find(p => p.id === postId);
    if (!post) return null;
    if (!Array.isArray(post.likes)) post.likes = [];
    const idx = post.likes.indexOf(userName);
    let likedNow;
    if (idx >= 0) {
        post.likes.splice(idx, 1);
        likedNow = false;
    } else {
        post.likes.push(userName);
        likedNow = true;
    }
    post.likeCount = post.likes.length;
    saveTimelineDebounced();
    return { post, likedNow };
}

function toggleCommentLike(postId, commentId, userName) {
    if (!userName) return null;
    const post = timelineList.find(p => p.id === postId);
    if (!post) return null;
    const comment = (post.comments || []).find(c => c.id === commentId);
    if (!comment) return null;
    if (!Array.isArray(comment.likes)) comment.likes = [];
    const idx = comment.likes.indexOf(userName);
    let likedNow;
    if (idx >= 0) {
        comment.likes.splice(idx, 1);
        likedNow = false;
    } else {
        comment.likes.push(userName);
        likedNow = true;
    }
    comment.likeCount = comment.likes.length;
    saveTimelineDebounced();
    return { post, comment, likedNow };
}

function getRankings(period) {
    // period: 'weekly' | 'all'
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let pool = timelineList;
    if (period === 'weekly') {
        pool = timelineList.filter(p => p.createdAt >= weekAgo);
    }
    // Sort by like count descending; tie-break by recency
    const sorted = [...pool]
        .filter(p => (p.likeCount || 0) > 0)  // only posts with at least 1 like appear
        .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0) || (b.createdAt - a.createdAt));
    return sorted.slice(0, 20);
}

function broadcastPostLike(post, actorName, likedNow) {
    for (const [ws, c] of clients) {
        if (!c.name) continue;
        send(ws, {
            type: 'post_liked',
            postId: post.id,
            userName: actorName,
            likeCount: post.likeCount || 0,
            liked: likedNow
        });
    }
}

function broadcastCommentLike(post, comment, actorName, likedNow) {
    for (const [ws, c] of clients) {
        if (!c.name) continue;
        send(ws, {
            type: 'comment_liked',
            postId: post.id,
            commentId: comment.id,
            userName: actorName,
            likeCount: comment.likeCount || 0,
            liked: likedNow
        });
    }
}

function getTimelineForUser(name) {
    // Global timeline: all users (including guests) see the same feed.
    // The `name` argument is kept for API compatibility but no longer filters.
    return timelineList.slice(0, 50);
}

function broadcastTimelineUpdate(post) {
    // Broadcast to every connected client with a name (authenticated or guest).
    for (const [ws, c] of clients) {
        if (!c.name) continue;
        send(ws, { type: 'timeline_post', post });
    }
}

function broadcastCommentUpdate(postId, comment, postAuthor) {
    // Broadcast to every connected client with a name (authenticated or guest).
    for (const [ws, c] of clients) {
        if (!c.name) continue;
        send(ws, { type: 'timeline_comment', postId, comment });
    }
}

// ============================================
// Footprints (profile view tracking)
// ============================================
const FOOTPRINTS_FILE = path.join(FOLLOWS_DIR, 'footprints.json');
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
            if (!fs.existsSync(FOLLOWS_DIR)) fs.mkdirSync(FOLLOWS_DIR, { recursive: true });
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

loadTimeline();
loadFootprints();

// ============================================
// Notable Hand Detection (for auto-share)
// ============================================
function isNotableHand(handResult, winnerName, totalPot, bigBlind, bigBet) {
    // Trigger 1: pot >= 50 BB OR pot >= 25 big bets
    const bbThreshold = (bigBlind || 100) * 50;
    const bigBetThreshold = (bigBet || (bigBlind || 100) * 2) * 25;
    const bigPot = totalPot >= bbThreshold || totalPot >= bigBetThreshold;
    // Trigger 2: strong hand rank (royal flush, straight flush, 4 of a kind)
    let strongHand = false;
    let handRank = '';
    try {
        const winner = (handResult.players || []).find(p => p.name === winnerName);
        if (winner && winner.cards && winner.cards.length > 0) {
            const evalCards = winner.cards.map(c => ({ rank: c.rank, suit: c.suit }));
            const cc = (handResult.communityCards || []).map(c => ({ rank: c.rank, suit: c.suit }));
            const allCards = [...evalCards, ...cc];
            if (allCards.length >= 5) {
                const result = bestHighHand(allCards);
                if (result && result.desc) {
                    handRank = result.desc;
                    const rankStr = handRank.toLowerCase();
                    if (rankStr.includes('royal') || rankStr.includes('straight flush') ||
                        rankStr.includes('four of a kind') || rankStr.includes('quads')) {
                        strongHand = true;
                    }
                }
            }
        }
    } catch (e) {}
    return { notable: bigPot || strongHand, handRank, reason: strongHand ? 'strong' : (bigPot ? 'bigpot' : '') };
}

// Build a compact replay object matching buildReplayURL in app.js, then
// compress with deflate-raw and base64url-encode so replay.html can consume it.
const zlib = require('zlib');
function buildReplayHash(handResult, handLogs) {
    try {
        if (!handResult) return '';
        const data = {
            g: handResult.gameName || '',
            t: handResult.gameType || '',
            c: handResult.communityCards || [],
            d: handResult.dealerSeat,
            p: (handResult.players || []).map(p => ({
                n: p.name, o: p.position,
                f: p.folded ? 1 : 0,
                c: p.chips, s: p.startChips,
                h: p.cards || [],
                u: p.upCards || [],
                w: p.downCards || [],
            })),
            l: Array.isArray(handLogs) ? handLogs : [],
            ds: handResult.drawSnapshots || [],
        };
        const json = JSON.stringify(data);
        // deflate-raw (no zlib wrapper) to match client CompressionStream('deflate-raw')
        const buf = zlib.deflateRawSync(Buffer.from(json, 'utf8'));
        // base64url
        return buf.toString('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
        console.warn('buildReplayHash failed:', e && e.message);
        return '';
    }
}

function autoSharePokerHand(winnerName, handResult, totalPot, handRank, reason, gameName, handLogs) {
    // Find winner's avatar
    let authorAvatar = null;
    for (const [, c] of clients) {
        if (c.name === winnerName) { authorAvatar = c.avatar || null; break; }
    }
    const winnerP = (handResult.players || []).find(p => p.name === winnerName);
    const reasonLabel = reason === 'strong' ? '🎉 強力なハンド達成' : '💰 大きなポット獲得';
    const title = `${reasonLabel}: ${handRank || 'ポットを獲得'}`;
    const bodyLines = [
        `${gameName || 'ポーカー'} にて ${handRank || '勝利'}！`,
        `ポット: ${totalPot.toLocaleString()} チップ`,
        ''
    ];
    const replayHash = buildReplayHash(handResult, handLogs);
    const post = createPost({
        authorName: winnerName,
        authorAvatar,
        type: 'hand',
        title,
        body: bodyLines.join('\n'),
        handData: {
            gameName,
            handRank,
            pot: totalPot,
            winnerCards: winnerP ? winnerP.cards : [],
            communityCards: handResult.communityCards || []
        },
        replayHash,
        autoShared: true
    });
    broadcastTimelineUpdate(post);
    // Notify the winner with auto-share alert (so they can add a comment)
    for (const [ws, c] of clients) {
        if (c.name === winnerName) {
            send(ws, { type: 'auto_shared', post });
        }
    }
}

// ============================================
// Account System (Supabase + password hashing)
// ============================================
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

if (!supabase) console.warn('Supabase not configured. Account registration/login will not persist.');

function hashPassword(password, salt) {
    if (!salt) salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

// ============================================
// Auth Handlers (async for Supabase)
// ============================================
async function handleRegister(ws, client, msg) {
    const email = (msg.email || '').trim().toLowerCase();
    const name = (msg.name || '').trim().slice(0, 20);
    const password = msg.password || '';

    if (!email || !name || password.length < 4) {
        send(ws, { type: 'auth_result', success: false, message: '入力内容を確認してください' });
        return;
    }

    if (!supabase) {
        send(ws, { type: 'auth_result', success: false, message: 'データベース未設定です' });
        return;
    }

    try {
        // Check if email already exists
        const { data: existing } = await supabase.from('accounts').select('email').eq('email', email).limit(1);
        if (existing && existing.length > 0) {
            send(ws, { type: 'auth_result', success: false, message: 'このメールアドレスは既に登録されています' });
            return;
        }

        const { hash, salt } = hashPassword(password);
        const { error } = await supabase.from('accounts').insert({
            email, name, password_hash: hash, salt
        });

        if (error) {
            console.error('Register error:', error.message);
            send(ws, { type: 'auth_result', success: false, message: '登録に失敗しました' });
            return;
        }

        client.name = name;
        client.email = email;
        client.authenticated = true;
        console.log(`Register: ${name} (${email})`);
        send(ws, { type: 'auth_result', success: true, name, email });
    } catch (e) {
        console.error('Register error:', e.message);
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

    if (!supabase) {
        send(ws, { type: 'auth_result', success: false, message: 'データベース未設定です' });
        return;
    }

    try {
        const { data, error } = await supabase.from('accounts').select('*').eq('email', email).limit(1);

        if (error || !data || data.length === 0) {
            send(ws, { type: 'auth_result', success: false, message: 'メールアドレスまたはパスワードが正しくありません' });
            return;
        }

        const account = data[0];
        const { hash } = hashPassword(password, account.salt);

        if (hash !== account.password_hash) {
            send(ws, { type: 'auth_result', success: false, message: 'メールアドレスまたはパスワードが正しくありません' });
            return;
        }

        client.name = account.name;
        client.email = email;
        client.authenticated = true;
        console.log(`Login: ${account.name} (${email})`);
        send(ws, { type: 'auth_result', success: true, name: account.name, email });
    } catch (e) {
        console.error('Login error:', e.message);
        send(ws, { type: 'auth_result', success: false, message: 'エラーが発生しました' });
    }
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
        id: r.id, hostName: r.members[0]?.name || '???',
        hostAvatar: r.members[0]?.avatar || null,
        playerCount: r.members.length, playing: r.playing,
        gameName: r.game?.gameConfig?.name || '',
        mergedGames: r.getMergedGames(),
        locked: r.locked,
        pendingCount: r.pendingJoins.length
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
    // Send personalized online_users with my following list
    for (const [ws, c] of clients) {
        const myFollowing = c.name ? getFollowing(c.name) : [];
        send(ws, { type: 'online_users', users, following: myFollowing });
    }
}

function sendFollows(ws, client) {
    if (!client.name) return;
    send(ws, {
        type: 'follows',
        following: getFollowing(client.name),
        followers: getFollowers(client.name)
    });
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
            if (msg.avatar && typeof msg.avatar === 'string') client.avatar = msg.avatar.slice(0, 30);
            client.isGuest = !!msg.isGuest;
            send(ws, { type: 'name_set', name: client.name });
            broadcastOnlineUsers();
            sendFollows(ws, client);
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
                    delete room.disconnectedPlayers[client.name];
                    room.members.push({ clientId: client.id, name: client.name, avatar: client.avatar, ws });
                    client.roomId = roomId;
                    if (!client.roomIds.includes(roomId)) client.roomIds.push(roomId);
                    room.seatMap[client.id] = seat;
                    room.game.players[seat].connected = true;
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
            if (client.roomIds.includes(msg.roomId)) { send(ws, { type: 'error', message: 'すでに参加しています' }); return; }
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
            if (!room || !room.game || !room.game.running) break;
            const seat = room.seatMap[client.id];
            if (seat === undefined) break;
            if (room.sitout && room.sitout[seat]) break; // already sitting out
            if (room.pendingSitoutRequest && room.pendingSitoutRequest[seat]) break; // already reserved

            const player = room.game.players[seat];
            const alreadyFolded = player && player.folded;

            if (alreadyFolded) {
                // Player is already out of the hand — apply sitout immediately.
                if (!room.sitout) room.sitout = {};
                if (!room.sitoutTime) room.sitoutTime = {};
                room.sitout[seat] = true;
                room.sitoutTime[seat] = Date.now();
                broadcastLog(room, `${client.name} が離席しました`, 'important');
            } else {
                // Reserve sitout for after the current hand ends.
                if (!room.pendingSitoutRequest) room.pendingSitoutRequest = {};
                room.pendingSitoutRequest[seat] = true;
                broadcastLog(room, `${client.name} が離席予約しました（ハンド終了後に適用）`, 'important');
            }
            broadcastGameState(room);
            // Auto-close only applies when sitout is actually set (not pending),
            // so this is a no-op during reservation but useful for the folded case.
            maybeAutoCloseRoom(room);
            break;
        }

        case 'chat': {
            // In-game chat only (room / zoom). Lobby chat has been removed.
            const text = (msg.message || '').slice(0, 200);
            const chatRoomId = msg.roomId || client.roomId;
            if (!chatRoomId) break; // no lobby fallback
            const room = rooms.get(chatRoomId);
            if (room) {
                broadcastToRoom(room, { type: 'chat', from: client.name, message: text });
            }
            break;
        }

        case 'follow': {
            if (client.isGuest) { send(ws, { type: 'error', message: 'ゲストアカウントではフォローできません' }); break; }
            if (!client.name) break;
            const target = (msg.target || '').trim();
            if (!target || target === client.name) break;
            // Verify target is a real (non-guest) account by checking online clients
            // Allow following anyone known (online or offline) — relax check for v1
            if (!followsMap.has(client.name)) followsMap.set(client.name, new Set());
            followsMap.get(client.name).add(target);
            saveFollowsDebounced();
            sendFollows(ws, client);
            // Notify target if online
            for (const [tws, tc] of clients) {
                if (tc.name === target) {
                    send(tws, { type: 'followed_by', name: client.name });
                    sendFollows(tws, tc);
                }
            }
            broadcastOnlineUsers();
            break;
        }

        case 'unfollow': {
            if (!client.name) break;
            const target = (msg.target || '').trim();
            if (!target) break;
            const set = followsMap.get(client.name);
            if (set) {
                set.delete(target);
                if (set.size === 0) followsMap.delete(client.name);
                saveFollowsDebounced();
            }
            sendFollows(ws, client);
            // Update target's followers list if online
            for (const [tws, tc] of clients) {
                if (tc.name === target) sendFollows(tws, tc);
            }
            broadcastOnlineUsers();
            break;
        }

        case 'get_follows': {
            sendFollows(ws, client);
            break;
        }

        case 'get_timeline': {
            if (!client.name) break;
            const posts = getTimelineForUser(client.name);
            send(ws, { type: 'timeline', posts });
            break;
        }

        case 'create_post': {
            if (client.isGuest) { send(ws, { type: 'error', message: 'ゲストアカウントでは投稿できません' }); break; }
            if (!client.name) break;
            const title = (msg.title || '').trim();
            const body = (msg.body || '').trim();
            const mood = (msg.mood || '').trim();
            if (!body && !title) break;
            const post = createPost({
                authorName: client.name,
                authorAvatar: client.avatar,
                type: 'diary',
                title, body, mood,
                autoShared: false
            });
            broadcastTimelineUpdate(post);
            send(ws, { type: 'post_created', post });
            break;
        }

        case 'post_hand': {
            // Manual post of a hand from user's hand history (win or loss)
            if (!client.name) break;
            const caption = typeof msg.caption === 'string' ? msg.caption.trim().slice(0, 500) : '';
            // replayHash is a pre-compressed base64url string produced by the client.
            // Size cap: ~8 KB (generous for compressed JSON ~500b–1.5KB typical).
            const rawReplayHash = typeof msg.replayHash === 'string' ? msg.replayHash.slice(0, 8192) : '';
            const replayHash = /^[A-Za-z0-9\-_]*$/.test(rawReplayHash) ? rawReplayHash : '';
            const raw = msg.handData || {};
            // Basic validation/sanitization
            const sanitizeCard = (c) => {
                if (!c || typeof c !== 'object') return null;
                const rank = typeof c.rank === 'string' ? c.rank.slice(0, 3) : (typeof c.r === 'string' ? c.r.slice(0, 3) : '');
                const suit = typeof c.suit === 'string' ? c.suit.slice(0, 2) : (typeof c.s === 'string' ? c.s.slice(0, 2) : '');
                if (!rank || !suit) return null;
                return { rank, suit };
            };
            const clampCards = (arr, max) => {
                if (!Array.isArray(arr)) return [];
                return arr.slice(0, max).map(sanitizeCard).filter(Boolean);
            };
            const handData = {
                gameName: typeof raw.gameName === 'string' ? raw.gameName.slice(0, 40) : 'ポーカー',
                handRank: typeof raw.handRank === 'string' ? raw.handRank.slice(0, 60) : '',
                pot: Math.max(-1e9, Math.min(1e9, Number(raw.pot) || 0)),
                bigBlind: Math.max(1, Math.min(1e7, Number(raw.bigBlind) || 100)),
                winnerCards: clampCards(raw.winnerCards || raw.myCards, 10),
                communityCards: clampCards(raw.communityCards, 10),
                result: raw.result === 'loss' ? 'loss' : 'win',
            };
            const reasonLabel = handData.result === 'loss' ? '📝 ハンド共有（敗北）' : '📝 ハンド共有';
            const title = handData.handRank ? `${reasonLabel}: ${handData.handRank}` : reasonLabel;
            const post = createPost({
                authorName: client.name,
                authorAvatar: client.avatar,
                type: 'hand',
                title,
                body: caption,
                handData,
                replayHash,
                autoShared: false,
                manualShared: true
            });
            broadcastTimelineUpdate(post);
            send(ws, { type: 'post_created', post });
            break;
        }

        case 'add_comment': {
            // Timeline is shared with everyone (including guests); comments are too.
            if (!client.name) break;
            const postId = Number(msg.postId);
            const body = (msg.body || '').trim();
            if (!postId || !body) break;
            // Optional parentCommentId for replies (flattened: a reply to a reply still
            // targets the top-level comment of the thread).
            let parentCommentId = null;
            if (msg.parentCommentId != null) {
                const pid = Number(msg.parentCommentId);
                const post = timelineList.find(p => p.id === postId);
                if (post) {
                    const parent = (post.comments || []).find(c => c.id === pid);
                    if (parent) {
                        // Normalize: reply-to-reply gets re-parented to the thread root
                        parentCommentId = parent.parentCommentId != null ? parent.parentCommentId : parent.id;
                    }
                }
            }
            // Extract @mentions from body for display/validation
            const mentions = [];
            const mentionRe = /@([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)/g;
            let m;
            while ((m = mentionRe.exec(body)) !== null) {
                if (mentions.length >= 10) break;
                if (!mentions.includes(m[1])) mentions.push(m[1]);
            }
            const result = addCommentToPost(postId, {
                authorName: client.name,
                authorAvatar: client.avatar,
                body,
                parentCommentId,
                mentions
            });
            if (result) {
                broadcastCommentUpdate(postId, result.comment, result.post.authorName);
            }
            break;
        }

        case 'like_post': {
            if (!client.name) break;
            const postId = Number(msg.postId);
            if (!postId) break;
            const result = togglePostLike(postId, client.name);
            if (result) broadcastPostLike(result.post, client.name, result.likedNow);
            break;
        }

        case 'like_comment': {
            if (!client.name) break;
            const postId = Number(msg.postId);
            const commentId = Number(msg.commentId);
            if (!postId || !commentId) break;
            const result = toggleCommentLike(postId, commentId, client.name);
            if (result) broadcastCommentLike(result.post, result.comment, client.name, result.likedNow);
            break;
        }

        case 'get_rankings': {
            if (!client.name) break;
            const period = (msg.period === 'weekly') ? 'weekly' : 'all';
            const posts = getRankings(period);
            send(ws, { type: 'rankings', period, posts });
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
                following: getFollowing(target),
                followers: getFollowers(target),
                posts: timelineList.filter(p => p.authorName === target).slice(0, 20)
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
    }
}

// ============================================
// Room activity / auto-close helpers
// ============================================
// Returns true if the room has at least one member who is NOT on sitout.
// Members without an assigned seat (pre-game lobby) are always considered active.
function hasActiveMemberInRoom(room) {
    if (!room || !room.members || room.members.length === 0) return false;
    for (const m of room.members) {
        const seat = room.seatMap ? room.seatMap[m.clientId] : undefined;
        if (seat === undefined) return true;           // pre-game / unassigned
        if (!room.sitout || !room.sitout[seat]) return true;
    }
    return false;
}

// Build a session summary for a room at close time.
// Returns null if no hands were played (e.g. game never started).
function buildSessionSummary(room) {
    if (!room || !room.handsPlayed) return null;
    const startingChips = (room.settings && room.settings.startingChips) || 10000;
    const gameName = (room.game && room.game.gameConfig && room.game.gameConfig.name) || 'ポーカー';
    const rebuys = room.totalRebuys || {};
    const participants = room.sessionParticipants || {};
    // Collect final chip totals. Primary source: game.players (still seated).
    // For players who left mid-session we rely on participants but can't know their final chips,
    // so they're recorded as "退室" with invested only (diff = -invested relative to their stake left on the table).
    const finalByName = {};
    if (room.game && room.game.players) {
        for (const p of room.game.players) {
            if (p.name) finalByName[p.name] = p.chips;
        }
    }
    const players = [];
    for (const name of Object.keys(participants)) {
        const rebuyAmount = rebuys[name] || 0;
        const invested = startingChips + rebuyAmount;      // 10,000 + 補充総額
        const endChips = (name in finalByName) ? finalByName[name] : 0;
        // diff は「プレイ中の純損益」= 最終チップ − 投入総額
        // 補充分は「投資」として差し引かれるので、表示される損益は純粋に
        // ゲーム内での勝ち負けを表します。
        const diff = endChips - invested;
        players.push({
            name,
            avatar: (participants[name] && participants[name].avatar) || null,
            startingChips,                                  // 10,000
            rebuyAmount,                                    // 補充総額
            invested,                                       // 投入総額 = startingChips + rebuyAmount
            endChips,                                       // 最終チップ
            diff,                                           // 純損益
            leftEarly: !(name in finalByName),
        });
    }
    // Sort: biggest winners first, biggest losers last
    players.sort((a, b) => b.diff - a.diff);
    return {
        tableId: room.id,
        gameName,
        handsPlayed: room.handsPlayed || 0,
        durationMs: room.sessionStart ? Date.now() - room.sessionStart : 0,
        players,
    };
}

// Create a session-summary post on the timeline and broadcast it.
function postSessionSummary(room, reason) {
    const summary = buildSessionSummary(room);
    if (!summary || !summary.players || summary.players.length === 0) return;
    // Pick the winner as author (the biggest positive diff). If none positive,
    // use the top of the sorted list (smallest loss).
    const top = summary.players[0];
    const post = createPost({
        authorName: top.name,
        authorAvatar: top.avatar || null,
        type: 'session',
        title: `テーブル ${room.id} セッション終了`,
        body: '',
        sessionData: summary,
        autoShared: true,
    });
    broadcastTimelineUpdate(post);
}

// Delete a room: clear timers, evict remaining members, remove from map,
// broadcast lobby update. Also posts the session summary to the timeline if
// at least one hand was played.
function deleteRoomAndEvict(room, reason) {
    if (!room) return;
    // Post session summary before tearing down so buildSessionSummary sees room state.
    try { postSessionSummary(room, reason); } catch (e) { console.warn('postSessionSummary failed:', e && e.message); }
    if (room.pending) { try { clearTimeout(room.pending.timer); } catch {} room.pending = null; }
    // Notify + detach any remaining members (sitout players stay in room until this runs)
    for (const m of [...(room.members || [])]) {
        try { send(m.ws, { type: 'room_left', roomId: room.id, reason: reason || 'closed' }); } catch {}
        const c = clients.get(m.ws);
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

// Auto-close a room if nobody is actively playing (all members gone or all on sitout).
// Skipped mid-hand — the onHandEnd hook re-runs this check on the next tick.
function maybeAutoCloseRoom(room) {
    if (!room || !rooms.has(room.id)) return false;
    // Completely empty → delete
    if (!room.members || room.members.length === 0) {
        deleteRoomAndEvict(room, 'empty');
        return true;
    }
    // Don't interrupt an in-progress hand; onHandEnd will re-evaluate.
    if (room.playing && room.game && room.game.running && !room.game.gameOver) {
        return false;
    }
    if (!hasActiveMemberInRoom(room)) {
        try { broadcastLog(room, '参加者全員が離席したためテーブルを閉じます', 'important'); } catch {}
        deleteRoomAndEvict(room, 'all_sitout');
        return true;
    }
    return false;
}

// ============================================
// Leave Room
// ============================================
function leaveRoom(client, targetRoomId) {
    const rid = targetRoomId || client.roomId;
    const room = rooms.get(rid);
    if (!room) { return; }

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
    }
    // Auto-close if empty or every remaining member is on sitout; otherwise just notify.
    if (!maybeAutoCloseRoom(room) && room.members.length > 0) {
        broadcastRoomUpdate(room);
    }
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
                room.game.players[seat].connected = false;
                room.game.players[seat].folded = true;
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
                room.members = room.members.filter(m => m.clientId !== client.id);
                delete room.seatMap[client.id];
                broadcastLog(room, `${client.name} が切断されました`, 'dim');
                broadcastGameState(room);
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
                    // Disconnect the player's ws
                    const member = room.getClientBySeat(seat);
                    if (member && member.ws) {
                        send(member.ws, { type: 'auto_kicked' });
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

        // Auto-share notable hand to SNS timeline
        if (winnerName) {
            const bigBetVal = (gc && gc.bigBet) || bigBlind * 2;
            const notable = isNotableHand(handResult, winnerName, totalPot, bigBlind, bigBetVal);
            if (notable.notable) {
                autoSharePokerHand(winnerName, handResult, totalPot, notable.handRank, notable.reason, gc.name, room.currentHandLogs || []);
            }
        }

        // Close the table if every remaining member is on sitout (checked on next
        // tick so the hand's result broadcast settles first).
        // After the hand's result broadcast settles, apply any pending
        // sitout/leave reservations, then evaluate auto-close.
        setTimeout(() => {
            applyPendingReservations(room);
            maybeAutoCloseRoom(room);
        }, 50);
    };

    room.game = game;
    room.playing = true;
    // Session tracking (for session summary when room closes)
    if (!room.sessionStart) room.sessionStart = Date.now();
    if (room.handsPlayed == null) room.handsPlayed = 0;
    // Snapshot initial participants (name → avatar) so we can show avatars even
    // if a player leaves before the session ends.
    if (!room.sessionParticipants) room.sessionParticipants = {};
    for (const m of room.members) {
        if (m.name && !room.sessionParticipants[m.name]) {
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

        // Check connected players
        const connected = game.players.filter(p => p.connected && p.chips > 0);
        if (connected.length <= 1) {
            game.gameOver = true;
        }
    }

    // Game over
    room.playing = false;
    room.disconnectedPlayers = {};

    // Now that game ended, transfer host if original host left during play
    if (!room.members.find(m => m.clientId === room.hostId) && room.members.length > 0) {
        room.hostId = room.members[0].clientId;
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

        // Auto-share notable hand to SNS timeline (Zoom)
        if (winnerName) {
            const bigBetVal = (gc && gc.bigBet) || bigBlind * 2;
            const notable = isNotableHand(handResult, winnerName, totalPot, bigBlind, bigBetVal);
            if (notable.notable) {
                autoSharePokerHand(winnerName, handResult, totalPot, notable.handRank, notable.reason, gc.name, table.currentHandLogs || []);
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
