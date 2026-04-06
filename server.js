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
        this.settings = {
            selectedGames: GAME_LIST.map((_, i) => i),
            startingChips: 10000,
        };
        this.game = null;
        this.playing = false;
        this.pending = null; // { type, playerId, resolve, timer }
        this.seatMap = {};   // clientId -> seatIndex
        this.stats = new StatsTracker();
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
            members: this.members.map(m => ({ clientId: m.clientId, name: m.name })),
            settings: this.settings,
            playing: this.playing,
            playerCount: this.members.length,
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
    for (const m of room.members) send(m.ws, data);
}

function broadcastRoomList() {
    const list = [...rooms.values()].map(r => ({
        id: r.id, hostName: r.members[0]?.name || '???',
        playerCount: r.members.length, playing: r.playing,
    }));
    for (const [ws] of clients) {
        send(ws, { type: 'room_list', rooms: list, zoomCount: zoomPlayers.size });
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
        playerStats[room.game.players[i].name] = { ...calc, byGame, byPosition: byPos };
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
            return {
                id: p.id, name: p.name, chips: p.chips,
                folded: p.folded, allIn: p.allIn,
                seatBet: p.seatBet, lastAction: p.lastAction,
                connected: p.connected,
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
    };
}

function broadcastGameState(room) {
    if (!room.game) return;
    for (const m of room.members) {
        const seat = room.seatMap[m.clientId];
        if (seat !== undefined) {
            send(m.ws, { type: 'game_state', state: getStateForPlayer(room.game, room, seat) });
        }
    }
}

// ============================================
// WebSocket Connection
// ============================================
wss.on('connection', (ws) => {
    const clientId = nextClientId++;
    const client = { id: clientId, name: 'Player' + clientId, roomId: null, inZoom: false, ws };
    clients.set(ws, client);

    send(ws, { type: 'welcome', clientId });
    broadcastRoomList();

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
        handleMessage(ws, client, msg);
    });

    ws.on('close', () => {
        handleDisconnect(client);
        clients.delete(ws);
        broadcastRoomList();
    });
});

