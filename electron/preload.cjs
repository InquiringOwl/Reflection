// Minimal, explicit bridge between the sandboxed page and the updater. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reflectionUpdater', {
  info: () => ipcRenderer.invoke('updater:info'),
  check: () => ipcRenderer.invoke('updater:check'),
  apply: () => ipcRenderer.invoke('updater:apply'),
  openShellDownload: () => ipcRenderer.invoke('updater:openShellDownload'),
  ready: () => ipcRenderer.send('updater:ready'),
  onStatus: (cb) => {
    const h = (_e, info) => cb(info);
    ipcRenderer.on('updater:status', h);
    return () => ipcRenderer.removeListener('updater:status', h);
  },
});
