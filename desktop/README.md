# AartiMusic for Windows

The same app as on the phone (`../www`), wrapped with Electron.

- **Tray:** closing the window keeps the music playing; the tray icon has play, next, previous and quit.
- **Taskbar:** previous / play / next buttons on the window's preview.
- **Media keys:** the keyboard's play, next and previous keys, and Windows' own media pop-up.
- **Mini player:** a small window that stays on top (Ctrl+M, or the button in the top bar).
- **Rows that scroll sideways:** the mouse wheel moves the row under the pointer, and an arrow appears at whichever end has more.
- **Keyboard:** Space play/pause, Ctrl+→ / Ctrl+← next/previous, ← / → seek 5 s, Ctrl+F search, Esc close.
- **Start with Windows:** an option in the tray menu.

## Setup

`AartiMusic-Setup-<version>.exe` is the app itself, packed as a
self-extracting file. Run that way it shows its own setup window
(`setup/`), copies itself to `%LOCALAPPDATA%\Programs\AartiMusic`,
makes the shortcuts and registers its removal with Windows. Removal is
the same program started with `--uninstall`. Everything is per-user;
there is no administrator prompt. `setup.js` has the details.

## Build

    cd desktop
    npm ci
    npm start          # run it
    npm run dist       # the setup file in dist/ (on Windows)

GitHub builds it in the **Build Windows app** workflow, then installs,
runs and removes it on the runner; the `aartimusic-windows` artifact
holds the setup file.

`tools/make-art.cjs` redraws the icons from `../assets/icon.png`.
`test/smoke.cjs` starts the app and drives it; `test/setup.cjs` drives
the setup window.
