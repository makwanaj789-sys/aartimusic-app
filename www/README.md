# Aarti Music — app shell

The Capacitor web layer for the Android app. `capacitor.config.json`
points `webDir` here, so these four files are what gets packaged.

    index.html   markup for every screen — nothing is templated in JS
    app.css      all styling and animation
    app.js       one IIFE: state, playback, and every interaction
    config.js    where the server is, and the key used to reach it
    SYNC.md      what the server has to do for favourites to sync

No build step and no dependencies. Edit, run `npx cap sync android`,
rebuild. Opening `index.html` straight from disk works too, minus the
Telegram bridge.

These files were recovered from `app-debug.apk`, which was the only
copy of them. The first commit is that recovered state, byte for
byte, so everything after it reads as a real diff.
