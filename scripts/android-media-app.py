#!/usr/bin/env python3
"""
Declares a MediaBrowserService, which is how an app says "I am a
music player" in the one way the whole of Android agrees on.

Three other signals are already sent — appCategory="audio", a media
session with somewhere to send a tap, and an ongoing notification —
and on a Realme phone they were not enough for its status-bar music
capsule. This is the last standard one left, and the only structural
difference from a player like Spotify: they all publish a browser
service, and it is what Android's own media resumption looks for when
deciding which apps count as players.

The service itself does nothing. It hands back an empty root and an
empty list, and no session token, so nothing offers a control that
cannot work. It exists to be found in the manifest.

The android/ folder is generated on every build, so the file is
written into it here rather than kept in the repo. Idempotent, and it
refuses loudly rather than guessing if the project is not laid out the
way it expects.
"""

import json
import os
import sys

SERVICE = "AartiMediaBrowserService"

JAVA = '''package {pkg};

import android.media.browse.MediaBrowser;
import android.os.Bundle;
import android.service.media.MediaBrowserService;

import java.util.ArrayList;
import java.util.List;

/**
 * Says this is a music player, and nothing else.
 *
 * Android decides which apps are media players partly by looking for
 * a service with this intent filter. Phones that draw their own music
 * capsule or island tend to ask the same question. Answering it costs
 * one class.
 *
 * There is deliberately nothing to browse. The player's queue lives in
 * the WebView and cannot be handed over from here, and no session
 * token is published, so nothing shows a control this cannot serve.
 */
public class {name} extends MediaBrowserService {{

    @Override
    public BrowserRoot onGetRoot(String clientPackageName, int clientUid, Bundle rootHints) {{
        return new BrowserRoot("aarti-root", null);
    }}

    @Override
    public void onLoadChildren(String parentId, Result<List<MediaBrowser.MediaItem>> result) {{
        result.sendResult(new ArrayList<MediaBrowser.MediaItem>());
    }}
}}
'''

BLOCK = '''
        <!-- Written by scripts/android-media-app.py -->
        <service
            android:name=".{name}"
            android:exported="true">
            <intent-filter>
                <action android:name="android.media.browse.MediaBrowserService" />
            </intent-filter>
        </service>
'''

root = sys.argv[1] if len(sys.argv) > 1 else "."
config = os.path.join(root, "capacitor.config.json")
manifest = os.path.join(root, "android/app/src/main/AndroidManifest.xml")

try:
    app_id = json.load(open(config, encoding="utf-8"))["appId"]
except (OSError, KeyError) as e:
    sys.exit(f"cannot read appId from {config}: {e}")

# The package is the appId, and the generated MainActivity already
# lives there — so if that folder is missing, something else is wrong
# and writing a file into thin air would only hide it.
pkg_dir = os.path.join(root, "android/app/src/main/java", *app_id.split("."))
if not os.path.isdir(pkg_dir):
    sys.exit(f"no {pkg_dir} — run `cap add android` before this")

path = os.path.join(pkg_dir, SERVICE + ".java")
with open(path, "w", encoding="utf-8") as f:
    f.write(JAVA.format(pkg=app_id, name=SERVICE))

xml = open(manifest, encoding="utf-8").read()
if SERVICE in xml:
    print(f"{SERVICE}.java written; already declared")
    sys.exit(0)

if "</application>" not in xml:
    sys.exit(f"{manifest} has no </application> — refusing to guess where this goes")

xml = xml.replace("</application>", BLOCK.format(name=SERVICE) + "    </application>", 1)
open(manifest, "w", encoding="utf-8").write(xml)
print(f"{SERVICE}.java written and declared")
