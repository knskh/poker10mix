// js/app.js - Multiplayer Application Controller
const client = new PokerClient();
const ui = new PokerUI();

// ==========================================
// Sound System (Web Audio API)
// ==========================================
const sound = (() => {
    let ctx = null;
    let enabled = localStorage.getItem('poker10mix_sound') !== 'off';

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        return ctx;
    }

    function playTone(freq, startTime, duration, gain = 0.35, type = 'sine') {
        const ac = getCtx();
        const osc = ac.createOscillator();
        const gainNode = ac.createGain();
        osc.connect(gainNode);
        gainNode.connect(ac.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gainNode.gain.setValueAtTime(gain, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    return {
        isEnabled: () => enabled,
        toggle() {
            enabled = !enabled;
            localStorage.setItem('poker10mix_sound', enabled ? 'on' : 'off');
            return enabled;
        },
        // 2-tone ascending chime: your turn to act
        yourTurn() {
            if (!enabled) return;
            try {
                const ac = getCtx();
                const t = ac.currentTime;
                playTone(880, t, 0.3);        // A5
                playTone(1318.5, t + 0.18, 0.5); // E6
            } catch (e) {}
        },
        // Single soft tone: draw phase
        yourDraw() {
            if (!enabled) return;
            try {
                const ac = getCtx();
                const t = ac.currentTime;
                playTone(660, t, 0.4, 0.25);  // E5
            } catch (e) {}
        },
    };
})();
let currentRoom = null;
let currentState = null;
let turnTimer = null;
let turnTimerStart = 0;
let turnTimeLimit = 45;
let loggedInAccount = null; // { name, email }
let isInZoom = false;
let currentTurnBB = 100; // bigBlind for current turn (for bb display in action buttons)
let handHistory = loadHandHistory(); // last 30 hands [{gameName, logs:[]}]
let currentHandLogs = []; // logs for current hand
let startingHandCards = []; // starting hand card objects captured at hand start
let cardSnapshots = []; // track card changes per round for stud/draw
let showdownPlayers = null; // opponent cards captured at showdown
let lastHandResult = null; // full hand result from server

function loadHandHistory() {
    try {
        const raw = localStorage.getItem('poker10mix_hand_history');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}
function persistHandHistory() {
    try { localStorage.setItem('poker10mix_hand_history', JSON.stringify(handHistory)); } catch (e) {}
}

// Save hand history on tab close/reload
window.addEventListener('beforeunload', () => {
    saveCurrentHand();
});

document.addEventListener('DOMContentLoaded', () => {
    setupLoginScreen();
    setupAccountLogin();
    setupLobbyScreen();
    setupRoomScreen();
    setupGameScreen();
    setupStatsModal();
    setupChat();

    client.connect();

    // Client events
    client.on('connected', () => {
        document.getElementById('connection-status').textContent = '';
        document.getElementById('connection-status').classList.add('hidden');
    });
    client.on('disconnected', () => {
        document.getElementById('connection-status').textContent = '接続中...';
        document.getElementById('connection-status').classList.remove('hidden');
    });
    client.on('room_list', renderRoomList);
    client.on('room_joined', onRoomJoined);
    client.on('room_updated', onRoomUpdated);
    client.on('room_left', () => showScreen('lobby'));
    client.on('game_started', onGameStarted);
    client.on('hand_start', onHandStart);
    client.on('game_state', onGameState);
    client.on('your_turn', onYourTurn);
    client.on('your_draw', onYourDraw);
    client.on('log', (d) => {
        ui.addLog(d.message, d.cls);
        currentHandLogs.push(d.message);
    });
    client.on('chat', onChat);
    client.on('lobby_chat', onLobbyChat);
    client.on('game_over', onGameOver);
    client.on('stats_data', renderStats);
    client.on('hand_result', onHandResult);
    client.on('stats_update', onStatsUpdate);
    client.on('auth_result', onAuthResult);
    client.on('zoom_joined', onZoomJoined);
    client.on('zoom_waiting', onZoomWaiting);
    client.on('zoom_left', onZoomLeft);
    client.on('zoom_sitout', onZoomSitout);
    client.on('error', (msg) => alert(msg));
});

// ==========================================
// Screen Management
// ==========================================
function showScreen(name) {
    ['login-screen', 'lobby-screen', 'room-screen', 'game-screen'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(name + '-screen').classList.remove('hidden');
    if (name === 'lobby') client.getRooms();
}

// ==========================================
// Login Screen
// ==========================================
function setupLoginScreen() {
    const input = document.getElementById('login-name');
    // Guest login
    document.getElementById('btn-enter').addEventListener('click', () => {
        const name = input.value.trim();
        if (!name || name.length < 1) { alert('名前を入力してください'); return; }
        loggedInAccount = null;
        client.setName(name);
        enterLobby(name);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-enter').click();
    });

    // Tab switching: Guest / Account
    document.getElementById('tab-guest').addEventListener('click', () => {
        document.getElementById('tab-guest').classList.add('active');
        document.getElementById('tab-account').classList.remove('active');
        document.getElementById('login-guest-form').classList.remove('hidden');
        document.getElementById('login-account-form').classList.add('hidden');
    });
    document.getElementById('tab-account').addEventListener('click', () => {
        document.getElementById('tab-account').classList.add('active');
        document.getElementById('tab-guest').classList.remove('active');
        document.getElementById('login-account-form').classList.remove('hidden');
        document.getElementById('login-guest-form').classList.add('hidden');
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
        // Guest account: clear hand history and stats on logout
        if (!loggedInAccount) {
            handHistory = [];
            persistHandHistory();
            localStorage.removeItem(STATS_STORAGE_KEY);
            localStorage.removeItem(RAW_STATS_KEY);
            localStorage.removeItem(RAW_ZOOM_STATS_KEY);
            localStorage.removeItem(STATS_HISTORY_KEY);
            lastSessionRaw = {};
        }
        loggedInAccount = null;
        showScreen('login');
    });
}

function enterLobby(displayName) {
    showScreen('lobby');
    const userEl = document.getElementById('lobby-username');
    userEl.textContent = displayName;
}

// ==========================================
// Account Login / Register
// ==========================================
let accountMode = 'login'; // 'login' or 'register'

function setupAccountLogin() {
    const nameInput = document.getElementById('account-name');
    const emailInput = document.getElementById('account-email');
    const passInput = document.getElementById('account-password');
    const submitBtn = document.getElementById('btn-account-submit');
    const errorEl = document.getElementById('login-error');

    // Login / Register tab switching
    document.getElementById('tab-login').addEventListener('click', () => {
        accountMode = 'login';
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('tab-register').classList.remove('active');
        nameInput.classList.add('hidden');
        submitBtn.textContent = 'ログイン';
        errorEl.classList.add('hidden');
    });
    document.getElementById('tab-register').addEventListener('click', () => {
        accountMode = 'register';
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
        nameInput.classList.remove('hidden');
        submitBtn.textContent = '新規登録';
        errorEl.classList.add('hidden');
    });

    // Default: login mode hides name field
    nameInput.classList.add('hidden');

    // Submit
    submitBtn.addEventListener('click', () => {
        const email = emailInput.value.trim();
        const password = passInput.value;
        const name = nameInput.value.trim();

        if (!email || !password) { showLoginError('メールアドレスとパスワードを入力してください'); return; }
        if (accountMode === 'register' && !name) { showLoginError('名前を入力してください'); return; }
        if (password.length < 4) { showLoginError('パスワードは4文字以上にしてください'); return; }

        errorEl.classList.add('hidden');
        submitBtn.disabled = true;
        submitBtn.textContent = '処理中...';

        if (accountMode === 'register') {
            client.send({ type: 'register', name, email, password });
        } else {
            client.send({ type: 'login', email, password });
        }
    });

    // Enter key
    passInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitBtn.click();
    });
}

function showLoginError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function onAuthResult(data) {
    const submitBtn = document.getElementById('btn-account-submit');
    submitBtn.disabled = false;
    submitBtn.textContent = accountMode === 'register' ? '新規登録' : 'ログイン';

    if (data.success) {
        loggedInAccount = { name: data.name, email: data.email };
        client.setName(data.name);
        enterLobby(data.name);
    } else {
        showLoginError(data.message || 'エラーが発生しました');
    }
}

// ==========================================
// Lobby Screen
// ==========================================
function setupLobbyScreen() {
    document.getElementById('btn-create-room').addEventListener('click', () => client.createRoom());
    document.getElementById('btn-join-zoom').addEventListener('click', () => {
        client.joinZoom();
    });
    document.getElementById('btn-join-by-id').addEventListener('click', () => {
        const id = document.getElementById('room-id-input').value.trim().toUpperCase();
        if (id.length === 4) client.joinRoom(id);
    });
    document.getElementById('room-id-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-join-by-id').click();
    });
    document.getElementById('btn-refresh-rooms').addEventListener('click', () => client.getRooms());

    // Ranking close button
    document.getElementById('btn-ranking-close').addEventListener('click', () => {
        document.getElementById('ranking-modal').classList.add('hidden');
    });

    // Hand history button
    document.getElementById('btn-lobby-history').addEventListener('click', () => {
        renderHandHistory('lobby-hand-history');
        document.getElementById('history-modal').classList.remove('hidden');
    });
    document.getElementById('btn-history-close').addEventListener('click', () => {
        document.getElementById('history-modal').classList.add('hidden');
    });
}

function renderRoomList(data) {
    const rooms = Array.isArray(data) ? data : (data.rooms || []);
    const zoomCount = data.zoomCount || 0;

    // Update zoom player count
    const zoomBtn = document.getElementById('btn-join-zoom');
    if (zoomBtn) zoomBtn.textContent = `Zoom卓に参加${zoomCount > 0 ? ' (' + zoomCount + '人)' : ''}`;

    const container = document.getElementById('room-list-body');
    container.innerHTML = '';
    if (!rooms || rooms.length === 0) {
        container.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim)">ルームがありません</td></tr>';
        return;
    }
    for (const r of rooms) {
        const tr = document.createElement('tr');
        const canJoin = r.playerCount < 6;
        const currentGameMark = r.playing && r.gameName
            ? ` <span style="font-size:10px;color:var(--gold);">[${r.gameName}]</span>` : '';
        const mergedNames = (r.mergedGames || []).map(i => GAME_LIST[i]?.shortName || '').filter(Boolean);
        const gamesStr = mergedNames.length > 0
            ? `<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">${mergedNames.join(' ')}</div>` : '';
        let statusHtml;
        if (!r.playing) {
            statusHtml = '<span style="color:#4f4">待機中</span>';
        } else if (canJoin) {
            statusHtml = '<span style="color:#f44">進行中</span> <span style="font-size:10px;color:#4af">途中参加可</span>';
        } else {
            statusHtml = '<span style="color:#f44">進行中</span>';
        }
        tr.innerHTML = `<td>${r.id}${currentGameMark}${gamesStr}</td><td>${r.hostName}</td><td>${r.playerCount}/6</td><td>${statusHtml}</td>`;
        if (canJoin) {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => client.joinRoom(r.id));
        }
        container.appendChild(tr);
    }
}

