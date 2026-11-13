/* ============================================================
   AartiMusic for Windows
   The same app as on the phone (../www), in its own window, with
   what a desktop expects around it: a tray icon that keeps the
   music going when the window is closed, play / next / previous
   on the taskbar preview, the keyboard's media keys, a mini
   player that stays on top, and an option to start with Windows.

   The pages are served from app://aarti/ rather than file://, so
   the address never changes and favourites, history and settings
   (localStorage) survive every update.
   ============================================================ */
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, protocol, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const WEB = path.join(__dirname, 'www');
const SHELL = path.join(__dirname, 'shell');
const ASSETS = path.join(__dirname, 'assets');
const ORIGIN = 'app://aarti';
const FULL = { width: 1180, height: 780, minWidth: 420, minHeight: 600 };
const MINI = { width: 380, height: 600 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.setAppUserModelId('com.aartimusic.desktop');

/* ---------- settings kept between runs ---------------------- */
const settingsFile = () => path.join(app.getPath('userData'), 'desktop.json');
let settings = { bounds: null, maximized: false, mini: false, closeToTray: true, trayHintShown: false };
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch (_) {}
}
let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (_) {}
  }, 300);
}

/* ---------- state ------------------------------------------- */
let win = null, tray = null, quitting = false;
let now = { title: '', artist: '', playing: false, has: false };
const icon = (name) => nativeImage.createFromPath(path.join(ASSETS, name));
const send = (action) => { if (win && !win.isDestroyed()) win.webContents.send('aarti:control', action); };

function show() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

/* A saved position is only used if it is still on a screen: the
   second monitor it was on may be gone. */
function usable(b) {
  if (!b || !(b.width > 0) || !(b.height > 0)) return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 80;
  });
}

function createWindow() {
  const b = usable(settings.bounds) ? settings.bounds : {};
  win = new BrowserWindow({
    ...FULL, ...(settings.mini ? MINI : b),
    ...(settings.mini && usable(settings.bounds) ? { x: b.x, y: b.y } : {}),
    show: false,
    backgroundColor: '#0b0c0e',
    title: 'AartiMusic',
    icon: icon('icon.png'),
    autoHideMenuBar: true,
    // The window's own buttons sit over the page, in the app's colour.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0c0e', symbolColor: '#f5f5f4', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,          // the song keeps time while minimised
    },
  });
  win.removeMenu();
  if (settings.mini) win.setAlwaysOnTop(true, 'floating');
  else if (settings.maximized) win.maximize();

  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });

  const remember = () => {
    if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    settings.maximized = win.isMaximized();
    if (!settings.maximized && !settings.mini) settings.bounds = win.getBounds();
    else if (settings.mini) { const p = win.getBounds(); settings.bounds = { ...(settings.bounds || FULL), x: p.x, y: p.y }; }
    saveSettings();
  };
  win.on('resize', remember); win.on('move', remember);
  win.on('maximize', remember); win.on('unmaximize', remember);

  // Closing the window leaves the music playing, from the tray.
  win.on('close', (e) => {
    if (quitting || !settings.closeToTray) return;
    e.preventDefault(); win.hide();
    if (!settings.trayHintShown && tray && process.platform === 'win32') {
      settings.trayHintShown = true; saveSettings();
      tray.displayBalloon({ iconType: 'info', title: 'AartiMusic is still playing',
        content: 'It lives in the tray, next to the clock. Right-click it to quit.' });
    }
  });
  win.on('closed', () => { win = null; });

  // Links (Telegram, a browser page) open outside; the app never leaves app://.
  const outside = (url) => { if (/^(https?|tg|mailto):/i.test(url)) shell.openExternal(url).catch(() => {}); };
  win.webContents.setWindowOpenHandler(({ url }) => { outside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) { e.preventDefault(); outside(url); } });

  // The desktop layer goes on top of the unchanged phone pages.
  win.webContents.on('dom-ready', () => {
    try {
      win.webContents.insertCSS(fs.readFileSync(path.join(SHELL, 'desktop.css'), 'utf8'));
      win.webContents.executeJavaScript(fs.readFileSync(path.join(SHELL, 'desktop.js'), 'utf8')).catch(() => {});
    } catch (_) {}
  });

  win.loadURL(ORIGIN + '/index.html');
  thumbar();
}

