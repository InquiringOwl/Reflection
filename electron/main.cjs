// Reflection — Electron main process ("shell").
// Serves the application over a private, secure "app://" scheme so AudioWorklet / Worker
// modules load from a real origin (file:// blocks module workers). The served directory is
// either the built-in dist/ or a newer signed web bundle installed by the updater.
// No network services, no hardware/stimulation access.
const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { Updater } = require('./updater.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const BUILTIN = path.join(__dirname, '..', 'dist');
let win = null;
let updater = null;

const sendStatus = (info) => { if (win && !win.isDestroyed()) win.webContents.send('updater:status', info); };

function createWindow() {
  win = new BrowserWindow({
    width: 1680,
    height: 1050,
    minWidth: 1280,
    minHeight: 780,
    backgroundColor: '#040a13',
    title: 'Reflection',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadURL('app://reflection/index.html');
  updater.armReadyWatchdog(() => win.reload());
  // A downloaded bundle that crashes or fails to load is rolled back automatically.
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (updater.activeVersion && url.startsWith('app://')) updater.markBad(updater.activeVersion, `failed to load (${desc})`, () => win.reload());
  });
  win.webContents.on('render-process-gone', () => {
    if (updater.activeVersion) updater.markBad(updater.activeVersion, 'crashed', () => win.reload());
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
}

async function menuCheck() {
  const info = await updater.check(true);
  const msg = {
    'up-to-date': `Reflection ${info.webVersion} is up to date.`,
    ready: `Version ${info.available?.version} has been downloaded. Use “Reload to update” in the top bar.`,
    'shell-required': `Version ${info.available?.version} needs a new app download (shell ${info.available?.minShell}).`,
    error: `Could not check for updates: ${info.error}`,
  }[info.status] || `Status: ${info.status}`;
  dialog.showMessageBox(win, { message: 'Check for Updates', detail: msg, buttons: info.status === 'shell-required' ? ['Open download page', 'Later'] : ['OK'] })
    .then((r) => { if (info.status === 'shell-required' && r.response === 0) updater.openShellDownload(); });
}

app.whenReady().then(() => {
  updater = new Updater({ builtinDir: BUILTIN, onStatus: sendStatus });

  protocol.handle('app', (req) => {
    const root = updater.currentDir();
    const { pathname } = new URL(req.url);
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  ipcMain.handle('updater:info', () => updater.info());
  ipcMain.handle('updater:check', () => updater.check(true));
  ipcMain.handle('updater:apply', () => {
    if (!updater.apply()) return false;
    updater.armReadyWatchdog(() => win.reload()); // roll back + reload if the new version does not start
    win.reload();
    return true;
  });
  ipcMain.handle('updater:openShellDownload', () => updater.openShellDownload());
  ipcMain.on('updater:ready', () => updater.rendererReady());

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [
      { role: 'about' },
      { label: 'Check for Updates…', click: menuCheck },
      { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ] },
    { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  createWindow();
  updater.start();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