// ==========================================
// Room Screen
// ==========================================
let mySelectedGames = new Set(GAME_LIST.map((_, i) => i)); // my own selection

function setupRoomScreen() {
    // Build game checkboxes (all players can select)
    const container = document.getElementById('room-game-checkboxes');
    GAME_LIST.forEach((g, i) => {
        const label = document.createElement('label');
        label.className = 'game-checkbox-item';
        label.dataset.gameIndex = i;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.index = i;
        cb.addEventListener('change', () => {
            if (!cb.checked && mySelectedGames.size <= 1) {
                cb.checked = true;
                return;
            }
            if (cb.checked) mySelectedGames.add(i); else mySelectedGames.delete(i);
            client.send({ type: 'update_game_selection', selectedGames: [...mySelectedGames] });
        });
        const nameSpan = document.createElement('span');
        nameSpan.className = 'game-cb-name';
        nameSpan.textContent = g.name;
        const selectorsSpan = document.createElement('span');
        selectorsSpan.className = 'game-cb-selectors';
        label.appendChild(cb);
        label.appendChild(nameSpan);
        label.appendChild(selectorsSpan);
        container.appendChild(label);
    });

    document.getElementById('room-starting-chips').addEventListener('change', (e) => {
        client.updateSettings({ startingChips: parseInt(e.target.value) });
    });

    document.getElementById('btn-start-game').addEventListener('click', () => client.startGame());
    document.getElementById('btn-leave-room').addEventListener('click', () => {
        client.leaveRoom();
        showScreen('lobby');
    });
}

function onRoomJoined(room) {
    currentRoom = room;
    // Send my current game selection to server on join
    client.send({ type: 'update_game_selection', selectedGames: [...mySelectedGames] });

    if (room.playing) {
        // Mid-game join: go directly to game screen
        showScreen('game');
        document.getElementById('zoom-waiting-overlay').classList.add('hidden');
        document.getElementById('zoom-sitout-overlay').classList.add('hidden');
        document.getElementById('btn-back-room').classList.remove('hidden');
        document.getElementById('btn-zoom-exit').classList.add('hidden');
        document.getElementById('btn-zoom-sitout').classList.add('hidden');
        document.getElementById('game-log').innerHTML = '';
        currentHandLogs = [];
    } else {
        showScreen('room');
        renderRoom(room);
    }
}

function onRoomUpdated(room) {
    currentRoom = room;
    renderRoom(room);
}

function renderRoom(room) {
    document.getElementById('room-id-display').textContent = room.id;
    document.getElementById('room-player-count').textContent = `${room.members.length}/6`;

    const list = document.getElementById('room-player-list');
    list.innerHTML = '';
    for (const m of room.members) {
        const li = document.createElement('li');
        li.textContent = m.name;
        if (m.clientId === room.hostId) li.textContent += ' (ホスト)';
        if (m.clientId === client.clientId) li.classList.add('me');
        list.appendChild(li);
    }

    // Build selectorsMap: gameIndex -> [playerName, ...]
    const selectorsMap = {};
    GAME_LIST.forEach((_, i) => { selectorsMap[i] = []; });
    for (const m of room.members) {
        const sel = room.playerGames?.[m.clientId];
        if (sel && sel.length > 0) {
            sel.forEach(i => { if (selectorsMap[i]) selectorsMap[i].push(m.name); });
        } else {
            GAME_LIST.forEach((_, i) => { selectorsMap[i].push(m.name); });
        }
    }
    const totalMembers = room.members.length;

    // Update checkboxes: checked state, highlight, selector names
    document.querySelectorAll('#room-game-checkboxes label').forEach(label => {
        const i = parseInt(label.dataset.gameIndex);
        const cb = label.querySelector('input');
        cb.checked = mySelectedGames.has(i);
        const names = selectorsMap[i] || [];
        label.querySelector('.game-cb-selectors').textContent = names.length ? names.join(', ') : '';
        label.classList.remove('game-all-selected', 'game-some-selected', 'game-none-selected');
        if (names.length === totalMembers && totalMembers > 0) {
            label.classList.add('game-all-selected');
        } else if (names.length > 0) {
            label.classList.add('game-some-selected');
        } else {
            label.classList.add('game-none-selected');
        }
    });

    // Host-only: starting chips + start button
    const isHost = room.hostId === client.clientId;
    document.getElementById('btn-start-game').style.display = isHost ? '' : 'none';
    const chipsLabel = document.getElementById('room-starting-chips')?.closest('label');
    if (chipsLabel) chipsLabel.style.display = isHost ? '' : 'none';
    document.getElementById('room-waiting-msg').style.display = isHost ? 'none' : 'block';
    document.getElementById('room-host-controls').style.display = 'block';

    if (room.settings) {
        document.getElementById('room-starting-chips').value = room.settings.startingChips;
    }
}

// ==========================================
// Game Screen
// ==========================================
function setupGameScreen() {
    // Log/Chat tab switching
    document.querySelectorAll('.log-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.tab;
            const logPanel = document.getElementById('log-panel');
            const gameLog = document.getElementById('game-log');
            const chatBar = document.querySelector('.game-chat-bar');

            if (mode === 'none') {
                // Collapse: hide content + tab labels, show only expand button
                document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                logPanel.classList.add('collapsed');
            } else if (logPanel.classList.contains('collapsed') && mode === 'expand') {
                // Expand from collapsed state — restore last active tab (default: log)
                logPanel.classList.remove('collapsed');
                document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
                const logTab = document.querySelector('.log-tab[data-tab="log"]');
                logTab.classList.add('active');
                gameLog.classList.remove('hidden');
                chatBar.classList.add('hidden');
            } else {
                // Normal tab switch
                logPanel.classList.remove('collapsed');
                document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                gameLog.classList.toggle('hidden', mode === 'chat');
                chatBar.classList.toggle('hidden', mode === 'log');
            }
        });
    });

    // Sound toggle button
    const soundBtn = document.getElementById('btn-sound-toggle');
    const updateSoundBtn = () => { soundBtn.textContent = sound.isEnabled() ? '🔔' : '🔕'; };
    updateSoundBtn();
    soundBtn.addEventListener('click', () => { sound.toggle(); updateSoundBtn(); });

    // Rules button
    document.getElementById('game-rules-btn').addEventListener('click', () => {
        document.getElementById('rules-modal').classList.toggle('hidden');
    });
    document.getElementById('rules-close').addEventListener('click', () => {
        document.getElementById('rules-modal').classList.add('hidden');
    });

    // Bet slider and raise-input sync (event delegation since inputs are created dynamically)
    const betSlider = document.getElementById('bet-slider');

    betSlider.addEventListener('input', (e) => {
        const total = parseInt(e.target.value) + sliderOffset;
        const betInput = document.getElementById('bet-amount-input');
        if (betInput) betInput.value = total;
        updateRaiseBtnText(total);
    });

    document.addEventListener('input', (e) => {
        if (e.target.id !== 'bet-amount-input') return;
        let val = parseInt(e.target.value) || 0;
        let sliderVal = val - sliderOffset;
        if (sliderVal < parseInt(betSlider.min)) sliderVal = parseInt(betSlider.min);
        if (sliderVal > parseInt(betSlider.max)) sliderVal = parseInt(betSlider.max);
        betSlider.value = sliderVal;
        updateRaiseBtnText(val);
    });

    document.addEventListener('blur', (e) => {
        if (e.target.id !== 'bet-amount-input') return;
        let val = parseInt(e.target.value) || 0;
        let sliderVal = val - sliderOffset;
        if (sliderVal < parseInt(betSlider.min)) sliderVal = parseInt(betSlider.min);
        if (sliderVal > parseInt(betSlider.max)) sliderVal = parseInt(betSlider.max);
        e.target.value = sliderVal + sliderOffset;
        betSlider.value = sliderVal;
        updateRaiseBtnText(e.target.value);
    }, true);

    // Draw buttons
    document.getElementById('btn-draw').addEventListener('click', () => {
        if (ui.selectedCards.size === 0) {
            if (!confirm('カードを選択していません。スタンドパット（交換なし）と同じですが、ドローしますか？')) return;
        }
        client.sendDraw([...ui.selectedCards]);
        ui.selectedCards.clear();
        document.getElementById('draw-action-bar').classList.add('hidden');
        ui.pendingDraw = false;
    });
    document.getElementById('btn-stand-pat').addEventListener('click', () => {
        client.sendDraw([]);
        ui.selectedCards.clear();
        document.getElementById('draw-action-bar').classList.add('hidden');
        ui.pendingDraw = false;
    });

    // Stats button
    document.getElementById('btn-ingame-stats').addEventListener('click', () => {
        client.getStats();
        document.getElementById('stats-modal').classList.remove('hidden');
    });

    // Back to room button
    document.getElementById('btn-back-room').addEventListener('click', () => {
        if (confirm('ルームに戻りますか？（ゲームを離脱します）')) {
            client.leaveRoom();
            showScreen('lobby');
        }
    });

    // Zoom exit button
    document.getElementById('btn-zoom-exit').addEventListener('click', () => {
        client.leaveZoom();
    });

    // Zoom sit-out button
    document.getElementById('btn-zoom-sitout').addEventListener('click', () => {
        client.zoomSitout();
    });

    // Zoom sit-out overlay buttons
    document.getElementById('btn-zoom-rejoin').addEventListener('click', () => {
        document.getElementById('zoom-sitout-overlay').classList.add('hidden');
        document.getElementById('zoom-waiting-overlay').classList.remove('hidden');
        client.zoomRejoin();
    });
    document.getElementById('btn-zoom-lobby').addEventListener('click', () => {
        client.leaveZoom();
    });
    document.getElementById('btn-zoom-ranking').addEventListener('click', () => {
        renderRanking();
        document.getElementById('ranking-modal').classList.remove('hidden');
    });

    // Zoom waiting overlay buttons
    document.getElementById('btn-zoom-waiting-lobby').addEventListener('click', () => {
        client.leaveZoom();
    });
    document.getElementById('btn-zoom-waiting-ranking').addEventListener('click', () => {
        renderRanking();
        document.getElementById('ranking-modal').classList.remove('hidden');
    });
}

function onGameStarted(data) {
    showScreen('game');
    document.getElementById('zoom-waiting-overlay').classList.add('hidden');
    document.getElementById('zoom-sitout-overlay').classList.add('hidden');

    // Save previous hand to history
    saveCurrentHand();

    document.getElementById('game-log').innerHTML = '';
    currentHandLogs = [];
    currentHandGameName = currentState ? currentState.gameName : '';
    currentHandGameType = currentState ? currentState.gameType : '';
    ui.addLog('ゲーム開始！', 'important');

    // Show/hide zoom-specific UI
    if (data && data.zoom) {
        isInZoom = true;
        document.getElementById('btn-back-room').classList.add('hidden');
        document.getElementById('btn-zoom-exit').classList.remove('hidden');
        document.getElementById('btn-zoom-sitout').classList.remove('hidden');
    } else {
        document.getElementById('btn-back-room').classList.remove('hidden');
        document.getElementById('btn-zoom-exit').classList.add('hidden');
        document.getElementById('btn-zoom-sitout').classList.add('hidden');
    }
}

