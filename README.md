# Aarti Music — Android app

The same player that runs inside Telegram, wrapped as an installable
app. Nothing is built on a phone: GitHub compiles the APK.

## Getting an APK

1. Push this repo to GitHub.
2. Open **Actions → Build APK → Run workflow**.
3. Wait a few minutes, then download **aarti-music-apk** from the run.
4. Open the file on the phone and allow install from this source.

It is a *debug* build — fine for you and anyone you send it to, not
for the Play Store, which isn't the plan anyway.

## Telling the app where the server is

The tunnel address changes every time the tunnel restarts, and an app
already installed on someone's phone can't be edited. So the app asks
a small file where the server is at startup:

    { "server": "https://something.trycloudflare.com" }

Put that at the path in `www/config.js` — the GitHub Pages site is a
good home for it. When the address changes, edit that one file and
every installed copy follows. No rebuild, no reinstall.

`www/config.js` also has `AARTI_SERVER`, used only if the file can't
be reached.

## Changing the app

Everything visible lives in `www/`. Edit, push, run the workflow, get
a new APK. The same files also run as the Telegram Mini App from the
bot's `webapp/` folder.

The icon and the startup screen are drawn from `assets/` — the
workflow turns `icon.png`, the adaptive pair and `splash.png` into
every size Android wants.

## The bits that are Android's, not the web's

`android/` is generated on each run rather than kept here, so anything
that has to be in the native project is written by the workflow:

  - `scripts/android-permissions.py` adds the two permissions the
    playing notification needs. Without them Android 14 refuses to
    start the media service and Android 13 hides the notification.
  - Plugins come from `package.json` and Capacitor wires them in.

Nothing in `www/` needs a build step; these run before Gradle does.
