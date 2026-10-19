/**
 * BCS Enterprise POS - Role-Based Access Control (RBAC) & Permissions Library
 * Handles client-side authorization, menu visibility, and element protection.
 * Admin users automatically bypass all permission checks.
 */

export function getCurrentUser() {
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

    return {
        id,
        username,
        role,
        permissions,
        isAdmin
    };
}

export function isAdmin() {
    return getCurrentUser().isAdmin;
}

export function getUserPermissions() {
    return getCurrentUser().permissions;
}

/**
 * Checks whether the current user has the specified permission.
 * If user role is admin, returns true immediately (skips check).
 * @param {string} permission - The permission key to check
 * @returns {boolean}
 */
export function hasPermission(permission) {
    if (!permission) return true;
    const user = getCurrentUser();
    
    // Admin role automatically has all permissions without checking!
    if (user.isAdmin) return true;

    // Check employee permissions
    if (!Array.isArray(user.permissions)) return false;
    if (user.permissions.includes('*')) return true;

    const targetPerm = permission.toLowerCase().trim();

    // Direct match
    if (user.permissions.includes(targetPerm)) return true;

    // Table or management umbrella permissions
    // E.g., user having 'products' or 'manage_products' has 'view_products' and 'add_product'
    const parts = targetPerm.split('_');
    if (parts.length > 1) {
        const table = parts.slice(1).join('_');
        if (user.permissions.includes(table)) return true;
        if (user.permissions.includes(`manage_${table}`)) return true;
    }

    // Role-specific aliases
    if (targetPerm === 'pos_access' && user.permissions.includes('make_sales')) return true;
    if (targetPerm === 'make_sales' && user.permissions.includes('pos_access')) return true;

    return false;
}

/**
 * Checks if user has ANY of the provided permissions.
 * @param {string[]} permissions - Array of permission keys
 * @returns {boolean}
 */
export function hasAnyPermission(permissions = []) {
    if (isAdmin()) return true;
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return permissions.some(p => hasPermission(p));
}

/**
 * Checks if user has ALL of the provided permissions.
 * @param {string[]} permissions - Array of permission keys
 * @returns {boolean}
 */
export function hasAllPermissions(permissions = []) {
    if (isAdmin()) return true;
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return permissions.every(p => hasPermission(p));
}

/**
 * Automatically inspects the DOM for elements with `data-permission` or `data-perm`
 * and hides or disables unauthorized elements for non-admin employees.
 * Also automatically collapses and hides parent menu groups if all child items are unauthorized.
 * @param {HTMLElement|Document} root - DOM subtree to scan
 */
export function applyUIPermissions(root = document) {
    if (isAdmin()) return; // Admin sees everything!

    // 1. Check all elements with permission attributes
    const permElements = root.querySelectorAll('[data-permission], [data-perm]');
    permElements.forEach(el => {
        const requiredPerm = el.getAttribute('data-permission') || el.getAttribute('data-perm');
        const mode = el.getAttribute('data-permission-mode') || 'hide'; // 'hide' or 'disable'

        if (!hasPermission(requiredPerm)) {
            if (mode === 'disable') {
                el.disabled = true;
                el.classList.add('disabled');
                el.setAttribute('title', 'Permission required: ' + requiredPerm);
            } else {
                el.style.display = 'none';
            }
        }
    });

    // 2. Auto-hide menu groups if all inner submenu items are hidden
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

    // 3. Auto-hide section headers (e.g. Management) if all items under it are hidden
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
}

/**
 * Enforces route-level access protection. If non-admin user lacks permission,
 * redirects them to a safe fallback URL (e.g. dashboard.html).
 * @param {string} requiredPermission
 * @param {string} fallbackUrl
 */
export function protectRoute(requiredPermission, fallbackUrl = 'dashboard.html') {
    if (isAdmin()) return; // Admin bypass!
    if (!hasPermission(requiredPermission)) {
        alert("Access Denied: You do not have permission to view this section (" + requiredPermission + ").");
        window.location.replace(fallbackUrl);
    }
}

// Bind to window for easy access in non-module scripts and templates
if (typeof window !== 'undefined') {
    window.getCurrentUser = getCurrentUser;
    window.hasPermission = hasPermission;
    window.hasAnyPermission = hasAnyPermission;
    window.hasAllPermissions = hasAllPermissions;
    window.isAdmin = isAdmin;
    window.applyUIPermissions = applyUIPermissions;
    window.protectRoute = protectRoute;

    // Run automatically on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyUIPermissions());
    } else {
        applyUIPermissions();
    }
}
