// js/app.js - Multiplayer Application Controller
const client = new PokerClient();
const ui = new PokerUI();

// ==========================================
// Avatar System
// ==========================================
const AVATAR_LIST = {
    people: [
        { id: 'samurai', label: '侍' }, { id: 'ninja', label: '忍者' },
        { id: 'wizard', label: '魔法使い' }, { id: 'king', label: '王' },
        { id: 'queen', label: '女王' }, { id: 'knight', label: '騎士' },
        { id: 'pirate', label: '海賊' }, { id: 'cowboy', label: 'カウボーイ' },
        { id: 'astronaut', label: '宇宙飛行士' }, { id: 'detective', label: '探偵' },
    ],
    animals: [
        { id: 'wolf', label: 'オオカミ' }, { id: 'eagle', label: 'ワシ' },
        { id: 'lion', label: 'ライオン' }, { id: 'fox', label: 'キツネ' },
        { id: 'owl', label: 'フクロウ' }, { id: 'dragon', label: 'ドラゴン' },
        { id: 'shark', label: 'サメ' }, { id: 'cat', label: 'ネコ' },
        { id: 'bear', label: 'クマ' }, { id: 'phoenix', label: 'フェニックス' },
    ],
    zodiac: [
        { id: 'aries', label: '牡羊座' }, { id: 'taurus', label: '牡牛座' },
        { id: 'gemini', label: '双子座' }, { id: 'leo', label: '獅子座' },
        { id: 'scorpio', label: '蠍座' }, { id: 'sagittarius', label: '射手座' },
        { id: 'star', label: '星' }, { id: 'moon', label: '月' },
        { id: 'sun', label: '太陽' }, { id: 'comet', label: '彗星' },
    ],
};
const ALL_AVATARS = [...AVATAR_LIST.people, ...AVATAR_LIST.animals, ...AVATAR_LIST.zodiac];
let selectedAvatar = localStorage.getItem('poker10mix_avatar') || null;

function getAvatarSrc(avatarId) {
    return avatarId ? `avatars/${avatarId}.svg` : null;
}

function setupAvatarPicker() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;

    function renderCategory(cat) {
        grid.innerHTML = '';
        const items = AVATAR_LIST[cat] || [];
        items.forEach(a => {
            const div = document.createElement('div');
            div.className = 'avatar-option' + (selectedAvatar === a.id ? ' selected' : '');
            div.title = a.label;
            div.dataset.avatar = a.id;
            div.innerHTML = `<img src="avatars/${a.id}.svg" alt="${a.label}">`;
            div.addEventListener('click', () => {
                selectedAvatar = a.id;
                localStorage.setItem('poker10mix_avatar', a.id);
                grid.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
            });
            grid.appendChild(div);
        });
    }

    // Tab switching
    document.querySelectorAll('.avatar-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.avatar-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderCategory(tab.dataset.cat);
        });
    });

    // Restore saved avatar or default to first category
    const savedCat = selectedAvatar
        ? (AVATAR_LIST.people.find(a => a.id === selectedAvatar) ? 'people'
            : AVATAR_LIST.animals.find(a => a.id === selectedAvatar) ? 'animals' : 'zodiac')
        : 'people';
    document.querySelector(`.avatar-tab[data-cat="${savedCat}"]`)?.classList.add('active');
    renderCategory(savedCat);

    // If no avatar saved, randomly assign one
    if (!selectedAvatar) {
        const rand = ALL_AVATARS[Math.floor(Math.random() * ALL_AVATARS.length)];
        selectedAvatar = rand.id;
        localStorage.setItem('poker10mix_avatar', rand.id);
        grid.querySelector(`[data-avatar="${rand.id}"]`)?.classList.add('selected');
    }
}

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
        // 3-tone fanfare: game change
        gameChange() {
            if (!enabled) return;
            try {
                const ac = getCtx();
                const t = ac.currentTime;
                playTone(523.25, t, 0.2, 0.3);       // C5
                playTone(659.25, t + 0.15, 0.2, 0.3); // E5
                playTone(783.99, t + 0.3, 0.4, 0.35); // G5
            } catch (e) {}
        },
    };
})();
let currentRoom = null;
let currentState = null;
let lastGameId = null; // Track game changes for overlay/sound
let preAction = null; // 'fold' | 'check-fold' | 'call' | null
let turnTimer = null;
let turnTimerStart = 0;
let turnTimeLimit = 45;
let loggedInAccount = null; // { name, email }
let myFollowing = new Set(); // names this user follows
let myFollowers = new Set(); // names that follow this user
let lastOnlineUsers = []; // cached for re-render after follow change
let isInZoom = false;
let currentTurnBB = 100; // bigBlind for current turn (for bb display in action buttons)
let handHistory = loadHandHistory(); // last 30 hands [{gameName, logs:[]}]
let currentHandLogs = []; // logs for current hand
let startingHandCards = []; // starting hand card objects captured at hand start
let cardSnapshots = []; // track card changes per round for stud/draw
let showdownPlayers = null; // opponent cards captured at showdown
let lastHandResult = null; // full hand result from server
let titleFlashInterval = null; // tab title flash timer
let focusMode = localStorage.getItem('poker10mix_focus') === 'on'; // focus mode state
let sitoutCountdownInterval = null; // local 1-sec sitout countdown
let sitoutLocalRemaining = null;    // client-side countdown value

// ==========================================
// Multi-Table Management
// ==========================================
const tables = new Map(); // roomId -> table context
let activeTableId = null;
const MAX_TABLES = 3;
const pendingSwitchQueue = []; // roomIds waiting to auto-switch after current action
let myTurnOnActiveTable = false; // true while action bar is showing on active table

function createTableContext(roomId) {
    return {
        roomId,
        room: null,
        state: null,
        lastGameId: null,
        preAction: null,
        turnTimer: null,
        turnTimerStart: 0,
        turnTimeLimit: 45,
        currentTurnBB: 100,
        handLogs: [],
        startingHandCards: [],
        cardSnapshots: [],
        showdownPlayers: null,
        lastHandResult: null,
        logHTML: '',        // saved game-log innerHTML
        chatHTML: '',       // saved chat-log innerHTML
        isMyTurn: false,    // for badge notification
        gameName: '',       // for tab label
    };
}

function saveActiveTableState() {
    if (!activeTableId) return;
    const ctx = tables.get(activeTableId);
    if (!ctx) return;
    ctx.room = currentRoom;
    ctx.state = currentState;
    ctx.lastGameId = lastGameId;
    ctx.preAction = preAction;
    ctx.turnTimer = turnTimer;
    ctx.turnTimerStart = turnTimerStart;
    ctx.turnTimeLimit = turnTimeLimit;
    ctx.currentTurnBB = currentTurnBB;
    ctx.handLogs = currentHandLogs;
    ctx.startingHandCards = startingHandCards;
    ctx.cardSnapshots = cardSnapshots;
    ctx.showdownPlayers = showdownPlayers;
    ctx.lastHandResult = lastHandResult;
    ctx.logHTML = document.getElementById('game-log').innerHTML;
    ctx.chatHTML = document.getElementById('chat-log').innerHTML;
}

function restoreTableState(roomId) {
    const ctx = tables.get(roomId);
    if (!ctx) return;
    currentRoom = ctx.room;
    currentState = ctx.state;
    lastGameId = ctx.lastGameId;
    preAction = ctx.preAction;
    turnTimer = ctx.turnTimer;
    turnTimerStart = ctx.turnTimerStart;
    turnTimeLimit = ctx.turnTimeLimit;
    currentTurnBB = ctx.currentTurnBB;
    currentHandLogs = ctx.handLogs;
    startingHandCards = ctx.startingHandCards;
    cardSnapshots = ctx.cardSnapshots;
    showdownPlayers = ctx.showdownPlayers;
    lastHandResult = ctx.lastHandResult;
    document.getElementById('game-log').innerHTML = ctx.logHTML;
    document.getElementById('chat-log').innerHTML = ctx.chatHTML;
}

function switchToTable(roomId) {
    if (activeTableId === roomId) return;
    // Save current table
    saveActiveTableState();
    // Hide action bars
    document.getElementById('action-bar').classList.add('hidden');
    document.getElementById('draw-action-bar').classList.add('hidden');
    // Restore target table
    activeTableId = roomId;
    restoreTableState(roomId);
    // Clear turn badge for this table
    const ctx = tables.get(roomId);
    if (ctx) ctx.isMyTurn = false;
    // Re-render game
    if (currentState) {
        ui.renderTable(currentState);
        ui.renderPlayerHand(currentState);
    }
    renderTableTabs();
}

function renderTableTabs() {
    const tabsEl = document.getElementById('table-tabs');
    const listEl = document.getElementById('table-tabs-list');
    // Always show the unified top bar while on game screen (hamburger must be accessible)
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen.classList.contains('hidden')) {
        tabsEl.classList.add('hidden');
        return;
    }
    tabsEl.classList.remove('hidden');
    if (!listEl) return;
    listEl.innerHTML = '';
    for (const [rid, ctx] of tables) {
        const tab = document.createElement('div');
        tab.className = 'table-tab' + (rid === activeTableId ? ' active' : '');
        const label = ctx.gameName || ctx.roomId;
        tab.innerHTML = `<span>${label}</span><span class="tab-badge ${ctx.isMyTurn && rid !== activeTableId ? 'visible' : ''}"></span>` +
            (tables.size > 1 ? `<span class="tab-close">×</span>` : '');
        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close')) {
                if (confirm('このテーブルを退出しますか？')) {
                    client.leaveRoom(rid);
                    removeTable(rid);
                }
                return;
            }
            switchToTable(rid);
        });
        listEl.appendChild(tab);
    }
    // Add "+" button
    const addBtn = document.createElement('div');
    addBtn.className = 'table-tab-add' + (tables.size >= MAX_TABLES ? ' disabled' : '');
    addBtn.textContent = '+';
    addBtn.title = tables.size >= MAX_TABLES ? '最大3テーブルまで' : 'テーブル追加';
    addBtn.addEventListener('click', () => {
        if (tables.size >= MAX_TABLES) return;
        openAddTableModal();
    });
    listEl.appendChild(addBtn);
}

function removeTable(roomId) {
    const ctx = tables.get(roomId);
    if (ctx && ctx.turnTimer) clearInterval(ctx.turnTimer);
    tables.delete(roomId);
    if (activeTableId === roomId) {
        if (tables.size > 0) {
            const nextId = tables.keys().next().value;
            activeTableId = nextId;
            restoreTableState(nextId);
            if (currentState) {
                ui.renderTable(currentState);
                ui.renderPlayerHand(currentState);
            }
        } else {
            activeTableId = null;
            showScreen('sns');
        }
    }
    renderTableTabs();
}

function getOrCreateTable(roomId) {
    if (!tables.has(roomId)) {
        tables.set(roomId, createTableContext(roomId));
    }
    return tables.get(roomId);
}

// ==========================================
// Add Table Modal (lobby from game screen)
// ==========================================
let addTableRoomListCache = [];

function openAddTableModal() {
    const modal = document.getElementById('add-table-modal');
    modal.classList.remove('hidden');
    // Request fresh room list
    client.getRooms();
    renderAddTableRooms();
}

function renderAddTableRooms() {
    const container = document.getElementById('add-table-rooms');
    const roomList = addTableRoomListCache;
    // Filter out rooms we're already in
    const available = roomList.filter(r => !tables.has(r.id));
    if (available.length === 0) {
        container.innerHTML = '<div class="add-table-empty">参加可能なルームがありません</div>';
        return;
    }
    container.innerHTML = '';
    for (const r of available) {
        const full = r.playerCount >= 6;
        const item = document.createElement('div');
        item.className = 'add-table-room-item' + (full ? ' room-full' : '');
        const statusCls = r.playing ? 'playing' : 'waiting';
        const statusText = r.playing ? '進行中' : '待機中';
        item.innerHTML = `<div>
            <div class="add-table-room-name">${r.hostName}のルーム (${r.id})</div>
            <div class="add-table-room-info">${r.playerCount}/6人${r.gameName ? ' · ' + r.gameName : ''}</div>
        </div>
        <span class="add-table-room-status ${statusCls}">${statusText}</span>`;
        if (!full) {
            item.addEventListener('click', () => {
                client.joinRoom(r.id);
                document.getElementById('add-table-modal').classList.add('hidden');
            });
        }
        container.appendChild(item);
    }
}

function setupAddTableModal() {
    const closeBtn = document.getElementById('btn-add-table-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('add-table-modal').classList.add('hidden');
        });
    }
    const createBtn = document.getElementById('btn-add-table-create');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            if (tables.size >= MAX_TABLES) return;
            client.createRoom();
            document.getElementById('add-table-modal').classList.add('hidden');
        });
    }
}

function loadHandHistory() {
    try {
        const raw = localStorage.getItem('poker10mix_hand_history');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}
function persistHandHistory() {
    try { localStorage.setItem('poker10mix_hand_history', JSON.stringify(handHistory)); } catch (e) {}
}

// ==========================================
// Player Notes (localStorage)
// ==========================================
const PLAYER_NOTES_KEY = 'poker10mix_player_notes';
function loadPlayerNotes() {
    try { return JSON.parse(localStorage.getItem(PLAYER_NOTES_KEY)) || {}; } catch (e) { return {}; }
}
function savePlayerNotes(notes) {
    try { localStorage.setItem(PLAYER_NOTES_KEY, JSON.stringify(notes)); } catch (e) {}
}
function getPlayerNote(name) {
    return loadPlayerNotes()[name] || '';
}
function setPlayerNote(name, text) {
    const notes = loadPlayerNotes();
    if (text.trim()) notes[name] = text.trim();
    else delete notes[name];
    savePlayerNotes(notes);
}
function hasPlayerNote(name) {
    return !!loadPlayerNotes()[name];
}

// ==========================================
// Bet Preset Settings (localStorage)
// ==========================================
const PRESET_STORAGE_KEY = 'poker10mix_bet_presets';
const DEFAULT_PRESETS = {
    'preflop-open': [2.5, 3, 4],
    'preflop-raise': [2.5, 3, 4],
    'postflop': [0.33, 0.66, 1.0]
};

function loadBetPresets() {
    try {
        const saved = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY));
        if (saved && saved['preflop-open'] && saved['preflop-raise'] && saved['postflop']) return saved;
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_PRESETS));
}

function saveBetPresets(presets) {
    try { localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets)); } catch (e) {}
}

let currentPresets = loadBetPresets();

