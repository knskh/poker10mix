// js/game.js - Game Engine


const GAME_LIST = [
    {
        id: 'td', name: '2-7 トリプルドロー', shortName: 'TD',
        type: 'draw', betting: 'limit', drawCount: 3, handSize: 5, lowType: '27',
        smallBet: 400, bigBet: 800, smallBlind: 200, bigBlind: 400,
        rules: 'ルール：5枚のカードが配られ、3回の交換機会があります。\n2-7ローボール：最も弱い役が勝ち。\nエースはハイ、ストレート・フラッシュは役として数えます。\n最強ハンド：7-5-4-3-2（スートばらばら）'
    },
    {
        id: 'lhe', name: 'リミットホールデム', shortName: 'LHE',
        type: 'community', betting: 'limit', holeCards: 2, exactHole: false, hasLow: false,
        smallBet: 400, bigBet: 800, smallBlind: 200, bigBlind: 400,
        rules: 'ルール：2枚のホールカード＋5枚のコミュニティカード。\nベスト5枚の組み合わせで勝負。\nリミットベッティング（固定額）。'
    },
    {
        id: 'o8', name: 'オマハ Hi-Lo', shortName: 'O8',
        type: 'community', betting: 'limit', holeCards: 4, exactHole: true, hasLow: true, lowQualifier: 8,
        smallBet: 400, bigBet: 800, smallBlind: 200, bigBlind: 400,
        rules: 'ルール：4枚のホールカードから必ず2枚＋ボード3枚で役を作る。\nハイとロー（8以下で構成）でポットを分割。\nロー該当なしの場合はハイが総取り。'
    },
    {
        id: 'razz', name: 'ラズ', shortName: 'Razz',
        type: 'stud', betting: 'limit', hasLow: false, lowOnly: true,
        smallBet: 400, bigBet: 800, ante: 60, bringIn: 100,
        rules: 'ルール：7カードスタッドのローボール版。\n最も弱いハンドが勝ち（A-5ロー）。\nエースはロー。ストレート・フラッシュは無視。\n最強ハンド：A-2-3-4-5'
    },
    {
        id: 'stud', name: 'セブンカードスタッド', shortName: 'Stud',
        type: 'stud', betting: 'limit', hasLow: false,
        smallBet: 400, bigBet: 800, ante: 60, bringIn: 100,
        rules: 'ルール：7枚のカード（3枚裏＋4枚表）でベスト5枚。\n3rd Streetで最低カードがブリングイン。\n通常のハイハンドで勝負。'
    },
    {
        id: 'stud8', name: 'スタッド Hi-Lo', shortName: 'Stud8',
        type: 'stud', betting: 'limit', hasLow: true, lowQualifier: 8,
        smallBet: 400, bigBet: 800, ante: 60, bringIn: 100,
        rules: 'ルール：7カードスタッドのHi-Lo版。\nハイとロー（8以下）でポット分割。\nロー該当なしならハイ総取り。'
    },
    {
        id: 'nlhe', name: 'NLホールデム', shortName: 'NLHE',
        type: 'community', betting: 'no-limit', holeCards: 2, exactHole: false, hasLow: false,
        smallBet: 100, bigBet: 100, smallBlind: 50, bigBlind: 100,
        rules: 'ルール：2枚のホールカード＋5枚のコミュニティカード。\nベスト5枚で勝負。\nノーリミット（全額ベット可能）。'
    },
    {
        id: 'plo', name: 'PLオマハ', shortName: 'PLO',
        type: 'community', betting: 'pot-limit', holeCards: 4, exactHole: true, hasLow: false,
        smallBet: 100, bigBet: 100, smallBlind: 50, bigBlind: 100,
        rules: 'ルール：4枚のホールカードから必ず2枚使用。\nボード3枚と合わせてベスト5枚。\nポットリミット（ポット額までベット可能）。'
    },
    {
        id: 'sd', name: '2-7 シングルドロー', shortName: 'SD',
        type: 'draw', betting: 'no-limit', drawCount: 1, handSize: 5, lowType: '27',
        smallBet: 100, bigBet: 100, smallBlind: 50, bigBlind: 100,
        rules: 'ルール：5枚配られ、1回だけ交換可能。\n2-7ローボール。ノーリミット。\n最強ハンド：7-5-4-3-2（スートばらばら）'
    },
    {
        id: 'badugi', name: 'バドゥーギ', shortName: 'Badugi',
        type: 'draw', betting: 'limit', drawCount: 3, handSize: 4, lowType: 'badugi',
        smallBet: 400, bigBet: 800, smallBlind: 200, bigBlind: 400,
        rules: 'ルール：4枚配られ、3回交換可能。\n4枚すべてスート・ランクが異なれば「バドゥーギ」。\nバドゥーギ同士ではローカードが勝ち。\nバドゥーギなしなら最多ユニーク枚数で比較。'
    },
];

