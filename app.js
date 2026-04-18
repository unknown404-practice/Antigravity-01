/**
 * AEGIS v5.7 - TACTICAL SIGNAL IDENTIFIERS
 * Optimized for High-Contrast Dark Operations
 */

class GeocodingService {
    static async search(query) {
        try {
            let eq = query; if (/^\d{6}$/.test(query)) eq = `${query}, India`;
            const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(eq)}`);
            const d = await r.json();
            return d.length > 0 ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), name: d[0].display_name } : null;
        } catch (e) { return null; }
    }
}

class NotificationService {
    static show(msg, type = 'info') {
        const h = document.getElementById('notification-hub'); if (!h) return;
        const t = document.createElement('div'); t.className = 'stat-card';
        t.style.cssText = `pointer-events: auto; min-width: 280px; padding: 12px 20px; border-left: 6px solid ${type === 'error' ? 'var(--error)' : 'var(--primary)'}; box-shadow: var(--elevation-3); animation: toastEnter 0.4s ease; background: var(--bg-surface-variant); margin-bottom: 8px;`;
        t.innerHTML = `<div style="font-weight:700; color:var(--primary); font-size:0.6rem;">SATELLITE SIGNAL</div><div style="font-size:0.8rem;">${msg}</div>`;
        h.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
    }
}

class AegisApp {
    constructor() {
        this.state = {
            isLoggedIn: localStorage.getItem('aegis_auth_active') === 'true',
            user: JSON.parse(localStorage.getItem('aegis_user_profile')) || null,
            theme: localStorage.getItem('aegis_theme') || 'dark',
            incidents: JSON.parse(localStorage.getItem('aegis_incidents')) || [],
            discussions: JSON.parse(localStorage.getItem('aegis_chat')) || {},
            activeThreadId: null,
            activePPT: 'lockdown',
            pptPage: 0,
            viewHistory: ['dashboard'],
            mobileSidebarActive: false
        };
        this.map = null;
        this.markers = {};
        this.lastClickedLatLng = null;
        this.lastAddress = "Tactical Pin";
        this.pptLibrary = this.getPPTLibrary();
        this.init();
    }

    init() {
        this.repairLegacyData();
        this.cacheDOMElements();
        this.applyTheme();
        this.bindEvents();
        
        if (this.state.isLoggedIn && this.state.user) { 
            this.revealApp(); 
            this.initMap(); 
        } else { 
            this.switchAuth('login'); 
            document.getElementById('auth-screen').style.display = 'grid'; 
            // Ensure splash is removed even if not logged in
            setTimeout(() => { if (this.dom.splash) this.dom.splash.remove(); }, 2000);
        }

        setInterval(() => { if (this.dom.time) this.dom.time.innerText = `NODE: ${new Date().toLocaleTimeString()} • SECURE`; }, 1000);
        window.onresize = () => { if (this.map) this.map.invalidateSize(); };
    }

    repairLegacyData() {
        let changed = false;
        Object.keys(this.state.discussions).forEach(tId => {
            this.state.discussions[tId].forEach((m, idx) => { if (!m.id) { m.id = `legacy_${tId}_${idx}_${Date.now()}`; changed = true; } });
        });
        if (changed) this.saveState();
    }

    cacheDOMElements() {
        this.dom = {
            splash: document.getElementById('splash-screen'),
            container: document.querySelector('.app-container'),
            feed: document.getElementById('incident-feed'),
            time: document.getElementById('system-time'),
            pptContent: document.getElementById('ppt-content'),
            threadMsgs: document.getElementById('thread-messages'),
            discussionList: document.getElementById('discussion-list'),
            authScreen: document.getElementById('auth-screen'),
            aside: document.querySelector('aside'),
            activeCount: document.getElementById('stat-active')
        };
    }

    bindEvents() {
        document.getElementById('sidebar-nav').addEventListener('click', (e) => {
            const item = e.target.closest('.nav-item');
            if (item) { e.preventDefault(); this.switchView(item.dataset.target); this.toggleMobileSidebar(false); }
        });
        const mBtn = document.getElementById('mobile-menu-toggle');
        if (mBtn) mBtn.onclick = () => this.toggleMobileSidebar(!this.state.mobileSidebarActive);
        document.getElementById('theme-toggle-btn').onclick = () => this.toggleTheme();
        document.getElementById('ppt-next').onclick = () => this.navigatePPT(1);
        document.getElementById('ppt-prev').onclick = () => this.navigatePPT(-1);
        ['lockdown', 'medical', 'flood'].forEach(t => {
            const i = document.getElementById(`${t}-area`);
            if (i) { i.onkeydown = (e) => { if (e.key === 'Enter') this.handleManualSearch(e.target.value, t); }; i.onblur = (e) => this.handleManualSearch(e.target.value, t); }
        });
        const ci = document.getElementById('thread-input');
        if (ci) ci.onkeydown = (e) => { if (e.key === 'Enter') this.sendMessage(); };
    }

    toggleMobileSidebar(a) {
        this.state.mobileSidebarActive = a;
        if (this.dom.aside) this.dom.aside.classList.toggle('mobile-active', a);
    }

    async handleManualSearch(q, t) {
        if (!q || q.length < 3) return;
        const res = await GeocodingService.search(q);
        if (res) {
            this.lastClickedLatLng = { lat: res.lat, lng: res.lng };
            this.lastAddress = res.name;
            const el = document.getElementById(`${t}-coords`); if (el) el.innerText = `${res.lat.toFixed(4)}, ${res.lng.toFixed(4)}`;
            if (this.map) { this.map.flyTo([res.lat, res.lng], 15); NotificationService.show(`Identified: ${res.name.substring(0, 30)}...`); }
            return true;
        }
        return false;
    }

    switchAuth(v) {
        document.getElementById('auth-login-view').style.display = v === 'login' ? 'block' : 'none';
        document.getElementById('auth-signup-view').style.display = v === 'signup' ? 'block' : 'none';
        document.getElementById('auth-forgot-view').style.display = v === 'forgot' ? 'block' : 'none';
    }

    handleSignUp() {
        const n = document.getElementById('signup-name').value, e = document.getElementById('signup-email').value, p = document.getElementById('signup-pass').value;
        if (!n || !e || !p) return NotificationService.show("Required.", "error");
        localStorage.setItem('aegis_reg_' + e, JSON.stringify({ name: n, email: e, pass: p, pfp: `https://ui-avatars.com/api/?name=${n}` }));
        this.switchAuth('login');
    }