function setupPresetSettingsModal() {
    const modal = document.getElementById('preset-settings-modal');
    const editArea = document.getElementById('preset-edit-area');
    let editingTab = 'preflop-open';
    let tempPresets = null;

    const unitHints = {
        'preflop-open': 'BB倍率 (例: 2, 2.5, 3)',
        'preflop-raise': 'レイズ倍率 (例: 2, 2.5, 3)',
        'postflop': 'ポット比率 (例: 0.33, 0.5, 1.0)'
    };
    const labelFns = {
        'preflop-open': v => `${v}bb`,
        'preflop-raise': v => `${v}x`,
        'postflop': v => v >= 1 ? 'Pot' : `${Math.round(v * 100)}%`
    };

    function renderEditArea() {
        editArea.innerHTML = '';
        const hint = document.createElement('div');
        hint.className = 'preset-unit-hint';
        hint.textContent = unitHints[editingTab];
        editArea.appendChild(hint);

        const values = tempPresets[editingTab];
        values.forEach((val, i) => {
            const row = document.createElement('div');
            row.className = 'preset-row';
            const label = document.createElement('span');
            label.className = 'preset-row-label';
            label.textContent = labelFns[editingTab](val);
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'preset-row-input';
            input.value = val;
            input.step = editingTab === 'postflop' ? '0.01' : '0.5';
            input.min = '0';
            input.addEventListener('input', () => {
                const v = parseFloat(input.value);
                if (!isNaN(v) && v > 0) {
                    tempPresets[editingTab][i] = v;
                    label.textContent = labelFns[editingTab](v);
                }
            });
            const removeBtn = document.createElement('button');
            removeBtn.className = 'preset-row-remove';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                tempPresets[editingTab].splice(i, 1);
                renderEditArea();
            });
            row.appendChild(label);
            row.appendChild(input);
            row.appendChild(removeBtn);
            editArea.appendChild(row);
        });

        const addBtn = document.createElement('div');
        addBtn.className = 'preset-add-btn';
        addBtn.textContent = '+ 追加';
        addBtn.addEventListener('click', () => {
            const last = values.length > 0 ? values[values.length - 1] : 1;
            tempPresets[editingTab].push(editingTab === 'postflop' ? Math.min(last + 0.25, 2.0) : last + 0.5);
            renderEditArea();
        });
        editArea.appendChild(addBtn);
    }

    // Tab clicks
    document.querySelectorAll('.preset-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.preset-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            editingTab = tab.dataset.tab;
            renderEditArea();
        });
    });

    // Open modal
    document.getElementById('btn-preset-settings').addEventListener('click', () => {
        tempPresets = JSON.parse(JSON.stringify(currentPresets));
        editingTab = 'preflop-open';
        document.querySelectorAll('.preset-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === editingTab));
        renderEditArea();
        modal.classList.remove('hidden');
        // Close hamburger menu
        document.getElementById('top-bar-menu').classList.add('hidden');
    });

    // Save
    document.getElementById('preset-save-btn').addEventListener('click', () => {
        // Sort each tab's values
        for (const key of Object.keys(tempPresets)) {
            tempPresets[key].sort((a, b) => a - b);
        }
        currentPresets = tempPresets;
        saveBetPresets(currentPresets);
        modal.classList.add('hidden');
    });

    // Reset
    document.getElementById('preset-reset-btn').addEventListener('click', () => {
        tempPresets = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
        renderEditArea();
    });

    // Close
    document.getElementById('preset-close-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
}

// Save hand history on tab close/reload
window.addEventListener('beforeunload', () => {
    saveCurrentHand();
});

document.addEventListener('DOMContentLoaded', () => {
    setupLoginScreen();
    setupAccountLogin();
    setupLobbyScreen();
    setupHandPostModal();
    setupRoomScreen();
    setupGameScreen();
    setupStatsModal();
    setupChat();
    setupPreActions();
    setupPresetSettingsModal();
    setupFocusMode();
    setupAddTableModal();

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

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
    client.on('room_list', (data) => {
        // Cache for main screen rail and add-table modal
        window.lastRoomList = data.rooms || [];
        window.lastZoomCount = data.zoomCount || 0;
        addTableRoomListCache = data.rooms || [];
        if (typeof updateSNSCTACounts === 'function') updateSNSCTACounts();
        if (typeof renderRailRooms === 'function') renderRailRooms(window.lastRoomList);
        const roomPickerModal = document.getElementById('room-picker-modal');
        if (roomPickerModal && !roomPickerModal.classList.contains('hidden')) {
            renderRoomModalList();
        }
        const modal = document.getElementById('add-table-modal');
        if (modal && !modal.classList.contains('hidden')) {
            renderAddTableRooms();
        }
    });
    client.on('room_joined', (msg) => {
        hideJoinPendingOverlay(); // Dismiss pending overlay on successful join
        const rid = msg.roomId || msg.room.id;
        getOrCreateTable(rid);
        // If this is the first or only table, or we're in lobby, make it active
        if (!activeTableId || tables.size === 1) {
            activeTableId = rid;
        }
        onRoomJoined(msg.room, rid);
        renderTableTabs();
    });
    client.on('room_updated', (msg) => {
        const rid = msg.roomId || (msg.room && msg.room.id);
        if (rid && rid === activeTableId) {
            onRoomUpdated(msg.room || msg);
        } else if (rid) {
            const ctx = tables.get(rid);
            if (ctx) ctx.room = msg.room || msg;
        }
    });
    client.on('room_left', (msg) => {
        const rid = msg.roomId;
        // If the server closed the table (e.g. all members on sitout), let the
        // user know before the game screen disappears.
        if (msg && msg.reason === 'all_sitout') {
            showToast('参加者全員が離席したためテーブルを閉じました');
        }
        if (rid) {
            removeTable(rid);
        } else {
            showScreen('sns');
        }
    });
    client.on('leave_reserved', (msg) => {
        // Server has deferred the leave to the end of the current hand.
        showToast('退出予約しました（ハンド終了後に適用）');
    });
    client.on('game_started', (msg) => {
        const rid = msg.roomId;
        if (rid && rid !== activeTableId) {
            // Background table started — switch to it
            switchToTable(rid);
        }
        onGameStarted(msg);
        const ctx = tables.get(activeTableId);
        if (ctx) ctx.gameName = '';
        renderTableTabs();
    });
    client.on('hand_start', (msg) => {
        const rid = msg.roomId;
        if (rid && rid !== activeTableId) {
            const ctx = tables.get(rid);
            if (ctx) {
                ctx.handLogs = [];
                ctx.startingHandCards = [];
                ctx.cardSnapshots = [];
                ctx.showdownPlayers = null;
                ctx.lastHandResult = null;
                ctx.isMyTurn = false;
            }
            return;
        }
        onHandStart();
    });
    client.on('game_state', (msg) => {
        const rid = msg.roomId;
        const state = msg.state;
        if (rid && rid !== activeTableId) {
            const ctx = tables.get(rid);
            if (ctx) {
                ctx.state = state;
                if (state.gameName) ctx.gameName = state.gameName;
            }
            renderTableTabs();
            return;
        }
        onGameState(state);
        const ctx = tables.get(activeTableId);
        if (ctx && state.gameName) ctx.gameName = state.gameName;
        renderTableTabs();
    });
    client.on('your_turn', (msg) => {
        const rid = msg.roomId;
        if (rid && rid !== activeTableId) {
            const ctx = tables.get(rid);
            if (ctx) ctx.isMyTurn = true;
            renderTableTabs();
            if (myTurnOnActiveTable) {
                // Queue switch — don't interrupt current action
                if (!pendingSwitchQueue.includes(rid)) pendingSwitchQueue.push(rid);
            } else {
                switchToTable(rid);
            }
        } else {
            myTurnOnActiveTable = true;
        }
        if (rid === activeTableId || !rid) onYourTurn(msg);
    });
    client.on('your_draw', (msg) => {
        const rid = msg.roomId;
        if (rid && rid !== activeTableId) {
            const ctx = tables.get(rid);
            if (ctx) ctx.isMyTurn = true;
            renderTableTabs();
            if (myTurnOnActiveTable) {
                if (!pendingSwitchQueue.includes(rid)) pendingSwitchQueue.push(rid);
            } else {
                switchToTable(rid);
            }
        } else {
            myTurnOnActiveTable = true;
        }
        if (rid === activeTableId || !rid) onYourDraw({ hand: msg.hand, timeLimit: msg.timeLimit });
    });
    client.on('log', (d) => {
        const rid = d.roomId;
        if (rid && rid !== activeTableId) {
            const ctx = tables.get(rid);
            if (ctx) ctx.handLogs.push(d.message);
            return;
        }
        ui.addLog(d.message, d.cls);
        currentHandLogs.push(d.message);
    });
    client.on('chat', (msg) => {
        const rid = msg.roomId;
        if (rid && rid !== activeTableId) return; // ignore chat from background tables
        onChat(msg);
    });
    // lobby_chat removed — no lobby chat feature
    client.on('online_users', (data) => {
        // Backward-compat: data may be array (old) or { users, following } (new)
        let users;
        if (Array.isArray(data)) {
            users = data;
        } else {
            if (Array.isArray(data.following)) myFollowing = new Set(data.following);
            users = data.users || [];
        }
        lastOnlineUsers = users;
        renderOnlineUsers(users);
        if (typeof updateSNSCTACounts === 'function') updateSNSCTACounts();
        // Update count badge inside chat modal tab
        const ccEl = document.getElementById('cp-online-count');
        if (ccEl) ccEl.textContent = `(${users.length})`;
    });
    client.on('follows', (msg) => {
        myFollowing = new Set(msg.following || []);
        myFollowers = new Set(msg.followers || []);
        renderOnlineUsers(lastOnlineUsers);
    });
    client.on('followed_by', (msg) => {
        myFollowers.add(msg.name);
        showToast(`${msg.name} さんがあなたをフォローしました`);
    });
    client.on('game_over', (msg) => {
        const rid = msg.roomId;
        if (rid && rid !== activeTableId) {
            removeTable(rid);
            return;
        }
        onGameOver(msg);
        if (rid) removeTable(rid);
    });
    client.on('stats_data', renderStats);
    client.on('hand_result', (msg) => {
        const rid = msg.roomId;
        if (rid && rid !== activeTableId) {
            const ctx = tables.get(rid);
            if (ctx) ctx.lastHandResult = msg;
            return;
        }
        onHandResult(msg);
    });
    client.on('stats_update', onStatsUpdate);
    client.on('auth_result', onAuthResult);
    client.on('zoom_joined', onZoomJoined);
    client.on('zoom_waiting', onZoomWaiting);
    client.on('zoom_left', onZoomLeft);
    client.on('zoom_sitout', onZoomSitout);
    client.on('emote', (msg) => {
        if (msg.roomId && msg.roomId !== activeTableId) return;
        onEmote(msg);
    });
    client.on('reaction', (msg) => {
        if (msg.roomId && msg.roomId !== activeTableId) return;
        onReaction(msg);
    });
    client.on('big_hand', onBigHand);
    client.on('auto_kicked', () => {
        alert('10分間離席のため自動退室されました');
        showScreen('sns');
    });

    // 承認制テーブル: 参加リクエスト送信後の待機
    client.on('join_pending', (msg) => {
        showJoinPendingOverlay(msg.roomId);
    });
    client.on('join_rejected', (msg) => {
        hideJoinPendingOverlay();
        alert(msg.reason || '参加が拒否されました');
    });
    client.on('join_cancelled', () => {
        hideJoinPendingOverlay();
    });
    // ホスト側: 参加リクエスト通知 (ゲーム中にも受信)
    client.on('join_request', (msg) => {
        // If on room screen, re-render pending joins
        if (currentRoom && currentRoom.id === msg.roomId) {
            if (!currentRoom.pendingJoins) currentRoom.pendingJoins = [];
            if (!currentRoom.pendingJoins.some(p => p.clientId === msg.clientId)) {
                currentRoom.pendingJoins.push({ clientId: msg.clientId, name: msg.name, avatar: msg.avatar });
            }
            renderPendingJoins(currentRoom);
        }
        // Also show notification if in game screen
        showJoinRequestNotification(msg);
    });
    client.on('join_request_cancelled', (msg) => {
        if (currentRoom && currentRoom.id === msg.roomId && currentRoom.pendingJoins) {
            currentRoom.pendingJoins = currentRoom.pendingJoins.filter(p => p.clientId !== msg.clientId);
            renderPendingJoins(currentRoom);
        }
    });

    client.on('error', (msg) => alert(msg));
});

// ==========================================
// Screen Management
// ==========================================
function showScreen(name) {
    ['login-screen', 'room-screen', 'game-screen', 'sns-screen'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(name + '-screen');
    if (target) target.classList.remove('hidden');
    if (name === 'sns') initSNSScreen();
}

// ==========================================
// Login Screen
// ==========================================
function setupLoginScreen() {
    const input = document.getElementById('login-name');
    setupAvatarPicker();
    // Guest login
    document.getElementById('btn-enter').addEventListener('click', () => {
        const name = input.value.trim();
        if (!name || name.length < 1) { alert('名前を入力してください'); return; }
        loggedInAccount = null;
        client.setName(name, null, true);
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

    // Logout (wired directly on main-screen header button)
    const headerLogoutBtn = document.getElementById('sns-header-logout');
    if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', doLogout);
}

function doLogout() {
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
}

function enterLobby(displayName) {
    // Unified landing: main screen (sns-screen id is kept for compat)
    showScreen('sns');
    client.getRooms();
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
        client.setName(data.name, selectedAvatar, false);
        enterLobby(data.name);
    } else {
        showLoginError(data.message || 'エラーが発生しました');
    }
}

// ==========================================
// Global (ex-Lobby) setup — now wires modal + main-screen header buttons
// ==========================================
function setupLobbyScreen() {
    // Ranking close button (modal still used by game screen)
    const rankingClose = document.getElementById('btn-ranking-close');
    if (rankingClose) rankingClose.addEventListener('click', () => {
        document.getElementById('ranking-modal').classList.add('hidden');
    });

    // Hand history: open/close modal directly from main-screen header
    const headerHistBtn = document.getElementById('sns-header-history');
    if (headerHistBtn) headerHistBtn.addEventListener('click', () => {
        renderHandHistory('lobby-hand-history');
        document.getElementById('history-modal').classList.remove('hidden');
    });
    const histCloseBtn = document.getElementById('btn-history-close');
    if (histCloseBtn) histCloseBtn.addEventListener('click', () => {
        document.getElementById('history-modal').classList.add('hidden');
    });
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
        const gType = getGameType(g.id);
        label.className = `game-checkbox-item gcb-${gType}`;
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
            client.send({ type: 'update_game_selection', selectedGames: [...mySelectedGames], roomId: activeTableId });
        });
        const nameSpan = document.createElement('span');
        nameSpan.className = 'game-cb-name';
        nameSpan.textContent = g.name;

        // Color badges: game type + betting type
        const badgesSpan = document.createElement('span');
        badgesSpan.className = 'game-cb-badges';
        const typeBadge = GAME_TYPE_LABELS[gType];
        const betBadge = BETTING_TYPE_LABELS[g.betting || 'limit'];
        badgesSpan.innerHTML = `<span class="game-cb-badge" style="background:${typeBadge.color}">${typeBadge.label}</span>`
            + `<span class="game-cb-badge" style="background:${betBadge.color}">${betBadge.label}</span>`;
        nameSpan.appendChild(badgesSpan);

        const selectorsSpan = document.createElement('span');
        selectorsSpan.className = 'game-cb-selectors';
        label.appendChild(cb);
        label.appendChild(nameSpan);
        label.appendChild(selectorsSpan);
        container.appendChild(label);
    });

    document.getElementById('btn-start-game').addEventListener('click', () => client.startGame(activeTableId));
    document.getElementById('btn-leave-room').addEventListener('click', () => {
        client.leaveRoom(activeTableId);
        if (activeTableId) removeTable(activeTableId);
        else showScreen('sns');
    });

    // Lock toggle (承認制テーブル)
    document.getElementById('room-lock-toggle').addEventListener('change', (e) => {
        client.toggleLock(e.target.checked, activeTableId);
    });
}

function onRoomJoined(room, roomId) {
    currentRoom = room;
    const ctx = tables.get(roomId || room.id);
    if (ctx) ctx.room = room;
    // Send my current game selection to server on join
    client.send({ type: 'update_game_selection', selectedGames: [...mySelectedGames], roomId: roomId || room.id });

    if (room.playing) {
        // Mid-game join: go directly to game screen
        showScreen('game');
        document.getElementById('zoom-waiting-overlay').classList.add('hidden');
        document.getElementById('zoom-sitout-overlay').classList.add('hidden');
        document.getElementById('btn-back-room').classList.remove('hidden');
        document.getElementById('btn-zoom-exit').classList.add('hidden');
        // Reset action bar state so showFoldedButtons can work after reconnection
        document.getElementById('action-bar').classList.add('hidden');
        document.getElementById('draw-action-bar').classList.add('hidden');
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

    // Host-only: start button
    const isHost = room.hostId === client.clientId;
    document.getElementById('btn-start-game').style.display = isHost ? '' : 'none';
    document.getElementById('room-waiting-msg').style.display = isHost ? 'none' : 'block';
    document.getElementById('room-host-controls').style.display = 'block';

    // Lock toggle: only for non-guest hosts
    const lockLabel = document.getElementById('lock-toggle-label');
    const lockToggle = document.getElementById('room-lock-toggle');
    if (isHost && loggedInAccount) {
        lockLabel.classList.remove('hidden');
        lockToggle.checked = !!room.locked;
    } else {
        lockLabel.classList.add('hidden');
    }

    // Render pending join requests (host only)
    renderPendingJoins(room);
}

// ==========================================
// Join Pending Overlay (参加リクエスト待機)
// ==========================================
let joinPendingRoomId = null;

function showJoinPendingOverlay(roomId) {
    joinPendingRoomId = roomId;
    let overlay = document.getElementById('join-pending-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'join-pending-overlay';
        overlay.className = 'join-pending-overlay';
        overlay.innerHTML = `
            <div class="join-pending-box">
                <div class="join-pending-spinner"></div>
                <p>参加リクエストを送信しました</p>
                <p class="join-pending-sub">ホストの承認を待っています...</p>
                <button id="btn-cancel-join" class="btn-small btn-danger">キャンセル</button>
            </div>
        `;
        document.getElementById('app').appendChild(overlay);
        document.getElementById('btn-cancel-join').addEventListener('click', () => {
            if (joinPendingRoomId) client.cancelJoin(joinPendingRoomId);
            hideJoinPendingOverlay();
        });
    }
    overlay.classList.remove('hidden');
}

function hideJoinPendingOverlay() {
    joinPendingRoomId = null;
    const overlay = document.getElementById('join-pending-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// ==========================================
// Join Request Notification (ホスト側通知)
// ==========================================
function showJoinRequestNotification(msg) {
    // Remove existing notification for same player
    const existing = document.querySelector(`.join-notif[data-cid="${msg.clientId}"]`);
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.className = 'join-notif';
    notif.dataset.cid = msg.clientId;
    const avatarHtml = msg.avatar
        ? `<img class="join-notif-avatar" src="avatars/${msg.avatar}.svg" alt="">`
        : '';
    notif.innerHTML = `
        ${avatarHtml}
        <span class="join-notif-text"><b>${msg.name}</b> が参加を希望</span>
        <button class="btn-small btn-approve join-notif-approve">承認</button>
        <button class="btn-small btn-danger join-notif-reject">拒否</button>
    `;
    notif.querySelector('.join-notif-approve').addEventListener('click', () => {
        client.approveJoin(msg.clientId, msg.roomId);
        notif.remove();
    });
    notif.querySelector('.join-notif-reject').addEventListener('click', () => {
        client.rejectJoin(msg.clientId, msg.roomId);
        notif.remove();
    });
    document.getElementById('app').appendChild(notif);
    // Auto-remove after 30 seconds
    setTimeout(() => { if (notif.parentNode) notif.remove(); }, 30000);
}

function renderPendingJoins(room) {
    const container = document.getElementById('pending-joins');
    const isHost = room.hostId === client.clientId;
    if (!isHost || !room.pendingJoins || room.pendingJoins.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = `<h3>参加リクエスト (${room.pendingJoins.length})</h3>` +
        room.pendingJoins.map(p => {
            const avatarHtml = p.avatar
                ? `<img class="pending-avatar" src="avatars/${p.avatar}.svg" alt="">`
                : `<span class="pending-avatar-initial">${(p.name || '?').charAt(0).toUpperCase()}</span>`;
            return `<div class="pending-join-item">
                ${avatarHtml}
                <span class="pending-join-name">${p.name}</span>
                <button class="btn-small btn-approve" data-id="${p.clientId}">承認</button>
                <button class="btn-small btn-danger btn-reject" data-id="${p.clientId}">拒否</button>
            </div>`;
        }).join('');

    container.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', () => client.approveJoin(parseInt(btn.dataset.id), activeTableId));
    });
    container.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', () => client.rejectJoin(parseInt(btn.dataset.id), activeTableId));
    });
}

