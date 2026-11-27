'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  search: payload => ipcRenderer.invoke('search', payload),
  download: payload => ipcRenderer.invoke('download', payload),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  windowAction: action => ipcRenderer.invoke('window-action', action),
  setOpacity: value => ipcRenderer.invoke('set-opacity', value),
  onWindowState: callback => ipcRenderer.on('window-state', (_event, value) => callback(value))
});
