// js/app.js - Multiplayer Application Controller
//
// ==========================================================================
//  目次 (TABLE OF CONTENTS)
// --------------------------------------------------------------------------
//  各セクションは「// ===」見出しで区切られています。下記の英語見出し名
//  (例: "Game Screen", "Player Cloud") でファイル内を検索 (Ctrl/Cmd+F)
//  すると、その節へジャンプできます。
//  ※ 行番号は編集でずれるため、あえて記載していません (見出し名で検索)。
//
//   1. Avatar System ................ アバター選択
//   2. Sound System (Web Audio API) . 効果音 (yourTurn / yourDraw / gameChange)
//   3. Multi-Table Management ....... 複数卓 (tables Map / タブ / 切替)
//   4. Add Table Modal .............. 卓追加モーダル
//   5. Player Notes (localStorage) .. プレイヤーメモ
//   6. Bet Preset Settings .......... ベットプリセット設定
//   7. Screen Management ............ 画面切替 (showScreen)
//   8. Login Screen ................. ゲスト/アカウントのログイン画面
//   9. Account Login / Register ..... アカウント認証・welcome-back・成績/退室
//  10. Global (ex-Lobby) setup ...... ヘッダ/メニュー配線
//  11. Room Screen ................. 待機ルーム (renderRoom / 承認制トグル)
//  12. Join Pending Overlay ........ 参加リクエスト待機
//  13. Join Request Notification ... ホスト側の参加承認通知
//  14. Game Screen ................. ゲーム卓本体・アクション・通知
//  15. Replay ...................... ハンドリプレイ共有 (URLトークン化)
//  16. Pre-action system ........... 先行アクション (チェック/フォールド等)
//  17. 成績 (Results) Modal ........ 全体/日付別/月別/テーブル別
//  18. Stats Graph ................. スタッツ・グラフ
//  19. Chat ........................ 卓内チャット・クイックチャット
//  20. Online User List ............ オンラインユーザー一覧モーダル
//  21. Showdown Reaction Bar ....... ショーダウンのリアクション
//  22. Lobby Big Hand Feed ......... 大物ハンドの通知フィード
//  23. Chip Animation System ....... チップ移動アニメ
//  24. Game Change Overlay + Banner  ゲーム切替演出
//  25. Ripple effect + vibration ... アクションボタンの触覚/波紋
//  26. Side Panel (chat / log) ..... 横/下のチャット・ログパネル
//  27. SNS (mixi-style) Screen ..... メイン画面 (ロビー)
//  28. Lobby Chat .................. ロビーチャット
//  29. Table preview popover ....... 卓プレビュー
//  30. セッション収支モーダル ...... 退室時の自分の収支表示
//  31. Player Cloud ................ プレイヤークラウド描画
// ==========================================================================

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
const AUTH_SESSION_KEY = 'poker10mix_auth_session'; // { token, name, email }
const LAST_ACCOUNT_KEY  = 'poker10mix_last_account'; // { name, email, avatar } — survives logout
let resumingSession = false;
let resumeTimeoutHandle = null;

function loadAuthSession() {
    try {
        const raw = localStorage.getItem(AUTH_SESSION_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (obj && typeof obj.token === 'string' && obj.token.length > 0) return obj;
    } catch (e) {}
    return null;
}
function saveAuthSession(session) {
    try { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session)); } catch (e) {}
}
function clearAuthSession() {
    try { localStorage.removeItem(AUTH_SESSION_KEY); } catch (e) {}
}
function loadLastAccount() {
    try {
        const raw = localStorage.getItem(LAST_ACCOUNT_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (obj && obj.email) return obj;
    } catch (e) {}
    return null;
}
function saveLastAccount(info) {
    try { localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(info)); } catch (e) {}
}
function clearLastAccount() {
    try { localStorage.removeItem(LAST_ACCOUNT_KEY); } catch (e) {}
}
let lastOnlineUsers = []; // cached for re-render
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

let _tabsSig = '';
function renderTableTabs() {
    const tabsEl = document.getElementById('table-tabs');
    const listEl = document.getElementById('table-tabs-list');
    // Always show the unified top bar while on game screen (hamburger must be accessible)
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen.classList.contains('hidden')) {
        tabsEl.classList.add('hidden');
        _tabsSig = ''; // 次に表示する際は必ず再構築させる
        return;
    }
    tabsEl.classList.remove('hidden');
    if (!listEl) return;
    // タブ表示に関係する状態の署名。game_state は毎秒複数回届くが、タブ自体
    // (卓・アクティブ・自分の番バッジ・ゲーム名) が変わらない限り再構築は不要。
    // 変化が無ければ DOM 再生成とリスナ再登録をスキップする。
    let sig = String(tables.size) + '|';
    for (const [rid, ctx] of tables) {
        sig += rid + ':' + (ctx.gameName || ctx.roomId) + ':' +
            (rid === activeTableId ? 1 : 0) + ':' +
            (ctx.isMyTurn && rid !== activeTableId ? 1 : 0) + ';';
    }
    if (sig === _tabsSig) return;
    _tabsSig = sig;
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