// ==========================================
// Game Screen
// ==========================================
function setupGameScreen() {
    // Side panel (chat/log) is handled in setupSidePanel()

    // Sound toggle button
    const soundBtn = document.getElementById('btn-sound-toggle');
    const updateSoundBtn = () => { soundBtn.textContent = sound.isEnabled() ? '🔔 サウンド ON' : '🔕 サウンド OFF'; };
    updateSoundBtn();
    soundBtn.addEventListener('click', () => { sound.toggle(); updateSoundBtn(); });

    // Theme toggle button
    const THEMES = ['light', 'classic', 'midnight'];
    const THEME_LABELS = { light: '🎨 ライト', classic: '🎨 クラシック', midnight: '🎨 ミッドナイト' };
    // Migrate old 'dark' → 'light' (was the legacy default)
    let savedTheme = localStorage.getItem('poker10mix_theme');
    if (savedTheme === 'dark') savedTheme = 'light';
    let currentThemeIdx = THEMES.indexOf(savedTheme || 'light');
    if (currentThemeIdx < 0) currentThemeIdx = 0;
    function applyTheme(idx) {
        document.body.classList.remove('theme-dark', 'theme-light', 'theme-classic', 'theme-midnight');
        document.body.classList.add('theme-' + THEMES[idx]);
        localStorage.setItem('poker10mix_theme', THEMES[idx]);
        const btn = document.getElementById('btn-theme-toggle');
        if (btn) btn.textContent = THEME_LABELS[THEMES[idx]];
    }
    applyTheme(currentThemeIdx);
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
        currentThemeIdx = (currentThemeIdx + 1) % THEMES.length;
        applyTheme(currentThemeIdx);
    });

    // Hamburger menu toggle
    const hamburgerBtn = document.getElementById('btn-hamburger');
    const topBarMenu = document.getElementById('top-bar-menu');
    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        topBarMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!topBarMenu.contains(e.target) && e.target !== hamburgerBtn) {
            topBarMenu.classList.add('hidden');
        }
    });
    // Close menu when any menu-item is clicked
    topBarMenu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => topBarMenu.classList.add('hidden'));
    });

    // Rules button
    document.getElementById('game-rules-btn').addEventListener('click', () => {
        topBarMenu.classList.add('hidden');
        document.getElementById('rules-modal').classList.toggle('hidden');
    });
    document.getElementById('rules-close').addEventListener('click', () => {
        document.getElementById('rules-modal').classList.add('hidden');
    });

    // Hand history button in hamburger menu
    document.getElementById('btn-menu-history').addEventListener('click', () => {
        topBarMenu.classList.add('hidden');
        renderHandHistory('lobby-hand-history');
        document.getElementById('history-modal').classList.remove('hidden');
    });

    // Draw buttons
    document.getElementById('btn-draw').addEventListener('click', () => {
        if (ui.selectedCards.size === 0) {
            if (!confirm('カードを選択していません。スタンドパット（交換なし）と同じですが、ドローしますか？')) return;
        }
        client.sendDraw([...ui.selectedCards], activeTableId);
        ui.selectedCards.clear();
        document.getElementById('draw-action-bar').classList.add('hidden');
        ui.pendingDraw = false;
        processPendingSwitch();
    });
    document.getElementById('btn-stand-pat').addEventListener('click', () => {
        client.sendDraw([], activeTableId);
        ui.selectedCards.clear();
        document.getElementById('draw-action-bar').classList.add('hidden');
        ui.pendingDraw = false;
        processPendingSwitch();
    });

    // Keyboard shortcut: Enter to confirm raise
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const actionBar = document.getElementById('action-bar');
        if (actionBar.classList.contains('hidden')) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            const raiseBtn = document.getElementById('btn-raise-main');
            if (raiseBtn) raiseBtn.click();
        }
    });

    // Stats button
    document.getElementById('btn-ingame-stats').addEventListener('click', () => {
        client.getStats(activeTableId);
        document.getElementById('stats-modal').classList.remove('hidden');
    });

    // Back to room button — sends leave request. Server decides whether to
    // apply immediately or defer until hand end (leave_reserved response).
    document.getElementById('btn-back-room').addEventListener('click', () => {
        if (confirm('退出予約しますか？（プレイ中のハンド終了後に退出します）')) {
            client.leaveRoom(activeTableId);
            // Don't call removeTable() here — wait for room_left event.
            // If the leave is deferred, the table stays visible until the hand ends.
            if (!activeTableId) showScreen('sns');
        }
    });

    // Zoom exit button
    document.getElementById('btn-zoom-exit').addEventListener('click', () => {
        client.leaveZoom();
    });

    // Sit-out button (works for both Zoom and regular rooms)
    document.getElementById('btn-zoom-sitout').addEventListener('click', () => {
        if (isInZoom) {
            client.zoomSitout();
        } else if (activeTableId) {
            // Check if already sitting out — toggle to rejoin
            if (currentState && currentState.mySitout) {
                client.rejoinGame(activeTableId);
            } else {
                client.sitoutRequest(activeTableId);
            }
        }
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
    // Reset action bar so folded/sitout buttons can display correctly
    document.getElementById('action-bar').classList.add('hidden');
    document.getElementById('draw-action-bar').classList.add('hidden');
    lastGameId = null; // Reset so first game doesn't trigger overlay

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
    } else {
        document.getElementById('btn-back-room').classList.remove('hidden');
        document.getElementById('btn-zoom-exit').classList.add('hidden');
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
    clearPreAction();
    // Reset chip animation state
    prevPot = 0;
    prevBets = {};
    // Reset card animation counters
    ui._prevCCCount = 0;
    ui._prevMyCardCount = 0;
    ui._prevFolded = {};
}

function onHandResult(data) {
    lastHandResult = data;
    detectWinAnimation(data);
    showReactionBar();
}

function onGameState(state) {
    currentState = state;
    if (!currentHandGameName && state.gameName) currentHandGameName = state.gameName;
    if (!currentHandGameType && state.gameType) currentHandGameType = state.gameType;

    // Detect game change → overlay + sound + banner highlight
    if (state.gameId && lastGameId !== null && state.gameId !== lastGameId) {
        showGameChangeOverlay(state);
        sound.gameChange();
    }
    lastGameId = state.gameId;

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
    // Chip animations before render (detect bet changes)
    detectBetAnimations(state);

    ui.renderFromServer(state);

    // Update sitout button label + countdown state
    const sitoutBtn = document.getElementById('btn-zoom-sitout');
    if (sitoutBtn && !isInZoom) {
        if (state.mySitout) {
            sitoutBtn.textContent = '🔄 復帰する';
        } else {
            sitoutBtn.textContent = '💤 離席予約';
            // No longer sitout — stop countdown
            if (sitoutCountdownInterval) stopSitoutCountdown();
        }
    }

    // Show folded-state buttons when player is folded and not acting
    showFoldedButtons(state);
    // Show pre-action checkboxes when waiting for turn
    updatePreActionVisibility(state);
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
    document.getElementById('btn-back-room').classList.remove('hidden');
    saveCurrentHand();
    showScreen('sns');
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
    // Compact list of starting hands with win/loss badges
    const myName = client.name;
    let html = '<div class="hh-list">';
    for (let i = handHistory.length - 1; i >= 0; i--) {
        const h = handHistory[i];
        const cards = h.startCards || h.myCardObjs || [];
        // Determine win/loss from handResult
        let diff = 0, hasResult = false;
        if (h.handResult && h.handResult.players) {
            const me = h.handResult.players.find(p => p.name === myName);
            if (me) { diff = me.chips - me.startChips; hasResult = true; }
        }
        const rowCls = hasResult ? (diff > 0 ? ' hh-row-win' : diff < 0 ? ' hh-row-loss' : '') : '';
        html += `<div class="hh-row${rowCls}" data-hh-idx="${i}">`;
        html += `<span class="hh-num">#${i + 1}</span>`;
        html += `<span class="hh-game-label">${h.gameName || ''}</span>`;
        html += `<span class="hh-start-cards">${renderMiniCards(cards)}</span>`;
        if (hasResult) {
            if (diff > 0) {
                html += `<span class="hh-chip-diff hh-diff-plus">+${diff.toLocaleString()}</span>`;
            } else if (diff < 0) {
                html += `<span class="hh-chip-diff hh-diff-minus">${diff.toLocaleString()}</span>`;
            } else {
                html += `<span class="hh-chip-diff hh-diff-zero">\u00b10</span>`;
            }
        }
        html += `<span class="hh-time-label">${h.time || ''}</span>`;
        // 📢 投稿 button (post to timeline) — available for win or loss
        html += `<button class="hh-post-btn" data-hh-post-idx="${i}" title="タイムラインに投稿">📢 投稿</button>`;
        html += `</div>`;
    }
    html += '</div>';
    // Detail panel (hidden by default)
    html += '<div id="hh-detail-' + containerId + '" class="hh-detail hidden"></div>';
    container.innerHTML = html;

    // Click handlers
    container.querySelectorAll('.hh-row').forEach(row => {
        row.addEventListener('click', (e) => {
            // Ignore clicks that originated from the post button
            if (e.target.closest('.hh-post-btn')) return;
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

    // Post-to-timeline button handlers
    container.querySelectorAll('.hh-post-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.hhPostIdx);
            openHandPostModal(idx);
        });
    });
}

// Manual hand post modal — extracted to js/hand-post.js

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

    // Assign draw exchange diffs to draw rounds
    const drawSnaps = (hr && hr.drawSnapshots) || [];
    const mySnaps = h.cardSnapshots || [];
    if (drawSnaps.length > 0) {
        let drawIdx = 0;
        for (const round of rounds) {
            if (round.name.startsWith('Draw')) {
                const preSnap = drawSnaps[drawIdx];
                drawIdx++;
                const postSnap = drawSnaps[drawIdx];
                if (preSnap && postSnap) {
                    round.drawDiffs = [];
                    for (const pre of preSnap) {
                        if (pre.folded || !pre.hand || pre.hand.length === 0) continue;
                        const post = postSnap.find(s => s.name === pre.name);
                        if (!post || !post.hand) continue;
                        const discarded = pre.hand.filter(c => !post.hand.some(pc => pc.r === c.r && pc.s === c.s));
                        const drawn = post.hand.filter(c => !pre.hand.some(pc => pc.r === c.r && pc.s === c.s));
                        round.drawDiffs.push({ name: pre.name, discarded, drawn, count: discarded.length });
                    }
                }
            }
        }
    } else if (mySnaps.length > 0 && mySnaps[0].type === 'draw') {
        let drawIdx = 0;
        for (const round of rounds) {
            if (round.name.startsWith('Draw')) {
                const preSnap = mySnaps[drawIdx];
                drawIdx++;
                const postSnap = mySnaps[drawIdx];
                if (preSnap && postSnap) {
                    const preHand = preSnap.hand || [];
                    const postHand = postSnap.hand || [];
                    const discarded = preHand.filter(c => !postHand.some(pc => pc.r === c.r && pc.s === c.s));
                    const drawn = postHand.filter(c => !preHand.some(pc => pc.r === c.r && pc.s === c.s));
                    round.drawDiffs = [{ name: myName, discarded, drawn, count: discarded.length }];
                }
            }
        }
    }

    // Assign stud card diffs to stud rounds
    if (mySnaps.length > 0 && mySnaps[0].type === 'stud') {
        const studRounds = rounds.filter(r => r.name.match(/\d+(st|nd|rd|th) St/));
        for (let i = 1; i < studRounds.length && i < mySnaps.length; i++) {
            const prev = mySnaps[i - 1];
            const curr = mySnaps[i];
            const prevAll = [...(prev.down || []), ...(prev.up || [])];
            const currAll = [...(curr.down || []), ...(curr.up || [])];
            const newCard = currAll.filter(c => !prevAll.some(pc => pc.r === c.r && pc.s === c.s));
            if (newCard.length > 0) {
                const isUp = (curr.up || []).some(u => u.r === newCard[0].r && u.s === newCard[0].s);
                studRounds[i].studNewCard = { card: newCard[0], up: isUp, name: myName };
            }
        }
    }
    // Server-side stud data (all players)
    if (hr && hr.gameType === 'stud' && hr.players) {
        const studRounds = rounds.filter(r => r.name.match(/\d+(st|nd|rd|th) St/));
        // 4th-7th streets: upCards index 1..4 correspond to studRounds[1..4]
        for (let si = 1; si < studRounds.length; si++) {
            studRounds[si].studDeals = [];
            for (const p of hr.players) {
                if (p.folded) continue;
                // For stud: cards = downCards[0..1] + upCards[0] (3rd) + upCards[1] (4th) ... + downCards[2] (7th)
                // upCards[si-1+1] = upCards[si] for 4th onward (index 1,2,3)
                // 7th street = last downCard
                if (si <= 3 && p.upCards && p.upCards.length > si) {
                    studRounds[si].studDeals.push({ name: p.name, card: p.upCards[si], up: true });
                } else if (si === 4 && p.downCards && p.downCards.length > 2) {
                    studRounds[si].studDeals.push({ name: p.name, card: p.downCards[2], up: false });
                }
            }
        }
    }

    // Helper: render card exchange diff for draw games
    function renderDrawDiffs(diffs) {
        if (!diffs || diffs.length === 0) return '';
        let out = `<div class="hh-draw-section">`;
        for (const d of diffs) {
            const isMe = d.name === myName;
            const cls = isMe ? 'hh-draw-player hh-draw-me' : 'hh-draw-player';
            let label;
            if (d.count === 0) {
                label = 'スタンドパット';
            } else {
                const discStr = renderMiniCards(d.discarded);
                const drawnStr = renderMiniCards(d.drawn);
                label = `${d.count}枚交換: ${discStr} → ${drawnStr}`;
            }
            out += `<div class="${cls}"><span class="hh-draw-pname">${d.name}</span> <span class="hh-draw-diff">${label}</span></div>`;
        }
        out += `</div>`;
        return out;
    }

    // Helper: render stud dealt cards
    function renderStudDeals(deals) {
        if (!deals || deals.length === 0) return '';
        let out = `<div class="hh-draw-section">`;
        for (const d of deals) {
            const isMe = d.name === myName;
            const cls = isMe ? 'hh-draw-player hh-draw-me' : 'hh-draw-player';
            const upDown = d.up ? 'アップ' : 'ダウン';
            out += `<div class="${cls}"><span class="hh-draw-pname">${d.name}</span> <span class="hh-stud-deal">${renderMiniCards([d.card])} (${upDown})</span></div>`;
        }
        out += `</div>`;
        return out;
    }

    // === Rounds with actions ===
    html += `<div class="hh-rounds">`;
    for (const round of rounds) {
        const hasContent = round.logs.length > 0 || round.cards.length > 0
            || round.drawDiffs || round.studDeals || round.studNewCard;
        if (!hasContent) continue;
        html += `<div class="hh-round">`;
        // Round header: name + community cards
        html += `<div class="hh-round-header">`;
        html += `<span class="hh-round-name">${round.name}</span>`;
        if (round.cards.length > 0) {
            html += `<span class="hh-round-cards">${renderMiniCards(round.cards)}</span>`;
        }
        html += `</div>`;
        // Stud: show dealt cards per street
        if (round.studDeals && round.studDeals.length > 0) {
            html += renderStudDeals(round.studDeals);
        } else if (round.studNewCard) {
            html += renderStudDeals([round.studNewCard]);
        }
        // Draw: show card exchange diffs
        if (round.drawDiffs) {
            html += renderDrawDiffs(round.drawDiffs);
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

    // === Replay button ===
    if (hr) {
        html += `<div class="hh-replay-wrap"><button class="btn-hh-replay" data-hh-idx="${idx}">▶ リプレイ</button><button class="btn-hh-share" data-hh-idx="${idx}">🔗 共有</button></div>`;
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

// ==================== REPLAY ====================
async function compressForReplay(str) {
    const blob = new Blob([new TextEncoder().encode(str)]);
    const stream = blob.stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function buildReplayURL(idx) {
    const h = handHistory[idx];
    if (!h || !h.handResult) return null;
    const hr = h.handResult;
    const data = {
        g: hr.gameName, t: hr.gameType,
        c: hr.communityCards, d: hr.dealerSeat,
        p: hr.players.map(p => ({
            n: p.name, o: p.position, f: p.folded ? 1 : 0,
            c: p.chips, s: p.startChips,
            h: p.cards, u: p.upCards, w: p.downCards,
        })),
        l: h.logs, ds: hr.drawSnapshots,
    };
    const compressed = await compressForReplay(JSON.stringify(data));
    const base = window.location.href.replace(/\/[^/]*$/, '/');
    return base + 'replay.html#' + compressed;
}

async function openReplay(idx) {
    const url = await buildReplayURL(idx);
    if (url) window.open(url, '_blank');
}

async function shareReplay(idx) {
    const url = await buildReplayURL(idx);
    if (!url) return;
    const h = handHistory[idx];
    const title = `Hand #${idx + 1} ${h.gameName || ''}`;
    if (navigator.share) {
        try {
            await navigator.share({ title, text: title + ' リプレイ', url });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        showToast('リプレイURLをコピーしました');
    } catch (e) {
        showToast('コピーに失敗しました');
    }
}

function showToast(msg) {
    let t = document.getElementById('hh-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'hh-toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// Event delegation for replay/share buttons
document.addEventListener('click', (e) => {
    const replayBtn = e.target.closest('.btn-hh-replay');
    if (replayBtn) {
        openReplay(parseInt(replayBtn.dataset.hhIdx));
        return;
    }
    const shareBtn = e.target.closest('.btn-hh-share');
    if (shareBtn) {
        shareReplay(parseInt(shareBtn.dataset.hhIdx));
        return;
    }
});

function triggerTurnFlash() {
    if (focusMode) return;
    const flash = document.getElementById('turn-flash');
    if (!flash) return;
    flash.classList.remove('flash-active');
    void flash.offsetWidth; // force reflow
    flash.classList.add('flash-active');
    flash.addEventListener('animationend', () => flash.classList.remove('flash-active'), { once: true });
}

function notifyYourTurn() {
    // Turn flash effect
    triggerTurnFlash();
    // Title flash when tab is hidden
    if (document.hidden) {
        if (!titleFlashInterval) {
            const orig = document.title;
            let flip = false;
            titleFlashInterval = setInterval(() => {
                document.title = flip ? orig : '★ あなたの番です！';
                flip = !flip;
            }, 800);
            // Stop flashing when tab becomes visible
            const stopFlash = () => {
                if (!document.hidden) {
                    clearInterval(titleFlashInterval);
                    titleFlashInterval = null;
                    document.title = orig;
                    document.removeEventListener('visibilitychange', stopFlash);
                }
            };
            document.addEventListener('visibilitychange', stopFlash);
        }
        // Desktop notification
        if (Notification.permission === 'granted') {
            try {
                const n = new Notification('mix-1', { body: 'あなたの番です！', icon: 'logos/logo.png', tag: 'your-turn' });
                setTimeout(() => n.close(), 5000);
            } catch (e) {}
        }
    }
}

function onYourTurn(data) {
    notifyYourTurn();
    // Check pre-action before showing buttons
    if (preAction) {
        const actions = data.actions;
        let executed = false;
        if (preAction === 'fold') {
            const fold = actions.find(a => a.type === 'fold');
            if (fold) { client.sendAction({ type: 'fold' }, activeTableId); executed = true; }
        } else if (preAction === 'check-fold') {
            const check = actions.find(a => a.type === 'check');
            if (check) { client.sendAction({ type: 'check' }, activeTableId); executed = true; }
            else {
                const fold = actions.find(a => a.type === 'fold');
                if (fold) { client.sendAction({ type: 'fold' }, activeTableId); executed = true; }
            }
        }
        clearPreAction();
        if (executed) {
            hidePreActionBar();
            return;
        }
    }
    hidePreActionBar();
    sound.yourTurn();
    startTurnTimer(data.timeLimit || 45);
    showActionButtons(data.actions, data);
}

function onYourDraw(data) {
    notifyYourTurn();
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
    // Sync input box
    const input = document.getElementById('raise-input');
    if (input && document.activeElement !== input) {
        input.value = Number(totalChips).toLocaleString();
    }
}

// Current raise amount (out-of-pocket) for the raise button
let pendingRaiseAmount = 0;
let pendingRaiseType = 'raise';
let pendingCurrentBet = 0;

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

    let hasVariable = false;
    let varAction = null;
    let varMin = 0, varMax = 0;

    // Sort: raise/bet (top) → call/check → fold (bottom); allin goes to presets
    const order = ['raise', 'bet', 'call', 'check', 'fold'];
    const sorted = [...actions].sort((a, b) => {
        const ai = order.indexOf(a.type), bi = order.indexOf(b.type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    let allInAction = null;

    for (const action of sorted) {
        if (action.type === 'allin') {
            allInAction = action;
            continue;
        }

        if ((action.type === 'bet' || action.type === 'raise') && action.min !== undefined) {
            hasVariable = true;
            varAction = action.type;
            varMin = action.min;
            varMax = action.max;
            pendingCurrentBet = action.currentBet || 0;
            pendingRaiseType = action.type;
            pendingRaiseAmount = action.min;

            const initTotal = action.min + pendingCurrentBet;
            const label = action.type === 'raise' ? 'レイズ' : 'ベット';

            // Row: [raise button] [input box]
            const raiseRow = document.createElement('div');
            raiseRow.className = 'raise-row';

            const input = document.createElement('input');
            input.id = 'raise-input';
            input.type = 'tel';
            input.className = 'raise-input';
            input.value = initTotal.toLocaleString();
            input.autocomplete = 'off';
            input.addEventListener('focus', () => input.select());
            input.addEventListener('input', () => {
                const raw = input.value.replace(/[^0-9]/g, '');
                const totalInput = parseInt(raw) || 0;
                input.value = totalInput ? totalInput.toLocaleString() : '';
                const outOfPocket = totalInput - pendingCurrentBet;
                if (outOfPocket >= varMin && outOfPocket <= varMax) {
                    pendingRaiseAmount = outOfPocket;
                    pendingRaiseType = varAction;
                    updateRaiseBtnText(totalInput);
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                    const raw = input.value.replace(/[^0-9]/g, '');
                    const totalInput = parseInt(raw) || 0;
                    const outOfPocket = totalInput - pendingCurrentBet;
                    const clamped = Math.min(varMax, Math.max(varMin, outOfPocket));
                    pendingRaiseAmount = clamped;
                    pendingRaiseType = varAction;
                    const clampedTotal = clamped + pendingCurrentBet;
                    input.value = clampedTotal.toLocaleString();
                    updateRaiseBtnText(clampedTotal);
                }
            });
            input.addEventListener('blur', () => {
                const raw = input.value.replace(/[^0-9]/g, '');
                const totalInput = parseInt(raw) || 0;
                const outOfPocket = totalInput - pendingCurrentBet;
                const clamped = Math.min(varMax, Math.max(varMin, outOfPocket));
                pendingRaiseAmount = clamped;
                pendingRaiseType = varAction;
                const clampedTotal = clamped + pendingCurrentBet;
                input.value = clampedTotal.toLocaleString();
                updateRaiseBtnText(clampedTotal);
            });
            const btn = document.createElement('button');
            btn.id = 'btn-raise-main';
            btn.className = `btn-action btn-${action.type}`;
            btn.textContent = `${label} ${initTotal.toLocaleString()}`;
            btn.addEventListener('click', () => {
                sendActionAndHide({ type: pendingRaiseType, amount: pendingRaiseAmount });
            });
            raiseRow.appendChild(btn);
            raiseRow.appendChild(input);

            btnDiv.appendChild(raiseRow);
        } else {
            const btn = document.createElement('button');
            btn.className = `btn-action btn-${action.type}`;

            switch (action.type) {
                case 'fold': {
                    btn.textContent = 'フォールド（長押し）';
                    btn.style.position = 'relative';
                    btn.style.overflow = 'hidden';
                    // Progress bar element
                    const progressBar = document.createElement('div');
                    progressBar.className = 'fold-progress-bar';
                    btn.appendChild(progressBar);
                    // Long-press (0.4s) to prevent accidental fold
                    let foldTimer = null;
                    let foldFired = false;
                    let foldRAF = null;
                    let foldStart = 0;
                    const FOLD_DURATION = 400;
                    const animateProgress = () => {
                        const elapsed = Date.now() - foldStart;
                        const pct = Math.min(100, (elapsed / FOLD_DURATION) * 100);
                        progressBar.style.width = pct + '%';
                        if (elapsed < FOLD_DURATION) foldRAF = requestAnimationFrame(animateProgress);
                    };
                    btn.addEventListener('pointerdown', (e) => {
                        foldFired = false;
                        foldStart = Date.now();
                        btn.classList.add('fold-holding');
                        progressBar.style.width = '0%';
                        foldRAF = requestAnimationFrame(animateProgress);
                        foldTimer = setTimeout(() => {
                            foldFired = true;
                            btn.classList.remove('fold-holding');
                            progressBar.style.width = '100%';
                            cancelAnimationFrame(foldRAF);
                            sendActionAndHide({ type: 'fold' });
                        }, FOLD_DURATION);
                    });
                    const cancelFold = () => {
                        clearTimeout(foldTimer);
                        cancelAnimationFrame(foldRAF);
                        btn.classList.remove('fold-holding');
                        progressBar.style.width = '0%';
                    };
                    btn.addEventListener('pointerup', cancelFold);
                    btn.addEventListener('pointerleave', cancelFold);
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

    if (hasVariable || allInAction) {
        renderBetPresets(turnData, varAction, varMin, varMax, allInAction);
    }
}


function renderBetPresets(turnData, varAction, varMin, varMax, allInAction) {
    const presetsDiv = document.getElementById('bet-presets');
    presetsDiv.innerHTML = '';
    const presets = [];
    const bb = (turnData && turnData.bigBlind) || 100;
    const pot = (turnData && turnData.pot) || 0;
    const isFirstRound = turnData && turnData.isFirstRound;
    const tableBet = (turnData && turnData.currentBet) || 0;
    const curBet = pendingCurrentBet;

    if (varAction) {
        if (isFirstRound && tableBet <= bb) {
            currentPresets['preflop-open'].forEach(mult => {
                const targetTotal = Math.round(bb * mult);
                presets.push({ label: `${mult}bb`, targetTotal });
            });
        } else if (isFirstRound && tableBet > bb) {
            currentPresets['preflop-raise'].forEach(mult => {
                const targetTotal = Math.round(tableBet * mult);
                presets.push({ label: `${mult}x`, targetTotal });
            });
        } else if (!isFirstRound) {
            currentPresets['postflop'].forEach(pct => {
                const label = pct >= 1 ? 'Pot' : `${Math.round(pct * 100)}%`;
                const targetTotal = Math.round(pot * pct) + tableBet;
                presets.push({ label, targetTotal });
            });
        }

        // Filter out presets outside valid range
        const filtered = presets.filter(p => {
            const outOfPocket = p.targetTotal - curBet;
            return outOfPocket <= varMax && outOfPocket >= varMin;
        });

        // Build segment bar
        const bar = document.createElement('div');
        bar.className = 'preset-segment-bar';
        const track = document.createElement('div');
        track.className = 'segment-track';
        bar.appendChild(track);

        const allItems = [...filtered];
        if (allInAction) {
            const amount = allInAction.total || allInAction.amount;
            allItems.push({ label: 'All-In', targetTotal: amount, isAllin: true });
        }

        allItems.forEach((p, i) => {
            const seg = document.createElement('div');
            seg.className = 'preset-segment' + (p.isAllin ? ' segment-allin' : '');
            seg.innerHTML = `${p.label}<span class="segment-value">${p.targetTotal.toLocaleString()}</span>`;
            seg.addEventListener('click', () => {
                if (p.isAllin) {
                    pendingRaiseAmount = allInAction.amount;
                    pendingRaiseType = 'allin';
                } else {
                    const outOfPocket = p.targetTotal - curBet;
                    pendingRaiseAmount = Math.min(varMax, Math.max(varMin, outOfPocket));
                    pendingRaiseType = varAction;
                }
                const total = p.isAllin ? (allInAction.total || allInAction.amount + curBet) : p.targetTotal;
                updateRaiseBtnText(total);
                setSegActive(i);
            });
            bar.appendChild(seg);
        });

        function setSegActive(index) {
            const segments = bar.querySelectorAll('.preset-segment');
            segments.forEach((s, i) => s.classList.toggle('active', i === index));
            if (index < 0 || index >= segments.length) {
                track.style.opacity = '0';
                return;
            }
            track.style.opacity = '1';
            const seg = segments[index];
            const barRect = bar.getBoundingClientRect();
            const segRect = seg.getBoundingClientRect();
            const expand = 8;
            const rawLeft = segRect.left - barRect.left - expand;
            const rawWidth = segRect.width + expand * 2;
            const minL = 3, maxR = barRect.width - 3;
            const left = Math.max(minL, rawLeft);
            const right = Math.min(maxR, rawLeft + rawWidth);
            track.style.left = left + 'px';
            track.style.width = (right - left) + 'px';
            if (seg.classList.contains('segment-allin')) track.classList.add('track-allin');
            else track.classList.remove('track-allin');
        }

        presetsDiv.appendChild(bar);
        // Auto-select first preset
        requestAnimationFrame(() => {
            if (allItems.length > 0) {
                const firstSeg = bar.querySelector('.preset-segment');
                if (firstSeg) firstSeg.click();
            } else {
                setSegActive(-1);
            }
        });

    } else if (allInAction) {
        // No variable action but all-in exists
        const amount = allInAction.total || allInAction.amount;
        const bar = document.createElement('div');
        bar.className = 'preset-segment-bar';
        const track = document.createElement('div');
        track.className = 'segment-track';
        bar.appendChild(track);
        const seg = document.createElement('div');
        seg.className = 'preset-segment segment-allin';
        seg.innerHTML = `All-In<span class="segment-value">${amount.toLocaleString()}</span>`;
        seg.addEventListener('click', () => {
            pendingRaiseAmount = allInAction.amount;
            pendingRaiseType = 'allin';
            updateRaiseBtnText(amount);
            track.style.opacity = '1';
            const barRect = bar.getBoundingClientRect();
            const segRect = seg.getBoundingClientRect();
            track.style.left = '3px';
            track.style.width = (barRect.width - 6) + 'px';
            track.classList.add('track-allin');
            seg.classList.add('active');
        });
        bar.appendChild(seg);
        presetsDiv.appendChild(bar);
    }

    if (presetsDiv.children.length > 0) {
        presetsDiv.classList.remove('hidden');
    }
}


function processPendingSwitch() {
    myTurnOnActiveTable = false;
    if (pendingSwitchQueue.length > 0) {
        const nextRid = pendingSwitchQueue.shift();
        // Verify the table still exists and needs attention
        const ctx = tables.get(nextRid);
        if (ctx && ctx.isMyTurn) {
            setTimeout(() => switchToTable(nextRid), 300);
        } else if (pendingSwitchQueue.length > 0) {
            processPendingSwitch();
        }
    }
}

function sendActionAndHide(action) {
    // Fold card animation (skip in focus mode)
    if (action.type === 'fold' && !focusMode) {
        document.querySelectorAll('#player-cards .card').forEach((card, i) => {
            card.style.animationDelay = (i * 0.1) + 's';
            card.classList.add('fold-anim');
        });
    }
    client.sendAction(action, activeTableId);
    document.getElementById('action-bar').classList.add('hidden');
    stopTurnTimer();
    processPendingSwitch();
}

function startTurnTimer(seconds) {
    stopTurnTimer();
    turnTimeLimit = seconds;
    turnTimerStart = Date.now();
    turnTimer = setInterval(() => {
        const elapsed = (Date.now() - turnTimerStart) / 1000;
        const remaining = Math.max(0, Math.ceil(turnTimeLimit - elapsed));
        if (remaining <= 0) stopTurnTimer();
    }, focusMode ? 1000 : 200);
}

function stopTurnTimer() {
    if (turnTimer) { clearInterval(turnTimer); turnTimer = null; }
    document.getElementById('action-bar').classList.add('hidden');
    document.getElementById('draw-action-bar').classList.add('hidden');
}

// ==========================================
// Pre-action system
// ==========================================
function clearPreAction() {
    preAction = null;
    const bar = document.getElementById('pre-action-bar');
    if (bar) bar.querySelectorAll('.pre-action-btn').forEach(b => b.classList.remove('active'));
}

function hidePreActionBar() {
    const bar = document.getElementById('pre-action-bar');
    if (bar) bar.classList.add('hidden');
}

function showPreActionBar() {
    const bar = document.getElementById('pre-action-bar');
    if (bar) bar.classList.remove('hidden');
}

function setupPreActions() {
    const bar = document.getElementById('pre-action-bar');
    bar.innerHTML =
        '<button class="pre-action-btn" data-action="check-fold">チェック/フォールド</button>' +
        '<button class="pre-action-btn" data-action="fold">フォールド</button>';
    bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.pre-action-btn');
        if (!btn) return;
        const action = btn.dataset.action;
        if (btn.classList.contains('active')) {
            btn.classList.remove('active');
            preAction = null;
        } else {
            bar.querySelectorAll('.pre-action-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            preAction = action;
        }
    });
}

function updatePreActionVisibility(state) {
    if (!state || !state.mySeatIndex && state.mySeatIndex !== 0) { hidePreActionBar(); return; }
    const me = state.players[state.mySeatIndex];
    if (me && !me.folded && !state.mySitout && state.currentPlayer !== state.mySeatIndex) {
        showPreActionBar();
    } else {
        hidePreActionBar();
    }
}

function startSitoutCountdown() {
    if (sitoutCountdownInterval) return; // already running
    sitoutCountdownInterval = setInterval(() => {
        if (sitoutLocalRemaining == null || sitoutLocalRemaining <= 0) {
            stopSitoutCountdown();
            return;
        }
        sitoutLocalRemaining = Math.max(0, sitoutLocalRemaining - 1);
        const txt = document.getElementById('sitout-timer-text');
        const bar = document.getElementById('sitout-timer-bar');
        if (txt) {
            const m = Math.floor(sitoutLocalRemaining / 60);
            const s = sitoutLocalRemaining % 60;
            txt.textContent = `${m}:${String(s).padStart(2, '0')}`;
            const isUrgent = sitoutLocalRemaining <= 120;
            txt.className = 'sitout-timer-text' + (isUrgent ? ' urgent' : '');
        }
        if (bar) {
            const pct = (sitoutLocalRemaining / 600) * 100;
            const isUrgent = sitoutLocalRemaining <= 120;
            bar.style.width = pct + '%';
            bar.className = 'sitout-timer-bar' + (isUrgent ? ' urgent' : '');
        }
    }, 1000);
}

function stopSitoutCountdown() {
    if (sitoutCountdownInterval) {
        clearInterval(sitoutCountdownInterval);
        sitoutCountdownInterval = null;
    }
    sitoutLocalRemaining = null;
}

function showFoldedButtons(state) {
    const actionBar = document.getElementById('action-bar');
    const btnDiv = document.getElementById('action-buttons');
    const presetsDiv = document.getElementById('bet-presets');

    if (!state.mySeatIndex && state.mySeatIndex !== 0) return;
    const me = state.players[state.mySeatIndex];
    if (!me) return;

    const isSitout = state.mySitout;
    const isFolded = me.folded;

    // Only show when player is folded/sitout AND action bar is hidden (not their turn)
    if (!isFolded && !isSitout) return;
    if (!actionBar.classList.contains('hidden')) return;

    actionBar.classList.remove('hidden');
    btnDiv.innerHTML = '';
    presetsDiv.innerHTML = '';
    presetsDiv.classList.add('hidden');

    if (me.pendingRejoin) {
        // Pending rejoin — waiting for next hand
        const msg = document.createElement('div');
        msg.className = 'folded-msg pending-rejoin-msg';
        msg.textContent = '復帰予約済み — 次のハンドから参加します';
        btnDiv.appendChild(msg);

        const leaveBtn = document.createElement('button');
        leaveBtn.className = 'btn-action btn-fold';
        leaveBtn.textContent = '退室する';
        leaveBtn.addEventListener('click', () => {
            if (isInZoom) client.leaveZoom();
            else { client.leaveRoom(activeTableId); removeTable(activeTableId); }
        });
        btnDiv.appendChild(leaveBtn);
    } else if (isSitout) {
        // Sitout state — show countdown timer + rejoin + leave
        const serverRemaining = me.sitoutRemaining;
        // Sync local countdown from server value
        if (serverRemaining != null) {
            sitoutLocalRemaining = serverRemaining;
        } else if (sitoutLocalRemaining == null) {
            sitoutLocalRemaining = 600; // default 10 min
        }

        const label = document.createElement('div');
        label.className = 'folded-msg sitout-msg';
        label.textContent = '💤 離席中';
        btnDiv.appendChild(label);

        const timerWrap = document.createElement('div');
        timerWrap.className = 'sitout-timer-wrap';
        const isUrgent = sitoutLocalRemaining <= 120;
        const m = Math.floor(sitoutLocalRemaining / 60);
        const s = sitoutLocalRemaining % 60;
        timerWrap.innerHTML = `
            <div class="sitout-timer-label">自動退室まで</div>
            <div class="sitout-timer-text${isUrgent ? ' urgent' : ''}" id="sitout-timer-text">${m}:${String(s).padStart(2, '0')}</div>
            <div class="sitout-timer-bar-outer">
                <div class="sitout-timer-bar${isUrgent ? ' urgent' : ''}" id="sitout-timer-bar" style="width:${(sitoutLocalRemaining / 600) * 100}%"></div>
            </div>
        `;
        btnDiv.appendChild(timerWrap);

        // Start local countdown interval
        startSitoutCountdown();

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:4px;';

        const rejoinBtn = document.createElement('button');
        rejoinBtn.className = 'btn-action btn-call';
        rejoinBtn.textContent = '復帰する';
        rejoinBtn.addEventListener('click', () => {
            stopSitoutCountdown();
            client.rejoinGame(activeTableId);
        });
        btnRow.appendChild(rejoinBtn);

        const leaveBtn = document.createElement('button');
        leaveBtn.className = 'btn-action btn-fold';
        leaveBtn.textContent = '退室する';
        leaveBtn.addEventListener('click', () => {
            stopSitoutCountdown();
            if (isInZoom) client.leaveZoom();
            else { client.leaveRoom(activeTableId); removeTable(activeTableId); }
        });
        btnRow.appendChild(leaveBtn);
        btnDiv.appendChild(btnRow);
    } else {
        // Just folded — show only the rebuy button if chips are low.
        // Leave / add-table actions are available via the hamburger menu.
        const msg = document.createElement('div');
        msg.className = 'folded-msg';
        msg.textContent = 'フォールド済み — 次のハンドを待っています';
        btnDiv.appendChild(msg);

        const rebuyAmount = 10000;
        if (me.chips < rebuyAmount) {
            const rebuyBtn = document.createElement('button');
            rebuyBtn.className = 'btn-action btn-call';
            rebuyBtn.textContent = `チップ補充 (${rebuyAmount.toLocaleString()})`;
            rebuyBtn.addEventListener('click', () => {
                client.rebuyChips(rebuyAmount, activeTableId);
                rebuyBtn.disabled = true;
                rebuyBtn.textContent = '補充済み';
            });
            btnDiv.appendChild(rebuyBtn);
        }
        return; // Skip the shared add-table button below for the folded state.
    }

    // Add table button (shown for pendingRejoin / sitout states only, when under max tables)
    if (tables.size < MAX_TABLES) {
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-action btn-check';
        addBtn.textContent = '+ テーブル追加';
        addBtn.addEventListener('click', () => openAddTableModal());
        btnDiv.appendChild(addBtn);
    }
}

function onGameOver(data) {
    stopTurnTimer();
    saveCurrentHand();

    const ranking = data.ranking || [];

    ui.addLog('ゲーム終了！ Total Win ランキング：', 'important');
    ranking.forEach((p, i) => {
        const sign = p.totalWin >= 0 ? '+' : '';
        ui.addLog(`${i + 1}位 ${p.name}: ${sign}${p.totalWin}`, i === 0 ? 'important' : '');
    });

    if (isInZoom) return;

    // Show session summary overlay instead of confirm dialog
    setTimeout(() => showSessionSummary(ranking), 1500);
}

function showSessionSummary(ranking) {
    const overlay = document.getElementById('session-summary');
    if (!overlay) return;
    overlay.classList.remove('hidden');

    const myName = client.name;

    // === Ranking section ===
    const rankContainer = document.getElementById('ss-ranking');
    let rankHtml = '';
    const medals = ['🥇', '🥈', '🥉'];
    ranking.forEach((p, i) => {
        const rowCls = i < 3 ? `ss-rank-${i + 1}` : 'ss-rank-other';
        const pos = i < 3 ? medals[i] : `${i + 1}`;
        const isMe = p.name === myName;
        const diff = p.netProfit !== undefined ? p.netProfit : p.totalWin;
        let diffCls, diffStr;
        if (diff > 0) { diffCls = 'ss-rank-plus'; diffStr = `+${diff.toLocaleString()}`; }
        else if (diff < 0) { diffCls = 'ss-rank-minus'; diffStr = diff.toLocaleString(); }
        else { diffCls = 'ss-rank-zero'; diffStr = '±0'; }
        const rebuyStr = p.totalRebuys ? `<span class="ss-rank-rebuy">補充: +${p.totalRebuys.toLocaleString()}</span>` : '';

        rankHtml += `<div class="ss-rank-row ${rowCls}">`;
        rankHtml += `<span class="ss-rank-pos">${pos}</span>`;
        rankHtml += `<span class="ss-rank-name${isMe ? ' ss-rank-me' : ''}">${p.name}${isMe ? ' (自分)' : ''}${rebuyStr}</span>`;
        rankHtml += `<span class="ss-rank-diff ${diffCls}">${diffStr}</span>`;
        rankHtml += `</div>`;
    });
    rankContainer.innerHTML = rankHtml;

    // === Highlights section ===
    const hlContainer = document.getElementById('ss-highlights');
    const highlights = generateHighlights(ranking);
    let hlHtml = '<div class="ss-highlight-list">';
    for (const hl of highlights) {
        hlHtml += `<div class="ss-highlight">`;
        hlHtml += `<span class="ss-hl-icon">${hl.icon}</span>`;
        hlHtml += `<div class="ss-hl-body"><div class="ss-hl-title">${hl.title}</div><div class="ss-hl-name">${hl.name}</div></div>`;
        hlHtml += `</div>`;
    }
    hlHtml += '</div>';
    hlContainer.innerHTML = hlHtml;

    // === Actions ===
    const lobbyBtn = document.getElementById('btn-ss-lobby');
    lobbyBtn.disabled = true;
    // Enable after 3 seconds
    setTimeout(() => { lobbyBtn.disabled = false; }, 3000);

    lobbyBtn.onclick = () => {
        overlay.classList.add('hidden');
        // Table is already removed by game_over handler
        if (tables.size === 0) showScreen('sns');
    };

    const shareBtn = document.getElementById('btn-ss-share');
    shareBtn.onclick = () => {
        const lines = ['【セッションサマリー】'];
        ranking.forEach((p, i) => {
            const profit = p.netProfit !== undefined ? p.netProfit : p.totalWin;
            const sign = profit >= 0 ? '+' : '';
            const rebuy = p.totalRebuys ? ` (補充: +${p.totalRebuys})` : '';
            lines.push(`${i + 1}位 ${p.name}: ${sign}${profit}${rebuy}`);
        });
        highlights.forEach(hl => {
            lines.push(`${hl.icon} ${hl.title}: ${hl.name}`);
        });
        const text = lines.join('\n');
        if (navigator.share) {
            navigator.share({ text }).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                shareBtn.textContent = 'コピー済み!';
                setTimeout(() => { shareBtn.textContent = '共有'; }, 2000);
            });
        }
    };
}

function generateHighlights(ranking) {
    const highlights = [];
    if (ranking.length === 0) return highlights;

    // Biggest winner
    const bigWinner = ranking.reduce((a, b) => a.totalWin > b.totalWin ? a : b);
    if (bigWinner.totalWin > 0) {
        highlights.push({ icon: '👑', title: '最大勝者', name: `${bigWinner.name} (+${bigWinner.totalWin.toLocaleString()})` });
    }

    // Total hands played
    if (handHistory.length > 0) {
        highlights.push({ icon: '🃏', title: '総ハンド数', name: `${handHistory.length}ハンド` });
    }

    return highlights;
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
            ts: Date.now(),
            pls: Object.keys(data.stats).filter(n => n !== name),
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
    // Stats: open directly from main-screen header
    const headerStatsBtn = document.getElementById('sns-header-stats');
    if (headerStatsBtn) headerStatsBtn.addEventListener('click', () => {
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
        const isMeSeat = parseInt(seatId) === data.mySeat;
        const isMeClass = isMeSeat ? ' style="color:var(--gold)"' : '';
        html += renderStatsBlock(pName, c, isMeClass, isMeSeat);
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
        html += renderPlayerStatsWithTabs(client.name, myStats, ' style="color:var(--gold)"', true);
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
            const isMeFlag = name === client.name;
            const isMeStyle = isMeFlag ? ' style="color:var(--gold)"' : '';
            html += renderPlayerStatsWithTabs(name, c, isMeStyle, isMeFlag);
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

    // Hands played ranking (all players, top 50)
    html += '<h3 class="ranking-section-title">ハンド数ランキング（上位50名）</h3>';
    const handEntries = entries
        .map(([name, c]) => ({ name, hands: c.hands }))
        .sort((a, b) => b.hands - a.hands)
        .slice(0, 50);

    html += '<table class="ranking-table"><thead><tr><th>#</th><th>プレイヤー</th><th>ハンド数</th></tr></thead><tbody>';
    handEntries.forEach((e, i) => {
        const isMe = e.name === client.name ? ' class="ranking-me"' : '';
        html += `<tr${isMe}><td>${i + 1}</td><td>${e.name}</td><td>${e.hands.toLocaleString()}</td></tr>`;
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
        const isMeFlag = playerName === client.name;
        container.innerHTML = renderPlayerStatsWithTabs(playerName, stats, ' style="color:var(--gold)"', isMeFlag);
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

function renderPlayerStatsWithTabs(pName, c, extraAttr, isMe) {
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
    html += `<div class="stats-tab-content" data-tab="total">${renderStatsTable(c, isMe)}</div>`;

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
            html += renderStatsTable(gs, isMe);
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
    const privateKeys = new Set(['wsd', 'wr', 'sdWin', 'nsdWin', 'totalWin']);
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
        if (!isMe && privateKeys.has(gs.key)) continue;
        html += `<label class="graph-cb-label" style="color:${gs.color}"><input type="checkbox" class="graph-cb" data-key="${gs.key}" ${gs.checked && (isMe || !privateKeys.has(gs.key)) ? 'checked' : ''}>${gs.label}</label>`;
    }
    html += `</div>`;
    html += `<canvas class="stats-graph-canvas" width="560" height="280"></canvas>`;
    html += `<div class="graph-summary"></div>`;
    html += `</div></div>`;

    html += `</div>`;
    return html;
}

function renderStatsTable(c, isMe) {
    let html = `<table class="stats-table"><tbody>
        <tr><td class="stat-label">VPIP</td><td class="stat-value">${c.vpip}%</td>
        <td class="stat-label">PFR</td><td class="stat-value">${c.pfr}%</td></tr>
        <tr><td class="stat-label">3-Bet</td><td class="stat-value">${c.threeBet}%</td>
        <td class="stat-label">4-Bet</td><td class="stat-value">${c.fourBet}%</td></tr>
        <tr><td class="stat-label">Fold to 3Bet</td><td class="stat-value">${c.foldTo3Bet}%</td>
        <td class="stat-label">All-in%</td><td class="stat-value">${c.allIn}%</td></tr>
        <tr><td class="stat-label">Agg%</td><td class="stat-value">${c.postflopAgg}%</td>
        <td class="stat-label">AF</td><td class="stat-value">${c.af}</td></tr>
        <tr><td class="stat-label">WTSD%</td><td class="stat-value">${c.wtsd}%</td>
        <td class="stat-label">W$SD</td><td class="stat-value">${isMe ? c.wsd + '%' : '非公開'}</td></tr>
        <tr><td class="stat-label">Win Rate</td><td class="stat-value">${isMe ? c.winRate + '/100h' : '非公開'}</td>
        <td class="stat-label">SD Win</td><td class="stat-value">${isMe ? (typeof c.showdownWin === 'number' ? c.showdownWin.toLocaleString() : c.showdownWin) : '非公開'}</td></tr>
        <tr><td class="stat-label">Non-SD Win</td><td class="stat-value">${isMe ? (typeof c.nonShowdownWin === 'number' ? c.nonShowdownWin.toLocaleString() : (c.nonShowdownWin || '-')) : '非公開'}</td>
        <td class="stat-label">Total Win</td><td class="stat-value">${isMe ? (typeof c.showdownWin === 'number' ? ((c.showdownWin || 0) + (c.nonShowdownWin || 0)).toLocaleString() : '-') : '非公開'}</td></tr>
    </tbody></table>`;
    return html;
}

// Legacy alias
function renderStatsBlock(pName, c, extraAttr, isMe) {
    return renderPlayerStatsWithTabs(pName, c, extraAttr, isMe);
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
        // Collect room metadata: latest timestamp, all players per room
        const roomMeta = {};
        for (const d of pData) {
            if (!d.rid || d.rid === 'zoom') continue;
            if (!roomMeta[d.rid]) roomMeta[d.rid] = { ts: d.ts || 0, players: new Set() };
            if (d.ts && d.ts > roomMeta[d.rid].ts) roomMeta[d.rid].ts = d.ts;
            if (d.pls) d.pls.forEach(p => roomMeta[d.rid].players.add(p));
        }
        // Sort by date descending
        const sorted = Object.entries(roomMeta).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
        const isMobile = window.innerWidth <= 600;
        roomSelect.innerHTML = '<option value="">全ルーム</option>';
        for (const [rid, meta] of sorted) {
            const dateStr = meta.ts ? new Date(meta.ts).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '';
            const playerArr = [...meta.players];
            let playersStr = '';
            if (playerArr.length > 0) {
                if (isMobile && playerArr.length > 1) {
                    playersStr = playerArr[0] + '、他' + (playerArr.length - 1) + '名';
                } else {
                    playersStr = playerArr.join(', ');
                }
            }
            const label = `${rid}${dateStr ? ' ' + dateStr : ''}${playersStr ? ' / ' + playersStr : ''}`;
            roomSelect.innerHTML += `<option value="${rid}">${label}</option>`;
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
            if (msg) { client.sendChat(msg, activeTableId); input.value = ''; }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') send.click();
        });
    }
    // Lobby chat (cp-chat-input) removed. In-game chat is still supported.
    hookChatInput('room-chat-input', 'btn-room-chat-send');
    hookChatInput('game-chat-input', 'btn-game-chat-send');

    // Quick Chat palette
    const qcBtn = document.getElementById('btn-quick-chat');
    const qcPalette = document.getElementById('quick-chat-palette');
    if (qcBtn && qcPalette) {
        qcBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            qcPalette.classList.toggle('hidden');
        });
        qcPalette.querySelectorAll('.qc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const msg = btn.dataset.msg;
                if (msg) {
                    client.sendChat(msg, activeTableId);
                    showQuickChatFloat(msg);
                }
                qcPalette.classList.add('hidden');
            });
        });
        // Close palette when clicking outside
        document.addEventListener('click', (e) => {
            if (!qcPalette.contains(e.target) && e.target !== qcBtn) {
                qcPalette.classList.add('hidden');
            }
        });
    }
}

function appendChatMsg(logId, from, message) {
    const log = document.getElementById(logId);
    if (!log) return;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const div = document.createElement('div');
    div.className = 'room-chat-msg';
    div.innerHTML = `<span class="chat-ts">${ts}</span><span class="room-chat-name">${from}:</span> ${message}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

let chatUnreadCount = 0;

function addChatEntry(text, cls) {
    const log = document.getElementById('chat-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = 'chat-entry' + (cls ? ` chat-${cls}` : '');
    // Add timestamp
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    entry.innerHTML = `<span class="chat-ts">${ts}</span> ${text}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 200) log.removeChild(log.firstChild);
    // Update unread badge if chat panel is not open
    if (activeSidePanel !== 'chat') {
        chatUnreadCount++;
        updateChatBadge();
    }
}

function updateChatBadge() {
    const badge = document.getElementById('pill-chat-badge');
    if (badge) {
        if (chatUnreadCount > 0) {
            badge.classList.remove('hidden');
            badge.textContent = chatUnreadCount > 99 ? '99+' : chatUnreadCount;
        } else {
            badge.classList.add('hidden');
        }
    }
}

function onChat(data) {
    // Room/game chat only (not lobby)
    appendChatMsg('room-chat-log', data.from, data.message);
    addChatEntry(`[${data.from}] ${data.message}`, 'msg');
    // Show message as a speech bubble anchored to the speaker's seat
    showSeatBubble(data.from, data.message);
}

// Phase 2: speech bubble above/below the speaker's seat (auto-fades)
function showSeatBubble(fromName, message) {
    if (!currentState || !message) return;
    const seatIdx = currentState.players.findIndex(p => p.name === fromName);
    if (seatIdx < 0) return;
    const tableFelt = document.getElementById('table-felt');
    const seatEl = document.getElementById(`seat-${seatIdx}`);
    if (!tableFelt || !seatEl) return;
    // Determine where the seat sits so we can anchor the bubble appropriately.
    const seatClass = [...seatEl.classList].find(c => c.startsWith('seat-') && c !== 'seat') || '';
    const isTopSeat = seatClass.startsWith('seat-top');
    // Remove existing bubble for the same seat so a new message replaces it cleanly
    tableFelt.querySelectorAll(`.seat-bubble[data-seat="${seatIdx}"]`).forEach(el => el.remove());
    // Anchor position: centered horizontally on the seat, above it (or below for top seats).
    const feltRect = tableFelt.getBoundingClientRect();
    const seatRect = seatEl.getBoundingClientRect();
    const leftPct = ((seatRect.left + seatRect.width / 2) - feltRect.left) / feltRect.width * 100;
    const topPct = isTopSeat
        ? (seatRect.bottom - feltRect.top) / feltRect.height * 100
        : (seatRect.top - feltRect.top) / feltRect.height * 100;
    const bubble = document.createElement('div');
    bubble.className = 'seat-bubble' + (isTopSeat ? ' seat-bubble-down' : '');
    bubble.dataset.seat = String(seatIdx);
    // Truncate very long messages so the bubble stays compact
    const text = message.length > 80 ? message.slice(0, 80) + '…' : message;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'bubble-name';
    nameSpan.textContent = fromName;
    const bodySpan = document.createElement('span');
    bodySpan.textContent = text;
    bubble.appendChild(nameSpan);
    bubble.appendChild(bodySpan);
    bubble.style.left = leftPct + '%';
    bubble.style.top = topPct + '%';
    tableFelt.appendChild(bubble);
    // Auto-fade after 4s (shorter for very short messages)
    const lifetime = text.length <= 10 ? 3000 : 4500;
    setTimeout(() => bubble.classList.add('seat-bubble-out'), lifetime);
    setTimeout(() => bubble.remove(), lifetime + 400);
}

// ==========================================
// Online User List
// ==========================================
function renderOnlineUsers(users) {
    if (Array.isArray(users)) lastOnlineUsers = users;
    const container = document.getElementById('online-user-list');
    if (!container) return;

    container.innerHTML = '';

    const statusOrder = { lobby: 0, playing: 1, zoom: 2 };
    const statusLabel = { lobby: 'ロビー', playing: 'ゲーム中', zoom: 'Zoom' };
    const myName = client.name;
    const iAmGuest = !loggedInAccount;

    // Sort: followed users first, then by status
    users.sort((a, b) => {
        const af = myFollowing.has(a.name) ? 0 : 1;
        const bf = myFollowing.has(b.name) ? 0 : 1;
        if (af !== bf) return af - bf;
        return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
    });

    for (const u of users) {
        const item = document.createElement('div');
        item.className = 'online-user-item';
        if (myFollowing.has(u.name)) item.classList.add('is-following');

        const avatarHtml = u.avatar
            ? `<img src="avatars/${u.avatar}.svg" alt="">`
            : `<div class="online-user-initial">${(u.name || '?').charAt(0).toUpperCase()}</div>`;

        // Show follow button: only if I'm logged in, target is non-guest, and not self
        const showFollow = !iAmGuest && !u.isGuest && u.name !== myName;
        const isFollowing = myFollowing.has(u.name);
        const followBtnHtml = showFollow
            ? `<button class="online-user-follow ${isFollowing ? 'following' : ''}" data-follow-target="${u.name}" title="${isFollowing ? 'フォロー解除' : 'フォロー'}">${isFollowing ? '★' : '☆'}</button>`
            : '';

        item.innerHTML = `
            ${avatarHtml}
            <span class="online-user-name">${u.name}</span>
            <span class="online-user-status">
                <span class="online-status-dot ${u.status}"></span>
                ${statusLabel[u.status] || ''}
            </span>
            ${followBtnHtml}
        `;

        if (showFollow) {
            item.querySelector('.online-user-follow').addEventListener('click', (e) => {
                e.stopPropagation();
                if (myFollowing.has(u.name)) {
                    client.unfollow(u.name);
                    myFollowing.delete(u.name);
                } else {
                    client.follow(u.name);
                    myFollowing.add(u.name);
                }
                renderOnlineUsers(lastOnlineUsers);
            });
        }

        container.appendChild(item);
    }
}

// Direct Message System — extracted to js/dm.js

function setupFocusMode() {
    const btn = document.getElementById('btn-focus-mode');
    if (!btn) return;

    function applyFocusMode() {
        const gameScreen = document.getElementById('game-screen');
        if (!gameScreen) return;
        if (focusMode) {
            gameScreen.classList.add('focus-mode');
            btn.textContent = '🎯 フォーカス ON';
        } else {
            gameScreen.classList.remove('focus-mode');
            btn.textContent = '🎯 フォーカス OFF';
        }
    }

    applyFocusMode();

    btn.addEventListener('click', () => {
        focusMode = !focusMode;
        localStorage.setItem('poker10mix_focus', focusMode ? 'on' : 'off');
        applyFocusMode();
    });
}

function showQuickChatFloat(msg) {
    const tableFelt = document.getElementById('table-felt');
    if (!tableFelt || !currentState) return;
    const mySeat = currentState.mySeatIndex;
    const seatEl = document.getElementById(`seat-${mySeat}`);
    if (!seatEl) return;

    const seatClass = [...seatEl.classList].find(c => c.startsWith('seat-') && c !== 'seat');
    const posMap = {
        'seat-bottom': [50, 65],
        'seat-bottom-left': [20, 60],
        'seat-top-left': [20, 35],
        'seat-top': [50, 25],
        'seat-top-right': [80, 35],
        'seat-bottom-right': [80, 60],
    };
    const pos = posMap[seatClass] || [50, 50];

    const el = document.createElement('div');
    el.className = 'qc-float';
    el.textContent = msg;
    el.style.left = pos[0] + '%';
    el.style.top = pos[1] + '%';
    tableFelt.appendChild(el);
    setTimeout(() => el.remove(), 2600);
}

function onEmote(data) {
    // Show floating emote on the table near the player's seat
    const tableFelt = document.getElementById('table-felt');
    if (!tableFelt) return;

    const emoteEl = document.createElement('div');
    emoteEl.className = 'emote-float';
    emoteEl.textContent = data.emote;

    // Position near the seat if possible
    if (data.seat >= 0 && currentState) {
        const seatEl = document.getElementById(`seat-${data.seat}`);
        if (seatEl) {
            const seatClass = [...seatEl.classList].find(c => c.startsWith('seat-') && c !== 'seat');
            const posMap = {
                'seat-bottom': [50, 65],
                'seat-bottom-left': [20, 60],
                'seat-top-left': [20, 35],
                'seat-top': [50, 25],
                'seat-top-right': [80, 35],
                'seat-bottom-right': [80, 60],
            };
            const pos = posMap[seatClass] || [50, 50];
            emoteEl.style.left = pos[0] + '%';
            emoteEl.style.top = pos[1] + '%';
        }
    } else {
        emoteEl.style.left = '50%';
        emoteEl.style.top = '50%';
    }

    tableFelt.appendChild(emoteEl);
    // Remove after animation
    setTimeout(() => emoteEl.remove(), 2000);

}

// ==========================================
// Showdown Reaction Bar
// ==========================================
let reactionCooldown = false;

function showReactionBar() {
    // Remove existing bar
    const existing = document.getElementById('reaction-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'reaction-bar';
    bar.className = 'reaction-bar';

    const reactions = [
        { emote: '🎉', label: 'ナイス' },
        { emote: '😱', label: 'えぐい' },
        { emote: '😭', label: '泣' },
        { emote: '🤣', label: '笑' },
        { emote: '👀', label: '注目' },
    ];

    for (const r of reactions) {
        const btn = document.createElement('button');
        btn.className = 'reaction-btn';
        btn.innerHTML = `<span class="reaction-emoji">${r.emote}</span><span class="reaction-label">${r.label}</span>`;
        btn.addEventListener('click', () => {
            if (reactionCooldown) return;
            reactionCooldown = true;
            setTimeout(() => { reactionCooldown = false; }, 3000);
            client.sendReaction(r.emote);
            bar.remove();
        });
        bar.appendChild(btn);
    }

    document.getElementById('table-felt').appendChild(bar);

    // Auto-hide after 4 seconds
    setTimeout(() => { if (bar.parentNode) bar.remove(); }, 4000);
}

function onReaction(data) {
    const tableFelt = document.getElementById('table-felt');
    if (!tableFelt) return;

    const el = document.createElement('div');
    el.className = 'reaction-pop';
    el.innerHTML = `<span class="reaction-pop-emoji">${data.emote}</span><span class="reaction-pop-name">${data.from}</span>`;

    // Stagger multiple reactions
    const existing = tableFelt.querySelectorAll('.reaction-pop');
    const offsetX = existing.length * 40;
    el.style.left = `calc(50% + ${offsetX - 40}px)`;

    tableFelt.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

// ==========================================
// Lobby Big Hand Feed
// ==========================================
const bigHandFeed = [];

function onBigHand(data) {
    bigHandFeed.unshift(data);
    if (bigHandFeed.length > 5) bigHandFeed.pop();
    renderBigHandFeed();
}

function renderBigHandFeed() {
    const container = document.getElementById('big-hand-feed');
    if (!container) return;

    if (bigHandFeed.length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');

    let html = '<div class="bhf-title">🔥 最近のビッグハンド</div>';
    for (const h of bigHandFeed) {
        const rankText = h.handRank ? ` (${h.handRank})` : '';
        html += `<div class="bhf-item" data-room="${h.roomId}">`;
        html += `<span class="bhf-room">[${h.roomId}]</span> `;
        html += `<span class="bhf-game">${h.gameName}</span> `;
        html += `<span class="bhf-winner">${h.winner}</span> が `;
        html += `<span class="bhf-pot">${h.pot.toLocaleString()}</span> チップ獲得${rankText}`;
        html += `</div>`;
    }
    container.innerHTML = html;

    // Click to join room
    container.querySelectorAll('.bhf-item').forEach(item => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            const roomId = item.dataset.room;
            if (roomId && roomId !== 'ZOOM') {
                client.joinRoom(roomId);
            } else if (roomId === 'ZOOM') {
                client.joinZoom();
            }
        });
    });
}

// ==========================================
// Chip Animation System
// ==========================================
let prevPot = 0;
let prevBets = {}; // seatIdx -> lastBet amount

function animateChipTowardsPot(seatIdx) {
    if (focusMode) return;
    const tableFelt = document.getElementById('table-felt');
    if (!tableFelt) return;
    const seatEl = document.getElementById(`seat-${seatIdx}`);
    if (!seatEl) return;

    const feltRect = tableFelt.getBoundingClientRect();
    const seatRect = seatEl.getBoundingClientRect();

    // Start position: center of seat relative to table-felt
    const startX = (seatRect.left + seatRect.width / 2) - feltRect.left;
    const startY = (seatRect.top + seatRect.height / 2) - feltRect.top;

    // End position: pot display (center of table)
    const potEl = document.getElementById('pot-display');
    let endX = feltRect.width / 2, endY = feltRect.height * 0.32;
    if (potEl) {
        const potRect = potEl.getBoundingClientRect();
        endX = (potRect.left + potRect.width / 2) - feltRect.left;
        endY = (potRect.top + potRect.height / 2) - feltRect.top;
    }

    // Create 2-3 small flying chips for visual effect
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
        const chip = document.createElement('div');
        chip.className = 'chip-fly';
        // Slight random offset for each chip
        const offX = (Math.random() - 0.5) * 12;
        const offY = (Math.random() - 0.5) * 12;
        chip.style.left = (startX + offX) + 'px';
        chip.style.top = (startY + offY) + 'px';
        tableFelt.appendChild(chip);

        // Trigger transition after paint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                chip.style.left = endX + 'px';
                chip.style.top = endY + 'px';
                setTimeout(() => {
                    chip.classList.add('chip-fly-done');
                    setTimeout(() => chip.remove(), 150);
                }, 450 + i * 50);
            });
        });
    }
}

function animateChipToWinner(seatIdx, amount) {
    if (focusMode) return;
    const tableFelt = document.getElementById('table-felt');
    if (!tableFelt) return;
    const seatEl = document.getElementById(`seat-${seatIdx}`);
    if (!seatEl) return;

    const feltRect = tableFelt.getBoundingClientRect();
    const seatRect = seatEl.getBoundingClientRect();

    // Start: pot center
    const potEl = document.getElementById('pot-display');
    let startX = feltRect.width / 2, startY = feltRect.height * 0.32;
    if (potEl) {
        const potRect = potEl.getBoundingClientRect();
        startX = (potRect.left + potRect.width / 2) - feltRect.left;
        startY = (potRect.top + potRect.height / 2) - feltRect.top;
    }

    // End: winner seat center
    const endX = (seatRect.left + seatRect.width / 2) - feltRect.left;
    const endY = (seatRect.top + seatRect.height / 2) - feltRect.top;

    // Create golden flying chips
    const count = 3;
    for (let i = 0; i < count; i++) {
        const chip = document.createElement('div');
        chip.className = 'chip-fly-win';
        const offX = (Math.random() - 0.5) * 10;
        const offY = (Math.random() - 0.5) * 10;
        chip.style.left = (startX + offX) + 'px';
        chip.style.top = (startY + offY) + 'px';
        tableFelt.appendChild(chip);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                chip.style.left = (endX + offX * 0.5) + 'px';
                chip.style.top = (endY + offY * 0.5) + 'px';
                setTimeout(() => {
                    chip.classList.add('chip-fly-done');
                    setTimeout(() => chip.remove(), 200);
                }, 500 + i * 60);
            });
        });
    }

    // Show won amount popup on seat
    const popup = document.createElement('div');
    popup.className = 'seat-won-popup';
    popup.textContent = `+${amount.toLocaleString()}`;
    seatEl.appendChild(popup);
    setTimeout(() => popup.remove(), 2600);

    // Gold glow on winner seat
    seatEl.classList.add('seat-winner');
    setTimeout(() => seatEl.classList.remove('seat-winner'), 2500);
}

