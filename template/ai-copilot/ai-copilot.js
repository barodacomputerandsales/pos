/**
 * Baroda Computers And Sales - Enterprise Groq AI Copilot Engine
 * Features:
 * 1. 100% Backend-Managed API Keys (/api/ai/chat) — Zero API keys stored in client code
 * 2. Ultra-Low-Token Model (`openai/gpt-oss-20b` with `reasoning_effort: "low"`)
 * 3. Strict 150 Requests / Hour Per-User Rate Limit Enforcement (Cloudflare D1 + Local Guard)
 */
(function () {
    if (window.BCSAICopilot) return;

    const API_BASE_URL = 'https://backend.bcs.bcsdeveloper.com/api';
    const DEFAULT_HOURLY_LIMIT = 150;
    const DEFAULT_LOW_TOKEN_MODEL = 'openai/gpt-oss-20b';

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
        let rawLimit = Number(localStorage.getItem('bcs_ai_hourly_limit'));
        // Auto-upgrade previous 40 default to 150 requests/hour per user
        if (!rawLimit || rawLimit === 40) {
            rawLimit = DEFAULT_HOURLY_LIMIT;
            localStorage.setItem('bcs_ai_hourly_limit', String(DEFAULT_HOURLY_LIMIT));
        }

        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem('bcs_ai_rate_bucket') || 'null');
        } catch (e) {}

        if (!stored || stored.hourBucket !== currentBucket) {
            stored = {
                hourBucket: currentBucket,
                usedThisHour: 0,
                tokensUsedThisHour: 0,
                primaryHits: 0,
                backupHits: 0,
                lastKeyUsed: 'primary',
                primaryMasked: 'gsk_kwGL...cSNf',
                backupMasked: 'gsk_9r9z...BqYc',
                activeModel: DEFAULT_LOW_TOKEN_MODEL
            };
            localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(stored));
        }

        const remaining = Math.max(0, rawLimit - (stored.usedThisHour || 0));
        return {
            hourBucket: currentBucket,
            usedThisHour: stored.usedThisHour || 0,
            tokensUsedThisHour: stored.tokensUsedThisHour || 0,
            hourlyLimit: rawLimit,
            remainingThisHour: remaining,
            primaryHitsThisHour: stored.primaryHits || 0,
            backupHitsThisHour: stored.backupHits || 0,
            lastKeyUsed: stored.lastKeyUsed || 'primary',
            primaryMasked: stored.primaryMasked || 'gsk_kwGL...cSNf',
            backupMasked: stored.backupMasked || 'gsk_9r9z...BqYc',
            activeModel: stored.activeModel || DEFAULT_LOW_TOKEN_MODEL,
            isRateLimited: remaining <= 0,
            resetInMinutes: getResetMinutes()
        };
    }

    function syncServerRateState(serverRate, keysConfigured, activeModel) {
        const local = getLocalRateState();
        if (serverRate && serverRate.hourlyLimit) {
            localStorage.setItem('bcs_ai_hourly_limit', String(serverRate.hourlyLimit));
        }
        const updated = {
            hourBucket: (serverRate && serverRate.hourBucket) ? serverRate.hourBucket : local.hourBucket,
            usedThisHour: (serverRate && typeof serverRate.usedThisHour === 'number') ? serverRate.usedThisHour : local.usedThisHour,
            tokensUsedThisHour: (serverRate && typeof serverRate.tokensUsedThisHour === 'number') ? serverRate.tokensUsedThisHour : local.tokensUsedThisHour,
            primaryHits: (serverRate && typeof serverRate.primaryHitsThisHour === 'number') ? serverRate.primaryHitsThisHour : local.primaryHitsThisHour,
            backupHits: (serverRate && typeof serverRate.backupHitsThisHour === 'number') ? serverRate.backupHitsThisHour : local.backupHitsThisHour,
            lastKeyUsed: local.lastKeyUsed || 'primary',
            primaryMasked: (keysConfigured && keysConfigured.primaryMasked) ? keysConfigured.primaryMasked : local.primaryMasked,
            backupMasked: (keysConfigured && keysConfigured.backupMasked) ? keysConfigured.backupMasked : local.backupMasked,
            activeModel: activeModel || local.activeModel || DEFAULT_LOW_TOKEN_MODEL
        };
        localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(updated));
        return getLocalRateState();
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

        async updateBackendConfig({ primaryApiKey = '', backupApiKey = '', hourlyUserLimit = 150, defaultModel = DEFAULT_LOW_TOKEN_MODEL }) {
            const num = Math.max(10, Math.min(2000, Number(hourlyUserLimit) || DEFAULT_HOURLY_LIMIT));
            localStorage.setItem('bcs_ai_hourly_limit', String(num));

            const res = await fetch(`${API_BASE_URL}/ai/chat`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': 'backend-bcs-pos',
                    'x-session-id': localStorage.getItem('sessionId') || '',
                    'x-session-port': localStorage.getItem('sessionPort') || ''
                },
                body: JSON.stringify({
                    primaryApiKey: primaryApiKey ? primaryApiKey.trim() : undefined,
                    backupApiKey: backupApiKey ? backupApiKey.trim() : undefined,
                    hourlyUserLimit: num,
                    defaultModel
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to update backend AI configuration');
            }
            await this.fetchRemoteStatus();
            return data;
        },

        setHourlyLimit(newLimit) {
            const num = Math.max(10, Math.min(2000, Number(newLimit) || DEFAULT_HOURLY_LIMIT));
            localStorage.setItem('bcs_ai_hourly_limit', String(num));
            this.updateBackendConfig({ hourlyUserLimit: num }).catch(() => {});
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
                        syncServerRateState(data.rateLimit, data.keysConfigured, data.activeModel);
                        this.updateStatusUI();
                    }
                }
            } catch (e) {}
            return this.getRateStatus();
        },

        async ask({ prompt = '', task = 'chat', contextData = null, model = DEFAULT_LOW_TOKEN_MODEL, temperature = 0.3 }) {
            const rateBefore = this.getRateStatus();
            if (rateBefore.isRateLimited) {
                throw new Error(`Hourly AI Rate Limit reached (${rateBefore.hourlyLimit}/${rateBefore.hourlyLimit} requests/hour for your account). Quota resets in ${rateBefore.resetInMinutes} min.`);
            }

            // All AI requests & API keys are strictly managed on the Cloudflare Backend (/api/ai/chat)
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
                    messages: task === 'chat' ? this.history.slice(-4) : [],
                    task,
                    contextData,
                    model,
                    temperature,
                    max_tokens: 350
                })
            });

            const data = await res.json().catch(() => ({}));

            if (res.status === 429) {
                if (data.rateLimit) syncServerRateState(data.rateLimit);
                this.updateStatusUI();
                throw new Error(data.error || 'Hourly AI Rate Limit (150 reqs/hr) reached.');
            }

            if (!res.ok || !data.success) {
                throw new Error(data.error || `Backend AI Error (${res.status})`);
            }

            if (data.rateLimit) {
                const local = getLocalRateState();
                local.lastKeyUsed = data.keySlotUsed || 'primary';
                localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(local));
                syncServerRateState(data.rateLimit, null, data.model);
            }
            this.updateStatusUI();
            return data;
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
                drawerQuotaText.textContent = `${rate.remainingThisHour} of ${rate.hourlyLimit} reqs left/hr • ${rate.tokensUsedThisHour || 0} tok (resets in ${rate.resetInMinutes}m)`;
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
                    ? '<i class="bi bi-shield-check me-1"></i>Backend Backup Key Active'
                    : '<i class="bi bi-cloud-check-fill me-1"></i>Backend Dual-Key Vault';
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
                                    <i class="bi bi-cloud-check-fill me-1"></i>Backend Dual-Key Vault
                                </span>
                            </div>
                            <div class="text-muted" style="font-size: 0.72rem;">Low-Token Engine (<code>gpt-oss-20b</code>) • 150 Reqs/Hr Per User</div>
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
                        <span class="fw-semibold"><i class="bi bi-speedometer2 me-1 text-info"></i>Per-User Rate Limit (150/hr)</span>
                        <span id="bcsAiDrawerQuotaText" class="text-muted">${rate.remainingThisHour} of ${rate.hourlyLimit} reqs left/hr • ${rate.tokensUsedThisHour || 0} tok (resets in ${rate.resetInMinutes}m)</span>
                    </div>
                    <div class="progress" style="height: 5px; background: rgba(255,255,255,0.1);">
                        <div id="bcsAiDrawerQuotaBar" class="progress-bar bg-info" role="progressbar" style="width: ${Math.round((rate.remainingThisHour / rate.hourlyLimit) * 100)}%;"></div>
                    </div>
                </div>

                <div id="bcsAiMessages" class="bcs-ai-messages">
                    <div class="bcs-ai-msg assistant">
                        <div>👋 Hello! I'm <strong>BCS Groq AI Copilot</strong>. My Primary &amp; Backup Groq keys are securely managed on your Cloudflare Backend using the ultra-low-token <code>openai/gpt-oss-20b</code> engine (<strong>150 requests/hour per user</strong>).</div>
                        <div class="mt-2 small opacity-75">Ask me about product pricing, inventory alerts, profit margins, or shop operations!</div>
                    </div>
                </div>

                <div class="bcs-ai-quick-chips">
                    <button type="button" class="bcs-ai-chip" data-prompt="Analyze our current store inventory and suggest restock priorities.">📦 Inventory Check</button>
                    <button type="button" class="bcs-ai-chip" data-prompt="Suggest optimal wholesale and retail profit margins for computer & stationery items in BDT (৳).">💰 Margin Advisor</button>
                    <button type="button" class="bcs-ai-chip" data-prompt="Give me 3 actionable ideas to boost daily POS & wholesale sales this week.">📈 Boost Sales</button>
                    <button type="button" class="bcs-ai-chip" data-prompt="Write a short promotional message for our regular shop customers.">📣 Promo Copy</button>
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
                        Running low-token Groq inference on backend...
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
                const tokCount = res.usage?.total_tokens ? `${res.usage.total_tokens} tok` : 'low-token';

                if (loaderEl) {
                    loaderEl.innerHTML = `
                        <div>${formatMarkdownSimple(res.reply)}</div>
                        <div class="bcs-ai-msg-meta">
                            ${keyBadge}
                            <span>• ${res.model || DEFAULT_LOW_TOKEN_MODEL} (${tokCount})</span>
                            <span>• ${this.getRateStatus().remainingThisHour} left/hr</span>
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
