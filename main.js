const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#212529',
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
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
  };
});

// Restart app and install the downloaded update
ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

