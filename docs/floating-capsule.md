# Floating player and native Live Alerts testing

The optional Android floating player uses the existing MediaSession and foreground
playback service. It does not change the app ID, stream implementation, queue,
notification handlers, or server. It is disabled by default. No notification-listener
or accessibility permission is requested.

Settings → Floating player → Allow display over other apps → return → Show when
minimized. Start music and press Home. The compact capsule enters with a short
scale/translation/opacity animation. The OS owns the launcher minimize animation;
this does not morph the actual app window into an overlay. Tap the arrow for
previous/play-pause/next/open/dismiss; long-press the background to dismiss. Returning
to the app removes the overlay. Dismissal lasts until the next app visit. Screen
lock removes it; unlocking can restore it only during active playback. A stopped
session, permission loss or disabled preference removes it. Paused playback keeps
an already-visible capsule, but a restored paused track does not create one.
Android's disabled animator setting and prefers-reduced-motion suppress motion.
The overlay stays below Android's protected status bar, unlike OEM Live Alerts.

The browser service now publishes the actual existing session token instead of
being only an empty service declaration. Its browse list remains empty. This is a
standard Android integration improvement, not proof of Realme eligibility.

## Device acceptance checks (require a phone)

1. With floating player OFF, minimize during playback. Check normal notifications,
   lockscreen controls and native Realme capsule independently. Record exact OS build.
2. Deny overlay permission, return: UI remains usable, switch is disabled, music continues.
3. Grant permission and enable. Minimize while playing: one capsule appears; no seek,
   restart, duplicate audio or lost queue. Opening the app removes it immediately.
4. Test expanded previous/pause/play/next and open. Position continues from the same
   session. Pause then return to app and minimize: no newly created paused capsule.
5. Dismiss, wait through a song change: it stays dismissed. Reopen and minimize to show again.
6. Turn screen off/on and unlock. Rotate/reopen repeatedly. Disable permission from
   Android settings. No stranded overlay or second playback session should remain.
7. Disable animations in Android settings: controls remain tappable and bars are static.
8. Recheck search, playlist playback, favourites, shuffle/repeat, queue, sleep timer,
   notification controls and background playback on the installed APK.

A Spotify-package build is not produced. Reusing another app's identity is not a
supported integration with Realme; it collides with Spotify installation and cannot
satisfy any signing-certificate checks. Native eligibility must be tested under
AartiMusic's own ID. Floating player is an independent opt-in fallback.
