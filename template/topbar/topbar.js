window._renderTopbarImpl = function() {
    const TOPBAR_HTML = `
    <header class="topbar">
        <div class="d-flex align-items-center gap-2">
            <img src="assets/icon.png" onerror="this.src='template/bcs-logo.svg'" alt="BCS" style="width: 36px; height: 36px; border-radius: 9px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(0, 229, 255, 0.45));">
            <h4 class="mb-0 fw-bold fs-5" style="background: linear-gradient(135deg, #00e5ff, var(--win-accent, #6366f1)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">BCS Enterprise</h4>
            <span id="topbarVersionBadge" class="badge bg-secondary bg-opacity-25 text-muted border border-secondary border-opacity-25 small" style="font-size: 0.72rem;">v2.3.5</span>
            <div id="topbarUpdateContainer" class="d-inline-flex align-items-center ms-2"></div>
        </div>

        <div class="d-flex align-items-center gap-2">
            <!-- Live Date & 12-Hour Time with Seconds Clock (DD/MM/YYYY hh:mm:ss AM/PM) -->
            <div id="topbarLiveClock" class="topbar-clock-badge" title="Current System Time (DD/MM/YYYY hh:mm:ss AM/PM)">
                <i class="bi bi-clock-history text-info" style="font-size: 0.88rem;"></i>
                <span id="topbarDatePart" class="text-white-50">--/--/----</span>
                <span style="opacity: 0.4;">•</span>
                <span id="topbarTimePart" class="text-white fw-bold">--:--:-- --</span>
            </div>

            <!-- Button 1: Dedicated AI Studio Page Link -->
            <a href="ai.html" id="topbarAiPageLink" class="btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill" style="background: linear-gradient(135deg, rgba(0, 229, 255, 0.16), rgba(var(--win-accent-rgb, 99, 102, 241), 0.22)); border: 1px solid rgba(0, 229, 255, 0.45); color: #00e5ff; font-size: 0.78rem; font-weight: 700; text-decoration: none;" title="Open BCS AI Intelligence Studio (Full Page)">
                <i class="bi bi-stars" style="font-size: 0.88rem;"></i>
                <span style="color: #ffffff;">AI Studio</span>
            </a>

            <!-- Button 2: Quick Slide-Out Copilot Drawer Trigger -->
            <button type="button" id="topbarAiCopilotBtn" class="btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill" style="background: rgba(var(--win-accent-rgb, 99, 102, 241), 0.14); border: 1px solid rgba(var(--win-accent-rgb, 99, 102, 241), 0.35); color: inherit; font-size: 0.78rem; font-weight: 600;" onclick="if(window.BCSAICopilot) window.BCSAICopilot.toggle();" title="Toggle Internal Screen AI Copilot Drawer (Ctrl+Shift+A)">
                <i class="bi bi-robot" style="color: var(--win-accent, #6366f1); font-size: 0.88rem;"></i>
                <span>Copilot</span>
                <span id="topbarAiQuotaBadge" class="badge rounded-pill bg-dark bg-opacity-50 text-info border border-info border-opacity-25" style="font-size: 0.68rem;">150/hr</span>
            </button>

            <!-- Windows 11 OS Theme & Accent Color Sync Pill -->
            <button type="button" id="topbarThemeSyncBtn" class="btn btn-sm d-inline-flex align-items-center gap-2 px-2 py-1 rounded-pill" style="background: rgba(var(--win-accent-rgb, 99, 102, 241), 0.12); border: 1px solid rgba(var(--win-accent-rgb, 99, 102, 241), 0.25); color: inherit; font-size: 0.76rem; font-weight: 600;" onclick="if(window.BCSTheme) window.BCSTheme.cycleTheme();" title="Toggle Theme: Windows 11 Sync / Dark / Light">
                <span id="topbarAccentDot" style="width: 7px; height: 7px; border-radius: 50%; background: var(--win-accent, #6366f1); box-shadow: 0 0 6px var(--win-accent, #6366f1); display: inline-block;"></span>
                <i id="topbarThemeIcon" class="bi bi-windows" style="color: var(--win-accent, #6366f1); font-size: 0.82rem;"></i>
                <span id="topbarThemeLabel">Win11</span>
            </button>

            <div class="user-profile px-2 py-1">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--win-accent, #6366f1), #a855f7); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.85rem;" id="topbarUserInitial">
                    A
                </div>
                <div>
                    <div class="fw-semibold" style="font-size: 0.82rem; line-height: 1.1;" id="topbarUserName">Admin</div>
                    <small class="text-muted" style="font-size: 0.7rem;" id="topbarUserRole">Admin</small>
                </div>
            </div>
            <button class="btn logout-btn py-1 px-3" style="font-size: 0.78rem;" onclick="if(window.handleSmartLogout) window.handleSmartLogout(); else if(window.logoutUser) window.logoutUser(); else window.location.href='index.html';">
                <i class="bi bi-box-arrow-right" style="font-size: 0.85rem;"></i> Logout
            </button>
        </div>
    </header>
    `;
    
    if (!document.querySelector('.topbar')) {
        document.body.insertAdjacentHTML('afterbegin', TOPBAR_HTML);
        
        // Populate user details from localStorage
        const userName = localStorage.getItem('loggedInUserName') || 'Admin';
        const userRole = localStorage.getItem('userRole') || 'Administrator';
        const nameEl = document.getElementById('topbarUserName');
        const roleEl = document.getElementById('topbarUserRole');
        const initEl = document.getElementById('topbarUserInitial');
        if (nameEl) nameEl.textContent = userName;
        if (roleEl) roleEl.textContent = String(userRole).charAt(0).toUpperCase() + String(userRole).slice(1);
        if (initEl) initEl.textContent = userName.charAt(0).toUpperCase();

        // Sync Topbar Theme Pill with current BCSTheme state
        if (window.BCSTheme && window.BCSTheme.state) {
            window.BCSTheme.apply(window.BCSTheme.state);
        }

        // Live Date & 12-Hour Clock with Seconds (DD/MM/YYYY hh:mm:ss AM/PM)
        const updateClock = () => {
            const now = new Date();
            const dd = String(now.getDate()).padStart(2, '0');
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const yyyy = now.getFullYear();

            let hours = now.getHours();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // 0 hour is 12 AM
            const hhStr = String(hours).padStart(2, '0');
            const minStr = String(now.getMinutes()).padStart(2, '0');
            const secStr = String(now.getSeconds()).padStart(2, '0');

            const dateEl = document.getElementById('topbarDatePart');
            const timeEl = document.getElementById('topbarTimePart');
            if (dateEl) dateEl.textContent = `${dd}/${mm}/${yyyy}`;
            if (timeEl) timeEl.textContent = `${hhStr}:${minStr}:${secStr} ${ampm}`;
        };

        updateClock();
        if (window._topbarClockInterval) clearInterval(window._topbarClockInterval);
        window._topbarClockInterval = setInterval(updateClock, 1000);
    }

    // Load active version and bind updater listeners
    if (typeof require !== 'undefined') {
        try {
            const { ipcRenderer } = require('electron');
            const versionBadge = document.getElementById('topbarVersionBadge');

            ipcRenderer.invoke('get_app_version').then(ver => {
                if (ver && versionBadge) {
                    versionBadge.textContent = `v${ver}`;
                }
            }).catch(() => {});
        } catch (e) {}
    }
};

// Next-Gen Holographic Update Trigger (No browser confirm dialogs)
window.promptInstallUpdate = function(version) {
    if (window.openBcsUpdateModal) {
        window.openBcsUpdateModal({ version: version });
    } else if (window.applyBcsUpdateAndRestart) {
        window.applyBcsUpdateAndRestart();
    }
};