    handleLogin() {
        const e = document.getElementById('login-email').value, p = document.getElementById('login-pass').value;
        const s = JSON.parse(localStorage.getItem('aegis_reg_' + e));
        if (s && s.pass === p) {
            this.state.isLoggedIn = true; this.state.user = s;
            localStorage.setItem('aegis_auth_active', 'true'); localStorage.setItem('aegis_user_profile', JSON.stringify(s));
            this.revealApp(); this.initMap();
        } else NotificationService.show("Denied.", "error");
    }

    revealApp() {
        if (this.dom.splash) this.dom.splash.remove();
        if (this.dom.authScreen) this.dom.authScreen.remove();
        this.dom.container.classList.add('revealed');
        document.getElementById('sidebar-user').innerText = this.state.user.name;
        document.getElementById('user-pfp').src = this.state.user.pfp;
        const nI = document.getElementById('profile-name-input'), eI = document.getElementById('profile-email-input'), pI = document.getElementById('profile-pfp-large');
        if (nI) nI.value = this.state.user.name; if (eI) eI.value = this.state.user.email; if (pI) pI.src = this.state.user.pfp;
        this.refreshUI(); this.renderPPT();
    }

    handleForgotKey() {
        const e = document.getElementById('forgot-email').value;
        if (!e) return NotificationService.show("Email required.", "error");
        
        NotificationService.show("ENCRYPTED SIGNAL SENT");
        const btn = document.getElementById('forgot-btn');
        btn.innerText = "SIGNAL DISPATCHED";
        btn.disabled = true;
        
        setTimeout(() => {
            NotificationService.show(`Recovery link generated for ${e}`);
            // In a real app, this would call a backend API
            console.log(`AEGIS RECOVERY: Verification link sent to ${e}`);
            btn.innerText = "SEND LINK";
            btn.disabled = false;
        }, 2000);
    }

    handlePFP(e) {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = (ev) => {
            const b64 = ev.target.result;
            this.state.user.pfp = b64;
            document.getElementById('user-pfp').src = b64;
            document.getElementById('profile-pfp-large').src = b64;
            this.saveProfile();
        };
        r.readAsDataURL(f);
    }

    saveProfile() {
        const n = document.getElementById('profile-name-input').value;
        if (!n) return NotificationService.show("Name required.", "error");
        
        this.state.user.name = n;
        localStorage.setItem('aegis_user_profile', JSON.stringify(this.state.user));
        localStorage.setItem('aegis_reg_' + this.state.user.email, JSON.stringify(this.state.user));
        
        document.getElementById('sidebar-user').innerText = n;
        NotificationService.show("Profile Updated.");
    }

    handleLogout() { localStorage.clear(); window.location.reload(); }

