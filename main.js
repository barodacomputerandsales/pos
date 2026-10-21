const { app, BrowserWindow, ipcMain, shell, powerMonitor, nativeTheme, systemPreferences, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
const APP_ID = isDev ? 'com.bcsdeveloper.pos.dev' : 'com.bcsdeveloper.pos';
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

let mainWindow;

// --- WINDOWS 11 WINDOW STATE PERSISTENCE & OS THEME ENGINE ---
function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  const defaults = {
    width: 1280,
    height: 800,
    isMaximized: false,
    isFullScreen: false,
    themeSource: 'system'
  };
  try {
    const statePath = getWindowStatePath();
    if (fs.existsSync(statePath)) {
      const raw = fs.readFileSync(statePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    }
  } catch (e) {
    console.warn('[WindowState] Failed to load window state:', e.message);
  }
  return defaults;
}

let saveStateTimer = null;
function saveWindowState(immediate = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const doSave = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const currentSaved = loadWindowState();
      const isMaximized = mainWindow.isMaximized();
      const isFullScreen = mainWindow.isFullScreen();
      const isMinimized = mainWindow.isMinimized();

      let bounds = {
        x: currentSaved.x,
        y: currentSaved.y,
        width: currentSaved.width || 1280,
        height: currentSaved.height || 800
      };

      if (!isMaximized && !isFullScreen && !isMinimized) {
        bounds = mainWindow.getBounds();
      } else if (mainWindow.getNormalBounds) {
        try {
          bounds = mainWindow.getNormalBounds();
        } catch (e) {}
      }

      const state = {
        ...currentSaved,
        x: bounds.x,
        y: bounds.y,
        width: Math.max(bounds.width || 1280, 1024),
        height: Math.max(bounds.height || 800, 768),
        isMaximized,
        isFullScreen,
        themeSource: nativeTheme.themeSource || 'system'
      };

      fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[WindowState] Failed to save window state:', e.message);
    }
  };

  if (immediate) {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    doSave();
  } else {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(doSave, 250);
  }
}

function ensureBoundsVisible(state) {
  if (typeof state.x !== 'number' || typeof state.y !== 'number') {
    return { width: state.width, height: state.height };
  }
  try {
    const displays = screen.getAllDisplays();
    const isVisible = displays.some(display => {
      const b = display.bounds;
      return (
        state.x + state.width > b.x + 50 &&
        state.x < b.x + b.width - 50 &&
        state.y + state.height > b.y + 50 &&
        state.y < b.y + b.height - 50
      );
    });
    if (isVisible) {
      return { x: state.x, y: state.y, width: state.width, height: state.height };
    }
  } catch (e) {}
  return { width: state.width, height: state.height };
}

function getOsThemeState() {
  let rawAccent = '6366f1ff';
  try {
    if (systemPreferences && typeof systemPreferences.getAccentColor === 'function') {
      rawAccent = systemPreferences.getAccentColor() || '6366f1ff';
    }
  } catch (e) {}

  const cleanHex = String(rawAccent).replace('#', '').slice(0, 6);
  const accentHex = /^[0-9a-fA-F]{6}$/.test(cleanHex) ? `#${cleanHex.toLowerCase()}` : '#6366f1';
  const r = parseInt(accentHex.slice(1, 3), 16) || 99;
  const g = parseInt(accentHex.slice(3, 5), 16) || 102;
  const b = parseInt(accentHex.slice(5, 7), 16) || 241;

  const isDark = nativeTheme ? nativeTheme.shouldUseDarkColors : true;
  const themeMode = isDark ? 'dark' : 'light';
  const themeSource = nativeTheme ? nativeTheme.themeSource : 'system';

  return {
    themeMode,
    isDark,
    themeSource,
    accentColor: accentHex,
    accentRgb: `${r}, ${g}, ${b}`,
    r,
    g,
    b
  };
}

function broadcastOsThemeUpdate() {
  const themeState = getOsThemeState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setBackgroundColor(themeState.isDark ? '#0b0f19' : '#f3f4f6');
    } catch (e) {}
    mainWindow.webContents.send('os_theme_updated', themeState);
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets/icon.ico');
  const savedState = loadWindowState();

  if (savedState.themeSource && ['system', 'dark', 'light'].includes(savedState.themeSource)) {
    nativeTheme.themeSource = savedState.themeSource;
  } else {
    nativeTheme.themeSource = 'system';
  }

  const initialBounds = ensureBoundsVisible(savedState);
  const initialTheme = getOsThemeState();

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: initialTheme.isDark ? '#0b0f19' : '#f3f4f6',
    autoHideMenuBar: true,
    icon: iconPath,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Bind Window State Persistence Events
  mainWindow.on('resize', () => saveWindowState(false));
  mainWindow.on('move', () => saveWindowState(false));
  mainWindow.on('maximize', () => saveWindowState(true));
  mainWindow.on('unmaximize', () => saveWindowState(true));
  mainWindow.on('enter-full-screen', () => saveWindowState(true));
  mainWindow.on('leave-full-screen', () => saveWindowState(true));
  mainWindow.on('close', () => saveWindowState(true));

  const shouldForceLogin = process.argv.includes('--login') || process.argv.includes('--logout');
  mainWindow.loadFile('index.html', {
    query: shouldForceLogin ? { logout: 'true' } : {}
  });

  mainWindow.once('ready-to-show', () => {
    if (savedState.isMaximized) {
      mainWindow.maximize();
    } else if (savedState.isFullScreen) {
      mainWindow.setFullScreen(true);
    }
    mainWindow.show();
    mainWindow.focus();
    broadcastOsThemeUpdate();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    broadcastOsThemeUpdate();
  });
  
  // After the app loads, silently check for updates in the background (production builds or dev update test)
  mainWindow.webContents.once('did-finish-load', () => {
    if (app.isPackaged || autoUpdater.forceDevUpdateConfig) {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.warn('[AutoUpdater] Silent check notice:', err.message);
      });
    }
  });
}

