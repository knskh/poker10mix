// js/evaluator.js - Hand Evaluation for all poker variants

function combinations(arr, k) {
    if (k === 0) return [[]];
    if (k > arr.length) return [];
    const [first, ...rest] = arr;
    const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = combinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

function compareArrays(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
}

// ==========================================
// Standard 5-Card High Hand Evaluation
// ==========================================
// Returns { value: [category, ...kickers], name: string }
// Higher value = better hand

const HIGH_HAND_NAMES = {
    9: 'ストレートフラッシュ',
    8: 'フォーカード',
    7: 'フルハウス',
    6: 'フラッシュ',
    5: 'ストレート',
    4: 'スリーカード',
    3: 'ツーペア',
    2: 'ワンペア',
    1: 'ハイカード'
};

function evaluate5High(cards) {
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false;
    let straightHigh = 0;
    if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
        isStraight = true;
        straightHigh = ranks[0];
    }
    // A-2-3-4-5 wheel
    if (!isStraight && ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
        isStraight = true;
        straightHigh = 5;
    }

    // Count ranks
    const counts = {};
    for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
    const groups = Object.entries(counts)
        .map(([r, c]) => [c, parseInt(r)])
        .sort((a, b) => b[0] - a[0] || b[1] - a[1]);

    const pattern = groups.map(g => g[0]).join('');

    if (isFlush && isStraight) {
        return { value: [9, straightHigh], name: straightHigh === 14 ? 'ロイヤルフラッシュ' : 'ストレートフラッシュ' };
    }
    if (pattern === '41') {
        return { value: [8, groups[0][1], groups[1][1]], name: 'フォーカード' };
    }
    if (pattern === '32') {
        return { value: [7, groups[0][1], groups[1][1]], name: 'フルハウス' };
    }
    if (isFlush) {
        return { value: [6, ...ranks], name: 'フラッシュ' };
    }
    if (isStraight) {
        return { value: [5, straightHigh], name: 'ストレート' };
    }
    if (pattern === '311') {
        const kickers = groups.filter(g => g[0] === 1).map(g => g[1]).sort((a, b) => b - a);
        return { value: [4, groups[0][1], ...kickers], name: 'スリーカード' };
    }
    if (pattern === '221') {
        const pairs = groups.filter(g => g[0] === 2).map(g => g[1]).sort((a, b) => b - a);
        const kicker = groups.find(g => g[0] === 1)[1];
        return { value: [3, ...pairs, kicker], name: 'ツーペア' };
    }
    if (pattern === '2111') {
        const kickers = groups.filter(g => g[0] === 1).map(g => g[1]).sort((a, b) => b - a);
        return { value: [2, groups[0][1], ...kickers], name: 'ワンペア' };
    }
    return { value: [1, ...ranks], name: 'ハイカード' };
}

// Best 5-card high hand from N cards (Hold'em, Stud)
function bestHighHand(cards) {
    const combos = combinations(cards, 5);
    let best = null;
    for (const combo of combos) {
        const hand = evaluate5High(combo);
        hand.cards = combo;
        if (!best || compareArrays(hand.value, best.value) > 0) {
            best = hand;
        }
    }
    return best;
}

// ==========================================
// Omaha Evaluation (must use exactly 2 hole + 3 board)
// ==========================================

function bestOmahaHigh(holeCards, boardCards) {
    const holeCombos = combinations(holeCards, 2);
    const boardCombos = combinations(boardCards, 3);
    let best = null;
    for (const hc of holeCombos) {
        for (const bc of boardCombos) {
            const hand = evaluate5High([...hc, ...bc]);
            hand.cards = [...hc, ...bc];
            if (!best || compareArrays(hand.value, best.value) > 0) {
                best = hand;
            }
        }
    }
    return best;
}

// ==========================================
// A-5 Low Evaluation (Razz, Omaha Hi-Lo, Stud Hi-Lo)
// Ace is low (1), straights/flushes don't count
// ==========================================

