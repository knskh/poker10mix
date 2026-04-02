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
// Google Token Verification
// ============================================
const https = require('https');

function verifyGoogleToken(token) {
    // Decode JWT payload (base64url)
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        // Check audience matches our client ID
        if (payload.aud !== GOOGLE_CLIENT_ID) return null;
        // Check issuer
        if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') return null;
        // Check expiration
        if (payload.exp * 1000 < Date.now()) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

// Async full verification via Google's tokeninfo endpoint (called in background)
function verifyGoogleTokenAsync(token) {
    return new Promise((resolve) => {
        https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const info = JSON.parse(data);
                    if (info.aud === GOOGLE_CLIENT_ID) resolve(info);
                    else resolve(null);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ============================================
// HTTP Server
// ============================================
const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const httpServer = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';

    // Inject Google Client ID into index.html
    if (url === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, 'utf8', (err, html) => {
            if (err) { res.writeHead(404); res.end('Not found'); return; }
            const inject = `<script>window.GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}";</script>`;
            html = html.replace('</head>', inject + '\n</head>');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });
        return;
    }

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
        send(ws, { type: 'room_list', rooms: list });
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
        const raw = room.stats.getPlayer(i).total;
        const calc = room.stats.calc(raw);
        playerStats[room.game.players[i].name] = calc;
    }
    broadcastToRoom(room, { type: 'stats_update', stats: playerStats });
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
    const client = { id: clientId, name: 'Player' + clientId, roomId: null, ws };
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

        case 'google_auth': {
            // Verify Google JWT token
            if (!GOOGLE_CLIENT_ID || !msg.token) break;
            try {
                const payload = verifyGoogleToken(msg.token);
                if (payload) {
                    client.googleId = payload.sub;
                    client.name = (payload.name || '').slice(0, 20) || 'Player' + client.id;
                    client.email = payload.email;
                    client.authenticated = true;
                    send(ws, { type: 'name_set', name: client.name });
                    console.log(`Google auth: ${client.name} (${client.email})`);
                }
            } catch (e) {
                console.error('Google auth error:', e.message);
            }
            break;
        }

        case 'create_room': {
            if (client.roomId) leaveRoom(client);
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
            if (room.settings.selectedGames.length < 2) { send(ws, { type: 'error', message: '2つ以上のゲームを選択してください' }); return; }
            if (room.playing) return;
            startGame(room);
            break;
        }

        case 'action': {
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
            send(member.ws, { type: 'your_turn', actions, timeLimit: 45 });

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
    game.onHandStart = () => room.stats.beginHand(game.players, game.gameConfig);
    game.onFirstRoundEnd = () => room.stats.endFirstRound();
    game.onPlayerAction = (player, action, isBlinds) => room.stats.recordAction(player, action, isBlinds);
    game.onShowdown = (winnerIds) => room.stats.recordShowdown(winnerIds);
    game.onHandEnd = (hadShowdown) => {
        room.stats.endHand(game.players, hadShowdown);
        // Send stats to all clients after each hand for local storage
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
// Start Server
// ============================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Poker server: http://localhost:${PORT}`);
});
