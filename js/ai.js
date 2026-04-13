// js/ai.js - AI Player Logic

function aiDecideAction(gameConfig, player, actions, state) {
    const actionTypes = actions.map(a => a.type);
    const handStrength = aiEvalStrength(gameConfig, player, state);

    // Random factor for variety
    const r = Math.random();

    // Simple rule-based AI
    if (handStrength > 0.8) {
        // Very strong hand - raise/bet
        if (actionTypes.includes('raise')) {
            const ra = actions.find(a => a.type === 'raise');
            if (gameConfig.betting === 'limit') {
                return ra;
            } else {
                // NL/PL: bet bigger with stronger hands
                const amount = ra.min + Math.floor((ra.max - ra.min) * handStrength * r);
                return { type: 'raise', amount: Math.min(amount, ra.max) };
            }
        }
        if (actionTypes.includes('bet')) {
            const ba = actions.find(a => a.type === 'bet');
            if (gameConfig.betting === 'limit') {
                return ba;
            } else {
                const amount = ba.min + Math.floor((ba.max - ba.min) * 0.5 * r);
                return { type: 'bet', amount: Math.min(amount, ba.max) };
            }
        }
        if (actionTypes.includes('call')) return actions.find(a => a.type === 'call');
        return actions.find(a => a.type === 'check') || actions[0];
    }

    if (handStrength > 0.55) {
        // Medium hand - call or sometimes raise
        if (r > 0.7 && actionTypes.includes('raise')) {
            const ra = actions.find(a => a.type === 'raise');
            if (gameConfig.betting === 'limit') return ra;
            return { type: 'raise', amount: ra.min };
        }
        if (r > 0.7 && actionTypes.includes('bet')) {
            const ba = actions.find(a => a.type === 'bet');
            if (gameConfig.betting === 'limit') return ba;
            return { type: 'bet', amount: ba.min };
        }
        if (actionTypes.includes('call')) return actions.find(a => a.type === 'call');
        if (actionTypes.includes('check')) return actions.find(a => a.type === 'check');
        return actions.find(a => a.type === 'fold');
    }

    if (handStrength > 0.3) {
        // Weak hand - check or call small
        if (actionTypes.includes('check')) return actions.find(a => a.type === 'check');
        const callAction = actions.find(a => a.type === 'call');
        if (callAction && callAction.amount <= state.pot * 0.3 && r > 0.4) {
            return callAction;
        }
        // Bluff occasionally
        if (r > 0.85 && actionTypes.includes('bet')) {
            const ba = actions.find(a => a.type === 'bet');
            if (gameConfig.betting === 'limit') return ba;
            return { type: 'bet', amount: ba.min };
        }
        if (actionTypes.includes('fold')) return actions.find(a => a.type === 'fold');
        return actions.find(a => a.type === 'check') || actions[0];
    }

    // Very weak hand - fold or check
    if (actionTypes.includes('check')) return actions.find(a => a.type === 'check');
    // Small bluff chance
    if (r > 0.92 && actionTypes.includes('bet')) {
        const ba = actions.find(a => a.type === 'bet');
        if (gameConfig.betting === 'limit') return ba;
        return { type: 'bet', amount: ba.min };
    }
    return actions.find(a => a.type === 'fold') || actions[0];
}

function aiEvalStrength(gameConfig, player, state) {
    const gc = gameConfig;
    const hand = player.hand;

    if (!hand || hand.length === 0) return 0.5;

    switch (gc.type) {
        case 'community':
            return aiEvalCommunity(gc, hand, state.communityCards);
        case 'stud':
            return aiEvalStud(gc, hand);
        case 'draw':
            return aiEvalDraw(gc, hand);
        default:
            return 0.5;
    }
}

function aiEvalCommunity(gc, hand, community) {
    const allCards = [...hand, ...community];
    if (allCards.length < 5) {
        // Preflop evaluation
        return aiPreflopStrength(gc, hand);
    }

    let eval_;
    if (gc.exactHole) {
        eval_ = bestOmahaHigh(hand, community);
    } else {
        eval_ = bestHighHand(allCards);
    }

    if (!eval_) return 0.2;

    // Map hand category to strength
    const cat = eval_.value[0];
    const base = Math.min(cat / 10, 0.95);
    return base + Math.random() * 0.1;
}

function aiPreflopStrength(gc, hand) {
    if (gc.holeCards === 2) {
        // Hold'em preflop
        const r1 = hand[0].rank, r2 = hand[1].rank;
        const suited = hand[0].suit === hand[1].suit;
        const paired = r1 === r2;
        const gap = Math.abs(r1 - r2);
        const highCard = Math.max(r1, r2);

        let strength = 0.3;
        if (paired) strength = 0.5 + (r1 / 14) * 0.4;
        else {
            strength = 0.2 + (highCard / 14) * 0.2;
            if (suited) strength += 0.08;
            if (gap <= 2) strength += 0.06;
            if (gap <= 1) strength += 0.06;
        }
        return Math.min(strength + Math.random() * 0.1, 1);
    }

    if (gc.holeCards === 4) {
        // Omaha preflop - simplified
        const ranks = hand.map(c => c.rank).sort((a, b) => b - a);
        const suited = new Set(hand.map(c => c.suit)).size;
        const paired = new Set(ranks).size;

        let strength = 0.35;
        if (ranks[0] >= 12) strength += 0.1;
        if (ranks[1] >= 10) strength += 0.08;
        if (suited <= 2) strength += 0.1; // Double-suited
        if (paired <= 3) strength += 0.05; // Has a pair
        // Connected cards
        const diffs = [];
        for (let i = 0; i < ranks.length - 1; i++) diffs.push(ranks[i] - ranks[i + 1]);
        if (diffs.some(d => d <= 2)) strength += 0.06;
        return Math.min(strength + Math.random() * 0.1, 1);
    }

    return 0.5;
}