function evaluate5LowA5(cards) {
    // Convert ace to 1
    const ranks = cards.map(c => c.rank === 14 ? 1 : c.rank).sort((a, b) => a - b);
    // Check for pairs
    for (let i = 0; i < ranks.length - 1; i++) {
        if (ranks[i] === ranks[i + 1]) return null; // has pair, not a valid low
    }
    // Return sorted high to low (for comparison, lower values = better)
    const sorted = [...ranks].sort((a, b) => b - a);
    const rankNames = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K' };
    const name = (rankNames[sorted[0]] || sorted[0]) + '-' + (rankNames[sorted[sorted.length - 1]] || sorted[sorted.length - 1]) + ' ロー';
    return { value: sorted, cards, name };
}

function bestLowA5(cards, qualifier) {
    const combos = combinations(cards, 5);
    let best = null;
    for (const combo of combos) {
        const hand = evaluate5LowA5(combo);
        if (!hand) continue;
        // Check qualifier (e.g., 8 or better)
        if (qualifier && hand.value[0] > qualifier) continue;
        hand.cards = combo;
        if (!best || compareArrays(hand.value, best.value) < 0) {
            best = hand;
        }
    }
    return best;
}

function bestOmahaLow(holeCards, boardCards, qualifier) {
    const holeCombos = combinations(holeCards, 2);
    const boardCombos = combinations(boardCards, 3);
    let best = null;
    for (const hc of holeCombos) {
        for (const bc of boardCombos) {
            const allCards = [...hc, ...bc];
            const hand = evaluate5LowA5(allCards);
            if (!hand) continue;
            if (qualifier && hand.value[0] > qualifier) continue;
            hand.cards = allCards;
            if (!best || compareArrays(hand.value, best.value) < 0) {
                best = hand;
            }
        }
    }
    return best;
}

// ==========================================
// 2-7 Low Evaluation (Triple Draw, Single Draw)
// Ace is HIGH (14), straights and flushes count against you
// ==========================================

function evaluate5Low27(cards) {
    const hand = evaluate5High(cards);
    // If hand is a straight, flush, or straight flush, it's bad (high value)
    // We need unpaired, no-straight, no-flush hands
    // For 2-7, the best hand is 7-5-4-3-2 (different suits)
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false;
    if (new Set(ranks).size === 5) {
        if (ranks[0] - ranks[4] === 4) isStraight = true;
        // A-2-3-4-5 is a straight (bad in 2-7)
        if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
            isStraight = true;
        }
    }

    // Check for pairs
    const hasPair = new Set(ranks).size < 5;

    if (hasPair || isFlush || isStraight) {
        // Return the high hand value (as a penalty - higher = worse in lowball)
        // We add 100 to the category to make any made hand worse than unpaired no-straight no-flush
        return { value: [100 + hand.value[0], ...hand.value.slice(1)], name: hand.name, isPenalty: true, cards };
    }

    // Valid low hand: return ranks sorted high to low (lower = better)
    const rankNames27 = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
    return { value: [0, ...ranks], name: `${rankNames27[ranks[0]] || ranks[0]}ロー`, cards };
}

function bestLow27(cards) {
    if (cards.length === 5) {
        return evaluate5Low27(cards);
    }
    const combos = combinations(cards, 5);
    let best = null;
    for (const combo of combos) {
        const hand = evaluate5Low27(combo);
        hand.cards = combo;
        if (!best || compareArrays(hand.value, best.value) < 0) {
            best = hand;
        }
    }
    return best;
}

// ==========================================
// Badugi Evaluation
// 4-card hand; best hand has 4 cards of different suits and ranks
// Fewer matching = worse; within same count, lower cards = better
// ==========================================

