"""Generate launcher aliases/icons and the system document-picker bridge."""
from pathlib import Path
import json
import xml.etree.ElementTree as ET
root=Path('.')
app_id=json.loads((root/'capacitor.config.json').read_text())['appId']
java_dir=root/'android/app/src/main/java'/Path(*app_id.split('.'))
source=(root/'scripts/PersonalLibraryPlugin.java').read_text().replace('__PACKAGE__',app_id)
(java_dir/'PersonalLibraryPlugin.java').write_text(source)
main=java_dir/'MainActivity.java'
text=main.read_text()
if 'registerPlugin(PersonalLibraryPlugin.class);' not in text:
 text=text.replace('super.onCreate(savedInstanceState);','registerPlugin(PersonalLibraryPlugin.class);\n        super.onCreate(savedInstanceState);')
main.write_text(text)
ns='http://schemas.android.com/apk/res/android';ET.register_namespace('android',ns)
a=lambda key:'{'+ns+'}'+key
path=root/'android/app/src/main/AndroidManifest.xml'
tree=ET.parse(path);app=tree.getroot().find('application')
activity=next(x for x in app.findall('activity') if x.get(a('name')) in ('.MainActivity',app_id+'.MainActivity'))
for f in list(activity.findall('intent-filter')):
 if any(x.get(a('name'))=='android.intent.category.LAUNCHER' for x in f.findall('category')):activity.remove(f)
designs=json.loads((root/'scripts/icon-designs.json').read_text())
res=root/'android/app/src/main/res'
(res/'drawable').mkdir(exist_ok=True);(res/'mipmap-anydpi-v26').mkdir(exist_ok=True)
for key in ['classic',*designs]:
 for old in list(app.findall('activity-alias')):
  if old.get(a('name'))=='.Launcher_'+key:app.remove(old)
 icon='@mipmap/ic_launcher' if key=='classic' else '@drawable/aarti_'+key
 alias=ET.SubElement(app,'activity-alias',{a('name'):'.Launcher_'+key,a('targetActivity'):activity.get(a('name')),a('enabled'):'true' if key=='classic' else 'false',a('exported'):'true',a('icon'):icon,a('label'):'@string/app_name'})
 f=ET.SubElement(alias,'intent-filter');ET.SubElement(f,'action',{a('name'):'android.intent.action.MAIN'});ET.SubElement(f,'category',{a('name'):'android.intent.category.LAUNCHER'})
 if key=='classic':continue
 d=designs[key]
 vector=f'<vector xmlns:android="{ns}" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="{d["bg"]}" android:pathData="M0,0H108V108H0Z"/><path android:fillColor="#00000000" android:strokeColor="{d["fg"]}" android:strokeWidth="5.5" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="{d["d"]}"/></vector>'
 (res/'drawable'/('aarti_'+key+'.xml')).write_text(vector)
 # Adaptive icons keep their mark inside the standard safe zone.
 (res/'mipmap-anydpi-v26'/('aarti_'+key+'.xml')).write_text(f'<adaptive-icon xmlns:android="{ns}"><background android:drawable="@drawable/aarti_{key}"/><foreground android:drawable="@drawable/aarti_{key}"/></adaptive-icon>')
 # Legacy uses the vector; Android 8+ uses the adaptive resource.
 (res/'mipmap-anydpi').mkdir(exist_ok=True)
 (res/'mipmap-anydpi'/('aarti_'+key+'.xml')).write_text(vector)
 alias.set(a('icon'),'@mipmap/aarti_'+key)
tree.write(path,encoding='utf-8',xml_declaration=True)
print('Personal library document picker and six launcher icons registered')