const PLAYER_NAMES = ['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6'];

class GameState {
    constructor(playerNames, startingChips) {
        const names = playerNames || PLAYER_NAMES;
        const chips = startingChips || 10000;
        this.playerCount = names.length;
        this.players = names.map((name, i) => ({
            id: i,
            name,
            chips: chips,
            isHuman: true,
            connected: true,
            hand: [],
            folded: false,
            allIn: false,
            currentBet: 0,
            seatBet: 0,
            upCards: [],
            downCards: [],
            lastAction: '',
        }));
        this.currentGameIndex = 0;
        this.dealerSeat = 0;
        this.handsInCurrentGame = 0;
        this.deck = new Deck();
        this.pot = 0;
        this.sidePots = [];
        this.communityCards = [];
        this.currentPlayerIndex = -1;
        this.currentBet = 0;
        this.minRaise = 0;
        this.lastRaiser = -1;
        this.roundBets = 0;
        this.gameOver = false;
        this.isShowdown = false;
        this.fastFold = false;
        this.fastFoldActive = false;

        // Callbacks
        this.onUpdate = null;
        this.onGetPlayerAction = null;  // (actions, player) => Promise<action>
        this.onGetPlayerDraw = null;    // (player) => Promise<discardIndices>
        this.onLog = null;

        // Stats hooks
        this.onHandStart = null;
        this.onFirstRoundEnd = null;
        this.onPlayerAction = null;
        this.onShowdown = null;
        this.onHandEnd = null;

        // Filtered games
        this.filteredGames = GAME_LIST;
    }

    get gameConfig() {
        return this.filteredGames[this.currentGameIndex % this.filteredGames.length];
    }

    get activePlayers() {
        return this.players.filter(p => !p.folded && p.chips > 0);
    }

    get playersInHand() {
        return this.players.filter(p => !p.folded);
    }

    log(msg, cls) {
        if (this.fastFoldActive) return; // suppress logs during fast-forward
        if (this.onLog) this.onLog(msg, cls);
    }

    update() {
        if (this.fastFoldActive) return; // suppress UI updates during fast-forward
        if (this.onUpdate) this.onUpdate();
    }

    nextDealer() {
        const n = this.playerCount;
        do {
            this.dealerSeat = (this.dealerSeat + 1) % n;
        } while (this.players[this.dealerSeat].chips <= 0);
    }

    getNextActivePlayer(from) {
        const n = this.playerCount;
        let idx = (from + 1) % n;
        let safety = 0;
        while (safety++ < n) {
            const p = this.players[idx];
            if (!p.folded && !p.allIn && p.chips > 0) return idx;
            idx = (idx + 1) % n;
        }
        return -1;
    }

    // ==========================================
    // Main Hand Loop
    // ==========================================