// Hand history is scoped per identity so two people sharing the same browser
// (or switching between a guest name and an account) don't see each other's
// hands. Key format:
//   - Logged-in account: `poker10mix_hand_history_acc:<email>`
//   - Guest:             `poker10mix_hand_history_guest:<name>`
//   - Unknown:           `poker10mix_hand_history` (legacy / pre-name)
function getHandHistoryKey() {
    if (typeof loggedInAccount !== 'undefined' && loggedInAccount && loggedInAccount.email) {
        return 'poker10mix_hand_history_acc:' + loggedInAccount.email.toLowerCase();
    }
    const n = (typeof client !== 'undefined' && client && client.name) ? client.name : '';
    if (n) return 'poker10mix_hand_history_guest:' + n;
    return 'poker10mix_hand_history';
}
function loadHandHistory() {
    try {
        const raw = localStorage.getItem(getHandHistoryKey());
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}
function persistHandHistory() {
    try { localStorage.setItem(getHandHistoryKey(), JSON.stringify(handHistory)); } catch (e) {}
}
// Call after login / guest-entry / logout so the in-memory handHistory reflects
// the new identity's own hands. Safe to call before any UI render.
function reloadHandHistoryForIdentity() {
    handHistory = loadHandHistory();
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
    setupRoomScreen();
    setupGameScreen();
    setupStatsModal();
    setupResultsModal();
    setupChat();
    setupPreActions();
    setupPresetSettingsModal();
    setupFocusMode();
    setupAddTableModal();
    setupResumePill();

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Kick off the session resume BEFORE connecting. client.send() queues
    // messages that are dispatched before the socket opens, so this is safe.
    tryResumeSession();

    client.connect();

    // Client events
    client.on('connected', () => {
        document.getElementById('connection-status').textContent = '';
        document.getElementById('connection-status').classList.add('hidden');
        // On reconnect (not the first open), if we're still logged in the
        // server has forgotten our auth state — re-attach it silently.
        if (!resumingSession && loggedInAccount) {
            const saved = loadAuthSession();
            if (saved && saved.token) {
                client.send({ type: 'auth_resume', token: saved.token });
            }
        }
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
    // セッション退室時: その卓での自分の収支を表示
    client.on('session_result', (result) => {
        if (result) showSessionResult(result);
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
                // Queue switch — don't interrupt current action.
                // 自動切替しないので、音とバックグラウンド通知で別卓の番に気づけるようにする。
                if (!pendingSwitchQueue.includes(rid)) pendingSwitchQueue.push(rid);
                sound.yourTurn();
                notifyYourTurnBackground('別の卓');
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
                sound.yourDraw();
                notifyYourTurnBackground('別の卓');
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
    client.on('online_users', (users) => {
        lastOnlineUsers = Array.isArray(users) ? users : [];
        renderOnlineUsers(lastOnlineUsers);
        if (typeof updateSNSCTACounts === 'function') updateSNSCTACounts();
        // Update count badge inside chat modal tab
        const ccEl = document.getElementById('cp-online-count');
        if (ccEl) ccEl.textContent = `(${lastOnlineUsers.length})`;
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
    if (name === 'sns') {
        initSNSScreen();
        if (typeof updateResumePill === 'function') updateResumePill();
    }
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
        // Switch hand history to this guest's scope so they don't see the
        // previous identity's hands.
        reloadHandHistoryForIdentity();
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
        renderWelcomeBackCard();
    });

    // Returning user: open straight on the account tab with the welcome-back card.
    if (loadLastAccount()) {
        document.getElementById('tab-account').classList.add('active');
        document.getElementById('tab-guest').classList.remove('active');
        document.getElementById('login-account-form').classList.remove('hidden');
        document.getElementById('login-guest-form').classList.add('hidden');
        renderWelcomeBackCard();
    }

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
    } else {
        // Revoke the persistent session token on the server and locally.
        const saved = loadAuthSession();
        if (saved && saved.token) {
            client.send({ type: 'logout', token: saved.token });
        }
        clearAuthSession();
    }
    loggedInAccount = null;
    // Clear the in-memory hand history so the next person on this device
    // doesn't briefly see the previous identity's hands before they re-enter.
    handHistory = [];
    // Reset the account form back to login mode. Without this, a user who
    // just registered will find the form stuck in 'register' mode, and
    // re-submitting the same credentials triggers a register request that
    // fails with "このメールアドレスは既に登録されています" — which reads as
    // "login is broken."
    resetAccountFormToLogin();
    showScreen('login');
    // If we have a remembered account, surface the welcome-back card on
    // the account tab so re-login is one click + password.
    if (loadLastAccount()) {
        document.getElementById('tab-account')?.classList.add('active');
        document.getElementById('tab-guest')?.classList.remove('active');
        document.getElementById('login-account-form')?.classList.remove('hidden');
        document.getElementById('login-guest-form')?.classList.add('hidden');
        renderWelcomeBackCard();
    }
}

function resetAccountFormToLogin() {
    accountMode = 'login';
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    const nameIn = document.getElementById('account-name');
    const passIn = document.getElementById('account-password');
    const submitBtn = document.getElementById('btn-account-submit');
    const errorEl = document.getElementById('login-error');
    if (tabLogin) tabLogin.classList.add('active');
    if (tabReg) tabReg.classList.remove('active');
    if (nameIn) {
        nameIn.classList.remove('hidden');
        nameIn.readOnly = true;
        const last = loadLastAccount();
        nameIn.value = last ? (last.name || '') : '';
    }
    if (passIn) passIn.value = '';
    if (submitBtn) { submitBtn.textContent = 'ログイン'; submitBtn.disabled = false; }
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
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
let authTimeoutHandle = null;

function renderWelcomeBackCard() {
    const card = document.getElementById('welcome-back-card');
    const body = document.getElementById('account-form-body');
    if (!card || !body) return;
    const last = loadLastAccount();
    if (!last) {
        card.classList.add('hidden');
        body.classList.remove('hidden');
        return;
    }
    const avEl = document.getElementById('wb-av');
    const nameEl = document.getElementById('wb-name');
    const emailEl = document.getElementById('wb-email');
    if (avEl) {
        const src = getAvatarSrc(last.avatar);
        if (src) { avEl.src = src; avEl.alt = last.name || ''; avEl.classList.remove('hidden'); }
        else avEl.classList.add('hidden');
    }
    if (nameEl) nameEl.textContent = last.name || '';
    if (emailEl) emailEl.textContent = last.email || '';
    card.classList.remove('hidden');
    body.classList.add('hidden');
}
function dismissWelcomeBackCard() {
    const card = document.getElementById('welcome-back-card');
    const body = document.getElementById('account-form-body');
    if (card) card.classList.add('hidden');
    if (body) body.classList.remove('hidden');
}

function setupAccountLogin() {
    const nameInput = document.getElementById('account-name');
    const emailInput = document.getElementById('account-email');
    const passInput = document.getElementById('account-password');
    const submitBtn = document.getElementById('btn-account-submit');
    const errorEl = document.getElementById('login-error');

    // Welcome-back card actions
    const wbContinue = document.getElementById('btn-wb-continue');
    const wbSwitch = document.getElementById('btn-wb-switch');
    // ログインフォームを lastAccount の情報で埋める共通ヘルパー
    function prefillFromLastAccount() {
        const last = loadLastAccount();
        if (!last) return;
        if (last.name  && nameInput)  nameInput.value  = last.name;
        if (last.email && emailInput) emailInput.value = last.email;
    }

    if (wbContinue) wbContinue.addEventListener('click', () => {
        const last = loadLastAccount();
        dismissWelcomeBackCard();
        // Force login mode (not register) for returning users.
        accountMode = 'login';
        document.getElementById('tab-login')?.classList.add('active');
        document.getElementById('tab-register')?.classList.remove('active');
        // アカウント名とメールを前回値で埋める
        if (nameInput)  { nameInput.classList.remove('hidden'); nameInput.readOnly = true; nameInput.value  = last ? (last.name  || '') : ''; }
        if (emailInput) { emailInput.value = last ? (last.email || '') : ''; }
        if (submitBtn) { submitBtn.textContent = 'ログイン'; submitBtn.disabled = false; }
        // Clear any leftover error (e.g. "セッションが期限切れです") so the
        // user starts with a clean form.
        clearLoginError();
        if (passInput) { passInput.value = ''; passInput.focus(); }
    });
    if (wbSwitch) wbSwitch.addEventListener('click', () => {
        clearLastAccount();
        dismissWelcomeBackCard();
        if (nameInput)  { nameInput.classList.remove('hidden'); nameInput.readOnly = false; nameInput.value = ''; }
        if (emailInput) emailInput.value = '';
        if (passInput) passInput.value = '';
        // Reset to a clean login form — clear stale errors AND failure counters
        // so the user starts fresh.
        clearLoginError();
        resetLoginFailures();
        // Reset to login mode by default (most common case).
        accountMode = 'login';
        document.getElementById('tab-login')?.classList.add('active');
        document.getElementById('tab-register')?.classList.remove('active');
        if (submitBtn) { submitBtn.textContent = 'ログイン'; submitBtn.disabled = false; }
        if (nameInput) nameInput.focus();
    });

    // Login / Register tab switching
    document.getElementById('tab-login').addEventListener('click', () => {
        accountMode = 'login';
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('tab-register').classList.remove('active');
        nameInput.classList.remove('hidden');
        nameInput.readOnly = true;   // ログインでは表示のみ（変更不可）
        prefillFromLastAccount();
        submitBtn.textContent = 'ログイン';
        errorEl.classList.add('hidden');
    });
    document.getElementById('tab-register').addEventListener('click', () => {
        accountMode = 'register';
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
        nameInput.classList.remove('hidden');
        nameInput.readOnly = false;  // 新規登録では編集可
        submitBtn.textContent = '新規登録';
        errorEl.classList.add('hidden');
    });

    // 初期状態: ログインモードでも名前フィールドを表示し前回値を反映
    nameInput.classList.remove('hidden');
    nameInput.readOnly = true;
    prefillFromLastAccount();

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

        // Safety timeout: if the server never replies (ws was down, network
        // lost, etc.) re-enable the button and show an error instead of
        // leaving the user stuck at "処理中...".
        if (authTimeoutHandle) clearTimeout(authTimeoutHandle);
        authTimeoutHandle = setTimeout(() => {
            authTimeoutHandle = null;
            submitBtn.disabled = false;
            submitBtn.textContent = accountMode === 'register' ? '新規登録' : 'ログイン';
            showLoginError('サーバーから応答がありません。接続を確認してもう一度お試しください。');
        }, 10000);

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

function showLoginError(msg, options) {
    const el = document.getElementById('login-error');
    if (!el) return;
    el.innerHTML = '';
    const text = document.createElement('div');
    text.textContent = msg;
    el.appendChild(text);

    // Optional inline action button (e.g. "新規登録に切り替える")
    if (options && options.actionLabel && typeof options.onAction === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'login-error-action';
        btn.textContent = options.actionLabel;
        btn.addEventListener('click', options.onAction);
        el.appendChild(btn);
    }
    el.classList.remove('hidden');
}
function clearLoginError() {
    const el = document.getElementById('login-error');
    if (!el) return;
    el.innerHTML = '';
    el.textContent = '';
    el.classList.add('hidden');
}

// Track per-email login failure counts so the welcome-back card stops
// re-suggesting a credential that the server keeps rejecting (typical when
// localStorage has a stale `last_account` whose email no longer matches any
// real account, e.g. after a server reset or a failed Supabase migration).
let loginFailuresByEmail = {};
function resetLoginFailures() {
    loginFailuresByEmail = {};
}

function onAuthResult(data) {
    // CRITICAL: distinguish resume responses from manual login responses
    // by data.resumed ONLY. The resumingSession flag can be stale because
    // both requests may be in-flight at the same time (e.g. auth_resume from
    // page load + login from button click). Using the flag would mis-classify
    // a manual-login response as a resume response and silently swallow it.
    const isResumeResponse = !!data.resumed;

    if (data.success) {
        // Success path — clear ALL timers, re-enable button, enter lobby.
        if (resumeTimeoutHandle) { clearTimeout(resumeTimeoutHandle); resumeTimeoutHandle = null; }
        if (authTimeoutHandle)   { clearTimeout(authTimeoutHandle);   authTimeoutHandle = null; }
        resumingSession = false;
        const submitBtn = document.getElementById('btn-account-submit');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = accountMode === 'register' ? '新規登録' : 'ログイン';
        }
        loggedInAccount = { name: data.name, email: data.email };
        if (data.token) {
            saveAuthSession({ token: data.token, name: data.name, email: data.email });
        }
        // Remember the last successful account so we can offer a one-tap re-login
        // on future visits (Netflix/GitHub style). Kept even after logout *unless*
        // the user explicitly switches via "他のアカウントでログイン".
        saveLastAccount({ name: data.name, email: data.email, avatar: selectedAvatar || null });
        // Successful auth: clear any stale error from a previous failed attempt
        // and forget per-email failure counters.
        clearLoginError();
        resetLoginFailures();
        client.setName(data.name, selectedAvatar, false);
        // Switch to this account's hand history scope.
        reloadHandHistoryForIdentity();
        enterLobby(data.name);
        return;
    }

    // ----- Failure -----
    if (isResumeResponse) {
        // This is a response to the auto auth_resume — clear the resume timer
        // and stored token. If the user is in the middle of a manual login,
        // suppress this resume failure so it doesn't disrupt them.
        if (resumeTimeoutHandle) { clearTimeout(resumeTimeoutHandle); resumeTimeoutHandle = null; }
        resumingSession = false;
        clearAuthSession();

        // If user has already submitted manual login (authTimeoutHandle is
        // still pending), let that flow drive the UI.
        if (authTimeoutHandle) return;

        const submitBtn = document.getElementById('btn-account-submit');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = accountMode === 'register' ? '新規登録' : 'ログイン';
        }
        showLoginError(data.message || 'エラーが発生しました');
        return;
    }

    // Manual login/register failure — clear manual timer, re-enable button,
    // and ALWAYS show the error so the user knows their attempt failed.
    if (authTimeoutHandle) { clearTimeout(authTimeoutHandle); authTimeoutHandle = null; }
    const submitBtn = document.getElementById('btn-account-submit');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = accountMode === 'register' ? '新規登録' : 'ログイン';
    }

    // アカウントが未登録の場合は、新規登録タブへワンクリックで切替できる
    // アクションボタンを併せて表示する。
    if (data.errorCode === 'account_not_found') {
        const emailInput = document.getElementById('account-email');
        const nameInput  = document.getElementById('account-name');
        const emailVal   = emailInput ? emailInput.value.trim() : '';
        showLoginError(data.message || 'アカウントが見つかりません', {
            actionLabel: 'このメールで新規登録する →',
            onAction: () => {
                document.getElementById('tab-register')?.click();
                if (nameInput)  { nameInput.value = ''; nameInput.focus(); }
                if (emailInput) emailInput.value = emailVal;
                clearLoginError();
            },
        });
        return;
    }

    showLoginError(data.message || 'エラーが発生しました');
}

function tryResumeSession() {
    const saved = loadAuthSession();
    if (!saved || !saved.token) return false;
    resumingSession = true;
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
        errorEl.textContent = 'セッションを復帰中...';
        errorEl.classList.remove('hidden');
    }
    client.send({ type: 'auth_resume', token: saved.token });
    // Safety timeout — if the server never replies, fall back to the login form.
    if (resumeTimeoutHandle) clearTimeout(resumeTimeoutHandle);
    resumeTimeoutHandle = setTimeout(() => {
        resumeTimeoutHandle = null;
        if (!resumingSession) return;
        resumingSession = false;
        clearAuthSession();
        // If user has already submitted manual login credentials, don't
        // clobber their "処理中..." state with this resume-timeout message.
        if (authTimeoutHandle) return;
        if (errorEl) showLoginError('サーバーから応答がありません。再ログインしてください。');
    }, 10000);
    return true;
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

    // 承認制トグル: ホストには常に表示する。
    // - ログイン済み: 有効。チェックで承認制 ON/OFF。
    // - ゲスト: 無効化し「ログインで利用可」と明示 (承認制はアカウント機能)。
    //   以前はゲスト時に非表示にしていたため「トグルが出ない」と
    //   バグのように見えていた。ホストには常に見せて理由を伝える。
    const lockLabel = document.getElementById('lock-toggle-label');
    const lockToggle = document.getElementById('room-lock-toggle');
    const lockText = lockLabel ? lockLabel.querySelector('.lock-toggle-text') : null;
    if (isHost) {
        lockLabel.classList.remove('hidden');
        if (loggedInAccount) {
            lockToggle.disabled = false;
            lockToggle.checked = !!room.locked;
            lockLabel.classList.remove('lock-toggle-disabled');
            if (lockText) lockText.textContent = '🔓 承認制テーブル';
        } else {
            lockToggle.disabled = true;
            lockToggle.checked = false;
            lockLabel.classList.add('lock-toggle-disabled');
            if (lockText) lockText.textContent = '🔒 承認制テーブル（ログインで利用可）';
        }
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

    // チップ追加メニュー → モーダルを開く
    const addChipsModal = document.getElementById('add-chips-modal');
    const addChipsBtn = document.getElementById('btn-add-chips');
    if (addChipsBtn && addChipsModal) {
        const openAddChips = () => {
            const input = document.getElementById('add-chips-input');
            if (input) input.value = '';
            addChipsModal.classList.remove('hidden');
        };
        const closeAddChips = () => addChipsModal.classList.add('hidden');
        addChipsBtn.addEventListener('click', openAddChips);
        document.getElementById('btn-add-chips-close')?.addEventListener('click', closeAddChips);
        // 背景クリックで閉じる
        addChipsModal.addEventListener('click', (e) => { if (e.target === addChipsModal) closeAddChips(); });
        // プリセット (+10,000 / +20,000)
        addChipsModal.querySelectorAll('.add-chips-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const amt = parseInt(btn.dataset.amt, 10);
                if (amt > 0) client.addChips(amt, activeTableId);
                closeAddChips();
            });
        });
        // 任意の数値
        const submitCustom = () => {
            const input = document.getElementById('add-chips-input');
            const amt = parseInt(input ? input.value : '', 10);
            if (!Number.isFinite(amt) || amt <= 0) {
                showToast('正しい数値を入力してください');
                return;
            }
            client.addChips(amt, activeTableId);
            closeAddChips();
        };
        document.getElementById('btn-add-chips-custom')?.addEventListener('click', submitCustom);
        document.getElementById('add-chips-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitCustom();
        });
    }

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
    // Busted players get a dedicated modal with a 10-min rebuy/leave choice.
    updateBustModal(state);
    // Solo waiting: last chip-holder sees a "waiting for others" modal.
    updateSoloWaitModal(state);
}

