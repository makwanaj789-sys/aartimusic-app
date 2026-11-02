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

# setMetadata turns the artwork address into a picture right there, and
# any failure (a 404 thumbnail, no network, an entry without "src")
# escapes the plugin method. Capacitor rethrows that as a RuntimeException,
# which kills the app, and since the last song is restored at launch it
# kills it again on every start. A song with no picture must only lose
# its picture.
ART_OLD = """        final JSArray artworkArray = call.getArray("artwork");
        final List<JSONObject> artworkList = artworkArray.toList();
        for (JSONObject artwork : artworkList) {
            String src = artwork.getString("src");
            if (src != null) {
                this.artwork = urlToBitmap(src);
            }
        }"""

ART_NEW = """        this.artwork = null;
        try {
            final JSArray artworkArray = call.getArray("artwork");
            final List<JSONObject> artworkList = artworkArray == null ? new java.util.ArrayList<>() : artworkArray.toList();
            for (JSONObject artwork : artworkList) {
                String src = artwork.optString("src", "");
                if (!src.isEmpty()) {
                    this.artwork = urlToBitmap(src);
                }
            }
        } catch (Throwable e) {
            this.artwork = null;
            Log.w(TAG, "Artwork unavailable", e);
        }"""

CONN_OLD = """            connection.setDoInput(true);
            connection.connect();"""

CONN_NEW = """            connection.setDoInput(true);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.connect();
            if (connection.getResponseCode() >= 400) {
                connection.disconnect();
                return null;
            }"""

path = sys.argv[1] if len(sys.argv) > 1 else PLUGIN
plugin = os.path.join(os.path.dirname(path), "MediaSessionPlugin.java")

for f in (path, plugin):
    if not os.path.exists(f):
        sys.exit(f"not found: {f}\n"
                 "Run npm install first, or drop this step if the plugin is gone.")


def patch(file, old, new, marker, what):
    src = open(file, encoding="utf-8").read()
    if marker in src:
        print("already patched:", what)
        return
    if old not in src:
        sys.exit(
            f"{file} no longer matches what this patch expects ({what}).\n"
            "The plugin has changed. Re-read it and update\n"
            "scripts/media-session-patch.py — do not just delete this step."
        )
    open(file, "w", encoding="utf-8").write(src.replace(old, new))
    print("patched:", what)


patch(path, OLD, NEW, "mediaSession.setSessionActivity(openApp)", "setSessionActivity, setOngoing")
patch(plugin, ART_OLD, ART_NEW, 'Log.w(TAG, "Artwork unavailable", e);', "artwork failures no longer crash")
patch(plugin, CONN_OLD, CONN_NEW, "connection.setReadTimeout(8000);", "artwork download timeouts")
