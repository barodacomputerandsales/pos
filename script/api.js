const API_BASE_URL = 'https://backend.bcs.bcsdeveloper.com/api';

const DB_NAME = 'bcs_api_cache';
const STORE_NAME = 'collections';

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
                e.target.result.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getCache(key) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    } catch(e) { return null; }
}

async function setCache(key, data) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(data, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch(e) {}
}

async function deleteCache(key) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch(e) {}
}

export async function fetchAPI(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;
    
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': 'backend-bcs-pos',
        'x-session-id': localStorage.getItem('sessionId') || '',
        'x-session-port': localStorage.getItem('sessionPort') || '',
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
        const isAuthRequest = endpoint.includes('auth/');
        const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';

        if (!isAuthRequest && !isLoginPage) {
            localStorage.removeItem('isAuthenticated');
            localStorage.removeItem('loggedInUserId');
            localStorage.removeItem('userRole');
            localStorage.removeItem('sessionId');
            localStorage.removeItem('sessionPort');
            window.location.replace('index.html');
            throw new Error("Session expired. Please log in again.");
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Authentication failed");
    }

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

let activeFetches = {};

export async function getCollection(collectionName, forceRefresh = false) {
    const cached = await getCache(collectionName);
    
    // If we have a cache and not forcing refresh, return it immediately!
    // But if it's older than 5 minutes, fetch in background.
    if (cached && !forceRefresh) {
        const isStale = (Date.now() - cached.timestamp) > (1000 * 60 * 5); // 5 minutes
        
        if (isStale && !activeFetches[collectionName]) {
            // Background fetch to silently update cache for next time
            activeFetches[collectionName] = fetchAPI(`database/read?table=${collectionName}`)
                .then(data => {
                    if (data && data.success && data.data) {
                        setCache(collectionName, { timestamp: Date.now(), data: data.data });
                    }
                }).catch(e => console.warn("Background sync failed:", e))
                .finally(() => { delete activeFetches[collectionName]; });
        }
        
        return {
            docs: (cached.data || []).map(item => ({
                id: item.id || item.firestoreId,
                data: () => item
            }))
        };
    }

    // No cache (or forced refresh), must await network
    const data = await fetchAPI(`database/read?table=${collectionName}`);
    if (data && data.success && data.data) {
        await setCache(collectionName, { timestamp: Date.now(), data: data.data });
        return {
            docs: data.data.map(item => ({
                id: item.id || item.firestoreId,
                data: () => item
            }))
        };
    }
    return { docs: [] };
}

export async function getDocument(collectionName, id) {
    const coll = await getCollection(collectionName);
    const doc = coll.docs.find(d => d.id === id);
    if (doc) return { exists: () => true, data: () => doc.data(), id: doc.id };
    return { exists: () => false };
}

export async function addDocument(collectionName, data) {
    const endpoint = `database/add?table=${collectionName}`;
    const result = await fetchAPI(endpoint, {
        method: 'POST',
        body: JSON.stringify(data)
    });
    // Invalidate cache so next getCollection instantly fetches fresh data
    await deleteCache(collectionName);
    return result;
}

export async function updateDocument(collectionName, id, data) {
    const result = await fetchAPI(`database/update?table=${collectionName}&id=${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
    await deleteCache(collectionName);
    return result;
}

export async function deleteDocument(collectionName, id) {
    const result = await fetchAPI(`database/delete?table=${collectionName}&id=${id}`, {
        method: 'DELETE'
    });
    await deleteCache(collectionName);
    return result;
}