function animatePotCountUp(fromVal, toVal) {
    if (focusMode) { const el = document.querySelector('.pot-amount'); if (el) el.textContent = toVal.toLocaleString(); return; }
    const potAmountEl = document.querySelector('.pot-amount');
    if (!potAmountEl) return;
    potAmountEl.classList.add('pot-counting');
    setTimeout(() => potAmountEl.classList.remove('pot-counting'), 400);

    const duration = 350;
    const startTime = performance.now();
    const diff = toVal - fromVal;

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(fromVal + diff * eased);
        potAmountEl.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// Detect bet changes and trigger animations
function detectBetAnimations(state) {
    if (!state || !state.players) return;
    const newBets = {};
    state.players.forEach((p, i) => {
        newBets[i] = p.seatBet || 0;
        const prevBet = prevBets[i] || 0;
        if (newBets[i] > prevBet && newBets[i] > 0) {
            animateChipTowardsPot(i);
        }
    });
    prevBets = newBets;

    // Pot count-up
    if (state.pot > prevPot && prevPot > 0) {
        animatePotCountUp(prevPot, state.pot);
    }
    prevPot = state.pot || 0;
}

// Detect winner from hand_result and trigger win animation
function detectWinAnimation(handResult) {
    if (!handResult || !handResult.players || !currentState) return;
    for (const p of handResult.players) {
        const diff = p.chips - p.startChips;
        if (diff > 0) {
            // Find seat index by name
            const seatIdx = currentState.players.findIndex(sp => sp.name === p.name);
            if (seatIdx >= 0) {
                setTimeout(() => animateChipToWinner(seatIdx, diff), 300);
            }
        }
    }
}

// ==========================================
// Game Change Overlay + Banner
// ==========================================
let gameChangeTimer = null;

function showGameChangeOverlay(state) {
    if (focusMode) return;
    const overlay = document.getElementById('game-change-overlay');
    if (!overlay) return;

    // Build badges
    const gameType = getGameType(state.gameId);
    const typeBadge = GAME_TYPE_LABELS[gameType];
    const catBadge = GAME_CATEGORY_LABELS[getGameCategory(state.gameId)];
    const betBadge = BETTING_TYPE_LABELS[getBettingType(state.gameId)];

    overlay.querySelector('.gc-name').textContent = state.gameName;
    overlay.querySelector('.gc-badges').innerHTML =
        `<span class="game-type-badge" style="background:${typeBadge.color}">${typeBadge.label}</span>`
        + `<span class="game-type-badge" style="background:${catBadge.color};color:${catBadge.textColor};border:1px solid #555">${catBadge.label}</span>`
        + `<span class="game-type-badge" style="background:${betBadge.color}">${betBadge.label}</span>`;

    // Show overlay
    overlay.classList.remove('hidden', 'gc-out');
    if (gameChangeTimer) clearTimeout(gameChangeTimer);

    // Fade out after 1.8s
    gameChangeTimer = setTimeout(() => {
        overlay.classList.add('gc-out');
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('gc-out');
        }, 400);
    }, 1800);

}

