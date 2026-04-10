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
        this._setupResize();
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
        const felt = document.getElementById('table-felt');
        felt.classList.remove('felt-high', 'felt-low', 'felt-hilo', 'rail-draw', 'rail-stud', 'rail-community');
        felt.classList.add('felt-' + getGameCategory(s.gameId));
        felt.classList.add('rail-' + getGameType(s.gameId));

        // Top bar with game type + category badges
        const gameType = getGameType(s.gameId);
        const typeBadge = GAME_TYPE_LABELS[gameType];
        const catBadge = GAME_CATEGORY_LABELS[getGameCategory(s.gameId)];
        const gameNameEl = document.getElementById('game-name');
        const betBadge = BETTING_TYPE_LABELS[getBettingType(s.gameId)];
        gameNameEl.innerHTML = s.gameName
            + ` <span class="game-type-badge" style="background:${typeBadge.color}">${typeBadge.label}</span>`
            + ` <span class="game-type-badge" style="background:${catBadge.color};color:${catBadge.textColor};border:1px solid #555">${catBadge.label}</span>`
            + ` <span class="game-type-badge" style="background:${betBadge.color}">${betBadge.label}</span>`;
        document.getElementById('game-rotation').textContent =
            `${s.currentGameIndex + 1}/${s.totalGames} | ハンド ${s.handsInCurrentGame + 1}/${s.playerCount}`;
        document.getElementById('rules-content').textContent = s.gameRules || '';

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
        const betPosByClass = {
            'seat-bottom':       [50, 72],
            'seat-bottom-left':  [28, 68],
            'seat-top-left':     [28, 30],
            'seat-top':          [50, 20],
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
                chip.textContent = p.seatBet.toLocaleString();
                chip.style.left = pos[0] + '%';
                chip.style.top = pos[1] + '%';
                tableFelt.appendChild(chip);
            }
        });

        // Community cards
        const ccDiv = document.getElementById('community-cards');
        ccDiv.innerHTML = '';
        if (s.gameType === 'community' && s.communityCards) {
            for (const card of s.communityCards) {
                ccDiv.appendChild(this.createCardEl(card, false));
            }
        }

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

        // Name (clickable for stats — no avatar circle)
        const nameDiv = document.createElement('div');
        nameDiv.className = 'seat-name';
        nameDiv.style.cursor = 'pointer';
        nameDiv.textContent = p.name + (isMe ? ' (自分)' : '') + (!p.connected ? ' [離席]' : '');
        nameDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof showPlayerStats === 'function') showPlayerStats(p.name);
        });
        el.appendChild(nameDiv);

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
            totalCards = (p.downCount || 0) + (p.upCards ? p.upCards.length : 0);
            for (let d = 0; d < p.downCount; d++) {
                cardsDiv.appendChild(this.createCardEl(null, true));
            }
            if (p.upCards) {
                for (const card of p.upCards) {
                    cardsDiv.appendChild(this.createCardEl(card, false));
                }
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

        // Last action
        if (p.lastAction) {
            const actionDiv = document.createElement('div');
            actionDiv.className = 'seat-action-label';
            const names = { fold:'フォールド', check:'チェック', call:'コール', bet:'ベット', raise:'レイズ', allin:'オールイン' };
            actionDiv.textContent = names[p.lastAction] || p.lastAction;
            el.appendChild(actionDiv);
        }
    }

    renderPlayerHand(s) {
        const me = s.players[s.mySeatIndex];
        const container = document.getElementById('player-cards');
        container.innerHTML = '';
        if (!me || me.folded) return;

        let cards;
        if (s.gameType === 'stud') {
            cards = [...(me.downCards || []), ...(me.upCards || [])];
        } else {
            cards = me.hand || [];
        }
        if (cards.length === 0) return;

        for (let i = 0; i < cards.length; i++) {
            const cardEl = this.createCardEl(cards[i], false);
            cardEl.classList.add('card-selectable');

            if (this.selectedCards.has(i)) {
                cardEl.classList.add('card-selected');
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
        entry.className = 'log-entry' + (cls ? ` log-${cls}` : '');
        entry.textContent = msg;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
        while (log.children.length > 150) log.removeChild(log.firstChild);
    }
}
