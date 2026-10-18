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
