# AartiMusic for Windows

The same app as on the phone (`../www`), wrapped with Electron.

- **Tray:** closing the window keeps the music playing; the tray icon has play, next, previous and quit.
- **Taskbar:** previous / play / next buttons on the window's preview.
- **Media keys:** the keyboard's play, next and previous keys, and Windows' own media pop-up.
- **Mini player:** a small window that stays on top (Ctrl+M, or the button in the top bar).
- **Keyboard:** Space play/pause, Ctrl+→ / Ctrl+← next/previous, ← / → seek 5 s, Ctrl+F search, Esc close.
- **Start with Windows:** an option in the tray menu.

## Build

    cd desktop
    npm ci
    npm start          # run it
    npm run dist       # Windows installer in dist/ (on Windows)

GitHub builds the installer in the **Build Windows app** workflow; the
`aartimusic-windows` artifact holds `AartiMusic-Setup-<version>.exe`.

`tools/make-art.cjs` redraws the icon and the installer pictures from
`../assets/icon.png`. `test/smoke.cjs` starts the app and drives it.
