#!/usr/bin/env python3
"""Attach a session launch intent and an explicit ongoing media notification.
These are standard Android integration improvements, not a guarantee of OEM
Live Alerts support. Upstream replacement anchors must match exactly.
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
