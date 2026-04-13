// js/auth.js - Authentication System (localStorage-based)

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.load();
    }

    load() {
        try {
            const session = localStorage.getItem('poker10mix_session');
            if (session) this.currentUser = JSON.parse(session);
        } catch (e) { /* ignore */ }
    }

    save() {
        try {
            if (this.currentUser) {
                localStorage.setItem('poker10mix_session', JSON.stringify(this.currentUser));
            } else {
                localStorage.removeItem('poker10mix_session');
            }
        } catch (e) { /* ignore */ }
    }

    getAccounts() {
        try {
            const raw = localStorage.getItem('poker10mix_accounts');
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    saveAccounts(accounts) {
        try {
            localStorage.setItem('poker10mix_accounts', JSON.stringify(accounts));
        } catch (e) { /* ignore */ }
    }

    // Create account with username/password
    register(username, password, displayName) {
        if (!username || !password) return { ok: false, error: 'ユーザー名とパスワードを入力してください' };
        if (username.length < 2) return { ok: false, error: 'ユーザー名は2文字以上' };
        if (password.length < 4) return { ok: false, error: 'パスワードは4文字以上' };

        const accounts = this.getAccounts();
        if (accounts[username]) return { ok: false, error: 'このユーザー名は既に使われています' };

        accounts[username] = {
            password: this.hash(password),
            displayName: displayName || username,
            provider: 'local',
            createdAt: Date.now(),
        };
        this.saveAccounts(accounts);

        this.currentUser = { username, displayName: displayName || username, provider: 'local' };
        this.save();
        return { ok: true };
    }

    // Login with username/password
    login(username, password) {
        const accounts = this.getAccounts();
        const acc = accounts[username];
        if (!acc) return { ok: false, error: 'アカウントが見つかりません' };
        if (acc.password !== this.hash(password)) return { ok: false, error: 'パスワードが違います' };

        this.currentUser = { username, displayName: acc.displayName, provider: acc.provider };
        this.save();
        return { ok: true };
    }

    // Google-style login (simulated - creates/logs in with Google profile)
    googleLogin(displayName, email) {
        const username = 'google_' + (email || 'user_' + Date.now());
        const accounts = this.getAccounts();

        if (!accounts[username]) {
            accounts[username] = {
                password: this.hash('google_oauth_' + username),
                displayName: displayName || email.split('@')[0],
                email,
                provider: 'google',
                createdAt: Date.now(),
            };
            this.saveAccounts(accounts);
        }

        this.currentUser = {
            username,
            displayName: accounts[username].displayName,
            email,
            provider: 'google',
        };
        this.save();
        return { ok: true };
    }

    logout() {
        this.currentUser = null;
        this.save();
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    // Change password
    changePassword(oldPassword, newPassword) {
        if (!this.currentUser) return { ok: false, error: 'ログインしてください' };
        const accounts = this.getAccounts();
        const acc = accounts[this.currentUser.username];
        if (!acc) return { ok: false, error: 'アカウントエラー' };
        if (acc.provider === 'google') return { ok: false, error: 'Googleアカウントのパスワードは変更できません' };
        if (acc.password !== this.hash(oldPassword)) return { ok: false, error: '現在のパスワードが違います' };
        if (newPassword.length < 4) return { ok: false, error: '新パスワードは4文字以上' };

        acc.password = this.hash(newPassword);
        this.saveAccounts(accounts);
        return { ok: true };
    }

    // Simple hash (not cryptographically secure - fine for a local game)
    hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            h = ((h << 5) - h) + c;
            h |= 0;
        }
        return 'h_' + h.toString(36);
    }
}

const auth = new AuthManager();
