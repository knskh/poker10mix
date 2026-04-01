// js/deck.js - Card and Deck Management

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_CHARS = { 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9', 10:'T', 11:'J', 12:'Q', 13:'K', 14:'A' };
const RANK_NAMES = { 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A' };
const SUIT_SYMBOLS = { s:'♠', h:'♥', d:'♦', c:'♣' };
const SUIT_NAMES = { s:'スペード', h:'ハート', d:'ダイヤ', c:'クラブ' };
const SUIT_COLORS = { s:'#1a1a2e', h:'#e63946', d:'#2a9d8f', c:'#457b9d' };

function createCard(rank, suit) {
    return { rank, suit };
}

function cardKey(card) {
    return RANK_CHARS[card.rank] + card.suit;
}

function cardDisplay(card) {
    return RANK_NAMES[card.rank] + SUIT_SYMBOLS[card.suit];
}

function cardsEqual(a, b) {
    return a.rank === b.rank && a.suit === b.suit;
}

function createFullDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(createCard(rank, suit));
        }
    }
    return deck;
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

class Deck {
    constructor() {
        this.reset();
    }

    reset() {
        this.cards = shuffleArray(createFullDeck());
        this.index = 0;
        this.discards = [];
    }

    deal(count) {
        if (count === undefined || count === 1) {
            if (this.index >= this.cards.length) this.reshuffleDiscards();
            return this.cards[this.index++];
        }
        // Ensure enough cards
        if (this.index + count > this.cards.length) {
            this.reshuffleDiscards();
        }
        const available = Math.min(count, this.cards.length - this.index);
        const cards = this.cards.slice(this.index, this.index + available);
        this.index += available;
        return cards;
    }

    remaining() {
        return this.cards.length - this.index;
    }

    addDiscards(cards) {
        this.discards.push(...cards);
    }

    reshuffleDiscards() {
        if (this.discards.length === 0) return;
        const reshuffled = shuffleArray(this.discards);
        this.cards = this.cards.slice(0, this.index).concat(reshuffled);
        this.discards = [];
    }
}

if (typeof module !== 'undefined') module.exports = { SUITS, RANKS, RANK_CHARS, RANK_NAMES, SUIT_SYMBOLS, SUIT_NAMES, SUIT_COLORS, Deck, createCard, cardKey, cardDisplay, cardsEqual, createFullDeck, shuffleArray };
