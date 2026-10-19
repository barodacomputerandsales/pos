window._renderSidebarImpl = function(activeMenu, activeSubMenu = null) {
    const isProductionActive = activeMenu === 'production' || (activeMenu === 'products' && (activeSubMenu === 'add-production' || activeSubMenu === 'production-history' || activeSubMenu === 'add-production-product'));
    const isProductsActive = (activeMenu === 'products' && !isProductionActive);

    const SIDEBAR_HTML = `
    <aside class="sidebar">
        <div class="sidebar-header">
            <h5 class="mb-0 fw-bold text-white d-flex align-items-center gap-2" style="font-family: var(--bs-body-font-family); letter-spacing: 1px;">
                <img src="assets/icon.png" onerror="this.src='template/bcs-logo.svg'" alt="BCS" style="width: 42px; height: 42px; border-radius: 10px; object-fit: contain; filter: drop-shadow(0 0 12px rgba(0, 229, 255, 0.45));"> BCS POS
            </h5>
        </div>
        <div class="sidebar-user">
            <div class="user-avatar">
                <i class="bi bi-person-fill"></i>
            </div>
            <div class="user-info">
                <div class="user-name" id="sidebarUserName">Admin</div>
                <div class="user-role" id="sidebarUserRole">Administrator</div>
            </div>
        </div>
        <nav class="sidebar-menu">
            <div class="menu-label">MAIN MENU</div>
            
            <a href="dashboard.html" class="menu-item ${activeMenu === 'dashboard' ? 'active' : ''}">
                <i class="bi bi-grid-1x2-fill"></i>
                <span>Dashboard</span>
            </a>

            <!-- Products Menu Group -->
            <div class="menu-group ${isProductsActive ? 'open' : ''}">
                <button class="menu-item has-submenu ${isProductsActive ? 'active' : ''}">
                    <i class="bi bi-box-seam-fill"></i>
                    <span>Products</span>
                    <i class="bi bi-chevron-down chevron"></i>
                </button>
                <div class="submenu">
                    <div class="submenu-inner">
                        <a href="all-product.html" class="submenu-item ${activeSubMenu === 'all-product' ? 'active' : ''}" data-permission="view_products">
                            <div class="submenu-dot"></div> All Products
                        </a>
                        <a href="add-product.html" class="submenu-item ${activeSubMenu === 'add-product' ? 'active' : ''}" data-permission="add_product">
                            <div class="submenu-dot"></div> Add Product
                        </a>
                    </div>
                </div>
            </div>

            <!-- Purchase Menu Group -->
            <div class="menu-group ${activeMenu === 'purchase' ? 'open' : ''}">
                <button class="menu-item has-submenu ${activeMenu === 'purchase' ? 'active' : ''}">
                    <i class="bi bi-bag-check-fill"></i>
                    <span>Purchase</span>
                    <i class="bi bi-chevron-down chevron"></i>
                </button>
                <div class="submenu">
                    <div class="submenu-inner">
                        <a href="add-purchase.html" class="submenu-item ${activeSubMenu === 'add-purchase' ? 'active' : ''}" data-permission="add_purchase">
                            <div class="submenu-dot"></div> Add Purchase
                        </a>
                        <a href="purchase-history.html" class="submenu-item ${activeSubMenu === 'purchase-history' ? 'active' : ''}" data-permission="view_purchases">
                            <div class="submenu-dot"></div> Purchase History
                        </a>
                    </div>
                </div>
            </div>

            <!-- Production Menu Group -->
            <div class="menu-group ${isProductionActive ? 'open' : ''}">
                <button class="menu-item has-submenu ${isProductionActive ? 'active' : ''}">
                    <i class="bi bi-gear-wide-connected"></i>
                    <span>Production</span>
                    <i class="bi bi-chevron-down chevron"></i>
                </button>
                <div class="submenu">
                    <div class="submenu-inner">
                        <a href="add-production.html" class="submenu-item ${activeSubMenu === 'add-production' ? 'active' : ''}" data-permission="add_production">
                            <div class="submenu-dot"></div> Add Production
                        </a>
                        <a href="production-history.html" class="submenu-item ${activeSubMenu === 'production-history' ? 'active' : ''}" data-permission="view_production">
                            <div class="submenu-dot"></div> Production History
                        </a>
                        <a href="add-production-product.html" class="submenu-item ${activeSubMenu === 'add-production-product' ? 'active' : ''}" data-permission="add_production_item">
                            <div class="submenu-dot"></div> Add Production Item
                        </a>
                    </div>
                </div>
            </div>
            
            <div class="menu-label mt-4">MANAGEMENT</div>
            <a href="settings.html" class="menu-item ${activeMenu === 'settings' ? 'active' : ''}" data-permission="manage_settings">
                <i class="bi bi-gear-fill"></i>
                <span>Settings</span>
            </a>
        </nav>
        
        <div class="sidebar-footer">
            <button class="logout-btn" onclick="logout()">
                <i class="bi bi-box-arrow-left"></i> Logout
            </button>
        </div>
    </aside>`;
    
    if (!document.querySelector('.sidebar')) {
        document.body.insertAdjacentHTML('afterbegin', SIDEBAR_HTML);
        
        // Auto-filter sidebar UI based on permissions (Admin sees everything)
        if (window.applyUIPermissions) {
            window.applyUIPermissions(document.querySelector('.sidebar'));
        }
        
        try {
            // Populate user details from localStorage
            let userName = localStorage.getItem('loggedInUserName');
            if (!userName || userName === 'null') userName = 'Admin';
            
            let userRole = localStorage.getItem('userRole');
            if (!userRole || userRole === 'null') userRole = 'administrator';
            
            const nameEl = document.getElementById('sidebarUserName');
            const roleEl = document.getElementById('sidebarUserRole');
            
            if (nameEl) nameEl.textContent = userName;
            if (roleEl) roleEl.textContent = String(userRole).charAt(0).toUpperCase() + String(userRole).slice(1);

            // Bind submenu toggle logic native to sidebar
            const submenuToggles = document.querySelectorAll('.has-submenu');
            submenuToggles.forEach(toggle => {
                toggle.addEventListener('click', function(e) {
                    e.preventDefault();
                    const group = this.closest('.menu-group');
                    if (group) group.classList.toggle('open');
                });
            });
            
            // Define global logout function if not exists
            if (!window.logout) {
                window.logout = function() {
                    localStorage.removeItem('isAuthenticated');
                    localStorage.removeItem('sessionId');
                    localStorage.removeItem('sessionPort');
                    window.location.replace('index.html');
                };
            }
        } catch (err) {
            console.error('Sidebar initialization error:', err);
        }
    }
};




