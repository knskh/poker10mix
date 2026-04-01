// js/client.js - WebSocket Client
class PokerClient {
    constructor() {
        this.ws = null;
        this.clientId = null;
        this.name = '';
        this.roomId = null;
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
                this.emit('room_list', msg.rooms);
                break;
            case 'room_joined':
                this.roomId = msg.room.id;
                this.emit('room_joined', msg.room);
                break;
            case 'room_updated':
                this.emit('room_updated', msg.room);
                break;
            case 'room_left':
                this.roomId = null;
                this.emit('room_left');
                break;
            case 'game_started':
                this.emit('game_started');
                break;
            case 'game_state':
                this.emit('game_state', msg.state);
                break;
            case 'your_turn':
                this.emit('your_turn', { actions: msg.actions, timeLimit: msg.timeLimit });
                break;
            case 'your_draw':
                this.emit('your_draw', { hand: msg.hand, timeLimit: msg.timeLimit });
                break;
            case 'log':
                this.emit('log', { message: msg.message, cls: msg.cls });
                break;
            case 'chat':
                this.emit('chat', { from: msg.from, message: msg.message });
                break;
            case 'game_over':
                this.emit('game_over', msg);
                break;
            case 'stats_data':
                this.emit('stats_data', msg);
                break;
            case 'error':
                this.emit('error', msg.message);
                break;
        }
    }

    setName(name) { this.name = name; this.send({ type: 'set_name', name }); }
    createRoom() { this.send({ type: 'create_room' }); }
    joinRoom(roomId) { this.send({ type: 'join_room', roomId }); }
    leaveRoom() { this.send({ type: 'leave_room' }); }
    updateSettings(settings) { this.send({ type: 'update_settings', settings }); }
    startGame() { this.send({ type: 'start_game' }); }
    sendAction(action) { this.send({ type: 'action', action }); }
    sendDraw(discards) { this.send({ type: 'draw', discards }); }
    sendChat(message) { this.send({ type: 'chat', message }); }
    getStats() { this.send({ type: 'get_stats' }); }
    getRooms() { this.send({ type: 'get_rooms' }); }
}
