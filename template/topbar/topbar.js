window._renderTopbarImpl = function() {
    const TOPBAR_HTML = `
    <header class="topbar">
        <div class="d-flex align-items-center gap-2">
            <img src="assets/icon.png" onerror="this.src='template/bcs-logo.svg'" alt="BCS" style="width: 40px; height: 40px; border-radius: 9px; object-fit: contain; filter: drop-shadow(0 0 12px rgba(0, 229, 255, 0.45));">
            <h4 class="mb-0 fw-bold" style="background: linear-gradient(135deg, #00e5ff, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">BCS Enterprise</h4>
            <span id="topbarVersionBadge" class="badge bg-secondary bg-opacity-25 text-muted border border-secondary border-opacity-25 small" style="font-size: 0.75rem;">v1.9.6</span>
            <div id="topbarUpdateContainer" class="d-inline-flex align-items-center ms-2"></div>
        </div>
        <div class="d-flex align-items-center gap-3">
            <div class="user-profile">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;" id="topbarUserInitial">
                    A
                </div>
                <div>
                    <div class="fw-semibold" style="font-size: 0.9rem; line-height: 1;" id="topbarUserName">Admin</div>
                    <small class="text-muted" style="font-size: 0.75rem;" id="topbarUserRole">Administrator</small>
                </div>
            </div>
            <button class="btn logout-btn" onclick="if(window.logoutUser) window.logoutUser(); else window.location.href='index.html';">
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

            // Avoid attaching duplicate IPC listeners across view loads
            if (!window._topbarIpcBound) {
                window._topbarIpcBound = true;

                // When downloading quietly in background (never blocks cashier or shop)
                ipcRenderer.on('download_progress', (event, progress) => {
                    const container = document.getElementById('topbarUpdateContainer');
                    if (container) {
                        const pct = Math.round(progress.percent || 0);
                        container.innerHTML = `
                            <span class="badge bg-info bg-opacity-20 text-info border border-info border-opacity-30 d-inline-flex align-items-center gap-1 px-2 py-1" style="font-size: 0.72rem;">
                                <span class="spinner-border spinner-border-sm" style="width: 0.75rem; height: 0.75rem;"></span>
                                <span>Background Download: ${pct}%</span>
                            </span>
                        `;
                    }
                });

                // When download is completely finished: NEVER auto-restart! ONLY prompt!
                ipcRenderer.on('update_downloaded', (event, info) => {
                    const container = document.getElementById('topbarUpdateContainer');
                    const newVer = info ? (info.version || '') : '';
                    if (container) {
                        container.innerHTML = `
                            <button id="topbarRestartUpdateBtn" class="btn btn-sm btn-success d-inline-flex align-items-center gap-1 shadow-sm px-2 py-1" style="font-size: 0.74rem; font-weight: 700; border-radius: 8px; animation: pulseGlow 2s infinite;">
                                <i class="bi bi-arrow-repeat"></i> Update Ready! Click to Install
                            </button>
                        `;

                        document.getElementById('topbarRestartUpdateBtn').addEventListener('click', () => {
                            window.promptInstallUpdate(newVer);
                        });
                    }

                    // Show polite non-intrusive bottom corner toast
                    showUpdateToastBanner(newVer);
                });
            }
        } catch (e) {}
    }
};

window.promptInstallUpdate = function(version) {
    const msg = `A new BCS Enterprise POS update (v${version || 'new'}) is downloaded and ready to install.\n\nRestart now to finish installation? This takes about 5 seconds.\n\n(Click Cancel if you are currently working with a customer; you can restart anytime from the green topbar button.)`;
    const confirmed = confirm(msg);
    if (confirmed) {
        if (typeof require !== 'undefined') {
            try {
                const { ipcRenderer } = require('electron');
                if (window.showBcsLoader) {
                    window.showBcsLoader("Restarting BCS Enterprise POS to apply update...");
                }
                setTimeout(() => {
                    ipcRenderer.send('restart_app');
                }, 800);
            } catch(e) {}
        }
    }
};

function showUpdateToastBanner(version) {
    if (document.getElementById('bcsUpdateToastBanner')) return;

    const bannerHtml = `
    <div id="bcsUpdateToastBanner" class="bcs-update-float-banner">
        <div class="d-flex align-items-start gap-3">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; color: #10b981; font-size: 1.25rem; flex-shrink: 0;">
                <i class="bi bi-cloud-arrow-down-fill"></i>
            </div>
            <div class="flex-grow-1">
                <div class="fw-bold text-white small mb-1">New Update Downloaded &amp; Ready! (v${version || 'Latest'})</div>
                <div class="text-secondary small mb-2" style="font-size: 0.78rem; line-height: 1.4;">
                    Downloaded quietly in background. Your work will <strong>never be interrupted</strong>. Install when your shop is free.
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-success fw-semibold px-3" onclick="window.promptInstallUpdate('${version || ''}')">
                        <i class="bi bi-arrow-repeat me-1"></i> Restart &amp; Install
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('bcsUpdateToastBanner').remove()">
                        Later
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', bannerHtml);
}
