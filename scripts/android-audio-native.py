#!/usr/bin/env python3
"""Sound presets and the lock-screen like button.

Run after cap sync, media-session-patch.py and android-capsule.py.

- Copies AartiLike.java (the meeting point between the media session and
  the app's favourites) and two heart icons into the media-session plugin.
- Patches its MediaSessionService so the heart shows as a PlaybackState
  custom action (what Android 13+ lock screens and media controls draw)
  and as a notification action (what older versions draw), and so a tap
  reaches the app. Patches MediaSessionCallback for the custom action.
- Installs AartiAudioPlugin (equalizer, bass boost, like bridge) in the
  app, registers it, and adds MODIFY_AUDIO_SETTINGS.

Every replacement fails closed if upstream changes, and running it twice
gives the same result.
"""
from pathlib import Path
import json
import xml.etree.ElementTree as ET

root = Path('.')
app_id = json.loads((root / 'capacitor.config.json').read_text())['appId']
plugin = root / 'node_modules/@jofr/capacitor-media-session/android/src/main'
java = plugin / 'java/io/github/jofr/capacitor/mediasessionplugin'

(java / 'AartiLike.java').write_text((root / 'scripts/AartiLike.java').read_text())
for icon in ['ic_aarti_heart.xml', 'ic_aarti_heart_filled.xml']:
    (plugin / 'res/drawable' / icon).write_text((root / 'scripts' / icon).read_text())


def patch(path, edits):
    src = path.read_text()
    for old, new, marker in edits:
        if marker in src:
            continue
        if src.count(old) != 1:
            raise SystemExit(f'{path.name}: like/sound anchor changed: {old.strip()[:70]}')
        src = src.replace(old, new)
    path.write_text(src)


patch(java / 'MediaSessionService.java', [
    # Redraw the heart when the app says the song's liked state changed.
    ('        playbackStateActions.put("stop", PlaybackStateCompat.ACTION_STOP);\n    }',
     '        playbackStateActions.put("stop", PlaybackStateCompat.ACTION_STOP);\n'
     '        AartiLike.onRefresh(() -> new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {\n'
     '            possibleActionsUpdate = true;\n'
     '            update();\n'
     '        }));\n'
     '    }',
     'AartiLike.onRefresh(() ->'),
    # A dead service must not redraw a notification.
    ('    public void destroy() {',
     '    public void destroy() {\n        AartiLike.onRefresh(null);',
     'AartiLike.onRefresh(null);'),
    # Custom actions can only be added, so each rebuild starts a fresh builder.
    ('        if (possibleActionsUpdate) {\n'
     '          if (notificationBuilder != null) {\n'
     '            notificationBuilder.mActions.clear();\n'
     '          }\n',
     '        if (possibleActionsUpdate) {\n'
     '          if (notificationBuilder != null) {\n'
     '            notificationBuilder.mActions.clear();\n'
     '          }\n'
     '          if (playbackStateBuilder != null) {\n'
     '            playbackStateBuilder = new PlaybackStateCompat.Builder();\n'
     '          }\n',
     'playbackStateBuilder = new PlaybackStateCompat.Builder();\n          }'),
    # The heart itself, after the standard controls.
    ('            if (playbackStateBuilder != null) {\n'
     '              playbackStateBuilder.setActions(activePlaybackStateActions);\n'
     '            }',
     '            if (AartiLike.available() && notificationBuilder != null && playbackStateBuilder != null) {\n'
     '                boolean liked = AartiLike.liked();\n'
     '                int heart = liked ? R.drawable.ic_aarti_heart_filled : R.drawable.ic_aarti_heart;\n'
     '                String label = liked ? "Remove from favourites" : "Add to favourites";\n'
     '                notificationBuilder.addAction(new NotificationCompat.Action(heart, label, aartiLikeIntent()));\n'
     '                playbackStateBuilder.addCustomAction(new PlaybackStateCompat.CustomAction.Builder(AartiLike.ACTION, label, heart).build());\n'
     '            }\n'
     '            if (playbackStateBuilder != null) {\n'
     '              playbackStateBuilder.setActions(activePlaybackStateActions);\n'
     '            }',
     'aartiLikeIntent()));'),
    ('    public void updatePossibleActions() {',
     '    private PendingIntent aartiLikeIntent() {\n'
     '        Intent like = new Intent(this, MediaSessionService.class).setAction(AartiLike.INTENT);\n'
     '        return PendingIntent.getService(this, 41, like, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);\n'
     '    }\n\n'
     '    public void updatePossibleActions() {',
     'private PendingIntent aartiLikeIntent()'),
    # The notification's heart arrives here.
    ('        MediaButtonReceiver.handleIntent(mediaSession, intent);',
     '        if (intent != null && AartiLike.INTENT.equals(intent.getAction())) {\n'
     '            AartiLike.toggle();\n'
     '            return START_NOT_STICKY;\n'
     '        }\n'
     '        MediaButtonReceiver.handleIntent(mediaSession, intent);',
     'AartiLike.toggle();\n            return START_NOT_STICKY;'),
])

# The lock screen's heart arrives here.
patch(java / 'MediaSessionCallback.java', [
    ('    @Override\n    public void onStop() {\n        plugin.actionCallback("stop");\n    }\n}',
     '    @Override\n    public void onStop() {\n        plugin.actionCallback("stop");\n    }\n\n'
     '    @Override\n    public void onCustomAction(String action, android.os.Bundle extras) {\n'
     '        if (AartiLike.ACTION.equals(action)) AartiLike.toggle();\n'
     '    }\n}',
     'onCustomAction'),
])

app_java = root / 'android/app/src/main/java' / Path(*app_id.split('.'))
(app_java / 'AartiAudioPlugin.java').write_text((root / 'scripts/AartiAudioPlugin.java').read_text().replace('__PACKAGE__', app_id))
main = app_java / 'MainActivity.java'
text = main.read_text()
if 'registerPlugin(AartiAudioPlugin.class)' not in text:
    anchor = 'super.onCreate(savedInstanceState);'
    if text.count(anchor) != 1:
        raise SystemExit('MainActivity onCreate anchor changed')
    text = text.replace(anchor, 'registerPlugin(AartiAudioPlugin.class);\n        ' + anchor)
    main.write_text(text)

ns = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ns)
attr = lambda key: '{' + ns + '}' + key
path = root / 'android/app/src/main/AndroidManifest.xml'
tree = ET.parse(path)
manifest = tree.getroot()
permission = 'android.permission.MODIFY_AUDIO_SETTINGS'
if not any(x.get(attr('name')) == permission for x in manifest.findall('uses-permission')):
    ET.SubElement(manifest, 'uses-permission', {attr('name'): permission})
tree.write(path, encoding='utf-8', xml_declaration=True)
print('Sound presets and lock-screen like installed')
