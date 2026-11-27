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

function refererFor(url) {
  const host = new URL(url).hostname.toLowerCase();
  const rules = {
    pinimg: 'https://www.pinterest.com/',
    pinterest: 'https://www.pinterest.com/',
    artstation: 'https://www.artstation.com/',
    deviantart: 'https://www.deviantart.com/',
    wixmp: 'https://www.deviantart.com/',
    yandex: 'https://yandex.com/',
    bing: 'https://www.bing.com/',
    wikimedia: 'https://commons.wikimedia.org/'
  };
  return Object.entries(rules).find(([key]) => host.includes(key))?.[1] || `${new URL(url).origin}/`;
}

async function fetchImage(url, referer) {
  const headers = { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' };
  if (referer) headers.Referer = referer;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get('content-type') || '').split(';')[0];
  if (type.startsWith('text/')) throw new Error('сервер вернул HTML вместо картинки');
  return { bytes: Buffer.from(await res.arrayBuffer()), type };
}

async function saveImage(bytes, type, url, name, folder) {
  const ext = /\.(jpe?g|png|gif|webp|bmp)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase()
    || ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' })[type]
    || 'jpg';
  const safe = String(name || 'image').replace(/[^\p{L}\p{N} _-]/gu, '_').slice(0, 70) || 'image';
  const dir = folder && folder.trim() ? folder : path.join(app.getPath('pictures'), 'ArtHunter');
  await fs.mkdir(dir, { recursive: true });
  let target = path.join(dir, `${safe}.${ext}`);
  for (let i = 1; ; i++) {
    try {
      await fs.writeFile(target, bytes, { flag: 'wx' });
      return target;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      target = path.join(dir, `${safe} (${i}).${ext}`);
    }
  }
}

ipcMain.handle('download', async (_event, { url, name, folder }) => {
  let lastError;
  for (const referer of [refererFor(url), undefined, 'https://www.google.com/']) {
    try {
      const { bytes, type } = await fetchImage(url, referer);
      return await saveImage(bytes, type, url, name, folder);
    } catch (err) { lastError = err; }
  }
  throw lastError || new Error('не удалось скачать изображение');
});

ipcMain.handle('open-external', async (_event, url) => {
  try { await shell.openExternal(url); return true; } catch { return false; }
});