function onHandStart() {
    saveCurrentHand();
    document.getElementById('game-log').innerHTML = '';
    currentHandLogs = [];
    startingHandCards = [];
    cardSnapshots = [];
    showdownPlayers = null;
    lastHandResult = null;
    currentHandGameName = currentState ? currentState.gameName : '';
    currentHandGameType = currentState ? currentState.gameType : '';
}

function onHandResult(data) {
    lastHandResult = data;
}

function onGameState(state) {
    currentState = state;
    if (!currentHandGameName && state.gameName) currentHandGameName = state.gameName;
    if (!currentHandGameType && state.gameType) currentHandGameType = state.gameType;
    if (state.zoom) {
        document.getElementById('zoom-waiting-overlay').classList.add('hidden');
        document.getElementById('zoom-sitout-overlay').classList.add('hidden');
    }
    // Capture starting hand on first state with cards
    if (state.mySeatIndex !== undefined) {
        const me = state.players[state.mySeatIndex];
        if (me) {
            if (startingHandCards.length === 0) {
                let cards = [];
                if (state.gameType === 'stud') {
                    cards = [...(me.downCards || []), ...(me.upCards || [])];
                } else {
                    cards = me.hand || [];
                }
                if (cards.length > 0) {
                    startingHandCards = cards.map(c => ({ r: c.rank, s: c.suit }));
                }
            }
            // Track card snapshots for stud/draw
            if (state.gameType === 'stud') {
                const down = (me.downCards || []).map(c => ({ r: c.rank, s: c.suit }));
                const up = (me.upCards || []).map(c => ({ r: c.rank, s: c.suit }));
                const key = JSON.stringify({ d: down, u: up });
                const lastKey = cardSnapshots.length > 0 ? cardSnapshots[cardSnapshots.length - 1].key : '';
                if (key !== lastKey && (down.length > 0 || up.length > 0)) {
                    cardSnapshots.push({ key, down, up, type: 'stud' });
                }
            } else if (state.gameType === 'draw') {
                const hand = (me.hand || []).map(c => ({ r: c.rank, s: c.suit }));
                const key = JSON.stringify(hand);
                const lastKey = cardSnapshots.length > 0 ? cardSnapshots[cardSnapshots.length - 1].key : '';
                if (key !== lastKey && hand.length > 0) {
                    cardSnapshots.push({ key, hand, type: 'draw' });
                }
            }
        }
    }
    // Capture all players' cards at showdown
    if (state.isShowdown && state.players) {
        const players = [];
        for (let i = 0; i < state.players.length; i++) {
            const p = state.players[i];
            if (!p || p.folded) continue;
            let cards = [];
            if (state.gameType === 'stud') {
                cards = [...(p.downCards || []), ...(p.upCards || [])];
            } else {
                cards = p.hand || [];
            }
            if (cards.length > 0) {
                players.push({
                    name: p.name,
                    isMe: i === state.mySeatIndex,
                    cards: cards.map(c => ({ r: c.rank, s: c.suit })),
                });
            }
        }
        if (players.length > 0) showdownPlayers = players;
    }
    ui.renderFromServer(state);
}

function onZoomJoined() {
    isInZoom = true;
    showScreen('game');
    document.getElementById('zoom-waiting-overlay').classList.remove('hidden');
    document.getElementById('game-log').innerHTML = '';
    document.getElementById('btn-back-room').classList.add('hidden');
    document.getElementById('btn-zoom-exit').classList.remove('hidden');
    ui.addLog('Zoom卓に参加しました。テーブルを探しています...', 'important');
}

function onZoomWaiting(data) {
    document.getElementById('zoom-waiting-overlay').classList.remove('hidden');
    stopTurnTimer();
    saveCurrentHand();
}

function onZoomLeft() {
    isInZoom = false;
    document.getElementById('zoom-waiting-overlay').classList.add('hidden');
    document.getElementById('zoom-sitout-overlay').classList.add('hidden');
    document.getElementById('btn-zoom-exit').classList.add('hidden');
    document.getElementById('btn-zoom-sitout').classList.add('hidden');
    document.getElementById('btn-back-room').classList.remove('hidden');
    saveCurrentHand();
    showScreen('lobby');
}

function onZoomSitout() {
    stopTurnTimer();
    saveCurrentHand();
    document.getElementById('zoom-waiting-overlay').classList.add('hidden');
    document.getElementById('zoom-sitout-overlay').classList.remove('hidden');
    renderHandHistory('zoom-hand-history');
}

const RANK_D = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
const SUIT_D = { s:'♠', h:'♥', d:'♦', c:'♣' };
function cardStr(c) { return (RANK_D[c.rank] || c.rank) + (SUIT_D[c.suit] || c.suit); }

let currentHandGameName = '';
let currentHandGameType = '';

function saveCurrentHand() {
    if (currentHandLogs.length > 1) {
        const gameName = currentHandGameName || (currentState ? currentState.gameName : '');
        let myCards = '';
        let myCardObjs = [];
        let communityCards = '';
        let communityCardObjs = [];
        if (currentState) {
            const me = currentState.players[currentState.mySeatIndex];
            if (me) {
                let cards = [];
                if (currentState.gameType === 'stud') {
                    cards = [...(me.downCards || []), ...(me.upCards || [])];
                } else {
                    cards = me.hand || [];
                }
                if (cards.length > 0) {
                    myCards = cards.map(c => cardStr(c)).join(' ');
                    myCardObjs = cards.map(c => ({ r: c.rank, s: c.suit }));
                }
            }
            if (currentState.communityCards && currentState.communityCards.length > 0) {
                communityCards = currentState.communityCards.map(c => cardStr(c)).join(' ');
                communityCardObjs = currentState.communityCards.map(c => ({ r: c.rank, s: c.suit }));
            }
        }
        handHistory.push({
            gameName, logs: [...currentHandLogs], time: new Date().toLocaleTimeString(),
            myCards, communityCards, myCardObjs, communityCardObjs,
            startCards: startingHandCards.length > 0 ? [...startingHandCards] : myCardObjs,
            cardSnapshots: cardSnapshots.length > 0 ? cardSnapshots.map(s => {
                const copy = { type: s.type };
                if (s.type === 'stud') { copy.down = s.down; copy.up = s.up; }
                else { copy.hand = s.hand; }
                return copy;
            }) : [],
            gameType: currentHandGameType || (currentState ? currentState.gameType : ''),
            showdownPlayers: showdownPlayers ? [...showdownPlayers] : null,
            handResult: lastHandResult ? {
                gameName: lastHandResult.gameName,
                gameType: lastHandResult.gameType,
                communityCards: (lastHandResult.communityCards || []).map(c => ({ r: c.rank, s: c.suit })),
                dealerSeat: lastHandResult.dealerSeat,
                drawSnapshots: (lastHandResult.drawSnapshots || []).map(snap =>
                    snap.map(s => ({ name: s.name, folded: s.folded,
                        hand: (s.hand || []).map(c => ({ r: c.rank, s: c.suit })),
                    }))
                ),
                players: lastHandResult.players.map(p => ({
                    name: p.name, position: p.position, folded: p.folded,
                    chips: p.chips, startChips: p.startChips,
                    cards: p.cards.map(c => ({ r: c.rank, s: c.suit })),
                    upCards: (p.upCards || []).map(c => ({ r: c.rank, s: c.suit })),
                    downCards: (p.downCards || []).map(c => ({ r: c.rank, s: c.suit })),
                })),
            } : null,
        });
        if (handHistory.length > 30) handHistory.shift();
        persistHandHistory();
    }
    currentHandLogs = [];
}

function renderHandHistory(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (handHistory.length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:8px;">まだ履歴がありません</p>';
        return;
    }
    // Compact list of starting hands
    let html = '<div class="hh-list">';
    for (let i = handHistory.length - 1; i >= 0; i--) {
        const h = handHistory[i];
        const cards = h.startCards || h.myCardObjs || [];
        html += `<div class="hh-row" data-hh-idx="${i}">`;
        html += `<span class="hh-num">#${i + 1}</span>`;
        html += `<span class="hh-game-label">${h.gameName || ''}</span>`;
        html += `<span class="hh-start-cards">${renderMiniCards(cards)}</span>`;
        html += `<span class="hh-time-label">${h.time || ''}</span>`;
        html += `</div>`;
    }
    html += '</div>';
    // Detail panel (hidden by default)
    html += '<div id="hh-detail-' + containerId + '" class="hh-detail hidden"></div>';
    container.innerHTML = html;

    // Click handlers
    container.querySelectorAll('.hh-row').forEach(row => {
        row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.hhIdx);
            const detail = container.querySelector('.hh-detail');
            // Toggle: if same hand, hide
            if (detail.dataset.activeIdx === String(idx) && !detail.classList.contains('hidden')) {
                detail.classList.add('hidden');
                row.classList.remove('hh-row-active');
                return;
            }
            container.querySelectorAll('.hh-row').forEach(r => r.classList.remove('hh-row-active'));
            row.classList.add('hh-row-active');
            detail.dataset.activeIdx = String(idx);
            detail.classList.remove('hidden');
            detail.innerHTML = renderHandDetail(handHistory[idx], idx);
        });
    });
}

function renderMiniCards(cardObjs) {
    if (!cardObjs || cardObjs.length === 0) return '<span style="color:var(--text-dim)">--</span>';
    const SUIT_COLORS = { s: '#aaa', h: '#e53935', d: '#42a5f5', c: '#66bb6a' };
    return cardObjs.map(c => {
        const r = RANK_D[c.r] || c.r;
        const s = SUIT_D[c.s] || c.s;
        const col = SUIT_COLORS[c.s] || '#ccc';
        return `<span class="mini-card" style="color:${col}">${r}${s}</span>`;
    }).join('');
}

