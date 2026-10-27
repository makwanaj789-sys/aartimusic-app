#!/usr/bin/env python3
"""Publish the existing playback session through Android's media browser API.
This improves standard controller discovery; OEM Live Alerts eligibility is still
firmware-dependent. It does not create another player or start playback.
"""

import json
import os
import sys

SERVICE = "AartiMediaBrowserService"

JAVA = '''package {pkg};

import android.media.browse.MediaBrowser;
import android.media.session.MediaSession;
import android.os.Bundle;
import android.service.media.MediaBrowserService;
import io.github.jofr.capacitor.mediasessionplugin.FloatingCapsule;
import java.util.ArrayList;
import java.util.List;

public class {name} extends MediaBrowserService {{
    private FloatingCapsule playback;
    private MediaSession.Token published;
    private final Runnable sessionChanged = () -> {{
        android.support.v4.media.session.MediaSessionCompat.Token current = playback.sessionToken();
        if (current == null) {{
            if (published != null) stopSelf();
            return;
        }}
        MediaSession.Token token = (MediaSession.Token) current.getToken();
        if (published == null) {{ published = token; setSessionToken(token); }}
        // A browser service may publish its session token only once.
        else if (!published.equals(token)) stopSelf();
    }};
    @Override public void onCreate() {{
        super.onCreate();
        playback = FloatingCapsule.get(this);
        playback.watchSession(sessionChanged);
    }}
    @Override public void onDestroy() {{
        playback.unwatchSession(sessionChanged);
        super.onDestroy();
    }}
    @Override public BrowserRoot onGetRoot(String client, int uid, Bundle hints) {{
        return new BrowserRoot("aarti-root", null);
    }}
    @Override public void onLoadChildren(String parent, Result<List<MediaBrowser.MediaItem>> result) {{
        // Browsing a library is not implemented; active playback controls use the real token.
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
