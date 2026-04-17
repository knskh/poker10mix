// js/ui.js - UI Rendering (Multiplayer)

// Position label helper
function getPositionLabel(players, dealerSeat, targetIdx) {
    const seated = [];
    for (let i = 0; i < players.length; i++) {
        const si = (dealerSeat + i) % players.length;
        if (players[si].name) seated.push(si);
    }
    const n = seated.length;
    const posNames = {
        2: ['SB/BTN', 'BB'],  // Heads-up: dealer is SB and BTN
        3: ['BTN', 'SB', 'BB'],
        4: ['BTN', 'SB', 'BB', 'UTG'],
        5: ['BTN', 'SB', 'BB', 'HJ', 'CO'],
        6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
    };
    const labels = posNames[Math.min(n, 6)] || posNames[6];
    const orderIdx = seated.indexOf(targetIdx);
    return orderIdx >= 0 ? (labels[orderIdx] || '') : '';
}

// Card constants for client-side rendering
const RANK_DISPLAY = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
const SUIT_DISPLAY = { s:'\u2660', h:'\u2665', d:'\u2666', c:'\u2663' };

// Detailed hand description for display
function describeHand(gameId, gameType, playerCards, communityCards) {
    if (!playerCards || playerCards.length === 0) return '';

    const RNAME = { 1:'A', 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A' };

    try {
        const gc = GAME_LIST.find(g => g.id === gameId);
        if (!gc) return '';

        // Community games need enough cards to evaluate
        const board = communityCards || [];
        if (gc.type === 'community') {
            if (gc.exactHole && board.length < 3) return ''; // Omaha needs 3+ board
            if (!gc.exactHole && (playerCards.length + board.length) < 5) return ''; // Hold'em needs 5+ total
        }
        if (gc.type === 'stud' && playerCards.length < 5) return ''; // Stud needs 5+ cards

        const result = evaluateHand(gc, playerCards, board);
        const parts = [];

        if (result.high) {
            parts.push(describeEval(gameId, result.high, playerCards, communityCards));
        }
        if (result.low) {
            parts.push(describeLow(result.low));
        }
        return parts.filter(Boolean).join(' / ');
    } catch (e) {
        return '';
    }

    function describeEval(gid, ev, hole, board) {
        const cat = ev.value[0];

        // 2-7 lowball games
        if (gid === 'td' || gid === 'sd') {
            if (ev.isPenalty) return ev.name;
            const ranks = ev.value.slice(1);
            return ranks.map(r => RNAME[r]).join('-') + ' ロー';
        }

        // Badugi
        if (gid === 'badugi') {
            const ranks = ev.cards.map(c => c.rank === 14 ? 1 : c.rank).sort((a, b) => a - b);
            return ev.name + ' ' + ranks.map(r => RNAME[r]).join('-');
        }

        // Razz
        if (gid === 'razz') {
            if (ev.value[0] < 0) return ev.name; // pair fallback
            const ranks = ev.value;
            return ranks.map(r => RNAME[r]).join('-') + ' ロー';
        }

        // Standard high hands
        switch (cat) {
            case 9: { // straight flush
                const h = ev.value[1];
                if (h === 14) return 'ロイヤルフラッシュ';
                return 'ストレートフラッシュ ' + RNAME[h - 4] + '〜' + RNAME[h];
            }
            case 8: return 'フォーカード ' + RNAME[ev.value[1]];
            case 7: return 'フルハウス ' + RNAME[ev.value[1]] + '&' + RNAME[ev.value[2]];
            case 6: return 'フラッシュ ' + RNAME[ev.value[1]] + 'ハイ';
            case 5: {
                const h = ev.value[1];
                return 'ストレート ' + RNAME[h === 5 ? 1 : h - 4] + '〜' + RNAME[h];
            }
            case 4: return 'トリップス ' + RNAME[ev.value[1]];
            case 3: return 'ツーペア ' + RNAME[ev.value[1]] + '&' + RNAME[ev.value[2]];
            case 2: return 'ワンペア ' + RNAME[ev.value[1]];
            case 1: return 'ハイカード ' + RNAME[ev.value[1]];
            default: return ev.name || '';
        }
    }

    function describeLow(ev) {
        if (!ev) return '';
        const ranks = ev.value;
        return 'ロー ' + ranks.map(r => RNAME[r]).join('-');
    }
}

function getGameCategory(gameId) {
    const LOW_GAMES = ['td', 'sd', 'razz', 'badugi'];
    const HILO_GAMES = ['o8', 'stud8'];
    if (LOW_GAMES.includes(gameId)) return 'low';
    if (HILO_GAMES.includes(gameId)) return 'hilo';
    return 'high';
}

function getGameType(gameId) {
    const DRAW_GAMES = ['td', 'sd', 'badugi'];
    const STUD_GAMES = ['razz', 'stud', 'stud8'];
    if (DRAW_GAMES.includes(gameId)) return 'draw';
    if (STUD_GAMES.includes(gameId)) return 'stud';
    return 'community';
}

const GAME_TYPE_LABELS = {
    draw: { label: 'DRAW', color: '#42a5f5' },
    stud: { label: 'STUD', color: '#ef5350' },
    community: { label: 'HOLD\'EM', color: '#66bb6a' },
};

const GAME_CATEGORY_LABELS = {
    high: { label: 'HIGH', color: '#e0d8c8', textColor: '#333' },
    low: { label: 'LOW BALL', color: '#222', textColor: '#ccc' },
    hilo: { label: 'Hi-Lo', color: '#777', textColor: '#fff' },
};

function getBettingType(gameId) {
    const gc = GAME_LIST.find(g => g.id === gameId);
    return gc ? gc.betting : 'limit';
}

const BETTING_TYPE_LABELS = {
    'no-limit': { label: 'No-Limit', color: '#d32f2f' },
    'pot-limit': { label: 'Pot-Limit', color: '#f57c00' },
    'limit': { label: 'Limit', color: '#616161' },
};

class PokerUI {
    constructor() {
        this.selectedCards = new Set();
        this.pendingDraw = false;
        this._prevCCCount = 0; // previous community card count for deal animation
        this._prevMyCardCount = 0; // previous player card count
        this._prevFolded = {}; // track fold state per seat index
        this._cacheElements();
        this._setupResize();
    }

    // Cache frequently accessed DOM elements. Called once at construction.
    // Using getters keeps the lookup lazy and survives late-attached elements.
    _cacheElements() {
        this.$ = {
            tableFelt:      document.getElementById('table-felt'),
            potDisplay:     document.getElementById('pot-display'),
            tableInfo:      document.getElementById('table-info'),
            communityCards: document.getElementById('community-cards'),
            rulesContent:   document.getElementById('rules-content'),
            gameRotation:   document.getElementById('game-rotation'),
            tableContainer: document.getElementById('table-container'),
            tableArea:      document.getElementById('table-area'),
            seats:          [0, 1, 2, 3, 4, 5].map(i => document.getElementById('seat-' + i)),
        };
    }

    _setupResize() {
        const resize = () => this.scaleTable();
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', () => setTimeout(resize, 200));
        // Initial scale after DOM is ready
        setTimeout(resize, 100);
    }

    scaleTable() {
        const container = document.getElementById('table-container');
        const area = document.getElementById('table-area');
        if (!container || !area) return;
        const isMobile = window.innerWidth <= 600;
        const baseW = isMobile ? area.clientWidth : 780;
        const baseH = isMobile ? area.clientHeight : 514;
        const areaW = area.clientWidth;
        const areaH = area.clientHeight;
        if (isMobile) {
            // On mobile, CSS handles table size via vw, so scale minimally
            const scale = Math.min(areaW / baseW, areaH / baseH, 1.0);
            container.style.transform = `scale(${Math.max(scale, 0.45)})`;
        } else {
            const scale = Math.min(areaW / baseW, areaH / baseH, 1.15);
            container.style.transform = `scale(${Math.max(scale, 0.5)})`;
        }
    }

    // Render from server-provided state
    renderFromServer(s) {
        if (!s) return;

        // Table theme by game category (felt color) + game type (rail color)
        const felt = this.$.tableFelt || (this.$.tableFelt = document.getElementById('table-felt'));
        if (!felt) return;
        felt.classList.remove('felt-high', 'felt-low', 'felt-hilo', 'rail-draw', 'rail-stud', 'rail-community');
        felt.classList.add('felt-' + getGameCategory(s.gameId));
        felt.classList.add('rail-' + getGameType(s.gameId));
        // Heads-up layout: relax pot / community card positions to avoid seat-top overlap
        felt.classList.toggle('is-heads-up', s.players.length === 2);

        // Game name pill is removed from the layout — only the game-change-overlay
        // flash uses the game name (via `.gc-name` rendered separately).
        const rotationEl = document.getElementById('game-rotation');
        if (rotationEl) {
            rotationEl.textContent =
                `${s.currentGameIndex + 1}/${s.totalGames} | ハンド ${s.handsInCurrentGame + 1}/${s.playerCount}`;
        }
        const rulesEl = document.getElementById('rules-content');
        if (rulesEl) rulesEl.textContent = s.gameRules || '';

        // BB formatter helper
        const bb = s.bigBlind || 100;
        const fmtBB = n => {
            if (!n) return '0bb';
            const v = n / bb;
            return (Number.isInteger(v) ? v : parseFloat(v.toFixed(1))) + 'bb';
        };

        // Pot display
        const potEl = document.getElementById('pot-display');
        if (s.pot > 0) {
            potEl.innerHTML = `<span class="pot-label">Pot</span><span class="pot-amount">${s.pot.toLocaleString()}</span>`;
        } else {
            potEl.innerHTML = '';
        }

        // Current bet — hidden (removed from table center)
        const tableInfo = document.getElementById('table-info');
        if (tableInfo) tableInfo.innerHTML = '';

        // Blind info — removed from table display

        // Floating bet chips on table — placed on the table-side of each seat icon
        const tableFelt = document.getElementById('table-felt');
        tableFelt.querySelectorAll('.table-bet-chip').forEach(el => el.remove());
        // Positions: [left%, top%] within table-felt
        // Between seat edge and table center, shifted inward for clarity
        // Bet chip positions keyed by visual seat class
        const isMobile = window.innerWidth <= 600;
        const playerCount = s.players.length;
        const isHeadsUp = playerCount === 2;
        const betPosByClass = isMobile ? {
            // Heads-up: pot moves to 60% on mobile, so spread own/opponent chips further
            'seat-bottom':       isHeadsUp ? [50, 82] : [50, 68],
            'seat-bottom-left':  [30, 62],
            'seat-top-left':     [30, 36],
            // Heads-up mobile: push bet chip below the opponent seat (avoids overlap
            // with seat cards/avatar which occupy -32% … +11% range)
            'seat-top':          isHeadsUp ? [50, 32] : [50, 28],
            'seat-top-right':    [70, 36],
            'seat-bottom-right': [70, 62],
        } : {
            // Heads-up on desktop: pot at 58% → push chips further apart
            'seat-bottom':       isHeadsUp ? [50, 82] : [50, 72],
            'seat-bottom-left':  [28, 68],
            'seat-top-left':     [28, 30],
            'seat-top':          isHeadsUp ? [50, 12] : [50, 20],
            'seat-top-right':    [72, 30],
            'seat-bottom-right': [72, 68],
        };
        s.players.forEach((p, i) => {
            if (p.seatBet > 0) {
                const seatEl = document.getElementById(`seat-${i}`);
                const seatClass = [...seatEl.classList].find(c => c.startsWith('seat-') && c !== 'seat');
                const pos = betPosByClass[seatClass];
                if (!pos) return;
                const chip = document.createElement('div');
                chip.className = 'table-bet-chip';
                chip.innerHTML = `<span class="chip-icon"></span>${p.seatBet.toLocaleString()}`;
                chip.style.left = pos[0] + '%';
                chip.style.top = pos[1] + '%';
                tableFelt.appendChild(chip);
            }
        });

        // Community cards with deal animation
        const ccDiv = document.getElementById('community-cards');
        const prevCC = this._prevCCCount;
        const newCC = (s.gameType === 'community' && s.communityCards) ? s.communityCards.length : 0;
        ccDiv.innerHTML = '';
        if (s.gameType === 'community' && s.communityCards) {
            for (let ci = 0; ci < s.communityCards.length; ci++) {
                const cardEl = this.createCardEl(s.communityCards[ci], false);
                if (ci >= prevCC && newCC > prevCC) {
                    cardEl.classList.add('card-deal', `card-deal-${ci}`);
                }
                ccDiv.appendChild(cardEl);
            }
            // Show round name flash when new cards dealt
            if (newCC > prevCC && prevCC >= 0) {
                let roundName = '';
                if (newCC === 3 && prevCC === 0) roundName = 'FLOP';
                else if (newCC === 4 && prevCC === 3) roundName = 'TURN';
                else if (newCC === 5 && prevCC === 4) roundName = 'RIVER';
                if (roundName) {
                    const flash = document.createElement('div');
                    flash.className = 'round-flash';
                    flash.textContent = roundName;
                    const tableFelt = document.getElementById('table-felt');
                    tableFelt.appendChild(flash);
                    setTimeout(() => flash.remove(), 1300);
                }
            }
        }
        this._prevCCCount = newCC;

        // Seats - hide unused, show used
        for (let i = 0; i < 6; i++) {
            const el = document.getElementById(`seat-${i}`);
            if (i < s.players.length) {
                el.classList.remove('hidden');
                this.renderSeat(s, i);
            } else {
                el.classList.add('hidden');
            }
        }

        // Reposition seats dynamically
        this.positionSeats(s.players.length, s.mySeatIndex);

        // Player hand (my cards, large)
        this.renderPlayerHand(s);

        // Scale table to fit screen
        this.scaleTable();
    }

    positionSeats(count, mySeat) {
        // Place seats around the table, with "me" always at bottom
        const positions = [];
        for (let i = 0; i < count; i++) {
            // Rotate so that mySeat is at visual position 0 (bottom)
            const visualPos = (i - mySeat + count) % count;
            positions.push(visualPos);
        }

        const seatClasses = this.getSeatClassesForCount(count);

        for (let i = 0; i < count; i++) {
            const el = document.getElementById(`seat-${i}`);
            // Remove all seat-* position classes
            el.className = el.className.replace(/seat-(bottom|top|left|right|bottom-left|bottom-right|top-left|top-right)[^\s]*/g, '').trim();
            el.classList.add('seat');
            const visual = positions[i];
            el.classList.add(seatClasses[visual]);
        }
    }

    getSeatClassesForCount(n) {
        switch (n) {
            case 2: return ['seat-bottom', 'seat-top'];
            case 3: return ['seat-bottom', 'seat-top-left', 'seat-top-right'];
            case 4: return ['seat-bottom', 'seat-bottom-left', 'seat-top', 'seat-bottom-right'];
            case 5: return ['seat-bottom', 'seat-bottom-left', 'seat-top-left', 'seat-top-right', 'seat-bottom-right'];
            case 6: return ['seat-bottom', 'seat-bottom-left', 'seat-top-left', 'seat-top', 'seat-top-right', 'seat-bottom-right'];
            default: return ['seat-bottom', 'seat-bottom-left', 'seat-top-left', 'seat-top', 'seat-top-right', 'seat-bottom-right'];
        }
    }

    renderSeat(s, idx) {
        const p = s.players[idx];
        const el = document.getElementById(`seat-${idx}`);
        const isMe = idx === s.mySeatIndex;

        // Detect fold transition → play card fold-out animation
        const wasFolded = this._prevFolded[idx] || false;
        const justFolded = p.folded && !wasFolded;
        this._prevFolded[idx] = p.folded;

        if (justFolded) {
            this._playFoldAnimation(el);
        }

        el.innerHTML = '';

        if (p.folded) el.classList.add('folded');
        else el.classList.remove('folded');

        if (!p.connected) el.classList.add('disconnected');
        else el.classList.remove('disconnected');

        if (s.currentPlayer === idx) el.classList.add('active-turn');
        else el.classList.remove('active-turn');

        // BB formatter
        const bb = s.bigBlind || 100;
        const fmtBB = n => {
            const v = n / bb;
            return (Number.isInteger(v) ? v : parseFloat(v.toFixed(1))) + 'bb';
        };

        // Dealer button
        if (s.dealerSeat === idx) {
            const btn = document.createElement('div');
            btn.className = 'seat-dealer-btn';
            btn.textContent = 'D';
            el.appendChild(btn);
        }

        // Avatar
        if (p.avatar) {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'seat-avatar';
            avatarDiv.innerHTML = `<img src="avatars/${p.avatar}.svg" alt="">`;
            el.appendChild(avatarDiv);
        }

        // Name (clickable — shows enlarged hand popup)
        const nameDiv = document.createElement('div');
        nameDiv.className = 'seat-name';
        nameDiv.style.cursor = 'pointer';
        const noteIcon = (typeof hasPlayerNote === 'function' && hasPlayerNote(p.name)) ? ' 📝' : '';
        const statusTag = p.pendingRejoin ? ' [復帰待ち]' : (!p.connected ? ' [離席]' : '');
        nameDiv.textContent = p.name + (isMe ? ' (自分)' : '') + statusTag + noteIcon;
        if (p.pendingRejoin) nameDiv.classList.add('seat-name-rejoin');
        const playerData = p;
        const gameState = s;
        const seatIdx = idx;
        nameDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSeatPopup(playerData, gameState, seatIdx);
        });
        el.appendChild(nameDiv);

        // Sitout countdown badge or pending rejoin badge (visible to all players)
        if (p.pendingRejoin) {
            const badge = document.createElement('div');
            badge.className = 'sitout-timer-badge sitout-timer-rejoin';
            badge.textContent = '✓ 復帰';
            el.appendChild(badge);
        } else if (p.sitout && p.sitoutRemaining != null) {
            const badge = document.createElement('div');
            badge.className = 'sitout-timer-badge' + (p.sitoutRemaining <= 120 ? ' sitout-timer-urgent' : '');
            const m = Math.floor(p.sitoutRemaining / 60);
            const sec = p.sitoutRemaining % 60;
            badge.textContent = `⏱ ${m}:${String(sec).padStart(2, '0')}`;
            el.appendChild(badge);
        }

        // Position badge + chips on one row
        const infoRow = document.createElement('div');
        infoRow.className = 'seat-info-row';

        if (s.gameType !== 'stud') {
            const pos = getPositionLabel(s.players, s.dealerSeat, idx);
            if (pos) {
                const badge = document.createElement('span');
                const cssPos = pos.replace('/', '').toLowerCase(); // 'SB/BTN' → 'sbtn'
                badge.className = `pos-badge pos-${cssPos}`;
                badge.textContent = pos;
                infoRow.appendChild(badge);
            }
        }

        const chipsSpan = document.createElement('span');
        chipsSpan.className = 'seat-chips';
        chipsSpan.textContent = p.chips.toLocaleString();
        infoRow.appendChild(chipsSpan);
        el.appendChild(infoRow);

        // Cards in seat (mini) — sized by card count
        let totalCards = 0;
        if (s.gameType === 'stud' && !p.folded) {
            const cardsDiv = document.createElement('div');
            cardsDiv.className = 'seat-cards';
            const dc = p.downCount || 0;
            const uc = p.upCards ? p.upCards.length : 0;
            totalCards = dc + uc;
            // Stud card order: down[0], down[1], up[0..n], down[2](7th)
            const initialDown = Math.min(dc, 2);
            const seventhDown = dc > 2 ? 1 : 0;
            let ci = 0;
            // First 2 down cards (face down)
            for (let d = 0; d < initialDown; d++) {
                const cel = this.createCardEl(null, true);
                if (totalCards >= 3) {
                    const info = this.studStreetInfo(dc, uc, ci);
                    cel.style.borderColor = info.color;
                    cel.style.borderWidth = '2px';
                    cel.style.borderStyle = 'solid';
                }
                cardsDiv.appendChild(cel);
                ci++;
            }
            // Up cards (face up)
            if (p.upCards) {
                for (const card of p.upCards) {
                    const cel = this.createCardEl(card, false);
                    if (totalCards >= 3) {
                        const info = this.studStreetInfo(dc, uc, ci);
                        cel.style.borderColor = info.color;
                        cel.style.borderWidth = '2px';
                        cel.style.borderStyle = 'solid';
                    }
                    cardsDiv.appendChild(cel);
                    ci++;
                }
            }
            // 7th street down card (face down, last)
            if (seventhDown > 0) {
                const cel = this.createCardEl(null, true);
                if (totalCards >= 3) {
                    const info = this.studStreetInfo(dc, uc, ci);
                    cel.style.borderColor = info.color;
                    cel.style.borderWidth = '2px';
                    cel.style.borderStyle = 'solid';
                }
                cardsDiv.appendChild(cel);
                ci++;
            }
            cardsDiv.classList.add(`seat-cards-${Math.min(totalCards, 7)}`);
            el.appendChild(cardsDiv);
        } else if (!isMe && !p.folded && p.cardCount > 0) {
            const cardsDiv = document.createElement('div');
            cardsDiv.className = 'seat-cards';
            totalCards = p.cardCount;
            if (s.isShowdown && p.hand && p.hand.length > 0) {
                for (const card of p.hand) {
                    cardsDiv.appendChild(this.createCardEl(card, false));
                }
            } else {
                for (let c = 0; c < p.cardCount; c++) {
                    cardsDiv.appendChild(this.createCardEl(null, true));
                }
            }
            cardsDiv.classList.add(`seat-cards-${Math.min(totalCards, 7)}`);
            el.appendChild(cardsDiv);
        }

        // Showdown hand rank label
        if (s.isShowdown && !p.folded) {
            let sdCards;
            if (s.gameType === 'stud') {
                sdCards = [...(p.downCards || []), ...(p.upCards || [])];
            } else {
                sdCards = p.hand || [];
            }
            if (sdCards.length >= 2) {
                const desc = describeHand(s.gameId, s.gameType, sdCards, s.communityCards || []);
                if (desc) {
                    const isWinner = typeof lastHandResult !== 'undefined' && lastHandResult && lastHandResult.players
                        ? lastHandResult.players.some(lp => lp.name === p.name && lp.chips - lp.startChips > 0)
                        : false;
                    const rankDiv = document.createElement('div');
                    rankDiv.className = 'seat-hand-rank ' + (isWinner ? 'rank-winner' : 'rank-loser');
                    rankDiv.textContent = desc;
                    el.appendChild(rankDiv);
                }
            }
        }

        // Last action
        if (p.lastAction && !s.isShowdown) {
            const actionDiv = document.createElement('div');
            const actionClass = { fold:'action-fold', check:'action-check', call:'action-call', bet:'action-bet', raise:'action-raise', allin:'action-allin' };
            actionDiv.className = 'seat-action-label' + (actionClass[p.lastAction] ? ' ' + actionClass[p.lastAction] : '');
            const names = { fold:'フォールド', check:'チェック', call:'コール', bet:'ベット', raise:'レイズ', allin:'オールイン' };
            actionDiv.textContent = names[p.lastAction] || p.lastAction;
            el.appendChild(actionDiv);
        }

        // Bubble timer on active player's seat
        if (s.currentPlayer === idx && s.turnRemaining != null && s.turnTimeLimit) {
            const remaining = s.turnRemaining;
            const total = s.turnTimeLimit;
            this._startBubbleTimer(el, remaining, total);
        } else {
            this._clearBubbleTimer(el);
        }
    }

    _startBubbleTimer(el, remaining, total) {
        this._clearBubbleTimer(el);

        // Create wrapper with 4 bubbles
        const wrap = document.createElement('div');
        wrap.className = 'bubble-timer-wrap';
        for (let i = 0; i < 4; i++) {
            const dot = document.createElement('div');
            dot.className = 'bubble-dot';
            wrap.appendChild(dot);
        }
        el.appendChild(wrap);

        const interval = total / 4; // pop one every 1/4 of total
        const dots = Array.from(wrap.querySelectorAll('.bubble-dot'));

        // Pop already-expired bubbles immediately (no animation)
        const alreadyElapsed = total - remaining;
        const alreadyPopped = Math.min(3, Math.floor(alreadyElapsed / interval));
        for (let i = 0; i < alreadyPopped; i++) {
            dots[i].style.transition = 'none';
            dots[i].style.opacity = '0';
            dots[i].style.transform = 'scale(0)';
            dots[i].classList.add('bubble-pop');
        }

        const startTime = Date.now();
        const criticalThreshold = 5; // seconds

        el._bubbleInterval = setInterval(() => {
            const elapsedSec = (Date.now() - startTime) / 1000;
            const left = Math.max(0, remaining - elapsedSec);
            const totalElapsed = total - left;

            // Pop bubbles at 1/4 intervals (keep last one until time-up)
            const shouldPop = Math.min(3, Math.floor(totalElapsed / interval));
            for (let i = 0; i < shouldPop; i++) {
                if (!dots[i].classList.contains('bubble-pop')) {
                    dots[i].classList.add('bubble-pop');
                }
            }

            // Critical phase: last bubble warning
            if (left <= criticalThreshold && left > 0) {
                wrap.classList.add('bubble-critical');
                dots.forEach(d => {
                    if (!d.classList.contains('bubble-pop')) d.classList.add('bubble-warn');
                });
            }

            // Time up: pop the last bubble
            if (left <= 0) {
                dots.forEach(d => {
                    if (!d.classList.contains('bubble-pop')) d.classList.add('bubble-pop');
                });
                el.classList.add('seat-timed-out');
                clearInterval(el._bubbleInterval);
                el._bubbleInterval = null;
            }
        }, 250);
    }

    _clearBubbleTimer(el) {
        if (el._bubbleInterval) {
            clearInterval(el._bubbleInterval);
            el._bubbleInterval = null;
        }
        const wrap = el.querySelector('.bubble-timer-wrap');
        if (wrap) wrap.remove();
        el.classList.remove('seat-timed-out');
    }

    _playFoldAnimation(seatEl) {
        // Capture existing card elements before innerHTML is cleared
        const cards = seatEl.querySelectorAll('.seat-cards .card');
        if (cards.length === 0) return;

        // Get seat position for animation direction
        const seatRect = seatEl.getBoundingClientRect();
        const tableFelt = document.getElementById('table-felt');
        if (!tableFelt) return;
        const feltRect = tableFelt.getBoundingClientRect();
        const feltCenterX = feltRect.left + feltRect.width / 2;

        // Direction: slide towards center then fade
        const slideX = seatRect.left < feltCenterX ? 30 : -30;

        // Create floating clones of the cards
        cards.forEach((card, i) => {
            const clone = card.cloneNode(true);
            clone.className = 'card card-fold-out';
            const cardRect = card.getBoundingClientRect();
            clone.style.position = 'fixed';
            clone.style.left = cardRect.left + 'px';
            clone.style.top = cardRect.top + 'px';
            clone.style.width = cardRect.width + 'px';
            clone.style.height = cardRect.height + 'px';
            clone.style.zIndex = '150';
            clone.style.animationDelay = (i * 0.06) + 's';
            clone.style.setProperty('--fold-slide-x', slideX + 'px');
            document.body.appendChild(clone);
            setTimeout(() => clone.remove(), 600 + i * 60);
        });
    }

    showSeatPopup(p, s, idx) {
        // Remove existing popup
        const existing = document.getElementById('seat-popup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = 'seat-popup';
        popup.className = 'seat-popup-overlay';

        const inner = document.createElement('div');
        inner.className = 'seat-popup-inner';

        // Player name header
        const header = document.createElement('div');
        header.className = 'seat-popup-header';
        header.textContent = p.name;
        inner.appendChild(header);

        // Enlarged cards
        const cardsDiv = document.createElement('div');
        cardsDiv.className = 'seat-popup-cards';

        let hasCards = false;
        if (s.gameType === 'stud' && !p.folded) {
            const dc = p.downCount || 0;
            const uc = p.upCards ? p.upCards.length : 0;
            const total = dc + uc;
            const initialDown = Math.min(dc, 2);
            const seventhDown = dc > 2 ? 1 : 0;
            let ci = 0;
            // First 2 down cards
            for (let d = 0; d < initialDown; d++) {
                const cel = this.createCardEl(null, true);
                if (total >= 3) {
                    const info = this.studStreetInfo(dc, uc, ci);
                    this.applyStudStreetStyle(cel, info, true);
                }
                cardsDiv.appendChild(cel);
                hasCards = true;
                ci++;
            }
            // Up cards
            if (p.upCards) {
                for (const card of p.upCards) {
                    const cel = this.createCardEl(card, false);
                    if (total >= 3) {
                        const info = this.studStreetInfo(dc, uc, ci);
                        this.applyStudStreetStyle(cel, info, true);
                    }
                    cardsDiv.appendChild(cel);
                    hasCards = true;
                    ci++;
                }
            }
            // 7th street down card (last)
            if (seventhDown > 0) {
                const cel = this.createCardEl(null, true);
                if (total >= 3) {
                    const info = this.studStreetInfo(dc, uc, ci);
                    this.applyStudStreetStyle(cel, info, true);
                }
                cardsDiv.appendChild(cel);
                hasCards = true;
                ci++;
            }
        } else if (!p.folded && p.cardCount > 0) {
            if (s.isShowdown && p.hand && p.hand.length > 0) {
                for (const card of p.hand) {
                    cardsDiv.appendChild(this.createCardEl(card, false));
                    hasCards = true;
                }
            } else if (idx === s.mySeatIndex) {
                const me = s.players[s.mySeatIndex];
                const myCards = s.gameType === 'stud'
                    ? [...(me.downCards || []).slice(0, 2), ...(me.upCards || []), ...(me.downCards || []).slice(2)]
                    : (me.hand || []);
                for (const card of myCards) {
                    cardsDiv.appendChild(this.createCardEl(card, false));
                    hasCards = true;
                }
            } else {
                for (let c = 0; c < p.cardCount; c++) {
                    cardsDiv.appendChild(this.createCardEl(null, true));
                    hasCards = true;
                }
            }
        }

        if (hasCards) {
            inner.appendChild(cardsDiv);
        } else if (p.folded) {
            const foldMsg = document.createElement('div');
            foldMsg.className = 'seat-popup-fold';
            foldMsg.textContent = 'フォールド済み';
            inner.appendChild(foldMsg);
        }

        // Info line (position + chips)
        const info = document.createElement('div');
        info.className = 'seat-popup-info';
        info.textContent = `${p.chips.toLocaleString()} chips`;
        inner.appendChild(info);

        // Player note section
        const noteSection = document.createElement('div');
        noteSection.className = 'seat-popup-note-section';
        const existingNote = typeof getPlayerNote === 'function' ? getPlayerNote(p.name) : '';
        const noteInput = document.createElement('textarea');
        noteInput.className = 'seat-popup-note-input';
        noteInput.placeholder = 'メモを入力...';
        noteInput.value = existingNote;
        noteInput.maxLength = 200;
        noteInput.rows = 2;
        noteInput.addEventListener('click', (e) => e.stopPropagation());
        noteSection.appendChild(noteInput);
        const noteBtnRow = document.createElement('div');
        noteBtnRow.className = 'seat-popup-note-btns';
        const saveNoteBtn = document.createElement('button');
        saveNoteBtn.className = 'btn-small seat-popup-note-save';
        saveNoteBtn.textContent = '📝 保存';
        saveNoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof setPlayerNote === 'function') setPlayerNote(p.name, noteInput.value);
            saveNoteBtn.textContent = '✓ 保存済';
            setTimeout(() => { saveNoteBtn.textContent = '📝 保存'; }, 1200);
        });
        noteBtnRow.appendChild(saveNoteBtn);
        if (existingNote) {
            const delNoteBtn = document.createElement('button');
            delNoteBtn.className = 'btn-small seat-popup-note-del';
            delNoteBtn.textContent = '削除';
            delNoteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                noteInput.value = '';
                if (typeof setPlayerNote === 'function') setPlayerNote(p.name, '');
                delNoteBtn.remove();
            });
            noteBtnRow.appendChild(delNoteBtn);
        }
        noteSection.appendChild(noteBtnRow);
        inner.appendChild(noteSection);

        // Stats button
        const statsBtn = document.createElement('button');
        statsBtn.className = 'btn-small seat-popup-stats-btn';
        statsBtn.textContent = 'Stats';
        statsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.remove();
            if (typeof showPlayerStats === 'function') showPlayerStats(p.name);
        });
        inner.appendChild(statsBtn);

        popup.appendChild(inner);

        // Close on overlay click
        popup.addEventListener('click', (e) => {
            if (e.target === popup) popup.remove();
        });

        document.getElementById('game-screen').appendChild(popup);
    }

    // Stud street info: returns { street, color, label } for card at index i
    studStreetInfo(downCount, upCount, cardIndex) {
        // Card order: down[0], down[1], up[0](3rd), up[1](4th), up[2](5th), up[3](6th), down[2](7th)
        const total = downCount + upCount;
        const STREETS = [
            { street: '3rd', color: '#999', label: '3rd' },
            { street: '4th', color: '#67e8f9', label: '4th' },
            { street: '5th', color: '#fbbf24', label: '5th' },
            { street: '6th', color: '#f472b6', label: '6th' },
            { street: '7th', color: '#4ade80', label: '7th' },
        ];
        if (total <= 3 || cardIndex < 3) return STREETS[0]; // 3rd street (initial 3 cards)
        // Cards 3-6 map to 4th-7th
        if (cardIndex < 7) return STREETS[cardIndex - 2];
        return STREETS[0];
    }

    applyStudStreetStyle(cardEl, streetInfo, showLabel) {
        cardEl.style.borderColor = streetInfo.color;
        cardEl.style.borderWidth = '2px';
        cardEl.style.borderStyle = 'solid';
        if (showLabel && streetInfo.street !== '3rd') {
            const lbl = document.createElement('div');
            lbl.className = 'stud-street-label';
            lbl.style.color = streetInfo.color;
            lbl.textContent = streetInfo.label;
            cardEl.style.position = 'relative';
            cardEl.appendChild(lbl);
        }
    }

    renderPlayerHand(s) {
        const me = s.players[s.mySeatIndex];
        const container = document.getElementById('player-cards');
        container.innerHTML = '';
        if (!me || me.folded) return;

        let cards;
        if (s.gameType === 'stud') {
            // Stud order: down[0], down[1], up[0..n], down[2](7th)
            const dc = me.downCards || [];
            const uc = me.upCards || [];
            cards = [...dc.slice(0, 2), ...uc, ...dc.slice(2)];
        } else {
            cards = me.hand || [];
        }
        if (cards.length === 0) return;

        const downCount = (me.downCards || []).length;
        const upCount = (me.upCards || []).length;

        const prevMyCount = this._prevMyCardCount;
        for (let i = 0; i < cards.length; i++) {
            const cardEl = this.createCardEl(cards[i], false);
            cardEl.classList.add('card-selectable');

            // Slide-in animation for newly dealt cards
            if (i >= prevMyCount && cards.length > prevMyCount) {
                cardEl.classList.add('card-slide-in');
                cardEl.style.animationDelay = (i * 0.08) + 's';
            }

            if (this.selectedCards.has(i)) {
                cardEl.classList.add('card-selected');
            }

            // Stud street styling
            if (s.gameType === 'stud' && cards.length >= 3) {
                const info = this.studStreetInfo(downCount, upCount, i);
                this.applyStudStreetStyle(cardEl, info, true);
                // Add gap before 4th street card
                if (i === 3) cardEl.style.marginLeft = '6px';
            }

            // Draw selection
            if (s.gameType === 'draw' && this.pendingDraw) {
                cardEl.addEventListener('click', () => {
                    if (this.selectedCards.has(i)) this.selectedCards.delete(i);
                    else this.selectedCards.add(i);
                    this.renderPlayerHand(s);
                });
            }
            container.appendChild(cardEl);
        }

        // Stud labels
        if (s.gameType === 'stud' && me.downCards && me.downCards.length > 0) {
            const label = document.createElement('div');
            label.style.cssText = 'font-size:10px;color:#888;margin-top:2px;text-align:center;width:100%;';
            label.textContent = `(裏${me.downCards.length}枚 / 表${(me.upCards || []).length}枚)`;
            container.appendChild(label);
        }

        // Hand rank display
        if (cards.length >= 2) {
            const desc = describeHand(s.gameId, s.gameType, cards, s.communityCards || []);
            if (desc) {
                const rankLabel = document.createElement('div');
                rankLabel.className = 'hand-rank-label';
                rankLabel.textContent = desc;
                container.appendChild(rankLabel);
            }
        }
        this._prevMyCardCount = cards.length;
    }

    createCardEl(card, faceDown) {
        const el = document.createElement('div');
        if (faceDown || !card) {
            el.className = 'card card-back';
            return el;
        }
        el.className = `card card-face suit-${card.suit}`;
        const rankSpan = document.createElement('span');
        rankSpan.className = 'card-rank';
        rankSpan.textContent = RANK_DISPLAY[card.rank] || card.rank;
        const suitSpan = document.createElement('span');
        suitSpan.className = 'card-suit';
        suitSpan.textContent = SUIT_DISPLAY[card.suit] || card.suit;
        el.appendChild(rankSpan);
        el.appendChild(suitSpan);
        return el;
    }

    addLog(msg, cls) {
        const log = document.getElementById('game-log');
        if (!log) return;
        const entry = document.createElement('div');
        let classes = 'log-entry';
        if (cls) classes += ` log-${cls}`;
        // Auto-detect action type for color coding
        if (!cls || cls === '') {
            if (/フォールド/.test(msg)) classes += ' log-act-fold';
            else if (/オールイン/.test(msg)) classes += ' log-act-allin';
            else if (/レイズ|ベット/.test(msg)) classes += ' log-act-raise';
            else if (/コール/.test(msg)) classes += ' log-act-call';
            else if (/チェック/.test(msg)) classes += ' log-act-check';
        }
        // Highlight own actions
        if (typeof client !== 'undefined' && client.name && msg.includes(client.name)) {
            classes += ' log-self';
        }
        entry.className = classes;
        entry.textContent = msg;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
        while (log.children.length > 150) log.removeChild(log.firstChild);
    }
}
