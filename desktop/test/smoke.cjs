/* Starts the real desktop app (Electron) against a stand-in server and
   checks the desktop layer: the bar, the centred player, the keyboard,
   the tray/taskbar link and the mini player. From the repo root:
     xvfb-run -a node desktop/test/smoke.cjs        (Linux)
     node desktop/test/smoke.cjs                    (Windows) */
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const dir = path.resolve(__dirname, '..');
const shots = path.resolve(dir, '../test-results'); fs.mkdirSync(shots, { recursive: true });
const svg = c => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${c}"/><circle cx="80" cy="40" r="30" fill="#f0a020"/></svg>`;
function wav() { const n = 8000 * 30, b = Buffer.alloc(44 + n); b.write('RIFF'); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44); return b; }
const song = (n) => ({ id: 'song' + String(n).padStart(7, '0'), title: 'Kesariya Tera Ishq ' + n, artist: 'Arijit Singh', duration: 200, thumb: 'https://img.aarti.test/' + ['7a1fa8', '127a5c', 'a81f3c'][n % 3] + '.svg' });
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aarti-desk-'));
  // AARTI_EXE points at a built app (dist/.../AartiMusic.exe) to test the packed one.
  const packed = process.env.AARTI_EXE;
  const app = await electron.launch({ executablePath: packed || require(path.join(dir, 'node_modules/electron')),
    args: [...(packed ? [] : [dir]), '--no-sandbox', '--user-data-dir=' + userData], cwd: dir });
  const errors = [];
  try {
    const ctx = app.context();
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url()); const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (url.protocol === 'app:') return route.continue();
      if (url.pathname.endsWith('/server.json')) return route.fulfill({ json: { server: 'https://api.aarti.test' }, headers });
      if (url.hostname === 'img.aarti.test') return route.fulfill({ body: svg('#' + url.pathname.slice(1, 7)), contentType: 'image/svg+xml', headers });
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname === '/api/search') return route.fulfill({ json: { results: Array.from({ length: 8 }, (_, i) => song(i + 1)) }, headers });
      if (url.pathname.startsWith('/api/stream/')) {
        const bytes = wav(), range = route.request().headers()['range'], m = range && /^bytes=(\d+)-(\d*)$/.exec(range);
        if (m) { const a = +m[1], b = m[2] ? Math.min(+m[2], bytes.length - 1) : bytes.length - 1; return route.fulfill({ status: 206, body: bytes.subarray(a, b + 1), contentType: 'audio/wav', headers: { ...headers, 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${bytes.length}` } }); }
        return route.fulfill({ body: bytes, contentType: 'audio/wav', headers: { ...headers, 'accept-ranges': 'bytes' } });
      }
      return route.fulfill({ status: 404, json: {}, headers });
    });
    const page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => localStorage.setItem('aarti.profile.v1', JSON.stringify({ name: 'Ajay', languages: ['Hindi'], artists: ['Arijit Singh'] })));
    await page.reload();
    await page.waitForSelector('.desk-bar');
    // 1. Served from a fixed address, with the desktop layer on.
    assert.equal(await page.evaluate(() => location.origin), 'app://aarti');
    assert(await page.evaluate(() => document.documentElement.classList.contains('desktop')));
    const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    assert(size.width >= 1000, 'opens as a desktop window: ' + JSON.stringify(size));
    // 2. Ctrl+F goes to search; a song plays.
    await page.keyboard.press('Control+f');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'q');
    await page.keyboard.type('kesariya'); await page.keyboard.press('Enter');
    await page.locator('#results .row .info').first().click();
    await page.waitForFunction(() => !document.getElementById('audio').paused && document.getElementById('audio').currentTime > 0.3, null, { timeout: 20000 });
    await page.screenshot({ path: path.join(shots, 'desktop-search.png') });
    // 3. The tray and the window title know what is playing.
    await page.waitForTimeout(400);
    assert.match(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), /^Kesariya Tera Ishq 1 · AartiMusic$/);
    // 4. Play / next from outside (tray, taskbar buttons) reach the page.
    const send = (a) => app.evaluate(({ BrowserWindow }, a) => BrowserWindow.getAllWindows()[0].webContents.send('aarti:control', a), a);
    await send('toggle'); await page.waitForFunction(() => document.getElementById('audio').paused);
    await send('toggle'); await page.waitForFunction(() => !document.getElementById('audio').paused);
    await send('next'); await page.waitForFunction(() => document.getElementById('mTitle').textContent === 'Kesariya Tera Ishq 2');
    // 5. Space pauses; the player opens as a centred column, under the bar.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForFunction(() => !document.getElementById('audio').paused);
    await page.keyboard.press('Space'); await page.waitForFunction(() => document.getElementById('audio').paused);
    await page.keyboard.press('Space'); await page.waitForFunction(() => !document.getElementById('audio').paused);
    await page.locator('#miniOpen').click(); await page.waitForFunction(() => document.getElementById('now').dataset.progress === '1.0000');
    await page.waitForTimeout(700);
    const col = await page.evaluate(() => { const r = document.querySelector('#now .now-in').getBoundingClientRect(), t = document.querySelector('#now .now-top').getBoundingClientRect(); return { w: r.width, left: r.left, right: innerWidth - r.right, top: t.top }; });
    assert(col.w <= 560 && Math.abs(col.left - col.right) < 2, 'the player is a centred column: ' + JSON.stringify(col));
    assert(col.top >= 36, 'the player starts under the bar');
    await page.screenshot({ path: path.join(shots, 'desktop-now.png') });
    await page.keyboard.press('Escape'); await page.waitForFunction(() => document.getElementById('now').dataset.progress === '0.0000');
    // 6. Mini player: small, on top, and back again.
    await page.keyboard.press('Control+m');
    await page.waitForFunction(() => document.documentElement.classList.contains('desk-mini'));
    await page.waitForTimeout(500);
    const mini = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { ...w.getBounds(), top: w.isAlwaysOnTop() }; });
    assert(mini.width <= 400 && mini.top, 'mini player is small and on top: ' + JSON.stringify(mini));
    assert.equal(await page.evaluate(() => document.getElementById('audio').paused), false, 'the song plays on');
    await page.screenshot({ path: path.join(shots, 'desktop-mini.png') });
    await page.locator('.desk-mini-btn').click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('desk-mini'));
    await page.waitForTimeout(400);
    const back = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { ...w.getBounds(), top: w.isAlwaysOnTop() }; });
    assert(back.width >= 1000 && !back.top, 'back to the full window: ' + JSON.stringify(back));
    // 7. Closing the window keeps the app (and the song) alive in the tray.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await page.waitForTimeout(500);
    const after = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows(); return { count: w.length, visible: w[0] && w[0].isVisible() }; });
    assert.deepEqual(after, { count: 1, visible: false });
    assert.equal(await page.evaluate(() => document.getElementById('audio').paused), false);
    assert.deepEqual(errors, []);
    console.log('PASS: desktop app starts on app://, desktop layout, keyboard, tray/taskbar controls, mini player, close-to-tray');
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
})().catch(e => { console.error(e); process.exit(1); });
