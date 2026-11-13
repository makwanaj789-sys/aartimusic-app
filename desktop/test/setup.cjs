/* The setup window, for real: installs the app into a temporary folder
   through the custom window, then checks what landed there. On Linux the
   Windows-only parts (shortcuts, registry) are skipped by the installer.
     xvfb-run -a node desktop/test/setup.cjs */
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const dir = path.resolve(__dirname, '..');
const shots = path.resolve(dir, '../test-results'); fs.mkdirSync(shots, { recursive: true });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aarti-setup-test-'));
  const source = path.join(tmp, 'source'), dest = path.join(tmp, 'Programs', 'AartiMusic');
  // A stand-in for the unpacked app: a few files, one of them called app.asar.
  fs.mkdirSync(path.join(source, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(source, 'AartiMusic.exe'), Buffer.alloc(300000, 1));
  fs.writeFileSync(path.join(source, 'resources', 'app.asar'), Buffer.alloc(200000, 2));
  fs.writeFileSync(path.join(source, 'ffmpeg.dll'), Buffer.alloc(100000, 3));
  const exe = process.env.AARTI_EXE;
  const app = await electron.launch({ executablePath: exe || require(path.join(dir, 'node_modules/electron')),
    args: [...(exe ? [] : [dir]), '--no-sandbox'], cwd: dir,
    env: { ...process.env, AARTI_SETUP_DEMO: '1', AARTI_SETUP_SOURCE: source, AARTI_SETUP_DIR: dest } });
  try {
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForSelector('#pWelcome.on');
    assert.equal(await page.title(), 'AartiMusic Setup');
    assert.equal(await page.locator('#dir').getAttribute('title'), dest);
    const frame = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { size: w.getContentSize(), resizable: w.isResizable() }; });
    assert.deepEqual(frame, { size: [860, 540], resizable: false });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(shots, 'setup-welcome.png') });
    await page.locator('#install').click();
    await page.waitForSelector('#pWork.on');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(shots, 'setup-working.png') });
    await page.waitForSelector('#pDone.on', { timeout: 20000 });
    assert.equal(await page.locator('#pct').textContent(), '100');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(shots, 'setup-done.png') });
    // Everything arrived, byte for byte, including the file named app.asar.
    for (const f of ['AartiMusic.exe', 'resources/app.asar', 'ffmpeg.dll'])
      assert(fs.readFileSync(path.join(source, f)).equals(fs.readFileSync(path.join(dest, f))), f + ' copied intact');
    assert.deepEqual(errors, []);
    console.log('PASS: custom setup window installs into the chosen folder and reports done');
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
