const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#212529',
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  
  // After the app loads, silently check for updates in the background
  mainWindow.webContents.once('did-finish-load', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- AUTO UPDATER CONFIGURATION & EVENTS ---

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Direct runtime autoUpdater to fetch updates through the serverless backend relay
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://backend.bcs.bcsdeveloper.com/api/updater'
});

// 1. Checking for update
autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('checking_for_update');
});

// 2. When an update is available (starts downloading)
autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update_available', info);
});

// 3. When no update is available (already on latest)
autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update_not_available', info);
});

// 4. Live download progress (percentage, speed, total)
autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) mainWindow.webContents.send('download_progress', progressObj);
});

// 5. When the update is fully downloaded and ready to install
autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('update_downloaded', info);
});

// 6. Handle updater errors
autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('update_error', err == null ? "Unknown error" : (err.message || err.toString()));
});

// --- IPC HANDLERS ---

// Trigger manual check for updates from UI
ipcMain.on('check_for_updates', () => {
  autoUpdater.checkForUpdates().catch(err => {
    if (mainWindow) mainWindow.webContents.send('update_error', err.message);
  });
});

// Get current application version
ipcMain.handle('get_app_version', () => {
  return app.getVersion();
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

// Restart app and install the downloaded update
ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

