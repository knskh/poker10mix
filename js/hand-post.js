// js/hand-post.js — Manual hand post modal (from hand history → timeline).
// Depends on: handHistory (global), client, renderMiniCard, compressForReplay,
// showToast, renderHandHistory, escapeHtml (from utils.js).

let pendingHandPostIdx = -1;

function buildHandDataFromHistory(h, myName) {
    if (!h) return null;
    // Determine my diff (win/loss) and my final hand rank
    let diff = 0;
    const myHandRank = '';
    if (h.handResult && h.handResult.players) {
        const me = h.handResult.players.find(p => p.name === myName);
        if (me) {
            diff = me.chips - me.startChips;
        }
    }
    // Prefer myCardObjs, fallback to startCards
    const myCards = (h.myCardObjs && h.myCardObjs.length > 0) ? h.myCardObjs : (h.startCards || []);
    // Normalize {r,s}/{rank,suit} to canonical {rank,suit}
    const toCard = (c) => normalizeCard(c) || { rank: c.rank || c.r, suit: c.suit || c.s };
    const cc = (h.handResult && Array.isArray(h.handResult.communityCards))
        ? h.handResult.communityCards : (h.communityCardObjs || []);
    return {
        gameName: h.gameName || 'ポーカー',
        handRank: myHandRank,
        pot: diff,           // positive = win, negative = loss
        bigBlind: 100,       // default (history doesn't store bb explicitly)
        winnerCards: myCards.map(toCard),
        communityCards: cc.map(toCard),
        result: diff < 0 ? 'loss' : 'win',
    };
}

function openHandPostModal(idx) {
    const h = handHistory[idx];
    if (!h) return;
    pendingHandPostIdx = idx;
    const data = buildHandDataFromHistory(h, client.name);
    const preview = document.getElementById('hp-preview');
    if (preview) {
        const cardsHtml = (data.winnerCards || []).map(c => renderMiniCard(c)).join('');
        const ccHtml = (data.communityCards || []).map(c => renderMiniCard(c)).join('');
        const sign = data.pot >= 0 ? '+' : '';
        const resultLabel = data.result === 'loss' ? '敗北' : '勝利';
        const potCls = data.pot >= 0 ? 'hp-pot-plus' : 'hp-pot-minus';
        preview.innerHTML = `
            <div class="hp-preview-row">
                <div class="hp-game-tag">${escapeHtml(data.gameName)}</div>
                <div class="hp-pot ${potCls}">${sign}${data.pot.toLocaleString()} <span class="hp-pot-u">chips · ${resultLabel}</span></div>
            </div>
            ${cardsHtml ? `<div class="hp-cards-row"><span class="hp-cards-label">あなたの手札</span><div class="hp-cards">${cardsHtml}</div></div>` : ''}
            ${ccHtml ? `<div class="hp-cards-row"><span class="hp-cards-label">コミュニティ</span><div class="hp-cards">${ccHtml}</div></div>` : ''}
        `;
    }
    const captionEl = document.getElementById('hp-caption');
    if (captionEl) captionEl.value = '';
    document.getElementById('hand-post-modal').classList.remove('hidden');
    if (captionEl) setTimeout(() => captionEl.focus(), 50);
}

function closeHandPostModal() {
    document.getElementById('hand-post-modal').classList.add('hidden');
    pendingHandPostIdx = -1;
}

async function buildReplayHashFromHistory(idx) {
    // Mirror buildReplayURL but return just the compressed hash (no URL).
    const h = handHistory[idx];
    if (!h || !h.handResult) return '';
    try {
        const hr = h.handResult;
        const data = {
            g: hr.gameName, t: hr.gameType,
            c: hr.communityCards, d: hr.dealerSeat,
            p: hr.players.map(p => ({
                n: p.name, o: p.position, f: p.folded ? 1 : 0,
                c: p.chips, s: p.startChips,
                h: p.cards, u: p.upCards, w: p.downCards,
            })),
            l: h.logs || [],
            ds: hr.drawSnapshots,
        };
        return await compressForReplay(JSON.stringify(data));
    } catch (e) {
        console.warn('buildReplayHashFromHistory failed:', e);
        return '';
    }
}

async function submitHandPost() {
    if (pendingHandPostIdx < 0) return;
    const h = handHistory[pendingHandPostIdx];
    if (!h) return;
    const caption = (document.getElementById('hp-caption').value || '').trim();
    const handData = buildHandDataFromHistory(h, client.name);
    // Also build replay hash so viewers can replay the hand
    const replayHash = await buildReplayHashFromHistory(pendingHandPostIdx);
    client.postHand(handData, caption, replayHash);
    showToast('タイムラインに投稿しました');
    closeHandPostModal();
    // Close history modal too so user sees the feed
    const histModal = document.getElementById('history-modal');
    if (histModal) histModal.classList.add('hidden');
}

function setupHandPostModal() {
    const closeBtn = document.getElementById('btn-hp-close');
    if (closeBtn) closeBtn.addEventListener('click', closeHandPostModal);
    const cancelBtn = document.getElementById('btn-hp-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeHandPostModal);
    const submitBtn = document.getElementById('btn-hp-submit');
    if (submitBtn) submitBtn.addEventListener('click', submitHandPost);
    const bd = document.querySelector('#hand-post-modal .rp-backdrop');
    if (bd) bd.addEventListener('click', closeHandPostModal);
    // Timeline header "📝 ハンド投稿" button → open hand history modal
    const headerPostBtn = document.getElementById('mx-btn-post-hand');
    if (headerPostBtn) headerPostBtn.addEventListener('click', () => {
        renderHandHistory('lobby-hand-history');
        document.getElementById('history-modal').classList.remove('hidden');
    });
}
