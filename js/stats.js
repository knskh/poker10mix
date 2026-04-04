// js/stats.js - Poker Statistics Tracker

class StatsTracker {
    constructor() {
        this.data = {};
        this.currentHand = null;
        this.load();
    }

    // Get or create player stats
    getPlayer(playerId) {
        if (!this.data[playerId]) {
            this.data[playerId] = { total: this.emptyStats(), byGame: {}, byPosition: {} };
        }
        // Migration: add byPosition if missing
        if (!this.data[playerId].byPosition) this.data[playerId].byPosition = {};
        return this.data[playerId];
    }

    getPlayerGame(playerId, gameId) {
        const p = this.getPlayer(playerId);
        if (!p.byGame[gameId]) p.byGame[gameId] = this.emptyStats();
        return p.byGame[gameId];
    }

    getPlayerPosition(playerId, position) {
        const p = this.getPlayer(playerId);
        if (!p.byPosition[position]) p.byPosition[position] = this.emptyStats();
        return p.byPosition[position];
    }

    // Determine position label based on seat relative to dealer
    static getPosition(seatIdx, dealerSeat, playerCount) {
        const offset = (seatIdx - dealerSeat + playerCount) % playerCount;
        if (playerCount === 2) return offset === 0 ? 'BTN' : 'BB';
        if (offset === 0) return 'BTN';
        if (offset === 1) return 'SB';
        if (offset === 2) return 'BB';
        if (offset === playerCount - 1) return 'CO';
        if (playerCount >= 5 && offset === playerCount - 2) return 'HJ';
        return 'EP';
    }

    emptyStats() {
        return {
            handsPlayed: 0, handsWon: 0,
            vpipCount: 0, pfrCount: 0,
            threeBetCount: 0, threeBetOpp: 0,
            fourBetCount: 0, fourBetOpp: 0,
            fiveBetCount: 0, fiveBetOpp: 0,
            foldTo3Bet: 0, foldTo3BetOpp: 0,
            foldTo4Bet: 0, foldTo4BetOpp: 0,
            foldTo5Bet: 0, foldTo5BetOpp: 0,
            allInCount: 0,
            postflopBets: 0, postflopRaises: 0,
            postflopCalls: 0, postflopChecks: 0, postflopFolds: 0,
            sawPostflop: 0, wentToShowdown: 0, wonAtShowdown: 0,
            totalChipsWon: 0, totalChipsLost: 0,
            showdownWinnings: 0, nonShowdownWinnings: 0,
        };
    }

    // Start tracking a new hand
    beginHand(players, gameConfig, dealerSeat) {
        this.currentHand = {
            gameId: gameConfig.id,
            players: {},
            firstRoundRaiseCount: 0,
            isFirstRound: true,
            startChips: {},
            positions: {},
        };
        const activeCount = players.filter(p => !p.folded).length;
        for (const p of players) {
            if (p.folded) continue;
            this.currentHand.startChips[p.id] = p.chips;
            const pos = StatsTracker.getPosition(p.id, dealerSeat || 0, activeCount);
            this.currentHand.positions[p.id] = pos;
            this.currentHand.players[p.id] = {
                vpip: false, pfr: false,
                threeBet: false, fourBet: false, fiveBet: false,
                foldTo3Bet: false, foldTo4Bet: false, foldTo5Bet: false,
                hadOppTo3Bet: false, hadOppTo4Bet: false, hadOppTo5Bet: false,
                allIn: false,
                sawPostflop: false,
                wentToShowdown: false,
                wonAtShowdown: false,
                folded: false,
            };
        }
    }

    // Mark first round as over
    endFirstRound() {
        if (!this.currentHand) return;
        // Mark all surviving players as having seen postflop
        for (const [pid, ph] of Object.entries(this.currentHand.players)) {
            if (!ph.folded) ph.sawPostflop = true;
        }
        this.currentHand.isFirstRound = false;
    }

    // Record a player action
    recordAction(player, action, isBlindsOrAnte) {
        if (!this.currentHand) return;
        const h = this.currentHand;
        const ph = h.players[player.id];
        if (!ph) return;

        const gid = h.gameId;
        const isFirst = h.isFirstRound;
        const type = action.type;

        // VPIP: any voluntary money in pot (not blinds/antes)
        if (!isBlindsOrAnte && (type === 'call' || type === 'bet' || type === 'raise' || type === 'allin')) {
            ph.vpip = true;
        }

        // PFR: raised in first round
        if (isFirst && (type === 'raise' || type === 'bet') && !isBlindsOrAnte) {
            ph.pfr = true;
        }

        // Track raises in first round for 3bet/4bet/5bet
        if (isFirst && (type === 'raise' || type === 'bet') && !isBlindsOrAnte) {
            h.firstRoundRaiseCount++;
            const rc = h.firstRoundRaiseCount;
            if (rc === 2) { // This is a 3-bet (re-raise over first raise)
                // Actually: open raise = raise count 1, 3-bet = raise count 2
                // For games with blinds: BB is not a raise. First raise = open. Second raise = 3-bet.
                // Let's use: raiseCount 1 = open/PFR, 2 = 3-bet, 3 = 4-bet, 4 = 5-bet
            }
            if (rc === 2) ph.threeBet = true;
            if (rc === 3) ph.fourBet = true;
            if (rc === 4) ph.fiveBet = true;
        }

        // Track fold-to-Xbet opportunities
        if (isFirst && type === 'fold') {
            ph.folded = true;
            const rc = h.firstRoundRaiseCount;
            if (rc >= 2) { ph.foldTo3Bet = true; ph.hadOppTo3Bet = true; }
            if (rc >= 3) { ph.foldTo4Bet = true; ph.hadOppTo4Bet = true; }
            if (rc >= 4) { ph.foldTo5Bet = true; ph.hadOppTo5Bet = true; }
        }

        // If facing a 3bet+ and NOT folding, still had the opportunity
        if (isFirst && type !== 'fold') {
            const rc = h.firstRoundRaiseCount;
            // The player is facing rc raises. If rc >= 2, they had opp to fold to 3bet
            if (rc >= 2) ph.hadOppTo3Bet = true;
            if (rc >= 3) ph.hadOppTo4Bet = true;
            if (rc >= 4) ph.hadOppTo5Bet = true;
        }

        if (type === 'fold') ph.folded = true;

        // All-in
        if (type === 'allin') ph.allIn = true;

        // Postflop aggression tracking
        if (!isFirst) {
            if (type === 'bet') ph._postBets = (ph._postBets || 0) + 1;
            if (type === 'raise') ph._postRaises = (ph._postRaises || 0) + 1;
            if (type === 'call') ph._postCalls = (ph._postCalls || 0) + 1;
            if (type === 'check') ph._postChecks = (ph._postChecks || 0) + 1;
            if (type === 'fold') ph._postFolds = (ph._postFolds || 0) + 1;
        }
    }