    async playHand() {
        this.resetHand();
        this.fastFoldActive = false;
        this._hadShowdown = false;
        this.isShowdown = false;
        const gc = this.gameConfig;

        this.log(`--- ${gc.name} ---`, 'important');
        this.log(`ディーラー: ${this.players[this.dealerSeat].name}`);
        this.update();

        if (this.onHandStart) this.onHandStart();

        if (gc.type === 'community') {
            await this.playCommunityHand();
        } else if (gc.type === 'stud') {
            await this.playStudHand();
        } else if (gc.type === 'draw') {
            await this.playDrawHand();
        }

        // Stats: end of hand
        if (this.onHandEnd) this.onHandEnd(this._hadShowdown);

        // After hand ends, force a UI update so player sees the result
        this.fastFoldActive = false;
        if (this.onUpdate) this.onUpdate();

        // Advance
        this.handsInCurrentGame++;
        this.nextDealer();

        // Check game rotation (every orbit = playerCount hands)
        if (this.handsInCurrentGame >= this.playerCount) {
            this.handsInCurrentGame = 0;
            this.currentGameIndex = (this.currentGameIndex + 1) % this.filteredGames.length;
            this.log(`ゲームチェンジ → ${this.gameConfig.name}`, 'important');
        }

        // Check if game is over (only 1 player with chips)
        const alive = this.players.filter(p => p.chips > 0);
        if (alive.length <= 1) {
            this.gameOver = true;
            this.log(`${alive[0].name} が優勝！`, 'important');
        }

        this.update();
    }

    resetHand() {
        this.deck.reset();
        this.pot = 0;
        this.sidePots = [];
        this.communityCards = [];
        this.currentBet = 0;
        this.minRaise = 0;
        this.lastRaiser = -1;
        this.roundBets = 0;

        for (const p of this.players) {
            p.hand = [];
            p.folded = p.chips <= 0;
            p.allIn = false;
            p.currentBet = 0;
            p.seatBet = 0;
            p.upCards = [];
            p.downCards = [];
            p.lastAction = '';
        }
    }

    // ==========================================
    // Community Card Games (Hold'em, Omaha)
    // ==========================================

    async playCommunityHand() {
        const gc = this.gameConfig;

        // Post blinds
        await this.postBlinds();

        // Deal hole cards
        for (const p of this.players) {
            if (!p.folded) {
                p.hand = this.deck.deal(gc.holeCards);
            }
        }
        this.update();

        // Preflop betting
        const preflopStart = this.getNextActivePlayer(this.getBigBlindSeat());
        if (await this.bettingRound(preflopStart, true)) return;

        if (this.onFirstRoundEnd) this.onFirstRoundEnd();

        // Flop
        this.communityCards.push(...this.deck.deal(3));
        this.log('--- フロップ ---', 'action');
        this.update();
        await this.delay(500);

        const postFlopStart = this.getNextActivePlayer(this.dealerSeat);
        this.resetRoundBets();
        if (await this.bettingRound(postFlopStart, false, gc.betting === 'limit' ? gc.smallBet : null)) return;

        // Turn
        this.communityCards.push(this.deck.deal());
        this.log('--- ターン ---', 'action');
        this.update();
        await this.delay(500);

        this.resetRoundBets();
        if (await this.bettingRound(postFlopStart, false, gc.betting === 'limit' ? gc.bigBet : null)) return;

        // River
        this.communityCards.push(this.deck.deal());
        this.log('--- リバー ---', 'action');
        this.update();
        await this.delay(500);

        this.resetRoundBets();
        if (await this.bettingRound(postFlopStart, false, gc.betting === 'limit' ? gc.bigBet : null)) return;

        // Showdown
        await this.showdown();
    }

    // ==========================================
    // Stud Games (Stud, Razz, Stud8)
    // ==========================================

