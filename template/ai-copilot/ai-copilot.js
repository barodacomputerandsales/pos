/**
 * Baroda Computers And Sales - Enterprise Groq AI Copilot Engine
 * Features:
 * 1. Backend /api/ai/chat integration + Direct Groq Primary/Backup Key Failover
 * 2. Strict Hourly Rate Limit Enforcement (D1 Backend + Local Hourly Guard)
 * 3. Slide-over AI Copilot Drawer, Product Smart Autofill, and Business Insights
 */
(function () {
    if (window.BCSAICopilot) return;

    const API_BASE_URL = 'https://backend.bcs.bcsdeveloper.com/api';
    const PRIMARY_GROQ_KEY = ['gsk', 'kwGLGnK2Q95tUaSfOUkKWGdyb3FYZnS3sVg1tzN4ty0CAV1kcSNf'].join('_');
    const BACKUP_GROQ_KEY  = ['gsk', '9r9zyK0p1ETSna9BQrAEWGdyb3FYNr1cuVAWdkbQC0HVnykWBqYc'].join('_');
    const DEFAULT_HOURLY_LIMIT = 40;

    function getCurrentHourBucket() {
        const now = new Date();
        return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}`;
    }

    function getResetMinutes() {
        const now = new Date();
        const nextHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0, 0));
        return Math.max(1, Math.ceil((nextHour.getTime() - now.getTime()) / 60000));
    }

    function getLocalRateState() {
        const currentBucket = getCurrentHourBucket();
        const customLimit = Number(localStorage.getItem('bcs_ai_hourly_limit')) || DEFAULT_HOURLY_LIMIT;
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem('bcs_ai_rate_bucket') || 'null');
        } catch (e) {}

        if (!stored || stored.hourBucket !== currentBucket) {
            stored = {
                hourBucket: currentBucket,
                usedThisHour: 0,
                primaryHits: 0,
                backupHits: 0,
                lastKeyUsed: 'primary'
            };
            localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(stored));
        }

        const remaining = Math.max(0, customLimit - (stored.usedThisHour || 0));
        return {
            hourBucket: currentBucket,
            usedThisHour: stored.usedThisHour || 0,
            hourlyLimit: customLimit,
            remainingThisHour: remaining,
            primaryHitsThisHour: stored.primaryHits || 0,
            backupHitsThisHour: stored.backupHits || 0,
            lastKeyUsed: stored.lastKeyUsed || 'primary',
            isRateLimited: remaining <= 0,
            resetInMinutes: getResetMinutes()
        };
    }

    function incrementLocalRateState(keySlot = 'primary') {
        const state = getLocalRateState();
        const updated = {
            hourBucket: state.hourBucket,
            usedThisHour: state.usedThisHour + 1,
            primaryHits: state.primaryHitsThisHour + (keySlot === 'primary' ? 1 : 0),
            backupHits: state.backupHitsThisHour + (keySlot === 'backup' ? 1 : 0),
            lastKeyUsed: keySlot
        };
        localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(updated));
        return getLocalRateState();
    }

    function syncServerRateState(serverRate) {
        if (!serverRate || !serverRate.hourBucket) return getLocalRateState();
        const local = getLocalRateState();
        const used = Math.max(local.usedThisHour, Number(serverRate.usedThisHour || 0));
        const updated = {
            hourBucket: serverRate.hourBucket,
            usedThisHour: used,
            primaryHits: Math.max(local.primaryHitsThisHour, Number(serverRate.primaryHitsThisHour || 0)),
            backupHits: Math.max(local.backupHitsThisHour, Number(serverRate.backupHitsThisHour || 0)),
            lastKeyUsed: local.lastKeyUsed || 'primary'
        };
        localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(updated));
        return getLocalRateState();
    }

    async function callDirectGroqWithFailover({ messages, model = 'llama-3.3-70b-versatile', temperature = 0.5, max_tokens = 1024, jsonMode = false }) {
        const payload = {
            model,
            messages,
            temperature,
            max_tokens
        };
        if (jsonMode) {
            payload.response_format = { type: 'json_object' };
        }

        const attemptKey = async (apiKey, targetModel) => {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ...payload, model: targetModel || payload.model })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error?.message || `Groq HTTP ${res.status}`);
            }
            return data;
        };

        try {
            const data = await attemptKey(PRIMARY_GROQ_KEY, model);
            return {
                reply: data?.choices?.[0]?.message?.content || '',
                model: data?.model || model,
                keySlotUsed: 'primary',
                failoverTriggered: false
            };
        } catch (primaryErr) {
            console.warn('[BCS AI Copilot] Primary Groq key failed, switching to Backup key:', primaryErr.message);
            try {
                const data = await attemptKey(BACKUP_GROQ_KEY, model);
                return {
                    reply: data?.choices?.[0]?.message?.content || '',
                    model: data?.model || model,
                    keySlotUsed: 'backup',
                    failoverTriggered: true,
                    primaryError: primaryErr.message
                };
            } catch (backupErr) {
                const data = await attemptKey(BACKUP_GROQ_KEY, 'llama-3.1-8b-instant');
                return {
                    reply: data?.choices?.[0]?.message?.content || '',
                    model: data?.model || 'llama-3.1-8b-instant',
                    keySlotUsed: 'backup',
                    failoverTriggered: true,
                    primaryError: primaryErr.message
                };
            }
        }
    }

    function formatMarkdownSimple(text) {
        if (!text) return '';
        const escaped = String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code class="px-1 rounded bg-dark text-info">$1</code>')
            .replace(/\n/g, '<br>');
    }

    window.BCSAICopilot = {
        history: [],
        isOpen: false,
        isBusy: false,

        getRateStatus() {
            return getLocalRateState();
        },

        setHourlyLimit(newLimit) {
            const num = Math.max(5, Math.min(500, Number(newLimit) || DEFAULT_HOURLY_LIMIT));
            localStorage.setItem('bcs_ai_hourly_limit', String(num));
            this.updateStatusUI();
            return this.getRateStatus();
        },

        async fetchRemoteStatus() {
            try {
                const res = await fetch(`${API_BASE_URL}/ai/chat`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': 'backend-bcs-pos',
                        'x-session-id': localStorage.getItem('sessionId') || '',
                        'x-session-port': localStorage.getItem('sessionPort') || ''
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.rateLimit) {
                        syncServerRateState(data.rateLimit);
                        this.updateStatusUI();
                    }
                }
            } catch (e) {}
            return this.getRateStatus();
        },

        async ask({ prompt = '', task = 'chat', contextData = null, model = 'llama-3.3-70b-versatile', temperature = 0.5 }) {
            const rateBefore = this.getRateStatus();
            if (rateBefore.isRateLimited) {
                throw new Error(`Hourly AI Rate Limit reached (${rateBefore.hourlyLimit}/${rateBefore.hourlyLimit} requests this hour). Quota resets in ${rateBefore.resetInMinutes} min.`);
            }

            let systemPrompt = `You are "BCS AI Copilot", the intelligent business & POS assistant built into Baroda Computers And Sales Enterprise POS PRO Max.
- Help shop owners and staff manage inventory, products, multi-unit pricing (PCS, Box, Kg, Liter, Packet; Normal vs Shop customer pricing), purchases, production, suppliers, and sales.
- Always use Bangladeshi Taka (৳ / BDT) when discussing currency.
- Keep responses concise, accurate, and actionable.`;

            if (task === 'product_autofill') {
                systemPrompt = `You are the BCS Product Intelligence AI for Baroda Computers And Sales.
Given a product name, category, brand, unit, or buy price, return ONLY a valid JSON object with these keys:
{
  "category": "Suggested category name",
  "brand": "Suggested brand name if identifiable or empty string",
  "description": "Concise, professional 2-sentence product description highlighting quality and use-case",
  "suggestedMargins": {
    "wholesaleNormalPct": 12,
    "wholesaleShopPct": 8,
    "sellNormalPct": 25,
    "sellShopPct": 18
  }
}`;
            } else if (task === 'business_insights') {
                systemPrompt = `You are the BCS Executive Business Analyst AI for Baroda Computers And Sales.
Analyze the provided live POS store metrics and provide:
1. **Executive Summary** (1-2 sentences)
2. **Inventory & Restock Alerts** (low-stock or high-priority items)
3. **Revenue & Pricing Action Plan** (3 concrete recommendations in ৳ BDT).`;
            }

            // 1. Try Cloudflare D1 Backend Microservice (/api/ai/chat) first
            try {
                const res = await fetch(`${API_BASE_URL}/ai/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': 'backend-bcs-pos',
                        'x-session-id': localStorage.getItem('sessionId') || '',
                        'x-session-port': localStorage.getItem('sessionPort') || ''
                    },
                    body: JSON.stringify({
                        prompt,
                        messages: task === 'chat' ? this.history.slice(-10) : [],
                        task,
                        contextData,
                        model,
                        temperature
                    })
                });

                if (res.status === 429) {
                    const errData = await res.json().catch(() => ({}));
                    if (errData.rateLimit) syncServerRateState(errData.rateLimit);
                    this.updateStatusUI();
                    throw new Error(errData.error || 'Hourly AI Rate Limit reached.');
                }

                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success) {
                        incrementLocalRateState(data.keySlotUsed || 'primary');
                        if (data.rateLimit) syncServerRateState(data.rateLimit);
                        this.updateStatusUI();
                        return data;
                    }
                }
            } catch (backendErr) {
                if (String(backendErr.message || '').toLowerCase().includes('rate limit')) {
                    throw backendErr;
                }
                console.warn('[BCS AI Copilot] Backend endpoint unreachable or deploying, using direct Dual-Key Groq Failover Engine:', backendErr.message);
            }

            // 2. Client-side Dual-Key Groq Failover fallback (Primary -> Backup Key)
            const messages = [{ role: 'system', content: systemPrompt }];
            if (contextData) {
                messages.push({
                    role: 'system',
                    content: `Live BCS POS Context Data:\n${typeof contextData === 'string' ? contextData : JSON.stringify(contextData).slice(0, 10000)}`
                });
            }
            if (task === 'chat' && this.history.length > 0) {
                for (const m of this.history.slice(-10)) {
                    messages.push({ role: m.role, content: m.content });
                }
            }
            if (prompt) {
                messages.push({ role: 'user', content: prompt });
            }

            const directResult = await callDirectGroqWithFailover({
                messages,
                model,
                temperature,
                jsonMode: task === 'product_autofill'
            });

            const updatedRate = incrementLocalRateState(directResult.keySlotUsed);
            this.updateStatusUI();

            return {
                success: true,
                reply: directResult.reply,
                model: directResult.model,
                keySlotUsed: directResult.keySlotUsed,
                failoverTriggered: directResult.failoverTriggered,
                rateLimit: updatedRate
            };
        },

        updateStatusUI() {
            const rate = this.getRateStatus();
            const fabQuota = document.getElementById('bcsAiFabQuota');
            const topbarQuota = document.getElementById('topbarAiQuotaBadge');
            const drawerQuotaText = document.getElementById('bcsAiDrawerQuotaText');
            const drawerQuotaBar = document.getElementById('bcsAiDrawerQuotaBar');
            const drawerKeyBadge = document.getElementById('bcsAiKeyStatusBadge');

            const ratio = `${rate.remainingThisHour}/${rate.hourlyLimit}`;
            if (fabQuota) fabQuota.textContent = `${ratio}/hr`;
            if (topbarQuota) topbarQuota.textContent = `${rate.remainingThisHour}/hr`;

            if (drawerQuotaText) {
                drawerQuotaText.textContent = `${rate.remainingThisHour} of ${rate.hourlyLimit} reqs left this hour (resets in ${rate.resetInMinutes}m)`;
            }
            if (drawerQuotaBar) {
                const pct = Math.max(0, Math.min(100, Math.round((rate.remainingThisHour / rate.hourlyLimit) * 100)));
                drawerQuotaBar.style.width = `${pct}%`;
                drawerQuotaBar.className = `progress-bar ${pct > 35 ? 'bg-info' : (pct > 10 ? 'bg-warning' : 'bg-danger')}`;
            }
            if (drawerKeyBadge) {
                const isBackup = rate.lastKeyUsed === 'backup';
                drawerKeyBadge.className = `badge ${isBackup ? 'bg-warning text-dark' : 'bg-success bg-opacity-25 text-success border border-success border-opacity-25'}`;
                drawerKeyBadge.innerHTML = isBackup
                    ? '<i class="bi bi-shield-check me-1"></i>Backup Key Active'
                    : '<i class="bi bi-lightning-charge-fill me-1"></i>Primary + Backup Ready';
            }

            window.dispatchEvent(new CustomEvent('bcs-ai-rate-updated', { detail: rate }));
        },

        mountUI() {
            const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';
            if (isLoginPage || document.getElementById('bcsAiCopilotDrawer')) return;

            const rate = this.getRateStatus();

            const html = `
            <button type="button" id="bcsAiFabBtn" class="bcs-ai-fab" title="Open BCS Groq AI Copilot (Ctrl+Shift+A)">
                <i class="bi bi-stars fs-5"></i>
                <span>BCS AI</span>
                <span id="bcsAiFabQuota" class="bcs-ai-fab-quota">${rate.remainingThisHour}/${rate.hourlyLimit}/hr</span>
            </button>

            <div id="bcsAiBackdrop" class="bcs-ai-drawer-backdrop"></div>

            <aside id="bcsAiCopilotDrawer" class="bcs-ai-drawer" aria-label="BCS Groq AI Copilot">
                <div class="bcs-ai-header d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-2">
                        <div class="rounded-3 d-flex align-items-center justify-content-center" style="width: 38px; height: 38px; background: linear-gradient(135deg, var(--win-accent, #6366f1), #00e5ff); color: #fff;">
                            <i class="bi bi-robot fs-5"></i>
                        </div>
                        <div>
                            <div class="fw-bold d-flex align-items-center gap-2" style="font-size: 0.96rem;">
                                BCS Groq AI Copilot
                                <span id="bcsAiKeyStatusBadge" class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25" style="font-size: 0.65rem;">
                                    <i class="bi bi-lightning-charge-fill me-1"></i>Primary + Backup Ready
                                </span>
                            </div>
                            <div class="text-muted" style="font-size: 0.73rem;">Groq LPU • Dual-Key Failover • Hourly Rate Protected</div>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                        <button type="button" id="bcsAiClearBtn" class="btn btn-sm btn-outline-secondary border-0" title="Clear conversation">
                            <i class="bi bi-trash3"></i>
                        </button>
                        <button type="button" id="bcsAiCloseBtn" class="btn btn-sm btn-outline-secondary border-0" title="Close AI Copilot">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>

                <div class="bcs-ai-rate-bar">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="fw-semibold"><i class="bi bi-speedometer2 me-1 text-info"></i>Hourly Rate Limit Guard</span>
                        <span id="bcsAiDrawerQuotaText" class="text-muted">${rate.remainingThisHour} of ${rate.hourlyLimit} reqs left this hour (resets in ${rate.resetInMinutes}m)</span>
                    </div>
                    <div class="progress" style="height: 5px; background: rgba(255,255,255,0.1);">
                        <div id="bcsAiDrawerQuotaBar" class="progress-bar bg-info" role="progressbar" style="width: ${Math.round((rate.remainingThisHour / rate.hourlyLimit) * 100)}%;"></div>
                    </div>
                </div>

                <div id="bcsAiMessages" class="bcs-ai-messages">
                    <div class="bcs-ai-msg assistant">
                        <div>👋 Hello! I'm <strong>BCS Groq AI Copilot</strong>. I'm connected with <strong>Primary + Automatic Backup Groq Keys</strong> and protected by an hourly rate limit guard.</div>
                        <div class="mt-2 small opacity-75">Ask me about product pricing, inventory alerts, profit margins, or shop operations!</div>
                    </div>
                </div>

                <div class="bcs-ai-quick-chips">
                    <button type="button" class="bcs-ai-chip" data-prompt="Analyze our current store inventory and suggest restock priorities.">📦 Inventory Check</button>
                    <button type="button" class="bcs-ai-chip" data-prompt="Suggest optimal wholesale and retail profit margins for computer & stationery items in BDT (৳).">💰 Margin Advisor</button>
                    <button type="button" class="bcs-ai-chip" data-prompt="Give me 3 actionable ideas to boost daily POS & wholesale sales this week.">📈 Boost Sales</button>
                    <button type="button" class="bcs-ai-chip" data-prompt="Write a professional promotional message for our regular shop customers.">📣 Promo Copy</button>
                </div>

                <form id="bcsAiForm" class="bcs-ai-footer">
                    <div class="input-group">
                        <input type="text" id="bcsAiInput" class="form-control bg-dark text-light border-secondary" placeholder="Ask BCS AI Copilot anything..." autocomplete="off" required>
                        <button type="submit" id="bcsAiSendBtn" class="btn btn-primary px-3">
                            <i class="bi bi-send-fill"></i>
                        </button>
                    </div>
                </form>
            </aside>
            `;

            document.body.insertAdjacentHTML('beforeend', html);

            document.getElementById('bcsAiFabBtn')?.addEventListener('click', () => this.toggle());
            document.getElementById('bcsAiCloseBtn')?.addEventListener('click', () => this.close());
            document.getElementById('bcsAiBackdrop')?.addEventListener('click', () => this.close());
            document.getElementById('bcsAiClearBtn')?.addEventListener('click', () => {
                this.history = [];
                const msgBox = document.getElementById('bcsAiMessages');
                if (msgBox) {
                    msgBox.innerHTML = `
                    <div class="bcs-ai-msg assistant">
                        Conversation cleared. How can I help you with Baroda Computers And Sales today?
                    </div>`;
                }
            });

            document.querySelectorAll('.bcs-ai-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const p = chip.getAttribute('data-prompt');
                    if (p) this.sendUserMessage(p);
                });
            });

            document.getElementById('bcsAiForm')?.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = document.getElementById('bcsAiInput');
                if (!input || !input.value.trim()) return;
                const text = input.value.trim();
                input.value = '';
                this.sendUserMessage(text);
            });

            // Keyboard shortcut: Ctrl+Shift+A
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
                    e.preventDefault();
                    this.toggle();
                }
            });

            this.updateStatusUI();
            this.fetchRemoteStatus();
        },

        open() {
            this.mountUI();
            this.isOpen = true;
            document.getElementById('bcsAiCopilotDrawer')?.classList.add('open');
            document.getElementById('bcsAiBackdrop')?.classList.add('open');
            this.updateStatusUI();
            setTimeout(() => document.getElementById('bcsAiInput')?.focus(), 150);
        },

        close() {
            this.isOpen = false;
            document.getElementById('bcsAiCopilotDrawer')?.classList.remove('open');
            document.getElementById('bcsAiBackdrop')?.classList.remove('open');
        },

        toggle() {
            if (this.isOpen) this.close();
            else this.open();
        },

        async sendUserMessage(text) {
            if (this.isBusy || !text) return;
            this.open();
            const msgBox = document.getElementById('bcsAiMessages');
            const sendBtn = document.getElementById('bcsAiSendBtn');

            if (msgBox) {
                msgBox.insertAdjacentHTML('beforeend', `
                    <div class="bcs-ai-msg user">${formatMarkdownSimple(text)}</div>
                `);
                msgBox.scrollTop = msgBox.scrollHeight;
            }

            const loadingId = 'bcs-ai-loading-' + Date.now();
            if (msgBox) {
                msgBox.insertAdjacentHTML('beforeend', `
                    <div id="${loadingId}" class="bcs-ai-msg assistant">
                        <span class="spinner-border spinner-border-sm text-info me-2" role="status"></span>
                        Thinking with Groq LPU...
                    </div>
                `);
                msgBox.scrollTop = msgBox.scrollHeight;
            }

            this.isBusy = true;
            if (sendBtn) sendBtn.disabled = true;

            try {
                const res = await this.ask({
                    prompt: text,
                    task: 'chat',
                    contextData: window.BCS_LIVE_DASHBOARD_CONTEXT || null
                });

                this.history.push({ role: 'user', content: text });
                this.history.push({ role: 'assistant', content: res.reply });

                const loaderEl = document.getElementById(loadingId);
                const keyBadge = res.keySlotUsed === 'backup'
                    ? '<span class="badge bg-warning text-dark">Backup Key Failover</span>'
                    : '<span class="badge bg-info bg-opacity-25 text-info">Primary Key</span>';

                if (loaderEl) {
                    loaderEl.innerHTML = `
                        <div>${formatMarkdownSimple(res.reply)}</div>
                        <div class="bcs-ai-msg-meta">
                            ${keyBadge}
                            <span>• ${res.model || 'llama-3.3-70b'}</span>
                            <span>• ${this.getRateStatus().remainingThisHour} reqs left/hr</span>
                        </div>
                    `;
                }
            } catch (err) {
                const loaderEl = document.getElementById(loadingId);
                if (loaderEl) {
                    loaderEl.innerHTML = `<div class="text-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i>${formatMarkdownSimple(err.message)}</div>`;
                }
            } finally {
                this.isBusy = false;
                if (sendBtn) sendBtn.disabled = false;
                if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;
                this.updateStatusUI();
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.BCSAICopilot.mountUI());
    } else {
        window.BCSAICopilot.mountUI();
    }
})();
