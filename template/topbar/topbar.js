window._renderTopbarImpl = function() {
    const TOPBAR_HTML = `
    <header class="topbar">
        <div class="d-flex align-items-center gap-2">
            <img src="assets/icon.png" onerror="this.src='template/bcs-logo.svg'" alt="BCS" style="width: 40px; height: 40px; border-radius: 9px; object-fit: contain; filter: drop-shadow(0 0 12px rgba(0, 229, 255, 0.45));">
            <h4 class="mb-0 fw-bold" style="background: linear-gradient(135deg, #00e5ff, var(--win-accent, #6366f1)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">BCS Enterprise</h4>
            <span id="topbarVersionBadge" class="badge bg-secondary bg-opacity-25 text-muted border border-secondary border-opacity-25 small" style="font-size: 0.75rem;">v2.3.4</span>
            <div id="topbarUpdateContainer" class="d-inline-flex align-items-center ms-2"></div>
        </div>
        <div class="d-flex align-items-center gap-3">
            <!-- Dedicated AI Studio Page Link -->
            <a href="ai.html" id="topbarAiPageLink" class="btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill" style="background: linear-gradient(135deg, rgba(0, 229, 255, 0.16), rgba(var(--win-accent-rgb, 99, 102, 241), 0.22)); border: 1px solid rgba(0, 229, 255, 0.45); color: #00e5ff; font-size: 0.78rem; font-weight: 700; text-decoration: none;" title="Open BCS AI Intelligence Studio (Full Page)">
                <i class="bi bi-stars"></i>
                <span style="color: #ffffff;">AI Studio</span>
            </a>

            <!-- BCS Groq AI Copilot Quick Drawer Trigger -->
            <button type="button" id="topbarAiCopilotBtn" class="btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill" style="background: rgba(var(--win-accent-rgb, 99, 102, 241), 0.12); border: 1px solid rgba(var(--win-accent-rgb, 99, 102, 241), 0.32); color: inherit; font-size: 0.78rem; font-weight: 600;" onclick="if(window.BCSAICopilot) window.BCSAICopilot.toggle();" title="Toggle Quick AI Copilot Drawer (Ctrl+Shift+A)">
                <i class="bi bi-robot" style="color: var(--win-accent, #6366f1);"></i>
                <span>Copilot</span>
                <span id="topbarAiQuotaBadge" class="badge rounded-pill bg-dark bg-opacity-50 text-info border border-info border-opacity-25" style="font-size: 0.68rem;">150/hr</span>
            </button>

            <!-- Windows 11 OS Theme & Accent Color Sync Pill -->
            <button type="button" id="topbarThemeSyncBtn" class="btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill" style="background: rgba(var(--win-accent-rgb, 99, 102, 241), 0.12); border: 1px solid rgba(var(--win-accent-rgb, 99, 102, 241), 0.3); color: inherit; font-size: 0.78rem; font-weight: 600;" onclick="if(window.BCSTheme) window.BCSTheme.cycleTheme();" title="Click to toggle Theme Mode: Windows 11 System Sync / Dark / Light">
                <span id="topbarAccentDot" style="width: 8px; height: 8px; border-radius: 50%; background: var(--win-accent, #6366f1); box-shadow: 0 0 8px var(--win-accent, #6366f1); display: inline-block;"></span>
                <i id="topbarThemeIcon" class="bi bi-windows" style="color: var(--win-accent, #6366f1);"></i>
                <span id="topbarThemeLabel">Win11 Sync</span>
            </button>

            <div class="user-profile">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--win-accent, #6366f1), #a855f7); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;" id="topbarUserInitial">
                    A
                </div>
                <div>
                    <div class="fw-semibold" style="font-size: 0.9rem; line-height: 1;" id="topbarUserName">Admin</div>
                    <small class="text-muted" style="font-size: 0.75rem;" id="topbarUserRole">Administrator</small>
                </div>
            </div>
            <button class="btn logout-btn" onclick="if(window.handleSmartLogout) window.handleSmartLogout(); else if(window.logoutUser) window.logoutUser(); else window.location.href='index.html';">
                <i class="bi bi-box-arrow-right"></i> Logout
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
