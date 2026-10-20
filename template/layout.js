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

function loadGlobalUpdater() {
    loadCss('updater');
    loadScript('updater').catch(() => {});
}

function loadGlobalLoader() {
    if (!document.querySelector('script[src*="template/loader/loader-1.js"]')) {
        const script = document.createElement('script');
        script.src = 'template/loader/loader-1.js';
        document.head.appendChild(script);
    }
}

// Auto-inject global styling, icons, animation engine, holographic auto-updater, and neon laser loader
loadGlobalIcons();
loadGlobalAnimations();
loadGlobalUpdater();
loadGlobalLoader();

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
    if (window.applyUIPermissions) window.applyUIPermissions(document.querySelector('.sidebar') || document);
};

// ==========================================================================
// Role-Based Access Control (RBAC) & Permissions Engine
// Admin users automatically bypass all permission checks.
// ==========================================================================
window.getCurrentUser = function() {
    const role = (localStorage.getItem('userRole') || '').toLowerCase().trim();
    const id = localStorage.getItem('loggedInUserId') || '';
    const username = localStorage.getItem('loggedInUserName') || 'Admin';
    let permissions = [];

    try {
        const raw = localStorage.getItem('userPermissions');
        if (raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) permissions = parsed;
            else if (typeof parsed === 'string') permissions = [parsed];
        }
    } catch(e) {
        permissions = [];
    }

    const isAdmin = role === 'admin' || role === 'administrator' || role === 'superadmin';

    return { id, username, role, permissions, isAdmin };
};

window.isAdmin = function() {
    return window.getCurrentUser().isAdmin;
};

window.getUserPermissions = function() {
    return window.getCurrentUser().permissions;
};

window.hasPermission = function(permission) {
    if (!permission) return true;
    const user = window.getCurrentUser();
    
    // Admin role automatically has all permissions without checking!
    if (user.isAdmin) return true;

    if (!Array.isArray(user.permissions)) return false;
    if (user.permissions.includes('*')) return true;

    const targetPerm = permission.toLowerCase().trim();
    if (user.permissions.includes(targetPerm)) return true;

    const parts = targetPerm.split('_');
    if (parts.length > 1) {
        const table = parts.slice(1).join('_');
        if (user.permissions.includes(table)) return true;
        if (user.permissions.includes(`manage_${table}`)) return true;
    }

    if (targetPerm === 'pos_access' && user.permissions.includes('make_sales')) return true;
    if (targetPerm === 'make_sales' && user.permissions.includes('pos_access')) return true;

    return false;
};

window.hasAnyPermission = function(permissions = []) {
    if (window.isAdmin()) return true;
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return permissions.some(p => window.hasPermission(p));
};

window.hasAllPermissions = function(permissions = []) {
    if (window.isAdmin()) return true;
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return permissions.every(p => window.hasPermission(p));
};

window.applyUIPermissions = function(root = document) {
    if (window.isAdmin()) return; // Admin sees everything!

    const permElements = root.querySelectorAll('[data-permission], [data-perm]');
    permElements.forEach(el => {
        const requiredPerm = el.getAttribute('data-permission') || el.getAttribute('data-perm');
        const mode = el.getAttribute('data-permission-mode') || 'hide';

        if (!window.hasPermission(requiredPerm)) {
            if (mode === 'disable') {
                el.disabled = true;
                el.classList.add('disabled');
                el.setAttribute('title', 'Permission required: ' + requiredPerm);
            } else {
                el.style.display = 'none';
            }
        }
    });

    const menuGroups = root.querySelectorAll('.menu-group');
    menuGroups.forEach(group => {
        const submenuItems = Array.from(group.querySelectorAll('.submenu-item'));
        if (submenuItems.length > 0) {
            const allHidden = submenuItems.every(item => item.style.display === 'none' || item.classList.contains('d-none'));
            if (allHidden) {
                group.style.display = 'none';
            }
        }
    });

    const mgmtLabels = root.querySelectorAll('.menu-label');
    mgmtLabels.forEach(label => {
        let sibling = label.nextElementSibling;
        let hasVisibleItem = false;
        while (sibling && !sibling.classList.contains('menu-label')) {
            if (sibling.style.display !== 'none' && !sibling.classList.contains('d-none')) {
                hasVisibleItem = true;
                break;
            }
            sibling = sibling.nextElementSibling;
        }
        if (!hasVisibleItem) {
            label.style.display = 'none';
        }
    });
};

window.protectRoute = function(requiredPermission, fallbackUrl = 'dashboard.html') {
    if (window.isAdmin()) return; // Admin bypass!
    if (!window.hasPermission(requiredPermission)) {
        alert("Access Denied: You do not have permission to view this section (" + requiredPermission + ").");
        window.location.replace(fallbackUrl);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.applyUIPermissions();
});

// ==========================================================================
// ==========================================================================
// Global BCS Custom Animated Logo Loader Component (Portable Neon Laser Engine)
// ==========================================================================
window.showBcsLoader = function(message = 'Processing...') {
    if (window.BCSLoader) {
        window.BCSLoader.show(message);
    }
};

window.hideBcsLoader = function() {
    if (window.BCSLoader) {
        window.BCSLoader.hide();
    }
};

window.showLoader = window.showBcsLoader;
window.hideLoader = window.hideBcsLoader;
