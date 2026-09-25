#!/usr/bin/env python3
"""
Adds the permissions the playing notification needs to the generated
AndroidManifest.

The android/ folder is made fresh by `npx cap add android` on every
build and is not in the repo, so there is nowhere to write these by
hand. Capacitor merges each plugin's own manifest, which covers most
of it; these two are the ones no plugin declares for us:

  FOREGROUND_SERVICE_MEDIA_PLAYBACK
      Android 14 refuses to start a mediaPlayback foreground service
      without it, and the notification is that service's. The media
      session plugin declares plain FOREGROUND_SERVICE only.

  POST_NOTIFICATIONS
      Android 13 hides every notification, foreground services
      included, until this is granted. The local notifications plugin
      does declare it, so this is a second pair of hands rather than
      the only one — cheap, and it means the media notification does
      not quietly depend on a plugin kept for another reason.

Run it after `cap add android` and before the Gradle build. It is
idempotent: a permission already present is left alone.
"""

import sys
import re

WANTED = [
    "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    "android.permission.POST_NOTIFICATIONS",
]

path = sys.argv[1] if len(sys.argv) > 1 else "android/app/src/main/AndroidManifest.xml"

try:
    xml = open(path, encoding="utf-8").read()
except OSError as e:
    sys.exit(f"cannot read {path}: {e}")

added = []
for name in WANTED:
    if name in xml:
        continue
    line = f'    <uses-permission android:name="{name}" />\n'
    # Sits with the permissions the template already writes, or just
    # inside </manifest> if that block is ever dropped.
    if "</manifest>" not in xml:
        sys.exit(f"{path} has no </manifest> — refusing to guess where this goes")
    xml = xml.replace("</manifest>", line + "</manifest>")
    added.append(name.rsplit(".", 1)[-1])

if added:
    open(path, "w", encoding="utf-8").write(xml)
    print("added: " + ", ".join(added))
else:
    print("nothing to add — all present")
