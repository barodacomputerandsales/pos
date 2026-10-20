const { app, BrowserWindow, ipcMain, shell, powerMonitor } = require('electron');
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

function createWindow() {
  const iconPath = path.join(__dirname, 'assets/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#06080f',
    icon: iconPath,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const shouldForceLogin = process.argv.includes('--login') || process.argv.includes('--logout');
  mainWindow.loadFile('index.html', {
    query: shouldForceLogin ? { logout: 'true' } : {}
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  
  // After the app loads, silently check for updates in the background (production builds)
  mainWindow.webContents.once('did-finish-load', () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
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

// Direct runtime autoUpdater to fetch updates through the serverless backend relay
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://backend.bcs.bcsdeveloper.com/api/updater'
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
  autoUpdater.downloadUpdate().catch(err => {
    if (mainWindow) mainWindow.webContents.send('update_error', err.message);
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
  // isSilent: true (runs /S silently), isForceRunAfter: true (relaunches app immediately)
  autoUpdater.quitAndInstall(true, true);
});

