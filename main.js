'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { searchAll } = require('./providers');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 940,
    minHeight: 620,
    title: 'ArtHunter — поиск артов',
    frame: false,
    transparent: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.on('maximize', () => win.webContents.send('window-state', true));
  win.on('unmaximize', () => win.webContents.send('window-state', false));
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('search', (_event, payload) => searchAll(payload.query, payload.sources, payload.page));

ipcMain.handle('set-opacity', (_event, value) => {
  if (win && !win.isDestroyed()) win.setOpacity(Math.max(0.3, Math.min(1, Number(value) || 1)));
});

ipcMain.handle('window-action', (_event, action) => {
  if (!win) return false;
  if (action === 'state') return win.isMaximized();
  if (action === 'min') win.minimize();
  if (action === 'max') win.isMaximized() ? win.restore() : win.maximize();
  if (action === 'close') win.close();
  return win.isMaximized();
});

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('download', async (_event, { url, name, folder }) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: new URL(url).origin + '/' },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || '';
  const ext = /\.(jpe?g|png|gif|webp|bmp)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase()
    || ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' })[type.split(';')[0]]
    || 'jpg';
  const safe = String(name || 'image').replace(/[^\p{L}\p{N} _-]/gu, '_').slice(0, 70) || 'image';
  const dir = folder && folder.trim() ? folder : path.join(app.getPath('pictures'), 'ArtHunter');
  await fs.mkdir(dir, { recursive: true });
  let target = path.join(dir, `${safe}.${ext}`);
  for (let i = 1; ; i++) {
    try {
      await fs.writeFile(target, bytes, { flag: 'wx' });
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      target = path.join(dir, `${safe} (${i}).${ext}`);
    }
  }
  return target;
});

ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));
