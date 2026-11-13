/* Copies the app's pages (../www) next to the desktop shell, where
   the build packs them from. The copy is not committed. */
const fs = require('node:fs'); const path = require('node:path');
const from = path.resolve(__dirname, '../../www'), to = path.resolve(__dirname, '../www');
fs.rmSync(to, { recursive: true, force: true });
// The Android floating player's background films are not used on the desktop.
fs.cpSync(from, to, { recursive: true, filter: (src) => !/[\\/]capsule-media[\\/].*\.(mp4|jpg)$/.test(src) });
console.log('pages copied to', to);