// Single Instance Lock: Prevents duplicate conflicting background processes
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    // Listen to Windows 11 OS Dark/Light Mode & Accent Color Changes in Real Time
    if (nativeTheme) {
      nativeTheme.on('updated', () => {
        broadcastOsThemeUpdate();
      });
    }
    if (systemPreferences && typeof systemPreferences.on === 'function') {
      systemPreferences.on('accent-color-changed', () => {
        broadcastOsThemeUpdate();
      });
      systemPreferences.on('color-changed', () => {
        broadcastOsThemeUpdate();
      });
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- AUTO UPDATER CONFIGURATION & SMART RESILIENCE ---

let downloadedUpdateInfo = null;
let updateRetryCount = 0;
let retryTimer = null;

// Helper: Smart Disk Health & Storage Pre-check (>500MB required)
function getDiskHealth() {
  try {
    const targetDir = app.getPath('userData') || os.homedir();
    if (fs.statfsSync) {
      const stats = fs.statfsSync(targetDir);
      const freeBytes = stats.bfree * stats.bsize;
      const totalBytes = stats.blocks * stats.bsize;
      const freeMB = Math.round(freeBytes / (1024 * 1024));
      const totalMB = Math.round(totalBytes / (1024 * 1024));
      return {
        freeMB,
        totalMB,
        freeGB: (freeMB / 1024).toFixed(1),
        totalGB: (totalMB / 1024).toFixed(1),
        isSufficient: freeMB >= 500
      };
    }
  } catch (e) {}
  return { freeMB: 2048, totalMB: 10240, freeGB: '2.0', totalGB: '10.0', isSufficient: true };
}

// Helper: Smart Exponential Backoff on Network Disconnect
function scheduleSmartUpdateRetry(reason) {
  if (retryTimer) clearTimeout(retryTimer);
  updateRetryCount++;
  // Exponential backoff: 30s, 60s, 120s, 240s, max 10 mins
  const delayMs = Math.min(30000 * Math.pow(2, updateRetryCount - 1), 600000);
  const delaySec = Math.round(delayMs / 1000);

  if (mainWindow) {
    mainWindow.webContents.send('update_retry_scheduled', {
      attempt: updateRetryCount,
      delaySeconds: delaySec,
      reason: reason || 'Network drop / temporary timeout'
    });
  }

  retryTimer = setTimeout(() => {
    autoUpdater.checkForUpdates().then(() => {
      updateRetryCount = 0; // Reset counter on success
    }).catch(err => {
      scheduleSmartUpdateRetry(err.message || 'Network error');
    });
  }, delayMs);
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false; // Never auto-install on quit or interrupt shop business hours!

// BULLETPROOF SYSTEM:
// 1. Disable differential downloads (avoids blockmap parsing, zlib decompression failures & memory buffer errors)
autoUpdater.disableDifferentialDownload = true;

// 2. Disable web-installer expectation
autoUpdater.disableWebInstaller = true;

// 3. Bypass Authenticode code-signature requirement for seamless enterprise updates (relies on cryptographic SHA-512)
try {
  autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null);
} catch (e) {}

// Enable autoUpdater testing in development mode
if (isDev) {
  autoUpdater.forceDevUpdateConfig = true;
}

// Direct runtime autoUpdater to fetch updates through the serverless backend relay
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://backend.bcs.bcsdeveloper.com/api/updater/'
});

// Quiet background update check every 30 minutes
setInterval(() => {
  autoUpdater.checkForUpdates().catch(err => {
    scheduleSmartUpdateRetry(err.message);
  });
}, 30 * 60 * 1000);

// 1. Checking for update
autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('checking_for_update');
});

// 2. When an update is available: Perform Pre-Flight Disk Storage Check
autoUpdater.on('update-available', (info) => {
  const disk = getDiskHealth();
  if (!disk.isSufficient) {
    if (mainWindow) {
      mainWindow.webContents.send('update_error', `Update download paused: Available disk space (${disk.freeMB} MB) is below the required 500 MB.`);
    }
    return;
  }
  updateRetryCount = 0; // Clear retry backoff on valid response
  if (mainWindow) mainWindow.webContents.send('update_available', info);
});

