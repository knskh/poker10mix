// js/app.js - Multiplayer Application Controller
const client = new PokerClient();
const ui = new PokerUI();
let currentRoom = null;
let currentState = null;
let turnTimer = null;
let turnTimerStart = 0;
let turnTimeLimit = 45;
let loggedInAccount = null; // { name, email }
let isInZoom = false;
let handHistory = loadHandHistory(); // last 30 hands [{gameName, logs:[]}]
let currentHandLogs = []; // logs for current hand

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
    client.on('game_over', onGameOver);
    client.on('stats_data', renderStats);
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
    document.getElementById('btn-create-room').addEventListener('click', () => {
        client.createRoom();
    });
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

    // Ranking button
    document.getElementById('btn-lobby-ranking').addEventListener('click', () => {
        renderRanking();
        document.getElementById('ranking-modal').classList.remove('hidden');
    });
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
        tr.innerHTML = `<td>${r.id}</td><td>${r.hostName}</td><td>${r.playerCount}/6</td><td>${r.playing ? '<span style="color:#f44">進行中</span>' : '<span style="color:#4f4">待機中</span>'}</td>`;
        if (!r.playing && r.playerCount < 6) {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => client.joinRoom(r.id));
        }
        container.appendChild(tr);
    }
}

// ==========================================
// Room Screen
// ==========================================
let selectedGames = new Set();

