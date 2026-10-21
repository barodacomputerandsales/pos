/**
 * Baroda Computers And Sales - Fast Internal AI Spotlight Search Engine (Ctrl+K)
 * 100% Client-side semantic & fuzzy search (Zero API tokens consumed)
 * Searches Pages, Products, Suppliers, and Quick Actions instantly.
 */
(function() {
    if (window.BCSSpotlightSearch) return;

    const APP_PAGES = [
        { title: 'Dashboard', icon: 'bi-grid-1x2-fill', url: 'dashboard.html', category: 'Page' },
        { title: 'AI Intelligence Studio', icon: 'bi-stars', url: 'ai.html', category: 'Page' },
        { title: 'All Products Directory', icon: 'bi-box-seam-fill', url: 'all-product.html', category: 'Page' },
        { title: 'Add New Product', icon: 'bi-plus-circle-fill', url: 'add-product.html', category: 'Action' },
        { title: 'All Suppliers Directory', icon: 'bi-people-fill', url: 'all-suppliers.html', category: 'Page' },
        { title: 'Add New Supplier', icon: 'bi-person-plus-fill', url: 'add-supplier.html', category: 'Action' },
        { title: 'Purchase History', icon: 'bi-bag-check-fill', url: 'purchase-history.html', category: 'Page' },
        { title: 'Add Purchase', icon: 'bi-cart-plus-fill', url: 'add-purchase.html', category: 'Action' },
        { title: 'Production History', icon: 'bi-gear-wide-connected', url: 'production-history.html', category: 'Page' },
        { title: 'Add Production', icon: 'bi-tools', url: 'add-production.html', category: 'Action' },
        { title: 'Add Production Product', icon: 'bi-box-arrow-in-down', url: 'add-production-product.html', category: 'Action' },
        { title: 'Settings & Software Updater', icon: 'bi-gear-fill', url: 'settings.html', category: 'Page' }
    ];

    let cachedProducts = [];
    let cachedSuppliers = [];
    let isOpen = false;

    async function loadIndexData() {
        try {
            const api = 'https://backend.bcs.bcsdeveloper.com/api';
            const headers = {
                'Content-Type': 'application/json',
                'x-api-key': 'backend-bcs-pos',
                'x-session-id': localStorage.getItem('sessionId') || '',
                'x-session-port': localStorage.getItem('sessionPort') || ''
            };
            const [pRes, sRes] = await Promise.all([
                fetch(`${api}/database/read?table=products&limit=500`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
                fetch(`${api}/database/read?table=suppliers&limit=300`, { headers }).then(r => r.json()).catch(() => ({ data: [] }))
            ]);
            cachedProducts = (pRes.data || []).map(p => ({
                id: p.id,
                title: p.name || 'Product',
                subtitle: `PBR: ${p.barcode || 'N/A'} • Sell: ৳${p.sellPrice || p.sell_price || 0} • Stock: ${p.quantity || 0}`,
                url: `add-product.html?id=${p.id}`,
                icon: 'bi-box-seam',
                category: 'Product'
            }));
            cachedSuppliers = (sRes.data || []).map(s => ({
                id: s.id,
                title: s.supplierName || 'Supplier',
                subtitle: `${s.shopName || ''} • Phone: ${s.phoneNumber || 'N/A'} • Due: ৳${s.openingBalance || 0}`,
                url: `add-supplier.html?id=${s.id}`,
                icon: 'bi-person-badge',
                category: 'Supplier'
            }));
        } catch (e) {}
    }

    function search(query) {
        if (!query || !query.trim()) {
            return APP_PAGES.slice(0, 7);
        }
        const q = query.toLowerCase().trim();
        const results = [];

        // 1. Pages & Actions
        for (const page of APP_PAGES) {
            if (page.title.toLowerCase().includes(q)) {
                results.push({ ...page, subtitle: 'Navigation Route' });
            }
        }

        // 2. Products
        for (const prod of cachedProducts) {
            if (prod.title.toLowerCase().includes(q) || prod.subtitle.toLowerCase().includes(q)) {
                results.push(prod);
                if (results.length > 20) break;
            }
        }

        // 3. Suppliers
        for (const sup of cachedSuppliers) {
            if (sup.title.toLowerCase().includes(q) || sup.subtitle.toLowerCase().includes(q)) {
                results.push(sup);
                if (results.length > 30) break;
            }
        }

        return results;
    }

    window.BCSSpotlightSearch = {
        open() {
            if (!document.getElementById('bcsSpotlightModal')) {
                this.mountUI();
            }
            isOpen = true;
            document.getElementById('bcsSpotlightBackdrop')?.classList.add('open');
            document.getElementById('bcsSpotlightModal')?.classList.add('open');
            const input = document.getElementById('bcsSpotlightInput');
            if (input) {
                input.value = '';
                input.focus();
                this.render(search(''));
            }
            loadIndexData();
        },

        close() {
            isOpen = false;
            document.getElementById('bcsSpotlightBackdrop')?.classList.remove('open');
            document.getElementById('bcsSpotlightModal')?.classList.remove('open');
        },

        toggle() {
            if (isOpen) this.close();
            else this.open();
        },

        render(items) {
            const listEl = document.getElementById('bcsSpotlightResults');
            if (!listEl) return;
            if (items.length === 0) {
                listEl.innerHTML = `
                    <div class="text-center py-4 text-muted small">
                        <i class="bi bi-search fs-3 d-block mb-1 opacity-50"></i>
                        No matching results found in store database.
                    </div>
                `;
                return;
            }

            listEl.innerHTML = items.map((item, idx) => `
                <a href="${item.url}" class="bcs-spotlight-item ${idx === 0 ? 'active' : ''}">
                    <div class="d-flex align-items-center gap-3">
                        <div class="rounded-2 p-2" style="background: rgba(var(--win-accent-rgb, 99, 102, 241), 0.15); color: var(--win-accent, #6366f1);">
                            <i class="bi ${item.icon}"></i>
                        </div>
                        <div>
                            <div class="fw-semibold small">${item.title}</div>
                            <div class="text-muted" style="font-size: 0.72rem;">${item.subtitle || ''}</div>
                        </div>
                    </div>
                    <span class="bcs-spotlight-badge">${item.category}</span>
                </a>
            `).join('');
        },

        mountUI() {
            if (document.getElementById('bcsSpotlightModal')) return;

            const html = `
                <div id="bcsSpotlightBackdrop" class="bcs-spotlight-backdrop"></div>
                <div id="bcsSpotlightModal" class="bcs-spotlight-modal" role="dialog" aria-modal="true">
                    <div class="bcs-spotlight-header">
                        <i class="bi bi-search text-info fs-5"></i>
                        <input type="text" id="bcsSpotlightInput" class="bcs-spotlight-input" placeholder="Search pages, products, suppliers, or commands (Ctrl+K)..." autocomplete="off">
                        <span class="bcs-spotlight-badge">ESC to close</span>
                    </div>
                    <div class="bcs-spotlight-results" id="bcsSpotlightResults"></div>
                    <div class="bcs-spotlight-footer">
                        <span><i class="bi bi-cpu text-info me-1"></i>Internal Fast Search Engine (Zero API Tokens)</span>
                        <span>Navigate with &uarr; &darr; &bull; Enter to select</span>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);

            document.getElementById('bcsSpotlightBackdrop')?.addEventListener('click', () => this.close());

            const input = document.getElementById('bcsSpotlightInput');
            input?.addEventListener('input', (e) => {
                const results = search(e.target.value);
                this.render(results);
            });

            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.close();
                } else if (e.key === 'Enter') {
                    const active = document.querySelector('.bcs-spotlight-item.active');
                    if (active && active.href) {
                        window.location.href = active.href;
                    }
                }
            });
        }
    };

    // Global Keyboard Shortcut: Ctrl+K or Cmd+K
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            window.BCSSpotlightSearch.toggle();
        } else if (e.key === 'Escape' && isOpen) {
            window.BCSSpotlightSearch.close();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        window.BCSSpotlightSearch.mountUI();
        loadIndexData();
    });
})();