    async playStudHand() {
        const gc = this.gameConfig;

        // Antes
        for (const p of this.players) {
            if (!p.folded) {
                const ante = Math.min(gc.ante, p.chips);
                p.chips -= ante;
                this.pot += ante;
            }
        }
        this.log(`アンティ: ${gc.ante}`);

        // 3rd Street: 2 down + 1 up
        for (const p of this.players) {
            if (!p.folded) {
                p.downCards = this.deck.deal(2);
                p.upCards = [this.deck.deal()];
                p.hand = [...p.downCards, ...p.upCards];
            }
        }
        this.update();

        // Bring-in
        const bringInPlayer = this.findBringIn();
        const bringIn = Math.min(gc.bringIn, this.players[bringInPlayer].chips);
        this.players[bringInPlayer].chips -= bringIn;
        this.players[bringInPlayer].currentBet = bringIn;
        this.players[bringInPlayer].seatBet = bringIn;
        this.pot += bringIn;
        this.currentBet = bringIn;
        this.log(`${this.players[bringInPlayer].name} ブリングイン: ${bringIn}`);
        this.update();

        // 3rd street betting
        let startPlayer = this.getNextActivePlayer(bringInPlayer);
        this.minRaise = gc.smallBet;
        if (await this.bettingRound(startPlayer, true, gc.smallBet)) return;

        if (this.onFirstRoundEnd) this.onFirstRoundEnd();

        // 4th-7th Street
        const streets = ['4th', '5th', '6th', '7th'];
        for (let s = 0; s < 4; s++) {
            this.resetRoundBets();
            const betSize = s >= 1 ? gc.bigBet : gc.smallBet;

            for (const p of this.players) {
                if (!p.folded) {
                    if (s < 3) {
                        // 4th-6th: face up
                        const card = this.deck.deal();
                        p.upCards.push(card);
                        p.hand.push(card);
                    } else {
                        // 7th: face down
                        const card = this.deck.deal();
                        p.downCards.push(card);
                        p.hand.push(card);
                    }
                }
            }

            this.log(`--- ${streets[s]} Street ---`, 'action');
            this.update();
            await this.delay(400);

            // In stud, highest (or lowest for razz) visible hand acts first
            const firstActor = this.findStudFirstActor();
            if (await this.bettingRound(firstActor, false, betSize)) return;
        }

        await this.showdown();
    }

    findBringIn() {
        const gc = this.gameConfig;
        let target = -1;
        let targetRank = gc.lowOnly ? -1 : 999;
        const suitOrder = { c: 0, d: 1, h: 2, s: 3 };

        for (const p of this.players) {
            if (p.folded || p.upCards.length === 0) continue;
            const card = p.upCards[0];
            if (gc.lowOnly) {
                // Razz: highest card brings in
                if (card.rank > targetRank || (card.rank === targetRank && suitOrder[card.suit] > suitOrder[target !== -1 ? this.players[target].upCards[0].suit : 'c'])) {
                    target = p.id;
                    targetRank = card.rank;
                }
            } else {
                // Stud: lowest card brings in
                if (card.rank < targetRank || (card.rank === targetRank && suitOrder[card.suit] < suitOrder[target !== -1 ? this.players[target].upCards[0].suit : 's'])) {
                    target = p.id;
                    targetRank = card.rank;
                }
            }
        }
        return target;
    }

    findStudFirstActor() {
        const gc = this.gameConfig;
        let best = -1;
        let bestValue = null;

        for (const p of this.players) {
            if (p.folded || p.allIn) continue;
            const upHand = p.upCards.slice();
            if (upHand.length === 0) continue;

            let value;
            if (gc.lowOnly) {
                // Razz: lowest visible hand acts first
                value = upHand.map(c => c.rank === 14 ? 1 : c.rank).sort((a, b) => a - b);
                if (!bestValue || compareArrays(value, bestValue) < 0) {
                    best = p.id;
                    bestValue = value;
                }
            } else {
                // Stud: highest visible hand acts first
                const hand = bestHighHand(upHand.length >= 5 ? upHand : upHand);
                value = hand ? hand.value : [0];
                if (!bestValue || compareArrays(value, bestValue) > 0) {
                    best = p.id;
                    bestValue = value;
                }
            }
        }
        return best >= 0 ? best : this.getNextActivePlayer(this.dealerSeat);
    }

