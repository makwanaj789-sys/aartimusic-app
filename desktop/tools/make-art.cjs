/* Draws the Windows icon, the tray and taskbar glyphs and the
   setup file's unpacking picture from the app's own logo (../assets/icon.png).
   Run from the repo root:  node desktop/tools/make-art.cjs
   Needs playwright (as the UI tests do) and ImageMagick's `convert`.
   The results are committed, so a build never has to run this. */
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path');
const out = path.resolve(__dirname, '../assets'); fs.mkdirSync(out, { recursive: true });
const logo = 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../../assets/icon.png')).toString('base64');

const base = `*{margin:0;box-sizing:border-box}html,body{background:transparent}`;
// The logo sits on black; "screen" drops the black and keeps the gold.
const tile = (s) => `<style>${base}
 .t{width:${s}px;height:${s}px;position:relative;border-radius:23%;overflow:hidden;
   background:radial-gradient(120% 90% at 50% 108%,#5a2a06 0%,#2a1304 34%,#0d0704 62%,#050302 100%)}
 .t:before{content:"";position:absolute;inset:0;border-radius:inherit;
   background:radial-gradient(60% 45% at 50% 56%,rgba(255,170,40,.34),transparent 70%),
              repeating-radial-gradient(circle at 50% 56%,transparent 0 6.2%,rgba(255,190,90,.07) 6.2% 6.6%)}
 .t img{position:absolute;inset:-9%;width:118%;height:118%;mix-blend-mode:screen}
 .t:after{content:"";position:absolute;inset:0;border-radius:inherit;padding:${Math.max(1, s * .022)}px;
   background:linear-gradient(145deg,#ffe29a,#f5a623 30%,#7a3d06 62%,#ffc559);
   -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
 </style><div class="t"><img src="${logo}"></div>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const shot = async (html, w, h, file, transparent = true) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<body style="width:${w}px;height:${h}px">${html}</body>`);
    await page.waitForFunction(() => [...document.images].every(i => i.complete));
    await page.screenshot({ path: path.join(out, file), omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  };

  // The app icon.
  await shot(tile(1024), 1024, 1024, 'icon.png');
  for (const s of [256, 128, 64, 48, 32, 24, 16]) await shot(tile(s), s, s, `_i${s}.png`);
  execFileSync('convert', [256, 128, 64, 48, 32, 24, 16].map(s => path.join(out, `_i${s}.png`)).concat(path.join(out, 'icon.ico')));

  // The tray: the tile, small.
  for (const [s, name] of [[16, 'tray.png'], [32, 'tray@2x.png'], [48, 'tray@3x.png']]) await shot(tile(s), s, s, name);

  // Taskbar preview buttons: plain white glyphs.
  const glyph = { 'tb-play': 'M7 4.5v15l12-7.5z', 'tb-pause': 'M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z',
                  'tb-next': 'M5 4.5v15l10-7.5zM16.5 4.5h3v15h-3z', 'tb-prev': 'M19 4.5v15L9 12zM4.5 4.5h3v15h-3z' };
  for (const [name, d] of Object.entries(glyph)) for (const [s, suffix] of [[16, ''], [32, '@2x']])
    await shot(`<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="${d}" fill="#fff"/></svg>`, s, s, `${name}${suffix}.png`);

  // Shown for the few seconds the setup file takes to unpack itself,
  // before the setup window (setup/setup.html) can open.
  const splash = `<style>${base}.s{width:480px;height:270px;position:relative;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif;
     background:radial-gradient(90% 80% at 20% 115%,#7a3a08 0%,#2b1404 42%,#0c0704 72%,#060402 100%)}
   .s:before{content:"";position:absolute;inset:0;background:repeating-radial-gradient(circle at 26% 50%,transparent 0 17px,rgba(255,190,90,.06) 17px 18px)}
   .s .i{position:absolute;left:62px;top:79px;width:112px;height:112px}
   .s b{position:absolute;left:206px;top:98px;color:#fff3dc;font-size:30px;font-weight:700;letter-spacing:-.01em}
   .s span{position:absolute;left:207px;top:142px;color:#d9b17c;font-size:12px;letter-spacing:.2em}
   .s em{position:absolute;left:207px;top:172px;width:150px;height:4px;border-radius:4px;background:linear-gradient(90deg,#b45f08,#f5a623,#ffd98a)}</style>
   <div class="s"><div class="i">${tile(112)}</div><b>AartiMusic</b><span>PREPARING SETUP</span><em></em></div>`;
  await shot(splash, 480, 270, '_splash.png', false);
  await browser.close();
  // The unpacker reads 24-bit BMP only.
  execFileSync('convert', [path.join(out, '_splash.png'), '-alpha', 'off', 'BMP3:' + path.join(out, 'setup-splash.bmp')]);
  for (const f of fs.readdirSync(out)) if (f.startsWith('_')) fs.unlinkSync(path.join(out, f));
  console.log(fs.readdirSync(out).join(' '));
})();
