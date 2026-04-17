// js/dm.js — Direct Message modal + localStorage history.
// Depends on: client (WebSocket), showToast (defined in app.js).

const DM_STORAGE_KEY = 'poker10mix_dm_history';
const DM_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
let currentDMTarget = null;
const dmUnread = new Set();

function getDMHistory() {
    try {
        const raw = localStorage.getItem(DM_STORAGE_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw);
        // Purge expired messages
        const now = Date.now();
        let changed = false;
        for (const name in data) {
            const before = data[name].length;
            data[name] = data[name].filter(m => now - m.ts < DM_EXPIRY_MS);
            if (data[name].length === 0) { delete data[name]; changed = true; }
            else if (data[name].length !== before) changed = true;
        }
        if (changed) localStorage.setItem(DM_STORAGE_KEY, JSON.stringify(data));
        return data;
    } catch { return {}; }
}

function saveDMMessage(partnerName, msg) {
    const history = getDMHistory();
    if (!history[partnerName]) history[partnerName] = [];
    history[partnerName].push(msg);
    localStorage.setItem(DM_STORAGE_KEY, JSON.stringify(history));
}

function formatDMTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function openDMModal(targetName) {
    currentDMTarget = targetName;
    dmUnread.delete(targetName);

    const modal = document.getElementById('dm-modal');
    const title = document.getElementById('dm-modal-title');
    const input = document.getElementById('dm-input');

    title.textContent = targetName + ' とのDM';
    modal.classList.remove('hidden');

    renderDMMessages(targetName);
    input.value = '';
    setTimeout(() => input.focus(), 100);
}

function closeDMModal() {
    document.getElementById('dm-modal').classList.add('hidden');
    currentDMTarget = null;
}

function renderDMMessages(targetName) {
    const body = document.getElementById('dm-modal-body');
    const history = getDMHistory();
    const msgs = history[targetName] || [];

    body.innerHTML = '';
    if (msgs.length === 0) {
        body.innerHTML = '<div class="dm-empty">メッセージはまだありません</div>';
        return;
    }

    for (const m of msgs) {
        const div = document.createElement('div');
        div.className = 'dm-msg';
        const isMe = m.from === client.name;
        div.innerHTML = `<span class="dm-msg-from ${isMe ? 'me' : 'other'}">${m.from}:</span>${m.message}<span class="dm-msg-time">${formatDMTime(m.ts)}</span>`;
        body.appendChild(div);
    }
    body.scrollTop = body.scrollHeight;
}

function setupDMModal() {
    document.getElementById('dm-modal-close').addEventListener('click', closeDMModal);
    document.getElementById('dm-modal').addEventListener('click', (e) => {
        if (e.target.id === 'dm-modal') closeDMModal();
    });

    const input = document.getElementById('dm-input');
    const sendBtn = document.getElementById('btn-dm-send');

    function sendDM() {
        const text = input.value.trim();
        if (!text || !currentDMTarget) return;
        client.sendDM(currentDMTarget, text);
        input.value = '';
        input.focus();
    }

    sendBtn.addEventListener('click', sendDM);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendDM();
    });

    // Receive DM
    client.on('dm', (msg) => {
        const m = { from: msg.from, message: msg.message, ts: msg.ts };
        saveDMMessage(msg.from, m);
        if (currentDMTarget === msg.from) {
            renderDMMessages(msg.from);
        } else {
            dmUnread.add(msg.from);
        }
    });

    // DM sent confirmation
    client.on('dm_sent', (msg) => {
        const m = { from: client.name, message: msg.message, ts: msg.ts };
        saveDMMessage(msg.to, m);
        if (currentDMTarget === msg.to) {
            renderDMMessages(msg.to);
        }
    });

    // DM failed
    client.on('dm_failed', (msg) => {
        if (currentDMTarget === msg.to) {
            const body = document.getElementById('dm-modal-body');
            const div = document.createElement('div');
            div.className = 'dm-msg';
            div.innerHTML = `<span style="color:#ef5350;font-size:11px">⚠ ${msg.to} は${msg.reason}</span>`;
            body.appendChild(div);
            body.scrollTop = body.scrollHeight;
        }
    });
}
