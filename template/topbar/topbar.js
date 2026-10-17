window._renderTopbarImpl = function() {
    const TOPBAR_HTML = `
    <header class="topbar">
        <div class="d-flex align-items-center gap-2">
            <h4 class="mb-0 fw-bold" style="background: linear-gradient(135deg, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">BCS Enterprise</h4>
            <span id="topbarVersionBadge" class="badge bg-secondary bg-opacity-25 text-muted border border-secondary border-opacity-25 small" style="font-size: 0.75rem;">v1.9.5</span>
        </div>
        <div class="d-flex align-items-center gap-3">
            
            <!-- UPDATE NOTIFICATION & ACTION PILL -->
            <div id="updatePillContainer" class="d-flex align-items-center">
                <button id="updateButton" class="btn btn-outline-secondary btn-sm fw-semibold d-flex align-items-center gap-2" style="border-radius: 20px; font-size: 0.8rem; transition: all 0.3s ease;">
                    <i class="bi bi-arrow-clockwise" id="updateIcon"></i>
                    <span id="updateButtonText">Check for Updates</span>
                    <div id="updateProgressBar" class="progress d-none" style="width: 60px; height: 6px; background-color: rgba(255,255,255,0.2); border-radius: 3px;">
                        <div id="updateProgressFill" class="progress-bar progress-bar-striped progress-bar-animated bg-info" style="width: 0%;"></div>
                    </div>
                </button>
            </div>

            <div class="user-profile">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                    A
                </div>
                <div>
                    <div class="fw-semibold" style="font-size: 0.9rem; line-height: 1;">Admin</div>
                    <small class="text-muted" style="font-size: 0.75rem;">Administrator</small>
                </div>
            </div>
            <button class="btn logout-btn" onclick="if(window.logoutUser) window.logoutUser(); else window.location.href='index.html';">
                <i class="bi bi-box-arrow-right"></i> Logout
            </button>
        </div>
    </header>

    <style>
        .spin {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes pulse-green {
            0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
            100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        .btn-update-ready {
            background-color: #22c55e !important;
            border-color: #22c55e !important;
            color: #ffffff !important;
            animation: pulse-green 2s infinite !important;
        }
    </style>
    `;
    
    if (!document.querySelector('.topbar')) {
        document.body.insertAdjacentHTML('afterbegin', TOPBAR_HTML);
    }

    // --- AUTO UPDATER IPC & UI LOGIC ---
    if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        const updateBtn = document.getElementById('updateButton');
        const updateText = document.getElementById('updateButtonText');
        const updateIcon = document.getElementById('updateIcon');
        const progressBar = document.getElementById('updateProgressBar');
        const progressFill = document.getElementById('updateProgressFill');
        const versionBadge = document.getElementById('topbarVersionBadge');

        // Fetch installed version
        ipcRenderer.invoke('get_app_version').then(ver => {
            if (ver && versionBadge) {
                versionBadge.textContent = `v${ver}`;
            }
        }).catch(() => {});

        // Reset button state helper
        function setIdleState() {
            updateBtn.className = 'btn btn-outline-secondary btn-sm fw-semibold d-flex align-items-center gap-2';
            updateBtn.disabled = false;
            updateIcon.className = 'bi bi-arrow-clockwise';
            updateText.textContent = 'Check for Updates';
            progressBar.classList.add('d-none');
            updateBtn.onclick = () => {
                ipcRenderer.send('check_for_updates');
            };
        }

        setIdleState();

        // 1. Checking for update
        ipcRenderer.on('checking_for_update', () => {
            updateBtn.disabled = true;
            updateIcon.className = 'bi bi-arrow-clockwise spin';
            updateText.textContent = 'Checking...';
            progressBar.classList.add('d-none');
        });

        // 2. Update available (starts downloading)
        ipcRenderer.on('update_available', (event, info) => {
            const newVer = (info && info.version) ? ` v${info.version}` : '';
            updateBtn.className = 'btn btn-info btn-sm text-white fw-semibold d-flex align-items-center gap-2';
            updateBtn.disabled = true;
            updateIcon.className = 'bi bi-cloud-arrow-down';
            updateText.textContent = `Update${newVer} Downloading...`;
            progressBar.classList.remove('d-none');
            progressFill.style.width = '0%';
        });

        // 3. Download Progress
        ipcRenderer.on('download_progress', (event, progressObj) => {
            const percent = Math.round(progressObj.percent || 0);
            progressBar.classList.remove('d-none');
            progressFill.style.width = `${percent}%`;
            updateText.textContent = `Downloading ${percent}%`;
        });

        // 4. Update Downloaded (Ready to Install)
        ipcRenderer.on('update_downloaded', (event, info) => {
            const newVer = (info && info.version) ? ` v${info.version}` : '';
            updateBtn.className = 'btn btn-update-ready btn-sm fw-bold d-flex align-items-center gap-2';
            updateBtn.disabled = false;
            updateIcon.className = 'bi bi-arrow-clockwise';
            updateText.textContent = `Restart to Install${newVer}`;
            progressBar.classList.add('d-none');

            updateBtn.onclick = () => {
                updateBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Restarting...';
                updateBtn.disabled = true;
                ipcRenderer.send('restart_app');
            };
        });

        // 5. Update not available (already latest)
        ipcRenderer.on('update_not_available', () => {
            updateBtn.className = 'btn btn-outline-success btn-sm fw-semibold d-flex align-items-center gap-2';
            updateBtn.disabled = true;
            updateIcon.className = 'bi bi-check2-circle text-success';
            updateText.textContent = 'App Up to Date';
            progressBar.classList.add('d-none');

            setTimeout(() => {
                setIdleState();
            }, 4000);
        });

        // 6. Update Error
        ipcRenderer.on('update_error', (event, err) => {
            updateBtn.className = 'btn btn-outline-danger btn-sm fw-semibold d-flex align-items-center gap-2';
            updateBtn.disabled = false;
            updateIcon.className = 'bi bi-exclamation-triangle text-danger';
            updateText.textContent = 'Update Error (Retry)';
            progressBar.classList.add('d-none');
            console.warn('Auto-updater error:', err);

            updateBtn.onclick = () => {
                ipcRenderer.send('check_for_updates');
            };

            setTimeout(() => {
                setIdleState();
            }, 6000);
        });
    }
};