function aiEvalStud(gc, hand) {
    if (hand.length < 3) return 0.5;

    if (gc.lowOnly || gc.id === 'razz') {
        // Razz: low hand evaluation
        const ranks = hand.map(c => c.rank === 14 ? 1 : c.rank).sort((a, b) => a - b);
        const unique = [...new Set(ranks)];
        const avgRank = unique.slice(0, 5).reduce((s, r) => s + r, 0) / Math.min(unique.length, 5);
        return Math.max(0.1, 1 - avgRank / 13 + Math.random() * 0.1);
    }

    // Stud high
    const eval_ = bestHighHand(hand.length >= 5 ? hand : hand);
    if (!eval_) return 0.3;
    return Math.min(eval_.value[0] / 9 + Math.random() * 0.15, 1);
}

function aiEvalDraw(gc, hand) {
    if (gc.lowType === '27') {
        const eval_ = evaluate5Low27(hand);
        if (!eval_.isPenalty) {
            // Valid low hand
            const highCard = eval_.value[1]; // After the 0 prefix
            return Math.max(0.2, 1 - (highCard - 2) / 12 + Math.random() * 0.1);
        }
        return 0.2 + Math.random() * 0.15;
    }

    if (gc.lowType === 'badugi') {
        const eval_ = evaluateBadugi(hand);
        const sizeBonus = eval_.badugiSize * 0.2;
        return Math.min(sizeBonus + 0.1 + Math.random() * 0.1, 1);
    }

    return 0.5;
}

// ==========================================
// AI Draw Decisions
// ==========================================

function aiDecideDraw(gameConfig, player) {
    const hand = player.hand;

    if (gameConfig.lowType === '27') {
        return aiDraw27(hand);
    }

    if (gameConfig.lowType === 'badugi') {
        return aiDrawBadugi(hand);
    }

    return [];
}

function aiDraw27(hand) {
    // Keep low cards (2-7), discard high cards and problem cards
    const indices = [];
    const ranks = hand.map(c => c.rank);
    const suits = hand.map(c => c.suit);

    // Simple strategy: keep cards 7 or below, discard others
    // But also check for straights/flushes
    const sorted = hand.map((c, i) => ({ card: c, idx: i }))
        .sort((a, b) => a.card.rank - b.card.rank);

    // Check if all same suit (flush draw - bad in 2-7)
    const suitCounts = {};
    for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
    const maxSuit = Math.max(...Object.values(suitCounts));

    // Start by marking high cards for discard
    for (let i = 0; i < hand.length; i++) {
        if (hand[i].rank > 8) {
            indices.push(i);
        }
    }

    // Check for pairs - discard duplicates
    const seen = {};
    for (let i = 0; i < hand.length; i++) {
        if (indices.includes(i)) continue;
        if (seen[hand[i].rank]) {
            indices.push(i);
        }
        seen[hand[i].rank] = true;
    }

    // If we'd discard too many, keep some
    if (indices.length > 3) {
        indices.sort((a, b) => hand[b].rank - hand[a].rank);
        return indices.slice(0, 3);
    }

    // If already pat (all low, no pairs, no straight/flush), stand pat
    if (indices.length === 0) {
        // Check for straight
        const sortedRanks = [...ranks].sort((a, b) => a - b);
        let isStraight = true;
        for (let i = 1; i < sortedRanks.length; i++) {
            if (sortedRanks[i] - sortedRanks[i - 1] !== 1) { isStraight = false; break; }
        }
        if (isStraight && hand.length === 5) {
            // Discard the highest card to break straight
            const maxIdx = sorted[sorted.length - 1].idx;
            return [maxIdx];
        }

        // Check for flush
        if (maxSuit >= 5) {
            // Discard one card of the flush suit
            const flushSuit = Object.entries(suitCounts).find(([s, c]) => c >= 5)[0];
            const flushCard = hand.findIndex(c => c.suit === flushSuit);
            return [flushCard];
        }
    }

    return indices;
}

function aiDrawBadugi(hand) {
    const eval_ = evaluateBadugi(hand);

    if (eval_.badugiSize === 4) return []; // Already badugi, stand pat

    // Keep the badugi subset, discard others
    const keepCards = eval_.cards;
    const discards = [];

    for (let i = 0; i < hand.length; i++) {
        const isKept = keepCards.some(k => k.rank === hand[i].rank && k.suit === hand[i].suit);
        if (!isKept) discards.push(i);
    }

    return discards;
}