function renderHandDetail(h, idx) {
    if (!h) return '';
    const hr = h.handResult;
    const myName = client.name;

    // Header: game name + time
    let html = `<div class="hh-detail-header">`;
    html += `<span class="hh-detail-title">#${idx + 1} ${h.gameName || ''}</span>`;
    html += `<span class="hh-detail-time">${h.time || ''}</span>`;
    html += `</div>`;

    // === Player summary table (position, name, result, cards) ===
    if (hr && hr.players) {
        html += `<div class="hh-player-table">`;
        for (const p of hr.players) {
            const diff = p.chips - p.startChips;
            const diffStr = diff > 0 ? `<span class="hh-win">+${diff}</span>` :
                            diff < 0 ? `<span class="hh-loss">${diff}</span>` :
                            `<span class="hh-even">±0</span>`;
            const isMe = p.name === myName;
            const nameClass = isMe ? 'hh-p-name hh-p-me' : 'hh-p-name';
            let cards = '';
            const foldTag = p.folded ? '<span class="hh-folded-label">fold</span> ' : '';
            if (hr.gameType === 'stud' && p.downCards && p.downCards.length > 0) {
                cards = `${foldTag}<span class="hh-stud-down">[${renderMiniCards(p.downCards)}]</span> ${renderMiniCards(p.upCards)}`;
            } else if (p.cards && p.cards.length > 0) {
                cards = foldTag + renderMiniCards(p.cards);
            } else {
                cards = foldTag || '';
            }
            html += `<div class="hh-p-row${isMe ? ' hh-p-row-me' : ''}">`;
            html += `<span class="hh-p-pos">${p.position}</span>`;
            html += `<span class="${nameClass}">${p.name}</span>`;
            html += `<span class="hh-p-diff">${diffStr}</span>`;
            html += `<span class="hh-p-cards">${cards}</span>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    // === Parse logs into rounds ===
    const rounds = [{ name: 'Preflop', logs: [], cards: [] }];
    const ROUND_MARKERS = {
        'フロップ': 'Flop', 'ターン': 'Turn', 'リバー': 'River',
        '3rd': '3rd St', '4th': '4th St', '5th': '5th St', '6th': '6th St', '7th': '7th St',
        '1回目のドロー': 'Draw 1', '2回目のドロー': 'Draw 2', '3回目のドロー': 'Draw 3',
    };
    for (const log of h.logs) {
        let matched = false;
        for (const [marker, name] of Object.entries(ROUND_MARKERS)) {
            if (log.includes(marker)) {
                rounds.push({ name, logs: [], cards: [] });
                matched = true;
                break;
            }
        }
        if (!matched) {
            rounds[rounds.length - 1].logs.push(log);
        }
    }

    // Assign community cards to rounds (Flop=3, Turn=1, River=1)
    const cc = (hr && hr.communityCards) || h.communityCardObjs || [];
    if (cc.length >= 3) {
        const flopRound = rounds.find(r => r.name === 'Flop');
        if (flopRound) flopRound.cards = cc.slice(0, 3);
        const turnRound = rounds.find(r => r.name === 'Turn');
        if (turnRound && cc.length >= 4) turnRound.cards = [cc[3]];
        const riverRound = rounds.find(r => r.name === 'River');
        if (riverRound && cc.length >= 5) riverRound.cards = [cc[4]];
    }

    // Assign draw snapshots to draw rounds (all players, pre-draw + post-draw)
    const drawSnaps = (hr && hr.drawSnapshots) || [];
    const mySnaps = h.cardSnapshots || [];
    if (drawSnaps.length > 0) {
        // Use server-side snapshots (all players)
        const preflopRound = rounds.find(r => r.name === 'Preflop');
        if (preflopRound && drawSnaps[0]) preflopRound.drawAllPlayers = drawSnaps[0];

        let drawIdx = 0;
        for (const round of rounds) {
            if (round.name.startsWith('Draw')) {
                if (drawSnaps[drawIdx]) round.preDrawAll = drawSnaps[drawIdx];
                drawIdx++;
                if (drawSnaps[drawIdx]) round.postDrawAll = drawSnaps[drawIdx];
            }
        }
    } else if (mySnaps.length > 0 && mySnaps[0].type === 'draw') {
        // Fallback: client-side snapshots (my cards only)
        const preflopRound = rounds.find(r => r.name === 'Preflop');
        if (preflopRound && mySnaps[0]) preflopRound.drawHand = mySnaps[0].hand;

        let drawIdx = 0;
        for (const round of rounds) {
            if (round.name.startsWith('Draw')) {
                if (mySnaps[drawIdx]) round.preDraw = mySnaps[drawIdx].hand;
                drawIdx++;
                if (mySnaps[drawIdx]) round.postDraw = mySnaps[drawIdx].hand;
            }
        }
    }

    // Helper: render all players' draw hands
    function renderDrawPlayersHands(snapPlayers, label) {
        if (!snapPlayers || snapPlayers.length === 0) return '';
        let out = `<div class="hh-draw-section"><span class="hh-draw-label">${label}</span>`;
        for (const sp of snapPlayers) {
            if (sp.folded || !sp.hand || sp.hand.length === 0) continue;
            const isMe = sp.name === myName;
            const cls = isMe ? 'hh-draw-player hh-draw-me' : 'hh-draw-player';
            out += `<div class="${cls}"><span class="hh-draw-pname">${sp.name}:</span>${renderMiniCards(sp.hand)}</div>`;
        }
        out += `</div>`;
        return out;
    }

    // === Rounds with actions ===
    html += `<div class="hh-rounds">`;
    for (const round of rounds) {
        const hasContent = round.logs.length > 0 || round.cards.length > 0
            || round.drawAllPlayers || round.preDrawAll || round.postDrawAll
            || round.drawHand || round.preDraw || round.postDraw;
        if (!hasContent) continue;
        html += `<div class="hh-round">`;
        // Round header: name + community cards
        html += `<div class="hh-round-header">`;
        html += `<span class="hh-round-name">${round.name}</span>`;
        if (round.cards.length > 0) {
            html += `<span class="hh-round-cards">${renderMiniCards(round.cards)}</span>`;
        }
        html += `</div>`;
        // Draw game: all players' hands
        if (round.drawAllPlayers) {
            html += renderDrawPlayersHands(round.drawAllPlayers, 'ハンド:');
        } else if (round.drawHand) {
            html += `<div class="hh-draw-cards"><span class="hh-draw-label">ハンド:</span>${renderMiniCards(round.drawHand)}</div>`;
        }
        if (round.preDrawAll) {
            html += renderDrawPlayersHands(round.preDrawAll, 'ドロー前:');
        } else if (round.preDraw) {
            html += `<div class="hh-draw-cards"><span class="hh-draw-label">ドロー前:</span>${renderMiniCards(round.preDraw)}</div>`;
        }
        // Actions with position tags
        html += `<div class="hh-round-actions">`;
        for (const log of round.logs) {
            const actionClass = getActionClass(log);
            let posTag = '';
            if (hr && hr.players) {
                for (const p of hr.players) {
                    if (log.startsWith(p.name)) {
                        posTag = `<span class="hh-action-pos">${p.position}</span>`;
                        break;
                    }
                }
            }
            html += `<div class="hh-action ${actionClass}">${posTag}${log}</div>`;
        }
        html += `</div>`;
        // Post-draw: all players' hands
        if (round.postDrawAll) {
            html += renderDrawPlayersHands(round.postDrawAll, 'ドロー後:');
        } else if (round.postDraw) {
            html += `<div class="hh-draw-cards"><span class="hh-draw-label">ドロー後:</span>${renderMiniCards(round.postDraw)}</div>`;
        }
        html += `</div>`;
    }
    html += `</div>`;

    // === Result section ===
    if (hr && hr.players) {
        const winners = hr.players.filter(p => p.chips - p.startChips > 0);
        if (winners.length > 0) {
            html += `<div class="hh-result">`;
            html += `<span class="hh-result-label">Result</span>`;
            for (const w of winners) {
                html += `<span class="hh-result-win">${w.name} won +${w.chips - w.startChips}</span>`;
            }
            html += `</div>`;
        }
    }

    // === Fallback for old data without handResult ===
    if (!hr) {
        // Show old-style cards
        html += `<div class="hh-detail-cards">`;
        if (h.startCards && h.startCards.length > 0) {
            html += `<div class="hh-card-group"><span class="hh-card-label">ハンド</span>${renderVisualCards(h.startCards)}</div>`;
        }
        if (h.communityCardObjs && h.communityCardObjs.length > 0) {
            html += `<div class="hh-card-group"><span class="hh-card-label">ボード</span>${renderVisualCards(h.communityCardObjs)}</div>`;
        }
        if (h.showdownPlayers && h.showdownPlayers.length > 0) {
            for (const p of h.showdownPlayers) {
                const nameClass = p.isMe ? 'hh-sd-name hh-sd-me' : 'hh-sd-name';
                html += `<div class="hh-card-group"><span class="${nameClass}">${p.name}</span>${renderVisualCards(p.cards)}</div>`;
            }
        }
        html += `</div>`;
    }

    return html;
}

function renderVisualCards(cardObjs) {
    if (!cardObjs || cardObjs.length === 0) return '';
    const SUIT_COLORS = { s: '#333', h: '#e53935', d: '#42a5f5', c: '#2e7d32' };
    const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
    return cardObjs.map(c => {
        const r = RANK_D[c.r] || c.r;
        const sym = SUIT_SYM[c.s] || c.s;
        const col = SUIT_COLORS[c.s] || '#333';
        return `<span class="hh-visual-card" style="color:${col}">${r}<span class="hh-vc-suit">${sym}</span></span>`;
    }).join('');
}

function renderVisualCardsWithType(cardObjs) {
    if (!cardObjs || cardObjs.length === 0) return '';
    const SUIT_COLORS = { s: '#333', h: '#e53935', d: '#42a5f5', c: '#2e7d32' };
    const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
    return cardObjs.map(c => {
        const r = RANK_D[c.r] || c.r;
        const sym = SUIT_SYM[c.s] || c.s;
        const col = SUIT_COLORS[c.s] || '#333';
        const cls = c.faceDown ? 'hh-visual-card hh-vc-down' : 'hh-visual-card';
        return `<span class="${cls}" style="color:${col}">${r}<span class="hh-vc-suit">${sym}</span></span>`;
    }).join('');
}

function getActionClass(log) {
    if (log.includes('フォールド')) return 'act-fold';
    if (log.includes('レイズ') || log.includes('ベット')) return 'act-raise';
    if (log.includes('コール')) return 'act-call';
    if (log.includes('チェック')) return 'act-check';
    if (log.includes('オールイン')) return 'act-allin';
    if (log.includes('勝利') || log.includes('獲得')) return 'act-win';
    return '';
}

function onYourTurn(data) {
    sound.yourTurn();
    startTurnTimer(data.timeLimit || 45);
    showActionButtons(data.actions, data);
}

function onYourDraw(data) {
    sound.yourDraw();
    startTurnTimer(data.timeLimit || 45);
    ui.pendingDraw = true;
    ui.selectedCards.clear();
    document.getElementById('draw-action-bar').classList.remove('hidden');
    // Re-render hand for selection
    if (currentState) ui.renderPlayerHand(currentState);
}

// Update the raise/bet button text dynamically as slider/input changes
function updateRaiseBtnText(totalChips) {
    const btn = document.getElementById('btn-raise-main');
    if (!btn) return;
    const parts = btn.textContent.split(' ');
    const label = parts[0]; // レイズ or ベット
    btn.textContent = `${label} ${Number(totalChips).toLocaleString()}`;
}

function showActionButtons(actions, turnData) {
    const bar = document.getElementById('action-bar');
    const btnDiv = document.getElementById('action-buttons');
    const presetsDiv = document.getElementById('bet-presets');
    bar.classList.remove('hidden');
    btnDiv.innerHTML = '';
    presetsDiv.classList.add('hidden');
    presetsDiv.innerHTML = '';

    currentTurnBB = turnData.bigBlind || 0;
    const isStud = !currentTurnBB;

    let hasSlider = false;
    let sliderAction = null;
    let sliderMin = 0, sliderMax = 0;

    // Sort: raise/bet (top) → call/check → fold (bottom); allin goes to presets
    const order = ['raise', 'bet', 'call', 'check', 'fold'];
    const sorted = [...actions].sort((a, b) => {
        const ai = order.indexOf(a.type), bi = order.indexOf(b.type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    let allInAction = null; // collected separately → shown as preset

    for (const action of sorted) {
        // Allin: skip button, save for preset
        if (action.type === 'allin') {
            allInAction = action;
            continue;
        }

        if ((action.type === 'bet' || action.type === 'raise') && action.min !== undefined) {
            // Variable raise/bet: row with button + amount input
            hasSlider = true;
            sliderAction = action.type;
            sliderMin = action.min;
            sliderMax = action.max;
            const curBet = action.currentBet || 0;
            setupSlider(action.min, action.max, curBet);

            const initTotal = action.min + curBet;
            const label = action.type === 'raise' ? 'レイズ' : 'ベット';

            const row = document.createElement('div');
            row.className = 'action-raise-row';

            const btn = document.createElement('button');
            btn.id = 'btn-raise-main';
            btn.className = `btn-action btn-${action.type}`;
            btn.textContent = `${label} ${initTotal.toLocaleString()}`;
            btn.addEventListener('click', () => {
                const val = parseInt(document.getElementById('bet-slider').value);
                sendActionAndHide({ type: action.type, amount: val });
            });

            const inp = document.createElement('input');
            inp.type = 'number';
            inp.id = 'bet-amount-input';
            inp.className = 'bet-raise-input';
            inp.inputMode = 'numeric';
            inp.value = initTotal;

            row.appendChild(btn);
            row.appendChild(inp);
            btnDiv.appendChild(row);
        } else {
            const btn = document.createElement('button');
            btn.className = `btn-action btn-${action.type}`;

            switch (action.type) {
                case 'fold': {
                    btn.textContent = 'フォールド（長押し）';
                    // Long-press (0.4s) to prevent accidental fold
                    let foldTimer = null;
                    let foldFired = false;
                    btn.addEventListener('pointerdown', (e) => {
                        foldFired = false;
                        btn.classList.add('fold-holding');
                        foldTimer = setTimeout(() => {
                            foldFired = true;
                            btn.classList.remove('fold-holding');
                            sendActionAndHide({ type: 'fold' });
                        }, 400);
                    });
                    btn.addEventListener('pointerup', () => {
                        clearTimeout(foldTimer);
                        btn.classList.remove('fold-holding');
                    });
                    btn.addEventListener('pointerleave', () => {
                        clearTimeout(foldTimer);
                        btn.classList.remove('fold-holding');
                    });
                    // Add separator before fold
                    const sep = document.createElement('div');
                    sep.className = 'action-separator';
                    btnDiv.appendChild(sep);
                    break;
                }
                case 'check':
                    btn.textContent = 'チェック';
                    btn.addEventListener('click', () => sendActionAndHide({ type: 'check' }));
                    break;
                case 'call':
                    btn.textContent = `コール ${action.amount.toLocaleString()}`;
                    btn.addEventListener('click', () => sendActionAndHide({ type: 'call', amount: action.amount }));
                    break;
                case 'bet':
                    btn.textContent = `ベット ${action.amount.toLocaleString()}`;
                    btn.addEventListener('click', () => sendActionAndHide({ type: 'bet', amount: action.amount }));
                    break;
                case 'raise':
                    btn.textContent = `レイズ ${(action.total || action.amount).toLocaleString()}`;
                    btn.addEventListener('click', () => sendActionAndHide({ type: 'raise', amount: action.amount }));
                    break;
            }
            btnDiv.appendChild(btn);
        }
    }

    if (hasSlider || allInAction) {
        renderBetPresets(turnData, sliderAction, sliderMin, sliderMax, allInAction);
    }
}

function renderBetPresets(turnData, sliderAction, sliderMin, sliderMax, allInAction) {
    const presetsDiv = document.getElementById('bet-presets');
    presetsDiv.innerHTML = '';
    const presets = [];
    const bb = (turnData && turnData.bigBlind) || 100;
    const pot = (turnData && turnData.pot) || 0;
    const isFirstRound = turnData && turnData.isFirstRound;
    const tableBet = (turnData && turnData.currentBet) || 0;

    if (sliderAction) {
        // Preflop unopened: BB-based buttons
        if (isFirstRound && tableBet <= bb) {
            [2, 2.5, 3, 3.5, 4].forEach(mult => {
                const targetTotal = Math.round(bb * mult);
                presets.push({ label: `${mult}bb`, targetTotal });
            });
        } else if (isFirstRound && tableBet > bb) {
            // Preflop facing raise: multipliers of current bet
            [2, 2.5, 3, 4].forEach(mult => {
                const targetTotal = Math.round(tableBet * mult);
                presets.push({ label: `${mult}x`, targetTotal });
            });
        } else if (!isFirstRound) {
            // Postflop: pot percentages
            [{ label: '33%', pct: 0.33 }, { label: '50%', pct: 0.5 }, { label: '66%', pct: 0.66 }, { label: 'Pot', pct: 1.0 }].forEach(({ label, pct }) => {
                const targetTotal = Math.round(pot * pct) + tableBet;
                presets.push({ label, targetTotal });
            });
        }

        // Filter out presets outside slider range
        const filtered = presets.filter(p => {
            const outOfPocket = p.targetTotal - sliderOffset;
            return outOfPocket <= sliderMax && outOfPocket >= sliderMin;
        });

        for (const p of filtered) {
            const btn = document.createElement('button');
            btn.className = 'btn-preset';
            btn.textContent = p.label;
            btn.addEventListener('click', () => {
                const outOfPocket = p.targetTotal - sliderOffset;
                const slider = document.getElementById('bet-slider');
                if (slider) slider.value = outOfPocket;
                const input = document.getElementById('bet-amount-input');
                if (input) input.value = p.targetTotal;
                updateRaiseBtnText(p.targetTotal);
                presetsDiv.querySelectorAll('.btn-preset:not(.btn-preset-allin)').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            presetsDiv.appendChild(btn);
        }
    }

    // All-in preset button (last, distinct style)
    if (allInAction) {
        const amount = allInAction.total || allInAction.amount;
        const btn = document.createElement('button');
        btn.className = 'btn-preset btn-preset-allin';
        btn.textContent = `All-In ${amount.toLocaleString()}`;
        btn.addEventListener('click', () => {
            const slider = document.getElementById('bet-slider');
            if (slider) slider.value = parseInt(slider.max);
            const total = parseInt(slider.max) + sliderOffset;
            const input = document.getElementById('bet-amount-input');
            if (input) input.value = total;
            updateRaiseBtnText(total);
            presetsDiv.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
        presetsDiv.appendChild(btn);
    }

    if (presetsDiv.children.length > 0) {
        presetsDiv.classList.remove('hidden');
    }
}

let sliderOffset = 0; // currentBet to add for total display
function setupSlider(min, max, currentBet) {
    const slider = document.getElementById('bet-slider');
    slider.min = min; slider.max = max; slider.value = min;
    slider.step = Math.max(Math.floor(min / 2), 10);
    sliderOffset = currentBet || 0;
    // bet-amount-input is created dynamically in the raise row
    const input = document.getElementById('bet-amount-input');
    if (input) input.value = min + sliderOffset;
}

function sendActionAndHide(action) {
    client.sendAction(action);
    document.getElementById('action-bar').classList.add('hidden');
    stopTurnTimer();
}

function startTurnTimer(seconds) {
    stopTurnTimer();
    turnTimeLimit = seconds;
    turnTimerStart = Date.now();
    const timerEl = document.getElementById('turn-timer');
    timerEl.classList.remove('hidden');
    turnTimer = setInterval(() => {
        const elapsed = (Date.now() - turnTimerStart) / 1000;
        const remaining = Math.max(0, Math.ceil(turnTimeLimit - elapsed));
        timerEl.textContent = `⏱ ${remaining}s`;
        timerEl.style.color = remaining <= 10 ? '#f44' : 'var(--gold)';
        if (remaining <= 0) stopTurnTimer();
    }, 200);
}

function stopTurnTimer() {
    if (turnTimer) { clearInterval(turnTimer); turnTimer = null; }
    document.getElementById('turn-timer').classList.add('hidden');
    document.getElementById('action-bar').classList.add('hidden');
    document.getElementById('draw-action-bar').classList.add('hidden');
}

function onGameOver(data) {
    stopTurnTimer();
    saveCurrentHand();

    const ranking = data.ranking || [];
    const rankingText = ranking.map((p, i) => {
        const sign = p.totalWin >= 0 ? '+' : '';
        return `${i + 1}位 ${p.name}  ${sign}${p.totalWin}`;
    }).join('\n');

    ui.addLog('ゲーム終了！ Total Win ランキング：', 'important');
    ranking.forEach((p, i) => {
        const sign = p.totalWin >= 0 ? '+' : '';
        ui.addLog(`${i + 1}位 ${p.name}: ${sign}${p.totalWin}`, i === 0 ? 'important' : '');
    });

    if (isInZoom) return;

    setTimeout(() => {
        const msg = `ゲーム終了！\n\n【Total Win ランキング】\n${rankingText}\n\nロビーに戻りますか？`;
        if (confirm(msg)) {
            client.leaveRoom();
            showScreen('lobby');
        }
    }, 2000);
}

// ==========================================
// Stats Modal & localStorage Persistence
// ==========================================
const STATS_STORAGE_KEY = 'poker10mix_stats';
const ZOOM_STATS_KEY = 'poker10mix_zoom_stats';
const RAW_STATS_KEY = 'poker10mix_raw_stats';
const RAW_ZOOM_STATS_KEY = 'poker10mix_raw_zoom_stats';

function loadSavedStats() {
    try { const r = localStorage.getItem(STATS_STORAGE_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}
function saveSavedStats(stats) {
    try { localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats)); } catch (e) {}
}
function loadZoomStats() {
    try { const r = localStorage.getItem(ZOOM_STATS_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}
function saveZoomStats(stats) {
    try { localStorage.setItem(ZOOM_STATS_KEY, JSON.stringify(stats)); } catch (e) {}
}
function loadRawStats() {
    try { const r = localStorage.getItem(RAW_STATS_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}
function saveRawStats(stats) {
    try { localStorage.setItem(RAW_STATS_KEY, JSON.stringify(stats)); } catch (e) {}
}
function loadRawZoomStats() {
    try { const r = localStorage.getItem(RAW_ZOOM_STATS_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}
function saveRawZoomStats(stats) {
    try { localStorage.setItem(RAW_ZOOM_STATS_KEY, JSON.stringify(stats)); } catch (e) {}
}

function emptyRawStats() {
    return {
        handsPlayed: 0, handsWon: 0,
        vpipCount: 0, pfrCount: 0,
        threeBetCount: 0, threeBetOpp: 0,
        fourBetCount: 0, fourBetOpp: 0,
        foldTo3Bet: 0, foldTo3BetOpp: 0,
        allInCount: 0,
        postflopBets: 0, postflopRaises: 0,
        postflopCalls: 0, postflopChecks: 0, postflopFolds: 0,
        sawPostflop: 0, wentToShowdown: 0, wonAtShowdown: 0,
        totalChipsWon: 0, totalChipsLost: 0,
        showdownWinnings: 0, nonShowdownWinnings: 0,
    };
}

function mergeRawStats(target, source) {
    for (const key of Object.keys(target)) {
        if (typeof target[key] === 'number' && typeof source[key] === 'number') {
            target[key] += source[key];
        }
    }
}

function calcFromRaw(s) {
    const pct = (n, d) => d > 0 ? (n / d * 100).toFixed(1) : '-';
    const ratio = (n, d) => d > 0 ? (n / d).toFixed(2) : '-';
    return {
        hands: s.handsPlayed,
        vpip: pct(s.vpipCount, s.handsPlayed),
        pfr: pct(s.pfrCount, s.handsPlayed),
        threeBet: pct(s.threeBetCount, s.threeBetOpp),
        fourBet: pct(s.fourBetCount, s.fourBetOpp),
        foldTo3Bet: pct(s.foldTo3Bet, s.foldTo3BetOpp),
        allIn: pct(s.allInCount, s.handsPlayed),
        postflopAgg: pct(s.postflopBets + s.postflopRaises,
            s.postflopBets + s.postflopRaises + s.postflopCalls + s.postflopChecks),
        af: ratio(s.postflopBets + s.postflopRaises, s.postflopCalls),
        wtsd: pct(s.wentToShowdown, s.sawPostflop),
        wsd: pct(s.wonAtShowdown, s.wentToShowdown),
        winRate: s.handsPlayed > 0 ?
            ((s.totalChipsWon - s.totalChipsLost) / s.handsPlayed * 100).toFixed(1) : '-',
        showdownWin: s.showdownWinnings,
        nonShowdownWin: s.nonShowdownWinnings,
    };
}

// Stats history for graphs
const STATS_HISTORY_KEY = 'poker10mix_stats_history';
function loadStatsHistory() {
    try { const r = localStorage.getItem(STATS_HISTORY_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}
function saveStatsHistory(h) {
    try { localStorage.setItem(STATS_HISTORY_KEY, JSON.stringify(h)); } catch (e) {}
}

// Track last session raw to compute delta
let lastSessionRaw = {};

// Called when server sends stats_update after each hand (keyed by player name)
function onStatsUpdate(data) {
    if (!data.stats) return;
    const rawAll = loadRawStats();
    const history = loadStatsHistory();
    const gameId = data.gameId || '';
    const isZoom = !!data.zoom;
    const roomId = data.roomId || '';

    for (const [name, serverData] of Object.entries(data.stats)) {
        if (serverData.raw) {
            if (!rawAll[name]) rawAll[name] = { total: emptyRawStats(), byGame: {}, byPosition: {} };
            const p = rawAll[name];
            // Compute delta from last session snapshot
            if (!lastSessionRaw[name]) lastSessionRaw[name] = { total: emptyRawStats(), byGame: {}, byPosition: {} };
            const prev = lastSessionRaw[name];

            // Delta total
            const deltaTotal = emptyRawStats();
            for (const key of Object.keys(deltaTotal)) {
                deltaTotal[key] = (serverData.raw[key] || 0) - (prev.total[key] || 0);
            }
            mergeRawStats(p.total, deltaTotal);
            prev.total = { ...serverData.raw };

            // Delta byGame
            if (serverData.rawByGame) {
                for (const [gid, gRaw] of Object.entries(serverData.rawByGame)) {
                    if (!p.byGame[gid]) p.byGame[gid] = emptyRawStats();
                    if (!prev.byGame[gid]) prev.byGame[gid] = emptyRawStats();
                    const dg = emptyRawStats();
                    for (const key of Object.keys(dg)) dg[key] = (gRaw[key] || 0) - (prev.byGame[gid][key] || 0);
                    mergeRawStats(p.byGame[gid], dg);
                    prev.byGame[gid] = { ...gRaw };
                }
            }
            // Delta byPosition
            if (serverData.rawByPos) {
                for (const [pos, posRaw] of Object.entries(serverData.rawByPos)) {
                    if (!p.byPosition[pos]) p.byPosition[pos] = { total: emptyRawStats(), byGame: {} };
                    if (!prev.byPosition[pos]) prev.byPosition[pos] = { total: emptyRawStats(), byGame: {} };
                    if (posRaw.total) {
                        const dp = emptyRawStats();
                        for (const key of Object.keys(dp)) dp[key] = (posRaw.total[key] || 0) - (prev.byPosition[pos].total[key] || 0);
                        mergeRawStats(p.byPosition[pos].total, dp);
                        prev.byPosition[pos].total = { ...posRaw.total };
                    }
                    if (posRaw.byGame) {
                        for (const [gid, gRaw] of Object.entries(posRaw.byGame)) {
                            if (!p.byPosition[pos].byGame[gid]) p.byPosition[pos].byGame[gid] = emptyRawStats();
                            if (!prev.byPosition[pos].byGame[gid]) prev.byPosition[pos].byGame[gid] = emptyRawStats();
                            const dpg = emptyRawStats();
                            for (const key of Object.keys(dpg)) dpg[key] = (gRaw[key] || 0) - (prev.byPosition[pos].byGame[gid][key] || 0);
                            mergeRawStats(p.byPosition[pos].byGame[gid], dpg);
                            prev.byPosition[pos].byGame[gid] = { ...gRaw };
                        }
                    }
                }
            }
        }
    }
    saveRawStats(rawAll);

    // Recalculate display stats from accumulated raw
    const saved = {};
    for (const [name, p] of Object.entries(rawAll)) {
        const calc = calcFromRaw(p.total);
        const byGame = {};
        for (const [gid, gRaw] of Object.entries(p.byGame)) {
            byGame[gid] = calcFromRaw(gRaw);
        }
        const byPos = {};
        for (const [pos, posData] of Object.entries(p.byPosition)) {
            const posCalc = calcFromRaw(posData.total);
            const posByGame = {};
            for (const [gid, gRaw] of Object.entries(posData.byGame)) {
                posByGame[gid] = calcFromRaw(gRaw);
            }
            byPos[pos] = { ...posCalc, byGame: posByGame };
        }
        saved[name] = { ...calc, byGame, byPosition: byPos };
    }
    saveSavedStats(saved);

    // Graph history snapshots
    for (const [name, calc] of Object.entries(saved)) {
        const hands = parseInt(calc.hands) || 0;
        const snap = {
            h: hands,
            vpip: parseFloat(calc.vpip) || 0,
            pfr: parseFloat(calc.pfr) || 0,
            threeBet: parseFloat(calc.threeBet) || 0,
            fourBet: parseFloat(calc.fourBet) || 0,
            foldTo3Bet: parseFloat(calc.foldTo3Bet) || 0,
            allIn: parseFloat(calc.allIn) || 0,
            agg: parseFloat(calc.postflopAgg) || 0,
            af: parseFloat(calc.af) || 0,
            wtsd: parseFloat(calc.wtsd) || 0,
            wsd: parseFloat(calc.wsd) || 0,
            wr: parseFloat(calc.winRate) || 0,
            sdWin: parseInt(calc.showdownWin) || 0,
            nsdWin: parseInt(calc.nonShowdownWin) || 0,
            totalWin: (parseInt(calc.showdownWin) || 0) + (parseInt(calc.nonShowdownWin) || 0),
            gid: gameId,
            zm: isZoom ? 1 : 0,
            rid: roomId,
        };
        if (!history[name]) history[name] = [];
        const arr = history[name];
        if (arr.length === 0 || hands > (arr[arr.length - 1].h || 0)) {
            arr.push(snap);
            if (arr.length > 5000) arr.splice(0, arr.length - 5000);
        }
    }
    saveStatsHistory(history);

    // Zoom-only stats for ranking
    if (isZoom) {
        const rawZoom = loadRawZoomStats();
        for (const [name, serverData] of Object.entries(data.stats)) {
            if (serverData.raw) {
                if (!rawZoom[name]) rawZoom[name] = emptyRawStats();
                if (!lastSessionRaw[name]) lastSessionRaw[name] = { total: emptyRawStats(), byGame: {}, byPosition: {} };
                // Use same delta approach - zoom delta = session raw - prev session raw (already calculated above, so just use the session raw delta)
                const prev = lastSessionRaw[name];
                // prev.total was already updated above, so use raw directly minus what it was before this update
                // Actually we can just rebuild from rawAll for zoom portion
                // Simpler: track zoom raw separately with delta
            }
        }
        // Rebuild zoom stats from rawAll filtered (not possible without tagging)
        // Alternative: just accumulate zoom raw with delta like total
        for (const [name, serverData] of Object.entries(data.stats)) {
            if (serverData.raw) {
                if (!rawZoom[name]) rawZoom[name] = emptyRawStats();
                const zKey = '_zm_' + name;
                if (!lastSessionRaw[zKey]) lastSessionRaw[zKey] = emptyRawStats();
                const dz = emptyRawStats();
                for (const key of Object.keys(dz)) dz[key] = (serverData.raw[key] || 0) - (lastSessionRaw[zKey][key] || 0);
                mergeRawStats(rawZoom[name], dz);
                lastSessionRaw[zKey] = { ...serverData.raw };
            }
        }
        saveRawZoomStats(rawZoom);
        const zoomSaved = {};
        for (const [name, raw] of Object.entries(rawZoom)) {
            zoomSaved[name] = calcFromRaw(raw);
        }
        saveZoomStats(zoomSaved);
    }
}

function setupStatsModal() {
    document.getElementById('btn-stats-close').addEventListener('click', () => {
        document.getElementById('stats-modal').classList.add('hidden');
    });
    document.getElementById('btn-lobby-stats').addEventListener('click', () => {
        renderStatsFromStorage();
        document.getElementById('stats-modal').classList.remove('hidden');
    });
}

// Render stats from server (in-game)
function renderStats(data) {
    const container = document.getElementById('stats-table-container');
    if (!data.stats || Object.keys(data.stats).length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:16px;">データなし</p>';
        return;
    }
    let html = '';
    for (const [seatId, c] of Object.entries(data.stats)) {
        const pName = (currentState && currentState.players[seatId]) ? currentState.players[seatId].name : 'Player ' + seatId;
        const isMeClass = parseInt(seatId) === data.mySeat ? ' style="color:var(--gold)"' : '';
        html += renderStatsBlock(pName, c, isMeClass);
    }
    container.innerHTML = html;
}

// Render stats from localStorage (lobby) - default: my stats only
function renderStatsFromStorage() {
    const container = document.getElementById('stats-table-container');
    const saved = loadSavedStats();

    // Search bar
    let html = '<div class="stats-toolbar">';
    html += '<div class="stats-search-box"><input type="text" id="stats-search-input" placeholder="プレイヤー名で検索..." autocomplete="off"><button id="btn-stats-search" class="btn-small">検索</button></div>';
    html += '</div>';

    // Show my stats
    const myStats = saved[client.name];
    if (myStats && myStats.hands > 0) {
        html += renderPlayerStatsWithTabs(client.name, myStats, ' style="color:var(--gold)"');
    } else {
        html += '<p style="color:var(--text-dim);padding:16px;">まだスタッツがありません。ゲームをプレイすると記録されます。</p>';
    }

    container.innerHTML = html;
    bindStatsEvents(container);
}

// Render search result for a specific player
function renderStatsSearchResult(playerName) {
    const container = document.getElementById('stats-table-container');
    const saved = loadSavedStats();

    let html = '<div class="stats-toolbar">';
    html += '<div class="stats-search-box"><input type="text" id="stats-search-input" placeholder="プレイヤー名で検索..." autocomplete="off" value="' + playerName.replace(/"/g, '&quot;') + '"><button id="btn-stats-search" class="btn-small">検索</button></div>';
    html += '<button id="btn-stats-back-me" class="btn-small">自分に戻る</button>';
    html += '</div>';

    // Find matching players
    const query = playerName.toLowerCase();
    const matches = Object.entries(saved).filter(([name]) => name.toLowerCase().includes(query));

    if (matches.length === 0) {
        html += `<p style="color:var(--text-dim);padding:16px;">"${playerName}" に一致するプレイヤーが見つかりません</p>`;
    } else {
        for (const [name, c] of matches) {
            const isMe = name === client.name ? ' style="color:var(--gold)"' : '';
            html += renderPlayerStatsWithTabs(name, c, isMe);
        }
    }

    container.innerHTML = html;
    bindStatsEvents(container);
    const backBtn = document.getElementById('btn-stats-back-me');
    if (backBtn) backBtn.addEventListener('click', renderStatsFromStorage);
}

function bindStatsEvents(container) {
    container.querySelectorAll('.stats-tab').forEach(tab => {
        tab.addEventListener('click', (e) => handleStatsTabClick(e.target));
    });
    bindDropdownEvents(container);
    const searchInput = document.getElementById('stats-search-input');
    const searchBtn = document.getElementById('btn-stats-search');
    if (searchBtn && searchInput) {
        const doSearch = () => {
            const q = searchInput.value.trim();
            if (q) renderStatsSearchResult(q);
        };
        searchBtn.addEventListener('click', doSearch);
        searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    }
}

// Ranking display
function renderRanking() {
    const container = document.getElementById('ranking-container');
    const saved = loadZoomStats();
    const entries = Object.entries(saved).filter(([, c]) => c.hands > 0);

    if (entries.length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:16px;">データなし</p>';
        return;
    }

    let html = '';

    // Win Rate ranking (all players, top 50)
    html += '<h3 class="ranking-section-title">Win Rate ランキング（上位50名）</h3>';
    const wrEntries = entries
        .map(([name, c]) => ({ name, winRate: parseFloat(c.winRate) || 0, hands: c.hands }))
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, 50);

    html += '<table class="ranking-table"><thead><tr><th>#</th><th>プレイヤー</th><th>Win Rate</th><th>ハンド数</th></tr></thead><tbody>';
    wrEntries.forEach((e, i) => {
        const isMe = e.name === client.name ? ' class="ranking-me"' : '';
        html += `<tr${isMe}><td>${i + 1}</td><td>${e.name}</td><td>${e.winRate}/100h</td><td>${e.hands.toLocaleString()}</td></tr>`;
    });
    html += '</tbody></table>';

    // Hands played ranking (all players, top 50)
    html += '<h3 class="ranking-section-title" style="margin-top:16px;">ハンド数ランキング（上位50名）</h3>';
    const handEntries = entries
        .map(([name, c]) => ({ name, hands: c.hands, winRate: c.winRate }))
        .sort((a, b) => b.hands - a.hands)
        .slice(0, 50);

    html += '<table class="ranking-table"><thead><tr><th>#</th><th>プレイヤー</th><th>ハンド数</th><th>Win Rate</th></tr></thead><tbody>';
    handEntries.forEach((e, i) => {
        const isMe = e.name === client.name ? ' class="ranking-me"' : '';
        html += `<tr${isMe}><td>${i + 1}</td><td>${e.name}</td><td>${e.hands.toLocaleString()}</td><td>${e.winRate}/100h</td></tr>`;
    });
    html += '</tbody></table>';

    container.innerHTML = html;
}

// Show stats for a specific player (avatar click)
function showPlayerStats(playerName) {
    const saved = loadSavedStats();
    const stats = saved[playerName];
    const container = document.getElementById('stats-table-container');
    if (!stats || !stats.hands) {
        container.innerHTML = `<h3 style="color:var(--gold)">${playerName}</h3><p style="color:var(--text-dim);padding:16px;">データなし</p>`;
    } else {
        container.innerHTML = renderPlayerStatsWithTabs(playerName, stats, ' style="color:var(--gold)"');
        container.querySelectorAll('.stats-tab').forEach(tab => {
            tab.addEventListener('click', (e) => handleStatsTabClick(e.target));
        });
        bindDropdownEvents(container);
    }
    document.getElementById('stats-modal').classList.remove('hidden');
}

function handleStatsTabClick(tab) {
    const panel = tab.closest('.stats-player-panel');
    if (!panel) return;
    panel.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    panel.querySelectorAll('.stats-tab-content').forEach(c => c.classList.add('hidden'));
    const target = panel.querySelector(`.stats-tab-content[data-tab="${tab.dataset.tab}"]`);
    if (target) target.classList.remove('hidden');
    // Render graph when graph tab selected
    if (tab.dataset.tab === 'graph') {
        const playerName = tab.dataset.player;
        if (target) initGraphTab(target, playerName);
    }
}

function bindDropdownEvents(container) {
    // Game dropdown
    container.querySelectorAll('.stats-game-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const panel = sel.closest('.stats-tab-content');
            panel.querySelectorAll('.stats-dropdown-content[data-game]').forEach(d => d.style.display = 'none');
            const target = panel.querySelector(`.stats-dropdown-content[data-game="${sel.value}"]`);
            if (target) target.style.display = '';
        });
    });
    // Position dropdown
    container.querySelectorAll('.stats-pos-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const panel = sel.closest('.stats-tab-content');
            panel.querySelectorAll('.stats-dropdown-content[data-pos]').forEach(d => d.style.display = 'none');
            const target = panel.querySelector(`.stats-dropdown-content[data-pos="${sel.value}"]`);
            if (target) target.style.display = '';
        });
    });
    // Position-game sub-dropdown
    container.querySelectorAll('.stats-pos-game-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const pos = sel.dataset.pos;
            const parentDiv = sel.closest(`.stats-dropdown-content[data-pos="${pos}"]`);
            if (!parentDiv) return;
            parentDiv.querySelectorAll('.stats-dropdown-content[data-pos-game]').forEach(d => d.style.display = 'none');
            if (sel.value) {
                const target = parentDiv.querySelector(`.stats-dropdown-content[data-pos-game="${pos}-${sel.value}"]`);
                if (target) target.style.display = '';
            }
        });
    });
}

const GAME_NAMES = {
    td: 'TD', lhe: 'LHE', o8: 'O8', razz: 'Razz', stud: 'Stud',
    stud8: 'Stud8', nlhe: 'NLHE', plo: 'PLO', sd: 'SD', badugi: 'Badugi'
};

function renderPlayerStatsWithTabs(pName, c, extraAttr) {
    let html = `<div class="stats-player-panel">`;
    html += `<h3${extraAttr || ''}>${pName} (${c.hands}ハンド)</h3>`;
    if (!c.hands || c.hands === 0) { html += '<p style="color:var(--text-dim)">データなし</p></div>'; return html; }

    // Tabs
    html += `<div class="stats-tabs-bar">`;
    html += `<button class="stats-tab active" data-tab="total">全体</button>`;
    html += `<button class="stats-tab" data-tab="game">ゲーム別</button>`;
    html += `<button class="stats-tab" data-tab="graph" data-player="${pName.replace(/"/g, '&quot;')}">グラフ</button>`;
    html += `</div>`;

    // Total tab
    html += `<div class="stats-tab-content" data-tab="total">${renderStatsTable(c)}</div>`;

    // Game tab (with dropdown)
    html += `<div class="stats-tab-content hidden" data-tab="game">`;
    if (c.byGame && Object.keys(c.byGame).length > 0) {
        html += `<select class="stats-dropdown stats-game-select">`;
        const gameEntries = Object.entries(c.byGame).filter(([, gs]) => gs.hands > 0);
        for (const [gid, gs] of gameEntries) {
            html += `<option value="${gid}">${GAME_NAMES[gid] || gid} (${gs.hands}h)</option>`;
        }
        html += `</select>`;
        for (const [gid, gs] of gameEntries) {
            html += `<div class="stats-dropdown-content" data-game="${gid}"${gid !== gameEntries[0][0] ? ' style="display:none"' : ''}>`;
            html += renderStatsTable(gs);
            html += `</div>`;
        }
    } else {
        html += '<p style="color:var(--text-dim)">データなし</p>';
    }
    html += `</div>`;

    // Graph tab
    html += `<div class="stats-tab-content hidden" data-tab="graph">`;
    html += `<div class="graph-controls" data-player="${pName.replace(/"/g, '&quot;')}">`;
    // Filter dropdowns
    html += `<div class="graph-filters">`;
    html += `<select class="graph-filter-game stats-dropdown"><option value="">全ゲーム</option>`;
    const gameList = [
        { id:'nlhe', name:'NLHE' }, { id:'lhe', name:'LHE' }, { id:'plo', name:'PLO' },
        { id:'o8', name:'O8' }, { id:'stud', name:'Stud' }, { id:'stud8', name:'Stud8' },
        { id:'razz', name:'Razz' }, { id:'td', name:'TD' }, { id:'sd', name:'SD' },
        { id:'badugi', name:'Badugi' },
    ];
    for (const g of gameList) html += `<option value="${g.id}">${g.name}</option>`;
    html += `</select>`;
    html += `<select class="graph-filter-source stats-dropdown"><option value="">全卓</option><option value="zoom">ZOOM卓のみ</option><option value="room">通常卓のみ</option></select>`;
    html += `<select class="graph-filter-room stats-dropdown"><option value="">全ルーム</option></select>`;
    html += `</div>`;
    html += `<div class="graph-checkboxes">`;
    const graphStats = [
        { key: 'vpip', label: 'VPIP', color: '#4fc3f7', checked: true },
        { key: 'pfr', label: 'PFR', color: '#f0c040', checked: true },
        { key: 'threeBet', label: '3-Bet', color: '#e65100', checked: false },
        { key: 'fourBet', label: '4-Bet', color: '#ab47bc', checked: false },
        { key: 'foldTo3Bet', label: 'Fold to 3Bet', color: '#ef5350', checked: false },
        { key: 'allIn', label: 'All-in%', color: '#ff7043', checked: false },
        { key: 'agg', label: 'Agg%', color: '#66bb6a', checked: false },
        { key: 'af', label: 'AF', color: '#26a69a', checked: false },
        { key: 'wtsd', label: 'WTSD%', color: '#42a5f5', checked: false },
        { key: 'wsd', label: 'W$SD', color: '#7e57c2', checked: false },
        { key: 'wr', label: 'Win Rate', color: '#ffa726', checked: true },
        { key: 'sdWin', label: 'SD Win', color: '#29b6f6', checked: false },
        { key: 'nsdWin', label: 'Non-SD Win', color: '#9ccc65', checked: false },
        { key: 'totalWin', label: 'Total Win', color: '#ff8a65', checked: false },
    ];
    for (const gs of graphStats) {
        html += `<label class="graph-cb-label" style="color:${gs.color}"><input type="checkbox" class="graph-cb" data-key="${gs.key}" ${gs.checked ? 'checked' : ''}>${gs.label}</label>`;
    }
    html += `</div>`;
    html += `<canvas class="stats-graph-canvas" width="560" height="280"></canvas>`;
    html += `<div class="graph-summary"></div>`;
    html += `</div></div>`;

    html += `</div>`;
    return html;
}