    // ==========================================
    // Draw Games (Triple Draw, Single Draw, Badugi)
    // ==========================================

    async playDrawHand() {
        const gc = this.gameConfig;

        await this.postBlinds();

        // Deal initial hand
        for (const p of this.players) {
            if (!p.folded) {
                p.hand = this.deck.deal(gc.handSize);
            }
        }
        this.update();

        // Pre-draw betting
        const firstActor = this.getNextActivePlayer(this.getBigBlindSeat());
        if (await this.bettingRound(firstActor, true, gc.smallBet)) return;

        if (this.onFirstRoundEnd) this.onFirstRoundEnd();

        // Draw rounds
        for (let d = 0; d < gc.drawCount; d++) {
            // Draw phase
            this.log(`--- ${d + 1}回目のドロー ---`, 'action');
            await this.drawPhase();
            this.update();

            // Post-draw betting
            this.resetRoundBets();
            const betSize = (d >= 1) ? gc.bigBet : gc.smallBet;
            const postDrawStart = this.getNextActivePlayer(this.dealerSeat);
            if (await this.bettingRound(postDrawStart, false, betSize)) return;
        }

        await this.showdown();
    }

    async drawPhase() {
        for (const p of this.players) {
            if (p.folded || p.allIn) continue;

            const discards = await this.onGetPlayerDraw(p);
            this.executeDiscard(p, discards);
            const count = discards.length;
            this.log(`${p.name}: ${count === 0 ? 'スタンドパット' : count + '枚交換'}`);
            this.update();
            await this.delay(300);
        }
    }

    executeDiscard(player, discardIndices) {
        const sorted = [...discardIndices].sort((a, b) => b - a);
        const discarded = [];
        for (const idx of sorted) {
            discarded.push(player.hand.splice(idx, 1)[0]);
        }
        // Return discards to deck for potential reshuffle
        if (discarded.length > 0) {
            this.deck.addDiscards(discarded);
        }
        const needed = this.gameConfig.handSize - player.hand.length;
        if (needed > 0) {
            const newCards = this.deck.deal(needed);
            if (Array.isArray(newCards)) {
                player.hand.push(...newCards);
            } else {
                player.hand.push(newCards);
            }
        }
    }

    // ==========================================
    // Betting Logic
    // ==========================================

    postBlinds() {
        const gc = this.gameConfig;
        const sb = this.getSmallBlindSeat();
        const bb = this.getBigBlindSeat();

        const sbAmount = Math.min(gc.smallBlind, this.players[sb].chips);
        this.players[sb].chips -= sbAmount;
        this.players[sb].currentBet = sbAmount;
        this.players[sb].seatBet = sbAmount;
        this.pot += sbAmount;

        const bbAmount = Math.min(gc.bigBlind, this.players[bb].chips);
        this.players[bb].chips -= bbAmount;
        this.players[bb].currentBet = bbAmount;
        this.players[bb].seatBet = bbAmount;
        this.pot += bbAmount;

        this.currentBet = bbAmount;
        this.minRaise = bbAmount;

        this.log(`SB: ${this.players[sb].name} (${sbAmount}) / BB: ${this.players[bb].name} (${bbAmount})`);
        this.update();
    }

    getSmallBlindSeat() {
        return this.getNextActivePlayer(this.dealerSeat);
    }

    getBigBlindSeat() {
        return this.getNextActivePlayer(this.getSmallBlindSeat());
    }

    resetRoundBets() {
        for (const p of this.players) {
            p.currentBet = 0;
            p.seatBet = 0;
        }
        this.currentBet = 0;
        this.minRaise = this.gameConfig.bigBet || this.gameConfig.bigBlind || 100;
        this.lastRaiser = -1;
        this.roundBets = 0;
    }

