/**
 * BCS Enterprise POS - Next-Gen Holographic Auto-Updater Engine
 * 1-Click Silent Background Updates & Cyberpunk HUD Modals
 * Replaces legacy OS confirm() dialogs and classic NSIS setup wizards.
 */

(function() {
    let currentAppVersion = '1.9.8';
    let downloadedUpdateInfo = null;
    let isIpcBound = false;

    // Inject CSS stylesheet if not present
    if (!document.querySelector('link[href*="updater.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'template/updater/updater.css';
        document.head.appendChild(link);
    }

    // Safely get Electron ipcRenderer
    let ipcRenderer = null;
    if (typeof require !== 'undefined') {
        try {
            ipcRenderer = require('electron').ipcRenderer;
        } catch (e) {}
    }

    /**
     * Update the Topbar updater container pill
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
        }
    }

    /**
     * Update Login Page updater container (if present)
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
     * (Replaces browser confirm() dialog with luxury cyberpunk glass UI)
     */
    window.openBcsUpdateModal = function(info) {
        // Remove existing modal if already open
        const existing = document.getElementById('bcsModernUpdateModal');
        if (existing) existing.remove();

        const targetVer = info && info.version ? info.version : currentAppVersion;

        const modalHtml = `
        <div id="bcsModernUpdateModal" class="bcs-modal-backdrop">
            <div class="bcs-modal-card">
                <button type="button" class="bcs-modal-close" onclick="window.closeBcsUpdateModal()" title="Close">&times;</button>
                
                <!-- Animated 3D Emblem -->
                <div class="bcs-orbital-emblem">
                    <div class="bcs-orbital-ring"></div>
                    <div class="bcs-orbital-ring reverse"></div>
                    <div class="bcs-orbital-core">
                        <i class="bi bi-rocket-takeoff-fill"></i>
                    </div>
                </div>

                <!-- Header Title -->
                <div class="text-center mb-3">
                    <div class="text-info text-uppercase fw-bold small mb-1" style="font-size: 0.72rem; letter-spacing: 0.1em;">
                        <i class="bi bi-shield-check me-1"></i> BCS Enterprise POS PRO Max
                    </div>
                    <h4 class="fw-extrabold text-white mb-1">Quantum Software Update Ready</h4>
                    <p class="text-muted small mb-0">Production update package downloaded and cryptographically verified.</p>
                </div>

                <!-- Version Comparison -->
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

                <!-- Feature Highlights -->
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
                            <strong class="text-white d-block">Cashier Safe Protection</strong>
                            <small class="text-muted">Active cart tickets, local cache, and offline catalogue are 100% preserved.</small>
                        </div>
                    </div>

                    <div class="bcs-feature-row">
                        <div class="bcs-feature-icon purple">
                            <i class="bi bi-stars"></i>
                        </div>
                        <div>
                            <strong class="text-white d-block">Holographic UI &amp; RBAC Control</strong>
                            <small class="text-muted">Ultra-fluid micro-animations, role security, and real-time edge sync.</small>
                        </div>
                    </div>
                </div>

                <!-- Safe Mode Notice -->
                <div class="bcs-safe-notice">
                    <i class="bi bi-info-circle-fill text-info fs-6"></i>
                    <span>Updating takes approximately 3 to 5 seconds. The app will restart automatically.</span>
                </div>

                <!-- Modal Action Buttons -->
                <div class="bcs-modal-actions">
                    <button type="button" class="bcs-btn-update-now" id="bcsModalUpdateConfirmBtn">
                        <i class="bi bi-arrow-repeat fs-5"></i> Restart &amp; Install (~3s)
                    </button>
                    <button type="button" class="bcs-btn-later" onclick="window.closeBcsUpdateModal()">
                        Remind Me on Exit
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
        // Prevent duplicate overlays
        if (document.getElementById('bcsRelaunchOverlay')) return;

        const overlayHtml = `
        <div id="bcsRelaunchOverlay" class="bcs-relaunch-overlay">
            <div class="bcs-relaunch-box">
                <div class="bcs-laser-spinner">
                    <div class="bcs-laser-spinner-ring"></div>
                </div>
                <h3 class="fw-extrabold text-white mb-2">Applying Quantum Update...</h3>
                <p class="text-muted small mb-0" id="bcsRelaunchStatusText">
                    Swapping application binaries silently in background. Zero wizard setup.
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

        // Animate fill bar and countdown
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
     * Initialize IPC listeners & cache
     */
    function initUpdater() {
        if (!ipcRenderer || isIpcBound) return;
        isIpcBound = true;

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
    }

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUpdater);
    } else {
        initUpdater();
    }
})();