function renderStatsTable(c) {
    return `<table class="stats-table"><tbody>
        <tr><td class="stat-label">VPIP</td><td class="stat-value">${c.vpip}%</td>
        <td class="stat-label">PFR</td><td class="stat-value">${c.pfr}%</td></tr>
        <tr><td class="stat-label">3-Bet</td><td class="stat-value">${c.threeBet}%</td>
        <td class="stat-label">4-Bet</td><td class="stat-value">${c.fourBet}%</td></tr>
        <tr><td class="stat-label">Fold to 3Bet</td><td class="stat-value">${c.foldTo3Bet}%</td>
        <td class="stat-label">All-in%</td><td class="stat-value">${c.allIn}%</td></tr>
        <tr><td class="stat-label">Agg%</td><td class="stat-value">${c.postflopAgg}%</td>
        <td class="stat-label">AF</td><td class="stat-value">${c.af}</td></tr>
        <tr><td class="stat-label">WTSD%</td><td class="stat-value">${c.wtsd}%</td>
        <td class="stat-label">W$SD</td><td class="stat-value">${c.wsd}%</td></tr>
        <tr><td class="stat-label">Win Rate</td><td class="stat-value">${c.winRate}/100h</td>
        <td class="stat-label">SD Win</td><td class="stat-value">${typeof c.showdownWin === 'number' ? c.showdownWin.toLocaleString() : c.showdownWin}</td></tr>
        <tr><td class="stat-label">Non-SD Win</td><td class="stat-value">${typeof c.nonShowdownWin === 'number' ? c.nonShowdownWin.toLocaleString() : (c.nonShowdownWin || '-')}</td>
        <td class="stat-label">Total Win</td><td class="stat-value">${typeof c.showdownWin === 'number' ? ((c.showdownWin || 0) + (c.nonShowdownWin || 0)).toLocaleString() : '-'}</td></tr>
    </tbody></table>`;
}

