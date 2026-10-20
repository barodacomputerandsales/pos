import { fetchAPI } from './api.js';

export async function loginUser(username, password, securityCode) {
    // 1. Generate local port identifier for session bonding
    const localPortNumber = Math.floor(Math.random() * (65535 - 1024 + 1) + 1024).toString();

    // 2. Send credentials along with portnumber for atomic single-shot bonding
    const loginData = await fetchAPI('auth/login', {
        method: 'POST',
        headers: { 'x-api-key': 'backend-bcs-pos' },
        body: JSON.stringify({ 
            action: 'login', 
            username, 
            password, 
            code: securityCode,
            portnumber: localPortNumber
        })
    });

    if (loginData.is_verified && loginData.session_id) {
        // Fallback: If port wasn't auto-bonded, execute secondary trust_port
        if (!loginData.port_trusted) {
            try {
                await fetchAPI('auth/login', {
                    method: 'POST',
                    headers: { 'x-api-key': 'backend-bcs-pos' },
                    body: JSON.stringify({
                        action: 'trust_port',
                        session_id: loginData.session_id,
                        portnumber: localPortNumber
                    })
                });
            } catch(e) {
                console.warn('Explicit port trust fallback notice:', e);
            }
        }

        // Save session details
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('loggedInUserId', loginData.id || '');
        localStorage.setItem('loggedInUserName', loginData.username || username);
        localStorage.setItem('userRole', loginData.role || 'employee');
        localStorage.setItem('userPermissions', JSON.stringify(loginData.permissions || []));
        localStorage.setItem('sessionId', loginData.session_id);
        localStorage.setItem('sessionPort', localPortNumber);
        return loginData;
    }
    
    throw new Error(loginData.error || "Login failed");
}

export function logoutUser() {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('loggedInUserId');
    localStorage.removeItem('loggedInUserName');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userPermissions');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('sessionPort');
    window.location.href = 'index.html';
}

window.logoutUser = logoutUser;