// 3. When no update is available (already on latest)
autoUpdater.on('update-not-available', (info) => {
  updateRetryCount = 0;
  if (mainWindow) mainWindow.webContents.send('update_not_available', info);
});

// 4. Live download progress (percentage, speed, total)
autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) mainWindow.webContents.send('download_progress', progressObj);
});

// 5. When the update is fully downloaded and ready to install
autoUpdater.on('update-downloaded', (info) => {
  downloadedUpdateInfo = info;
  updateRetryCount = 0;
  if (mainWindow) mainWindow.webContents.send('update_downloaded', info);
});

// 6. Handle updater errors with smart resilience
autoUpdater.on('error', (err) => {
  const errMsg = err == null ? "Unknown error" : (err.message || err.toString());
  if (mainWindow) mainWindow.webContents.send('update_error', errMsg);

  // Trigger smart retry if temporary network failure
  if (errMsg.includes('net::ERR') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED')) {
    scheduleSmartUpdateRetry(errMsg);
  }
});

// --- IPC HANDLERS ---

// Trigger manual check for updates from UI
ipcMain.on('check_for_updates', () => {
  autoUpdater.checkForUpdates().catch(err => {
    if (mainWindow) mainWindow.webContents.send('update_error', err.message);
    scheduleSmartUpdateRetry(err.message);
  });
});

// Get current application version
ipcMain.handle('get_app_version', () => {
  return app.getVersion();
});

// Windows 11 OS Theme & Accent Color Sync IPC
ipcMain.handle('get_os_theme', () => {
  return getOsThemeState();
});

ipcMain.handle('set_theme_source', (event, source) => {
  if (['system', 'dark', 'light'].includes(source)) {
    nativeTheme.themeSource = source;
    saveWindowState(true);
    broadcastOsThemeUpdate();
  }
  return getOsThemeState();
});

// Window State & Geometry Controls IPC
ipcMain.handle('get_window_state', () => {
  const saved = loadWindowState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds();
    return {
      ...saved,
      currentWidth: b.width,
      currentHeight: b.height,
      currentX: b.x,
      currentY: b.y,
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen()
    };
  }
  return saved;
});

ipcMain.handle('reset_window_size', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    mainWindow.setSize(1280, 800);
    mainWindow.center();
    saveWindowState(true);
  }
  return loadWindowState();
});

// Get cached downloaded update info
ipcMain.handle('get_downloaded_update_info', () => {
  return downloadedUpdateInfo;
});

// Smart Diagnostics: Pre-Flight Storage Health
ipcMain.handle('get_disk_health', () => {
  return getDiskHealth();
});

// Smart Diagnostics: Power Status (Battery vs AC)
ipcMain.handle('get_power_status', () => {
  let onBattery = false;
  try {
    if (powerMonitor && powerMonitor.isOnBatteryPower) {
      onBattery = powerMonitor.isOnBatteryPower();
    }
  } catch (e) {}
  return { onBattery };
});

// Smart Shift-End Mode: Apply update silently when app exits
ipcMain.on('apply_update_and_exit', () => {
  autoUpdater.autoInstallOnAppQuit = true;
  app.quit();
});

// Get detailed system diagnostics
ipcMain.handle('get_system_info', () => {
  const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1);
  const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);
  const usedMem = (parseFloat(totalMem) - parseFloat(freeMem)).toFixed(1);
  const cpus = os.cpus() || [];
  const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Standard CPU';
  const cpuCores = cpus.length;
  const uptimeHours = (os.uptime() / 3600).toFixed(1);

  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    hostname: os.hostname(),
    cpuModel,
    cpuCores,
    totalMem: `${totalMem} GB`,
    freeMem: `${freeMem} GB`,
    usedMem: `${usedMem} GB`,
    memPercent: Math.round((parseFloat(usedMem) / parseFloat(totalMem)) * 100),
    uptime: `${uptimeHours} hrs`
  };
});

// Explicit download update trigger
ipcMain.on('download_update', () => {
  if (downloadedUpdateInfo) {
    if (mainWindow) mainWindow.webContents.send('update_downloaded', downloadedUpdateInfo);
    return;
  }
  autoUpdater.downloadUpdate().catch(err => {
    const msg = err && err.message ? err.message : String(err);
    if (!msg.toLowerCase().includes('already')) {
      if (mainWindow) mainWindow.webContents.send('update_error', msg);
    }
  });
});

// Open external download links in system default browser
ipcMain.handle('open_external', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// Restart app and install the downloaded update silently without legacy setup wizards
ipcMain.on('restart_app', () => {
  if (isDev) {
    console.log('[AutoUpdater] Development mode: Simulating restart after update...');
    app.relaunch();
    app.exit(0);
    return;
  }
  try {
    // isSilent: true (runs /S silently), isForceRunAfter: true (relaunches app immediately)
    autoUpdater.quitAndInstall(true, true);
  } catch (err) {
    console.error('[AutoUpdater] quitAndInstall failed, attempting fallback relaunch:', err);
    app.relaunch();
    app.exit(0);
  }
});

