#!/usr/bin/env python3
"""
Two lines the media session plugin leaves out.

The plugin builds a correct Android media notification — that part
works. These are the bits a phone's own music capsule or island tends
to look for, which a notification can be perfectly valid without:

  setSessionActivity
      Where to go when the capsule itself is tapped. The plugin sets
      a content intent on the notification but leaves the session
      with nowhere to send a tap, and a system UI that has nothing to
      open may simply not offer the control.

  setOngoing(true)
      Says this notification belongs to something still happening. A
      foreground service's notification is treated as ongoing from
      Android 12 anyway, but saying so is what the API is for, and
      it is what a manufacturer's own UI reads.

Patched here rather than forked: this is two insertions against a
plugin that is otherwise doing the right thing, and a fork would mean
owning five files of Java to change four lines of it.

Run after `npm install` and before `cap sync`. It refuses loudly if
the plugin has moved on and an anchor no longer matches, rather than
quietly doing nothing — a silent no-op is how this kind of patch
rots.
"""

import sys
import os

PLUGIN = ("node_modules/@jofr/capacitor-media-session/android/src/main/java/"
          "io/github/jofr/capacitor/mediasessionplugin/MediaSessionService.java")

OLD = """        notificationStyle = new MediaStyle().setMediaSession(mediaSession.getSessionToken());
        notificationBuilder = new NotificationCompat.Builder(this, "playback")
                .setStyle(notificationStyle)
                .setSmallIcon(R.drawable.ic_baseline_volume_up_24)
                .setContentIntent(PendingIntent.getActivity(getApplicationContext(), 0, intent, PendingIntent.FLAG_IMMUTABLE))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);"""

NEW = """        PendingIntent openApp = PendingIntent.getActivity(getApplicationContext(), 0, intent, PendingIntent.FLAG_IMMUTABLE);
        mediaSession.setSessionActivity(openApp);

        notificationStyle = new MediaStyle().setMediaSession(mediaSession.getSessionToken());
        notificationBuilder = new NotificationCompat.Builder(this, "playback")
                .setStyle(notificationStyle)
                .setSmallIcon(R.drawable.ic_baseline_volume_up_24)
                .setContentIntent(openApp)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);"""

path = sys.argv[1] if len(sys.argv) > 1 else PLUGIN

if not os.path.exists(path):
    sys.exit(f"not found: {path}\n"
             "Run npm install first, or drop this step if the plugin is gone.")

src = open(path, encoding="utf-8").read()

if "mediaSession.setSessionActivity(openApp)" in src:
    print("already patched")
    sys.exit(0)

if OLD not in src:
    sys.exit(
        f"{path} no longer matches what this patch expects.\n"
        "The plugin has changed. Re-read connectAndInitialize() and update\n"
        "scripts/media-session-patch.py — do not just delete this step, or\n"
        "the session goes back to having nowhere to send a tap."
    )

open(path, "w", encoding="utf-8").write(src.replace(OLD, NEW))
print("patched: setSessionActivity, setOngoing")
