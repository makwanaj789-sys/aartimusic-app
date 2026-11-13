/* ============================================================
   SETUP
   The installer and the uninstaller are the app itself, wearing
   its own window instead of a stock installer's.

   AartiMusic-Setup.exe is the app packed as a self-extracting
   file. Run that way (PORTABLE_EXECUTABLE_FILE is set), it shows
   the setup window, copies itself to the install folder, makes
   the shortcuts and tells Windows how to remove it. Started as
   "AartiMusic.exe --uninstall" it shows the removal window.

   Everything is per-user: no administrator prompt, nothing
   written outside the user's own profile.
   ============================================================ */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
// Electron's fs treats app.asar as a folder; the copy needs the real file.
const fs = require('original-fs');

const NAME = 'AartiMusic';
const EXE = NAME + '.exe';
const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + NAME;
const WIN = process.platform === 'win32';
const AUTO = process.env.AARTI_SETUP_AUTO === '1';      // no window: for the build's own check

const mode = () => process.argv.includes('--uninstall') ? 'uninstall'
  : process.env.PORTABLE_EXECUTABLE_FILE || process.env.AARTI_SETUP_DEMO === '1' ? 'install' : null;

const defaultDir = () => process.env.AARTI_SETUP_DIR ||
  path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', NAME);
const desktopLink = () => path.join(app.getPath('desktop'), NAME + '.lnk');
const menuLink = () => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', NAME + '.lnk');
// Where the installed app keeps favourites and settings (not this run's temporary profile).
const dataDir = () => path.join(app.getPath('appData'), NAME);

const run = (file, args) => new Promise((done) => execFile(file, args, { windowsHide: true }, (err, out) => done({ ok: !err, out: String(out || '') })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reg = (...args) => WIN ? run('reg', args) : Promise.resolve({ ok: true, out: '' });

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push({ rel: path.relative(base, full), size: fs.statSync(full).size });
  }
  return out;
}

/* A file of the running app cannot be replaced: wait for the old
   one to close rather than fail on the first locked file. */
async function copyFile(from, to) {
  for (let attempt = 0; ; attempt++) {
    try { fs.copyFileSync(from, to); return; }
    catch (e) {
      if (attempt >= 20 || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e;
      await sleep(400);
    }
  }
}

async function closeInstalled(dir) {
  if (!WIN) return;
  // An older copy that does not know how to be asked: stop it by its folder.
  const safe = dir.replace(/'/g, "''");
  await run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-Process -Name '${NAME}' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${safe}', [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force`]);
}

async function install(opts, progress) {
  const source = process.env.AARTI_SETUP_SOURCE || path.dirname(process.execPath);
  const dir = path.resolve(opts.dir || defaultDir());
  if (path.resolve(source) === dir) throw new Error('Setup is already running from that folder.');
  progress(0, 'Preparing');

  // The first build shipped with a stock installer; let it take its own entry away.
  const old = path.join(dir, 'Uninstall ' + NAME + '.exe');
  if (WIN && fs.existsSync(old)) { await run(old, ['/S', '_?=' + dir]); try { fs.rmSync(old, { force: true }); } catch (_) {} }
  await closeInstalled(dir);

  const files = walk(source);
  const total = files.reduce((n, f) => n + f.size, 0) || 1;
  let done = 0;
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    const to = path.join(dir, f.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    await copyFile(path.join(source, f.rel), to);
    done += f.size;
    progress(Math.min(0.92, done / total * 0.92), 'Copying files');
  }

  const exe = path.join(dir, WIN ? EXE : path.basename(process.execPath));
  progress(0.94, 'Creating shortcuts');
  if (WIN) {
    const link = { target: exe, cwd: dir, icon: exe, iconIndex: 0, appUserModelId: 'com.aartimusic.desktop', description: 'AartiMusic' };
    try { fs.mkdirSync(path.dirname(menuLink()), { recursive: true }); shell.writeShortcutLink(menuLink(), 'create', link); } catch (_) {}
    if (opts.desktop !== false) { try { shell.writeShortcutLink(desktopLink(), 'create', link); } catch (_) {} }
    else { try { fs.rmSync(desktopLink(), { force: true }); } catch (_) {} }
    try { app.setLoginItemSettings({ openAtLogin: !!opts.startup, path: exe, args: ['--hidden'] }); } catch (_) {}

    progress(0.97, 'Registering with Windows');
    const set = (name, type, value) => reg('add', KEY, '/v', name, '/t', type, '/d', String(value), '/f');
    await set('DisplayName', 'REG_SZ', NAME);
    await set('DisplayVersion', 'REG_SZ', app.getVersion());
    await set('Publisher', 'REG_SZ', NAME);
    await set('DisplayIcon', 'REG_SZ', exe + ',0');
    await set('InstallLocation', 'REG_SZ', dir);
    await set('UninstallString', 'REG_SZ', `"${exe}" --uninstall`);
    await set('NoModify', 'REG_DWORD', 1);
    await set('NoRepair', 'REG_DWORD', 1);
    await set('EstimatedSize', 'REG_DWORD', Math.round(total / 1024));
  }
  progress(1, 'Done');
  return { dir, exe, files: files.length, bytes: total };
}

function launch(exe) {
  // The installed copy must not think it is the setup file.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(PORTABLE_EXECUTABLE_|AARTI_SETUP_)/.test(k)) delete env[k];
  try { spawn(exe, [], { detached: true, stdio: 'ignore', env, cwd: path.dirname(exe) }).unref(); } catch (_) {}
}

async function uninstall(opts, progress) {
  const dir = path.dirname(process.execPath);
  progress(0.1, 'Removing shortcuts');
  for (const link of [desktopLink(), menuLink()]) { try { fs.rmSync(link, { force: true }); } catch (_) {} }
  try { app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, args: ['--hidden'] }); } catch (_) {}
  progress(0.4, 'Removing from Windows');
  await reg('delete', KEY, '/f');
  if (opts.data) { progress(0.6, 'Removing your data'); try { fs.rmSync(dataDir(), { recursive: true, force: true }); } catch (_) {} }
  progress(1, 'Done');
  return { dir };
}