// Bust modal: shown when this client's chips hit 0. The player has 10 minutes
// to choose rebuy (+10000) or leave. If they do nothing, the server kicks
// them automatically, matching the existing sitout timeout behavior.
let bustCountdownInterval = null;
let bustCountdownSecondsLeft = null;

function updateBustModal(state) {
    if (!state || state.mySeatIndex == null) return;
    const me = state.players && state.players[state.mySeatIndex];
    const isBusted = !!(me && me.busted) || !!state.myBusted;
    let modal = document.getElementById('bust-modal');

    if (!isBusted) {
        if (modal) modal.classList.add('hidden');
        if (bustCountdownInterval) { clearInterval(bustCountdownInterval); bustCountdownInterval = null; }
        bustCountdownSecondsLeft = null;
        return;
    }

    // Lazy-create the modal so we don't need to edit index.html.
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bust-modal';
        modal.className = 'bust-modal-overlay hidden';
        modal.innerHTML = `
            <div class="bust-modal-card">
                <div class="bust-modal-title">💸 チップが 0 になりました</div>
                <div class="bust-modal-body">
                    10分以内に「チップ補充」か「退室」を選んでください。<br>
                    何もしなかった場合は離席扱いで自動退室となります。
                </div>
                <div class="bust-modal-timer">
                    <span class="bust-modal-timer-label">残り時間</span>
                    <span class="bust-modal-timer-text" id="bust-modal-timer-text">--:--</span>
                    <div class="bust-modal-bar-outer"><div class="bust-modal-bar" id="bust-modal-bar" style="width:100%"></div></div>
                </div>
                <div class="bust-modal-actions">
                    <button class="btn-action btn-call" id="btn-bust-rebuy">チップ補充 (+10,000)</button>
                    <button class="btn-action btn-fold" id="btn-bust-leave">退室する</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('#btn-bust-rebuy').addEventListener('click', () => {
            client.rebuyFromBust(activeTableId);
        });
        modal.querySelector('#btn-bust-leave').addEventListener('click', () => {
            client.leaveFromBust(activeTableId);
        });
    }

    // Sync local countdown from server-provided seconds.
    if (me && typeof me.bustedRemaining === 'number') {
        bustCountdownSecondsLeft = me.bustedRemaining;
    } else if (bustCountdownSecondsLeft == null) {
        bustCountdownSecondsLeft = 600;
    }

    modal.classList.remove('hidden');
    renderBustCountdown();
    if (!bustCountdownInterval) {
        bustCountdownInterval = setInterval(() => {
            if (bustCountdownSecondsLeft == null) return;
            bustCountdownSecondsLeft = Math.max(0, bustCountdownSecondsLeft - 1);
            renderBustCountdown();
            if (bustCountdownSecondsLeft <= 0) {
                clearInterval(bustCountdownInterval);
                bustCountdownInterval = null;
            }
        }, 1000);
    }
}

function renderBustCountdown() {
    const txt = document.getElementById('bust-modal-timer-text');
    const bar = document.getElementById('bust-modal-bar');
    if (!txt || !bar) return;
    const s = bustCountdownSecondsLeft == null ? 0 : bustCountdownSecondsLeft;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    txt.textContent = `${m}:${String(sec).padStart(2, '0')}`;
    bar.style.width = `${Math.max(0, Math.min(100, (s / 600) * 100))}%`;
    if (s <= 120) bar.classList.add('urgent'); else bar.classList.remove('urgent');
}

// Solo-wait modal: the player is the only chip-holder at the table. They can
// end the table immediately or wait up to 10 minutes for another player to
// join. Mirrors the bust modal's structure for consistency.
let soloWaitCountdownInterval = null;
let soloWaitSecondsLeft = null;

function updateSoloWaitModal(state) {
    if (!state) return;
    const isSolo = !!state.mySoloWait;
    let modal = document.getElementById('solo-wait-modal');

    if (!isSolo) {
        if (modal) modal.classList.add('hidden');
        if (soloWaitCountdownInterval) { clearInterval(soloWaitCountdownInterval); soloWaitCountdownInterval = null; }
        soloWaitSecondsLeft = null;
        return;
    }

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'solo-wait-modal';
        modal.className = 'bust-modal-overlay hidden';
        modal.innerHTML = `
            <div class="bust-modal-card">
                <div class="bust-modal-title" style="color:#38bdf8">💭 他プレイヤーを待っています</div>
                <div class="bust-modal-body">
                    このテーブルには現在あなたしかいません。<br>
                    10分以内に他プレイヤーが参加しない場合は自動的にテーブルを終了します。
                </div>
                <div class="bust-modal-timer">
                    <span class="bust-modal-timer-label">残り時間</span>
                    <span class="bust-modal-timer-text" id="solo-wait-timer-text">--:--</span>
                    <div class="bust-modal-bar-outer"><div class="bust-modal-bar" id="solo-wait-bar" style="width:100%"></div></div>
                </div>
                <div class="bust-modal-actions">
                    <button class="btn-action btn-fold" id="btn-solo-end">テーブル終了</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('#btn-solo-end').addEventListener('click', () => {
            client.endTableNow(activeTableId);
        });
    }

    if (typeof state.soloWaitRemaining === 'number') {
        soloWaitSecondsLeft = state.soloWaitRemaining;
    } else if (soloWaitSecondsLeft == null) {
        soloWaitSecondsLeft = 600;
    }

    modal.classList.remove('hidden');
    renderSoloWaitCountdown();
    if (!soloWaitCountdownInterval) {
        soloWaitCountdownInterval = setInterval(() => {
            if (soloWaitSecondsLeft == null) return;
            soloWaitSecondsLeft = Math.max(0, soloWaitSecondsLeft - 1);
            renderSoloWaitCountdown();
            if (soloWaitSecondsLeft <= 0) {
                clearInterval(soloWaitCountdownInterval);
                soloWaitCountdownInterval = null;
            }
        }, 1000);
    }
}

