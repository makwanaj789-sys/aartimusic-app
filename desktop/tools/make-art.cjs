/* Draws the Windows icon, the tray and taskbar glyphs and the
   installer's pictures from the app's own logo (../assets/icon.png).
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

  // The installer: a tall picture for the welcome and finish pages, a small one for the header.
  const side = `<style>${base}.s{width:164px;height:314px;position:relative;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif;
     background:radial-gradient(140% 70% at 50% 100%,#6b3207 0%,#2b1404 38%,#0c0704 70%,#050302 100%)}
   .s:before{content:"";position:absolute;inset:0;background:repeating-radial-gradient(circle at 50% 38%,transparent 0 13px,rgba(255,190,90,.06) 13px 14px)}
   .s .i{position:absolute;left:32px;top:54px;width:100px;height:100px}
   .s b{position:absolute;left:0;right:0;top:176px;text-align:center;color:#ffd58a;font-size:19px;font-weight:600;letter-spacing:.02em}
   .s span{position:absolute;left:0;right:0;top:204px;text-align:center;color:#c9a678;font-size:10.5px;letter-spacing:.14em}
   .s i{position:absolute;left:18px;right:18px;bottom:22px;height:26px;display:flex;align-items:flex-end;gap:3px;justify-content:center}
   .s i u{width:4px;border-radius:2px;background:linear-gradient(#ffd27a,#c96a0c);opacity:.85}</style>
   <div class="s"><div class="i">${tile(100)}</div><b>AartiMusic</b><span>YOUR MUSIC · YOUR PC</span>
   <i>${[8, 14, 22, 12, 18, 26, 16, 10, 20, 24, 13, 7, 17, 23, 11, 15, 9].map(h => `<u style="height:${h}px"></u>`).join('')}</i></div>`;
  await shot(side, 164, 314, '_side.png', false);
  const head = `<style>${base}.h{width:150px;height:57px;position:relative;background:linear-gradient(100deg,#0b0604,#3a1b05);font-family:"Segoe UI",system-ui,sans-serif}
     .h .i{position:absolute;left:10px;top:9px;width:39px;height:39px}.h b{position:absolute;left:58px;top:19px;color:#ffd58a;font-size:14px;font-weight:600}</style>
     <div class="h"><div class="i">${tile(39)}</div><b>AartiMusic</b></div>`;
  await shot(head, 150, 57, '_head.png', false);
  await browser.close();
  // NSIS reads 24-bit BMP only.
  execFileSync('convert', [path.join(out, '_side.png'), '-alpha', 'off', 'BMP3:' + path.join(out, 'installer-sidebar.bmp')]);
  execFileSync('convert', [path.join(out, '_head.png'), '-alpha', 'off', 'BMP3:' + path.join(out, 'installer-header.bmp')]);
  fs.copyFileSync(path.join(out, '_side.png'), path.join(out, 'installer-sidebar-preview.png'));
  for (const f of fs.readdirSync(out)) if (f.startsWith('_')) fs.unlinkSync(path.join(out, f));
  console.log(fs.readdirSync(out).join(' '));
})();