// ==========================================
// 案2: Ripple effect + vibration on action buttons
// ==========================================
function setupActionRipple() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-action');
        if (!btn) return;

        // Haptic feedback on mobile
        if (navigator.vibrate) navigator.vibrate(30);

        // Ripple effect
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    });
}

// ==========================================
// Side Panel (chat / log) — pills on mobile, side-by-side on PC
// ==========================================
let activeSidePanel = null; // 'chat' | 'log' | null

function isSidePanelPC() {
    return window.innerWidth >= 768;
}

function openSidePanel(panel) {
    const ap = document.getElementById('action-panel');
    const sp = document.getElementById('side-panel');

    // On mobile: toggle same panel = close
    if (!isSidePanelPC() && activeSidePanel === panel) {
        closeSidePanel();
        return;
    }

    activeSidePanel = panel;
    sp.classList.remove('hidden');
    ap.classList.add('sp-open');

    // Switch views
    document.querySelectorAll('.sp-view').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById('sp-' + panel);
    if (target) target.classList.remove('hidden');

    // Highlight tab
    document.querySelectorAll('.sp-tab').forEach(t => t.classList.toggle('active', t.dataset.sp === panel));

    // Highlight pill
    document.querySelectorAll('.side-pill').forEach(p => p.classList.toggle('active', p.dataset.panel === panel));

    // Panel-specific actions
    if (panel === 'chat') {
        const chatLog = document.getElementById('chat-log');
        if (chatLog) setTimeout(() => chatLog.scrollTop = chatLog.scrollHeight, 50);
        chatUnreadCount = 0;
        updateChatBadge();
    } else if (panel === 'log') {
        const gameLog = document.getElementById('game-log');
        if (gameLog) setTimeout(() => gameLog.scrollTop = gameLog.scrollHeight, 50);
    }
}

