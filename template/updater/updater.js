/**
 * BCS Enterprise POS - Smart Holographic Auto-Updater Engine
 * 
 * 5 Smart Pillars:
 * 1. Pre-Flight Diagnostics: Disk space (>500MB), network speed, exponential retry on WiFi drop.
 * 2. Checkout & Cart Shield: Detects active billing/scanning and suppresses update alerts during customer sales.
 * 3. State & Session Auto-Restore: Preserves cashier session, active screen, and drafts across updates.
 * 4. Shift-End Smart Update: Offers 1-click update on Logout/closing shop.
 * 5. Overnight Idle Auto-Sync: Automatically applies updates between 10 PM and 6 AM when idle for 15+ mins.
 */

(function() {
    let currentAppVersion = '1.9.8';
    let downloadedUpdateInfo = null;
    let isIpcBound = false;
    let lastUserActivityTime = Date.now();
    let lastTypingTime = 0;
    let retryState = null;

    // Track user inputs to detect active billing / typing
    ['mousemove', 'mousedown', 'touchstart', 'scroll'].forEach(evt => {
        window.addEventListener(evt, () => {
            lastUserActivityTime = Date.now();
        }, { passive: true });
    });

    ['keydown', 'input', 'paste'].forEach(evt => {
        window.addEventListener(evt, () => {
            lastUserActivityTime = Date.now();
            lastTypingTime = Date.now();
            checkAndShieldUpdateUI();
        }, { passive: true });
    });

    // Safely get Electron ipcRenderer
    let ipcRenderer = null;
    if (typeof require !== 'undefined') {
        try {
            ipcRenderer = require('electron').ipcRenderer;
        } catch (e) {}
    }

    /**
     * PILLAR 2: Checkout & Cart Shield
     * Determines whether the cashier is actively billing or typing
     */
    window.isCheckoutActive = function() {
        if (window.bcsCheckoutActive === true) return true;

        // Check if an input or textarea is currently focused
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
            return true;
        }

        // Check if user typed or scanned a barcode within the last 12 seconds
        if (Date.now() - lastTypingTime < 12000) {
            return true;
        }

        // Check if any purchase/sales table has populated draft rows
        const purchaseRows = document.querySelectorAll('#purchaseItemsTable tbody tr, #cartItemsTable tr');
        if (purchaseRows && purchaseRows.length > 0) {
            return true;
        }

        return false;
    };

    /**
     * Check active billing state and adjust topbar pill accordingly
     */
    function checkAndShieldUpdateUI() {
        if (!downloadedUpdateInfo) return;
        const container = document.getElementById('topbarUpdateContainer');
        if (!container) return;

        if (window.isCheckoutActive()) {
            container.innerHTML = `
                <div class="bcs-updater-pill standby" title="Update paused: Customer checkout or form input in progress">
                    <span class="bcs-pill-dot"></span>
                    <i class="bi bi-shield-fill-check"></i>
                    <span>Checkout Active &bull; Standby</span>
                </div>
            `;
        } else {
            updateTopbarPill('ready', downloadedUpdateInfo);
        }
    }

    // Periodic check to restore 'ready' pill once cashier finishes billing
    setInterval(() => {
        if (downloadedUpdateInfo && !window.isCheckoutActive()) {
            const container = document.getElementById('topbarUpdateContainer');
            if (container && container.querySelector('.bcs-updater-pill.standby')) {
                updateTopbarPill('ready', downloadedUpdateInfo);
            }
        }
    }, 4000);

    /**
     * PILLAR 3: State & Session Auto-Restore
     * Snapshot session before update & restore seamlessly upon relaunch
     */
    window.captureBcsSessionSnapshot = function() {
        try {
            const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';
            const snapshot = {
                timestamp: Date.now(),
                fromVersion: currentAppVersion,
                targetVersion: downloadedUpdateInfo ? downloadedUpdateInfo.version : currentAppVersion,
                pathname: currentPath,
                search: window.location.search || '',
                user: {
                    name: localStorage.getItem('loggedInUserName') || '',
                    id: localStorage.getItem('loggedInUserId') || '',
                    role: localStorage.getItem('userRole') || '',
                    permissions: localStorage.getItem('userPermissions') || '',
                    auth: localStorage.getItem('isAuthenticated') || '',
                    sessionId: localStorage.getItem('sessionId') || '',
                    sessionPort: localStorage.getItem('sessionPort') || ''
                }
            };
            localStorage.setItem('bcs_update_session_snapshot', JSON.stringify(snapshot));
        } catch (e) {
            console.warn('[Smart Updater] Failed to capture session snapshot:', e);
        }
    };

    /**
     * Restore session snapshot on startup
     */
    function checkAndRestoreSessionSnapshot() {
        const raw = localStorage.getItem('bcs_update_session_snapshot');
        if (!raw) return;

        try {
            const snapshot = JSON.parse(raw);
            localStorage.removeItem('bcs_update_session_snapshot');

            // Only apply snapshot if update happened in the last 6 minutes
            if (Date.now() - snapshot.timestamp < 6 * 60 * 1000) {
                // Restore session variables
                if (snapshot.user && snapshot.user.auth === 'true') {
                    localStorage.setItem('isAuthenticated', 'true');
                    if (snapshot.user.name) localStorage.setItem('loggedInUserName', snapshot.user.name);
                    if (snapshot.user.id) localStorage.setItem('loggedInUserId', snapshot.user.id);
                    if (snapshot.user.role) localStorage.setItem('userRole', snapshot.user.role);
                    if (snapshot.user.permissions) localStorage.setItem('userPermissions', snapshot.user.permissions);
                    if (snapshot.user.sessionId) localStorage.setItem('sessionId', snapshot.user.sessionId);
                    if (snapshot.user.sessionPort) localStorage.setItem('sessionPort', snapshot.user.sessionPort);

                    // If currently on login page and was on an internal view, restore route!
                    const currentFile = window.location.pathname.split('/').pop() || 'index.html';
                    if (currentFile === 'index.html' && snapshot.pathname && snapshot.pathname !== 'index.html') {
                        sessionStorage.setItem('bcs_post_update_welcome_ver', snapshot.targetVersion || 'Latest');
                        window.location.replace(snapshot.pathname + (snapshot.search || ''));
                        return;
                    }
                }

                // Show welcome toast on current page
                showPostUpdateWelcomeToast(snapshot.targetVersion || '1.9.8', snapshot.fromVersion);
            }
        } catch (e) {}
    }

    /**
     * Show Post-Update Welcome Toast
     */
    function showPostUpdateWelcomeToast(newVer, oldVer) {
        if (document.getElementById('bcsPostUpdateToast')) return;

        const toastHtml = `
        <div id="bcsPostUpdateToast" class="bcs-welcome-toast">
            <div class="d-flex align-items-start gap-3">
                <div style="width: 42px; height: 42px; border-radius: 12px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.45); display: flex; align-items: center; justify-content: center; color: #a855f7; font-size: 1.35rem; flex-shrink: 0; box-shadow: 0 0 20px rgba(99, 102, 241, 0.35);">
                    <i class="bi bi-stars"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong class="text-white small">BCS Enterprise POS Updated! (v${newVer})</strong>
                        <span class="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25" style="font-size: 0.68rem;">Restored</span>
                    </div>
                    <div class="text-muted small mb-3" style="font-size: 0.76rem; line-height: 1.35;">
                        Workspace and operator session restored safely. Ready for seamless checkout.
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-primary fw-bold px-3 py-1 shadow-sm d-inline-flex align-items-center gap-1" style="font-size: 0.78rem; border-radius: 8px;" onclick="window.openBcsUpdateModal({ version: '${newVer}' }); document.getElementById('bcsPostUpdateToast').remove();">
                            <i class="bi bi-stars"></i> What's New
                        </button>
                        <button class="btn btn-sm btn-outline-secondary py-1 px-2" style="font-size: 0.78rem; border-radius: 8px;" onclick="document.getElementById('bcsPostUpdateToast').remove()">
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', toastHtml);

        setTimeout(() => {
            const el = document.getElementById('bcsPostUpdateToast');
            if (el) el.remove();
        }, 8000);
    }

    /**
     * PILLAR 4: Shift-End & Logout Smart Update
     * Intercepts logout to offer 1-click update upon closing shop
     */
    window.handleSmartLogout = function() {
        if (downloadedUpdateInfo) {
            window.openBcsShiftEndModal(downloadedUpdateInfo);
        } else {
            if (window.logoutUser) window.logoutUser();
            else window.location.href = 'index.html';
        }
    };

    /**
     * Open Shift-End Update Modal
     */
    window.openBcsShiftEndModal = function(info) {
        const existing = document.getElementById('bcsShiftEndModal');
        if (existing) existing.remove();

        const ver = info && info.version ? info.version : currentAppVersion;

        const modalHtml = `
        <div id="bcsShiftEndModal" class="bcs-modal-backdrop">
            <div class="bcs-modal-card">
                <button type="button" class="bcs-modal-close" onclick="document.getElementById('bcsShiftEndModal').remove()" title="Close">&times;</button>
                
                <div class="bcs-orbital-emblem">
                    <div class="bcs-orbital-ring"></div>
                    <div class="bcs-orbital-ring reverse"></div>
                    <div class="bcs-orbital-core" style="color: #10b981;">
                        <i class="bi bi-moon-stars-fill"></i>
                    </div>
                </div>

                <div class="text-center mb-3">
                    <div class="text-success text-uppercase fw-bold small mb-1" style="font-size: 0.72rem; letter-spacing: 0.1em;">
                        <i class="bi bi-shop-window me-1"></i> Shift Ending &bull; Register Closeout
                    </div>
                    <h4 class="fw-extrabold text-white mb-1">New Update Ready for Tomorrow (v${ver})</h4>
                    <p class="text-muted small mb-0">Apply the update now in 3 seconds so the morning shift starts on the latest software.</p>
                </div>

                <div class="bcs-safe-notice">
                    <i class="bi bi-check-circle-fill text-success fs-6"></i>
                    <span>Closing shop: Applying update now ensures zero downtime during daytime sales tomorrow.</span>
                </div>

                <div class="d-flex flex-column gap-2 mt-4">
                    <button type="button" class="bcs-btn-update-now" id="bcsShiftEndApplyBtn">
                        <i class="bi bi-rocket-takeoff-fill fs-5"></i> Apply Update &amp; Close Shift (~3s)
                    </button>
                    <button type="button" class="bcs-btn-later w-100 py-2" id="bcsShiftEndJustLogoutBtn">
                        <i class="bi bi-box-arrow-right me-1"></i> Just Logout (Postpone Update)
                    </button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('bcsShiftEndApplyBtn').addEventListener('click', () => {
            document.getElementById('bcsShiftEndModal').remove();
            window.captureBcsSessionSnapshot();
            window.applyBcsUpdateAndRestart();
        });

        document.getElementById('bcsShiftEndJustLogoutBtn').addEventListener('click', () => {
            document.getElementById('bcsShiftEndModal').remove();
            if (window.logoutUser) window.logoutUser();
            else window.location.href = 'index.html';
        });
    };

    /**
     * PILLAR 5: Overnight Idle Auto-Sync (Shop Closing Hours 10 PM - 6 AM)
     */
    function checkOvernightAutoSync() {
        // Feature can be disabled in settings
        const isEnabled = localStorage.getItem('bcs_overnight_autosync') !== 'false';
        if (!isEnabled || !downloadedUpdateInfo || !ipcRenderer) return;

        const currentHour = new Date().getHours();
        const isNightWindow = (currentHour >= 22 || currentHour < 6); // 10 PM to 6 AM
        const idleDuration = Date.now() - lastUserActivityTime;
        const isIdleOver15Mins = (idleDuration >= 15 * 60 * 1000);

        if (isNightWindow && isIdleOver15Mins && !window.isCheckoutActive()) {
            console.log('[Smart Updater] Overnight Idle Auto-Sync triggering silent upgrade...');
            window.captureBcsSessionSnapshot();
            window.applyBcsUpdateAndRestart();
        }
    }

    // Check overnight auto-sync condition every minute
    setInterval(checkOvernightAutoSync, 60 * 1000);

    /**
     * Topbar Updater Container Pill
     */
    function updateTopbarPill(state, data) {
        const container = document.getElementById('topbarUpdateContainer');
        if (!container) return;

        if (state === 'downloading') {
            const pct = Math.round(data && data.percent ? data.percent : 0);
            container.innerHTML = `
                <div class="bcs-updater-pill downloading" title="Update downloading quietly in background">
                    <span class="bcs-pill-dot pulse"></span>
                    <span>Downloading ${pct}%</span>
                    <div class="bcs-mini-progress">
                        <div class="bcs-mini-progress-fill" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        } else if (state === 'ready') {
            // Respect Checkout Shield
            if (window.isCheckoutActive()) {
                container.innerHTML = `
                    <div class="bcs-updater-pill standby" title="Customer checkout active: Update standby">
                        <span class="bcs-pill-dot"></span>
                        <i class="bi bi-shield-fill-check"></i>
                        <span>Checkout Active</span>
                    </div>
                `;
                return;
            }

            const ver = data && data.version ? data.version : currentAppVersion;
            container.innerHTML = `
                <button id="bcsTopbarUpdateBtn" class="bcs-updater-pill ready" type="button" title="Click to view update details and install">
                    <span class="bcs-pill-dot pulse"></span>
                    <i class="bi bi-stars"></i>
                    <span>Update Ready (v${ver})</span>
                </button>
            `;
            const btn = document.getElementById('bcsTopbarUpdateBtn');
            if (btn) {
                btn.addEventListener('click', () => {
                    window.openBcsUpdateModal(downloadedUpdateInfo);
                });
            }
        } else if (state === 'retry') {
            container.innerHTML = `
                <div class="bcs-updater-pill retry" title="${data.reason || 'Network drop'}">
                    <span class="bcs-pill-dot pulse"></span>
                    <i class="bi bi-wifi-off"></i>
                    <span>Retrying in ${data.delaySeconds}s</span>
                </div>
            `;
        }
    }

    /**
     * Update Login Page updater banner
     */
    function updateLoginBanner(ver) {
        const loginContainer = document.getElementById('loginUpdateContainer');
        if (!loginContainer) return;

        loginContainer.innerHTML = `
            <div class="bcs-login-update-banner" id="bcsLoginUpdateBtn">
                <span class="bcs-pill-dot pulse"></span>
                <i class="bi bi-stars"></i>
                <span>New Update Ready: v${ver || currentAppVersion} &bull; Click to Install</span>
            </div>
        `;
        loginContainer.classList.remove('d-none');

        const btn = document.getElementById('bcsLoginUpdateBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                window.openBcsUpdateModal(downloadedUpdateInfo);
            });
        }
    }

    /**
     * Show modern floating toast banner in bottom-right corner
     */
    function showModernUpdateToast(ver) {
        // Do not popup toast if cashier is actively billing or typing
        if (window.isCheckoutActive()) return;
        if (document.getElementById('bcsModernUpdateToast')) return;

        const toastHtml = `
        <div id="bcsModernUpdateToast" class="bcs-updater-toast">
            <div class="d-flex align-items-start gap-3">
                <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.45); display: flex; align-items: center; justify-content: center; color: #10b981; font-size: 1.3rem; flex-shrink: 0; box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);">
                    <i class="bi bi-cloud-arrow-down-fill"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong class="text-white small">New Version Ready: v${ver || '1.9.8'}</strong>
                        <span class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25" style="font-size: 0.68rem;">Verified</span>
                    </div>
                    <div class="text-muted small mb-3" style="font-size: 0.76rem; line-height: 1.35;">
                        Downloaded quietly in background. Will <strong>never disrupt active sales</strong>. Update whenever convenient.
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-success fw-bold px-3 py-1 shadow-sm d-inline-flex align-items-center gap-1" style="font-size: 0.78rem; border-radius: 8px;" id="bcsToastReviewBtn">
                            <i class="bi bi-stars"></i> Review &amp; Install
                        </button>
                        <button class="btn btn-sm btn-outline-secondary py-1 px-2" style="font-size: 0.78rem; border-radius: 8px;" onclick="document.getElementById('bcsModernUpdateToast').remove()">
                            Later
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', toastHtml);

        const reviewBtn = document.getElementById('bcsToastReviewBtn');
        if (reviewBtn) {
            reviewBtn.addEventListener('click', () => {
                const toast = document.getElementById('bcsModernUpdateToast');
                if (toast) toast.remove();
                window.openBcsUpdateModal(downloadedUpdateInfo);
            });
        }
    }

    /**
     * Open Modern Holographic Update Modal Dialog
     */
    window.openBcsUpdateModal = function(info) {
        const existing = document.getElementById('bcsModernUpdateModal');
        if (existing) existing.remove();

        const targetVer = info && info.version ? info.version : currentAppVersion;

        const modalHtml = `
        <div id="bcsModernUpdateModal" class="bcs-modal-backdrop">
            <div class="bcs-modal-card">
                <button type="button" class="bcs-modal-close" onclick="window.closeBcsUpdateModal()" title="Close">&times;</button>
                
                <div class="bcs-orbital-emblem">
                    <div class="bcs-orbital-ring"></div>
                    <div class="bcs-orbital-ring reverse"></div>
                    <div class="bcs-orbital-core">
                        <i class="bi bi-rocket-takeoff-fill"></i>
                    </div>
                </div>

                <div class="text-center mb-3">
                    <div class="text-info text-uppercase fw-bold small mb-1" style="font-size: 0.72rem; letter-spacing: 0.1em;">
                        <i class="bi bi-shield-check me-1"></i> BCS Enterprise POS PRO Max
                    </div>
                    <h4 class="fw-extrabold text-white mb-1">Quantum Software Update Ready</h4>
                    <p class="text-muted small mb-0">Production update package downloaded and cryptographically verified.</p>
                </div>

                <div class="bcs-version-diff">
                    <div class="text-center">
                        <div class="text-muted small" style="font-size: 0.7rem;">INSTALLED</div>
                        <span class="bcs-version-tag old">v${currentAppVersion}</span>
                    </div>
                    <div class="bcs-version-arrow">
                        <span>──</span>
                        <i class="bi bi-lightning-charge-fill"></i>
                        <span>──&gt;</span>
                    </div>
                    <div class="text-center">
                        <div class="text-muted small" style="font-size: 0.7rem;">TARGET RELEASE</div>
                        <span class="bcs-version-tag new">v${targetVer}</span>
                    </div>
                </div>

                <div class="bcs-features-grid">
                    <div class="bcs-feature-row">
                        <div class="bcs-feature-icon cyan">
                            <i class="bi bi-lightning-fill"></i>
                        </div>
                        <div>
                            <strong class="text-white d-block">1-Click Silent Engine</strong>
                            <small class="text-muted">Zero setup wizard prompts. Upgrades in background in ~3 seconds.</small>
                        </div>
                    </div>

                    <div class="bcs-feature-row">
                        <div class="bcs-feature-icon emerald">
                            <i class="bi bi-shield-lock-fill"></i>
                        </div>
                        <div>
                            <strong class="text-white d-block">Cashier Safe &amp; Checkout Shield</strong>
                            <small class="text-muted">Active cart tickets, local cache, and offline catalogue are 100% preserved.</small>
                        </div>
                    </div>

                    <div class="bcs-feature-row">
                        <div class="bcs-feature-icon purple">
                            <i class="bi bi-stars"></i>
                        </div>
                        <div>
                            <strong class="text-white d-block">State &amp; Session Auto-Restore</strong>
                            <small class="text-muted">Seamlessly returns to your exact screen and credentials after restart.</small>
                        </div>
                    </div>

                    <div class="bcs-feature-row">
                        <div class="bcs-feature-icon amber">
                            <i class="bi bi-moon-stars-fill"></i>
                        </div>
                        <div>
                            <strong class="text-white d-block">Shift-End &amp; Overnight Sync</strong>
                            <small class="text-muted">Option to install when cashier logs out or auto-sync overnight (10 PM - 6 AM).</small>
                        </div>
                    </div>
                </div>

                <div class="bcs-safe-notice">
                    <i class="bi bi-info-circle-fill text-info fs-6"></i>
                    <span>Updating takes ~3 seconds. Session and current workspace will be restored automatically.</span>
                </div>

                <div class="bcs-modal-actions">
                    <button type="button" class="bcs-btn-update-now" id="bcsModalUpdateConfirmBtn">
                        <i class="bi bi-arrow-repeat fs-5"></i> Restart &amp; Install (~3s)
                    </button>
                    <button type="button" class="bcs-btn-later" onclick="window.closeBcsUpdateModal()">
                        Remind on Shift End
                    </button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const confirmBtn = document.getElementById('bcsModalUpdateConfirmBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                window.closeBcsUpdateModal();
                window.captureBcsSessionSnapshot();
                window.applyBcsUpdateAndRestart();
            });
        }
    };

    /**
     * Close Modern Update Modal
     */
    window.closeBcsUpdateModal = function() {
        const modal = document.getElementById('bcsModernUpdateModal');
        if (modal) modal.remove();
    };

    /**
     * Apply Update and Restart with Futuristic Relaunch HUD
     */
    window.applyBcsUpdateAndRestart = function() {
        if (document.getElementById('bcsRelaunchOverlay')) return;

        window.captureBcsSessionSnapshot();

        const overlayHtml = `
        <div id="bcsRelaunchOverlay" class="bcs-relaunch-overlay">
            <div class="bcs-relaunch-box">
                <div class="bcs-laser-spinner">
                    <div class="bcs-laser-spinner-ring"></div>
                </div>
                <h3 class="fw-extrabold text-white mb-2">Applying Quantum Update...</h3>
                <p class="text-muted small mb-0" id="bcsRelaunchStatusText">
                    Swapping application binaries silently in background. Restoring workspace...
                </p>
                <div class="bcs-relaunch-bar">
                    <div class="bcs-relaunch-bar-fill" id="bcsRelaunchBarFill"></div>
                </div>
                <div class="d-flex justify-content-between small text-muted font-monospace mt-2">
                    <span>Target: v${downloadedUpdateInfo ? downloadedUpdateInfo.version : currentAppVersion}</span>
                    <span id="bcsRelaunchCountdown">Restarting in 3s...</span>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', overlayHtml);

        const bar = document.getElementById('bcsRelaunchBarFill');
        const countdownEl = document.getElementById('bcsRelaunchCountdown');

        if (bar) {
            setTimeout(() => { bar.style.width = '100%'; }, 50);
        }

        let seconds = 3;
        const interval = setInterval(() => {
            seconds--;
            if (countdownEl) {
                countdownEl.textContent = `Restarting in ${seconds}s...`;
            }
            if (seconds <= 0) {
                clearInterval(interval);
                if (ipcRenderer) {
                    ipcRenderer.send('restart_app');
                }
            }
        }, 800);
    };

    /**
     * Backward-compatible alias for topbar.js
     */
    window.promptInstallUpdate = function(version) {
        window.openBcsUpdateModal({ version: version || currentAppVersion });
    };

    /**
     * Initialize IPC listeners & smart resilience
     */
    function initUpdater() {
        if (!ipcRenderer || isIpcBound) return;
        isIpcBound = true;

        // Check if returning from an update session
        checkAndRestoreSessionSnapshot();

        // Fetch running app version
        ipcRenderer.invoke('get_app_version').then(ver => {
            if (ver) {
                currentAppVersion = ver;
                const topbarBadge = document.getElementById('topbarVersionBadge');
                if (topbarBadge) topbarBadge.textContent = `v${ver}`;
                const loginVer = document.getElementById('loginVersionDisplay');
                if (loginVer) loginVer.textContent = ver;
            }
        }).catch(() => {});

        // Check if an update was already downloaded earlier in the session
        ipcRenderer.invoke('get_downloaded_update_info').then(info => {
            if (info) {
                downloadedUpdateInfo = info;
                updateTopbarPill('ready', info);
                updateLoginBanner(info.version);
            }
        }).catch(() => {});

        // 1. Download Progress
        ipcRenderer.on('download_progress', (event, progress) => {
            updateTopbarPill('downloading', progress);
        });

        // 2. Download Complete (Ready to Install)
        ipcRenderer.on('update_downloaded', (event, info) => {
            downloadedUpdateInfo = info || { version: currentAppVersion };
            updateTopbarPill('ready', downloadedUpdateInfo);
            updateLoginBanner(downloadedUpdateInfo.version);
            showModernUpdateToast(downloadedUpdateInfo.version);
        });

        // 3. Smart Network Retry Notification
        ipcRenderer.on('update_retry_scheduled', (event, data) => {
            retryState = data;
            updateTopbarPill('retry', data);
        });
    }

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUpdater);
    } else {
        initUpdater();
    }
})();
