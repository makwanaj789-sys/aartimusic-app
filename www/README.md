# Aarti Music — app shell

The Capacitor web layer for the Android app. `capacitor.config.json`
points `webDir` here, so these four files are what gets packaged.

    index.html   markup for every screen — nothing is templated in JS
    app.css      all styling and animation
    app.js       one IIFE: state, playback, and every interaction
    config.js    where the server is, and the key used to reach it
    fonts/       Sora, four weights — the app fetches nothing to draw
    SYNC.md      what the server has to do for favourites to sync

No build step and no dependencies here. Edit, run `npx cap sync
android`, rebuild. Opening `index.html` straight from disk works too,
minus the Telegram bridge.

## What only exists in the app

Two things the browser gives us and the Android WebView does not, so
they are reached through native plugins rather than written here:

    MediaSession       the notification, the lock screen, and the
                       capsule some phones draw — plus the foreground
                       service that keeps audio alive in the
                       background. app.js uses the standard Web API
                       wherever there is one and the plugin where
                       there is not; the rest of the file cannot tell.

    LocalNotifications only for its permission prompt. Android 13
                       hides every notification until it is granted,
                       and nothing else here asks.

Both are plain `window.Capacitor.Plugins` calls, so neither brings a
build step with it. Declining the permission costs the notification
and nothing else.

These files were recovered from `app-debug.apk`, which was the only
copy of them. The first commit is that recovered state, byte for
byte, so everything after it reads as a real diff.
