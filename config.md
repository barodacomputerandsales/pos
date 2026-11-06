# BCS Enterprise POS - Project Configuration & Documentation

## What We Have

**1. Desktop POS App (`app/`)**
- **Type**: Desktop POS application (Windows).
- **Core Technology**: Electron 31, HTML5, CSS3, Vanilla JavaScript, NSIS.
- **Views**: `app/index.html` (Login & Fast PIN slider), `app/dashboard.html`, `app/all-product.html`, `app/add-product.html`, `app/add-purchase.html`, `app/purchase-history.html`, `app/add-production.html`, `app/production-history.html`, `app/add-production-product.html`, `app/all-suppliers.html`, `app/add-supplier.html`, `app/account.html` (Account Center & Credentials), `app/employee.html` (Staff & Employees Management), `app/settings.html`, `app/ai.html`.
- **Scripts**: 
  - `app/main.js`: Main Electron process, persistent window state, Windows 11 accent/theme sync, and auto-update coordinator.
  - `app/script/api.js`: Unified API layer with IndexedDB cache, background revalidation, and universal collection mapper.
  - `app/script/auth.js`: User authentication, session management, and workstation port bonding.
  - `app/script/permissions.js`: Client-side RBAC and UI element auto-protection.
  - `app/script/image-utils.js`: In-memory WebP image compression and NVMe storage pipeline.
- **Templates**: Holographic auto-updater (`app/template/updater/`), AI Copilot drawer (`app/template/ai-copilot/`), Spotlight search (`app/template/spotlight-search/`), sidebar (`app/template/sidebar/`), topbar (`app/template/topbar/`), and layout coordinator (`app/template/layout.js`).
- **Build/Release**: `npm run build` or `npm --prefix app run build`.

**2. Dedicated Dell PowerEdge Server Backend (`backend/`)**
- **Host**: Dedicated Dell PowerEdge Ubuntu Server (`192.168.50.123`) on Port `3001` managed by PM2 (`bcs-pos-backend`).
- **Public Ingress**: `https://backend-bcs.bcsdeveloper.com/api` (Cloudflare Zero Trust Tunnel).
- **Database Engine**: Server-native SQLite WAL (`db/bcs_pos.sqlite`) with NVMe direct memory-mapping.
- **Clean Domain Architecture**:
  - `auth/`: Authentication gatekeeper (`middleware.js`), credential verification, fast PIN unlock, port bonding & session management (`index.js`).
  - `db/`: Native SQLite WAL engine, schemas, and database query API routes (`index.js`).
  - `mail/`: Gmail OAuth2 RFC 2822 dispatcher, token caching (`index.js`), and branded gradient email templates (`templates.js`).
  - `ai/`: Native Ruleare AI Gateway proxy (`port 1111`, LLaMA 3.2 3B) and rate limiting (`index.js`).
  - `storage/`: Product image NVMe storage & uploads (`index.js`).
  - `updater/`: Auto-update manifest generator & binary installer downloads (`index.js`).
  - `cron/`: Scheduled maintenance & daily EOD reports (`index.js`).
  - `config/`: Environment configuration, directory paths, and Gmail OAuth credentials (`index.js`, `mail.js`).
  - `server.js`: Clean entry point coordinating domain modules via `require('./<domain>')`.
- **More Details**: [see backend/before-action-read-me.md](backend/before-action-read-me.md)

**3. Automated Cron & Event Caller (`automation/`)**
- **Type**: Background cron worker & automation engine.
- **Features**: 11:55 PM IST daily revenue & store report trigger, soft-delete cleanup, event-driven customer emails.

---

## SYSTEM Mails
- **Support**: `support@bcs.bcsdeveloper.com`
- **System / Outgoing**: `no-reply@bcs.bcsdeveloper.com`
- **Admin Recipient**: `sahaindranil1984@gmail.com`

---

## Production Endpoints & Keys
- **Live Backend API**: `https://backend-bcs.bcsdeveloper.com/api`
- **API Master Key**: `backend-bcs-pos` (`x-api-key` header)
- **Workstation Port Bonding**: `x-session-port` header verified against `users.trusted_port`

---

## Authentication & Security Rules
- **Multi-Mode Login (`/api/auth/login`)**:
  - `action: 'login'`: Operator username, password, optional security PIN, and workstation `portnumber` bonding.
  - `action: 'fast_login'`: Fast PIN keypad unlock (minimum 6 digits numeric PIN), matching raw or SHA-256 hashed `security_code` in `users`.
  - `action: 'trust_port'`: Explicit workstation port bonding fallback.
  - `action: 'set_security_code'`: Sets or updates 6-digit numeric security code in `users`.
  - `action: 'verify_session'`: Instant workstation session health check.
- **Dedicated In-Session Re-Authentication (`/api/auth/reauth`)**:
  - Pure credential verification for unlocking sensitive settings (password changes, PIN updates, workstation controls).
  - Strictly preserves existing `session_id` and does not mutate or bond `trusted_port`.
- **Anti-Hijacking Port Guard**: Rejects requests where `x-session-port` does not match bonded `trusted_port`.
- **Brute-Force Lockout Defense**: 6 failed attempts locks account for 15 minutes.
- **Server-Side RBAC**: Granular table-by-table action enforcement (`read`, `add`, `update`, `delete`). Admin roles (`admin`, `administrator`, `superadmin`) bypass all checks (`*`).
