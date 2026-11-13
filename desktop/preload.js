/* The only bridge between the page and the desktop shell: what is
   playing goes out, play / next / previous come in. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aartiDesktop', {
  now: (state) => ipcRenderer.send('aarti:now', state),
  chrome: (colours) => ipcRenderer.send('aarti:chrome', colours),
  setMini: (on) => ipcRenderer.send('aarti:mini', !!on),
  state: () => ipcRenderer.invoke('aarti:state'),
  onControl: (fn) => ipcRenderer.on('aarti:control', (_e, action) => fn(action)),
  onMini: (fn) => ipcRenderer.on('aarti:mini', (_e, on) => fn(on)),
});
