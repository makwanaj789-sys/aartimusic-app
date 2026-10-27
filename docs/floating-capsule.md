# Floating player and native Live Alerts testing

The optional Android floating player uses the existing MediaSession and foreground
playback service. It does not change the app ID, stream implementation, queue,
notification handlers, or server. It is disabled by default. No notification-listener
or accessibility permission is requested.

On first use, an introductory dialog offers Allow floating player and Not now.
Android's overlay settings is opened only by Allow. On return, a granted permission
enables the player automatically; denial or Skip both advance into the app. The
choice is not repeated every launch. Settings retains the enable switch and permission action.

Settings → Customize glass player opens a live preview with width (260–380 dp),
height (170–260 dp), visibility, spatial crop (focal x/y and zoom), and video loop
start/end seconds. Both supplied default clips are packaged locally, resized,
and stripped of audio. Custom media is chosen with Android's document picker,
validated and copied into private app storage (100 MB limit). No storage-wide
permission is needed. Cancelling the editor leaves the saved appearance unchanged.
Personal library JSON backups do not include these local media files.

The expanded overlay has cover/title/artist, real session seek controls, and vector
shuffle/previous/play-pause/next/repeat controls. Shuffle/repeat invoke the existing
app handlers and reflect their resulting mode. The overlay background is a muted
TextureView video or sampled photo, with translucent tint and rounded glass border;
it is not a screen capture or guaranteed hardware blur of other apps. It releases
video/surface resources on hide, locks, dismissal or app return. Android's disabled
animations and reduced-motion preference show still backgrounds by default.

The OS owns the launcher minimize animation; the overlay has its own short entry
animation. It stays below protected system windows. The original playback service
and audio player remain responsible for music. The app's identity is AartiMusic.

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