function renderSoloWaitCountdown() {
    const txt = document.getElementById('solo-wait-timer-text');
    const bar = document.getElementById('solo-wait-bar');
    if (!txt || !bar) return;
    const s = soloWaitSecondsLeft == null ? 0 : soloWaitSecondsLeft;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    txt.textContent = `${m}:${String(sec).padStart(2, '0')}`;
    bar.style.width = `${Math.max(0, Math.min(100, (s / 600) * 100))}%`;
    if (s <= 120) bar.classList.add('urgent'); else bar.classList.remove('urgent');
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
        // Guests are restricted to live play only — don't persist their
        // hands to history. (Matches the server-side restriction on posting,
        // chatting and commenting.)
        if (!loggedInAccount) {
            currentHandLogs = [];
            return;
        }

        // Only save hands I actually played in. Without this filter, hands
        // observed as a spectator or hands from a table I joined mid-session
        // without a seat end up in the list, which looks like "other players'
        // hands" to the user. If I was not seated OR the hand_result doesn't
        // include me, skip saving.
        const mySeat = currentState ? currentState.mySeatIndex : -1;
        const iWasSeated = mySeat != null && mySeat >= 0
            && currentState && currentState.players && !!currentState.players[mySeat];
        const myName = (client && client.name) ? client.name : '';
        const iInResult = !!(lastHandResult && lastHandResult.players
            && myName && lastHandResult.players.some(p => p.name === myName));
        if (!iWasSeated && !iInResult) {
            currentHandLogs = [];
            return;
        }

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
            t: Date.now(),
            roomId: (currentState && currentState.roomId) ? currentState.roomId
                  : (typeof activeTableId !== 'undefined' && activeTableId) ? activeTableId
                  : null,
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
    // Guests are table-play-only — they don't accumulate hand history.
    // Make that explicit in the UI so they're not puzzled by an empty list.
    if (!loggedInAccount) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:8px;line-height:1.6;">ゲストアカウントではハンド履歴は保存されません。<br>アカウント登録するとプレイしたハンドが記録されます。</p>';
        return;
    }
    const myName = client.name;
    // Defensive filter: only show hands where I'm actually in the result
    // players list. Catches old hands saved before the save-time filter was
    // tightened, plus any edge case where a hand without my participation
    // slipped through (e.g. spectator views, multi-table cross-contamination).
    function iAmInHand(h) {
        if (!myName) return false;
        if (h && h.handResult && Array.isArray(h.handResult.players)) {
            return h.handResult.players.some(p => p && p.name === myName);
        }
        // No structured result — keep legacy hands that pre-date handResult.
        return !h || !h.handResult;
    }
    const visibleHands = handHistory.filter(iAmInHand);
    // One-shot persistence cleanup: if filtering removed any foreign-player
    // hands, save the cleaned list so they don't reappear on next load.
    if (visibleHands.length !== handHistory.length) {
        handHistory = visibleHands;
        persistHandHistory();
    }
    if (visibleHands.length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim);padding:8px;">まだ履歴がありません</p>';
        return;
    }
    // Compact list of starting hands with win/loss badges
    let html = '<div class="hh-list">';
    for (let i = visibleHands.length - 1; i >= 0; i--) {
        const h = visibleHands[i];
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
        html += `</div>`;
    }
    html += '</div>';
    // Detail panel (hidden by default)
    html += '<div id="hh-detail-' + containerId + '" class="hh-detail hidden"></div>';
    container.innerHTML = html;

    // Click handlers
    container.querySelectorAll('.hh-row').forEach(row => {
        row.addEventListener('click', (e) => {
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
            detail.innerHTML = renderHandDetail(visibleHands[idx], idx);
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

function renderHiddenCards(n) {
    if (!n || n <= 0) return '<span style="color:var(--text-dim)">--</span>';
    let out = '';
    for (let i = 0; i < n; i++) out += `<span class="mini-card mini-card-back">🂠</span>`;
    return out;
}

function renderHiddenVisualCards(n) {
    if (!n || n <= 0) return '';
    let out = '';
    for (let i = 0; i < n; i++) out += `<span class="hh-visual-card hh-visual-card-back">🂠</span>`;
    return out;
}

function renderHandDetail(h, idx) {
    if (!h) return '';
    const hr = h.handResult;
    const myName = client.name;
    // Hide other players' private cards until the user either posts this hand
    // with a comment (sets h.posted) or manually reveals it (sets h.revealed).
    // Stud up-cards stayed public during play, so we only mask hole/down cards.
    const hide = !h.posted && !h.revealed;

    // Header: game name + time
    let html = `<div class="hh-detail-header">`;
    html += `<span class="hh-detail-title">#${idx + 1} ${h.gameName || ''}</span>`;
    html += `<span class="hh-detail-time">${h.time || ''}</span>`;
    html += `</div>`;

    // Hide-notice banner with manual reveal button.
    if (hide) {
        html += `<div class="hh-hide-notice">`;
        html += `<span class="hh-hide-msg">👁️‍🗨️ 他プレイヤーのカードは非表示です。コメント付きで投稿すると公開されます。</span>`;
        html += `<button class="hh-reveal-btn" data-hh-reveal-idx="${idx}">表示する</button>`;
        html += `</div>`;
    }

    // === Player summary table (position, name, result, cards) ===
    if (hr && hr.players) {
        html += `<div class="hh-player-table">`;
        for (const p of hr.players) {
            const diff = p.chips - p.startChips;
            const diffStr = diff > 0 ? `<span class="hh-win">+${diff}</span>` :
                            diff < 0 ? `<span class="hh-loss">${diff}</span>` :
                            `<span class="hh-even">±0</span>`;
            const isMe = p.name === myName;
            const maskPrivate = hide && !isMe;
            const nameClass = isMe ? 'hh-p-name hh-p-me' : 'hh-p-name';
            let cards = '';
            const foldTag = p.folded ? '<span class="hh-folded-label">fold</span> ' : '';
            if (hr.gameType === 'stud' && p.downCards && p.downCards.length > 0) {
                const downHtml = maskPrivate
                    ? renderHiddenCards(p.downCards.length)
                    : renderMiniCards(p.downCards);
                cards = `${foldTag}<span class="hh-stud-down">[${downHtml}]</span> ${renderMiniCards(p.upCards)}`;
            } else if (p.cards && p.cards.length > 0) {
                cards = foldTag + (maskPrivate ? renderHiddenCards(p.cards.length) : renderMiniCards(p.cards));
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
            } else if (hide && !isMe) {
                // Mask exact discarded/drawn cards; only show the count.
                label = `${d.count}枚交換`;
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
            // Up-cards were public during the hand — always show them.
            // Down-cards (7th street) are private; mask for non-self while hidden.
            const cardHtml = (!d.up && hide && !isMe)
                ? renderHiddenCards(1)
                : renderMiniCards([d.card]);
            out += `<div class="${cls}"><span class="hh-draw-pname">${d.name}</span> <span class="hh-stud-deal">${cardHtml} (${upDown})</span></div>`;
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
                const cardsHtml = (hide && !p.isMe)
                    ? renderHiddenVisualCards((p.cards || []).length)
                    : renderVisualCards(p.cards);
                html += `<div class="hh-card-group"><span class="${nameClass}">${p.name}</span>${cardsHtml}</div>`;
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

function getActionClass(log) {
    if (log.includes('フォールド')) return 'act-fold';
    if (log.includes('レイズ') || log.includes('ベット')) return 'act-raise';
    if (log.includes('コール')) return 'act-call';
    if (log.includes('チェック')) return 'act-check';
    if (log.includes('オールイン')) return 'act-allin';
    if (log.includes('勝利') || log.includes('獲得')) return 'act-win';
    return '';
}

// ==========================================
// Replay (ハンドリプレイ共有)
// ==========================================
// ログのトークン化テーブル。共有URLを短くするため、頻出する日本語の
// アクション語・ラウンド見出しを '~' 始まりの短いコードに置換する。
// '~' は名前(NAME_RE)・カード・数値・ログ装飾のいずれにも出現しないため
// 衝突しない。replay.html 側で完全に逆変換するため挙動は一切変わらない。
// ※ このテーブルを変更する場合は replay.html の REPLAY_LOG_TOKENS も
//   必ず同一に保つこと。
const REPLAY_LOG_TOKENS = [
    ['フォールド', '~a'], ['チェック', '~b'], ['オールイン', '~c'],
    ['レイズ', '~d'], ['ベット', '~e'], ['コール', '~f'],
    ['ブリングイン', '~g'], ['アンティ', '~h'],
    ['フロップ', '~i'], ['ターン', '~j'], ['リバー', '~k'],
    ['回目のドロー', '~l'], ['Street', '~m'], ['--- ', '~n'], [' ---', '~o'],
];
function tokenizeReplayLog(s) {
    let r = String(s);
    for (const [jp, code] of REPLAY_LOG_TOKENS) r = r.split(jp).join(code);
    return r;
}

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
        v: 2,                                  // payload version (2 = tokenized logs)
        g: hr.gameName, t: hr.gameType,
        c: hr.communityCards, d: hr.dealerSeat,
        p: hr.players.map(p => ({
            n: p.name, o: p.position, f: p.folded ? 1 : 0,
            c: p.chips, s: p.startChips,
            h: p.cards, u: p.upCards, w: p.downCards,
        })),
        l: (h.logs || []).map(tokenizeReplayLog), ds: hr.drawSnapshots,
    };
    const compressed = await compressForReplay(JSON.stringify(data));
    const base = window.location.href.replace(/\/[^/]*$/, '/');
    // ?v=2 でブラウザキャッシュをバスト (新形式に対応した replay.html を確実に取得)
    return base + 'replay.html?v=2#' + compressed;
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

// Shown when a guest tries to use a feature that requires an account
// (chat / 投稿 / コメント / いいね ...).
function showLoginRequiredToast(featureLabel) {
    showToast(`${featureLabel}はアカウント登録が必要です（ゲストはプレイのみ）`);
}

// Event delegation for replay/share/reveal buttons
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
    const revealBtn = e.target.closest('.hh-reveal-btn');
    if (revealBtn) {
        const idx = parseInt(revealBtn.dataset.hhRevealIdx);
        const h = handHistory[idx];
        if (!h) return;
        h.revealed = true;
        persistHandHistory();
        // Re-render the currently open detail pane in place.
        const detail = revealBtn.closest('.hh-detail');
        if (detail) detail.innerHTML = renderHandDetail(h, idx);
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

// タブ非表示時のバックグラウンド通知（タイトル点滅 + デスクトップ通知）。
// label を渡すと「<label>: あなたの番です！」と表示し、どの卓かを伝える。
function notifyYourTurnBackground(label) {
    if (!document.hidden) return;
    if (!titleFlashInterval) {
        const orig = document.title;
        let flip = false;
        titleFlashInterval = setInterval(() => {
            document.title = flip ? orig : '★ あなたの番です！';
            flip = !flip;
        }, 800);
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
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
            const body = label ? `${label}: あなたの番です！` : 'あなたの番です！';
            const n = new Notification('mix-1', { body, icon: 'logos/logo.png', tag: 'your-turn' });
            setTimeout(() => n.close(), 5000);
        } catch (e) {}
    }
}

function notifyYourTurn() {
    triggerTurnFlash();          // 画面フラッシュ (アクティブ卓)
    notifyYourTurnBackground();  // タブ非表示時のタイトル点滅 + デスクトップ通知
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
}

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

// ==========================================
// 成績 (Results) Modal
// ==========================================
let resultsActiveTab = 'overall';
let resultsServerSessions = null; // cached from 'session_records' WS event

function setupResultsModal() {
    const modal = document.getElementById('results-modal');
    if (!modal) return;
    document.getElementById('btn-results-close').addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    const openBtn = document.getElementById('sns-header-results');
    if (openBtn) openBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        renderResultsTab(resultsActiveTab);
        // Pre-fetch server-side session records for the テーブル別 tab.
        if (typeof client !== 'undefined' && client.getSessionRecords) {
            client.getSessionRecords({ limit: 500 });
        }
    });
    modal.querySelectorAll('.results-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.rtab;
            resultsActiveTab = tab;
            modal.querySelectorAll('.results-tab').forEach(b =>
                b.classList.toggle('active', b.dataset.rtab === tab));
            renderResultsTab(tab);
        });
    });
    // Cache server-side session records when they arrive.
    if (typeof client !== 'undefined' && client.on) {
        client.on('session_records', (records) => {
            resultsServerSessions = records || [];
            if (!modal.classList.contains('hidden') && resultsActiveTab === 'table') {
                renderResultsTab('table');
            }
        });
    }
}

// Aggregate the local hand history into per-hand profit entries we can group.
function _myHandResults() {
    const myName = (typeof client !== 'undefined' && client.name) ? client.name : '';
    if (!myName) return [];
    const out = [];
    for (const h of (handHistory || [])) {
        if (!h || !h.handResult || !Array.isArray(h.handResult.players)) continue;
        const me = h.handResult.players.find(p => p && p.name === myName);
        if (!me) continue;
        const profit = (me.chips || 0) - (me.startChips || 0);
        out.push({
            t: h.t || null,
            roomId: h.roomId || null,
            gameName: h.gameName || h.handResult.gameName || '',
            profit,
        });
    }
    return out;
}

function _formatProfit(n) {
    if (n > 0) return `+${n.toLocaleString()}`;
    if (n < 0) return n.toLocaleString();
    return '±0';
}
function _profitCls(n) { return n > 0 ? 'plus' : n < 0 ? 'minus' : 'zero'; }

function renderResultsTab(tab) {
    const body = document.getElementById('results-body');
    if (!body) return;
    if (!loggedInAccount && tab !== 'table') {
        body.innerHTML = '<div class="results-empty">ゲストアカウントでは成績は記録されません。<br>アカウント登録後にプレイすると成績が蓄積されます。</div>';
        return;
    }
    if (tab === 'overall') body.innerHTML = _renderOverallTab();
    else if (tab === 'date') body.innerHTML = _renderGroupedTab('date');
    else if (tab === 'month') body.innerHTML = _renderGroupedTab('month');
    else if (tab === 'table') body.innerHTML = _renderTableTab();
}

function _renderOverallTab() {
    const entries = _myHandResults();
    if (entries.length === 0) return '<div class="results-empty">まだ記録がありません</div>';
    const total = entries.reduce((s, e) => s + e.profit, 0);
    const wins  = entries.filter(e => e.profit > 0).length;
    const losses = entries.filter(e => e.profit < 0).length;
    const winRate = entries.length > 0 ? Math.round(100 * wins / entries.length) : 0;
    return `
        <div class="results-summary">
            <div class="results-summary-card">
                <div class="rsc-label">合計収支</div>
                <div class="rsc-val ${total > 0 ? 'rsc-val-plus' : total < 0 ? 'rsc-val-minus' : ''}">${_formatProfit(total)}</div>
            </div>
            <div class="results-summary-card">
                <div class="rsc-label">ハンド数</div>
                <div class="rsc-val">${entries.length}</div>
            </div>
            <div class="results-summary-card">
                <div class="rsc-label">勝率</div>
                <div class="rsc-val">${winRate}%</div>
            </div>
        </div>
        <div class="results-row-list">
            <div class="results-row"><span class="results-row-key">勝ったハンド</span><span class="results-row-val plus">${wins}</span></div>
            <div class="results-row"><span class="results-row-key">負けたハンド</span><span class="results-row-val minus">${losses}</span></div>
            <div class="results-row"><span class="results-row-key">引き分け / フォールド</span><span class="results-row-val zero">${entries.length - wins - losses}</span></div>
        </div>
    `;
}

function _renderGroupedTab(mode) {
    const entries = _myHandResults().filter(e => e.t);
    if (entries.length === 0) return '<div class="results-empty">日付付きの記録がまだありません</div>';
    const groups = new Map();
    for (const e of entries) {
        const d = new Date(e.t);
        const key = mode === 'date'
            ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
            : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const g = groups.get(key) || { key, profit: 0, hands: 0 };
        g.profit += e.profit; g.hands += 1;
        groups.set(key, g);
    }
    const sorted = [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
    const total = sorted.reduce((s, g) => s + g.profit, 0);
    let html = `
        <div class="results-summary">
            <div class="results-summary-card">
                <div class="rsc-label">対象期間 合計</div>
                <div class="rsc-val ${total > 0 ? 'rsc-val-plus' : total < 0 ? 'rsc-val-minus' : ''}">${_formatProfit(total)}</div>
            </div>
            <div class="results-summary-card">
                <div class="rsc-label">${mode === 'date' ? '日数' : '月数'}</div>
                <div class="rsc-val">${sorted.length}</div>
            </div>
            <div class="results-summary-card">
                <div class="rsc-label">合計ハンド</div>
                <div class="rsc-val">${entries.length}</div>
            </div>
        </div>
        <div class="results-row-list">`;
    for (const g of sorted) {
        html += `<div class="results-row">
            <span><span class="results-row-key">${g.key}</span><span class="results-row-meta">${g.hands} ハンド</span></span>
            <span class="results-row-val ${_profitCls(g.profit)}">${_formatProfit(g.profit)}</span>
        </div>`;
    }
    html += '</div>';
    return html;
}

function _renderTableTab() {
    // テーブル別はサーバーのセッション記録から、各テーブル ID ごとに
    // 全参加者の累積収支を集計して表示する。
    // Render Free Tier の ephemeral filesystem のため、サーバー再起動や
    // 一定時間アクセスがないとデータが消えてしまうことを明示する。
    const ephemeralNotice = `
        <div class="results-ephemeral-notice">
            ⚠️ <strong>このデータはしばらくすると消えます</strong><br>
            <small>テーブル別の成績はサーバー側に保存されています。サーバーの再起動や、
            一定時間アクセスがない状態（無料プランの自動スリープ）の後にはリセットされます。
            記録したい結果はスクリーンショット等で控えてください。</small>
        </div>
    `;
    if (resultsServerSessions === null) {
        return ephemeralNotice + '<div class="results-empty">サーバーから取得中...</div>';
    }
    if (resultsServerSessions.length === 0) {
        return ephemeralNotice + '<div class="results-empty">テーブル別の記録はまだありません。<br>テーブルが閉じられたタイミングで記録されます。</div>';
    }
    const myName = (typeof client !== 'undefined' && client.name) ? client.name : '';
    // Group by roomId. For each roomId, aggregate per-name profit across all
    // sessions (a table ID can be reused — the same id might host multiple
    // separate sessions). Show participants sorted by profit desc.
    const byRoom = new Map();
    for (const rec of resultsServerSessions) {
        if (!rec || !rec.roomId || !Array.isArray(rec.participants)) continue;
        const entry = byRoom.get(rec.roomId) || {
            roomId: rec.roomId, sessionCount: 0, totalHands: 0,
            lastTimestamp: '', perPlayer: new Map(),
        };
        entry.sessionCount++;
        entry.totalHands += (rec.handsPlayed || 0);
        if (rec.timestamp > entry.lastTimestamp) entry.lastTimestamp = rec.timestamp;
        for (const p of rec.participants) {
            if (!p || !p.name) continue;
            const pp = entry.perPlayer.get(p.name) || { name: p.name, profit: 0, hands: 0 };
            pp.profit += (p.profit || 0);
            pp.hands  += (p.handsPlayed || 0);
            entry.perPlayer.set(p.name, pp);
        }
        byRoom.set(rec.roomId, entry);
    }
    const blocks = [...byRoom.values()].sort((a, b) =>
        b.lastTimestamp.localeCompare(a.lastTimestamp));
    let html = ephemeralNotice;
    for (const b of blocks) {
        const players = [...b.perPlayer.values()].sort((a, b) => b.profit - a.profit);
        const date = b.lastTimestamp ? new Date(b.lastTimestamp).toLocaleString() : '';
        html += `<div class="results-table-block">
            <div class="results-table-head">
                <span class="results-table-id">テーブル ${escapeHtml(b.roomId)}</span>
                <span class="results-table-meta">${b.sessionCount} セッション / 計 ${b.totalHands} ハンド / ${escapeHtml(date)}</span>
            </div>
            <div class="results-table-rows results-row-list">`;
        for (const p of players) {
            const isMe = myName && p.name === myName;
            html += `<div class="results-row${isMe ? ' results-row-self' : ''}">
                <span><span class="results-row-key">${escapeHtml(p.name)}${isMe ? ' <small>(自分)</small>' : ''}</span><span class="results-row-meta">${p.hands} ハンド</span></span>
                <span class="results-row-val ${_profitCls(p.profit)}">${_formatProfit(p.profit)}</span>
            </div>`;
        }
        html += '</div></div>';
    }
    return html;
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
        container.innerHTML = `<h3 style="color:var(--gold)">${escapeHtml(playerName)}</h3><p style="color:var(--text-dim);padding:16px;">データなし</p>`;
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
    // pName comes from server-supplied account names — escape for safety so
    // a malicious display name can't smuggle markup through the heading or
    // the data-player attribute.
    const safeName = escapeHtml(pName);
    let html = `<div class="stats-player-panel">`;
    html += `<h3${extraAttr || ''}>${safeName} (${c.hands}ハンド)</h3>`;
    if (!c.hands || c.hands === 0) { html += '<p style="color:var(--text-dim)">データなし</p></div>'; return html; }

    // Tabs
    html += `<div class="stats-tabs-bar">`;
    html += `<button class="stats-tab active" data-tab="total">全体</button>`;
    html += `<button class="stats-tab" data-tab="game">ゲーム別</button>`;
    html += `<button class="stats-tab" data-tab="graph" data-player="${safeName}">グラフ</button>`;
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
    html += `<div class="graph-controls" data-player="${safeName}">`;
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
    function guardGuestChat() {
        // Guests are table-play-only; block chat inputs from the client side
        // so no request even hits the server.
        if (!loggedInAccount) {
            showLoginRequiredToast('チャット');
            return true;
        }
        return false;
    }
    function hookChatInput(inputId, sendId) {
        const input = document.getElementById(inputId);
        const send = document.getElementById(sendId);
        if (!input || !send) return;
        send.addEventListener('click', () => {
            if (guardGuestChat()) { input.value = ''; return; }
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
                if (guardGuestChat()) { qcPalette.classList.add('hidden'); return; }
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
    // `from` and `message` are user-controlled — always escape before
    // injecting into innerHTML so a name/message can't smuggle <script> markup.
    div.innerHTML = `<span class="chat-ts">${escapeHtml(ts)}</span><span class="room-chat-name">${escapeHtml(from)}:</span> ${escapeHtml(message)}`;
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

    // Sort by status
    users.sort((a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0));

    for (const u of users) {
        const item = document.createElement('div');
        item.className = 'online-user-item';

        const avatarHtml = u.avatar
            ? `<img src="avatars/${u.avatar}.svg" alt="">`
            : `<div class="online-user-initial">${(u.name || '?').charAt(0).toUpperCase()}</div>`;

        item.innerHTML = `
            ${avatarHtml}
            <span class="online-user-name">${u.name}</span>
            <span class="online-user-status">
                <span class="online-status-dot ${u.status}"></span>
                ${statusLabel[u.status] || ''}
            </span>
        `;

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
    // `data.from` is the player name and `data.emote` is server-relayed —
    // escape both before insertion to prevent XSS via crafted names.
    el.innerHTML = `<span class="reaction-pop-emoji">${escapeHtml(data.emote)}</span><span class="reaction-pop-name">${escapeHtml(data.from)}</span>`;

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
let snsInitialized = false;

function initSNSScreen() {
    if (!snsInitialized) {
        setupSNSEvents();
        setupLobbyChat();
        snsInitialized = true;
    }
    // Update user display in topbar
    updateMainTopbarUser();
    client.getRooms();
    updateSNSCTACounts();
    renderRailRooms(window.lastRoomList || []);
    // 登録プレイヤー全員のスタッツを取得（プレイヤークラウド用）
    if (client && client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.send({ type: 'get_player_stats' });
    }
    // ロビーチャットの履歴を取得
    if (typeof client !== 'undefined' && client.getLobbyChat) {
        client.getLobbyChat();
    }
    // 登録ユーザーのみ入力可能にする
    refreshLobbyChatInputState();
    // Render the main-screen Player Cloud with whatever we currently have.
    // It will be re-rendered when the player_stats response arrives.
    if (typeof renderPlayerCloud === 'function') renderPlayerCloud(lastOnlineUsers || []);
}

// ==========================================
// Lobby Chat
// ==========================================
let lobbyChatMessages = [];

function setupLobbyChat() {
    const input = document.getElementById('lobby-chat-input');
    const btn   = document.getElementById('lobby-chat-send');
    if (!input || !btn) return;

    function send() {
        const text = input.value.trim();
        if (!text) return;
        if (!loggedInAccount) {
            showLoginRequiredToast && showLoginRequiredToast('ロビーチャット');
            return;
        }
        client.sendLobbyChat(text);
        input.value = '';
    }
    btn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    client.on('lobby_chat_history', (messages) => {
        lobbyChatMessages = messages.slice();
        renderLobbyChat();
    });
    client.on('lobby_chat_new', (m) => {
        if (!m) return;
        lobbyChatMessages.push(m);
        if (lobbyChatMessages.length > 200) lobbyChatMessages.splice(0, lobbyChatMessages.length - 200);
        renderLobbyChat({ scrollIntoNew: true });
    });
}

function refreshLobbyChatInputState() {
    const input = document.getElementById('lobby-chat-input');
    const btn   = document.getElementById('lobby-chat-send');
    if (!input || !btn) return;
    const allowed = !!loggedInAccount;
    input.disabled = !allowed;
    btn.disabled = !allowed;
    input.placeholder = allowed
        ? 'メッセージを入力'
        : 'ロビーチャットは登録ユーザーのみ投稿できます';
}

function renderLobbyChat(opts) {
    const list = document.getElementById('lobby-chat-messages');
    if (!list) return;
    if (lobbyChatMessages.length === 0) {
        list.innerHTML = '<div class="mx-chat-empty">まだメッセージがありません</div>';
        return;
    }
    // Detect if user was scrolled to bottom before re-render so we can keep
    // them pinned to live messages without disturbing manual scrollback.
    const wasAtBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    let html = '';
    for (const m of lobbyChatMessages) {
        html += _renderLobbyChatMsg(m);
    }
    list.innerHTML = html;
    if (wasAtBottom || (opts && opts.scrollIntoNew)) {
        list.scrollTop = list.scrollHeight;
    }
}

function _renderLobbyChatMsg(m) {
    const isSystem = m.type === 'system';
    const dt = m.timestamp ? new Date(m.timestamp) : null;
    const time = dt ? `${dt.getHours()}:${String(dt.getMinutes()).padStart(2,'0')}` : '';
    const name = escapeHtml(m.name || (isSystem ? 'システム' : ''));
    let body = `<div class="mx-chat-msg-text">${escapeHtml(m.text || '')}</div>`;
    if (isSystem && m.sessionResult && Array.isArray(m.sessionResult.participants)) {
        const parts = m.sessionResult.participants.map(p => {
            const profit = p.profit || 0;
            const cls = profit > 0 ? 'sr-plus' : profit < 0 ? 'sr-minus' : 'sr-zero';
            const sign = profit > 0 ? '+' : '';
            return `<span><span class="sr-name">${escapeHtml(p.name)}</span> <span class="sr-prof ${cls}">${sign}${profit.toLocaleString()}</span></span>`;
        }).join('');
        // Replace the plain-text body with a richer summary that's easier
        // to scan than the inline `Name: +N / Name: -M / ...` text.
        body = `
            <div class="mx-chat-msg-text">📊 テーブル <strong>${escapeHtml(m.sessionResult.roomId)}</strong> 終了 — ${m.sessionResult.handsPlayed} ハンド / ${m.sessionResult.participants.length} 人</div>
            <div class="mx-chat-sr">${parts}</div>
        `;
    }
    return `<div class="mx-chat-msg${isSystem ? ' is-system' : ''}">
        <div class="mx-chat-msg-meta">
            <span class="mx-chat-msg-name">${name}</span>
            <span class="mx-chat-msg-time">${time}</span>
        </div>
        ${body}
    </div>`;
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

// テーブル検索/フィルタの状態 (クライアント側のみ)
const tableFilter = { q: '', vacant: false, waiting: false, open: false };

// 検索語・フィルタチップで卓一覧を絞り込む。
function applyTableFilter(rooms) {
    let list = rooms || [];
    const q = tableFilter.q.trim().toLowerCase();
    if (q) {
        list = list.filter(r => {
            const gameName = r.gameName ||
                (r.mergedGames && r.mergedGames[0] != null && GAME_LIST && GAME_LIST[r.mergedGames[0]]
                    ? GAME_LIST[r.mergedGames[0]].shortName : '') || '';
            return (
                (r.id || '').toLowerCase().includes(q) ||
                (r.hostName || '').toLowerCase().includes(q) ||
                gameName.toLowerCase().includes(q)
            );
        });
    }
    if (tableFilter.vacant)  list = list.filter(r => r.playerCount < 6);
    if (tableFilter.waiting) list = list.filter(r => !r.playing);
    if (tableFilter.open)    list = list.filter(r => !r.locked);
    return list;
}

function renderRailRooms(rooms) {
    const rail = document.getElementById('mx-rail');
    if (!rail) return;
    rail.innerHTML = '';
    // 検索/フィルタを適用 (元の rooms は window.lastRoomList のまま保持)
    const filtered = applyTableFilter(rooms);
    const hasFilter = !!(tableFilter.q || tableFilter.vacant || tableFilter.waiting || tableFilter.open);
    if (!filtered || filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'mx-rail-empty';
        // フィルタで0件なのか、そもそも卓が無いのかで文言を変える
        empty.textContent = hasFilter
            ? '条件に合う卓がありません'
            : '参加できる卓がありません。作成しましょう！';
        rail.appendChild(empty);
        // Add button (フィルタ中は出さない — 誤解を避ける)
        if (!hasFilter) {
            const addBtn = document.createElement('div');
            addBtn.className = 'mx-rail-add';
            addBtn.textContent = '＋ 新規ルーム';
            addBtn.addEventListener('click', () => client.createRoom());
            rail.appendChild(addBtn);
        }
        return;
    }
    for (const r of filtered) {
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
        attachTablePreview(card, r);
        rail.appendChild(card);
    }
    // Add "+ create" button at the end
    const addBtn = document.createElement('div');
    addBtn.className = 'mx-rail-add';
    addBtn.textContent = '＋ 新規ルーム';
    addBtn.addEventListener('click', () => client.createRoom());
    rail.appendChild(addBtn);
}

// ==========================================
// Table preview popover (Idea 2: Airbnb/Twitch-style peek)
// ==========================================
let _previewShowTimer = null;
let _previewHideTimer = null;
let _previewActiveCard = null;

function attachTablePreview(card, room) {
    const show = () => {
        clearTimeout(_previewHideTimer);
        clearTimeout(_previewShowTimer);
        _previewShowTimer = setTimeout(() => showTablePreview(card, room), 280);
    };
    const hide = () => {
        clearTimeout(_previewShowTimer);
        clearTimeout(_previewHideTimer);
        _previewHideTimer = setTimeout(hideTablePreview, 120);
    };
    card.addEventListener('mouseenter', show);
    card.addEventListener('mouseleave', hide);
    card.addEventListener('focus', show);
    card.addEventListener('blur', hide);

    // Mobile: long-press (500ms) opens the preview. A short tap still joins.
    let pressTimer = null;
    let longPressed = false;
    card.addEventListener('touchstart', (e) => {
        longPressed = false;
        pressTimer = setTimeout(() => {
            longPressed = true;
            showTablePreview(card, room);
        }, 500);
    }, { passive: true });
    card.addEventListener('touchend', (e) => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        // If the preview opened, suppress the tap-to-join that would follow.
        if (longPressed) {
            e.preventDefault();
            // Keep popover visible briefly; user can tap outside to dismiss.
            setTimeout(hideTablePreview, 2500);
        }
    });
    card.addEventListener('touchmove', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }, { passive: true });
    card.addEventListener('touchcancel', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });
}

function showTablePreview(card, r) {
    const pop = document.getElementById('mx-table-preview');
    if (!pop) return;
    _previewActiveCard = card;

    const statusCls = r.playerCount >= 6 ? 'full' : (r.playing ? 'playing' : 'waiting');
    const statusText = r.playerCount >= 6 ? '● 満席' : (r.playing ? '● プレイ中' : '● 待機中');
    const gameName = r.gameName
        || (r.mergedGames && r.mergedGames[0] != null && typeof GAME_LIST !== 'undefined' && GAME_LIST[r.mergedGames[0]]
            ? GAME_LIST[r.mergedGames[0]].shortName
            : '—');
    const hostAvSrc = getAvatarSrc(r.hostAvatar);
    const hostAv = hostAvSrc
        ? `<img src="${hostAvSrc}" alt="">`
        : `<span>${escapeHtml((r.hostName || '?')[0].toUpperCase())}</span>`;

    const TABLE_SIZE = 6;
    const seatCells = [];
    for (let i = 0; i < TABLE_SIZE; i++) {
        const m = (r.members || [])[i];
        if (!m) {
            seatCells.push(`<div class="mx-preview-seat empty" title="空席"></div>`);
        } else {
            const src = getAvatarSrc(m.avatar);
            seatCells.push(src
                ? `<div class="mx-preview-seat" title="${escapeHtml(m.name)}"><img src="${src}" alt=""></div>`
                : `<div class="mx-preview-seat" title="${escapeHtml(m.name)}">${escapeHtml((m.name || '?')[0].toUpperCase())}</div>`
            );
        }
    }

    const footerCls = r.locked ? 'mx-preview-footer locked' : 'mx-preview-footer';
    const footerText = r.playerCount >= 6
        ? '満席 — 空きが出るまでお待ちください'
        : (r.locked
            ? '🔒 承認制 — 参加リクエストが必要です'
            : 'カードをクリックで参加');

    pop.innerHTML = `
        <div class="mx-preview-head">
            <div class="mx-preview-id">${r.locked ? '🔒 ' : ''}${escapeHtml(r.id)}</div>
            <div class="mx-preview-status ${statusCls}">${statusText}</div>
        </div>
        <div class="mx-preview-host">
            <div class="mx-preview-host-av">${hostAv}</div>
            <div>
                <div class="mx-preview-host-name">${escapeHtml(r.hostName || '')}</div>
                <div class="mx-preview-host-sub">ホスト</div>
            </div>
        </div>
        <div class="mx-preview-game">🎴 ${escapeHtml(gameName)} ・ ${r.playerCount}/${TABLE_SIZE}人</div>
        <div class="mx-preview-members">${seatCells.join('')}</div>
        <div class="${footerCls}">${footerText}</div>
    `;

    // Keep it visible while hovered.
    pop.onmouseenter = () => { clearTimeout(_previewHideTimer); };
    pop.onmouseleave = () => { hideTablePreview(); };

    // Position: below the card, clamped to viewport.
    pop.classList.remove('hidden');
    // Force layout so we can measure.
    const rect = card.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left + rect.width / 2 - popRect.width / 2;
    // Clamp horizontally.
    left = Math.max(margin, Math.min(left, window.innerWidth - popRect.width - margin));
    // Flip above if it would clip the bottom.
    if (top + popRect.height > window.innerHeight - margin) {
        const aboveTop = rect.top - popRect.height - margin;
        if (aboveTop > margin) top = aboveTop;
    }
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
}

function hideTablePreview() {
    const pop = document.getElementById('mx-table-preview');
    if (!pop) return;
    pop.classList.add('hidden');
    _previewActiveCard = null;
}

// ==========================================
// セッション収支モーダル (退室時に表示)
// ==========================================
let _sessionResultQueue = [];
let _sessionResultShowing = false;

function showSessionResult(result) {
    if (!result) return;
    _sessionResultQueue.push(result);
    if (!_sessionResultShowing) _renderNextSessionResult();
}

function _renderNextSessionResult() {
    if (_sessionResultQueue.length === 0) { _sessionResultShowing = false; return; }
    _sessionResultShowing = true;
    const result = _sessionResultQueue.shift();

    let overlay = document.getElementById('session-result-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'session-result-overlay';
        overlay.className = 'session-result-overlay';
        document.body.appendChild(overlay);
    }
    const profit = result.profit || 0;
    const sign = profit > 0 ? '+' : '';
    const cls = profit > 0 ? 'sr-plus' : profit < 0 ? 'sr-minus' : 'sr-zero';
    const headline = profit > 0 ? '🎉 セッション収支' : profit < 0 ? 'セッション収支' : 'セッション収支';
    overlay.innerHTML = `
        <div class="session-result-card">
            <div class="sr-title">${headline}</div>
            <div class="sr-table">テーブル ${escapeHtml(String(result.roomId || ''))} ・ ${result.handsPlayed || 0} ハンド</div>
            <div class="sr-amount ${cls}">${sign}${profit.toLocaleString()}</div>
            <div class="sr-detail">投資 ${(result.invested||0).toLocaleString()} → 終了 ${(result.endChips||0).toLocaleString()}</div>
            <button class="sr-ok btn-primary" id="session-result-ok">OK</button>
        </div>`;
    overlay.classList.add('show');

    const close = () => {
        overlay.classList.remove('show');
        // 次のキューがあれば少し待って表示
        setTimeout(_renderNextSessionResult, 200);
    };
    const okBtn = document.getElementById('session-result-ok');
    if (okBtn) okBtn.addEventListener('click', close, { once: true });
    // 背景クリックでも閉じる
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); }, { once: true });
}

function updateResumePill() {
    const pill = document.getElementById('mx-resume-pill');
    if (!pill) return;
    const count = (typeof tables !== 'undefined' && tables) ? tables.size : 0;
    const countEl = document.getElementById('mx-resume-count');
    if (countEl) countEl.textContent = String(count);
    if (count > 0) pill.classList.remove('hidden');
    else pill.classList.add('hidden');
}

function setupResumePill() {
    const pill = document.getElementById('mx-resume-pill');
    if (!pill) return;
    const activate = () => {
        // Jump back to the game screen if we have an active table.
        if (typeof tables !== 'undefined' && tables && tables.size > 0) {
            showScreen('game');
        }
    };
    pill.addEventListener('click', activate);
    pill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
}

function setupSNSEvents() {
    // sns-header-stats / sns-header-history / sns-header-logout are wired directly in
    // setupStatsModal / setupLobbyScreen / setupLoginScreen.

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

    // テーブル検索 + フィルタチップ (クライアント側で window.lastRoomList を絞り込む)
    const searchInput = document.getElementById('mx-table-search');
    const searchClear = document.getElementById('mx-search-clear');
    const rerenderRail = () => renderRailRooms(window.lastRoomList || []);
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            tableFilter.q = searchInput.value;
            if (searchClear) searchClear.classList.toggle('hidden', !searchInput.value);
            rerenderRail();
        });
    }
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            tableFilter.q = '';
            if (searchInput) searchInput.value = '';
            searchClear.classList.add('hidden');
            rerenderRail();
        });
    }
    document.querySelectorAll('.mx-filter-chips .mx-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.filter;
            tableFilter[key] = !tableFilter[key];
            chip.classList.toggle('active', tableFilter[key]);
            rerenderRail();
        });
    });

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

}