function setupRoomScreen() {
    // Build game checkboxes
    const container = document.getElementById('room-game-checkboxes');
    GAME_LIST.forEach((g, i) => {
        const label = document.createElement('label');
        label.className = 'game-checkbox-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.index = i;
        selectedGames.add(i);
        cb.addEventListener('change', () => {
            if (cb.checked) selectedGames.add(i); else selectedGames.delete(i);
            client.updateSettings({ selectedGames: [...selectedGames] });
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(g.name));
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
    showScreen('room');
    renderRoom(room);
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

    // Show/hide host controls
    const isHost = room.hostId === client.clientId;
    document.getElementById('room-host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('room-waiting-msg').style.display = isHost ? 'none' : 'block';


    // Update settings from room
    if (room.settings) {
        selectedGames = new Set(room.settings.selectedGames);
        const checkboxes = document.querySelectorAll('#room-game-checkboxes input');
        checkboxes.forEach(cb => { cb.checked = selectedGames.has(parseInt(cb.dataset.index)); });
        document.getElementById('room-starting-chips').value = room.settings.startingChips;
    }
}

// ==========================================
// Game Screen
// ==========================================
function setupGameScreen() {
    // Rules button
    document.getElementById('game-rules-btn').addEventListener('click', () => {
        document.getElementById('rules-modal').classList.toggle('hidden');
    });
    document.getElementById('rules-close').addEventListener('click', () => {
        document.getElementById('rules-modal').classList.add('hidden');
    });

    // Bet slider
    document.getElementById('bet-slider').addEventListener('input', (e) => {
        document.getElementById('bet-amount-display').textContent = parseInt(e.target.value) + sliderOffset;
    });

    // Draw buttons
    document.getElementById('btn-draw').addEventListener('click', () => {
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

    // Zoom waiting overlay - lobby button
    document.getElementById('btn-zoom-waiting-lobby').addEventListener('click', () => {
        client.leaveZoom();
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
}

function onGameState(state) {
    currentState = state;
    if (state.zoom) {
        document.getElementById('zoom-waiting-overlay').classList.add('hidden');
        document.getElementById('zoom-sitout-overlay').classList.add('hidden');
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

function saveCurrentHand() {
    if (currentHandLogs.length > 1) {
        const gameName = currentState ? currentState.gameName : '';
        // Capture player's hand cards
        let myCards = '';
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
                    const RANK_D = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
                    const SUIT_D = { s:'♠', h:'♥', d:'♦', c:'♣' };
                    myCards = cards.map(c => (RANK_D[c.rank] || c.rank) + (SUIT_D[c.suit] || c.suit)).join(' ');
                }
            }
        }
        // Capture community cards
        let communityCards = '';
        if (currentState && currentState.communityCards && currentState.communityCards.length > 0) {
            const RANK_D = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
            const SUIT_D = { s:'♠', h:'♥', d:'♦', c:'♣' };
            communityCards = currentState.communityCards.map(c => (RANK_D[c.rank] || c.rank) + (SUIT_D[c.suit] || c.suit)).join(' ');
        }
        handHistory.push({ gameName, logs: [...currentHandLogs], time: new Date().toLocaleTimeString(), myCards, communityCards });
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
    let html = '';
    for (let i = handHistory.length - 1; i >= 0; i--) {
        const h = handHistory[i];
        html += `<div class="hand-history-item">`;
        html += `<div class="hand-history-header">#${i + 1} ${h.gameName} <span class="hand-history-time">${h.time}</span></div>`;
        if (h.myCards || h.communityCards) {
            html += `<div class="hand-history-cards">`;
            if (h.myCards) html += `<span class="hh-label">ハンド:</span> <span class="hh-cards">${h.myCards}</span>`;
            if (h.communityCards) html += ` <span class="hh-label">ボード:</span> <span class="hh-cards">${h.communityCards}</span>`;
            html += `</div>`;
        }
        html += `<div class="hand-history-logs">`;
        for (const log of h.logs) {
            html += `<div class="hand-history-log">${log}</div>`;
        }
        html += `</div></div>`;
    }
    container.innerHTML = html;
}

function onYourTurn(data) {
    startTurnTimer(data.timeLimit || 45);
    showActionButtons(data.actions, data);
}

function onYourDraw(data) {
    startTurnTimer(data.timeLimit || 45);
    ui.pendingDraw = true;
    ui.selectedCards.clear();
    document.getElementById('draw-action-bar').classList.remove('hidden');
    // Re-render hand for selection
    if (currentState) ui.renderPlayerHand(currentState);
}

function showActionButtons(actions, turnData) {
    const bar = document.getElementById('action-bar');
    const btnDiv = document.getElementById('action-buttons');
    const sliderArea = document.getElementById('bet-slider-area');
    const presetsDiv = document.getElementById('bet-presets');
    bar.classList.remove('hidden');
    btnDiv.innerHTML = '';
    sliderArea.classList.add('hidden');
    presetsDiv.classList.add('hidden');
    presetsDiv.innerHTML = '';
    let hasSlider = false;
    let sliderAction = null; // 'bet' or 'raise'
    let sliderMin = 0, sliderMax = 0;

    for (const action of actions) {
        const btn = document.createElement('button');
        btn.className = `btn-action btn-${action.type}`;

        switch (action.type) {
            case 'fold':
                btn.textContent = 'フォールド';
                btn.addEventListener('click', () => { sendActionAndHide({ type: 'fold' }); });
                break;
            case 'check':
                btn.textContent = 'チェック';
                btn.addEventListener('click', () => { sendActionAndHide({ type: 'check' }); });
                break;
            case 'call':
                btn.textContent = `コール ${action.amount}`;
                btn.addEventListener('click', () => { sendActionAndHide({ type: 'call', amount: action.amount }); });
                break;
            case 'bet':
                if (action.min !== undefined) {
                    btn.textContent = 'ベット';
                    hasSlider = true;
                    sliderAction = 'bet';
                    sliderMin = action.min;
                    sliderMax = action.max;
                    btn.addEventListener('click', () => {
                        const val = parseInt(document.getElementById('bet-slider').value);
                        sendActionAndHide({ type: 'bet', amount: val });
                    });
                    setupSlider(action.min, action.max, 0);
                } else {
                    btn.textContent = `ベット ${action.amount}`;
                    btn.addEventListener('click', () => { sendActionAndHide({ type: 'bet', amount: action.amount }); });
                }
                break;
            case 'raise':
                if (action.min !== undefined) {
                    btn.textContent = 'レイズ';
                    hasSlider = true;
                    sliderAction = 'raise';
                    sliderMin = action.min;
                    sliderMax = action.max;
                    const curBet = action.currentBet || 0;
                    btn.addEventListener('click', () => {
                        const val = parseInt(document.getElementById('bet-slider').value);
                        sendActionAndHide({ type: 'raise', amount: val });
                    });
                    setupSlider(action.min, action.max, curBet);
                } else {
                    btn.textContent = `レイズ ${action.total || action.amount}`;
                    btn.addEventListener('click', () => { sendActionAndHide({ type: 'raise', amount: action.amount }); });
                }
                break;
            case 'allin':
                btn.textContent = `オールイン ${action.total || action.amount}`;
                btn.className = 'btn-action btn-allin';
                btn.addEventListener('click', () => { sendActionAndHide({ type: 'allin', amount: action.amount }); });
                break;
        }
        btnDiv.appendChild(btn);
    }
    if (hasSlider) {
        sliderArea.classList.remove('hidden');
        renderBetPresets(turnData, sliderAction, sliderMin, sliderMax);
    }
}

function renderBetPresets(turnData, sliderAction, sliderMin, sliderMax) {
    const presetsDiv = document.getElementById('bet-presets');
    if (!turnData) return;
    const presets = [];
    const bb = turnData.bigBlind || 100;
    const pot = turnData.pot || 0;
    const isFirstRound = turnData.isFirstRound;
    const tableBet = turnData.currentBet || 0;

    // Preflop unopened: BB-based buttons (when currentBet <= bigBlind, meaning no open raise yet)
    if (isFirstRound && tableBet <= bb) {
        [2, 2.5, 3, 3.5, 4].forEach(mult => {
            const amount = Math.round(bb * mult);
            presets.push({ label: `${mult}BB`, amount });
        });
    } else if (!isFirstRound) {
        // Postflop: pot percentage buttons
        [0.33, 0.66, 1.0, 1.5].forEach(pct => {
            const amount = Math.round(pot * pct);
            presets.push({ label: `${Math.round(pct * 100)}%`, amount });
        });
    }

    if (presets.length === 0) return;

    for (const p of presets) {
        const btn = document.createElement('button');
        btn.className = 'btn-preset';
        btn.textContent = p.label;
        const clampedVal = Math.max(sliderMin, Math.min(p.amount, sliderMax));
        btn.addEventListener('click', () => {
            const slider = document.getElementById('bet-slider');
            slider.value = clampedVal;
            document.getElementById('bet-amount-display').textContent = clampedVal + sliderOffset;
        });
        presetsDiv.appendChild(btn);
    }
    presetsDiv.classList.remove('hidden');
}

let sliderOffset = 0; // currentBet to add for total display
function setupSlider(min, max, currentBet) {
    const slider = document.getElementById('bet-slider');
    slider.min = min; slider.max = max; slider.value = min;
    slider.step = Math.max(Math.floor(min / 2), 10);
    sliderOffset = currentBet || 0;
    document.getElementById('bet-amount-display').textContent = min + sliderOffset;
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
    if (isInZoom) {
        ui.addLog(`${data.winner} が勝利！`, 'important');
        saveCurrentHand();
        return;
    }
    ui.addLog(`ゲーム終了！ ${data.winner} が優勝！`, 'important');
    saveCurrentHand();
    setTimeout(() => {
        if (confirm(`ゲーム終了！ ${data.winner} が優勝！\nロビーに戻りますか？`)) {
            client.leaveRoom();
            showScreen('lobby');
        }
    }, 2000);
}

// ==========================================
// Stats Modal & localStorage Persistence
// ==========================================
const STATS_STORAGE_KEY = 'poker10mix_stats';

function loadSavedStats() {
    try {
        const raw = localStorage.getItem(STATS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

function saveSavedStats(stats) {
    try { localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats)); } catch (e) {}
}

// Stats history for graphs
const STATS_HISTORY_KEY = 'poker10mix_stats_history';
function loadStatsHistory() {
    try { const r = localStorage.getItem(STATS_HISTORY_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}
function saveStatsHistory(h) {
    try { localStorage.setItem(STATS_HISTORY_KEY, JSON.stringify(h)); } catch (e) {}
}

// Called when server sends stats_update after each hand (keyed by player name)
function onStatsUpdate(data) {
    if (!data.stats) return;
    const saved = loadSavedStats();
    const history = loadStatsHistory();
    for (const [name, calc] of Object.entries(data.stats)) {
        saved[name] = calc;
        // Append snapshot to history (sample every hand)
        if (!history[name]) history[name] = [];
        const arr = history[name];
        const hands = parseInt(calc.hands) || 0;
        // Only add if hands increased
        if (arr.length === 0 || hands > (arr[arr.length - 1].h || 0)) {
            arr.push({
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
            });
            // Keep max 5000 snapshots per player
            if (arr.length > 5000) arr.splice(0, arr.length - 5000);
        }
    }
    saveSavedStats(saved);
    saveStatsHistory(history);
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
    const saved = loadSavedStats();
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
    html += `<button class="stats-tab" data-tab="position">ポジション別</button>`;
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

    // Position tab (with dropdown + per-game sub-dropdown)
    html += `<div class="stats-tab-content hidden" data-tab="position">`;
    if (c.byPosition && Object.keys(c.byPosition).length > 0) {
        const posOrder = ['BTN', 'SB', 'BB', 'CO', 'HJ', 'EP'];
        const posEntries = Object.entries(c.byPosition)
            .filter(([, ps]) => ps.hands > 0)
            .sort((a, b) => posOrder.indexOf(a[0]) - posOrder.indexOf(b[0]));
        html += `<select class="stats-dropdown stats-pos-select">`;
        for (const [pos, ps] of posEntries) {
            html += `<option value="${pos}">${pos} (${ps.hands}h)</option>`;
        }
        html += `</select>`;
        for (const [pos, ps] of posEntries) {
            html += `<div class="stats-dropdown-content" data-pos="${pos}"${pos !== posEntries[0][0] ? ' style="display:none"' : ''}>`;
            html += renderStatsTable(ps);
            // Per-game sub-dropdown within position
            if (ps.byGame && Object.keys(ps.byGame).length > 0) {
                const posGameEntries = Object.entries(ps.byGame).filter(([, gs]) => gs.hands > 0);
                if (posGameEntries.length > 0) {
                    html += `<h5 class="stats-sub-sub-header" style="margin-top:8px">ゲーム別</h5>`;
                    html += `<select class="stats-dropdown stats-pos-game-select" data-pos="${pos}">`;
                    html += `<option value="">-- 選択 --</option>`;
                    for (const [gid, gs] of posGameEntries) {
                        html += `<option value="${gid}">${GAME_NAMES[gid] || gid} (${gs.hands}h)</option>`;
                    }
                    html += `</select>`;
                    for (const [gid, gs] of posGameEntries) {
                        html += `<div class="stats-dropdown-content" data-pos-game="${pos}-${gid}" style="display:none">`;
                        html += renderStatsTable(gs);
                        html += `</div>`;
                    }
                }
            }
            html += `</div>`;
        }
    } else {
        html += '<p style="color:var(--text-dim)">データなし</p>';
    }
    html += `</div>`;

    // Graph tab
    html += `<div class="stats-tab-content hidden" data-tab="graph">`;
    html += `<div class="graph-controls" data-player="${pName.replace(/"/g, '&quot;')}">`;
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
    ];
    for (const gs of graphStats) {
        html += `<label class="graph-cb-label" style="color:${gs.color}"><input type="checkbox" class="graph-cb" data-key="${gs.key}" ${gs.checked ? 'checked' : ''}>${gs.label}</label>`;
    }
    html += `</div>`;
    html += `<canvas class="stats-graph-canvas" width="560" height="280"></canvas>`;
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
        <td></td><td></td></tr>
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
};

function initGraphTab(graphContent, playerName) {
    const canvas = graphContent.querySelector('.stats-graph-canvas');
    if (!canvas) return;
    const controls = graphContent.querySelector('.graph-controls');
    if (!controls) return;

    const draw = () => {
        const selected = [];
        controls.querySelectorAll('.graph-cb:checked').forEach(cb => selected.push(cb.dataset.key));
        drawStatsGraph(canvas, playerName, selected);
    };

    // Bind checkbox changes
    controls.querySelectorAll('.graph-cb').forEach(cb => {
        cb.removeEventListener('change', cb._graphHandler);
        cb._graphHandler = draw;
        cb.addEventListener('change', draw);
    });

    draw();
}

function drawStatsGraph(canvas, playerName, selectedKeys) {
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
    const data = history[playerName];
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
    const input = document.getElementById('chat-input');
    const send = document.getElementById('btn-chat-send');
    if (!input || !send) return;
    send.addEventListener('click', () => {
        const msg = input.value.trim();
        if (msg) { client.sendChat(msg); input.value = ''; }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') send.click();
    });
}

function onChat(data) {
    ui.addLog(`[${data.from}] ${data.message}`, 'chat');
}
