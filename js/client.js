// js/client.js - WebSocket Client
class PokerClient {
    constructor() {
        this.ws = null;
        this.clientId = null;
        this.name = '';
        this.roomId = null;
        this.roomIds = []; // multi-table: up to 3
        this.connected = false;
        this.handlers = {};
        this.reconnectTimer = null;
    }

    on(event, fn) { this.handlers[event] = fn; }
    emit(event, data) { if (this.handlers[event]) this.handlers[event](data); }

    connect() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        this.ws = new WebSocket(`${proto}://${location.host}`);

        this.ws.onopen = () => {
            this.connected = true;
            if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
            this.emit('connected');
            if (this.name) this.send({ type: 'set_name', name: this.name });
        };

        this.ws.onmessage = (e) => {
            let msg;
            try { msg = JSON.parse(e.data); } catch (err) { return; }
            this.handleMessage(msg);
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.emit('disconnected');
            // Auto-reconnect
            this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = () => {};
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'welcome':
                this.clientId = msg.clientId;
                this.emit('welcome', msg);
                break;
            case 'name_set':
                this.name = msg.name;
                break;
            case 'room_list':
                this.emit('room_list', { rooms: msg.rooms, zoomCount: msg.zoomCount || 0 });
                break;
            case 'room_joined':
                if (msg.roomId) {
                    this.roomId = msg.roomId;
                    if (!this.roomIds.includes(msg.roomId)) this.roomIds.push(msg.roomId);
                } else {
                    this.roomId = msg.room.id;
                    if (!this.roomIds.includes(msg.room.id)) this.roomIds.push(msg.room.id);
                }
                this.emit('room_joined', msg);
                break;
            case 'room_updated':
                this.emit('room_updated', msg);
                break;
            case 'room_left': {
                const leftId = msg.roomId || this.roomId;
                this.roomIds = this.roomIds.filter(id => id !== leftId);
                this.roomId = this.roomIds.length > 0 ? this.roomIds[this.roomIds.length - 1] : null;
                this.emit('room_left', msg);
                break;
            }
            case 'game_started':
                this.emit('game_started', msg);
                break;
            case 'hand_start':
                this.emit('hand_start', msg);
                break;
            case 'game_state':
                this.emit('game_state', msg);
                break;
            case 'your_turn':
                this.emit('your_turn', msg);
                break;
            case 'your_draw':
                this.emit('your_draw', msg);
                break;
            case 'log':
                this.emit('log', msg);
                break;
            case 'chat':
                this.emit('chat', msg);
                break;
            case 'lobby_chat':
                this.emit('lobby_chat', { from: msg.from, message: msg.message });
                break;
            case 'online_users':
                this.emit('online_users', msg.users);
                break;
            case 'dm':
                this.emit('dm', msg);
                break;
            case 'dm_sent':
                this.emit('dm_sent', msg);
                break;
            case 'dm_failed':
                this.emit('dm_failed', msg);
                break;
            case 'game_over':
                this.emit('game_over', msg);
                break;
            case 'stats_data':
                this.emit('stats_data', msg);
                break;
            case 'hand_result':
                this.emit('hand_result', msg);
                break;
            case 'stats_update':
                this.emit('stats_update', msg);
                break;
            case 'auth_result':
                this.emit('auth_result', msg);
                break;
            case 'zoom_joined':
                this.emit('zoom_joined');
                break;
            case 'zoom_waiting':
                this.emit('zoom_waiting', msg);
                break;
            case 'zoom_left':
                this.emit('zoom_left');
                break;
            case 'zoom_sitout':
                this.emit('zoom_sitout');
                break;
            case 'emote':
                this.emit('emote', msg);
                break;
            case 'reaction':
                this.emit('reaction', msg);
                break;
            case 'big_hand':
                this.emit('big_hand', msg);
                break;
            case 'auto_kicked':
                this.emit('auto_kicked');
                break;
            case 'join_pending':
                this.emit('join_pending', msg);
                break;
            case 'join_rejected':
                this.emit('join_rejected', msg);
                break;
            case 'join_cancelled':
                this.emit('join_cancelled', msg);
                break;
            case 'join_request':
                this.emit('join_request', msg);
                break;
            case 'join_request_cancelled':
                this.emit('join_request_cancelled', msg);
                break;
            case 'error':
                this.emit('error', msg.message);
                break;
        }
    }

    setName(name, avatar, isGuest) { this.name = name; this.avatar = avatar; this.send({ type: 'set_name', name, avatar, isGuest: !!isGuest }); }
    sendDM(to, message) { this.send({ type: 'dm', to, message }); }
    createRoom() { this.send({ type: 'create_room' }); }
    joinZoom() { this.send({ type: 'join_zoom' }); }
    leaveZoom() { this.send({ type: 'leave_zoom' }); }
    zoomSitout() { this.send({ type: 'zoom_sitout' }); }
    zoomRejoin() { this.send({ type: 'zoom_rejoin' }); }
    joinRoom(roomId) { this.send({ type: 'join_room', roomId }); }
    leaveRoom(roomId) { this.send({ type: 'leave_room', roomId: roomId || this.roomId }); }
    updateSettings(settings, roomId) { this.send({ type: 'update_settings', settings, roomId: roomId || this.roomId }); }
    startGame(roomId) { this.send({ type: 'start_game', roomId: roomId || this.roomId }); }
    sendAction(action, roomId) { this.send({ type: 'action', action, roomId: roomId || this.roomId }); }
    sendDraw(discards, roomId) { this.send({ type: 'draw', discards, roomId: roomId || this.roomId }); }
    sendChat(message, roomId) { this.send({ type: 'chat', message, roomId: roomId || this.roomId }); }
    rejoinGame(roomId) { this.send({ type: 'rejoin_game', roomId: roomId || this.roomId }); }
    sitoutRequest(roomId) { this.send({ type: 'sitout_request', roomId: roomId || this.roomId }); }
    sendEmote(emote, roomId) { this.send({ type: 'emote', emote, roomId: roomId || this.roomId }); }
    sendReaction(emote, roomId) { this.send({ type: 'reaction', emote, roomId: roomId || this.roomId }); }
    rebuyChips(amount, roomId) { this.send({ type: 'rebuy_chips', amount, roomId: roomId || this.roomId }); }
    getStats(roomId) { this.send({ type: 'get_stats', roomId: roomId || this.roomId }); }
    getRooms() { this.send({ type: 'get_rooms' }); }
    toggleLock(locked, roomId) { this.send({ type: 'toggle_lock', locked, roomId: roomId || this.roomId }); }
    approveJoin(targetId, roomId) { this.send({ type: 'approve_join', targetId, roomId: roomId || this.roomId }); }
    rejectJoin(targetId, roomId) { this.send({ type: 'reject_join', targetId, roomId: roomId || this.roomId }); }
    cancelJoin(roomId) { this.send({ type: 'cancel_join', roomId }); }
}
