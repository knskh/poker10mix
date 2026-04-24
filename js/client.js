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
        // Queued outbound messages for sends that happen before the WebSocket
        // is OPEN (e.g. login clicked during the 3-second reconnect window).
        // These are flushed in order on the next onopen.
        this._outQueue = [];
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
            // Flush queued messages (login/register etc. that were attempted
            // before the socket finished opening).
            while (this._outQueue.length > 0) {
                try { this.ws.send(JSON.stringify(this._outQueue.shift())); } catch { break; }
            }
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
            return;
        }
        // Queue until the socket is open. Keep the queue bounded so a
        // long-running disconnection can't eat all memory. Important enough
        // for auth flows that we don't want silent drops.
        if (this._outQueue.length < 50) this._outQueue.push(data);
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
            case 'leave_reserved':
                this.emit('leave_reserved', msg);
                break;
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
            // lobby_chat removed — no lobby chat feature
            case 'online_users':
                this.emit('online_users', { users: msg.users, following: msg.following || [] });
                break;
            case 'follows':
                this.emit('follows', msg);
                break;
            case 'followed_by':
                this.emit('followed_by', msg);
                break;
            case 'timeline':
                this.emit('timeline', msg.posts || []);
                break;
            case 'timeline_post':
                this.emit('timeline_post', msg.post);
                break;
            case 'timeline_comment':
                this.emit('timeline_comment', msg);
                break;
            case 'post_created':
                this.emit('post_created', msg.post);
                break;
            case 'auto_shared':
                this.emit('auto_shared', msg.post);
                break;
            case 'profile_data':
                this.emit('profile_data', msg.profile);
                break;
            case 'footprints':
                this.emit('footprints', msg.footprints || []);
                break;
            case 'new_footprint':
                this.emit('new_footprint', msg);
                break;
            // dm / dm_sent / dm_failed removed — DM feature removed
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
            case 'post_liked':
                this.emit('post_liked', msg);
                break;
            case 'comment_liked':
                this.emit('comment_liked', msg);
                break;
            case 'rankings':
                this.emit('rankings', msg);
                break;
            case 'error':
                this.emit('error', msg.message);
                break;
        }
    }

    setName(name, avatar, isGuest) { this.name = name; this.avatar = avatar; this.send({ type: 'set_name', name, avatar, isGuest: !!isGuest }); }
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
    rebuyFromBust(roomId) { this.send({ type: 'rebuy_from_bust', roomId: roomId || this.roomId }); }
    leaveFromBust(roomId) { this.send({ type: 'leave_from_bust', roomId: roomId || this.roomId }); }
    endTableNow(roomId) { this.send({ type: 'end_table_now', roomId: roomId || this.roomId }); }
    getStats(roomId) { this.send({ type: 'get_stats', roomId: roomId || this.roomId }); }
    getRooms() { this.send({ type: 'get_rooms' }); }
    toggleLock(locked, roomId) { this.send({ type: 'toggle_lock', locked, roomId: roomId || this.roomId }); }
    approveJoin(targetId, roomId) { this.send({ type: 'approve_join', targetId, roomId: roomId || this.roomId }); }
    rejectJoin(targetId, roomId) { this.send({ type: 'reject_join', targetId, roomId: roomId || this.roomId }); }
    cancelJoin(roomId) { this.send({ type: 'cancel_join', roomId }); }
    follow(target) { this.send({ type: 'follow', target }); }
    unfollow(target) { this.send({ type: 'unfollow', target }); }
    getFollows() { this.send({ type: 'get_follows' }); }
    getTimeline() { this.send({ type: 'get_timeline' }); }
    createPost(title, body, mood) { this.send({ type: 'create_post', title, body, mood }); }
    postHand(handData, caption, replayHash) { this.send({ type: 'post_hand', handData, caption: caption || '', replayHash: replayHash || '' }); }
    addComment(postId, body, parentCommentId) { this.send({ type: 'add_comment', postId, body, parentCommentId: parentCommentId != null ? parentCommentId : null }); }
    likePost(postId) { this.send({ type: 'like_post', postId }); }
    likeComment(postId, commentId) { this.send({ type: 'like_comment', postId, commentId }); }
    getRankings(period) { this.send({ type: 'get_rankings', period: period === 'weekly' ? 'weekly' : 'all' }); }
    viewProfile(target) { this.send({ type: 'view_profile', target }); }
    getFootprints() { this.send({ type: 'get_footprints' }); }
}
