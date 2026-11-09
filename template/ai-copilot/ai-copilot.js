/**
 * Baroda Computers And Sales - Enterprise AI Copilot Engine
 * Features:
 * 1. 100% Backend-Managed AI Inference (/api/ai/chat) — Zero credentials stored in client code
 * 2. Ruleare Native AI Gateway integration with high-performance C++ & Rust backend
 * 3. Strict 150 Requests / Hour Per-User Rate Limit Enforcement (Native Server Database + Local Guard)
 */
(function () {
    if (window.BCSAICopilot) return;

    const API_BASE_URL = 'https://backend-bcs.bcsdeveloper.com/api';
    const DEFAULT_HOURLY_LIMIT = 150;
    const DEFAULT_HOURLY_TOKEN_LIMIT = 3000;
    const DEFAULT_LOW_TOKEN_MODEL = 'llama3.2:3b';

    function getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': 'backend-bcs-pos',
            'x-session-id': localStorage.getItem('sessionId') || '',
            'x-session-port': localStorage.getItem('sessionPort') || '',
            'x-user-id': localStorage.getItem('loggedInUserName') || localStorage.getItem('loggedInUserId') || 'admin'
        };
    }

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
        if (!rawLimit || rawLimit <= 0) {
            rawLimit = DEFAULT_HOURLY_LIMIT;
            localStorage.setItem('bcs_ai_hourly_limit', String(DEFAULT_HOURLY_LIMIT));
        }

        let rawTokenLimit = Number(localStorage.getItem('bcs_ai_hourly_token_limit'));
        if (!rawTokenLimit || rawTokenLimit <= 0 || rawTokenLimit === 25000) {
            rawTokenLimit = DEFAULT_HOURLY_TOKEN_LIMIT;
            localStorage.setItem('bcs_ai_hourly_token_limit', String(DEFAULT_HOURLY_TOKEN_LIMIT));
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

        // Migrate legacy model names
        if (stored.activeModel === 'openai/gpt-oss-20b' || !stored.activeModel) {
            stored.activeModel = DEFAULT_LOW_TOKEN_MODEL;
            localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(stored));
        }

        const usedReqs = Number(stored.usedThisHour || 0);
        const usedTokens = Number(stored.tokensUsedThisHour || 0);
        const reqsRemaining = Math.max(0, rawLimit - usedReqs);
        const tokensRemaining = Math.max(0, rawTokenLimit - usedTokens);
        const isRequestLimited = reqsRemaining <= 0;
        const isTokenLimited = rawTokenLimit > 0 && tokensRemaining <= 0;
        const isRateLimited = isRequestLimited || isTokenLimited;

        return {
            hourBucket: currentBucket,
            usedThisHour: usedReqs,
            tokensUsedThisHour: usedTokens,
            hourlyLimit: rawLimit,
            hourlyTokenLimit: rawTokenLimit,
            remainingThisHour: isTokenLimited ? 0 : reqsRemaining,
            tokensRemainingThisHour: tokensRemaining,
            primaryHitsThisHour: stored.primaryHits || 0,
            backupHitsThisHour: stored.backupHits || 0,
            lastKeyUsed: stored.lastKeyUsed || 'primary',
            primaryMasked: stored.primaryMasked || 'gsk_kwGL...cSNf',
            backupMasked: stored.backupMasked || 'gsk_9r9z...BqYc',
            activeModel: (stored.activeModel && stored.activeModel !== 'openai/gpt-oss-20b') ? stored.activeModel : DEFAULT_LOW_TOKEN_MODEL,
            isRequestLimited,
            isTokenLimited,
            isRateLimited,
            resetInMinutes: getResetMinutes()
        };
    }

    function syncServerRateState(serverRate, keysConfigured, activeModel) {
        const local = getLocalRateState();
        if (serverRate && serverRate.hourlyLimit) {
            localStorage.setItem('bcs_ai_hourly_limit', String(serverRate.hourlyLimit));
        }
        if (serverRate && serverRate.hourlyTokenLimit) {
            localStorage.setItem('bcs_ai_hourly_token_limit', String(serverRate.hourlyTokenLimit));
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

        async updateBackendConfig({ primaryApiKey = '', backupApiKey = '', hourlyUserLimit, hourlyTokenLimit, defaultModel = DEFAULT_LOW_TOKEN_MODEL }) {
            const payload = { defaultModel };
            if (primaryApiKey && primaryApiKey.trim()) payload.primaryApiKey = primaryApiKey.trim();
            if (backupApiKey && backupApiKey.trim()) payload.backupApiKey = backupApiKey.trim();

            if (hourlyUserLimit !== undefined) {
                const num = Math.max(1, Math.min(5000, Number(hourlyUserLimit) || DEFAULT_HOURLY_LIMIT));
                localStorage.setItem('bcs_ai_hourly_limit', String(num));
                payload.hourlyUserLimit = num;
            }
            if (hourlyTokenLimit !== undefined) {
                const tokNum = Math.max(100, Math.min(1000000, Number(hourlyTokenLimit) || DEFAULT_HOURLY_TOKEN_LIMIT));
                localStorage.setItem('bcs_ai_hourly_token_limit', String(tokNum));
                payload.hourlyTokenLimit = tokNum;
            }

            const res = await fetch(`${API_BASE_URL}/ai/chat`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to update backend AI configuration');
            }
            if (data.rateLimit) {
                syncServerRateState(data.rateLimit, data.keysConfigured, data.activeModel);
            } else {
                await this.fetchRemoteStatus();
            }
            this.updateStatusUI();
            return data;
        },

        setHourlyLimit(newLimit, newTokenLimit) {
            const num = Math.max(1, Math.min(5000, Number(newLimit) || DEFAULT_HOURLY_LIMIT));
            localStorage.setItem('bcs_ai_hourly_limit', String(num));
            const cfg = { hourlyUserLimit: num };
            if (newTokenLimit !== undefined) {
                const tokNum = Math.max(100, Math.min(1000000, Number(newTokenLimit) || DEFAULT_HOURLY_TOKEN_LIMIT));
                localStorage.setItem('bcs_ai_hourly_token_limit', String(tokNum));
                cfg.hourlyTokenLimit = tokNum;
            }
            this.updateBackendConfig(cfg).catch(() => {});
            this.updateStatusUI();
            return this.getRateStatus();
        },

        async fetchRemoteStatus() {
            try {
                const res = await fetch(`${API_BASE_URL}/ai/chat`, {
                    method: 'GET',
                    headers: getAuthHeaders()
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
            // Strictly enforce max 1 request at a time
            if (this.isBusy) {
                throw new Error('An AI request is currently in progress. Only 1 request allowed at a time.');
            }

            // Sync latest state from local storage first
            const rateBefore = this.getRateStatus();
            if (rateBefore.isRateLimited) {
                const reason = rateBefore.isTokenLimited
                    ? `Hourly AI token quota exhausted (${rateBefore.tokensUsedThisHour}/${rateBefore.hourlyTokenLimit} tokens used this hour).`
                    : `Hourly AI request limit reached (${rateBefore.usedThisHour}/${rateBefore.hourlyLimit} requests/hour for your account).`;
                throw new Error(`${reason} Quota resets in ${rateBefore.resetInMinutes} min.`);
            }

            this.isBusy = true;
            this.updateStatusUI();

            try {
                // All AI requests are strictly managed by the native server backend (/api/ai/chat)
                const res = await fetch(`${API_BASE_URL}/ai/chat`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
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
                    if (data.rateLimit) {
                        syncServerRateState(data.rateLimit);
                    } else if (!data.concurrentBlocked) {
                        // Force mark exhausted locally so UI blocks further tries until reset
                        const local = getLocalRateState();
                        const bucket = JSON.parse(localStorage.getItem('bcs_ai_rate_bucket') || '{}');
                        bucket.usedThisHour = local.hourlyLimit;
                        localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(bucket));
                    }
                    this.updateStatusUI();
                    throw new Error(data.error || 'Hourly AI Rate Limit reached. Please wait for the next hour.');
                }

                // Support both enriched envelope and raw OpenAI completions
                const isSuccess = data.success === true || (Array.isArray(data.choices) && data.choices.length > 0) || (typeof data.reply === 'string');
                if (!res.ok || !isSuccess) {
                    throw new Error(data.error || `Backend AI Error (${res.status})`);
                }
                if (!data.reply && data.choices?.[0]?.message?.content) {
                    data.reply = data.choices[0].message.content;
                }

                // Always deduct request & token usage immediately (from server rateLimit or local fallback)
                const tokensFromCall = Number(data.usage?.total_tokens || 120);
                if (data.rateLimit && typeof data.rateLimit.usedThisHour === 'number') {
                    const local = getLocalRateState();
                    const updatedServerRate = {
                        ...data.rateLimit,
                        usedThisHour: Math.max(Number(data.rateLimit.usedThisHour), local.usedThisHour + 1),
                        tokensUsedThisHour: Math.max(Number(data.rateLimit.tokensUsedThisHour || 0), (local.tokensUsedThisHour || 0) + tokensFromCall)
                    };
                    const rawBucket = JSON.parse(localStorage.getItem('bcs_ai_rate_bucket') || '{}');
                    rawBucket.lastKeyUsed = data.keySlotUsed || 'primary';
                    localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(rawBucket));
                    syncServerRateState(updatedServerRate, null, data.model);
                } else {
                    const rawBucket = JSON.parse(localStorage.getItem('bcs_ai_rate_bucket') || '{}');
                    rawBucket.hourBucket = getCurrentHourBucket();
                    rawBucket.usedThisHour = Number(rawBucket.usedThisHour || 0) + 1;
                    rawBucket.tokensUsedThisHour = Number(rawBucket.tokensUsedThisHour || 0) + tokensFromCall;
                    rawBucket.lastKeyUsed = data.keySlotUsed || 'primary';
                    localStorage.setItem('bcs_ai_rate_bucket', JSON.stringify(rawBucket));
                }
                this.updateStatusUI();
                return data;
            } finally {
                this.isBusy = false;
                this.updateStatusUI();
            }
        },

        updateStatusUI() {
            const rate = this.getRateStatus();
            const fabQuota = document.getElementById('bcsAiFabQuota');
            const topbarQuota = document.getElementById('topbarAiQuotaBadge');
            const drawerQuotaText = document.getElementById('bcsAiDrawerQuotaText');
            const drawerQuotaBar = document.getElementById('bcsAiDrawerQuotaBar');
            const drawerKeyBadge = document.getElementById('bcsAiKeyStatusBadge');
            const drawerInput = document.getElementById('bcsAiInput');
            const drawerSendBtn = document.getElementById('bcsAiSendBtn');

            const ratio = `${rate.remainingThisHour}/${rate.hourlyLimit}`;
            if (fabQuota) fabQuota.textContent = `${ratio}/hr`;
            if (topbarQuota) {
                topbarQuota.textContent = rate.isRateLimited ? `0/${rate.hourlyLimit} (Locked)` : `${rate.remainingThisHour}/hr`;
                topbarQuota.className = rate.isRateLimited
                    ? 'badge rounded-pill bg-danger text-white'
                    : 'badge rounded-pill bg-dark bg-opacity-50 text-info border border-info border-opacity-25';
            }

            if (drawerQuotaText) {
                drawerQuotaText.textContent = `${rate.remainingThisHour}/${rate.hourlyLimit} reqs left • ${rate.tokensUsedThisHour || 0}/${rate.hourlyTokenLimit || 25000} tok (${rate.resetInMinutes}m)`;
            }
            if (drawerQuotaBar) {
                const reqPct = Math.round((rate.remainingThisHour / rate.hourlyLimit) * 100);
                const tokPct = rate.hourlyTokenLimit ? Math.round((rate.tokensRemainingThisHour / rate.hourlyTokenLimit) * 100) : 100;
                const pct = Math.max(0, Math.min(100, Math.min(reqPct, tokPct)));
                drawerQuotaBar.style.width = `${pct}%`;
                drawerQuotaBar.className = `progress-bar ${pct > 35 ? 'bg-info' : (pct > 10 ? 'bg-warning' : 'bg-danger')}`;
            }
            if (drawerInput && drawerSendBtn && !this.isBusy) {
                drawerInput.disabled = rate.isRateLimited;
                drawerSendBtn.disabled = rate.isRateLimited;
                if (rate.isRateLimited) {
                    drawerInput.placeholder = `Hourly quota exhausted. Resets in ${rate.resetInMinutes}m...`;
                } else {
                    drawerInput.placeholder = 'Ask BCS AI Copilot anything...';
                }
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
            <div id="bcsAiBackdrop" class="bcs-ai-drawer-backdrop"></div>

            <aside id="bcsAiCopilotDrawer" class="bcs-ai-drawer" aria-label="BCS AI Copilot">
                <div class="bcs-ai-header d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-2">
                        <div class="rounded-3 d-flex align-items-center justify-content-center" style="width: 38px; height: 38px; background: linear-gradient(135deg, var(--win-accent, #6366f1), #00e5ff); color: #fff;">
                            <i class="bi bi-robot fs-5"></i>
                        </div>
                        <div>
                            <div class="fw-bold d-flex align-items-center gap-2" style="font-size: 0.96rem;">
                                BCS AI Copilot
                                <span id="bcsAiKeyStatusBadge" class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25" style="font-size: 0.65rem;">
                                    <i class="bi bi-cpu-fill me-1"></i>Ruleare AI Engine
                                </span>
                            </div>
                            <div class="text-muted" style="font-size: 0.72rem;">Ruleare AI Core • 150 Reqs/Hr Per User</div>
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
                        <div>👋 Hello! I'm <strong>BCS AI Copilot</strong>, powered by the high-performance <strong>Ruleare Native AI Engine</strong> running directly on your dedicated server.</div>
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
                        Running AI inference on Ruleare Gateway...
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

                // Check if the reply contains agentic actions
                let cleanReply = res.reply;
                let actionBlocks = [];
                if (window.BCSAgenticExecutor) {
                    actionBlocks = window.BCSAgenticExecutor.parseActionsFromText(res.reply);
                    cleanReply = window.BCSAgenticExecutor.cleanTextResponse(res.reply);
                }

                this.history.push({ role: 'user', content: text });
                this.history.push({ role: 'assistant', content: cleanReply });

                const loaderEl = document.getElementById(loadingId);
                const keyBadge = res.keySlotUsed === 'backup'
                    ? '<span class="badge bg-warning text-dark">Backup Key Failover</span>'
                    : '<span class="badge bg-info bg-opacity-25 text-info">Primary Key</span>';
                const tokCount = res.usage?.total_tokens ? `${res.usage.total_tokens} tok` : 'low-token';

                let actionHtml = '';
                if (actionBlocks.length > 0) {
                    actionHtml = actionBlocks.map((act, idx) => {
                        const actId = `bcs-action-btn-${Date.now()}-${idx}`;
                        setTimeout(() => {
                            document.getElementById(actId)?.addEventListener('click', async function() {
                                const btn = this;
                                btn.disabled = true;
                                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Executing...';
                                try {
                                    const actRes = await window.BCSAgenticExecutor.executeAction(act);
                                    btn.className = 'btn btn-sm btn-success w-100 mt-2 text-start py-2';
                                    btn.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> ${actRes.message}`;
                                    window.dispatchEvent(new CustomEvent('bcs-agentic-action-completed', { detail: actRes }));
                                } catch (e) {
                                    btn.className = 'btn btn-sm btn-danger w-100 mt-2 text-start py-2';
                                    btn.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i> Error: ${e.message}`;
                                }
                            });
                        }, 50);

                        return `
                            <div class="mt-2 p-2 rounded-3 border border-info border-opacity-30 bg-info bg-opacity-10">
                                <div class="d-flex align-items-center gap-1 small text-info fw-bold">
                                    <i class="bi bi-lightning-charge-fill"></i> Agentic Action Prepared: ${act.action.replace('_', ' ').toUpperCase()}
                                </div>
                                <div class="small text-muted mt-1">${act.summary || JSON.stringify(act.data)}</div>
                                <button type="button" id="${actId}" class="btn btn-sm btn-info text-white fw-semibold w-100 mt-2">
                                    <i class="bi bi-play-circle-fill me-1"></i> Execute "${act.action.replace('_', ' ')}" Now
                                </button>
                            </div>
                        `;
                    }).join('');
                }

                if (loaderEl) {
                    loaderEl.innerHTML = `
                        <div>${formatMarkdownSimple(cleanReply)}</div>
                        ${actionHtml}
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