// Legacy alias
function renderStatsBlock(pName, c, extraAttr) {
    return renderPlayerStatsWithTabs(pName, c, extraAttr);
}

// ==========================================
// Stats Graph
// ==========================================
const GRAPH_STAT_META = {
    vpip: { label: 'VPIP', color: '#4fc3f7', unit: '%' },
    pfr: { label: 'PFR', color: '#f0c040', unit: '%' },
    threeBet: { label: '3-Bet', color: '#e65100', unit: '%' },
    fourBet: { label: '4-Bet', color: '#ab47bc', unit: '%' },
    foldTo3Bet: { label: 'Fold to 3Bet', color: '#ef5350', unit: '%' },
    allIn: { label: 'All-in%', color: '#ff7043', unit: '%' },
    agg: { label: 'Agg%', color: '#66bb6a', unit: '%' },
    af: { label: 'AF', color: '#26a69a', unit: '' },
    wtsd: { label: 'WTSD%', color: '#42a5f5', unit: '%' },
    wsd: { label: 'W$SD', color: '#7e57c2', unit: '%' },
    wr: { label: 'Win Rate', color: '#ffa726', unit: '/100h' },
    sdWin: { label: 'SD Win', color: '#29b6f6', unit: '' },
    nsdWin: { label: 'Non-SD Win', color: '#9ccc65', unit: '' },
    totalWin: { label: 'Total Win', color: '#ff8a65', unit: '' },
};