    // Returns true if hand is over (only 1 player left)
    async bettingRound(startIdx, isPreflop, limitBetSize) {
        if (startIdx < 0) return this.checkHandOver();

        const gc = this.gameConfig;
        const maxRaises = gc.betting === 'limit' ? 4 : 999;
        let raiseCount = 0;

        // Track who still needs to act. Everyone active must act at least once.
        // When someone raises, everyone else must act again.
        const needsToAct = new Set();
        for (const p of this.players) {
            if (!p.folded && !p.allIn && p.chips > 0) {
                needsToAct.add(p.id);
            }
        }

        let idx = startIdx;
        let safety = 0;

        while (needsToAct.size > 0 && safety++ < 60) {
            const player = this.players[idx];

            if (!player.folded && !player.allIn && player.chips > 0 && needsToAct.has(player.id)) {
                const callAmount = this.currentBet - player.currentBet;
                const canRaise = raiseCount < maxRaises;

                // Determine valid actions
                const actions = [];
                if (callAmount <= 0) {
                    actions.push({ type: 'check' });
                } else {
                    actions.push({ type: 'fold' });
                    actions.push({ type: 'call', amount: Math.min(callAmount, player.chips) });
                }

                if (canRaise && player.chips > callAmount) {
                    if (gc.betting === 'limit') {
                        const size = limitBetSize || gc.smallBet;
                        const raiseTotal = this.currentBet + size;
                        if (callAmount <= 0) {
                            actions.push({ type: 'bet', amount: Math.min(size, player.chips) });
                        } else {
                            actions.push({ type: 'raise', amount: Math.min(raiseTotal - player.currentBet, player.chips) });
                        }
                    } else if (gc.betting === 'no-limit') {
                        const minRaiseSize = Math.max(this.minRaise, this.currentBet * 2 - player.currentBet);
                        const maxBet = player.chips;
                        if (callAmount <= 0) {
                            actions.push({ type: 'bet', min: this.minRaise, max: maxBet });
                        } else {
                            actions.push({ type: 'raise', min: Math.min(minRaiseSize, maxBet), max: maxBet });
                        }
                        actions.push({ type: 'allin', amount: player.chips });
                    } else if (gc.betting === 'pot-limit') {
                        const potAfterCall = this.pot + callAmount;
                        const maxRaiseAmt = potAfterCall + callAmount;
                        const maxBet = Math.min(maxRaiseAmt, player.chips);
                        if (callAmount <= 0) {
                            actions.push({ type: 'bet', min: this.minRaise, max: maxBet });
                        } else {
                            actions.push({ type: 'raise', min: Math.min(this.currentBet + this.minRaise - player.currentBet, maxBet), max: maxBet });
                        }
                    }
                }

                let action;
                this.currentPlayerIndex = idx;
                this.update();
                action = await this.onGetPlayerAction(actions, player);

                // Execute action
                this.executeAction(player, action);
                needsToAct.delete(player.id);

                // If someone raises/bets, everyone else needs to act again
                if (action.type === 'raise' || action.type === 'bet' || action.type === 'allin') {
                    raiseCount++;
                    for (const p of this.players) {
                        if (p.id !== player.id && !p.folded && !p.allIn && p.chips > 0) {
                            needsToAct.add(p.id);
                        }
                    }
                }
            }

            // Check if hand is over
            if (this.checkHandOver()) return true;

            // Next player
            idx = this.getNextActivePlayer(idx);
            if (idx < 0) break;
        }

        this.currentPlayerIndex = -1;
        this.update();
        return this.checkHandOver();
    }

    getPreviousActive(from) {
        const n = this.playerCount;
        let idx = (from - 1 + n) % n;
        let safety = 0;
        while (safety++ < n) {
            if (!this.players[idx].folded && !this.players[idx].allIn) return idx;
            idx = (idx - 1 + n) % n;
        }
        return from;
    }