function evaluateBadugi(cards) {
    // Find the best badugi hand (largest subset with unique suits and ranks)
    let bestSubset = null;
    let bestSize = 0;
    let bestValue = null;

    for (let size = Math.min(cards.length, 4); size >= 1; size--) {
        const combos = combinations(cards, size);
        for (const combo of combos) {
            const suits = new Set(combo.map(c => c.suit));
            const ranks = new Set(combo.map(c => c.rank === 14 ? 1 : c.rank));
            if (suits.size === combo.length && ranks.size === combo.length) {
                const sortedRanks = combo.map(c => c.rank === 14 ? 1 : c.rank).sort((a, b) => b - a);
                const value = [combo.length, ...sortedRanks.map(r => -r)]; // negative for lower=better
                if (!bestValue || combo.length > bestSize ||
                    (combo.length === bestSize && compareArrays(value, bestValue) > 0)) {
                    bestSubset = combo;
                    bestSize = combo.length;
                    bestValue = value;
                }
            }
        }
        if (bestSubset) break; // Found valid hand at this size
    }

    const name = bestSize === 4 ? 'バドゥーギ' :
                 bestSize === 3 ? 'スリーカード・バドゥーギ' :
                 bestSize === 2 ? 'ツーカード・バドゥーギ' : 'ワンカード';

    return {
        value: bestValue || [0],
        name,
        badugiSize: bestSize,
        cards: bestSubset || [cards[0]]
    };
}

// ==========================================
// Razz Evaluation (A-5 low, best 5 of 7)
// ==========================================

function bestRazz(cards) {
    return bestLowA5(cards, null); // No qualifier for Razz
}

// ==========================================
// Unified evaluation function
// ==========================================

function evaluateHand(gameConfig, playerCards, communityCards) {
    const result = { high: null, low: null };

    switch (gameConfig.id) {
        case 'lhe':
        case 'nlhe':
            result.high = bestHighHand([...playerCards, ...communityCards]);
            break;

        case 'plo':
            result.high = bestOmahaHigh(playerCards, communityCards);
            break;

        case 'o8':
            result.high = bestOmahaHigh(playerCards, communityCards);
            result.low = bestOmahaLow(playerCards, communityCards, 8);
            break;

        case 'stud':
            result.high = bestHighHand(playerCards);
            break;

        case 'stud8':
            result.high = bestHighHand(playerCards);
            result.low = bestLowA5(playerCards, 8);
            break;

        case 'razz': {
            // Razz: best A-5 low hand wins. If no unpaired low, use best high hand (inverted).
            const razzLow = bestRazz(playerCards);
            if (razzLow) {
                result.high = razzLow;
            } else {
                // All combos have pairs - fall back to high hand evaluation (inverted: lower is better)
                const razzHigh = bestHighHand(playerCards);
                if (razzHigh) {
                    razzHigh.value = razzHigh.value.map(v => -v);
                    razzHigh.name = razzHigh.name + ' (ペアあり)';
                }
                result.high = razzHigh;
            }
            break;
        }

        case 'td':
        case 'sd':
            result.high = evaluate5Low27(playerCards);
            break;

        case 'badugi':
            result.high = evaluateBadugi(playerCards);
            break;
    }

    return result;
}

// Compare two hands for the same game
// Returns positive if a wins, negative if b wins, 0 for tie
function compareHands(gameConfig, a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    switch (gameConfig.id) {
        case 'razz':
        case 'td':
        case 'sd':
            // Low games: lower value = better
            return compareArrays(b.value, a.value);
        case 'badugi':
            // Badugi: higher badugi size first, then lower cards
            return compareArrays(a.value, b.value);
        default:
            // High games: higher value = better
            return compareArrays(a.value, b.value);
    }
}

if (typeof module !== 'undefined') module.exports = { combinations, compareArrays, evaluate5High, bestHighHand, bestOmahaHigh, evaluate5LowA5, bestLowA5, bestOmahaLow, evaluate5Low27, bestLow27, evaluateBadugi, bestRazz, evaluateHand, compareHands, HIGH_HAND_NAMES };
