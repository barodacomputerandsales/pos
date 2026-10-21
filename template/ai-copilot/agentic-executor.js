/**
 * Baroda Computers And Sales - Agentic Action Dispatcher
 * Executes database operations initiated by BCS Groq AI Copilot
 * (Add Product, Update Product, Add Supplier, Update Supplier, Restock)
 */
(function() {
    if (window.BCSAgenticExecutor) return;

    const API_BASE_URL = 'https://backend.bcs.bcsdeveloper.com/api';

    async function apiRequest(endpoint, method = 'GET', body = null) {
        const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;
        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': 'backend-bcs-pos',
            'x-session-id': localStorage.getItem('sessionId') || '',
            'x-session-port': localStorage.getItem('sessionPort') || ''
        };
        const res = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}: Action Failed`);
        }
        return await res.json();
    }

    function generateRandomBarcode() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    function generateSupplierCode() {
        return `SUP-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    window.BCSAgenticExecutor = {
        parseActionsFromText(text) {
            if (!text || typeof text !== 'string') return [];
            const actionRegex = /<<<ACTION\s*([\s\S]*?)\s*ACTION>>>/gi;
            const actions = [];
            let match;
            while ((match = actionRegex.exec(text)) !== null) {
                try {
                    const rawJson = match[1].trim();
                    const parsed = JSON.parse(rawJson);
                    if (parsed && parsed.action) {
                        actions.push({
                            ...parsed,
                            rawTag: match[0]
                        });
                    }
                } catch (e) {
                    console.warn('[BCS Agentic] Failed to parse action block JSON:', e);
                }
            }
            return actions;
        },

        cleanTextResponse(text) {
            if (!text || typeof text !== 'string') return '';
            return text.replace(/<<<ACTION\s*[\s\S]*?\s*ACTION>>>/gi, '').trim();
        },

        async executeAction(actionObj) {
            const { action, data = {}, summary = '' } = actionObj;

            if (action === 'add_product') {
                return await this.addProduct(data);
            } else if (action === 'update_product') {
                return await this.updateProduct(actionObj.search || data.search || data.name || data.id, data.updates || data);
            } else if (action === 'add_supplier') {
                return await this.addSupplier(data);
            } else if (action === 'update_supplier') {
                return await this.updateSupplier(actionObj.search || data.search || data.supplierName || data.id, data.updates || data);
            } else {
                throw new Error(`Unsupported agentic action type: ${action}`);
            }
        },

        async addProduct(productData) {
            const name = String(productData.name || '').trim();
            if (!name) throw new Error('Product name is required to add product.');

            const buyPrice = Number(productData.buyPrice || productData.buy_price || 0);
            const sellPrice = Number(productData.sellPrice || productData.sell_price || Math.round(buyPrice * 1.25));
            const wholesalePrice = Number(productData.wholesalePrice || productData.wholesale_price || Math.round(buyPrice * 1.12));
            const barcode = productData.barcode || productData.sku || generateRandomBarcode();
            const unit = productData.unit || 'Pcs';
            const category = productData.category || 'Office Item';
            const brand = productData.brand || '';
            const quantity = Number(productData.quantity || productData.stock || 0);
            const description = productData.description || `Registered by BCS Agentic AI Copilot.`;

            const payload = {
                name,
                category,
                brand,
                unit,
                barcode,
                sku: barcode,
                barcodeType: 'Code 128',
                buyPrice,
                sellPrice,
                wholesalePrice,
                wholesalePriceNormal: wholesalePrice,
                wholesalePriceShop: Math.round(buyPrice * 1.08),
                sellPriceNormal: sellPrice,
                sellPriceShop: Math.round(buyPrice * 1.18),
                quantity,
                alertQuantity: Number(productData.alertQuantity || 5),
                description,
                createdAt: new Date().toISOString()
            };

            const res = await apiRequest('database/add?table=products', 'POST', payload);
            try {
                if (window.indexedDB) window.indexedDB.deleteDatabase('bcs_api_cache');
            } catch (e) {}

            return {
                success: true,
                type: 'add_product',
                name: payload.name,
                barcode: payload.barcode,
                sellPrice: payload.sellPrice,
                quantity: payload.quantity,
                message: `Successfully created product "${name}" (PBR: ${barcode}, Buy: ৳${buyPrice}, Sell: ৳${sellPrice}, Stock: ${quantity}).`
            };
        },

        async updateProduct(searchQuery, updates = {}) {
            if (!searchQuery) throw new Error('Product name, barcode, or ID is required to update.');

            const listRes = await apiRequest('database/read?table=products&limit=2000');
            const products = listRes.data || [];
            const cleanQuery = String(searchQuery).toLowerCase().trim();

            const target = products.find(p => 
                String(p.id) === cleanQuery ||
                String(p.barcode || '').toLowerCase() === cleanQuery ||
                String(p.sku || '').toLowerCase() === cleanQuery ||
                String(p.name || '').toLowerCase() === cleanQuery ||
                String(p.name || '').toLowerCase().includes(cleanQuery)
            );

            if (!target) {
                throw new Error(`Could not find product matching "${searchQuery}" in store database.`);
            }

            const updatedFields = {};
            if (updates.name) updatedFields.name = updates.name;
            if (updates.category) updatedFields.category = updates.category;
            if (updates.brand) updatedFields.brand = updates.brand;
            if (updates.unit) updatedFields.unit = updates.unit;
            if (updates.buyPrice !== undefined || updates.buy_price !== undefined) {
                updatedFields.buyPrice = Number(updates.buyPrice || updates.buy_price);
            }
            if (updates.sellPrice !== undefined || updates.sell_price !== undefined) {
                updatedFields.sellPrice = Number(updates.sellPrice || updates.sell_price);
                updatedFields.sellPriceNormal = updatedFields.sellPrice;
            }
            if (updates.wholesalePrice !== undefined || updates.wholesale_price !== undefined) {
                updatedFields.wholesalePrice = Number(updates.wholesalePrice || updates.wholesale_price);
                updatedFields.wholesalePriceNormal = updatedFields.wholesalePrice;
            }
            if (updates.quantity !== undefined || updates.stock !== undefined) {
                updatedFields.quantity = Number(updates.quantity !== undefined ? updates.quantity : updates.stock);
            }
            if (updates.addStock !== undefined) {
                updatedFields.quantity = Number(target.quantity || 0) + Number(updates.addStock);
            }
            if (updates.description) updatedFields.description = updates.description;
            updatedFields.updatedAt = new Date().toISOString();

            const res = await apiRequest(`database/update?table=products&id=${target.id}`, 'PUT', updatedFields);
            try {
                if (window.indexedDB) window.indexedDB.deleteDatabase('bcs_api_cache');
            } catch (e) {}

            return {
                success: true,
                type: 'update_product',
                name: target.name,
                productId: target.id,
                updatedFields,
                message: `Successfully updated product "${target.name}". ${Object.keys(updatedFields).map(k => `${k}: ${updatedFields[k]}`).join(', ')}`
            };
        },

        async addSupplier(supplierData) {
            const supplierName = String(supplierData.supplierName || supplierData.name || '').trim();
            if (!supplierName) throw new Error('Supplier name is required.');

            const phoneNumber = String(supplierData.phoneNumber || supplierData.phone || supplierData.mobile || '').trim();
            const shopName = String(supplierData.shopName || supplierData.company || supplierName).trim();
            const location = String(supplierData.location || supplierData.address || 'Local Market').trim();
            const openingBalance = Number(supplierData.openingBalance || supplierData.due || 0);
            const status = supplierData.status || 'Active';
            const supplierCode = supplierData.supplierCode || generateSupplierCode();

            const payload = {
                supplierName,
                supplierCode,
                phoneNumber,
                shopName,
                shopMobileNumber: phoneNumber,
                location,
                openingBalance,
                status,
                createdAt: new Date().toISOString()
            };

            const res = await apiRequest('database/add?table=suppliers', 'POST', payload);
            try {
                if (window.indexedDB) window.indexedDB.deleteDatabase('bcs_api_cache');
            } catch (e) {}

            return {
                success: true,
                type: 'add_supplier',
                supplierName: payload.supplierName,
                supplierCode: payload.supplierCode,
                shopName: payload.shopName,
                phoneNumber: payload.phoneNumber,
                message: `Successfully added supplier "${supplierName}" (${payload.shopName}, Phone: ${phoneNumber || 'N/A'}, Code: ${supplierCode}).`
            };
        },

        async updateSupplier(searchQuery, updates = {}) {
            if (!searchQuery) throw new Error('Supplier name, code, or ID is required to update.');

            const listRes = await apiRequest('database/read?table=suppliers&limit=2000');
            const suppliers = listRes.data || [];
            const cleanQuery = String(searchQuery).toLowerCase().trim();

            const target = suppliers.find(s => 
                String(s.id) === cleanQuery ||
                String(s.supplierCode || '').toLowerCase() === cleanQuery ||
                String(s.phoneNumber || '').toLowerCase() === cleanQuery ||
                String(s.supplierName || '').toLowerCase() === cleanQuery ||
                String(s.supplierName || '').toLowerCase().includes(cleanQuery) ||
                String(s.shopName || '').toLowerCase().includes(cleanQuery)
            );

            if (!target) {
                throw new Error(`Could not find supplier matching "${searchQuery}" in store database.`);
            }

            const updatedFields = {};
            if (updates.supplierName || updates.name) updatedFields.supplierName = updates.supplierName || updates.name;
            if (updates.shopName || updates.company) updatedFields.shopName = updates.shopName || updates.company;
            if (updates.phoneNumber || updates.phone) {
                updatedFields.phoneNumber = updates.phoneNumber || updates.phone;
                updatedFields.shopMobileNumber = updatedFields.phoneNumber;
            }
            if (updates.location || updates.address) updatedFields.location = updates.location || updates.address;
            if (updates.openingBalance !== undefined) updatedFields.openingBalance = Number(updates.openingBalance);
            if (updates.status) updatedFields.status = updates.status;
            updatedFields.updatedAt = new Date().toISOString();

            const res = await apiRequest(`database/update?table=suppliers&id=${target.id}`, 'PUT', updatedFields);
            try {
                if (window.indexedDB) window.indexedDB.deleteDatabase('bcs_api_cache');
            } catch (e) {}

            return {
                success: true,
                type: 'update_supplier',
                supplierName: target.supplierName,
                supplierId: target.id,
                updatedFields,
                message: `Successfully updated supplier "${target.supplierName}".`
            };
        }
    };
})();