    initMap() {
        if (this.map) return;
        const mEl = document.getElementById('main-map'); if (!mEl) return;
        this.map = L.map('main-map', { zoomControl: false }).setView([22.57, 88.36], 13);
        const l = this.state.theme === 'dark' ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        L.tileLayer(l).addTo(this.map);
        this.map.on('click', (e) => {
            this.lastClickedLatLng = e.latlng;
            this.lastAddress = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
            document.querySelectorAll('span[id$="-coords"]').forEach(el => el.innerText = this.lastAddress);
        });
        this.syncMarkers();
    }

    moveMap(d) {
        if (!this.map) return;
        const c = this.map.getCenter(), o = 0.01;
        if (d === 'up') c.lat += o; if (d === 'down') c.lat -= o; if (d === 'left') c.lng -= o; if (d === 'right') c.lng += o;
        this.map.panTo(c);
    }

    syncMarkers() {
        if (!this.map) return;
        this.state.incidents.forEach(i => {
            if (!this.markers[i.id]) {
                const icon = L.divIcon({
                    className: 'tactical-marker-container',
                    html: `<div class="tactical-marker-pulse"></div><div class="tactical-marker-core"></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                const m = L.marker([i.lat, i.lng], { icon }).addTo(this.map);
                m.on('click', () => this.focusIncident(i.id));
                this.markers[i.id] = m;
            }
        });
    }

    createSOS() {
        navigator.geolocation.getCurrentPosition(p => this.finalizeIncident("SOS ALERT", p.coords.latitude, p.coords.longitude, "Auto-GPS"), () => NotificationService.show("GPS Needed.", "error"));
    }

    async triggerProtocol(type) {
        const q = document.getElementById(`${type}-area`).value;
        if (!this.lastClickedLatLng && q) {
            NotificationService.show("Locating...");
            const s = await this.handleManualSearch(q, type);
            if (!s) return NotificationService.show("Unknown target.", "error");
        }
        if (!this.lastClickedLatLng) return NotificationService.show("Pin Target.", "error");
        const ex = document.getElementById(`${type}-expiry`).value;
        if (!ex) return NotificationService.show("Set Time.", "error");
        this.finalizeIncident(`${type.toUpperCase()} ACTIVE`, this.lastClickedLatLng.lat, this.lastClickedLatLng.lng, this.lastAddress, new Date().toLocaleTimeString(), ex);
        this.toggleModal(`${type}-modal`, false);
    }

    finalizeIncident(t, lat, lng, addr, lt, ex) {
        const id = 'inc_' + Date.now();
        const inc = { id, title: t, lat, lng, address: addr, creator: this.state.user.email, localTime: lt, expiry: ex };
        this.state.incidents.unshift(inc);
        this.state.discussions[id] = [{ id: 'sys_'+Date.now(), sender: 'System', text: "🔒 ENCRYPTED.", time: new Date().toLocaleTimeString() }];
        this.saveState(); this.refreshUI(); this.syncMarkers();
        NotificationService.show(`${t} deployed.`);
        if (this.map) { setTimeout(() => this.map.invalidateSize(), 100); this.map.flyTo([lat, lng], 14); }
    }

    focusIncident(id) {
        const inc = this.state.incidents.find(i => i.id === id);
        if (inc && this.map) {
            this.switchView('dashboard');
            setTimeout(() => { this.map.invalidateSize(); this.map.flyTo([inc.lat, inc.lng], 16); }, 200);
            this.openChat(id);
        }
    }

    deleteIncident(id) {
        const inc = this.state.incidents.find(i => i.id === id);
        if (inc && inc.creator === this.state.user.email) {
            this.state.incidents = this.state.incidents.filter(i => i.id !== id);
            if (this.markers[id]) { this.map.removeLayer(this.markers[id]); delete this.markers[id]; }
            this.saveState(); this.refreshUI();
            setTimeout(() => { delete this.state.discussions[id]; this.saveState(); if (this.state.activeThreadId === id) this.openChat(null); }, 5000);
        }
    }

    // --- Navigation ---
    switchView(v, isBack = false) {
        if (!isBack && this.state.viewHistory[this.state.viewHistory.length - 1] !== v) this.state.viewHistory.push(v);
        document.querySelectorAll('.view-content').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(`view-${v}`); if (target) target.classList.add('active');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const nav = document.querySelector(`.nav-item[data-target="${v}"]`); if (nav) nav.classList.add('active');
        if (v === 'dashboard' && this.map) setTimeout(() => this.map.invalidateSize(), 300);
    }

    navigateBack() {
        if (this.state.viewHistory.length > 1) { this.state.viewHistory.pop(); this.switchView(this.state.viewHistory[this.state.viewHistory.length - 1], true); }
    }

    // --- Hubs ---
    openChat(id) { this.state.activeThreadId = id; this.renderMessages(); }
    sendMessage() {
        const i = document.getElementById('thread-input'); if (!i.value || !this.state.activeThreadId) return;
        this.state.discussions[this.state.activeThreadId].push({ id: 'msg_'+Date.now(), sender: this.state.user.name, text: i.value, time: new Date().toLocaleTimeString() });
        i.value = ''; this.saveState(); this.renderMessages();
    }
    deleteMessage(mId) {
        if (!this.state.activeThreadId || !mId) return;
        const initialLen = this.state.discussions[this.state.activeThreadId].length;
        this.state.discussions[this.state.activeThreadId] = this.state.discussions[this.state.activeThreadId].filter(m => m.id !== mId);
        if (this.state.discussions[this.state.activeThreadId].length < initialLen) { this.saveState(); this.renderMessages(); NotificationService.show("Message purged."); }
    }
    renderMessages() {
        if (!this.state.activeThreadId || !this.dom.threadMsgs) return;
        const thread = this.state.discussions[this.state.activeThreadId] || [];
        this.dom.threadMsgs.innerHTML = thread.map(m => `
            <div class="chat-msg ${m.sender === this.state.user.name ? 'sent' : 'received'}">
                <small>${m.sender}</small>
                <div>${m.text}</div>
                <small>${m.time}</small>
                ${m.sender === this.state.user.name ? `<button onclick="window.app.deleteMessage('${m.id}')" class="delete-msg-btn"><i class="fas fa-trash-can"></i></button>` : ''}
            </div>
        `).join('');
        this.dom.threadMsgs.scrollTop = this.dom.threadMsgs.scrollHeight;
    }
    loadPPT(t) { this.state.activePPT = t; this.state.pptPage = 0; this.renderPPT(); }
    navigatePPT(d) { const m = this.pptLibrary[this.state.activePPT].pages.length; this.state.pptPage = (this.state.pptPage + d + m) % m; this.renderPPT(); }
    renderPPT() {
        if (!this.dom.pptContent) return;
        const p = this.pptLibrary[this.state.activePPT].pages[this.state.pptPage];
        this.dom.pptContent.innerHTML = `<h1>${p.title}</h1><p>${p.content}</p><ul>${p.points.map(x => `<li>${x}</li>`).join('')}</ul>`;
        document.getElementById('ppt-page-indicator').innerText = `STEP ${this.state.pptPage + 1} / ${this.pptLibrary[this.state.activePPT].pages.length}`;
    }
    getPPTLibrary() { return { lockdown: { pages: [{ title: "Active Defense", content: "Securing perimeter...", points: ["Lock barriers", "Signal safe-zones"] }] }, medical: { pages: [{ title: "Trauma Response", content: "Initial stabilization...", points: ["Apply pressure", "Clear EMS path"] }] }, fire: { pages: [{ title: "Thermal Exit", content: "Safe evacuation...", points: ["Ventilation cut", "Gravity exit"] }] } }; }
    toggleTheme() { this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('aegis_theme', this.state.theme); window.location.reload(); }
    applyTheme() { document.body.className = `theme-${this.state.theme}`; }
    toggleModal(id, show) { document.getElementById(id).style.display = show ? 'grid' : 'none'; }
    saveState() { localStorage.setItem('aegis_incidents', JSON.stringify(this.state.incidents)); localStorage.setItem('aegis_chat', JSON.stringify(this.state.discussions)); }
    refreshUI() {
        if (this.dom.activeCount) { this.dom.activeCount.innerText = this.state.incidents.length; }
        if (this.dom.feed) {
            this.dom.feed.innerHTML = this.state.incidents.map(inc => `
                <div class="incident-item" style="cursor: pointer; padding: 16px; border-radius: 16px; background: var(--bg-surface); margin-bottom: 12px; border: 1px solid var(--outline);">
                    <div style="flex:1" onclick="window.app.focusIncident('${inc.id}')">
                        <strong style="color: var(--primary); display: block;">${inc.title}</strong>
                        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px;">
                            <i class="fas fa-location-dot tactical-bullet"></i> ${inc.address.substring(0, 40)}...
                        </div>
                    </div>
                    <button onclick="window.app.deleteIncident('${inc.id}')" class="action-btn outlined" style="color:var(--error); margin-top: 12px; height: 32px; font-size: 0.7rem;">RESOLVE</button>
                </div>
            `).join('');
        }
        if (this.dom.discussionList) {
            this.dom.discussionList.innerHTML = this.state.incidents.map(inc => `
                <div class="nav-item ${this.state.activeThreadId === inc.id ? 'active' : ''}" onclick="window.app.openChat('${inc.id}')">
                    <div>
                        <div style="font-size: 0.8rem; font-weight: 600;">${inc.title}</div>
                        <div style="font-size: 0.6rem; opacity: 0.6;">${inc.address.substring(0, 20)}...</div>
                    </div>
                </div>
            `).join('');
        }
    }
}
window.onload = () => { window.app = new AegisApp(); };
