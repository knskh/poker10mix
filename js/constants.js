// js/constants.js — Shared constants used across client code.
// Loaded as a plain script before utils.js / app.js; defines globals on window.

// --- Game rules / thresholds ---
window.APP_CONSTANTS = Object.freeze({
    // Notable-hand auto-share thresholds (must match server.js isNotableHand logic)
    NOTABLE_POT_BB_THRESHOLD:      50,
    NOTABLE_POT_BIG_BET_THRESHOLD: 25,

    // Rebuy / history
    REBUY_AMOUNT:         10000,
    HAND_HISTORY_LIMIT:   30,

    // Multi-table
    MAX_TABLES:           3,

    // Timeline
    TIMELINE_CAP_CLIENT:  100,
    TIMELINE_CAP_SERVER:  200,
    RANKING_TOP_N:        20,
    WEEKLY_WINDOW_MS:     7 * 24 * 60 * 60 * 1000,

    // UI thresholds
    MOBILE_MAX_WIDTH_PX:  600,
    PC_MIN_WIDTH_PX:      768,

    // Screen names (single source of truth)
    SCREEN: Object.freeze({
        LOGIN: 'login',
        SNS:   'sns',
        ROOM:  'room',
        GAME:  'game',
    }),

    // WebSocket client methods → server messages
    MSG: Object.freeze({
        LIKE_POST:     'like_post',
        LIKE_COMMENT:  'like_comment',
        GET_RANKINGS:  'get_rankings',
        POST_HAND:     'post_hand',
        ADD_COMMENT:   'add_comment',
    }),

    // Card rank mapping — canonical numeric ranks (2..14) ↔ display labels
    RANK_LETTER: Object.freeze({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }),
    SUIT_SYMBOL: Object.freeze({ s: '♠', h: '♥', d: '♦', c: '♣' }),
});