// ============================================
// Message Handlers
// ============================================
function handleMessage(ws, client, msg) {
    switch (msg.type) {
        case 'set_name':
            client.name = (msg.name || '').trim().slice(0, 20) || 'Player' + client.id;
            send(ws, { type: 'name_set', name: client.name });
            if (client.roomId) {
                const room = rooms.get(client.roomId);
                if (room) {
                    const m = room.getMember(client.id);
                    if (m) m.name = client.name;
                    broadcastRoomUpdate(room);
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
            if (client.roomId) leaveRoom(client);
            if (client.inZoom) leaveZoom(client);
            const roomId = generateRoomId();
            const room = new Room(roomId, client.id, client.name);
            room.members.push({ clientId: client.id, name: client.name, ws });
            rooms.set(roomId, room);
            client.roomId = roomId;
            send(ws, { type: 'room_joined', room: room.toJSON() });
            broadcastRoomList();
            break;
        }

        case 'join_room': {
            if (client.roomId) leaveRoom(client);
            const room = rooms.get(msg.roomId);
            if (!room) { send(ws, { type: 'error', message: 'ルームが見つかりません' }); return; }
            if (room.playing) { send(ws, { type: 'error', message: 'ゲーム進行中です' }); return; }
            if (room.members.length >= 6) { send(ws, { type: 'error', message: 'ルームが満員です' }); return; }
            room.members.push({ clientId: client.id, name: client.name, ws });
            client.roomId = room.id;
            send(ws, { type: 'room_joined', room: room.toJSON() });
            broadcastRoomUpdate(room);
            broadcastRoomList();
            break;
        }

        case 'leave_room':
            leaveRoom(client);
            send(ws, { type: 'room_left' });
            broadcastRoomList();
            break;

        case 'update_settings': {
            const room = rooms.get(client.roomId);
            if (!room || room.hostId !== client.id || room.playing) return;
            if (msg.settings) {
                if (msg.settings.selectedGames) room.settings.selectedGames = msg.settings.selectedGames;
                if (msg.settings.startingChips) room.settings.startingChips = msg.settings.startingChips;
            }
            broadcastRoomUpdate(room);
            break;
        }

        case 'start_game': {
            const room = rooms.get(client.roomId);
            if (!room || room.hostId !== client.id) return;
            if (room.members.length < 2) { send(ws, { type: 'error', message: '2人以上必要です' }); return; }
            if (room.settings.selectedGames.length < 1) { send(ws, { type: 'error', message: '1つ以上のゲームを選択してください' }); return; }
            if (room.playing) return;
            startGame(room);
            break;
        }

        case 'action': {
            if (client.inZoom) { handleZoomAction(client, msg); break; }
            const room = rooms.get(client.roomId);
            if (!room || !room.pending) return;
            const seat = room.seatMap[client.id];
            if (room.pending.type !== 'action' || room.pending.playerId !== seat) return;
            clearTimeout(room.pending.timer);
            const p = room.pending;
            room.pending = null;
            p.resolve(msg.action);
            break;
        }

        case 'draw': {
            if (client.inZoom) { handleZoomDraw(client, msg); break; }
            const room = rooms.get(client.roomId);
            if (!room || !room.pending) return;
            const seat = room.seatMap[client.id];
            if (room.pending.type !== 'draw' || room.pending.playerId !== seat) return;
            clearTimeout(room.pending.timer);
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

        case 'chat': {
            const room = rooms.get(client.roomId);
            if (!room) return;
            broadcastToRoom(room, { type: 'chat', from: client.name, message: (msg.message || '').slice(0, 200) });
            break;
        }

        case 'get_stats': {
            const room = rooms.get(client.roomId);
            if (!room || !room.stats) return;
            const seat = room.seatMap[client.id];
            const allStats = {};
            for (let i = 0; i < (room.game ? room.game.playerCount : room.members.length); i++) {
                const raw = room.stats.getPlayer(i).total;
                allStats[i] = room.stats.calc(raw);
                allStats[i].raw = raw;
            }
            send(ws, { type: 'stats_data', stats: allStats, mySeat: seat });
            break;
        }

        case 'get_rooms':
            broadcastRoomList();
            break;
    }
}

// ============================================
// Leave Room
// ============================================
function leaveRoom(client) {
    const room = rooms.get(client.roomId);
    if (!room) { client.roomId = null; return; }

    room.members = room.members.filter(m => m.clientId !== client.id);
    client.roomId = null;

    // Mark player as disconnected in active game
    if (room.playing) {
        const seat = room.seatMap[client.id];
        if (seat !== undefined && room.game) {
            room.game.players[seat].connected = false;
            room.game.players[seat].folded = true;
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

    if (room.members.length === 0) {
        // Clean up empty room
        if (room.pending) clearTimeout(room.pending.timer);
        rooms.delete(room.id);
    } else {
        // Transfer host if needed
        if (room.hostId === client.id) {
            room.hostId = room.members[0].clientId;
        }
        broadcastRoomUpdate(room);
    }
}

function handleDisconnect(client) {
    if (client.inZoom) leaveZoom(client);
    if (client.roomId) leaveRoom(client);
}

// ============================================
// Start Game
// ============================================
function startGame(room) {
    const names = room.members.map(m => m.name);
    const filteredGames = room.settings.selectedGames.map(i => GAME_LIST[i]);

    const game = new GameState(names, room.settings.startingChips);
    game.filteredGames = filteredGames;
    game.delay = (ms) => new Promise(r => setTimeout(r, Math.min(ms, 800)));

    // Seat map: member index = seat index
    room.seatMap = {};
    room.members.forEach((m, i) => { room.seatMap[m.clientId] = i; });

    // Stats
    room.stats = new StatsTracker();

    // Callbacks
    game.onUpdate = () => broadcastGameState(room);
    game.onLog = (msg, cls) => broadcastLog(room, msg, cls);

    game.onGetPlayerAction = (actions, player) => {
        return new Promise((resolve) => {
            const seatIdx = player.id;
            const member = room.getClientBySeat(seatIdx);

            broadcastGameState(room);

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
            });

            // Timer: 45 seconds
            const timer = setTimeout(() => {
                room.pending = null;
                const auto = actions.find(a => a.type === 'check') || actions.find(a => a.type === 'fold') || actions[0];
                broadcastLog(room, `${player.name}: タイムアウト`, 'action');
                resolve(auto);
            }, 45000);

            room.pending = { type: 'action', playerId: seatIdx, resolve, timer };
        });
    };

    game.onGetPlayerDraw = (player) => {
        return new Promise((resolve) => {
            const seatIdx = player.id;
            const member = room.getClientBySeat(seatIdx);

            broadcastGameState(room);

            if (!member || !member.ws || member.ws.readyState !== WebSocket.OPEN) {
                resolve([]); // Stand pat
                return;
            }

            send(member.ws, { type: 'your_draw', hand: player.hand, timeLimit: 45 });

            const timer = setTimeout(() => {
                room.pending = null;
                broadcastLog(room, `${player.name}: タイムアウト（スタンドパット）`, 'action');
                resolve([]);
            }, 45000);

            room.pending = { type: 'draw', playerId: seatIdx, resolve, timer };
        });
    };

    // Stats hooks
    game.onHandStart = () => {
        room.stats.beginHand(game.players, game.gameConfig, game.dealerSeat);
        broadcastToRoom(room, { type: 'hand_start' });
    };
    game.onFirstRoundEnd = () => room.stats.endFirstRound();
    game.onPlayerAction = (player, action, isBlinds) => room.stats.recordAction(player, action, isBlinds);
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
    };

    room.game = game;
    room.playing = true;

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
    broadcastGameState(room);

    const winner = game.players.filter(p => p.chips > 0);
    const winnerName = winner.length > 0 ? winner[0].name : '???';
    broadcastToRoom(room, {
        type: 'game_over',
        winner: winnerName,
        finalChips: game.players.map(p => ({ name: p.name, chips: p.chips })),
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
    zoomPlayers.set(client.id, { name: client.name, ws, tableId: null });
    send(ws, { type: 'zoom_joined' });
    addToZoomPool(client.id);
    broadcastRoomList();
}

function handleLeaveZoom(ws, client) {
    if (!client.inZoom) return;
    leaveZoom(client);
    send(ws, { type: 'zoom_left' });
    broadcastRoomList();
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

    zoomPool.push({ clientId, name: pd.name, ws: pd.ws });
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
    game.onLog = (msg, cls) => {
        for (const m of table.members) {
            if (table.activeMemberIds.has(m.clientId))
                send(m.ws, { type: 'log', message: msg, cls });
        }
    };
    game.onHandStart = () => stats.beginHand(game.players, game.gameConfig, game.dealerSeat);
    game.onFirstRoundEnd = () => stats.endFirstRound();
    game.onPlayerAction = (player, action, isBlinds) => stats.recordAction(player, action, isBlinds);
    game.onShowdown = (winnerIds) => stats.recordShowdown(winnerIds);
    game.onHandEnd = (hadShowdown) => {
        const gc = game.gameConfig;
        const activeCount = game.players.filter(p => p.name).length;
        const handResult = {
            type: 'hand_result',
            gameName: gc.name, gameId: gc.id, gameType: gc.type,
            communityCards: game.communityCards || [],
            dealerSeat: game.dealerSeat,
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
    };

    game.onGetPlayerAction = (actions, player) => {
        return new Promise((resolve) => {
            const seatIdx = player.id;
            const member = getZoomMemberBySeat(table, seatIdx);

            broadcastZoomTableState(table);

            if (!member || !member.ws || member.ws.readyState !== WebSocket.OPEN
                || !table.activeMemberIds.has(member.clientId)) {
                const auto = actions.find(a => a.type === 'check')
                          || actions.find(a => a.type === 'fold') || actions[0];
                resolve(auto);
                return;
            }

            const timeLimit = table.game.isFirstRound ? 45 : 30;
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
        playerStats[table.game.players[i].name] = { ...calc, byGame, byPosition: byPos };
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
            const state = getStateForPlayer(table.game, {}, seat);
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