function closeSidePanel() {
    activeSidePanel = null;
    const ap = document.getElementById('action-panel');
    const sp = document.getElementById('side-panel');
    if (!isSidePanelPC()) {
        sp.classList.add('hidden');
    }
    ap.classList.remove('sp-open');
    document.querySelectorAll('.side-pill').forEach(p => p.classList.remove('active'));
}

function setupSidePanel() {
    // Pill buttons (mobile)
    document.querySelectorAll('.side-pill').forEach(pill => {
        pill.addEventListener('click', () => openSidePanel(pill.dataset.panel));
    });

    // Tab buttons inside panel header
    document.querySelectorAll('.sp-tab').forEach(tab => {
        tab.addEventListener('click', () => openSidePanel(tab.dataset.sp));
    });

    // Close button (mobile only, hidden on PC via CSS)
    document.getElementById('side-panel-close').addEventListener('click', closeSidePanel);

    // Tap outside the sheet (on the backdrop) to close on mobile
    const ap = document.getElementById('action-panel');
    if (ap) {
        ap.addEventListener('click', (e) => {
            if (!ap.classList.contains('sp-open') || isSidePanelPC()) return;
            // Close only if the click landed on action-panel itself (the backdrop pseudo-element)
            // or outside side-panel/side-pills/action-col content.
            const sp = document.getElementById('side-panel');
            const pills = document.getElementById('side-pills');
            const col = document.getElementById('action-col');
            if (sp && sp.contains(e.target)) return;
            if (pills && pills.contains(e.target)) return;
            if (col && col.contains(e.target)) return;
            closeSidePanel();
        });
    }

    // On PC: auto-open chat by default
    if (isSidePanelPC()) {
        openSidePanel('chat');
    }

    // Keyboard-aware height on mobile (visualViewport)
    if (window.visualViewport) {
        const applyVV = () => {
            const sp = document.getElementById('side-panel');
            if (!sp) return;
            if (isSidePanelPC()) {
                sp.style.height = '';
                sp.style.bottom = '';
                return;
            }
            if (!document.getElementById('action-panel').classList.contains('sp-open')) return;
            // Constrain sheet to the visible viewport portion
            const vvH = window.visualViewport.height;
            const winH = window.innerHeight;
            const overlap = Math.max(0, winH - (window.visualViewport.offsetTop + vvH));
            // Sheet anchored to bottom — lift it by the overlap (keyboard height)
            sp.style.bottom = overlap + 'px';
            // Clamp height so it fits above the keyboard
            sp.style.height = Math.min(vvH * 0.7, vvH - 40) + 'px';
        };
        window.visualViewport.addEventListener('resize', applyVV);
        window.visualViewport.addEventListener('scroll', applyVV);
    }

    // Handle resize: PC↔mobile transition
    window.addEventListener('resize', () => {
        if (isSidePanelPC()) {
            // Always show side panel on PC
            const sp = document.getElementById('side-panel');
            sp.classList.remove('hidden');
            sp.style.height = '';
            sp.style.bottom = '';
            document.getElementById('action-panel').classList.remove('sp-open');
            if (!activeSidePanel) openSidePanel('chat');
        } else {
            // On mobile, if no active panel, hide it
            if (!activeSidePanel) {
                document.getElementById('side-panel').classList.add('hidden');
                document.getElementById('action-panel').classList.remove('sp-open');
            }
        }
    });
}

// ==========================================
// SNS (mixi-style) Screen
// ==========================================
let snsTimeline = [];
let snsLastAutoShare = null;
let snsInitialized = false;

function initSNSScreen() {
    if (!snsInitialized) {
        setupSNSEvents();
        snsInitialized = true;
    }
    // Update user display in topbar
    updateMainTopbarUser();
    client.getRooms();
    client.getTimeline();
    updateSNSCTACounts();
    renderRailRooms(window.lastRoomList || []);
}

function updateMainTopbarUser() {
    const nameEl = document.getElementById('mx-top-name');
    const avEl = document.getElementById('mx-top-av');
    const name = client.name || 'ゲスト';
    if (nameEl) nameEl.textContent = name;
    if (avEl) {
        const avatarSrc = getAvatarSrc(selectedAvatar);
        if (avatarSrc) {
            avEl.innerHTML = `<img src="${avatarSrc}" alt="">`;
        } else {
            avEl.textContent = (name || '?').charAt(0).toUpperCase();
        }
    }
}

function updateSNSCTACounts() {
    const subEl = document.getElementById('mx-play-sub');
    const zoomCountEl = document.getElementById('mx-zoom-count');
    const rooms = window.lastRoomList || [];
    const onlineCount = (lastOnlineUsers || []).length;
    if (subEl) subEl.textContent = `${rooms.length}卓 / オンライン ${onlineCount}名`;
    if (zoomCountEl) {
        const zc = window.lastZoomCount || 0;
        zoomCountEl.textContent = zc > 0 ? ` ${zc}` : '';
    }
}

function renderRailRooms(rooms) {
    const rail = document.getElementById('mx-rail');
    if (!rail) return;
    rail.innerHTML = '';
    if (!rooms || rooms.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'mx-rail-empty';
        empty.textContent = '参加できる卓がありません。作成しましょう！';
        rail.appendChild(empty);
        // Add button
        const addBtn = document.createElement('div');
        addBtn.className = 'mx-rail-add';
        addBtn.textContent = '＋ 新規ルーム';
        addBtn.addEventListener('click', () => client.createRoom());
        rail.appendChild(addBtn);
        return;
    }
    for (const r of rooms) {
        const canJoin = r.playerCount < 6;
        const card = document.createElement('div');
        card.className = 'mx-rail-card' + (canJoin ? '' : ' is-full');
        let statusCls = 'waiting', statusText = '● 待機中';
        if (r.playing) { statusCls = 'playing'; statusText = '● プレイ中'; }
        const lockPrefix = r.locked ? '🔒 ' : '';
        const gameName = r.gameName || (r.mergedGames && r.mergedGames[0] != null && GAME_LIST && GAME_LIST[r.mergedGames[0]] ? GAME_LIST[r.mergedGames[0]].shortName : '') || '—';
        card.innerHTML = `
            <div class="mx-rail-id">${lockPrefix}${escapeHtml(r.id)}</div>
            <div class="mx-rail-name">${escapeHtml(r.hostName || '')}</div>
            <div class="mx-rail-info">
                <span>${escapeHtml(gameName)} ${r.playerCount}/6</span>
                <span class="mx-rail-status ${statusCls}">${statusText}</span>
            </div>
        `;
        if (canJoin) {
            card.addEventListener('click', () => client.joinRoom(r.id));
        }
        rail.appendChild(card);
    }
    // Add "+ create" button at the end
    const addBtn = document.createElement('div');
    addBtn.className = 'mx-rail-add';
    addBtn.textContent = '＋ 新規ルーム';
    addBtn.addEventListener('click', () => client.createRoom());
    rail.appendChild(addBtn);
}