/* ---------- taskbar preview buttons and the tray ------------- */
function thumbar() {
  if (!win || process.platform !== 'win32') return;
  try {
    win.setThumbarButtons([
      { tooltip: 'Previous', icon: icon('tb-prev.png'), flags: now.has ? [] : ['disabled'], click: () => send('prev') },
      { tooltip: now.playing ? 'Pause' : 'Play', icon: icon(now.playing ? 'tb-pause.png' : 'tb-play.png'), flags: now.has ? [] : ['disabled'], click: () => send('toggle') },
      { tooltip: 'Next', icon: icon('tb-next.png'), flags: now.has ? [] : ['disabled'], click: () => send('next') },
    ]);
  } catch (_) {}
}

function trayMenu() {
  const login = app.getLoginItemSettings();
  return Menu.buildFromTemplate([
    { label: now.has ? (now.title || 'AartiMusic').slice(0, 60) : 'Nothing playing', enabled: false },
    ...(now.has && now.artist ? [{ label: now.artist.slice(0, 60), enabled: false }] : []),
    { type: 'separator' },
    { label: now.playing ? 'Pause' : 'Play', enabled: now.has, click: () => send('toggle') },
    { label: 'Next', enabled: now.has, click: () => send('next') },
    { label: 'Previous', enabled: now.has, click: () => send('prev') },
    { type: 'separator' },
    { label: 'Open AartiMusic', click: show },
    { label: 'Mini player (stays on top)', type: 'checkbox', checked: settings.mini, click: (i) => setMini(i.checked) },
    { type: 'separator' },
    { label: 'Keep playing in the tray when closed', type: 'checkbox', checked: settings.closeToTray,
      click: (i) => { settings.closeToTray = i.checked; saveSettings(); } },
    { label: 'Start with Windows', type: 'checkbox', checked: login.openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'Quit AartiMusic', click: () => { quitting = true; app.quit(); } },
  ]);
}

function refreshTray() {
  if (!tray) return;
  tray.setToolTip(now.has ? `${now.title}${now.artist ? ' · ' + now.artist : ''}`.slice(0, 120) : 'AartiMusic');
  tray.setContextMenu(trayMenu());
}

function createTray() {
  tray = new Tray(icon('tray.png'));
  tray.on('click', () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else show(); });
  refreshTray();
}

/* ---------- mini player ------------------------------------- */
function setMini(on) {
  if (!win) return;
  settings.mini = !!on;
  if (on) {
    if (win.isMaximized()) win.unmaximize();
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    win.setMinimumSize(340, 480);
    win.setBounds({ width: MINI.width, height: MINI.height,
      x: area.x + area.width - MINI.width - 24, y: area.y + area.height - MINI.height - 24 }, true);
    win.setAlwaysOnTop(true, 'floating');
  } else {
    win.setAlwaysOnTop(false);
    win.setMinimumSize(FULL.minWidth, FULL.minHeight);
    const b = usable(settings.bounds) && settings.bounds.width >= FULL.minWidth ? settings.bounds : null;
    if (b) win.setBounds(b, true); else { win.setSize(FULL.width, FULL.height, true); win.center(); }
  }
  saveSettings(); refreshTray();
  win.webContents.send('aarti:mini', settings.mini);
  show();
}

/* ---------- what the page tells us --------------------------- */
ipcMain.on('aarti:now', (_e, state) => {
  if (!state || typeof state !== 'object') return;
  const next = { title: String(state.title || '').slice(0, 200), artist: String(state.artist || '').slice(0, 200),
                 playing: !!state.playing, has: !!state.has };
  const changed = JSON.stringify(next) !== JSON.stringify(now);
  now = next;
  if (!changed) return;
  if (win && !win.isDestroyed()) win.setTitle(now.has ? `${now.title} · AartiMusic` : 'AartiMusic');
  thumbar(); refreshTray();
});
ipcMain.on('aarti:chrome', (_e, c) => {
  // The window buttons take the colour of the theme in use.
  if (!win || win.isDestroyed() || !c || process.platform !== 'win32') return;
  const hex = /^#[0-9a-f]{6}$/i;
  if (hex.test(c.color) && hex.test(c.symbol)) { try { win.setTitleBarOverlay({ color: c.color, symbolColor: c.symbol, height: 36 }); } catch (_) {} }
});
ipcMain.on('aarti:mini', (_e, on) => setMini(!!on));
ipcMain.handle('aarti:state', () => ({ mini: settings.mini, version: app.getVersion() }));

/* ---------- start ------------------------------------------- */
app.on('second-instance', show);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(() => {
  loadSettings();
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(WEB, rel));
    // Nothing outside the app's own pages is ever served.
    if (!file.startsWith(WEB + path.sep)) return new Response('Not found', { status: 404 });
    // Read here rather than handed to file://, so it works the same
    // from inside the packed app.
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, { headers: { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (_) { return new Response('Not found', { status: 404 }); }
  });
  createWindow();
  createTray();
});
