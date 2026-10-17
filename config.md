# BCS Enterprise POS - Project Configuration & Documentation

## What We Have

**1. Desktop POS App (`pos app/`)**
- **Type**: Desktop POS application (Windows).
- **Core Technology**: Electron 31, HTML5, CSS3, Vanilla JavaScript, NSIS.
- **Views**: `pos app/index.html` (Login/Entry), `pos app/dashboard.html`, `pos app/pos.html`, `pos app/all-product.html`, `pos app/add-product.html`, `pos app/add-production.html`, `pos app/production-history.html`, `pos app/add-production-product.html`, `pos app/settings.html`.
- **Scripts**: 
  - `pos app/main.js`: Main Electron process and auto-update IPC coordinator.
  - `pos app/script/api.js`: Handles API calls to backend with IndexedDB caching and optimistic updates.
  - `pos app/script/auth.js`: Handles user authentication and security.
- **Templates**: Reusable UI components (`pos app/template/sidebar/`, `pos app/template/topbar/`) and layout manager (`pos app/template/layout.js`).
- **Build/Release**: `npm run build:pos` or `npm --prefix "pos app" run build`.

**2. Customer Portal & E-Commerce (`customer+e-com/`)**
- **Type**: 2-in-1 Customer Account Portal + Online Storefront.
- **Security**: Public read-only catalog (`/api/ecommerce/products`), server-validated checkout (`/api/ecommerce/order`).

**3. Delivery Portal (`delivery/`)**
- **Type**: Logistics and delivery driver dispatch web application.
- **Features**: Driver assignments, order route tracking, and OTP verification upon delivery.

**Backend: Cloudflare Functions / Workers (D1 Database)**
- **Type**: Serverless API.
- **Location**: `backend/functions/api/`
- **Database**: SQLite using Cloudflare D1 (`context.env.DB`).
- **Core Tables**: `users`, `products`, `productions`, `customers`, `sales`, `purchases`, `deleted_products`.
- **Key Modules**:
  - `auth/`: Handles session, login, and registration.
  - `database/`: Dynamic microservices (`add.js`, `read.js`, `update.js`, `delete.js`, `data-manager.js`).
  - `mail/`: Email logic queue.
  - `cron/`: Scheduled tasks (e.g. 48h purge of soft-deleted products).
- **more details**: [see](backend/before-action-read-me.md)
---
---
## Official GitHub Repositories (`barodacomputerandsales`)
- **1. Desktop POS App (`pos app/`)**: https://github.com/barodacomputerandsales/pos
- **2. Customer Portal & E-Commerce (`customer+e-com/`)**: https://github.com/barodacomputerandsales/e-com-customer-portal
- **3. Delivery Portal (`delivery/`)**: https://github.com/barodacomputerandsales/delivery
- **4. Backend Serverless API (`backend/`)**: https://github.com/barodacomputerandsales/backend
- **Live Backend Serverless API**: https://backend.bcs.bcsdeveloper.com/api
- **API Master Key**: `backend-bcs-pos` (`x-api-key` header)

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
  - `electron-updater` monitors GitHub Releases for `Indranilsaha7/bcs.windows.app`.
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

### Custom Domain Email System (No @gmail.com)
The backend email pipeline (`mail/queue.js` and `cron/daily-report.js`) uses your professional custom domain emails:

- **Cloudflare Environment Variables**:
  - `FROM_EMAIL`: Custom sender address (e.g. `support@bcsdeveloper.com`, `reports@bcs.bcsdeveloper.com`).
  - `FROM_NAME`: Official sender display name (`Baroda Computers And Sales`).
  - `ADMIN_EMAIL`: Custom domain administrator recipient for daily reports (e.g. `admin@bcsdeveloper.com`).
  - `REPLY_TO`: Custom domain reply-to address (e.g. `support@bcsdeveloper.com`).
  - `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`: Google Workspace OAuth credentials with custom domain alias permission.
- **Rule**: All email headers (`From`, `Reply-To`, `To`) are sanitized and dynamically driven by environment variables. No `@gmail.com` addresses are hardcoded in application code.

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
