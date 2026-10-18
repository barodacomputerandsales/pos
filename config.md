# BCS Enterprise POS - Project Configuration & Documentation

## What We Have

**1. Desktop POS App (`app/`)**
- **Type**: Desktop POS application (Windows).
- **Core Technology**: Electron 31, HTML5, CSS3, Vanilla JavaScript, NSIS.
- **Views**: `app/index.html` (Login/Entry), `app/dashboard.html`, `app/pos.html`, `app/all-product.html`, `app/add-product.html`, `app/add-production.html`, `app/production-history.html`, `app/add-production-product.html`, `app/settings.html`.
- **Scripts**: 
  - `app/main.js`: Main Electron process and auto-update IPC coordinator.
  - `app/script/api.js`: Handles API calls to backend with IndexedDB caching and optimistic updates.
  - `app/script/auth.js`: Handles user authentication and security.
- **Templates**: Reusable UI components (`app/template/sidebar/`, `app/template/topbar/`) and layout manager (`app/template/layout.js`).
- **Build/Release**: `npm run build` or `npm --prefix app run build`.

**2. Customer Portal & E-Commerce (`customer+e-com/`)**
- **Type**: 2-in-1 Customer Account Portal + Online Storefront.
- **Production Domain**: `https://bcs.bcsdeveloper.com`
- **Security**: Public read-only catalog (`/api/ecommerce/products`), server-validated checkout (`/api/ecommerce/order`).

**3. Delivery Portal (`delivery/`)**
- **Type**: Logistics and delivery driver dispatch web application.
- **Production Domain**: `https://delivery.bcs.bcsdeveloper.com`
- **Features**: Driver assignments, order route tracking, and OTP verification upon delivery.

**4. Cloudflare D1 Serverless Backend (`backend/`)**
- **Type**: Serverless API.
- **Location**: `backend/functions/api/`
- **Database**: SQLite using Cloudflare D1 (`context.env.DB`).
- **Core Tables**: `users`, `products`, `productions`, `customers`, `sales`, `purchases`, `deleted_products`.
- **Key Modules**:
  - `auth/`: Handles session, login, and registration.
  - `database/`: Dynamic microservices (`add.js`, `read.js`, `update.js`, `delete.js`, `data-manager.js`).
  - `mail/`: Email logic queue.
  - `cron/`: Scheduled tasks (11:55 PM daily report, 48h purge of soft-deleted products).
- **more details**: [see](backend/before-action-read-me.md)

**5. Automated Cron & Event Caller (`automation/`)**
- **Type**: Background cron worker & automation engine.
- **Features**: 11:55 PM IST daily revenue & store report trigger, soft-delete cleanup, event-driven customer emails.
- **Stack**: Node.js, GitHub Actions workflows.

---
---
## SYSTEM mails
-   **suport** = `support@bcs.bcsdeveloper.com`
-  **sysrtem** = `no-reply@bcs.bcsdeveloper.com`
---
---
## Official GitHub Repositories (`barodacomputerandsales`)
- **1. Desktop POS App (`app/`)**: https://github.com/barodacomputerandsales/pos
- **2. Customer Portal & E-Commerce (`customer+e-com/`)**: https://github.com/barodacomputerandsales/e-com-customer-portal
- **3. Delivery Portal (`delivery/`)**: https://github.com/barodacomputerandsales/delivery
- **4. Backend Serverless API (`backend/`)**: https://github.com/barodacomputerandsales/backend
- **5. Automated Cron & Event Caller (`automation/`)**: https://github.com/barodacomputerandsales/automation
- **Live Backend Serverless API**: https://backend.bcs.bcsdeveloper.com/api
- **API Master Key**: `backend-bcs-pos` (`x-api-key` header)

## Official Production Domains
- **Customer Portal & E-Commerce**: `https://bcs.bcsdeveloper.com`
- **Delivery & Logistics Portal**: `https://delivery.bcs.bcsdeveloper.com`
- **Backend Serverless API**: `https://backend.bcs.bcsdeveloper.com` (API Base: `https://backend.bcs.bcsdeveloper.com/api`)

## Rules for Editing Files

When collaborating on this project, please adhere to the following rules:

1. **Frontend Changes (Electron)**:
   - Always check the corresponding HTML file before modifying UI JS scripts.
   - Use the centralized `script/api.js` for all backend requests instead of writing raw `fetch` calls scattered across files.
   - Ensure the template structure (e.g., `sidebar`, `topbar`) remains intact when adding new views. Use `template/layout.js` to manage UI component injection.

2. **Backend Changes (Cloudflare Functions)**:
   - All backend API endpoints should reside inside `backend/functions/api/`.
   - Ensure standard CORS headers are attached to all responses (`Access-Control-Allow-Origin: *`, etc.).
   - Use parameterized queries with `context.env.DB.prepare()` and `.bind()` to prevent SQL injection when interacting with the database.
   - Table names must always be sanitized (`table.replace(/[^a-zA-Z0-9_]/g, '')`).

3. **General Best Practices**:
   - Do not commit secrets (like `gmail.json` or API keys) directly.
   - Run a quick test of the Electron app (`npm start`) before pushing changes to ensure no breaking runtime errors occur.
   - Document any new database table or column additions in this `config.md` file.

