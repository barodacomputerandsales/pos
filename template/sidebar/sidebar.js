window._renderSidebarImpl = function(activeMenu, activeSubMenu = null) {
    const SIDEBAR_HTML = `
    <aside class="sidebar">
        <div class="sidebar-header">
            <h5 class="mb-0 fw-bold text-white d-flex align-items-center gap-2" style="font-family: var(--bs-body-font-family); letter-spacing: 1px;">
                <div class="logo-orb"></div> BCS POS
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
            
            <div class="menu-group ${activeMenu === 'products' ? 'open' : ''}">
                <button class="menu-item has-submenu ${activeMenu === 'products' ? 'active' : ''}">
                    <i class="bi bi-box-seam-fill"></i>
                    <span>Products</span>
                    <i class="bi bi-chevron-down chevron"></i>
                </button>
                <div class="submenu">
                    <div class="submenu-inner">
                        <a href="all-product.html" class="submenu-item ${activeSubMenu === 'all-product' ? 'active' : ''}">
                            <div class="submenu-dot"></div> All Products
                        </a>
                                                <a href="add-production.html" class="submenu-item ${activeSubMenu === 'add-production' ? 'active' : ''}">
                            <div class="submenu-dot"></div> Add Production
                        </a>
                        <a href="production-history.html" class="submenu-item ${activeSubMenu === 'production-history' ? 'active' : ''}">
                            <div class="submenu-dot"></div> Production History
                        </a>
                        <a href="add-production-product.html" class="submenu-item ${activeSubMenu === 'add-production-product' ? 'active' : ''}">
                            <div class="submenu-dot"></div> Add Production Product
                        </a>
                        <a href="add-product.html" class="submenu-item ${activeSubMenu === 'add-product' ? 'active' : ''}">
                            <div class="submenu-dot"></div> Add Product
                        </a>
                    </div>
                </div>
            </div>

            <a href="pos.html" class="menu-item ${activeMenu === 'pos' ? 'active' : ''}">
                <i class="bi bi-calculator-fill"></i>
                <span>POS System</span>
            </a>
            
            <div class="menu-label mt-4">MANAGEMENT</div>
            <a href="customers.html" class="menu-item ${activeMenu === 'customers' ? 'active' : ''}">
                <i class="bi bi-people-fill"></i>
                <span>Customers</span>
            </a>
            <a href="settings.html" class="menu-item ${activeMenu === 'settings' ? 'active' : ''}">
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




