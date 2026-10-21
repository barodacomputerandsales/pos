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
    let currentAppVersion = '2.3.1';
    let availableRemoteInfo = null;
    let downloadedUpdateInfo = null;
    let isIpcBound = false;
    let lastUserActivityTime = Date.now();
    let lastTypingTime = 0;
    let retryState = null;

    function isOnSettingsPage() {
        const path = (window.location.pathname || '').toLowerCase();
        return path.endsWith('settings.html') || path.includes('settings.html');
    }

    function redirectToSettingsUpdater(autoStart = true) {
        if (autoStart) {
            try {
                sessionStorage.setItem('bcs_auto_start_update', 'true');
            } catch (e) {}
        }
        if (ipcRenderer) {
            try {
                ipcRenderer.send('download_update');
            } catch (e) {}
        }
        if (!isOnSettingsPage()) {
            window.location.href = 'settings.html#tab-updates';
        } else {
            const tabBtn = document.querySelector('button[data-bs-target="#tab-updates"]');
            if (tabBtn && typeof bootstrap !== 'undefined') {
                new bootstrap.Tab(tabBtn).show();
            }
            window.dispatchEvent(new CustomEvent('bcs-trigger-settings-update'));
        }
    }

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
                showPostUpdateWelcomeToast(snapshot.targetVersion || '2.0.0', snapshot.fromVersion);
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

        if (state === 'available') {
            const ver = data && (data.version || data.latestVersion) ? (data.version || data.latestVersion) : currentAppVersion;
            container.innerHTML = `
                <button id="bcsTopbarDedicatedBtn" class="bcs-dedicated-update-btn" type="button" title="System update available: Click to review and update">
                    <span class="bcs-pill-dot pulse" style="background:#38bdf8;"></span>
                    <i class="bi bi-cloud-arrow-down-fill"></i>
                    <span>Update Available (v${ver})</span>
                </button>
            `;
            const btn = document.getElementById('bcsTopbarDedicatedBtn');
            if (btn) {
                btn.addEventListener('click', () => {
                    window.showUpdateAvailableAlert(data);
                });
            }
        } else if (state === 'downloading') {
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
        } else if (state === 'error') {
            container.innerHTML = `
                <div class="bcs-updater-pill retry" title="${data && data.message ? data.message : 'Update standby'}">
                    <span class="bcs-pill-dot" style="background:#f59e0b;"></span>
                    <i class="bi bi-shield-exclamation text-warning"></i>
                    <span>Relay Active (Standby)</span>
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
                        <strong class="text-white small">New Version Ready: v${ver || '2.0.0'}</strong>
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
                redirectToSettingsUpdater(true);
            });
        }
    }

    /**
     * Reinstall App directly with standalone .exe installer
     */
    window.reinstallBcsApp = async function(ver) {
        const targetUrl = 'https://backend.bcs.bcsdeveloper.com/api/updater/download';
        if (typeof showAlert === 'function') {
            showAlert('Reinstall Initiated', 'Requesting standalone setup installer from Cloudflare serverless edge...', 'info');
        }
        if (ipcRenderer) {
            try {
                await ipcRenderer.invoke('open_external', targetUrl);
            } catch (e) {
                window.open(targetUrl, '_blank');
            }
        } else {
            window.open(targetUrl, '_blank');
        }
    };

    /**
     * Dedicated System Update Alert Dialog
     * Shows high-priority alert telling the user to update the system
     * with dedicated buttons for Update Now, Settings, and Standalone Reinstall.
     */
    window.showUpdateAvailableAlert = function(info) {
        if (window.isCheckoutActive && window.isCheckoutActive()) return;
        const existing = document.getElementById('bcsSystemUpdateAlertModal');
        if (existing) existing.remove();

        const targetVer = info && (info.version || info.latestVersion) ? (info.version || info.latestVersion) : currentAppVersion;
        const isDownloaded = !!downloadedUpdateInfo;

        const modalHtml = `
        <div id="bcsSystemUpdateAlertModal" class="bcs-modal-backdrop">
            <div class="bcs-update-alert-card text-center">
                <button type="button" class="bcs-modal-close" onclick="document.getElementById('bcsSystemUpdateAlertModal').remove()" title="Close">&times;</button>
                
                <div class="bcs-orbital-emblem mb-3">
                    <div class="bcs-orbital-ring"></div>
                    <div class="bcs-orbital-ring reverse"></div>
                    <div class="bcs-orbital-core" style="color: #06b6d4;">
                        <i class="bi bi-bell-fill"></i>
                    </div>
                </div>

                <div class="badge bg-warning bg-opacity-20 text-warning border border-warning border-opacity-25 px-3 py-1 mb-2 fw-bold" style="font-size: 0.76rem; letter-spacing: 0.08em;">
                    <i class="bi bi-exclamation-triangle-fill me-1"></i> CRITICAL SYSTEM UPDATE AVAILABLE
                </div>

                <h4 class="fw-extrabold text-white mb-2">Update Ready: Version v${targetVer}</h4>
                <p class="text-muted small mb-3" style="line-height: 1.45;">
                    A new production build has been published. Updating ensures uninterrupted terminal checkout, peak hardware performance, and Cloudflare D1 central database integrity.
                </p>

                <div class="bcs-version-diff mb-4">
                    <div class="text-center">
                        <div class="text-muted small" style="font-size: 0.7rem;">CURRENT</div>
                        <span class="bcs-version-tag old">v${currentAppVersion}</span>
                    </div>
                    <div class="bcs-version-arrow">
                        <span>──</span>
                        <i class="bi bi-arrow-right-circle-fill text-info"></i>
                        <span>──&gt;</span>
                    </div>
                    <div class="text-center">
                        <div class="text-muted small" style="font-size: 0.7rem;">NEW RELEASE</div>
                        <span class="bcs-version-tag new">v${targetVer}</span>
                    </div>
                </div>

                <div class="d-flex flex-column gap-2">
                    <button type="button" class="bcs-btn-update-now w-100 py-3" id="bcsAlertUpdateNowBtn">
                        <i class="bi bi-rocket-takeoff-fill fs-5"></i>
                        <span>${isDownloaded ? 'Restart & Install Now (~3s)' : 'Update System Now (One-Click)'}</span>
                    </button>

                    <div class="row g-2">
                        <div class="col-6">
                            <button type="button" class="bcs-btn-settings w-100" id="bcsAlertOpenSettingsBtn">
                                <i class="bi bi-sliders2-vertical text-info"></i>
                                <span>Go to Settings</span>
                            </button>
                        </div>
                        <div class="col-6">
                            <button type="button" class="bcs-btn-settings w-100" onclick="document.getElementById('bcsSystemUpdateAlertModal').remove()">
                                <i class="bi bi-clock-history"></i>
                                <span>Remind Later</span>
                            </button>
                        </div>
                    </div>

                    <button type="button" class="bcs-btn-reinstall mt-1" id="bcsAlertReinstallBtn">
                        <i class="bi bi-box-arrow-down fs-5"></i>
                        <span>Reinstall App with New Version (.exe Installer)</span>
                    </button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('bcsAlertUpdateNowBtn').addEventListener('click', () => {
            document.getElementById('bcsSystemUpdateAlertModal').remove();
            if (!isOnSettingsPage()) {
                redirectToSettingsUpdater(true);
                return;
            }
            if (isDownloaded) {
                window.captureBcsSessionSnapshot();
                window.applyBcsUpdateAndRestart();
            } else {
                redirectToSettingsUpdater(true);
            }
        });

        document.getElementById('bcsAlertOpenSettingsBtn').addEventListener('click', () => {
            document.getElementById('bcsSystemUpdateAlertModal').remove();
            redirectToSettingsUpdater(true);
        });

        document.getElementById('bcsAlertReinstallBtn').addEventListener('click', () => {
            document.getElementById('bcsSystemUpdateAlertModal').remove();
            window.reinstallBcsApp(targetVer);
        });
    };

    /**
     * Format Markdown / Release Notes for Changelog Views
     */
    function formatReleaseNotes(version, raw) {
        if (raw && typeof raw === 'string' && raw.trim().length > 15 && !raw.includes('No release notes provided')) {
            return raw
                .replace(/^### (.*$)/gim, '<div class="fw-bold text-info mt-1 mb-1">$1</div>')
                .replace(/^## (.*$)/gim, '<div class="fw-bold text-white mt-1 mb-1">$1</div>')
                .replace(/^• (.*$)/gim, '<div class="d-flex align-items-start gap-2 mb-1"><span class="text-primary">•</span><div>$1</div></div>')
                .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-white">$1</strong>')
                .replace(/\n/g, '<br>');
        }

        const fallbackMap = {
            '2.2.9': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Smart Updater Redirect to Settings</strong>: Clicking Update on the popup banner automatically redirects to the Settings Software Updater hub and initiates the update cleanly.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Windows 11 OS Theme &amp; Accent Sync</strong>: Live synchronization with Windows 11 Dark/Light mode and system accent color.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Persistent Window Size &amp; State</strong>: Saves and restores your exact window dimensions, coordinates, and maximized state across restarts.</div></div>
            `,
            '2.2.8': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Windows 11 OS Theme &amp; Accent Sync</strong>: Live synchronization with Windows 11 Dark/Light mode and system accent color.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Persistent Window Size &amp; State</strong>: Saves and restores your exact window dimensions, coordinates, and maximized state across restarts.</div></div>
            `,
            '2.2.7': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">DirectWrite High-DPI Sharpness</strong>: Eliminated GPU compositor texture traps and blurriness across all cards and typography.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Crystal-Clear Supplier UI</strong>: High-contrast solid slate panels with sharp readable field labels and bright input contrast.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Dynamic Up-to-Date Hub</strong>: Intelligent verified status indicator in settings when running the latest release.</div></div>
            `,
            '2.2.6': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Dedicated People &amp; Supplier Management</strong>: Interactive supplier directory under new People submenu with live search, direct dialing, and CSV export.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Real-Time Sourcing Profile</strong>: Tracks Supplier Name, Phone Number, Shop Name, Shop Mobile, Location, and Opening Due Balance.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Seamless Purchase Autocomplete</strong>: Automatically integrates registered suppliers into purchase invoices with instant phone and shop autofill.</div></div>
            `,
            '2.2.5': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Bulletproof Auto-Updater Engine</strong>: Hardened direct binary streaming eliminating blockmap and signature verification stalls.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Direct Full NSIS Swapping</strong>: Enforced clean standalone installer streaming with instant cryptographic SHA-512 validation.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Zero-Error Relaunch Guard</strong>: Try-catch execution boundaries preventing hanging restart countdowns across dev & packaged runtimes.</div></div>
            `,
            '2.2.4': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Signature Neon Laser Relaunch HUD</strong>: Embedded dynamic laser SVG rendering directly into the quantum update restart countdown overlay.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Quantum Binary Handoff</strong>: Fluid visual feedback during background binary swapping and workspace restoration.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Zero-Flicker Countdown</strong>: Precise 3-second to 0-second countdown with immediate silent restart invocation.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Self-Healing Update Resilience</strong>: Bulletproofed updater execution lifecycle with automated session state preservation.</div></div>
            `,
            '2.2.3': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Dedicated System Update Alert</strong>: Instant holographic popup and topbar badge with 1-click update action when new releases arrive.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Quick Settings Navigation</strong>: Added direct button to open the Software Updater settings hub with one click.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Big Update Now Button</strong>: Massive high-visibility action button on Settings for instant background binary swap.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Standalone Reinstaller Option</strong>: Dedicated button to download and run full setup .exe for clean reinstallation.</div></div>
            `,
            '2.2.2': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Universal Auto-Updater Resolution</strong>: Full absolute URL manifest rewrites and root edge redirects guarantee seamless 1-click updates across all POS terminals.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Zero-404 Edge Architecture</strong>: Dedicated Cloudflare Pages binary catch-all ensuring backwards compatibility for legacy client paths.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Laser Neon Precision</strong>: Complete AST-validated views with integrated zero-flicker splash loader.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Hardened Release Delivery</strong>: Authenticated private repository asset streaming with cryptographic SHA-512 verification.</div></div>
            `,
            '2.2.1': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Portable Neon Laser Loader</strong>: Integrated zero-flicker laser loading indicator across all views and portals.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Session Loop Protection</strong>: Sanitized logout credentials and resolved authentication redirect loops.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Customer Portal Sync</strong>: Direct routing to https://bcs.bcsdeveloper.com for omnichannel invoices.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Optimized Distribution</strong>: Pure Windows 64-bit NSIS packaging with asInvoker execution level.</div></div>
            `,
            '2.2.0': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-info fw-bold">•</span><div><strong class="text-white">Windows NSIS Engine Hardening</strong>: Refined 64-bit enterprise installer with seamless background update and instant silent restart handoff.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-info fw-bold">•</span><div><strong class="text-white">Streamlined Build Pipeline</strong>: Optimized CI/CD packaging workflow targeting pure Windows environments.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-info fw-bold">•</span><div><strong class="text-white">Zero-Flicker Branded Splash</strong>: Universal laser neon loader with smooth hardware-accelerated DWM rendering.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-info fw-bold">•</span><div><strong class="text-white">Edge Security Standards</strong>: Strengthened session validation and Cloudflare D1 edge synchronizations.</div></div>
            `,
            '2.0.0': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Atomic Port Bonding</strong>: Single-shot operator session registration and port trust eliminated edge race conditions.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Self-Healing Admin Auth</strong>: Instant fallback recovery ensuring uninterrupted terminal sign-in out of the box.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Universal RBAC Gateway</strong>: Standardized edge authentication across all inventory, sales, and catalog microservices.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Resilient Error Interceptor</strong>: Refined API gateway preventing disruptive reloads on credential retries.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">UI Polish &amp; Glow Effects</strong>: Smooth cyber sign-in transitions and clear security feedback banners.</div></div>
            `,
            '1.9.9': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Active Checkout &amp; Cart Shield</strong>: Automatically suppresses update popups while cashier is typing, scanning, or processing sales.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Shift-End &amp; Logout Smart Update</strong>: Convenient 1-click option to apply pending updates when ending the shift or logging out.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">State &amp; Session Auto-Restore</strong>: Safely preserves operator authentication, permissions, and active screen routes across restarts.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Overnight Idle Auto-Sync</strong>: Silently applies updates between 10:00 PM and 6:00 AM when the terminal is idle for 15+ minutes.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-success fw-bold">•</span><div><strong class="text-white">Pre-Flight Diagnostics</strong>: Checks local storage (&gt;500MB free) and monitors power status with exponential retry on WiFi drops.</div></div>
            `,
            '1.9.8': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-info fw-bold">•</span><div><strong class="text-white">1-Click Silent Engine</strong>: Instant background update without Windows installer wizards (~3s restart).</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-info fw-bold">•</span><div><strong class="text-white">Holographic Cyber Modal</strong>: Custom dark glassmorphism UI replacing browser alert/confirm popups.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-info fw-bold">•</span><div><strong class="text-white">Fullscreen Relaunch HUD</strong>: Laser spinner and live countdown during binary handoff.</div></div>
            `,
            '1.9.7': `
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-purple fw-bold">•</span><div><strong class="text-white">RBAC Permissions</strong>: Granular employee permissions with Admin bypass.</div></div>
                <div class="d-flex align-items-start gap-2 mb-1"><span class="text-purple fw-bold">•</span><div><strong class="text-white">Animated Cyber Sign-In</strong>: Floating plasma orbs and squircle branding.</div></div>
            `
        };

        return fallbackMap[version] || `<div class="text-muted">Production release v${version} with enterprise performance and security optimizations.</div>`;
    }

    /**
     * Open Modern Holographic Update Modal Dialog
     */
    window.openBcsUpdateModal = function(info) {
        const existing = document.getElementById('bcsModernUpdateModal');
        if (existing) existing.remove();

        const targetVer = info && (info.version || info.latestVersion) ? (info.version || info.latestVersion) : currentAppVersion;
        const notesHtml = formatReleaseNotes(targetVer, info ? (info.releaseNotes || info.notes) : '');

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

                <!-- Dynamic Release Changelog Box -->
                <div class="p-3 rounded-3 bg-dark bg-opacity-70 border border-secondary border-opacity-25 small mb-3 text-start" style="max-height: 150px; overflow-y: auto;">
                    <div class="text-uppercase fw-bold text-info mb-2 d-flex align-items-center gap-1" style="font-size: 0.72rem; letter-spacing: 0.05em;">
                        <i class="bi bi-file-earmark-text-fill"></i> Release Notes &amp; Changelog (v${targetVer})
                    </div>
                    <div class="text-light" style="font-size: 0.76rem; line-height: 1.45;">
                        ${notesHtml}
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

                <div class="d-flex gap-2 mt-3 pt-2 border-top border-secondary border-opacity-25">
                    <button type="button" class="bcs-btn-settings w-50 py-2 small" onclick="window.closeBcsUpdateModal(); window.location.href='settings.html#tab-updates';">
                        <i class="bi bi-sliders2-vertical text-info"></i> Open Settings
                    </button>
                    <button type="button" class="bcs-btn-settings w-50 py-2 small" onclick="window.closeBcsUpdateModal(); window.reinstallBcsApp('${targetVer}');">
                        <i class="bi bi-box-arrow-down text-info"></i> Reinstall (.exe)
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
                if (!isOnSettingsPage()) {
                    redirectToSettingsUpdater(true);
                    return;
                }
                if (downloadedUpdateInfo) {
                    window.captureBcsSessionSnapshot();
                    window.applyBcsUpdateAndRestart();
                } else {
                    redirectToSettingsUpdater(true);
                }
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

        const targetVer = downloadedUpdateInfo ? downloadedUpdateInfo.version : currentAppVersion;

        const overlayHtml = `
        <div id="bcsRelaunchOverlay" class="bcs-relaunch-overlay">
            <div class="bcs-relaunch-box">
                <div class="bcs-l1-logo-container">
                    <svg viewBox="460 380 1120 1280" class="bcs-l1-svg" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <filter id="bcsNeonGlowRelaunch" x="-35%" y="-35%" width="170%" height="170%">
                                <feGaussianBlur stdDeviation="8" result="blur1" />
                                <feGaussianBlur stdDeviation="22" result="blur2" />
                                <feMerge>
                                    <feMergeNode in="blur2" />
                                    <feMergeNode in="blur1" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>
                        <!-- Ambient Wireframe Guide -->
                        <g class="bcs-l1-guide-group">
                            <path class="bcs-l1-stroke-guide" fill="none" d="M 610 780.200 C 610 928.959, 610.381 1047.977, 610.856 1047.450 C 611.327 1046.928, 614.660 1041.983, 618.263 1036.462 C 630.382 1017.893, 645.788 998.334, 656.402 988.042 L 661 983.584 L 661 773.258 L 661 562.932 909.250 563.281 C 1173.496 563.653, 1157.648 563.384, 1180.582 567.887 C 1192.680 570.262, 1211.295 575.924, 1225.500 581.550 C 1236.625 585.955, 1257.803 597.144, 1268.068 604.039 C 1273.256 607.524, 1278.095 610.966, 1278.821 611.687 C 1279.548 612.409, 1280.453 613, 1280.832 613 C 1281.210 613, 1282.641 614.013, 1284.010 615.250 C 1285.380 616.487, 1288.300 618.830, 1290.500 620.456 C 1295.682 624.286, 1317.714 646.318, 1321.544 651.500 C 1323.170 653.700, 1325.513 656.620, 1326.750 657.990 C 1327.987 659.359, 1329 660.790, 1329 661.168 C 1329 661.547, 1329.589 662.452, 1330.310 663.179 C 1332.127 665.012, 1342 679.748, 1342 680.626 C 1342 681.020, 1342.640 682.053, 1343.423 682.921 C 1345.573 685.308, 1355.170 704.445, 1358.757 713.500 C 1361.778 721.124, 1367.101 737.510, 1368.991 745 C 1371.371 754.435, 1372.235 759.054, 1374.993 777.082 C 1376.504 786.956, 1376.223 822.762, 1374.539 835 C 1371.789 854.983, 1369.059 866.981, 1363.409 883.910 C 1352.511 916.564, 1330.827 951.252, 1305.523 976.510 C 1297.530 984.488, 1291.902 989.591, 1284 996.023 C 1280.975 998.485, 1278.275 1000.747, 1278 1001.048 C 1277.725 1001.350, 1275.925 1002.678, 1274 1004 C 1272.075 1005.322, 1270.275 1006.687, 1270 1007.032 C 1269.343 1007.858, 1254.222 1018, 1253.647 1018 C 1253.404 1018, 1250.346 1019.718, 1246.852 1021.819 C 1236.594 1027.985, 1216.257 1037.534, 1205.140 1041.403 C 1187.715 1047.468, 1170.667 1051.582, 1150.013 1054.705 C 1141.032 1056.063, 1120.843 1056.399, 1011.500 1057.010 C 875.652 1057.770, 880.982 1057.575, 862.192 1062.449 C 840.565 1068.058, 819.596 1079.150, 800.484 1095.092 C 796.259 1098.616, 789.043 1105.983, 784.449 1111.462 C 765.950 1133.525, 753.671 1160.567, 749.550 1188.317 C 748.230 1197.209, 748 1213.602, 748 1298.899 L 748 1399.042 950.250 1398.718 L 1152.500 1398.394 1161.799 1396.258 C 1172.642 1393.768, 1175.543 1392.899, 1187 1388.713 C 1201.154 1383.540, 1218.281 1374.367, 1230 1365.683 C 1236.092 1361.169, 1260.355 1337.555, 1263.500 1333.080 C 1275.429 1316.105, 1280.435 1307.550, 1286.368 1294 C 1288.386 1289.390, 1293.494 1273.686, 1294.824 1268 C 1295.403 1265.525, 1296.137 1262.375, 1296.454 1261 C 1298.081 1253.954, 1300 1235.482, 1300 1226.865 C 1300 1215.390, 1297.776 1197.163, 1294.830 1184.500 C 1290.122 1164.260, 1280.346 1141.298, 1269.286 1124.500 C 1261.842 1113.195, 1250.346 1099.374, 1241.618 1091.238 C 1236.098 1086.091, 1235.221 1084.867, 1236.700 1084.366 C 1240.779 1082.984, 1267.371 1069.651, 1273.690 1065.819 C 1277.436 1063.547, 1285.810 1058.135, 1292.301 1053.791 L 1304.102 1045.892 1309.801 1051.091 C 1315.910 1056.665, 1326.804 1068.299, 1333.807 1076.729 C 1340.648 1084.964, 1354.180 1105.764, 1359.733 1116.580 C 1367.861 1132.410, 1375.188 1151.839, 1379.125 1168 C 1387.987 1204.372, 1389.115 1242.816, 1382.294 1276 C 1381.446 1280.125, 1380.538 1284.625, 1380.277 1286 C 1380.015 1287.375, 1378.911 1291.650, 1377.824 1295.500 C 1370.492 1321.462, 1359.290 1346.030, 1345.191 1367.065 C 1340.238 1374.454, 1335.356 1381.405, 1334.343 1382.510 C 1333.329 1383.616, 1330.744 1386.766, 1328.598 1389.510 C 1321.543 1398.534, 1298.595 1420.339, 1286.940 1429.094 C 1267.381 1443.786, 1256.702 1450.376, 1237.651 1459.510 C 1209.287 1473.110, 1181.240 1480.894, 1149.500 1483.977 C 1143.354 1484.574, 1047.276 1484.958, 900.209 1484.974 L 660.918 1485 661.282 1340.750 C 661.672 1186.459, 661.400 1195.358, 666.488 1170.500 C 671.177 1147.593, 680.784 1123.092, 694.062 1100.181 C 710.507 1071.806, 737.983 1042.449, 766 1023.322 C 782.238 1012.236, 810.829 998.991, 829 994.136 C 839.152 991.424, 855.576 988.328, 866.500 987.067 C 872.039 986.428, 923.566 985.857, 1000.500 985.581 C 1133.697 985.105, 1132.557 985.145, 1154 980.115 C 1166.270 977.237, 1181.998 971.544, 1193.499 965.820 C 1206.534 959.332, 1223.354 948.034, 1234 938.617 C 1249.819 924.623, 1264.577 905.351, 1273.909 886.500 C 1280.809 872.563, 1284.974 860.726, 1288.161 846 C 1290.145 836.829, 1290.433 832.651, 1290.433 813 C 1290.433 793.313, 1290.148 789.193, 1288.155 780.042 C 1282.995 756.350, 1275.206 737.494, 1262.923 718.958 C 1254.491 706.233, 1232.940 684.696, 1220.047 676.111 C 1207.737 667.914, 1196 662.077, 1183 657.689 C 1168.745 652.877, 1153.887 649.997, 1140.589 649.468 C 1118.643 648.595, 750.470 648.071, 749.128 648.911 C 747.972 649.634, 747.799 673.702, 748.033 801.135 C 748.187 884.386, 748.242 957.324, 748.156 963.220 L 748 973.939 740.250 979.136 C 733.516 983.651, 717.439 995.512, 716 997.026 C 715.725 997.316, 712.599 1000.016, 709.053 1003.026 C 700.758 1010.068, 692.169 1018.641, 684.001 1028.030 C 680.427 1032.138, 677.265 1035.725, 676.975 1036 C 676.685 1036.275, 674.897 1038.525, 673 1041 C 671.103 1043.475, 669.300 1045.725, 668.992 1046 C 668.093 1046.803, 658.606 1060.306, 657.400 1062.500 C 656.796 1063.600, 654.078 1068.100, 651.361 1072.500 C 642.066 1087.554, 631.019 1111.976, 624.674 1131.500 C 619.804 1146.487, 615.252 1166.280, 613.062 1182 C 610.310 1201.755, 610 1221.343, 610 1375.645 L 610 1536 877.043 1536 C 1111.195 1536, 1145.836 1535.810, 1158.293 1534.453 C 1203.276 1529.557, 1245.852 1515.599, 1284 1493.244 C 1305.175 1480.834, 1320.707 1469.446, 1337.500 1454.014 C 1349.911 1442.608, 1365.047 1426.792, 1371.007 1419 C 1372.900 1416.525, 1374.690 1414.275, 1374.986 1414 C 1376.940 1412.183, 1388.903 1394.601, 1394.717 1385 C 1413.876 1353.364, 1426.206 1321.210, 1433.019 1285.111 C 1439.380 1251.411, 1439.786 1210.500, 1434.080 1178 C 1429.124 1149.767, 1421.450 1124.769, 1410.628 1101.612 C 1397.732 1074.014, 1380.576 1048.793, 1356.500 1022.037 C 1350.450 1015.314, 1345.500 1009.447, 1345.500 1009 C 1345.500 1008.552, 1347.303 1006.232, 1349.506 1003.843 C 1351.709 1001.454, 1355.528 997.025, 1357.992 994 C 1360.456 990.975, 1362.704 988.275, 1362.986 988 C 1363.269 987.725, 1365.058 985.475, 1366.963 983 C 1368.868 980.525, 1370.780 978.350, 1371.213 978.167 C 1371.646 977.983, 1372 977.394, 1372 976.858 C 1372 976.322, 1373.313 974.222, 1374.917 972.191 C 1379.098 966.902, 1390.665 947.348, 1397.214 934.500 C 1402.956 923.236, 1409.696 907.177, 1413.162 896.500 C 1415.763 888.488, 1420.879 868.783, 1422.055 862.250 C 1422.575 859.362, 1423.460 854.413, 1424.021 851.250 C 1425.741 841.567, 1427.994 816.026, 1427.997 806.172 C 1428 795.922, 1426.517 776.430, 1424.901 765.500 C 1423.853 758.405, 1420.649 741.811, 1418.917 734.500 C 1416.679 725.058, 1412.465 711.824, 1407.333 698.123 C 1403.408 687.643, 1392.288 664.981, 1385.882 654.406 C 1379.059 643.143, 1367.756 626.695, 1364.986 624 C 1364.704 623.725, 1362.481 621.025, 1360.048 618 C 1354.600 611.229, 1326.853 583.444, 1321.837 579.737 C 1319.822 578.248, 1317.572 576.453, 1316.837 575.747 C 1316.101 575.040, 1312.575 572.309, 1309 569.676 C 1305.425 567.043, 1301.707 564.239, 1300.739 563.444 C 1299.770 562.650, 1298.771 562, 1298.520 562 C 1298.268 562, 1294.786 559.865, 1290.781 557.256 C 1286.777 554.648, 1282.600 552.025, 1281.500 551.428 C 1258.223 538.800, 1247.526 533.895, 1231.291 528.406 C 1219.527 524.429, 1210.915 522.011, 1197.500 518.921 C 1185.969 516.265, 1180.427 515.351, 1164.655 513.504 C 1153.522 512.201, 1115.696 512, 880.905 512 L 610 512 610 780.200" />
                            <path class="bcs-l1-stroke-guide" fill="none" d="M 813.890 813.232 C 813.775 917.194, 813.916 943.220, 814.602 943.924 C 814.829 944.158, 819.174 943.380, 824.258 942.197 C 835.786 939.514, 841.593 938.379, 850.500 937.067 C 854.350 936.500, 859.075 935.745, 861 935.389 C 862.925 935.033, 920.750 934.437, 989.500 934.065 C 1128.363 933.313, 1121.095 933.675, 1142.873 926.426 C 1155.609 922.187, 1167.032 916.334, 1176.964 908.958 C 1191.710 898.008, 1203.456 884.344, 1211.588 868.679 C 1220.640 851.243, 1224.301 835.885, 1224.145 816 C 1224.034 801.882, 1221.840 789.499, 1217.499 778.487 C 1211.759 763.930, 1200.206 747.466, 1189.341 738.360 C 1177.721 728.621, 1163.796 721.320, 1148.062 716.717 L 1140.500 714.504 977.250 714.235 L 814 713.965 813.890 813.232" />
                            <path class="bcs-l1-stroke-guide" fill="none" d="M 892.500 1110.466 C 884.709 1112.198, 874.783 1115.636, 868.500 1118.777 C 844.077 1130.988, 824.823 1155.013, 817.199 1182.792 L 814.535 1192.500 814.230 1263.817 L 813.924 1335.134 976.712 1334.494 C 1116.655 1333.944, 1140.623 1333.640, 1147.500 1332.328 C 1160.131 1329.917, 1175.050 1324.187, 1183.294 1318.580 C 1185.381 1317.161, 1187.318 1316, 1187.598 1316 C 1188.857 1316, 1202.067 1304.719, 1206.230 1300.089 C 1212.013 1293.657, 1220.780 1280.375, 1224.439 1272.500 C 1227.778 1265.315, 1230.532 1256.996, 1232.714 1247.500 C 1234.908 1237.950, 1234.885 1212.200, 1232.674 1202.346 C 1230.616 1193.179, 1226.051 1180.008, 1222.498 1172.991 C 1214.915 1158.013, 1201.464 1142.138, 1187.500 1131.682 C 1177.427 1124.141, 1160.474 1115.926, 1147.500 1112.300 L 1137.500 1109.506 1018 1109.319 C 921.502 1109.167, 897.345 1109.388, 892.500 1110.466" />
                        </g>
                        <!-- Pure Neon Laser Tracing Strokes -->
                        <g class="bcs-l1-laser-group">
                            <path class="bcs-l1-stroke-outer" fill="none" stroke="#00f0ff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" d="M 610 780.200 C 610 928.959, 610.381 1047.977, 610.856 1047.450 C 611.327 1046.928, 614.660 1041.983, 618.263 1036.462 C 630.382 1017.893, 645.788 998.334, 656.402 988.042 L 661 983.584 L 661 773.258 L 661 562.932 909.250 563.281 C 1173.496 563.653, 1157.648 563.384, 1180.582 567.887 C 1192.680 570.262, 1211.295 575.924, 1225.500 581.550 C 1236.625 585.955, 1257.803 597.144, 1268.068 604.039 C 1273.256 607.524, 1278.095 610.966, 1278.821 611.687 C 1279.548 612.409, 1280.453 613, 1280.832 613 C 1281.210 613, 1282.641 614.013, 1284.010 615.250 C 1285.380 616.487, 1288.300 618.830, 1290.500 620.456 C 1295.682 624.286, 1317.714 646.318, 1321.544 651.500 C 1323.170 653.700, 1325.513 656.620, 1326.750 657.990 C 1327.987 659.359, 1329 660.790, 1329 661.168 C 1329 661.547, 1329.589 662.452, 1330.310 663.179 C 1332.127 665.012, 1342 679.748, 1342 680.626 C 1342 681.020, 1342.640 682.053, 1343.423 682.921 C 1345.573 685.308, 1355.170 704.445, 1358.757 713.500 C 1361.778 721.124, 1367.101 737.510, 1368.991 745 C 1371.371 754.435, 1372.235 759.054, 1374.993 777.082 C 1376.504 786.956, 1376.223 822.762, 1374.539 835 C 1371.789 854.983, 1369.059 866.981, 1363.409 883.910 C 1352.511 916.564, 1330.827 951.252, 1305.523 976.510 C 1297.530 984.488, 1291.902 989.591, 1284 996.023 C 1280.975 998.485, 1278.275 1000.747, 1278 1001.048 C 1277.725 1001.350, 1275.925 1002.678, 1274 1004 C 1272.075 1005.322, 1270.275 1006.687, 1270 1007.032 C 1269.343 1007.858, 1254.222 1018, 1253.647 1018 C 1253.404 1018, 1250.346 1019.718, 1246.852 1021.819 C 1236.594 1027.985, 1216.257 1037.534, 1205.140 1041.403 C 1187.715 1047.468, 1170.667 1051.582, 1150.013 1054.705 C 1141.032 1056.063, 1120.843 1056.399, 1011.500 1057.010 C 875.652 1057.770, 880.982 1057.575, 862.192 1062.449 C 840.565 1068.058, 819.596 1079.150, 800.484 1095.092 C 796.259 1098.616, 789.043 1105.983, 784.449 1111.462 C 765.950 1133.525, 753.671 1160.567, 749.550 1188.317 C 748.230 1197.209, 748 1213.602, 748 1298.899 L 748 1399.042 950.250 1398.718 L 1152.500 1398.394 1161.799 1396.258 C 1172.642 1393.768, 1175.543 1392.899, 1187 1388.713 C 1201.154 1383.540, 1218.281 1374.367, 1230 1365.683 C 1236.092 1361.169, 1260.355 1337.555, 1263.500 1333.080 C 1275.429 1316.105, 1280.435 1307.550, 1286.368 1294 C 1288.386 1289.390, 1293.494 1273.686, 1294.824 1268 C 1295.403 1265.525, 1296.137 1262.375, 1296.454 1261 C 1298.081 1253.954, 1300 1235.482, 1300 1226.865 C 1300 1215.390, 1297.776 1197.163, 1294.830 1184.500 C 1290.122 1164.260, 1280.346 1141.298, 1269.286 1124.500 C 1261.842 1113.195, 1250.346 1099.374, 1241.618 1091.238 C 1236.098 1086.091, 1235.221 1084.867, 1236.700 1084.366 C 1240.779 1082.984, 1267.371 1069.651, 1273.690 1065.819 C 1277.436 1063.547, 1285.810 1058.135, 1292.301 1053.791 L 1304.102 1045.892 1309.801 1051.091 C 1315.910 1056.665, 1326.804 1068.299, 1333.807 1076.729 C 1340.648 1084.964, 1354.180 1105.764, 1359.733 1116.580 C 1367.861 1132.410, 1375.188 1151.839, 1379.125 1168 C 1387.987 1204.372, 1389.115 1242.816, 1382.294 1276 C 1381.446 1280.125, 1380.538 1284.625, 1380.277 1286 C 1380.015 1287.375, 1378.911 1291.650, 1377.824 1295.500 C 1370.492 1321.462, 1359.290 1346.030, 1345.191 1367.065 C 1340.238 1374.454, 1335.356 1381.405, 1334.343 1382.510 C 1333.329 1383.616, 1330.744 1386.766, 1328.598 1389.510 C 1321.543 1398.534, 1298.595 1420.339, 1286.940 1429.094 C 1267.381 1443.786, 1256.702 1450.376, 1237.651 1459.510 C 1209.287 1473.110, 1181.240 1480.894, 1149.500 1483.977 C 1143.354 1484.574, 1047.276 1484.958, 900.209 1484.974 L 660.918 1485 661.282 1340.750 C 661.672 1186.459, 661.400 1195.358, 666.488 1170.500 C 671.177 1147.593, 680.784 1123.092, 694.062 1100.181 C 710.507 1071.806, 737.983 1042.449, 766 1023.322 C 782.238 1012.236, 810.829 998.991, 829 994.136 C 839.152 991.424, 855.576 988.328, 866.500 987.067 C 872.039 986.428, 923.566 985.857, 1000.500 985.581 C 1133.697 985.105, 1132.557 985.145, 1154 980.115 C 1166.270 977.237, 1181.998 971.544, 1193.499 965.820 C 1206.534 959.332, 1223.354 948.034, 1234 938.617 C 1249.819 924.623, 1264.577 905.351, 1273.909 886.500 C 1280.809 872.563, 1284.974 860.726, 1288.161 846 C 1290.145 836.829, 1290.433 832.651, 1290.433 813 C 1290.433 793.313, 1290.148 789.193, 1288.155 780.042 C 1282.995 756.350, 1275.206 737.494, 1262.923 718.958 C 1254.491 706.233, 1232.940 684.696, 1220.047 676.111 C 1207.737 667.914, 1196 662.077, 1183 657.689 C 1168.745 652.877, 1153.887 649.997, 1140.589 649.468 C 1118.643 648.595, 750.470 648.071, 749.128 648.911 C 747.972 649.634, 747.799 673.702, 748.033 801.135 C 748.187 884.386, 748.242 957.324, 748.156 963.220 L 748 973.939 740.250 979.136 C 733.516 983.651, 717.439 995.512, 716 997.026 C 715.725 997.316, 712.599 1000.016, 709.053 1003.026 C 700.758 1010.068, 692.169 1018.641, 684.001 1028.030 C 680.427 1032.138, 677.265 1035.725, 676.975 1036 C 676.685 1036.275, 674.897 1038.525, 673 1041 C 671.103 1043.475, 669.300 1045.725, 668.992 1046 C 668.093 1046.803, 658.606 1060.306, 657.400 1062.500 C 656.796 1063.600, 654.078 1068.100, 651.361 1072.500 C 642.066 1087.554, 631.019 1111.976, 624.674 1131.500 C 619.804 1146.487, 615.252 1166.280, 613.062 1182 C 610.310 1201.755, 610 1221.343, 610 1375.645 L 610 1536 877.043 1536 C 1111.195 1536, 1145.836 1535.810, 1158.293 1534.453 C 1203.276 1529.557, 1245.852 1515.599, 1284 1493.244 C 1305.175 1480.834, 1320.707 1469.446, 1337.500 1454.014 C 1349.911 1442.608, 1365.047 1426.792, 1371.007 1419 C 1372.900 1416.525, 1374.690 1414.275, 1374.986 1414 C 1376.940 1412.183, 1388.903 1394.601, 1394.717 1385 C 1413.876 1353.364, 1426.206 1321.210, 1433.019 1285.111 C 1439.380 1251.411, 1439.786 1210.500, 1434.080 1178 C 1429.124 1149.767, 1421.450 1124.769, 1410.628 1101.612 C 1397.732 1074.014, 1380.576 1048.793, 1356.500 1022.037 C 1350.450 1015.314, 1345.500 1009.447, 1345.500 1009 C 1345.500 1008.552, 1347.303 1006.232, 1349.506 1003.843 C 1351.709 1001.454, 1355.528 997.025, 1357.992 994 C 1360.456 990.975, 1362.704 988.275, 1362.986 988 C 1363.269 987.725, 1365.058 985.475, 1366.963 983 C 1368.868 980.525, 1370.780 978.350, 1371.213 978.167 C 1371.646 977.983, 1372 977.394, 1372 976.858 C 1372 976.322, 1373.313 974.222, 1374.917 972.191 C 1379.098 966.902, 1390.665 947.348, 1397.214 934.500 C 1402.956 923.236, 1409.696 907.177, 1413.162 896.500 C 1415.763 888.488, 1420.879 868.783, 1422.055 862.250 C 1422.575 859.362, 1423.460 854.413, 1424.021 851.250 C 1425.741 841.567, 1427.994 816.026, 1427.997 806.172 C 1428 795.922, 1426.517 776.430, 1424.901 765.500 C 1423.853 758.405, 1420.649 741.811, 1418.917 734.500 C 1416.679 725.058, 1412.465 711.824, 1407.333 698.123 C 1403.408 687.643, 1392.288 664.981, 1385.882 654.406 C 1379.059 643.143, 1367.756 626.695, 1364.986 624 C 1364.704 623.725, 1362.481 621.025, 1360.048 618 C 1354.600 611.229, 1326.853 583.444, 1321.837 579.737 C 1319.822 578.248, 1317.572 576.453, 1316.837 575.747 C 1316.101 575.040, 1312.575 572.309, 1309 569.676 C 1305.425 567.043, 1301.707 564.239, 1300.739 563.444 C 1299.770 562.650, 1298.771 562, 1298.520 562 C 1298.268 562, 1294.786 559.865, 1290.781 557.256 C 1286.777 554.648, 1282.600 552.025, 1281.500 551.428 C 1258.223 538.800, 1247.526 533.895, 1231.291 528.406 C 1219.527 524.429, 1210.915 522.011, 1197.500 518.921 C 1185.969 516.265, 1180.427 515.351, 1164.655 513.504 C 1153.522 512.201, 1115.696 512, 880.905 512 L 610 512 610 780.200" filter="url(#bcsNeonGlowRelaunch)" />
                            <path class="bcs-l1-stroke-top" fill="none" stroke="#00f0ff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" d="M 813.890 813.232 C 813.775 917.194, 813.916 943.220, 814.602 943.924 C 814.829 944.158, 819.174 943.380, 824.258 942.197 C 835.786 939.514, 841.593 938.379, 850.500 937.067 C 854.350 936.500, 859.075 935.745, 861 935.389 C 862.925 935.033, 920.750 934.437, 989.500 934.065 C 1128.363 933.313, 1121.095 933.675, 1142.873 926.426 C 1155.609 922.187, 1167.032 916.334, 1176.964 908.958 C 1191.710 898.008, 1203.456 884.344, 1211.588 868.679 C 1220.640 851.243, 1224.301 835.885, 1224.145 816 C 1224.034 801.882, 1221.840 789.499, 1217.499 778.487 C 1211.759 763.930, 1200.206 747.466, 1189.341 738.360 C 1177.721 728.621, 1163.796 721.320, 1148.062 716.717 L 1140.500 714.504 977.250 714.235 L 814 713.965 813.890 813.232" filter="url(#bcsNeonGlowRelaunch)" />
                            <path class="bcs-l1-stroke-bottom" fill="none" stroke="#00f0ff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" d="M 892.500 1110.466 C 884.709 1112.198, 874.783 1115.636, 868.500 1118.777 C 844.077 1130.988, 824.823 1155.013, 817.199 1182.792 L 814.535 1192.500 814.230 1263.817 L 813.924 1335.134 976.712 1334.494 C 1116.655 1333.944, 1140.623 1333.640, 1147.500 1332.328 C 1160.131 1329.917, 1175.050 1324.187, 1183.294 1318.580 C 1185.381 1317.161, 1187.318 1316, 1187.598 1316 C 1188.857 1316, 1202.067 1304.719, 1206.230 1300.089 C 1212.013 1293.657, 1220.780 1280.375, 1224.439 1272.500 C 1227.778 1265.315, 1230.532 1256.996, 1232.714 1247.500 C 1234.908 1237.950, 1234.885 1212.200, 1232.674 1202.346 C 1230.616 1193.179, 1226.051 1180.008, 1222.498 1172.991 C 1214.915 1158.013, 1201.464 1142.138, 1187.500 1131.682 C 1177.427 1124.141, 1160.474 1115.926, 1147.500 1112.300 L 1137.500 1109.506 1018 1109.319 C 921.502 1109.167, 897.345 1109.388, 892.500 1110.466" filter="url(#bcsNeonGlowRelaunch)" />
                        </g>
                    </svg>
                </div>
                <h3 class="fw-extrabold text-white mb-2">Applying Quantum Update...</h3>
                <p class="text-muted small mb-0" id="bcsRelaunchStatusText">
                    Swapping application binaries silently in background. Restoring workspace...
                </p>
                <div class="bcs-relaunch-bar">
                    <div class="bcs-relaunch-bar-fill" id="bcsRelaunchBarFill"></div>
                </div>
                <div class="d-flex justify-content-between small text-muted font-monospace mt-2">
                    <span id="bcsRelaunchTargetVer">Target: v${targetVer}</span>
                    <span id="bcsRelaunchCountdown">Restarting in 3s...</span>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', overlayHtml);

        const overlay = document.getElementById('bcsRelaunchOverlay');
        if (overlay) {
            try {
                const outer = overlay.querySelector('.bcs-l1-stroke-outer');
                const top = overlay.querySelector('.bcs-l1-stroke-top');
                const bottom = overlay.querySelector('.bcs-l1-stroke-bottom');
                if (outer && outer.getTotalLength) {
                    outer.style.strokeDasharray = Math.ceil(outer.getTotalLength() || 10060);
                    top.style.strokeDasharray = Math.ceil(top.getTotalLength() || 1180);
                    bottom.style.strokeDasharray = Math.ceil(bottom.getTotalLength() || 1160);
                }
            } catch (e) {}
        }

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

        // 0. Update Available Notification
        ipcRenderer.on('update_available', (event, info) => {
            availableRemoteInfo = info;
            updateTopbarPill('available', info);
            showModernUpdateToast(info ? info.version : currentAppVersion);
            if (!sessionStorage.getItem('bcs_update_alert_shown')) {
                sessionStorage.setItem('bcs_update_alert_shown', 'true');
                window.showUpdateAvailableAlert(info);
            }
        });

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

        // 4. Update Error Handler
        ipcRenderer.on('update_error', (event, err) => {
            console.warn('[Smart Updater] Error caught from electron-updater:', err);
            updateTopbarPill('error', err);
        });

        // Universal Edge Telemetry Discovery Check
        triggerSilentDiscoveryCheck();
    }

    function triggerSilentDiscoveryCheck() {
        setTimeout(async () => {
            try {
                const res = await fetch(`https://backend.bcs.bcsdeveloper.com/api/updater/check?current=${currentAppVersion}`).then(r => r.json());
                if (res && res.updateAvailable) {
                    availableRemoteInfo = res;
                    updateTopbarPill('available', res);
                    if (!sessionStorage.getItem('bcs_update_alert_shown')) {
                        sessionStorage.setItem('bcs_update_alert_shown', 'true');
                        window.showUpdateAvailableAlert(res);
                    }
                }
            } catch (e) {}
        }, 2200);
    }

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initUpdater();
            if (!ipcRenderer) triggerSilentDiscoveryCheck();
        });
    } else {
        initUpdater();
        if (!ipcRenderer) triggerSilentDiscoveryCheck();
    }
})();
