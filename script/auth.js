import { fetchAPI } from './api.js';

export async function loginUser(username, password, securityCode) {
    // 1. Send raw credentials to the backend for ultra-fast verification
    const loginData = await fetchAPI('auth/login', {
        method: 'POST',
        headers: { 'x-api-key': 'backend-bcs-pos' }, // Initial handshake still needs API key
        body: JSON.stringify({ 
            action: 'login', 
            username, 
            password, 
            code: securityCode 
        })
    });

    if (loginData.is_verified && loginData.session_id) {
        // 2. Generate a random "port number" (identifier)
        const localPortNumber = Math.floor(Math.random() * (65535 - 1024 + 1) + 1024).toString();

        // 3. Register this port number with the session ID to the backend
        const trustRes = await fetchAPI('auth/login', {
            method: 'POST',
            headers: { 'x-api-key': 'backend-bcs-pos' },
            body: JSON.stringify({
                action: 'trust_port',
                session_id: loginData.session_id,
                portnumber: localPortNumber
            })
        });

        if (trustRes.success) {
            // Save the session details
            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('loggedInUserId', loginData.id);
            localStorage.setItem('userRole', loginData.role);
            localStorage.setItem('sessionId', loginData.session_id);
            localStorage.setItem('sessionPort', localPortNumber);
            return loginData;
        }
    }
    
    throw new Error(loginData.error || "Login failed");
}

export function logoutUser() {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('loggedInUserId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('sessionPort');
    window.location.href = 'index.html';
}

window.logoutUser = logoutUser;
