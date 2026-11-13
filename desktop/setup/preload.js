/* The setup window's only way to the installer. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('setup', {
  info: () => ipcRenderer.invoke('setup:info'),
  folder: (current) => ipcRenderer.invoke('setup:folder', current),
  install: (opts) => ipcRenderer.invoke('setup:install', opts),
  uninstall: (opts) => ipcRenderer.invoke('setup:uninstall', opts),
  finish: (open) => ipcRenderer.send('setup:finish', !!open),
  close: () => ipcRenderer.send('setup:close'),
  onProgress: (fn) => ipcRenderer.on('setup:progress', (_e, p) => fn(p)),
});