function setupSNSEvents() {
    // sns-header-stats / sns-header-history / sns-header-logout are wired directly in
    // setupStatsModal / setupLobbyScreen / setupLoginScreen.

    // Feed tabs (最新 / 週間 / 全期間)
    setupFeedTabs();

    // Header hamburger menu (toggle + outside click close + close on item click)
    const hamburger = document.getElementById('btn-mx-hamburger');
    const headerMenu = document.getElementById('mx-header-menu');
    if (hamburger && headerMenu) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            headerMenu.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (headerMenu.classList.contains('hidden')) return;
            if (headerMenu.contains(e.target) || e.target === hamburger) return;
            headerMenu.classList.add('hidden');
        });
        headerMenu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => headerMenu.classList.add('hidden'));
        });
    }

    // Online users menu item → open chat modal with the online tab selected
    const onlineBtn = document.getElementById('sns-header-online');
    if (onlineBtn) onlineBtn.addEventListener('click', () => {
        openChatModal();
        switchChatTab('online');
    });

    // Play rail actions
    const btnCreate = document.getElementById('mx-btn-create');
    if (btnCreate) btnCreate.addEventListener('click', () => client.createRoom());
    const btnZoom = document.getElementById('mx-btn-zoom');
    if (btnZoom) btnZoom.addEventListener('click', () => client.joinZoom());
    const btnRefresh = document.getElementById('mx-btn-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => client.getRooms());
    const btnJoinId = document.getElementById('mx-btn-join-id');
    const joinIdInput = document.getElementById('mx-room-id-input');
    if (btnJoinId && joinIdInput) {
        btnJoinId.addEventListener('click', () => {
            const id = joinIdInput.value.trim().toUpperCase();
            if (!id) return;
            client.joinRoom(id);
            joinIdInput.value = '';
        });
        joinIdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnJoinId.click();
        });
    }

    // Room picker modal (legacy, still available via direct call)
    const btnRpClose = document.getElementById('btn-rp-close');
    if (btnRpClose) btnRpClose.addEventListener('click', closeRoomModal);
    const rpBd = document.querySelector('#room-picker-modal .rp-backdrop');
    if (rpBd) rpBd.addEventListener('click', closeRoomModal);
    const btnRpCreate = document.getElementById('btn-rp-create');
    if (btnRpCreate) btnRpCreate.addEventListener('click', () => { closeRoomModal(); client.createRoom(); });
    const btnRpZoom = document.getElementById('btn-rp-zoom');
    if (btnRpZoom) btnRpZoom.addEventListener('click', () => { closeRoomModal(); client.joinZoom(); });
    const btnRpRefresh = document.getElementById('btn-rp-refresh');
    if (btnRpRefresh) btnRpRefresh.addEventListener('click', () => client.getRooms());
    const btnRpJoinById = document.getElementById('btn-rp-join-by-id');
    if (btnRpJoinById) btnRpJoinById.addEventListener('click', () => {
        const id = document.getElementById('rp-room-id-input').value.trim().toUpperCase();
        if (!id) return;
        client.joinRoom(id);
        closeRoomModal();
    });
    const rpIdInput = document.getElementById('rp-room-id-input');
    if (rpIdInput) rpIdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-rp-join-by-id').click();
    });

    // Online users modal close button
    const btnCpClose = document.getElementById('btn-cp-close');
    if (btnCpClose) btnCpClose.addEventListener('click', closeOnlineUsersModal);
    const cpBd = document.querySelector('#chat-picker-modal .rp-backdrop');
    if (cpBd) cpBd.addEventListener('click', closeOnlineUsersModal);

    // Auto-share modal handlers
    const btnAsComment = document.getElementById('btn-auto-share-comment');
    if (btnAsComment) btnAsComment.addEventListener('click', () => {
        const txt = document.getElementById('auto-share-comment').value.trim();
        if (txt && snsLastAutoShare) {
            client.addComment(snsLastAutoShare.id, txt);
        }
        hideAutoShareModal();
    });
    const btnAsSkip = document.getElementById('btn-auto-share-skip');
    if (btnAsSkip) btnAsSkip.addEventListener('click', hideAutoShareModal);
    const btnAsView = document.getElementById('btn-auto-share-view');
    if (btnAsView) btnAsView.addEventListener('click', () => {
        hideAutoShareModal();
        showScreen('sns');
    });
}

// ---- Room picker modal ----
function openRoomModal() {
    client.getRooms();
    document.getElementById('room-picker-modal').classList.remove('hidden');
    renderRoomModalList();
}
function closeRoomModal() {
    document.getElementById('room-picker-modal').classList.add('hidden');
}
function renderRoomModalList() {
    const container = document.getElementById('rp-room-list');
    if (!container) return;
    const rooms = window.lastRoomList || [];
    if (rooms.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#888">参加可能なルームがありません</div>';
        return;
    }
    container.innerHTML = '';
    for (const r of rooms) {
        const canJoin = r.playerCount < 6;
        const row = document.createElement('div');
        row.className = 'rp-room-row' + (canJoin ? '' : ' rp-room-full');
        const statusText = !r.playing ? '待機中' : (canJoin ? '参加可' : '満員');
        const lock = r.locked ? '🔓 ' : '';
        const hostInitial = (r.hostName || '?').charAt(0).toUpperCase();
        const hostAvatarHtml = r.hostAvatar
            ? `<img src="avatars/${r.hostAvatar}.svg" alt="" class="rp-host-avatar">`
            : `<div class="rp-host-avatar">${hostInitial}</div>`;
        row.innerHTML = `
            ${hostAvatarHtml}
            <div class="rp-room-info">
                <div class="rp-room-title">${lock}${r.id} <span style="color:#888;font-size:11px">${escapeHtml(r.hostName || '')}</span></div>
                <div class="rp-room-meta">${r.playerCount}/6 人 ｜ ${statusText} ${r.gameName ? '｜ ' + escapeHtml(r.gameName) : ''}</div>
            </div>
            <button class="btn-mixi rp-room-join" ${canJoin ? '' : 'disabled'}>${canJoin ? '参加' : '満員'}</button>
        `;
        const btn = row.querySelector('.rp-room-join');
        if (canJoin) {
            btn.addEventListener('click', () => {
                client.joinRoom(r.id);
                closeRoomModal();
            });
        }
        container.appendChild(row);
    }
    // Update Zoom count in modal
    const zcEl = document.getElementById('rp-zoom-count');
    if (zcEl && typeof window.lastZoomCount === 'number') {
        zcEl.textContent = window.lastZoomCount > 0 ? ` (${window.lastZoomCount}人)` : '';
    }
}

// ---- Online users modal (previously a tabbed chat modal — chat removed) ----
function openOnlineUsersModal() {
    document.getElementById('chat-picker-modal').classList.remove('hidden');
    renderOnlineUsers(lastOnlineUsers || []);
}
function closeOnlineUsersModal() {
    document.getElementById('chat-picker-modal').classList.add('hidden');
}
// Backward-compat aliases (still used by hamburger menu wiring).
function openChatModal()   { openOnlineUsersModal(); }
function closeChatModal()  { closeOnlineUsersModal(); }
function switchChatTab()   { /* no-op — only one view now */ }

function renderSNSSelf() {
    // Old 3-column mixi layout is gone. Simply refresh topbar user info.
    updateMainTopbarUser();
}

let activeFeedTab = 'latest'; // 'latest' | 'weekly' | 'all'
let rankingsCache = { weekly: null, all: null };

function renderTimeline(posts) {
    const container = document.getElementById('sns-timeline');
    if (!container) return;
    container.innerHTML = '';
    // Show hand posts (notable hands / manual) and session summary posts.
    const visible = (posts || []).filter(p =>
        (p.type === 'hand' && p.handData) ||
        (p.type === 'session' && p.sessionData)
    );
    if (visible.length === 0) {
        container.innerHTML = '<div class="mx-empty">まだ投稿がありません。<br>ゲームに参加すると注目ハンドが自動投稿されます。<br>ハンド履歴から「📢 投稿」で手動投稿もできます。</div>';
        return;
    }
    for (const post of visible) {
        container.appendChild(renderPostEntry(post));
    }
}

function renderRankings(period, posts) {
    const container = document.getElementById('sns-timeline');
    if (!container) return;
    container.innerHTML = '';
    const handPosts = (posts || []).filter(p =>
        (p.type === 'hand' && p.handData) ||
        (p.type === 'session' && p.sessionData)
    );
    if (handPosts.length === 0) {
        const label = period === 'weekly' ? '今週' : '全期間';
        container.innerHTML = `<div class="mx-empty">${label}のランキングがまだありません。<br>ハンドにいいね❤️を押してランキングを作りましょう！</div>`;
        return;
    }
    // Header
    const head = document.createElement('div');
    head.className = 'mx-rank-head';
    head.textContent = period === 'weekly' ? '🏆 週間ランキング TOP 20' : '👑 全期間ランキング TOP 20';
    container.appendChild(head);
    // Rank entries
    handPosts.forEach((post, i) => {
        const entry = renderPostEntry(post);
        entry.classList.add('mx-post-ranked');
        // Insert rank badge at the head
        const rank = i + 1;
        const badge = document.createElement('div');
        badge.className = 'mx-rank-badge rank-' + (rank <= 3 ? String(rank) : 'other');
        if (rank === 1) badge.textContent = '🥇 1位';
        else if (rank === 2) badge.textContent = '🥈 2位';
        else if (rank === 3) badge.textContent = '🥉 3位';
        else badge.textContent = `${rank}位`;
        entry.insertBefore(badge, entry.firstChild);
        container.appendChild(entry);
    });
}

function switchFeedTab(tab) {
    activeFeedTab = tab;
    document.querySelectorAll('#mx-feed-tabs .mx-feed-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.feedTab === tab);
    });
    if (tab === 'latest') {
        renderTimeline(snsTimeline);
    } else {
        // Always re-fetch to get fresh rankings
        client.getRankings(tab);
        const cached = rankingsCache[tab];
        if (cached) renderRankings(tab, cached);
        else {
            const container = document.getElementById('sns-timeline');
            if (container) container.innerHTML = '<div class="mx-empty">読み込み中...</div>';
        }
    }
}

function setupFeedTabs() {
    document.querySelectorAll('#mx-feed-tabs .mx-feed-tab').forEach(el => {
        el.addEventListener('click', () => switchFeedTab(el.dataset.feedTab));
    });
}

function renderPostEntry(post) {
    // Session summary posts have their own compact card layout.
    if (post.type === 'session' && post.sessionData) {
        return renderSessionPostEntry(post);
    }

    const wrap = document.createElement('div');
    wrap.className = 'mx-post';
    wrap.dataset.postId = post.id;

    const initial = (post.authorName || '?').charAt(0).toUpperCase();
    const avatarHtml = post.authorAvatar
        ? `<img src="avatars/${post.authorAvatar}.svg" alt="">`
        : escapeHtml(initial);

    const h = post.handData || {};
    const cardsHtml = (h.winnerCards || []).map(c => renderMiniCard(c)).join('');
    const ccHtml = (h.communityCards || []).map(c => renderMiniCard(c)).join('');
    const pot = h.pot || 0;
    const bb = h.bigBlind || 100;
    const bbNum = Math.round(pot / bb);
    const handRank = h.handRank || '';
    const isManual = !!post.manualShared || post.autoShared === false;
    const isLoss = h.result === 'loss' || pot < 0;
    const badge = isLoss
        ? { cls: 'loss', label: '😔 敗北' }
        : pickBadge(handRank, Math.abs(bbNum));

    const sourceLabel = isManual ? '📝 手動投稿' : '⚡ 自動共有';
    const sign = pot >= 0 ? '+' : '';
    const amountCls = pot >= 0 ? '' : 'mx-win-amount-neg';
    const labelText = handRank
        ? `${handRank} · ${Math.abs(bbNum)}BB ${isLoss ? '喪失' : '獲得'}`
        : `${Math.abs(bbNum)}BB ${isLoss ? '喪失' : '獲得'}`;

    const captionHtml = post.body
        ? `<div class="mx-post-caption">${linkifyBody(post.body)}</div>`
        : '';

    const commentCount = (post.comments || []).length;
    const commentsHtml = `
        <div class="mx-comments" data-post-id="${post.id}">
            ${renderCommentsTree(post.comments || [])}
            <div class="mx-comment-input mx-comment-top-input" data-parent="">
                <input type="text" placeholder="コメントする…" maxlength="500">
                <button>送信</button>
            </div>
        </div>
    `;

    const replayCtaHtml = post.replayHash
        ? `<button class="mx-replay-cta" type="button">
               <span class="mx-replay-cta-icon">▶</span>
               <span class="mx-replay-cta-label">リプレイを見る</span>
               <span class="mx-replay-cta-hint">ハンドをもう一度</span>
           </button>`
        : '';

    const likeCount = post.likeCount != null ? post.likeCount : ((post.likes || []).length);
    const likedByMe = Array.isArray(post.likes) && client.name && post.likes.includes(client.name);

    wrap.innerHTML = `
        <div class="mx-post-head">
            <div class="mx-post-avatar">${avatarHtml}</div>
            <div class="mx-post-meta">
                <div class="mx-post-name">${escapeHtml(post.authorName)}</div>
                <div class="mx-post-date">${timeAgo(post.createdAt)}${h.gameName ? ' / ' + escapeHtml(h.gameName) : ''} · <span class="mx-post-source">${sourceLabel}</span></div>
            </div>
            <div class="mx-post-badge ${badge.cls}">${badge.label}</div>
        </div>
        ${captionHtml}
        <div class="mx-hand-body ${isLoss ? 'mx-hand-body-loss' : ''}">
            <div class="mx-hand-top">
                <div class="mx-win-amount ${amountCls}">${sign}${pot.toLocaleString()}<span class="u">chips</span></div>
                <span class="mx-game-tag">${escapeHtml(h.gameName || 'Poker')}</span>
            </div>
            ${cardsHtml ? `<div class="mx-cards">${cardsHtml}</div>` : ''}
            <div class="mx-hand-label">${escapeHtml(labelText)}</div>
            ${ccHtml ? `<div class="mx-cc-row">コミュニティ: <span class="mx-cards" style="display:inline-flex">${ccHtml}</span></div>` : ''}
        </div>
        ${replayCtaHtml}
        <div class="mx-post-actions">
            <button type="button" class="act-like ${likedByMe ? 'liked' : ''}">
                <span class="like-heart">${likedByMe ? '❤️' : '🤍'}</span>
                <span class="like-count">${likeCount}</span>
            </button>
            <span class="act-comments">💬 ${commentCount}</span>
            ${post.replayHash ? `<span class="act-share">🔗 共有</span>` : ''}
        </div>
        ${commentsHtml}
    `;

    // Like button for post
    const likeBtn = wrap.querySelector('.act-like');
    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            if (!client.name) { showToast('名前を設定するといいねできます'); return; }
            client.likePost(post.id);
            // Optimistic UI: toggle
            const now = !likeBtn.classList.contains('liked');
            likeBtn.classList.toggle('liked', now);
            const heart = likeBtn.querySelector('.like-heart');
            if (heart) heart.textContent = now ? '❤️' : '🤍';
            const cntEl = likeBtn.querySelector('.like-count');
            if (cntEl) {
                const cur = parseInt(cntEl.textContent, 10) || 0;
                cntEl.textContent = String(Math.max(0, cur + (now ? 1 : -1)));
            }
            if (now) likeBtn.classList.add('pop');
            setTimeout(() => likeBtn.classList.remove('pop'), 320);
        });
    }

    // Top-level comment send
    const topInput = wrap.querySelector('.mx-comment-top-input input');
    const topSend = wrap.querySelector('.mx-comment-top-input button');
    const bindCommentSend = (inputEl, sendEl, parentId) => {
        sendEl.addEventListener('click', () => {
            const body = inputEl.value.trim();
            if (!body) return;
            client.addComment(post.id, body, parentId);
            inputEl.value = '';
            // If this was a reply composer, hide it after send
            if (parentId != null) {
                const wrapEl = inputEl.closest('.mx-reply-compose');
                if (wrapEl) wrapEl.classList.add('hidden');
            }
        });
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendEl.click();
        });
    };
    if (topInput && topSend) bindCommentSend(topInput, topSend, null);

    // Comment interactions (like, reply)
    wrap.querySelectorAll('.mx-comment').forEach(cEl => {
        const commentId = Number(cEl.dataset.commentId);
        const comment = (post.comments || []).find(c => c.id === commentId);
        if (!comment) return;
        const cLike = cEl.querySelector('.c-like');
        if (cLike) {
            cLike.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!client.name) { showToast('名前を設定するといいねできます'); return; }
                client.likeComment(post.id, comment.id);
                const now = !cLike.classList.contains('liked');
                cLike.classList.toggle('liked', now);
                const heart = cLike.querySelector('.like-heart');
                if (heart) heart.textContent = now ? '❤️' : '🤍';
                const cntEl = cLike.querySelector('.like-count');
                if (cntEl) {
                    const cur = parseInt(cntEl.textContent, 10) || 0;
                    cntEl.textContent = String(Math.max(0, cur + (now ? 1 : -1)));
                }
            });
        }
        const cReply = cEl.querySelector('.c-reply');
        if (cReply) {
            cReply.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle reply composer for this comment
                let composer = cEl.querySelector(':scope > .mx-reply-compose');
                if (!composer) {
                    composer = document.createElement('div');
                    composer.className = 'mx-reply-compose mx-comment-input';
                    composer.innerHTML = `<input type="text" placeholder="@${escapeHtml(comment.authorName)} に返信…" maxlength="500"><button>送信</button>`;
                    cEl.appendChild(composer);
                    const inp = composer.querySelector('input');
                    const snd = composer.querySelector('button');
                    inp.value = `@${comment.authorName} `;
                    const parentId = comment.parentCommentId != null ? comment.parentCommentId : comment.id;
                    bindCommentSend(inp, snd, parentId);
                    setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 30);
                } else {
                    composer.classList.toggle('hidden');
                    if (!composer.classList.contains('hidden')) {
                        const inp = composer.querySelector('input');
                        if (inp) setTimeout(() => inp.focus(), 30);
                    }
                }
            });
        }
    });

    // Replay button: open replay.html in a new tab with the post's compressed hash.
    const replayBtn = wrap.querySelector('.mx-replay-cta');
    if (replayBtn && post.replayHash) {
        replayBtn.addEventListener('click', () => {
            const url = buildReplayUrlFromHash(post.replayHash);
            if (url) window.open(url, '_blank', 'noopener');
        });
    }
    // Share button: copy the replay URL to clipboard
    const shareBtn = wrap.querySelector('.act-share');
    if (shareBtn && post.replayHash) {
        shareBtn.addEventListener('click', async () => {
            const url = buildReplayUrlFromHash(post.replayHash);
            if (!url) return;
            try {
                await navigator.clipboard.writeText(url);
                showToast('リプレイURLをコピーしました');
            } catch (e) {
                // Fallback: open a prompt
                window.prompt('リプレイURL（Ctrl+C でコピー）', url);
            }
        });
    }

    return wrap;
}

