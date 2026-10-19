function loadCss(name) {
    if (!document.querySelector(`link[href*="template/${name}/${name}.css"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `template/${name}/${name}.css`;
        document.head.appendChild(link);
    }
}

function loadGlobalIcons() {
    if (!document.querySelector('link[href*="bootstrap-icons"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
        document.head.appendChild(link);
    }
}

function loadGlobalAnimations() {
    if (!document.querySelector('link[href*="template/animations.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'template/animations.css';
        document.head.appendChild(link);
    }
}

// Auto-inject global styling, icons, and professional animation engine immediately
loadGlobalIcons();
loadGlobalAnimations();

function loadScript(name) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src*="template/${name}/${name}.js"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = `template/${name}/${name}.js`;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

window.renderTopbar = async function() {
    loadGlobalIcons();
    loadGlobalAnimations();
    loadCss('topbar');
    await loadScript('topbar');
    if (window._renderTopbarImpl) window._renderTopbarImpl();
};

window.renderSidebar = async function(activeMenu, activeSubMenu = null) {
    loadGlobalIcons();
    loadGlobalAnimations();
    loadCss('sidebar');
    await loadScript('sidebar');
    if (window._renderSidebarImpl) window._renderSidebarImpl(activeMenu, activeSubMenu);
};

// ==========================================================================
// Global BCS Custom Animated Logo Loader Component
// ==========================================================================
window.showBcsLoader = function(message = 'Processing...') {
    let overlay = document.getElementById('bcs-global-loader-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'bcs-global-loader-overlay';
        overlay.innerHTML = `
            <div class="bcs-loader-container">
                <div class="bcs-loader-wrapper">
                    <div class="bcs-loader-orbit"></div>
                    <img src="template/bcs-loader.svg" alt="BCS Loader" class="bcs-loader-icon" />
                </div>
                <div class="bcs-loader-text" id="bcs-global-loader-msg">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        const msgEl = document.getElementById('bcs-global-loader-msg');
        if (msgEl) msgEl.textContent = message;
    }
    void overlay.offsetWidth;
    overlay.classList.add('active');
};

window.hideBcsLoader = function() {
    const overlay = document.getElementById('bcs-global-loader-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
};