    countActivePlayers() {
        return this.players.filter(p => !p.folded && !p.allIn && p.chips > 0).length;
    }

    allCalledOrFolded() {
        for (const p of this.players) {
            if (p.folded || p.allIn) continue;
            if (p.chips > 0 && p.currentBet < this.currentBet) return false;
        }
        return true;
    }

    executeAction(player, action, isBlinds) {
        player.lastAction = action.type;

        // Stats hook
        if (this.onPlayerAction) this.onPlayerAction(player, action, isBlinds);

        switch (action.type) {
            case 'fold':
                player.folded = true;
                this.log(`${player.name}: フォールド`);
                if (player.isHuman && this.fastFold) {
                    this.fastFoldActive = true;
                }
                break;

            case 'check':
                this.log(`${player.name}: チェック`);
                break;

            case 'call': {
                const amount = Math.min(action.amount, player.chips);
                player.chips -= amount;
                player.currentBet += amount;
                player.seatBet += amount;
                this.pot += amount;
                if (player.chips === 0) player.allIn = true;
                this.log(`${player.name}: コール ${amount}`);
                break;
            }

            case 'bet': {
                const amount = Math.min(action.amount, player.chips);
                player.chips -= amount;
                player.currentBet += amount;
                player.seatBet += amount;
                this.pot += amount;
                this.currentBet = player.currentBet;
                this.minRaise = amount;
                if (player.chips === 0) player.allIn = true;
                this.log(`${player.name}: ベット ${amount}`);
                break;
            }

            case 'raise': {
                const amount = Math.min(action.amount, player.chips);
                const raiseBy = (player.currentBet + amount) - this.currentBet;
                player.chips -= amount;
                player.currentBet += amount;
                player.seatBet += amount;
                this.pot += amount;
                this.minRaise = Math.max(this.minRaise, raiseBy);
                this.currentBet = player.currentBet;
                if (player.chips === 0) player.allIn = true;
                this.log(`${player.name}: レイズ → ${player.currentBet}`);
                break;
            }

            case 'allin': {
                const amount = player.chips;
                player.chips = 0;
                player.currentBet += amount;
                player.seatBet += amount;
                this.pot += amount;
                player.allIn = true;
                if (player.currentBet > this.currentBet) {
                    this.minRaise = Math.max(this.minRaise, player.currentBet - this.currentBet);
                    this.currentBet = player.currentBet;
                }
                this.log(`${player.name}: オールイン ${amount}`);
                break;
            }
        }
        this.update();
    }

    checkHandOver() {
        const remaining = this.players.filter(p => !p.folded);
        if (remaining.length <= 1) {
            if (remaining.length === 1) {
                remaining[0].chips += this.pot;
                this.log(`${remaining[0].name} が獲得: ${this.pot}`, 'important');
                this.pot = 0;
            }
            this.update();
            return true;
        }
        return false;
    }

    // ==========================================
    // Showdown
    // ==========================================

    async showdown() {
        const gc = this.gameConfig;
        const remaining = this.players.filter(p => !p.folded);

        if (remaining.length <= 1) {
            this.checkHandOver();
            return;
        }

        this.log('--- ショーダウン ---', 'important');
        this._hadShowdown = true;
        this.isShowdown = true;

        // Evaluate hands
        const results = [];
        for (const p of remaining) {
            const eval_ = evaluateHand(gc, p.hand, this.communityCards);
            results.push({ player: p, high: eval_.high, low: eval_.low });

            const handName = eval_.high ? eval_.high.name : '(なし)';
            this.log(`${p.name}: ${handName}`);
        }

        this.update();
        await this.delay(1500);

        // Determine winners
        let winnerIds;
        if (gc.hasLow) {
            // Hi-Lo split
            winnerIds = await this.distributeHiLo(results);
        } else {
            // High only (or low-only for Razz/draw lowball)
            winnerIds = await this.distributeWinner(results);
        }

        if (this.onShowdown) this.onShowdown(winnerIds);

        this.pot = 0;
        this.update();
    }