/* The folder cannot be removed by a program still running from it:
   a small command waits for this one to end, then removes it, trying
   again for a few seconds while Windows lets go of the files.
   The command line is passed exactly as written: left to itself, Node
   escapes the quotes around the folder in a way cmd does not read. */
function removeFolderAfterExit(dir) {
  if (!WIN || !app.isPackaged) return;
  const d = `"${dir}"`;
  const line = `ping -n 3 127.0.0.1 >nul & for /l %i in (1,1,10) do (if exist ${d} (rmdir /s /q ${d} 2>nul & ping -n 2 127.0.0.1 >nul))`;
  try {
    spawn('cmd.exe', ['/d', '/s', '/c', `"${line}"`],
      { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, cwd: os.tmpdir() }).unref();
  } catch (_) {}
}

/* ---------- starting ---------------------------------------- */
function start(which) {
  // Ask a running AartiMusic to close, so its files can be replaced or removed.
  const first = app.requestSingleInstanceLock({ quit: true });
  if (first) app.releaseSingleInstanceLock();
  // Setup keeps its own throwaway profile: the app's is left alone.
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'aartimusic-setup-')));

  const result = (data) => { if (process.env.AARTI_SETUP_RESULT) { try { fs.writeFileSync(process.env.AARTI_SETUP_RESULT, JSON.stringify(data)); } catch (_) {} } };

  app.whenReady().then(async () => {
    if (!first) await sleep(1500);

    if (AUTO) {
      try {
        if (which === 'install') { const r = await install({ desktop: true, startup: false }, () => {}); result({ ok: true, ...r }); }
        else { const r = await uninstall({ data: process.env.AARTI_SETUP_DATA === '1' }, () => {}); result({ ok: true, ...r }); removeFolderAfterExit(r.dir); }
        app.exit(0);
      } catch (e) { result({ ok: false, error: String(e && e.message || e) }); app.exit(1); }
      return;
    }

    const win = new BrowserWindow({
      width: 860, height: 540, resizable: false, maximizable: false, fullscreenable: false,
      frame: false, show: false, backgroundColor: '#080503', title: which === 'install' ? 'AartiMusic Setup' : 'Remove AartiMusic',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'setup', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.removeMenu();
    win.once('ready-to-show', () => win.show());
    let installed = null, removed = null, busy = false;
    const progress = (value, label) => { if (!win.isDestroyed()) win.webContents.send('setup:progress', { value, label }); };

    ipcMain.handle('setup:info', () => ({ mode: which, version: app.getVersion(), dir: which === 'install' ? defaultDir() : path.dirname(process.execPath) }));
    ipcMain.handle('setup:folder', async (_e, current) => {
      const r = await dialog.showOpenDialog(win, { title: 'Choose where to install AartiMusic', defaultPath: current, properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return null;
      const picked = r.filePaths[0];
      return path.basename(picked).toLowerCase() === NAME.toLowerCase() ? picked : path.join(picked, NAME);
    });
    ipcMain.handle('setup:install', async (_e, opts) => {
      if (busy) return { ok: false, error: 'Already working.' };
      busy = true;
      try { installed = await install(opts || {}, progress); return { ok: true, dir: installed.dir }; }
      catch (e) { return { ok: false, error: String(e && e.message || e) }; }
      finally { busy = false; }
    });
    ipcMain.handle('setup:uninstall', async (_e, opts) => {
      if (busy) return { ok: false, error: 'Already working.' };
      busy = true;
      try { removed = await uninstall(opts || {}, progress); return { ok: true }; }
      catch (e) { return { ok: false, error: String(e && e.message || e) }; }
      finally { busy = false; }
    });
    ipcMain.on('setup:finish', (_e, open) => {
      if (installed && open) launch(installed.exe);
      if (removed) removeFolderAfterExit(removed.dir);
      app.exit(0);
    });
    ipcMain.on('setup:close', () => { if (!busy) { if (removed) removeFolderAfterExit(removed.dir); app.exit(0); } });
    win.on('close', (e) => { if (busy) e.preventDefault(); });
    app.on('window-all-closed', () => app.exit(0));

    win.loadFile(path.join(__dirname, 'setup', 'setup.html'));
  });
}

module.exports = { mode, start };
