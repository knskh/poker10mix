// js/app.js - Multiplayer Application Controller
const client = new PokerClient();
const ui = new PokerUI();
let currentRoom = null;
let currentState = null;
let turnTimer = null;
let turnTimerStart = 0;
let turnTimeLimit = 45;

document.addEventListener('DOMContentLoaded', () => {
    setupLoginScreen();
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
    client.on('game_state', onGameState);
    client.on('your_turn', onYourTurn);
    client.on('your_draw', onYourDraw);
    client.on('log', (d) => ui.addLog(d.message, d.cls));
    client.on('chat', onChat);
    client.on('game_over', onGameOver);
    client.on('stats_data', renderStats);
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
    document.getElementById('btn-enter').addEventListener('click', () => {
        const name = input.value.trim();
        if (!name || name.length < 1) { alert('名前を入力してください'); return; }
        client.setName(name);
        showScreen('lobby');
        document.getElementById('lobby-username').textContent = name;
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-enter').click();
    });
}

// ==========================================
// Lobby Screen
// ==========================================
function setupLobbyScreen() {
    document.getElementById('btn-create-room').addEventListener('click', () => {
        client.createRoom();
    });
    document.getElementById('btn-join-by-id').addEventListener('click', () => {
        const id = document.getElementById('room-id-input').value.trim().toUpperCase();
        if (id.length === 4) client.joinRoom(id);
    });
    document.getElementById('room-id-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-join-by-id').click();
    });
    document.getElementById('btn-refresh-rooms').addEventListener('click', () => client.getRooms());
}

function renderRoomList(rooms) {
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
        document.getElementById('bet-amount-display').textContent = e.target.value;
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
}

function onGameStarted() {
    showScreen('game');
    document.getElementById('game-log').innerHTML = '';
    ui.addLog('ゲーム開始！', 'important');
}

function onGameState(state) {
    currentState = state;
    ui.renderFromServer(state);
}

function onYourTurn(data) {
    startTurnTimer(data.timeLimit || 45);
    showActionButtons(data.actions);
}

function onYourDraw(data) {
    startTurnTimer(data.timeLimit || 45);
    ui.pendingDraw = true;
    ui.selectedCards.clear();
    document.getElementById('draw-action-bar').classList.remove('hidden');
    // Re-render hand for selection
    if (currentState) ui.renderPlayerHand(currentState);
}

function showActionButtons(actions) {
    const bar = document.getElementById('action-bar');
    const btnDiv = document.getElementById('action-buttons');
    const sliderArea = document.getElementById('bet-slider-area');
    bar.classList.remove('hidden');
    btnDiv.innerHTML = '';
    sliderArea.classList.add('hidden');
    let hasSlider = false;

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
                    btn.addEventListener('click', () => {
                        const val = parseInt(document.getElementById('bet-slider').value);
                        sendActionAndHide({ type: 'bet', amount: val });
                    });
                    setupSlider(action.min, action.max);
                } else {
                    btn.textContent = `ベット ${action.amount}`;
                    btn.addEventListener('click', () => { sendActionAndHide({ type: 'bet', amount: action.amount }); });
                }
                break;
            case 'raise':
                if (action.min !== undefined) {
                    btn.textContent = 'レイズ';
                    hasSlider = true;
                    btn.addEventListener('click', () => {
                        const val = parseInt(document.getElementById('bet-slider').value);
                        sendActionAndHide({ type: 'raise', amount: val });
                    });
                    setupSlider(action.min, action.max);
                } else {
                    btn.textContent = `レイズ ${action.amount}`;
                    btn.addEventListener('click', () => { sendActionAndHide({ type: 'raise', amount: action.amount }); });
                }
                break;
            case 'allin':
                btn.textContent = `オールイン ${action.amount}`;
                btn.className = 'btn-action btn-allin';
                btn.addEventListener('click', () => { sendActionAndHide({ type: 'allin', amount: action.amount }); });
                break;
        }
        btnDiv.appendChild(btn);
    }
    if (hasSlider) sliderArea.classList.remove('hidden');
}

function setupSlider(min, max) {
    const slider = document.getElementById('bet-slider');
    slider.min = min; slider.max = max; slider.value = min;
    slider.step = Math.max(Math.floor(min / 2), 10);
    document.getElementById('bet-amount-display').textContent = min;
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
    ui.addLog(`ゲーム終了！ ${data.winner} が優勝！`, 'important');
    setTimeout(() => {
        if (confirm(`ゲーム終了！ ${data.winner} が優勝！\nロビーに戻りますか？`)) {
            client.leaveRoom();
            showScreen('lobby');
        }
    }, 2000);
}

// ==========================================
// Stats Modal
// ==========================================
function setupStatsModal() {
    document.getElementById('btn-stats-close').addEventListener('click', () => {
        document.getElementById('stats-modal').classList.add('hidden');
    });
}

function renderStats(data) {
    const container = document.getElementById('stats-table-container');
    if (!data.stats || Object.keys(data.stats).length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:16px;">データなし</p>';
        return;
    }
    let html = '';
    for (const [seatId, c] of Object.entries(data.stats)) {
        const pName = currentState ? currentState.players[seatId].name : 'Player ' + seatId;
        const isMeClass = parseInt(seatId) === data.mySeat ? ' style="color:var(--gold)"' : '';
        html += `<h3${isMeClass}>${pName} (${c.hands}ハンド)</h3>`;
        if (c.hands === 0) { html += '<p style="color:var(--text-dim)">データなし</p>'; continue; }
        html += `<table class="stats-table"><tbody>
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
        </tbody></table>`;
    }
    container.innerHTML = html;
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
