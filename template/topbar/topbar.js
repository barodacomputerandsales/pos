window._renderTopbarImpl = function() {
    const TOPBAR_HTML = `
    <header class="topbar">
        <div class="d-flex align-items-center gap-2">
            <img src="template/bcs-logo.svg" alt="BCS" style="width: 38px; height: 38px; object-fit: contain; filter: drop-shadow(0 0 12px rgba(0, 229, 255, 0.55));">
            <h4 class="mb-0 fw-bold" style="background: linear-gradient(135deg, #00e5ff, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">BCS Enterprise</h4>
            <span id="topbarVersionBadge" class="badge bg-secondary bg-opacity-25 text-muted border border-secondary border-opacity-25 small" style="font-size: 0.75rem;">v1.9.5</span>
        </div>
        <div class="d-flex align-items-center gap-3">
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
    `;
    
    if (!document.querySelector('.topbar')) {
        document.body.insertAdjacentHTML('afterbegin', TOPBAR_HTML);
    }

    // Load active version into topbar badge
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