---

## Documentation

### Authentication Flow
- The application uses `argon2` for password hashing and secure token management.
- User sessions are tracked via a `session_id` and verified against a `trusted_port` or security code.

### Database Schema Overview
- **Users**: `id`, `username`, `password_hash`, `security_code`, `session_id`, `trusted_port`, `role`, `permissions`.
- **Products**: `id`, `name`, `barcode`, `barcodeType`, `unit`, `brand`, `category`, `sellPrice`, `buyPrice`, `wholesalePrice`, `quantity`, `alertQuantity`, `isProduction`, `priceTiers`, `imageUrl`, `description`, `deleteScheduledAt`.
- **Productions**: `id`, `batchNumber`, `finishedProductId`, `productName`, `barcode`, `category`, `quantityProduced`, `unit`, `materialsUsed` (JSON array of consumed items), `materialCost`, `overheadCost`, `totalCost`, `costPerUnit`, `date`, `producedBy`, `notes`, `createdAt`.
- **Customers**: `id`, `name`, `phone`.
- **Sales**: `id`, `total`, `date`.
- **Purchases**: `id`, `items`, `total`, `date`.
- **Orders (E-Commerce & Delivery)**: `id`, `orderNumber`, `customerId`, `customerName`, `customerPhone`, `shippingAddress`, `items` (JSON), `subtotal`, `tax`, `discount`, `deliveryFee`, `total`, `paymentMethod`, `paymentStatus`, `orderStatus`, `orderSource`, `createdAt`.
- **Deliveries (Logistics & Dispatch)**: `id`, `orderId`, `driverId`, `driverName`, `driverPhone`, `pickupAddress`, `deliveryAddress`, `deliveryStatus`, `otpCode`, `deliveryNotes`, `dispatchedAt`, `deliveredAt`.
- **Delivery Agents**: `id`, `name`, `phone`, `vehicleType`, `status`, `activeOrderId`.
- **Customer Accounts (Portal)**: `id`, `customerId`, `email`, `password_hash`, `loyaltyPoints`, `savedAddresses` (JSON), `createdAt`.
- **Deleted Products**: Tracks soft-deleted or removed products for auditing (`productId`, `barcode`, `deletedAt`).

### System Update System & Deployment Pipeline
- **Auto-Updater Integration**:
  - `electron-updater` queries the serverless backend relay which fetches releases from `barodacomputerandsales/pos`.
  - Background silent check executes on startup (`autoUpdater.checkForUpdatesAndNotify()`).
  - IPC lifecycle events bridge `main.js` with renderer views (`template/topbar/topbar.js` and `settings.html`):
    - `checking_for_update`: Displays spinner indicator.
    - `update_available`: Triggers automated background download.
    - `download_progress`: Relays real-time percentage, speed (MB/s), and transferred bytes to UI progress bars.
    - `update_downloaded`: Activates green "Restart to Install" button and modal actions.
    - `update_not_available`: Confirms latest version status.
    - `update_error`: Displays retry alerts.
- **Publishing a New App Version**:
  1. Increment version in `package.json` (e.g. `1.9.6`).
  2. Commit and tag:
     ```bash
     git commit -am "chore: release v1.9.6"
     git tag v1.9.6
     git push origin main --tags
     ```
  3. GitHub Actions (`.github/workflows/build-release.yml`) builds Windows binaries and publishes the release on GitHub.
  4. Installed client instances automatically download and prompt users to restart.

---

---

### Windows Defender & SmartScreen Compliance
To prevent Windows Defender / SmartScreen from false-flagging the app:

1. **PE Metadata & Permissions (Configured in `package.json`)**:
   - `requestedExecutionLevel: "asInvoker"`: Runs with standard user rights without demanding UAC elevation, avoiding high-risk heuristic triggers.
   - `perMachine: false`: Installs to `%LOCALAPPDATA%\Programs\` rather than system folders, preventing system modification alerts.
   - Populated Publisher (`bcsdeveloper`), Legal Trademarks, Copyright, and high-resolution `assets/icon.ico`.
   - Excluded internal backend and markdown docs from the packaged `.asar` to keep binary clean and small.

2. **Authenticode Code Signing (Optional / Recommended)**:
   - If you have an Authenticode certificate (`.pfx`), add two repository secrets in GitHub (`Settings -> Secrets and variables -> Actions`):
     - `CSC_LINK`: Base64 encoded content of the `.pfx` file.
     - `CSC_KEY_PASSWORD`: Password for the `.pfx` file.
   - `electron-builder` will automatically sign the `.exe` and the uninstaller.

3. **Microsoft Security Intelligence Whitelisting (Free & Instant)**:
   - For any new release binary, submit the installer `.exe` directly to Microsoft's developer portal:
     👉 [https://www.microsoft.com/en-us/wdsi/filesubmission](https://www.microsoft.com/en-us/wdsi/filesubmission)
   - Select **"Software Developer"** -> Category: **"Incorrectly detected as malware (false positive)"**.
   - Microsoft's automated security pipeline scans the binary, clears Defender definitions, and pushes cloud exclusion within 1–2 hours worldwide.
