"""Install the optional overlay and connect it to the existing media session.

No additional playback service, player, notification listener or accessibility service.
Run after cap sync and media-session-patch.py. Every replacement fails closed if
upstream changes, and repeat runs produce the same output.
"""
from pathlib import Path
import json
import xml.etree.ElementTree as ET

root=Path('.')
app_id=json.loads((root/'capacitor.config.json').read_text())['appId']
plugin_dir=root/'node_modules/@jofr/capacitor-media-session/android/src/main/java/io/github/jofr/capacitor/mediasessionplugin'
for source in ['FloatingCapsule.java','CapsuleAppearance.java','GlassBackground.java','CapsuleIcon.java']:
 (plugin_dir/source).write_text((root/'scripts'/source).read_text())
service=plugin_dir/'MediaSessionService.java'
src=service.read_text()
def insert(old,new,marker):
 global src
 if marker in src:return
 if src.count(old)!=1:raise SystemExit('Capsule integration anchor changed: '+old)
 src=src.replace(old,new)
insert('        mediaSession.setSessionActivity(openApp);','        mediaSession.setSessionActivity(openApp);\n        FloatingCapsule.get(this).attach(mediaSession.getSessionToken());','FloatingCapsule.get(this).attach')
insert('    public void destroy() {','    public void destroy() {\n        FloatingCapsule.get(this).detach();','FloatingCapsule.get(this).detach();')
# onDestroy may happen without explicit destroy (e.g. service teardown).
if 'public void onDestroy()' not in src:
 src=src.replace('    public void destroy() {','    @Override public void onDestroy() {\n        FloatingCapsule.get(this).detach();\n        super.onDestroy();\n    }\n\n    public void destroy() {')
service.write_text(src)
java_dir=root/'android/app/src/main/java'/Path(*app_id.split('.'))
(java_dir/'FloatingCapsulePlugin.java').write_text((root/'scripts/FloatingCapsulePlugin.java').read_text().replace('__PACKAGE__',app_id))
main=java_dir/'MainActivity.java';text=main.read_text()
if 'registerPlugin(FloatingCapsulePlugin.class)' not in text:
 anchor='super.onCreate(savedInstanceState);'
 if text.count(anchor)!=1:raise SystemExit('MainActivity onCreate anchor changed')
 text=text.replace(anchor,'registerPlugin(FloatingCapsulePlugin.class);\n        '+anchor)
if 'void onStart()' not in text:
 pos=text.rfind('}')
 text=text[:pos]+'''    @Override public void onStart() {
        super.onStart();
        io.github.jofr.capacitor.mediasessionplugin.FloatingCapsule.get(this).foreground(true);
    }
    @Override public void onStop() {
        super.onStop();
        if (!isChangingConfigurations()) io.github.jofr.capacitor.mediasessionplugin.FloatingCapsule.get(this).foreground(false);
    }
'''+text[pos:]
main.write_text(text)
ns='http://schemas.android.com/apk/res/android';ET.register_namespace('android',ns)
a=lambda key:'{'+ns+'}'+key
path=root/'android/app/src/main/AndroidManifest.xml';tree=ET.parse(path);manifest=tree.getroot()
permission='android.permission.SYSTEM_ALERT_WINDOW'
if not any(x.get(a('name'))==permission for x in manifest.findall('uses-permission')):
 ET.SubElement(manifest,'uses-permission',{a('name'):permission})
tree.write(path,encoding='utf-8',xml_declaration=True)
print('Optional floating capsule registered; existing playback session reused')

gradle=root/'android/app/build.gradle'
text=gradle.read_text()
dep='    implementation "androidx.media:media:1.6.0"'
if dep not in text:
 if 'dependencies {' not in text:raise SystemExit('App Gradle dependencies anchor changed')
 text=text.replace('dependencies {','dependencies {\n'+dep,1)
 gradle.write_text(text)