// Render comments as a 1-level nested tree (replies grouped under their parent)
function renderCommentsTree(comments) {
    if (!comments || comments.length === 0) return '';
    const topLevel = comments.filter(c => c.parentCommentId == null);
    const repliesByParent = new Map();
    for (const c of comments) {
        if (c.parentCommentId != null) {
            if (!repliesByParent.has(c.parentCommentId)) repliesByParent.set(c.parentCommentId, []);
            repliesByParent.get(c.parentCommentId).push(c);
        }
    }
    // Keep chronological order within each group
    const byId = new Map(comments.map(c => [c.id, c]));
    return topLevel.map(c => {
        const replies = repliesByParent.get(c.id) || [];
        return renderCommentHtml(c) + (replies.length > 0
            ? `<div class="mx-replies">${replies.map(r => renderCommentHtml(r, true)).join('')}</div>`
            : '');
    }).join('');
}

function buildReplayUrlFromHash(hash) {
    if (!hash) return '';
    const base = window.location.href.replace(/\/[^/]*$/, '/');
    return base + 'replay.html#' + hash;
}

// Render a session-summary post (type: 'session').
// Shows hand count, duration, and all participants' chip P/L, ranked.
function renderSessionPostEntry(post) {
    const wrap = document.createElement('div');
    wrap.className = 'mx-post mx-session-post';
    wrap.dataset.postId = post.id;

    const sd = post.sessionData || {};
    const players = Array.isArray(sd.players) ? sd.players : [];
    const handsPlayed = sd.handsPlayed || 0;
    const durationMin = Math.max(1, Math.round((sd.durationMs || 0) / 60000));

    // Commenting/like wiring reuses the same helpers as hand posts.
    const commentCount = (post.comments || []).length;
    const likeCount = post.likeCount != null ? post.likeCount : ((post.likes || []).length);
    const likedByMe = Array.isArray(post.likes) && client.name && post.likes.includes(client.name);

    const playerRowsHtml = players.map((p, i) => {
        const sign = p.diff >= 0 ? '+' : '';
        const diffCls = p.diff > 0 ? 'diff-win' : p.diff < 0 ? 'diff-loss' : 'diff-even';
        const rankLabelStr = (i === 0 && p.diff > 0) ? '🏆'
                          : (i === players.length - 1 && p.diff < 0) ? '😔'
                          : `${i + 1}`;
        const avatarHtml = p.avatar
            ? `<img src="avatars/${p.avatar}.svg" alt="">`
            : escapeHtml((p.name || '?').charAt(0).toUpperCase());
        const tag = p.leftEarly ? '<span class="sess-tag">途中退室</span>' : '';
        // Show breakdown of investment (initial 10k + rebuys → final) so players
        // can see that rebuys are subtracted from the displayed P/L.
        const rebuy = Number(p.rebuyAmount || 0);
        const invested = Number(p.invested != null ? p.invested : 10000);
        const end = Number(p.endChips != null ? p.endChips : 0);
        const breakdownHtml = (rebuy > 0)
            ? `<div class="sess-breakdown">投入 ${invested.toLocaleString()}（補充 +${rebuy.toLocaleString()}）→ 最終 ${end.toLocaleString()}</div>`
            : `<div class="sess-breakdown">投入 ${invested.toLocaleString()} → 最終 ${end.toLocaleString()}</div>`;
        return `
            <div class="sess-row ${diffCls}">
                <div class="sess-row-top">
                    <span class="sess-rank">${rankLabelStr}</span>
                    <span class="sess-avatar">${avatarHtml}</span>
                    <span class="sess-name">${escapeHtml(p.name)}${tag}</span>
                    <span class="sess-diff" title="ゲーム純損益（補充額を差し引き）">${sign}${Number(p.diff || 0).toLocaleString()}</span>
                </div>
                ${breakdownHtml}
            </div>
        `;
    }).join('');

    const commentsHtml = `
        <div class="mx-comments" data-post-id="${post.id}">
            ${renderCommentsTree(post.comments || [])}
            <div class="mx-comment-input mx-comment-top-input" data-parent="">
                <input type="text" placeholder="コメントする…" maxlength="500">
                <button>送信</button>
            </div>
        </div>
    `;

    wrap.innerHTML = `
        <div class="mx-post-head">
            <div class="mx-post-avatar sess-avatar-big">🎲</div>
            <div class="mx-post-meta">
                <div class="mx-post-name">テーブル ${escapeHtml(sd.tableId || '')} 終了</div>
                <div class="mx-post-date">${timeAgo(post.createdAt)} · ${escapeHtml(sd.gameName || '')}</div>
            </div>
            <div class="mx-post-badge pot">📊 セッション</div>
        </div>
        <div class="mx-session-body">
            <div class="sess-meta">
                <span><b>${handsPlayed}</b> ハンド</span>
                <span>·</span>
                <span><b>${durationMin}</b> 分</span>
                <span>·</span>
                <span><b>${players.length}</b> 人参加</span>
            </div>
            <div class="sess-rows">${playerRowsHtml}</div>
            <div class="sess-footnote">※ 損益は「最終チップ − 投入総額（初期+補充）」の純損益です</div>
        </div>
        <div class="mx-post-actions">
            <button type="button" class="act-like ${likedByMe ? 'liked' : ''}">
                <span class="like-heart">${likedByMe ? '❤️' : '🤍'}</span>
                <span class="like-count">${likeCount}</span>
            </button>
            <span class="act-comments">💬 ${commentCount}</span>
        </div>
        ${commentsHtml}
    `;

    // Like button
    const likeBtn = wrap.querySelector('.act-like');
    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            if (!client.name) { showToast('名前を設定するといいねできます'); return; }
            client.likePost(post.id);
            const now = !likeBtn.classList.contains('liked');
            likeBtn.classList.toggle('liked', now);
            const heart = likeBtn.querySelector('.like-heart');
            if (heart) heart.textContent = now ? '❤️' : '🤍';
            const cntEl = likeBtn.querySelector('.like-count');
            if (cntEl) {
                const cur = parseInt(cntEl.textContent, 10) || 0;
                cntEl.textContent = String(Math.max(0, cur + (now ? 1 : -1)));
            }
            if (now) likeBtn.classList.add('pop');
            setTimeout(() => likeBtn.classList.remove('pop'), 320);
        });
    }

    // Top-level comment send (reuses same pattern as hand post)
    const topInput = wrap.querySelector('.mx-comment-top-input input');
    const topSend = wrap.querySelector('.mx-comment-top-input button');
    if (topInput && topSend) {
        topSend.addEventListener('click', () => {
            const body = topInput.value.trim();
            if (!body) return;
            client.addComment(post.id, body, null);
            topInput.value = '';
        });
        topInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') topSend.click();
        });
    }

    // Wire comment interactions for existing comments
    wrap.querySelectorAll('.mx-comment').forEach(cEl => {
        const commentId = Number(cEl.dataset.commentId);
        const comment = (post.comments || []).find(c => c.id === commentId);
        if (comment) wireCommentInteractions(cEl, post, comment);
    });

    return wrap;
}

function pickBadge(handRank, bbNum) {
    const r = (handRank || '').toLowerCase();
    if (r.includes('royal')) return { cls: '', label: '🏆 ロイヤル' };
    if (r.includes('straight flush') || r.includes('straight-flush') || r.includes('ストレートフラッシュ')) return { cls: '', label: '🏆 ストフラ' };
    if (r.includes('four') || r.includes('quads') || r.includes('クワッズ') || r.includes('フォーカード')) return { cls: 'quads', label: '♣ クワッズ' };
    if (r.includes('full house') || r.includes('フルハウス')) return { cls: 'quads', label: '♥ フルハウス' };
    if (bbNum >= 50) return { cls: 'pot', label: '💰 ビッグポット' };
    return { cls: 'pot', label: '🎉 大勝' };
}

function renderMiniCard(c) {
    // Accept both {rank,suit} and {r,s} forms via normalizeCard (utils.js)
    const n = normalizeCard(c);
    if (!n) return '';
    const isRed = n.suit === 'h' || n.suit === 'd';
    return `<span class="mx-card ${isRed ? 'red' : 'black'}">${escapeHtml(rankLabel(n.rank))}${suitSymbol(n.suit)}</span>`;
}

function renderCommentHtml(c, isReply) {
    const initial = (c.authorName || '?').charAt(0).toUpperCase();
    const avatarHtml = c.authorAvatar
        ? `<img src="avatars/${c.authorAvatar}.svg" alt="">`
        : escapeHtml(initial);
    const likeCount = c.likeCount != null ? c.likeCount : ((c.likes || []).length);
    const likedByMe = Array.isArray(c.likes) && client.name && c.likes.includes(client.name);
    return `
        <div class="mx-comment ${isReply ? 'mx-comment-reply' : ''}" data-comment-id="${c.id}">
            <div class="mx-c-avatar">${avatarHtml}</div>
            <div class="mx-c-body">
                <div class="mx-c-text"><b>${escapeHtml(c.authorName)}</b>${linkifyMentions(c.body)}<span class="mx-c-time">${timeAgo(c.createdAt)}</span></div>
                <div class="mx-c-actions">
                    <button type="button" class="c-like ${likedByMe ? 'liked' : ''}">
                        <span class="like-heart">${likedByMe ? '❤️' : '🤍'}</span>
                        <span class="like-count">${likeCount}</span>
                    </button>
                    <button type="button" class="c-reply">↪️ 返信</button>
                </div>
            </div>
        </div>
    `;
}

// linkifyMentions / escapeHtml / linkifyBody / formatDateJP / timeAgo
// are provided by js/utils.js (loaded before this script).

function showAutoShareModal(post) {
    snsLastAutoShare = post;
    const body = document.getElementById('auto-share-body');
    const h = post.handData || {};
    body.innerHTML = `
        <div style="margin-bottom:8px"><b>${escapeHtml(post.title || '')}</b></div>
        ${h.handRank ? `<div>ハンド: ${escapeHtml(h.handRank)}</div>` : ''}
        <div>ポット: ${(h.pot || 0).toLocaleString()} チップ</div>
        <div style="margin-top:8px;color:#888;font-size:11px">この勝利を仲間に知らせました。コメントを残しますか？</div>
    `;
    document.getElementById('auto-share-comment').value = '';
    document.getElementById('auto-share-modal').classList.remove('hidden');
}

function hideAutoShareModal() {
    document.getElementById('auto-share-modal').classList.add('hidden');
    snsLastAutoShare = null;
}

// ---- Wire up SNS events to the websocket client ----
client.on('timeline', (posts) => {
    snsTimeline = posts || [];
    if (document.getElementById('sns-screen') && !document.getElementById('sns-screen').classList.contains('hidden')) {
        if (activeFeedTab === 'latest') renderTimeline(snsTimeline);
        renderSNSSelf();
    }
});
client.on('timeline_post', (post) => {
    if (!post) return;
    // Prepend if not already present
    if (!snsTimeline.find(p => p.id === post.id)) {
        snsTimeline.unshift(post);
        if (snsTimeline.length > 100) snsTimeline.length = 100;
    }
    if (document.getElementById('sns-screen') && !document.getElementById('sns-screen').classList.contains('hidden')) {
        if (activeFeedTab === 'latest') renderTimeline(snsTimeline);
        // Ranking tabs can stay stable; user can refresh by re-tapping tab
    }
});
client.on('timeline_comment', ({ postId, comment }) => {
    const post = snsTimeline.find(p => p.id === postId);
    if (post) {
        post.comments = post.comments || [];
        if (post.comments.find(c => c.id === comment.id)) return; // already have it
        post.comments.push(comment);
    }
    // Partial update: insert the new comment into the existing thread, preserving
    // reply composers, input focus, scroll position and other ephemeral state.
    const wrap = document.querySelector(`.mx-post[data-post-id="${postId}"]`);
    if (!wrap || !post) return;
    const commentsRoot = wrap.querySelector('.mx-comments');
    if (!commentsRoot) return;

    // Build the comment HTML as a standalone element, then insert in the right spot.
    const isReply = comment.parentCommentId != null;
    const tmp = document.createElement('div');
    tmp.innerHTML = renderCommentHtml(comment, isReply);
    const newNode = tmp.firstElementChild;
    if (!newNode) return;

    if (isReply) {
        // Find the parent comment element. The thread root is the comment whose
        // id equals comment.parentCommentId (server flattens to 1 level).
        const parentEl = commentsRoot.querySelector(`.mx-comment[data-comment-id="${comment.parentCommentId}"]`);
        if (parentEl) {
            // parent node structure: <comment/> followed by sibling <.mx-replies> (if any)
            let repliesGroup = parentEl.nextElementSibling;
            if (!repliesGroup || !repliesGroup.classList.contains('mx-replies')) {
                repliesGroup = document.createElement('div');
                repliesGroup.className = 'mx-replies';
                parentEl.after(repliesGroup);
            }
            repliesGroup.appendChild(newNode);
        } else {
            // Parent not rendered for some reason → append to root just before input
            const topInput = commentsRoot.querySelector('.mx-comment-top-input');
            if (topInput) topInput.before(newNode);
            else commentsRoot.appendChild(newNode);
        }
    } else {
        // Top-level comment → insert before the top-level composer
        const topInput = commentsRoot.querySelector('.mx-comment-top-input');
        if (topInput) topInput.before(newNode);
        else commentsRoot.appendChild(newNode);
    }

    // Wire the new comment's like / reply buttons without touching others.
    wireCommentInteractions(newNode, post, comment);

    // Update comment counter on the post
    const counter = wrap.querySelector('.act-comments');
    if (counter) counter.textContent = `💬 ${post.comments.length}`;
});

// Helper: wire like/reply handlers for a single newly-inserted comment element.
function wireCommentInteractions(cEl, post, comment) {
    const cLike = cEl.querySelector('.c-like');
    if (cLike) {
        cLike.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!client.name) { showToast('名前を設定するといいねできます'); return; }
            client.likeComment(post.id, comment.id);
            const now = !cLike.classList.contains('liked');
            cLike.classList.toggle('liked', now);
            const heart = cLike.querySelector('.like-heart');
            if (heart) heart.textContent = now ? '❤️' : '🤍';
            const cntEl = cLike.querySelector('.like-count');
            if (cntEl) {
                const cur = parseInt(cntEl.textContent, 10) || 0;
                cntEl.textContent = String(Math.max(0, cur + (now ? 1 : -1)));
            }
        });
    }
    const cReply = cEl.querySelector('.c-reply');
    if (cReply) {
        cReply.addEventListener('click', (e) => {
            e.stopPropagation();
            let composer = cEl.querySelector(':scope > .mx-reply-compose');
            if (!composer) {
                composer = document.createElement('div');
                composer.className = 'mx-reply-compose mx-comment-input';
                composer.innerHTML = `<input type="text" placeholder="@${escapeHtml(comment.authorName)} に返信…" maxlength="500"><button>送信</button>`;
                cEl.appendChild(composer);
                const inp = composer.querySelector('input');
                const snd = composer.querySelector('button');
                inp.value = `@${comment.authorName} `;
                const parentId = comment.parentCommentId != null ? comment.parentCommentId : comment.id;
                snd.addEventListener('click', () => {
                    const body = inp.value.trim();
                    if (!body) return;
                    client.addComment(post.id, body, parentId);
                    inp.value = '';
                    composer.classList.add('hidden');
                });
                inp.addEventListener('keydown', (e2) => {
                    if (e2.key === 'Enter') snd.click();
                });
                setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 30);
            } else {
                composer.classList.toggle('hidden');
                if (!composer.classList.contains('hidden')) {
                    const inp = composer.querySelector('input');
                    if (inp) setTimeout(() => inp.focus(), 30);
                }
            }
        });
    }
}

client.on('post_liked', ({ postId, userName, likeCount, liked }) => {
    const post = snsTimeline.find(p => p.id === postId);
    if (post) {
        post.likes = post.likes || [];
        const idx = post.likes.indexOf(userName);
        if (liked && idx < 0) post.likes.push(userName);
        if (!liked && idx >= 0) post.likes.splice(idx, 1);
        post.likeCount = typeof likeCount === 'number' ? likeCount : post.likes.length;
    }
    // Update all rendered instances of this post (latest or ranking)
    document.querySelectorAll(`.mx-post[data-post-id="${postId}"]`).forEach(wrap => {
        const likeBtn = wrap.querySelector('.act-like');
        if (!likeBtn) return;
        const cntEl = likeBtn.querySelector('.like-count');
        if (cntEl) cntEl.textContent = String(likeCount);
        // If the actor is me, sync the button state (in case of multi-tab)
        if (userName === client.name) {
            likeBtn.classList.toggle('liked', !!liked);
            const heart = likeBtn.querySelector('.like-heart');
            if (heart) heart.textContent = liked ? '❤️' : '🤍';
        }
    });
});

client.on('comment_liked', ({ postId, commentId, userName, likeCount, liked }) => {
    const post = snsTimeline.find(p => p.id === postId);
    if (post) {
        const c = (post.comments || []).find(x => x.id === commentId);
        if (c) {
            c.likes = c.likes || [];
            const idx = c.likes.indexOf(userName);
            if (liked && idx < 0) c.likes.push(userName);
            if (!liked && idx >= 0) c.likes.splice(idx, 1);
            c.likeCount = typeof likeCount === 'number' ? likeCount : c.likes.length;
        }
    }
    document.querySelectorAll(`.mx-post[data-post-id="${postId}"] .mx-comment[data-comment-id="${commentId}"]`).forEach(cEl => {
        const cLike = cEl.querySelector('.c-like');
        if (!cLike) return;
        const cntEl = cLike.querySelector('.like-count');
        if (cntEl) cntEl.textContent = String(likeCount);
        if (userName === client.name) {
            cLike.classList.toggle('liked', !!liked);
            const heart = cLike.querySelector('.like-heart');
            if (heart) heart.textContent = liked ? '❤️' : '🤍';
        }
    });
});

client.on('rankings', ({ period, posts }) => {
    rankingsCache[period] = posts || [];
    if (activeFeedTab === period) {
        renderRankings(period, posts || []);
    }
});
client.on('post_created', (post) => {
    if (!post) return;
    if (!snsTimeline.find(p => p.id === post.id)) snsTimeline.unshift(post);
    if (!document.getElementById('sns-screen').classList.contains('hidden')) {
        renderTimeline(snsTimeline);
    } else {
        showToast('タイムラインに投稿しました');
    }
});
client.on('auto_shared', (post) => {
    if (!post) return;
    if (!snsTimeline.find(p => p.id === post.id)) snsTimeline.unshift(post);
    showAutoShareModal(post);
});
// footprints / new_footprint: UI removed — handler no longer needed
// profile_data: UI removed — no handler needed

// Init
setupActionRipple();
setupSidePanel();