// ---- Room picker modal ----
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

// ---- Online users modal ----
function openOnlineUsersModal() {
    document.getElementById('chat-picker-modal').classList.remove('hidden');
    renderOnlineUsers(lastOnlineUsers || []);
}
function closeOnlineUsersModal() {
    document.getElementById('chat-picker-modal').classList.add('hidden');
}
function openChatModal()   { openOnlineUsersModal(); }
function switchChatTab()   { /* no-op */ }

// ==========================================
// Player Cloud (プレイヤークラウド描画)
// ==========================================
function renderPlayerCloud(users) {
    const svg = document.getElementById('player-cloud-main-svg');
    if (!svg) return;
    _renderPlayerCloudToSvg(svg, users);
}

function _renderPlayerCloudToSvg(svg, users) {
    if (!svg) return;

    // Build the master roster: use the full server-side player list
    // (every registered account) when available, falling back to the
    // online-users list otherwise. Online users contribute their live
    // avatar info.
    const onlineByName = {};
    for (const u of (users || [])) {
        if (u && u.name) onlineByName[u.name] = u.avatar || null;
    }

    const cache = window.playerStatsCache || {};
    let targets;
    if (Object.keys(cache).length > 0) {
        // 全登録プレイヤーを表示（オンラインユーザーのアバター情報があれば反映）
        targets = Object.values(cache).map(s => ({
            name: s.name,
            avatar: onlineByName[s.name] || s.avatar || null,
            isOnline: s.name in onlineByName,
        }));
    } else {
        targets = (users || []).filter(u => u && u.name).map(u => ({ ...u, isOnline: true }));
    }

    if (targets.length === 0) {
        svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#3a5070" font-size="13" dominant-baseline="middle">データがありません</text>';
        return;
    }

    // 名前ハッシュで再現性のある仮スタッツ生成（実データ未取得時）
    function nameHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }
    function pseudo(name, offset, min, max) {
        const v = ((nameHash(name + offset) % 1000) / 1000);
        return min + v * (max - min);
    }

    // player_stats があれば使用、なければ仮データ
    const stats = targets.map(u => {
        const ps = cache[u.name];
        return {
            name: u.name,
            avatar: u.avatar,
            isOnline: !!u.isOnline,
            profit:       ps ? ps.total_profit    : Math.round(pseudo(u.name, 'p', -50000, 100000)),
            avgDiversity: ps ? (ps.session_count > 0 ? ps.total_diversity / ps.session_count : 1) : pseudo(u.name, 'd', 1, 10),
            handCount:    ps ? ps.total_hands      : Math.round(pseudo(u.name, 'l', 0, 200)),
        };
    });

    // 相対スケール
    const maxDiv   = Math.max(...stats.map(s => s.avgDiversity), 1);
    const maxLikes = Math.max(...stats.map(s => s.handCount), 1);
    const maxProfit = Math.max(...stats.map(s => Math.abs(s.profit)), 1);
    const MIN_FONT = 10, MAX_FONT = 36;

    const W = svg.clientWidth  || 360;
    const H = svg.clientHeight || 380;
    const PAD = { top: 24, right: 20, bottom: 28, left: 36 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    // SVG クリア
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // グリッド
    for (let i = 0; i <= 4; i++) {
        const x = PAD.left + plotW * i / 4;
        const y = PAD.top  + plotH * i / 4;
        const vl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vl.setAttribute('x1', x); vl.setAttribute('y1', PAD.top);
        vl.setAttribute('x2', x); vl.setAttribute('y2', PAD.top + plotH);
        vl.setAttribute('stroke', '#1e2d40'); vl.setAttribute('stroke-width', '1');
        svg.appendChild(vl);
        const hl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hl.setAttribute('x1', PAD.left); hl.setAttribute('y1', y);
        hl.setAttribute('x2', PAD.left + plotW); hl.setAttribute('y2', y);
        hl.setAttribute('stroke', '#1e2d40'); hl.setAttribute('stroke-width', '1');
        svg.appendChild(hl);
    }

    // Y軸ラベル
    const yLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yLbl.setAttribute('x', 10); yLbl.setAttribute('y', PAD.top + plotH / 2);
    yLbl.setAttribute('text-anchor', 'middle'); yLbl.setAttribute('fill', '#2a3a50');
    yLbl.setAttribute('font-size', '9');
    yLbl.setAttribute('transform', `rotate(-90, 10, ${PAD.top + plotH / 2})`);
    yLbl.textContent = 'ハンド↑'; svg.appendChild(yLbl);

    // プレイヤー配置（重なり回避）
    const placed = [];
    function overlaps(nx, ny, nw, nh) {
        for (const b of placed) {
            if (nx < b.x + b.w && nx + nw > b.x && ny < b.y + b.h && ny + nh > b.y) return true;
        }
        return false;
    }
    function tryPlace(cx, cy, nw, nh) {
        const tries = [[0,0],[0,-nh],[0,nh],[-nw,0],[nw,0],[-nw,-nh],[nw,-nh],[-nw,nh],[nw,nh],[0,-nh*1.8],[0,nh*1.8]];
        for (const [dx, dy] of tries) {
            const tx = cx - nw / 2 + dx, ty = cy - nh / 2 + dy;
            if (!overlaps(tx, ty, nw, nh)) { placed.push({x:tx, y:ty, w:nw, h:nh}); return [tx + nw/2, ty + nh/2]; }
        }
        placed.push({x: cx - nw/2, y: cy - nh/2, w: nw, h: nh});
        return [cx, cy];
    }

    stats.forEach((s, idx) => {
        const relX = s.avgDiversity / maxDiv;
        const relY = s.handCount / maxLikes;
        const bx = PAD.left + relX * plotW;
        const by = PAD.top  + (1 - relY) * plotH;
        const absP = Math.abs(s.profit);
        const fs = MIN_FONT + (absP / maxProfit) * (MAX_FONT - MIN_FONT);
        const color = `hsl(${200 + relX * 40}, 80%, ${55 + relY * 20}%)`;
        const estW = s.name.length * fs * 0.62;
        const estH = fs * 1.2;
        const [px, py] = tryPlace(bx, by, estW, estH);

        // オフラインプレイヤーは少し透過させて、オンラインと区別
        const finalOpacity = s.isOnline ? 1 : 0.55;

        // ドット
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', bx); dot.setAttribute('cy', by);
        dot.setAttribute('r', 2.5); dot.setAttribute('fill', color);
        dot.setAttribute('opacity', s.isOnline ? '0.5' : '0.25');
        svg.appendChild(dot);

        // 引き線
        if (Math.abs(px - bx) > 4 || Math.abs(py - by) > 4) {
            const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            ln.setAttribute('x1', bx); ln.setAttribute('y1', by);
            ln.setAttribute('x2', px); ln.setAttribute('y2', py);
            ln.setAttribute('stroke', color); ln.setAttribute('stroke-width', '0.7');
            ln.setAttribute('opacity', s.isOnline ? '0.3' : '0.15');
            svg.appendChild(ln);
        }

        // テキスト
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', px); txt.setAttribute('y', py + fs * 0.35);
        txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', fs);
        txt.setAttribute('fill', color); txt.setAttribute('stroke', '#0d1420');
        txt.setAttribute('stroke-width', fs * 0.18);
        txt.setAttribute('font-weight', '700'); txt.setAttribute('cursor', 'pointer');
        txt.setAttribute('paint-order', 'stroke fill');
        txt.style.opacity = '0';
        txt.dataset.finalOpacity = String(finalOpacity);
        txt.textContent = s.name;

        // ツールチップ
        txt.addEventListener('mouseenter', e => {
            let tt = document.getElementById('pc-tooltip-el');
            if (!tt) { tt = document.createElement('div'); tt.id = 'pc-tooltip-el'; tt.className = 'pc-tooltip'; document.body.appendChild(tt); }
            const sign = s.profit >= 0 ? '+' : '';
            const onlineBadge = s.isOnline ? '<span class="pct-online">● オンライン</span>' : '<span class="pct-offline">○ オフライン</span>';
            tt.innerHTML = `<div class="pct-name">${escapeHtml(s.name)} ${onlineBadge}</div>
                <div class="pct-row"><span>収支</span><span class="pct-val">${sign}${s.profit.toLocaleString()}</span></div>
                <div class="pct-row"><span>ゲーム多様性</span><span class="pct-val">${s.avgDiversity.toFixed(1)}</span></div>
                <div class="pct-row"><span>ハンド数</span><span class="pct-val">${s.handCount}</span></div>`;
            tt.classList.add('show');
            tt.style.left = Math.min(e.clientX + 12, window.innerWidth - 180) + 'px';
            tt.style.top  = Math.min(e.clientY - 8,  window.innerHeight - 130) + 'px';
        });
        txt.addEventListener('mousemove', e => {
            const tt = document.getElementById('pc-tooltip-el');
            if (tt) { tt.style.left = Math.min(e.clientX + 12, window.innerWidth - 180) + 'px'; tt.style.top = Math.min(e.clientY - 8, window.innerHeight - 130) + 'px'; }
        });
        txt.addEventListener('mouseleave', () => {
            const tt = document.getElementById('pc-tooltip-el');
            if (tt) tt.classList.remove('show');
        });
        svg.appendChild(txt);
        setTimeout(() => { txt.style.transition = 'opacity 0.4s'; txt.style.opacity = txt.dataset.finalOpacity || '1'; }, idx * 40);
    });
}

// footprints / new_footprint: UI removed — handler no longer needed
// profile_data: UI removed — no handler needed

// player_stats: Player Cloud visualization data
client.on('player_stats', ({ stats }) => {
    if (!stats) return;
    // { [name]: { name, avatar, total_profit, session_count, total_diversity, total_hands } }
    window.playerStatsCache = Object.fromEntries(
        stats.map(s => [s.name, s])
    );
    // メイン画面のプレイヤークラウドを再描画。
    renderPlayerCloud(lastOnlineUsers || []);
});

// Init
setupActionRipple();
setupSidePanel();