function initGraphTab(graphContent, playerName) {
    const canvas = graphContent.querySelector('.stats-graph-canvas');
    if (!canvas) return;
    const controls = graphContent.querySelector('.graph-controls');
    if (!controls) return;

    // Populate room dropdown from history data
    const history = loadStatsHistory();
    const pData = history[playerName] || [];
    const roomSelect = controls.querySelector('.graph-filter-room');
    if (roomSelect) {
        const rooms = new Set();
        for (const d of pData) { if (d.rid && d.rid !== 'zoom') rooms.add(d.rid); }
        roomSelect.innerHTML = '<option value="">全ルーム</option>';
        for (const rid of rooms) {
            roomSelect.innerHTML += `<option value="${rid}">${rid}</option>`;
        }
    }

    const summaryDiv = graphContent.querySelector('.graph-summary');
    const draw = () => {
        const selected = [];
        controls.querySelectorAll('.graph-cb:checked').forEach(cb => selected.push(cb.dataset.key));
        const gameFilter = controls.querySelector('.graph-filter-game')?.value || '';
        const sourceFilter = controls.querySelector('.graph-filter-source')?.value || '';
        const roomFilter = controls.querySelector('.graph-filter-room')?.value || '';
        drawStatsGraph(canvas, playerName, selected, { gameFilter, sourceFilter, roomFilter });
        // Update summary with latest values
        if (summaryDiv) {
            const hist = loadStatsHistory();
            let pHist = hist[playerName] || [];
            if (gameFilter || sourceFilter || roomFilter) {
                pHist = pHist.filter(d => {
                    if (gameFilter && d.gid !== gameFilter) return false;
                    if (sourceFilter === 'zoom' && !d.zm) return false;
                    if (sourceFilter === 'room' && d.zm) return false;
                    if (roomFilter && d.rid !== roomFilter) return false;
                    return true;
                });
            }
            const last = pHist.length > 0 ? pHist[pHist.length - 1] : null;
            if (last && selected.length > 0) {
                let shtml = '';
                for (const key of selected) {
                    const meta = GRAPH_STAT_META[key];
                    if (!meta) continue;
                    const val = last[key];
                    const display = val !== undefined && isFinite(val)
                        ? (Number.isInteger(val) ? val.toLocaleString() : val.toFixed(1))
                        : '-';
                    shtml += `<span class="graph-summary-item" style="color:${meta.color}"><span class="graph-summary-label">${meta.label}</span><span class="graph-summary-value">${display}${meta.unit}</span></span>`;
                }
                summaryDiv.innerHTML = shtml;
            } else {
                summaryDiv.innerHTML = '';
            }
        }
    };

    // Bind checkbox and filter changes
    controls.querySelectorAll('.graph-cb').forEach(cb => {
        cb.removeEventListener('change', cb._graphHandler);
        cb._graphHandler = draw;
        cb.addEventListener('change', draw);
    });
    controls.querySelectorAll('.graph-filter-game, .graph-filter-source, .graph-filter-room').forEach(sel => {
        sel.removeEventListener('change', sel._graphHandler);
        sel._graphHandler = draw;
        sel.addEventListener('change', draw);
    });

    draw();
}

