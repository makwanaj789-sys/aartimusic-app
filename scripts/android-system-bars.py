"""Match system-bar surfaces to the dark app instead of template grey/white."""
from pathlib import Path
import xml.etree.ElementTree as ET
path=Path('android/app/src/main/res/values/styles.xml')
tree=ET.parse(path)
for style in tree.getroot().findall('style'):
 if not style.get('name','').startswith('AppTheme'):continue
 for name,value in {'android:statusBarColor':'#0B0C0E','android:navigationBarColor':'#0B0C0E','android:windowLightStatusBar':'false','android:windowLightNavigationBar':'false'}.items():
  item=next((x for x in style.findall('item') if x.get('name')==name),None)
  if item is None:item=ET.SubElement(style,'item',{'name':name})
  item.text=value
ET.indent(tree,space='    ')
tree.write(path,encoding='utf-8',xml_declaration=True)