    async distributeWinner(results) {
        const gc = this.gameConfig;
        let bestVal = null;
        let winners = [];

        for (const r of results) {
            if (!r.high) continue;
            if (!bestVal) {
                bestVal = r.high;
                winners = [r];
            } else {
                const cmp = compareHands(gc, r.high, bestVal);
                if (cmp > 0) {
                    bestVal = r.high;
                    winners = [r];
                } else if (cmp === 0) {
                    winners.push(r);
                }
            }
        }

        const share = Math.floor(this.pot / winners.length);
        const remainder = this.pot - share * winners.length;

        for (let i = 0; i < winners.length; i++) {
            const amount = share + (i === 0 ? remainder : 0);
            winners[i].player.chips += amount;
            this.log(`${winners[i].player.name} が獲得: ${amount}`, 'important');
        }
        return winners.map(w => w.player.id);
    }

    async distributeHiLo(results) {
        const gc = this.gameConfig;
        const allWinnerIds = new Set();

        // Find high winner(s)
        let bestHigh = null;
        let highWinners = [];
        for (const r of results) {
            if (!r.high) continue;
            if (!bestHigh) {
                bestHigh = r.high;
                highWinners = [r];
            } else {
                const cmp = compareArrays(r.high.value, bestHigh.value);
                if (cmp > 0) {
                    bestHigh = r.high;
                    highWinners = [r];
                } else if (cmp === 0) {
                    highWinners.push(r);
                }
            }
        }

        // Find low winner(s)
        let bestLow = null;
        let lowWinners = [];
        for (const r of results) {
            if (!r.low) continue;
            if (!bestLow) {
                bestLow = r.low;
                lowWinners = [r];
            } else {
                const cmp = compareArrays(r.low.value, bestLow.value);
                if (cmp < 0) {
                    bestLow = r.low;
                    lowWinners = [r];
                } else if (cmp === 0) {
                    lowWinners.push(r);
                }
            }
        }

        if (lowWinners.length > 0) {
            // Split pot
            const halfPot = Math.floor(this.pot / 2);
            const highPot = this.pot - halfPot;

            const highShare = Math.floor(highPot / highWinners.length);
            for (let i = 0; i < highWinners.length; i++) {
                const amt = highShare + (i === 0 ? highPot - highShare * highWinners.length : 0);
                highWinners[i].player.chips += amt;
                allWinnerIds.add(highWinners[i].player.id);
                this.log(`${highWinners[i].player.name} ハイ獲得: ${amt}`, 'important');
            }

            const lowShare = Math.floor(halfPot / lowWinners.length);
            for (let i = 0; i < lowWinners.length; i++) {
                const amt = lowShare + (i === 0 ? halfPot - lowShare * lowWinners.length : 0);
                lowWinners[i].player.chips += amt;
                allWinnerIds.add(lowWinners[i].player.id);
                this.log(`${lowWinners[i].player.name} ロー獲得: ${amt}`, 'important');
            }
        } else {
            // No qualifying low - high takes all
            this.log('ロー該当なし - ハイが総取り');
            const highShare = Math.floor(this.pot / highWinners.length);
            for (let i = 0; i < highWinners.length; i++) {
                const amt = highShare + (i === 0 ? this.pot - highShare * highWinners.length : 0);
                highWinners[i].player.chips += amt;
                allWinnerIds.add(highWinners[i].player.id);
                this.log(`${highWinners[i].player.name} 獲得: ${amt}`, 'important');
            }
        }
        return [...allWinnerIds];
    }

    delay(ms) {
        if (this.fastFoldActive) return Promise.resolve();
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

if (typeof module !== 'undefined') module.exports = { GAME_LIST, PLAYER_NAMES, GameState };