function drawStatsGraph(canvas, playerName, selectedKeys, filters) {
    filters = filters || {};
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 560;
    const h = canvas.clientHeight || 280;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, w, h);

    const history = loadStatsHistory();
    let data = history[playerName];
    // Apply filters
    if (data && (filters.gameFilter || filters.sourceFilter || filters.roomFilter)) {
        data = data.filter(d => {
            if (filters.gameFilter && d.gid !== filters.gameFilter) return false;
            if (filters.sourceFilter === 'zoom' && !d.zm) return false;
            if (filters.sourceFilter === 'room' && d.zm) return false;
            if (filters.roomFilter && d.rid !== filters.roomFilter) return false;
            return true;
        });
    }
    if (!data || data.length < 2 || selectedKeys.length === 0) {
        ctx.fillStyle = '#7a8090';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(data && data.length < 2 ? 'データが不足しています（2ハンド以上必要）' : 'スタッツを選択してください', w / 2, h / 2);
        return;
    }

    const pad = { top: 20, right: 16, bottom: 36, left: 48 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Find ranges
    const minH = data[0].h;
    const maxH = data[data.length - 1].h;
    const hRange = maxH - minH || 1;

    // Find y range across selected stats
    let yMin = Infinity, yMax = -Infinity;
    for (const d of data) {
        for (const key of selectedKeys) {
            const v = d[key];
            if (v !== undefined && isFinite(v)) {
                if (v < yMin) yMin = v;
                if (v > yMax) yMax = v;
            }
        }
    }
    if (!isFinite(yMin)) { yMin = 0; yMax = 100; }
    const yPad = (yMax - yMin) * 0.1 || 5;
    yMin = Math.max(yMin - yPad, selectedKeys.includes('wr') ? yMin - yPad : 0);
    yMax = yMax + yPad;
    const yRange = yMax - yMin || 1;

    // Grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    const ySteps = 5;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#7a8090';
    ctx.textAlign = 'right';
    for (let i = 0; i <= ySteps; i++) {
        const y = pad.top + plotH - (plotH * i / ySteps);
        const val = yMin + yRange * i / ySteps;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.fillText(val.toFixed(1), pad.left - 4, y + 3);
    }

    // X axis labels
    ctx.textAlign = 'center';
    const xSteps = Math.min(5, data.length - 1);
    for (let i = 0; i <= xSteps; i++) {
        const hVal = minH + hRange * i / xSteps;
        const x = pad.left + plotW * i / xSteps;
        ctx.fillText(Math.round(hVal).toLocaleString(), x, h - pad.bottom + 16);
    }
    ctx.fillText('ハンド数', pad.left + plotW / 2, h - 4);

    // Draw lines
    for (const key of selectedKeys) {
        const meta = GRAPH_STAT_META[key];
        if (!meta) continue;
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (const d of data) {
            const v = d[key];
            if (v === undefined || !isFinite(v)) continue;
            const x = pad.left + plotW * ((d.h - minH) / hRange);
            const y = pad.top + plotH - plotH * ((v - yMin) / yRange);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Legend
    ctx.font = '10px sans-serif';
    let lx = pad.left;
    const ly = pad.top - 6;
    for (const key of selectedKeys) {
        const meta = GRAPH_STAT_META[key];
        if (!meta) continue;
        ctx.fillStyle = meta.color;
        ctx.fillRect(lx, ly - 8, 12, 3);
        ctx.fillText(meta.label, lx + 15, ly - 2);
        lx += ctx.measureText(meta.label).width + 28;
    }
}

// ==========================================
// Chat
// ==========================================
function setupChat() {
    function hookChatInput(inputId, sendId) {
        const input = document.getElementById(inputId);
        const send = document.getElementById(sendId);
        if (!input || !send) return;
        send.addEventListener('click', () => {
            const msg = input.value.trim();
            if (msg) { client.sendChat(msg); input.value = ''; }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') send.click();
        });
    }
    hookChatInput('lobby-chat-input', 'btn-lobby-chat-send');
    hookChatInput('room-chat-input', 'btn-room-chat-send');
    hookChatInput('game-chat-input', 'btn-game-chat-send');
}

function appendChatMsg(logId, from, message) {
    const log = document.getElementById(logId);
    if (!log) return;
    const div = document.createElement('div');
    div.className = 'room-chat-msg';
    div.innerHTML = `<span class="room-chat-name">${from}:</span> ${message}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function onChat(data) {
    // Room/game chat only (not lobby)
    ui.addLog(`[${data.from}] ${data.message}`, 'chat');
    appendChatMsg('room-chat-log', data.from, data.message);
}

function onLobbyChat(data) {
    // Lobby chat only
    appendChatMsg('lobby-chat-log', data.from, data.message);
}