    // Record showdown results
    recordShowdown(winnersIds) {
        if (!this.currentHand) return;
        const h = this.currentHand;
        for (const [pid, ph] of Object.entries(h.players)) {
            if (!ph.folded) {
                ph.wentToShowdown = true;
                if (winnersIds.includes(parseInt(pid))) {
                    ph.wonAtShowdown = true;
                }
            }
        }
    }

    // End hand and commit stats
    endHand(players, hadShowdown) {
        if (!this.currentHand) return;
        const h = this.currentHand;
        const gid = h.gameId;

        for (const p of players) {
            const ph = h.players[p.id];
            if (!ph) continue;

            const total = this.getPlayer(p.id).total;
            const game = this.getPlayerGame(p.id, gid);
            const pos = this.getPlayerPosition(p.id, h.positions[p.id] || 'EP');

            for (const s of [total, game, pos]) {
                s.handsPlayed++;

                const chipDiff = p.chips - (h.startChips[p.id] || 0);
                if (chipDiff > 0) {
                    s.handsWon++;
                    s.totalChipsWon += chipDiff;
                } else {
                    s.totalChipsLost += Math.abs(chipDiff);
                }

                if (ph.vpip) s.vpipCount++;
                if (ph.pfr) s.pfrCount++;
                if (ph.threeBet) s.threeBetCount++;
                if (ph.hadOppTo3Bet) s.threeBetOpp++;
                if (ph.fourBet) s.fourBetCount++;
                if (ph.hadOppTo4Bet) s.fourBetOpp++;
                if (ph.fiveBet) s.fiveBetCount++;
                if (ph.hadOppTo5Bet) s.fiveBetOpp++;
                if (ph.foldTo3Bet) s.foldTo3Bet++;
                if (ph.hadOppTo3Bet) s.foldTo3BetOpp++;
                if (ph.foldTo4Bet) s.foldTo4Bet++;
                if (ph.hadOppTo4Bet) s.foldTo4BetOpp++;
                if (ph.foldTo5Bet) s.foldTo5Bet++;
                if (ph.hadOppTo5Bet) s.foldTo5BetOpp++;
                if (ph.allIn) s.allInCount++;
                if (ph.sawPostflop) s.sawPostflop++;
                if (ph.wentToShowdown) s.wentToShowdown++;
                if (ph.wonAtShowdown) s.wonAtShowdown++;

                s.postflopBets += ph._postBets || 0;
                s.postflopRaises += ph._postRaises || 0;
                s.postflopCalls += ph._postCalls || 0;
                s.postflopChecks += ph._postChecks || 0;
                s.postflopFolds += ph._postFolds || 0;

                if (hadShowdown && ph.wentToShowdown) {
                    s.showdownWinnings += chipDiff > 0 ? chipDiff : 0;
                } else if (!ph.wentToShowdown && chipDiff > 0) {
                    s.nonShowdownWinnings += chipDiff;
                }
            }
        }

        this.currentHand = null;
        this.save();
    }

    // Calculate derived stats
    calc(stats) {
        const s = stats;
        const pct = (n, d) => d > 0 ? (n / d * 100).toFixed(1) : '-';
        const ratio = (n, d) => d > 0 ? (n / d).toFixed(2) : '-';

        return {
            hands: s.handsPlayed,
            vpip: pct(s.vpipCount, s.handsPlayed),
            pfr: pct(s.pfrCount, s.handsPlayed),
            threeBet: pct(s.threeBetCount, s.threeBetOpp),
            fourBet: pct(s.fourBetCount, s.fourBetOpp),
            fiveBet: pct(s.fiveBetCount, s.fiveBetOpp),
            foldTo3Bet: pct(s.foldTo3Bet, s.foldTo3BetOpp),
            foldTo4Bet: pct(s.foldTo4Bet, s.foldTo4BetOpp),
            foldTo5Bet: pct(s.foldTo5Bet, s.foldTo5BetOpp),
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

    // Save to localStorage (browser only)
    save() {
        try {
            if (typeof localStorage !== 'undefined')
                localStorage.setItem('poker10mix_stats', JSON.stringify(this.data));
        } catch (e) { /* ignore */ }
    }

    load() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('poker10mix_stats');
                if (raw) this.data = JSON.parse(raw);
            }
        } catch (e) { /* ignore */ }
    }

    reset() {
        this.data = {};
        this.save();
    }
}

if (typeof module !== 'undefined') {
    module.exports = { StatsTracker };
} else {
    var statsTracker = new StatsTracker();
}
